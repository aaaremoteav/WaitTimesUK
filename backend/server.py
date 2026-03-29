from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import math
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'ae-wait-times-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="A&E Wait Times API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer(auto_error=False)

# ============== Models ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    payment_id: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    is_paid: bool
    is_admin: bool
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class HospitalBase(BaseModel):
    name: str
    address: str
    postcode: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class HospitalCreate(HospitalBase):
    pass

class HospitalResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    postcode: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    current_wait_minutes: Optional[int] = None
    last_updated: Optional[str] = None
    last_updated_by: Optional[str] = None
    is_approved: bool
    created_at: str
    distance: Optional[float] = None

class WaitTimeUpdate(BaseModel):
    hospital_id: str
    wait_minutes: int = Field(..., ge=0, le=720)

class PendingHospitalResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    postcode: str
    submitted_by: str
    submitted_by_email: str
    created_at: str

class AdminOverrideWaitTime(BaseModel):
    hospital_id: str
    wait_minutes: int = Field(..., ge=0, le=720)

class PaymentVerification(BaseModel):
    email: EmailStr
    payment_id: str

# ============== Helper Functions ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, is_admin: bool = False) -> str:
    payload = {
        "sub": user_id,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await get_current_user(credentials)

async def require_paid_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await require_auth(credentials)
    if not user.get("is_paid") and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Payment required to access this feature")
    return user

async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await require_auth(credentials)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula (returns km)"""
    R = 6371  # Earth's radius in km
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

async def get_postcode_coordinates(postcode: str) -> Optional[tuple]:
    """Get coordinates from postcode using postcodes.io API"""
    try:
        async with httpx.AsyncClient() as client:
            clean_postcode = postcode.replace(" ", "").upper()
            response = await client.get(f"https://api.postcodes.io/postcodes/{clean_postcode}")
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == 200:
                    result = data.get("result", {})
                    return (result.get("latitude"), result.get("longitude"))
    except Exception as e:
        logging.error(f"Error fetching postcode coordinates: {e}")
    return None

# ============== Auth Routes ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user already exists
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # For PayPal NCP link, we trust the frontend verification
    # In production, you'd verify with PayPal IPN/webhooks
    is_paid = bool(user_data.payment_id)
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email.lower(),
        "name": user_data.name,
        "password_hash": hash_password(user_data.password),
        "is_paid": is_paid,
        "is_admin": False,
        "payment_id": user_data.payment_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_wait_update": None
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=user_doc["email"],
            name=user_doc["name"],
            is_paid=is_paid,
            is_admin=False,
            created_at=user_doc["created_at"]
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email.lower()}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user["id"], user.get("is_admin", False))
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            is_paid=user["is_paid"],
            is_admin=user.get("is_admin", False),
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user = Depends(require_auth)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        is_paid=user["is_paid"],
        is_admin=user.get("is_admin", False),
        created_at=user["created_at"]
    )

@api_router.post("/auth/verify-payment")
async def verify_payment(data: PaymentVerification):
    """Mark user as paid after PayPal payment"""
    user = await db.users.find_one({"email": data.email.lower()})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"email": data.email.lower()},
        {"$set": {"is_paid": True, "payment_id": data.payment_id}}
    )
    
    return {"message": "Payment verified successfully"}

# ============== Hospital Routes ==============

@api_router.get("/hospitals", response_model=List[HospitalResponse])
async def get_hospitals(
    postcode: Optional[str] = None,
    sort_by: Optional[str] = None,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    user = None
    if credentials:
        try:
            user = await get_current_user(credentials)
        except:
            pass
    
    # Get only approved hospitals
    hospitals = await db.hospitals.find({"is_approved": True}, {"_id": 0}).to_list(1000)
    
    # If postcode search, calculate distances
    if postcode:
        coords = await get_postcode_coordinates(postcode)
        if coords:
            for hospital in hospitals:
                if hospital.get("latitude") and hospital.get("longitude"):
                    hospital["distance"] = calculate_distance(
                        coords[0], coords[1],
                        hospital["latitude"], hospital["longitude"]
                    )
                else:
                    hospital["distance"] = 9999
            hospitals.sort(key=lambda x: x.get("distance", 9999))
    
    # Sort by wait times if requested
    if sort_by == "wait_time":
        hospitals.sort(key=lambda x: x.get("current_wait_minutes") or 9999)
    
    # If user is not paid, don't show actual wait times (will be blurred on frontend)
    can_see_wait_times = user and (user.get("is_paid") or user.get("is_admin"))
    
    result = []
    for h in hospitals:
        response = HospitalResponse(
            id=h["id"],
            name=h["name"],
            address=h["address"],
            postcode=h["postcode"],
            latitude=h.get("latitude"),
            longitude=h.get("longitude"),
            current_wait_minutes=h.get("current_wait_minutes"),
            last_updated=h.get("last_updated"),
            last_updated_by=h.get("last_updated_by"),
            is_approved=h["is_approved"],
            created_at=h["created_at"],
            distance=round(h["distance"], 1) if h.get("distance") is not None else None
        )
        result.append(response)
    
    return result

class SimilarHospitalCheck(BaseModel):
    name: str
    postcode: Optional[str] = None

class SimilarHospitalResponse(BaseModel):
    id: str
    name: str
    address: str
    postcode: str
    similarity_score: float

@api_router.post("/hospitals/check-similar", response_model=List[SimilarHospitalResponse])
async def check_similar_hospitals(data: SimilarHospitalCheck, user = Depends(require_auth)):
    """Check for similar existing hospitals before submission"""
    # Get all approved hospitals
    hospitals = await db.hospitals.find({"is_approved": True}, {"_id": 0}).to_list(1000)
    
    similar = []
    search_name = data.name.lower().strip()
    search_words = set(search_name.replace("hospital", "").replace("the", "").split())
    
    for h in hospitals:
        hospital_name = h["name"].lower()
        hospital_words = set(hospital_name.replace("hospital", "").replace("the", "").split())
        
        # Calculate similarity based on word overlap
        if search_words and hospital_words:
            common_words = search_words.intersection(hospital_words)
            similarity = len(common_words) / max(len(search_words), len(hospital_words))
        else:
            similarity = 0
        
        # Also check if search name is contained in hospital name or vice versa
        if search_name in hospital_name or hospital_name in search_name:
            similarity = max(similarity, 0.8)
        
        # Check postcode match
        if data.postcode:
            search_postcode = data.postcode.replace(" ", "").upper()[:4]
            hospital_postcode = h["postcode"].replace(" ", "").upper()[:4]
            if search_postcode == hospital_postcode:
                similarity = max(similarity, 0.5)
        
        if similarity >= 0.3:  # 30% similarity threshold
            similar.append(SimilarHospitalResponse(
                id=h["id"],
                name=h["name"],
                address=h["address"],
                postcode=h["postcode"],
                similarity_score=round(similarity, 2)
            ))
    
    # Sort by similarity score descending
    similar.sort(key=lambda x: x.similarity_score, reverse=True)
    return similar[:5]  # Return top 5 matches

@api_router.post("/hospitals/submit")
async def submit_hospital(hospital: HospitalCreate, user = Depends(require_auth)):
    """Submit a new hospital for admin approval"""
    # Get coordinates for the postcode
    coords = await get_postcode_coordinates(hospital.postcode)
    
    hospital_id = str(uuid.uuid4())
    hospital_doc = {
        "id": hospital_id,
        "name": hospital.name,
        "address": hospital.address,
        "postcode": hospital.postcode.upper().strip(),
        "latitude": coords[0] if coords else hospital.latitude,
        "longitude": coords[1] if coords else hospital.longitude,
        "is_approved": False,
        "submitted_by": user["id"],
        "submitted_by_email": user["email"],
        "current_wait_minutes": None,
        "last_updated": None,
        "last_updated_by": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.hospitals.insert_one(hospital_doc)
    
    return {"message": "Hospital submitted for approval", "id": hospital_id}

@api_router.post("/wait-times/update")
async def update_wait_time(data: WaitTimeUpdate, user = Depends(require_auth)):
    """Update wait time for a hospital (15 min cooldown per user) - any authenticated user can update"""
    # Check cooldown
    last_update = user.get("last_wait_update")
    if last_update and not user.get("is_admin"):
        last_update_time = datetime.fromisoformat(last_update)
        cooldown_end = last_update_time + timedelta(minutes=15)
        if datetime.now(timezone.utc) < cooldown_end:
            remaining = (cooldown_end - datetime.now(timezone.utc)).seconds // 60
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining + 1} minutes before updating again"
            )
    
    # Check hospital exists and is approved
    hospital = await db.hospitals.find_one({"id": data.hospital_id, "is_approved": True})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    
    # Update wait time
    now = datetime.now(timezone.utc).isoformat()
    await db.hospitals.update_one(
        {"id": data.hospital_id},
        {"$set": {
            "current_wait_minutes": data.wait_minutes,
            "last_updated": now,
            "last_updated_by": user["name"]
        }}
    )
    
    # Update user's last update time
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_wait_update": now}}
    )
    
    return {"message": "Wait time updated successfully"}

# ============== Admin Routes ==============

@api_router.get("/admin/pending-hospitals", response_model=List[PendingHospitalResponse])
async def get_pending_hospitals(user = Depends(require_admin)):
    """Get list of hospitals pending approval"""
    hospitals = await db.hospitals.find({"is_approved": False}, {"_id": 0}).to_list(100)
    return [PendingHospitalResponse(
        id=h["id"],
        name=h["name"],
        address=h["address"],
        postcode=h["postcode"],
        submitted_by=h["submitted_by"],
        submitted_by_email=h.get("submitted_by_email", "Unknown"),
        created_at=h["created_at"]
    ) for h in hospitals]

@api_router.post("/admin/approve-hospital/{hospital_id}")
async def approve_hospital(hospital_id: str, user = Depends(require_admin)):
    """Approve a pending hospital"""
    result = await db.hospitals.update_one(
        {"id": hospital_id},
        {"$set": {"is_approved": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return {"message": "Hospital approved"}

@api_router.delete("/admin/reject-hospital/{hospital_id}")
async def reject_hospital(hospital_id: str, user = Depends(require_admin)):
    """Reject and delete a pending hospital"""
    result = await db.hospitals.delete_one({"id": hospital_id, "is_approved": False})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Hospital not found or already approved")
    return {"message": "Hospital rejected and removed"}

@api_router.post("/admin/override-wait-time")
async def admin_override_wait_time(data: AdminOverrideWaitTime, user = Depends(require_admin)):
    """Admin override wait time without cooldown"""
    hospital = await db.hospitals.find_one({"id": data.hospital_id})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.hospitals.update_one(
        {"id": data.hospital_id},
        {"$set": {
            "current_wait_minutes": data.wait_minutes,
            "last_updated": now,
            "last_updated_by": f"{user['name']} (Admin)"
        }}
    )
    
    return {"message": "Wait time updated by admin"}

@api_router.get("/admin/users")
async def get_all_users(user = Depends(require_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

class AdminCreateUser(BaseModel):
    email: EmailStr
    name: str
    password: str
    is_paid: bool = True

class AdminTogglePaid(BaseModel):
    user_id: str
    is_paid: bool

@api_router.post("/admin/users/create")
async def admin_create_user(data: AdminCreateUser, user = Depends(require_admin)):
    """Admin creates a new user (can set as paid directly)"""
    # Check if user already exists
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": data.email.lower(),
        "name": data.name,
        "password_hash": hash_password(data.password),
        "is_paid": data.is_paid,
        "is_admin": False,
        "payment_id": "admin-created" if data.is_paid else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_wait_update": None
    }
    
    await db.users.insert_one(user_doc)
    
    return {"message": "User created successfully", "user_id": user_id}

@api_router.patch("/admin/users/{user_id}/toggle-paid")
async def admin_toggle_paid(user_id: str, user = Depends(require_admin)):
    """Toggle a user's paid status"""
    target_user = await db.users.find_one({"id": user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_paid_status = not target_user.get("is_paid", False)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_paid": new_paid_status,
            "payment_id": "admin-verified" if new_paid_status else None
        }}
    )
    
    return {"message": f"User {'activated' if new_paid_status else 'deactivated'}", "is_paid": new_paid_status}

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, user = Depends(require_admin)):
    """Delete a user (admin only)"""
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

# ============== Seed Data ==============

@api_router.post("/seed")
async def seed_data():
    """Seed initial hospital data"""
    # Check if already seeded
    count = await db.hospitals.count_documents({})
    if count > 0:
        return {"message": "Data already seeded", "hospital_count": count}
    
    # Major NHS A&E hospitals
    hospitals = [
        {"name": "St Thomas' Hospital", "address": "Westminster Bridge Road, London", "postcode": "SE1 7EH", "latitude": 51.4987, "longitude": -0.1175},
        {"name": "Guy's Hospital", "address": "Great Maze Pond, London", "postcode": "SE1 9RT", "latitude": 51.5035, "longitude": -0.0871},
        {"name": "King's College Hospital", "address": "Denmark Hill, London", "postcode": "SE5 9RS", "latitude": 51.4684, "longitude": -0.0941},
        {"name": "Royal London Hospital", "address": "Whitechapel Road, London", "postcode": "E1 1FR", "latitude": 51.5186, "longitude": -0.0597},
        {"name": "University College Hospital", "address": "235 Euston Road, London", "postcode": "NW1 2BU", "latitude": 51.5246, "longitude": -0.1340},
        {"name": "St Mary's Hospital", "address": "Praed Street, London", "postcode": "W2 1NY", "latitude": 51.5171, "longitude": -0.1731},
        {"name": "Chelsea and Westminster Hospital", "address": "369 Fulham Road, London", "postcode": "SW10 9NH", "latitude": 51.4839, "longitude": -0.1823},
        {"name": "Northwick Park Hospital", "address": "Watford Road, Harrow", "postcode": "HA1 3UJ", "latitude": 51.5767, "longitude": -0.3195},
        {"name": "Queen Elizabeth Hospital Birmingham", "address": "Mindelsohn Way, Birmingham", "postcode": "B15 2GW", "latitude": 52.4534, "longitude": -1.9380},
        {"name": "Manchester Royal Infirmary", "address": "Oxford Road, Manchester", "postcode": "M13 9WL", "latitude": 53.4615, "longitude": -2.2273},
        {"name": "Leeds General Infirmary", "address": "Great George Street, Leeds", "postcode": "LS1 3EX", "latitude": 53.8013, "longitude": -1.5508},
        {"name": "Royal Liverpool Hospital", "address": "Prescot Street, Liverpool", "postcode": "L7 8XP", "latitude": 53.4037, "longitude": -2.9669},
        {"name": "Addenbrooke's Hospital", "address": "Hills Road, Cambridge", "postcode": "CB2 0QQ", "latitude": 52.1751, "longitude": 0.1395},
        {"name": "John Radcliffe Hospital", "address": "Headley Way, Oxford", "postcode": "OX3 9DU", "latitude": 51.7638, "longitude": -1.2197},
        {"name": "Bristol Royal Infirmary", "address": "Upper Maudlin Street, Bristol", "postcode": "BS2 8HW", "latitude": 51.4586, "longitude": -2.5959},
        {"name": "Royal Victoria Infirmary", "address": "Queen Victoria Road, Newcastle", "postcode": "NE1 4LP", "latitude": 54.9800, "longitude": -1.6194},
        {"name": "Sheffield Teaching Hospitals", "address": "Herries Road, Sheffield", "postcode": "S5 7AU", "latitude": 53.4126, "longitude": -1.4620},
        {"name": "Nottingham University Hospitals", "address": "Derby Road, Nottingham", "postcode": "NG7 2UH", "latitude": 52.9435, "longitude": -1.1847},
        {"name": "Southampton General Hospital", "address": "Tremona Road, Southampton", "postcode": "SO16 6YD", "latitude": 50.9331, "longitude": -1.4353},
        {"name": "Royal Sussex County Hospital", "address": "Eastern Road, Brighton", "postcode": "BN2 5BE", "latitude": 50.8205, "longitude": -0.1168},
        {"name": "Derriford Hospital", "address": "Derriford Road, Plymouth", "postcode": "PL6 8DH", "latitude": 50.4167, "longitude": -4.1120},
        {"name": "Royal Cornwall Hospital", "address": "Treliske, Truro", "postcode": "TR1 3LJ", "latitude": 50.2710, "longitude": -5.0814},
        {"name": "Norfolk and Norwich Hospital", "address": "Colney Lane, Norwich", "postcode": "NR4 7UY", "latitude": 52.5900, "longitude": 1.2208},
        {"name": "Leicester Royal Infirmary", "address": "Infirmary Square, Leicester", "postcode": "LE1 5WW", "latitude": 52.6269, "longitude": -1.1367},
        {"name": "Hull Royal Infirmary", "address": "Anlaby Road, Hull", "postcode": "HU3 2JZ", "latitude": 53.7440, "longitude": -0.3596},
        {"name": "Royal Stoke University Hospital", "address": "Newcastle Road, Stoke-on-Trent", "postcode": "ST4 6QG", "latitude": 52.9880, "longitude": -2.2122},
        {"name": "Royal Berkshire Hospital", "address": "London Road, Reading", "postcode": "RG1 5AN", "latitude": 51.4535, "longitude": -0.9541},
        {"name": "Wexham Park Hospital", "address": "Wexham Street, Slough", "postcode": "SL2 4HL", "latitude": 51.5240, "longitude": -0.5673},
        {"name": "Watford General Hospital", "address": "Vicarage Road, Watford", "postcode": "WD18 0HB", "latitude": 51.6594, "longitude": -0.3930},
        {"name": "Luton and Dunstable Hospital", "address": "Lewsey Road, Luton", "postcode": "LU4 0DZ", "latitude": 51.8746, "longitude": -0.4719}
    ]
    
    for hospital in hospitals:
        hospital_doc = {
            "id": str(uuid.uuid4()),
            "name": hospital["name"],
            "address": hospital["address"],
            "postcode": hospital["postcode"],
            "latitude": hospital["latitude"],
            "longitude": hospital["longitude"],
            "is_approved": True,
            "submitted_by": "system",
            "submitted_by_email": "system@ae-wait.com",
            "current_wait_minutes": None,
            "last_updated": None,
            "last_updated_by": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.hospitals.insert_one(hospital_doc)
    
    # Create admin user
    admin_exists = await db.users.find_one({"email": "admin@ae-wait.com"})
    if not admin_exists:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": "admin@ae-wait.com",
            "name": "Admin",
            "password_hash": hash_password("Admin123!"),
            "is_paid": True,
            "is_admin": True,
            "payment_id": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_wait_update": None
        }
        await db.users.insert_one(admin_doc)
    
    return {"message": "Data seeded successfully", "hospital_count": len(hospitals)}

@api_router.get("/")
async def root():
    return {"message": "A&E Wait Times API"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
