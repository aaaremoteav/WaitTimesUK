import { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { Search, Clock, MapPin, Building2, User, LogOut, Shield, Plus, RefreshCw, CheckCircle, XCircle, Lock, ArrowUpDown } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./components/ui/dialog";
import { Label } from "./components/ui/label";
import { Badge } from "./components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const PAYPAL_LINK = "https://www.paypal.com/ncp/payment/R6833KHFC5PCL";

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem("ae_token"));

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem("ae_token");
      setToken(null);
      delete axios.defaults.headers.common["Authorization"];
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem("ae_token", access_token);
    axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const register = async (name, email, password, paymentId = null) => {
    const response = await axios.post(`${API}/auth/register`, {
      name,
      email,
      password,
      payment_id: paymentId,
    });
    const { access_token, user: userData } = response.data;
    localStorage.setItem("ae_token", access_token);
    axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("ae_token");
    delete axios.defaults.headers.common["Authorization"];
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// Header Component
const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => navigate("/")}
            data-testid="header-logo"
          >
            <div className="w-10 h-10 bg-[#005EB8] rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl text-[#0A1128]" style={{ fontFamily: "'Manrope', sans-serif" }}>
              A&E Wait Times
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2" data-testid="user-menu-button">
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline">{user.name}</span>
                    {user.is_admin && <Badge variant="secondary" className="ml-1">Admin</Badge>}
                    {user.is_paid && !user.is_admin && <Badge className="ml-1 bg-[#007F3B]">Paid</Badge>}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.is_admin && (
                    <DropdownMenuItem onClick={() => navigate("/admin")} data-testid="admin-menu-item">
                      <Shield className="w-4 h-4 mr-2" />
                      Admin Dashboard
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={logout} data-testid="logout-menu-item">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/login")}
                  data-testid="login-button"
                >
                  Login
                </Button>
                <Button 
                  className="bg-[#005EB8] hover:bg-[#004C97]"
                  onClick={() => navigate("/register")}
                  data-testid="register-button"
                >
                  Sign Up - £4.99
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// Wait Time Badge Component
const WaitTimeBadge = ({ minutes, blurred = false }) => {
  if (minutes === null || minutes === undefined) {
    return (
      <span className="px-3 py-1 rounded-full text-sm font-bold bg-slate-100 text-slate-500 border border-slate-200">
        No data
      </span>
    );
  }

  let colorClasses = "";
  if (minutes <= 60) {
    colorClasses = "bg-[#E5F2E8] text-[#007F3B] border-[#007F3B]/20";
  } else if (minutes <= 180) {
    colorClasses = "bg-[#FFF8E5] text-[#B38000] border-[#FFB81C]/30";
  } else {
    colorClasses = "bg-[#FAE9E8] text-[#D5281B] border-[#D5281B]/20";
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const display = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-bold border status-pill ${colorClasses} ${blurred ? 'wait-time-blur' : ''}`}>
      {display}
    </span>
  );
};

// Hospital Card Component
const HospitalCard = ({ hospital, canSeeWaitTimes, onUpdateWaitTime, index }) => {
  const formatLastUpdated = (dateString) => {
    if (!dateString) return "Never updated";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const maskName = (name) => {
    if (!name) return "";
    // Handle "(Admin)" suffix
    const isAdmin = name.includes("(Admin)");
    const cleanName = name.replace(" (Admin)", "").trim();
    
    const parts = cleanName.split(" ");
    if (parts.length === 1) {
      // Single name: show first 3 chars + ***
      const first = parts[0];
      return first.slice(0, 3) + "***" + (isAdmin ? " (Admin)" : "");
    }
    
    // Multiple parts: mask first and last name
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    
    // First name: show first 4 chars (or less if shorter) + *
    const maskedFirst = firstName.slice(0, Math.min(4, firstName.length)) + "*";
    
    // Last name: ** + last 3 chars (or less if shorter)
    const maskedLast = "**" + lastName.slice(-Math.min(3, lastName.length));
    
    return maskedFirst + " " + maskedLast + (isAdmin ? " (Admin)" : "");
  };

  return (
    <Card 
      className={`hospital-card bg-white border border-slate-200 shadow-sm animate-fade-in-up stagger-${(index % 5) + 1}`}
      data-testid={`hospital-card-${hospital.id}`}
    >
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-[#005EB8]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-[#005EB8]" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#0A1128]" style={{ fontFamily: "'Manrope', sans-serif" }}>
                  {hospital.name}
                </h3>
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" />
                  {hospital.address}
                </p>
                <p className="text-xs text-slate-400 mt-1">{hospital.postcode}</p>
                {hospital.distance !== undefined && (
                  <p className="text-sm text-[#005EB8] font-medium mt-1">
                    {hospital.distance} km away
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="relative">
              {!canSeeWaitTimes && hospital.current_wait_minutes !== null && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <Lock className="w-4 h-4 text-slate-400" />
                </div>
              )}
              <WaitTimeBadge 
                minutes={hospital.current_wait_minutes} 
                blurred={!canSeeWaitTimes && hospital.current_wait_minutes !== null}
              />
            </div>
            
            <div className="text-xs text-slate-400 text-right">
              {hospital.last_updated ? (
                <>
                  <span className="block">{formatLastUpdated(hospital.last_updated)}</span>
                  {hospital.last_updated_by && (
                    <span className="block">by {maskName(hospital.last_updated_by)}</span>
                  )}
                </>
              ) : (
                <span>No updates yet</span>
              )}
            </div>

            {onUpdateWaitTime && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs mt-2"
                onClick={() => onUpdateWaitTime(hospital)}
                data-testid={`update-wait-time-btn-${hospital.id}`}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Update
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Home Page
const HomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchPostcode, setSearchPostcode] = useState("");
  const [sortByWait, setSortByWait] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [waitMinutes, setWaitMinutes] = useState("");
  const [submitHospitalOpen, setSubmitHospitalOpen] = useState(false);
  const [newHospital, setNewHospital] = useState({ name: "", address: "", postcode: "" });
  const [similarHospitals, setSimilarHospitals] = useState([]);
  const [showSimilarDialog, setShowSimilarDialog] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const canSeeWaitTimes = user && (user.is_paid || user.is_admin);

  useEffect(() => {
    seedAndFetchHospitals();
  }, []);

  const seedAndFetchHospitals = async () => {
    try {
      await axios.post(`${API}/seed`);
    } catch (error) {
      // Ignore if already seeded
    }
    fetchHospitals();
  };

  const fetchHospitals = async (postcode = "", sortWait = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (postcode) params.append("postcode", postcode);
      if (sortWait) params.append("sort_by", "wait_time");
      
      const response = await axios.get(`${API}/hospitals?${params.toString()}`);
      setHospitals(response.data);
    } catch (error) {
      toast.error("Failed to fetch hospitals");
    }
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchHospitals(searchPostcode, sortByWait);
  };

  const toggleSortByWait = () => {
    const newSort = !sortByWait;
    setSortByWait(newSort);
    fetchHospitals(searchPostcode, newSort);
  };

  const handleUpdateWaitTime = (hospital) => {
    setSelectedHospital(hospital);
    setWaitMinutes(hospital.current_wait_minutes?.toString() || "");
    setUpdateDialogOpen(true);
  };

  const submitWaitTimeUpdate = async () => {
    if (!waitMinutes || isNaN(parseInt(waitMinutes))) {
      toast.error("Please enter a valid wait time");
      return;
    }

    try {
      await axios.post(`${API}/wait-times/update`, {
        hospital_id: selectedHospital.id,
        wait_minutes: parseInt(waitMinutes),
      });
      toast.success("Wait time updated successfully!");
      setUpdateDialogOpen(false);
      fetchHospitals(searchPostcode, sortByWait);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update wait time");
    }
  };

  const checkForSimilarHospitals = async () => {
    if (!newHospital.name) {
      toast.error("Please enter a hospital name");
      return;
    }

    setCheckingDuplicates(true);
    try {
      const response = await axios.post(`${API}/hospitals/check-similar`, {
        name: newHospital.name,
        postcode: newHospital.postcode || null,
      });
      
      if (response.data.length > 0) {
        setSimilarHospitals(response.data);
        setShowSimilarDialog(true);
      } else {
        // No similar hospitals found, proceed with submission
        await confirmSubmitHospital();
      }
    } catch (error) {
      toast.error("Failed to check for similar hospitals");
    }
    setCheckingDuplicates(false);
  };

  const confirmSubmitHospital = async () => {
    if (!newHospital.name || !newHospital.address || !newHospital.postcode) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      await axios.post(`${API}/hospitals/submit`, newHospital);
      toast.success("Hospital submitted for admin approval!");
      setSubmitHospitalOpen(false);
      setShowSimilarDialog(false);
      setNewHospital({ name: "", address: "", postcode: "" });
      setSimilarHospitals([]);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to submit hospital");
    }
  };

  const selectExistingHospital = (hospital) => {
    // Close dialogs and scroll to the hospital or show update dialog
    setShowSimilarDialog(false);
    setSubmitHospitalOpen(false);
    setNewHospital({ name: "", address: "", postcode: "" });
    setSimilarHospitals([]);
    
    // Find the hospital and open update dialog if user can update
    if (canSeeWaitTimes) {
      const existingHospital = hospitals.find(h => h.id === hospital.id);
      if (existingHospital) {
        handleUpdateWaitTime(existingHospital);
        toast.success(`Selected ${hospital.name} - you can now update its wait time`);
      }
    } else {
      toast.info(`${hospital.name} already exists in our database`);
    }
  };

  const submitNewHospital = async () => {
    if (!newHospital.name || !newHospital.address || !newHospital.postcode) {
      toast.error("Please fill in all fields");
      return;
    }

    // Check for similar hospitals first
    await checkForSimilarHospitals();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Hero Section */}
      <div 
        className="relative bg-cover bg-center py-16 sm:py-24"
        style={{ 
          backgroundImage: `url('https://static.prod-images.emergentagent.com/jobs/042a6030-888c-4e4e-b517-3587118cf787/images/598a58dfee2d5149ed8558a5c0836e978e54313752d5142301d58d0ebda9cbe5.png')` 
        }}
      >
        <div className="absolute inset-0 hero-gradient"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight"
              style={{ fontFamily: "'Manrope', sans-serif" }}
            >
              Real-Time A&E Wait Times
            </h1>
            <p className="mt-4 text-lg sm:text-xl text-white/90 max-w-2xl mx-auto">
              Find the nearest hospital with the shortest wait time. Updated by real patients like you.
            </p>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="mt-8 max-w-xl mx-auto">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Enter your postcode (e.g., SW1A 1AA)"
                    value={searchPostcode}
                    onChange={(e) => setSearchPostcode(e.target.value)}
                    className="pl-10 h-12 text-base border-2 border-white/20 bg-white/95 focus:border-white focus:ring-4 focus:ring-[#FFEB3B]/50"
                    data-testid="postcode-search-input"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="h-12 px-6 bg-white text-[#005EB8] hover:bg-slate-100 font-semibold"
                  data-testid="search-button"
                >
                  Search
                </Button>
              </div>
            </form>

            {!user && (
              <div className="mt-6">
                <Button
                  onClick={() => navigate("/register")}
                  className="pulse-cta bg-[#FFB81C] hover:bg-[#E5A619] text-[#0A1128] font-bold px-8 py-3 h-auto text-lg"
                  data-testid="hero-signup-button"
                >
                  Sign Up for £4.99 to See Wait Times
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#0A1128]" style={{ fontFamily: "'Manrope', sans-serif" }}>
              {searchPostcode ? `Hospitals near ${searchPostcode.toUpperCase()}` : "All A&E Hospitals"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {hospitals.length} hospitals found
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant={sortByWait ? "default" : "outline"}
              onClick={toggleSortByWait}
              className={sortByWait ? "bg-[#005EB8] hover:bg-[#004C97]" : ""}
              data-testid="sort-by-wait-button"
            >
              <ArrowUpDown className="w-4 h-4 mr-2" />
              Sort by Wait Time
            </Button>
            
            {user && (
              <Button
                variant="outline"
                onClick={() => setSubmitHospitalOpen(true)}
                data-testid="submit-hospital-button"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Hospital
              </Button>
            )}
          </div>
        </div>

        {/* Unlock Banner for Non-Paid Users */}
        {user && !user.is_paid && !user.is_admin && (
          <Card className="mb-6 border-[#005EB8] bg-[#005EB8]/5">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Lock className="w-8 h-8 text-[#005EB8]" />
                <div>
                  <p className="font-semibold text-[#0A1128]">Wait times are hidden</p>
                  <p className="text-sm text-slate-600">Complete your payment to unlock real-time wait times</p>
                </div>
              </div>
              <Button 
                className="bg-[#005EB8] hover:bg-[#004C97]"
                onClick={() => window.open(PAYPAL_LINK, "_blank")}
                data-testid="unlock-payment-button"
              >
                Pay £4.99 to Unlock
              </Button>
            </CardContent>
          </Card>
        )}

        {!user && (
          <Card className="mb-6 border-[#FFB81C] bg-[#FFB81C]/10">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Lock className="w-8 h-8 text-[#B38000]" />
                <div>
                  <p className="font-semibold text-[#0A1128]">Sign up to see wait times</p>
                  <p className="text-sm text-slate-600">One-time payment of £4.99 for lifetime access</p>
                </div>
              </div>
              <Button 
                className="bg-[#FFB81C] hover:bg-[#E5A619] text-[#0A1128]"
                onClick={() => navigate("/register")}
                data-testid="banner-signup-button"
              >
                Sign Up Now
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Hospital List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-32 rounded-lg skeleton"></div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {hospitals.map((hospital, index) => (
              <HospitalCard
                key={hospital.id}
                hospital={hospital}
                canSeeWaitTimes={canSeeWaitTimes}
                onUpdateWaitTime={user ? handleUpdateWaitTime : null}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Update Wait Time Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Update Wait Time</DialogTitle>
            <DialogDescription>
              {selectedHospital?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="wait-minutes">Current wait time (minutes)</Label>
            <Input
              id="wait-minutes"
              type="number"
              min="0"
              max="720"
              value={waitMinutes}
              onChange={(e) => setWaitMinutes(e.target.value)}
              placeholder="e.g., 90"
              className="mt-2"
              data-testid="wait-minutes-input"
            />
            <p className="text-xs text-slate-500 mt-2">
              You can update once every 15 minutes
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97]"
              onClick={submitWaitTimeUpdate}
              data-testid="submit-wait-time-button"
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Hospital Dialog */}
      <Dialog open={submitHospitalOpen} onOpenChange={(open) => {
        setSubmitHospitalOpen(open);
        if (!open) {
          setSimilarHospitals([]);
          setShowSimilarDialog(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Submit New Hospital</DialogTitle>
            <DialogDescription>
              Add a hospital that's not on the list. Admin will review and approve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="hospital-name">Hospital Name</Label>
              <Input
                id="hospital-name"
                value={newHospital.name}
                onChange={(e) => setNewHospital({ ...newHospital, name: e.target.value })}
                placeholder="e.g., Royal Hospital"
                className="mt-2"
                data-testid="new-hospital-name-input"
              />
            </div>
            <div>
              <Label htmlFor="hospital-address">Address</Label>
              <Input
                id="hospital-address"
                value={newHospital.address}
                onChange={(e) => setNewHospital({ ...newHospital, address: e.target.value })}
                placeholder="e.g., 123 High Street, London"
                className="mt-2"
                data-testid="new-hospital-address-input"
              />
            </div>
            <div>
              <Label htmlFor="hospital-postcode">Postcode</Label>
              <Input
                id="hospital-postcode"
                value={newHospital.postcode}
                onChange={(e) => setNewHospital({ ...newHospital, postcode: e.target.value })}
                placeholder="e.g., SW1A 1AA"
                className="mt-2"
                data-testid="new-hospital-postcode-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitHospitalOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97]"
              onClick={submitNewHospital}
              disabled={checkingDuplicates}
              data-testid="submit-new-hospital-button"
            >
              {checkingDuplicates ? "Checking..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Similar Hospitals Dialog */}
      <Dialog open={showSimilarDialog} onOpenChange={setShowSimilarDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>
              Did you mean one of these?
            </DialogTitle>
            <DialogDescription>
              We found similar hospitals in our database. Select one if it matches, or continue to add a new hospital.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4 max-h-80 overflow-y-auto">
            {similarHospitals.map((hospital) => (
              <Card 
                key={hospital.id} 
                className="cursor-pointer hover:border-[#005EB8] hover:bg-slate-50 transition-all"
                onClick={() => selectExistingHospital(hospital)}
                data-testid={`similar-hospital-${hospital.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-[#005EB8]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-[#005EB8]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#0A1128]">{hospital.name}</p>
                        <p className="text-sm text-slate-500">{hospital.address}</p>
                        <p className="text-xs text-slate-400">{hospital.postcode}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(hospital.similarity_score * 100)}% match
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowSimilarDialog(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97] w-full sm:w-auto"
              onClick={confirmSubmitHospital}
              data-testid="continue-add-hospital-button"
            >
              Not Listed - Continue Adding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Login Page
const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      navigate("/");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-[#005EB8] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl" style={{ fontFamily: "'Manrope', sans-serif" }}>
            Welcome Back
          </CardTitle>
          <CardDescription>Login to see real-time wait times</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-2"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-2"
                data-testid="login-password-input"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-[#005EB8] hover:bg-[#004C97]"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
          <p className="text-center text-sm text-slate-500 mt-4">
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/register")}
              className="text-[#005EB8] font-medium hover:underline"
              data-testid="go-to-register-link"
            >
              Sign up for £4.99
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// Register Page
const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);

  const handlePayment = () => {
    // Open PayPal link in new window
    const paymentWindow = window.open(PAYPAL_LINK, "_blank", "width=500,height=700");
    
    // Show confirmation dialog after a delay
    setTimeout(() => {
      setPaymentCompleted(true);
    }, 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (step === 1) {
      if (!name || !email || !password) {
        toast.error("Please fill in all fields");
        return;
      }
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      // Generate a payment ID based on timestamp
      const paymentId = paymentCompleted ? `PAYPAL-${Date.now()}` : null;
      await register(name, email, password, paymentId);
      toast.success(paymentCompleted ? "Account created with full access!" : "Account created! Complete payment to unlock wait times.");
      navigate("/");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-[#005EB8] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl" style={{ fontFamily: "'Manrope', sans-serif" }}>
            {step === 1 ? "Create Account" : "Complete Payment"}
          </CardTitle>
          <CardDescription>
            {step === 1 
              ? "Sign up to access real-time A&E wait times"
              : "Pay £4.99 for lifetime access"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-2"
                  data-testid="register-name-input"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-2"
                  data-testid="register-email-input"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-2"
                  data-testid="register-password-input"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-[#005EB8] hover:bg-[#004C97]"
                data-testid="register-continue-button"
              >
                Continue to Payment
              </Button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-[#0A1128]" style={{ fontFamily: "'Manrope', sans-serif" }}>
                  £4.99
                </p>
                <p className="text-sm text-slate-500 mt-1">One-time payment</p>
              </div>

              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#007F3B]" />
                  <span>See real-time A&E wait times</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#007F3B]" />
                  <span>Update wait times for others</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#007F3B]" />
                  <span>Search by postcode for nearest hospitals</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#007F3B]" />
                  <span>Lifetime access - no subscription</span>
                </li>
              </ul>

              {!paymentCompleted ? (
                <Button 
                  onClick={handlePayment}
                  className="w-full bg-[#FFB81C] hover:bg-[#E5A619] text-[#0A1128] font-bold h-12"
                  data-testid="pay-with-paypal-button"
                >
                  Pay £4.99 with PayPal
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="bg-[#E5F2E8] border border-[#007F3B]/20 rounded-lg p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-[#007F3B] mx-auto mb-2" />
                    <p className="font-medium text-[#007F3B]">Payment completed!</p>
                  </div>
                  <Button 
                    onClick={handleSubmit}
                    className="w-full bg-[#005EB8] hover:bg-[#004C97]"
                    disabled={loading}
                    data-testid="complete-registration-button"
                  >
                    {loading ? "Creating account..." : "Complete Registration"}
                  </Button>
                </div>
              )}

              <p className="text-center text-xs text-slate-400">
                Secure payment via PayPal
              </p>

              <div className="border-t pt-4">
                <Button 
                  variant="ghost" 
                  className="w-full text-slate-500"
                  onClick={() => setStep(1)}
                  data-testid="back-to-details-button"
                >
                  Back to details
                </Button>
              </div>
            </div>
          )}

          <p className="text-center text-sm text-slate-500 mt-4">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-[#005EB8] font-medium hover:underline"
              data-testid="go-to-login-link"
            >
              Login
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// Admin Dashboard
const AdminPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingHospitals, setPendingHospitals] = useState([]);
  const [allHospitals, setAllHospitals] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [overrideMinutes, setOverrideMinutes] = useState("");
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", is_paid: true });

  useEffect(() => {
    if (!user?.is_admin) {
      navigate("/");
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pendingRes, hospitalsRes, usersRes] = await Promise.all([
        axios.get(`${API}/admin/pending-hospitals`),
        axios.get(`${API}/hospitals`),
        axios.get(`${API}/admin/users`),
      ]);
      setPendingHospitals(pendingRes.data);
      setAllHospitals(hospitalsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      toast.error("Failed to fetch data");
    }
    setLoading(false);
  };

  const approveHospital = async (id) => {
    try {
      await axios.post(`${API}/admin/approve-hospital/${id}`);
      toast.success("Hospital approved!");
      fetchData();
    } catch (error) {
      toast.error("Failed to approve hospital");
    }
  };

  const rejectHospital = async (id) => {
    try {
      await axios.delete(`${API}/admin/reject-hospital/${id}`);
      toast.success("Hospital rejected");
      fetchData();
    } catch (error) {
      toast.error("Failed to reject hospital");
    }
  };

  const handleOverride = (hospital) => {
    setSelectedHospital(hospital);
    setOverrideMinutes(hospital.current_wait_minutes?.toString() || "");
    setOverrideDialogOpen(true);
  };

  const submitOverride = async () => {
    if (!overrideMinutes || isNaN(parseInt(overrideMinutes))) {
      toast.error("Please enter a valid wait time");
      return;
    }

    try {
      await axios.post(`${API}/admin/override-wait-time`, {
        hospital_id: selectedHospital.id,
        wait_minutes: parseInt(overrideMinutes),
      });
      toast.success("Wait time overridden!");
      setOverrideDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to override wait time");
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    
    try {
      await axios.delete(`${API}/admin/users/${userId}`);
      toast.success("User deleted");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete user");
    }
  };

  const toggleUserPaid = async (userId) => {
    try {
      const response = await axios.patch(`${API}/admin/users/${userId}/toggle-paid`);
      toast.success(response.data.message);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update user");
    }
  };

  const createUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (newUser.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      await axios.post(`${API}/admin/users/create`, newUser);
      toast.success("User created successfully!");
      setAddUserDialogOpen(false);
      setNewUser({ name: "", email: "", password: "", is_paid: true });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create user");
    }
  };

  if (!user?.is_admin) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-[#005EB8] rounded-xl flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[#0A1128]" style={{ fontFamily: "'Manrope', sans-serif" }}>
              Admin Dashboard
            </h1>
            <p className="text-slate-500">Manage hospitals, wait times, and users</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
          {[
            { id: "pending", label: "Pending Hospitals", count: pendingHospitals.length },
            { id: "hospitals", label: "All Hospitals", count: allHospitals.length },
            { id: "users", label: "Users", count: users.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[#005EB8] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              data-testid={`admin-tab-${tab.id}`}
            >
              {tab.label}
              <Badge variant="secondary" className="ml-2">{tab.count}</Badge>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg skeleton"></div>
            ))}
          </div>
        ) : (
          <>
            {/* Pending Hospitals */}
            {activeTab === "pending" && (
              <div className="space-y-4">
                {pendingHospitals.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <CheckCircle className="w-12 h-12 text-[#007F3B] mx-auto mb-4" />
                      <p className="text-slate-600">No pending hospitals to approve</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingHospitals.map((hospital) => (
                    <Card key={hospital.id} data-testid={`pending-hospital-${hospital.id}`}>
                      <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-bold text-[#0A1128]">{hospital.name}</h3>
                          <p className="text-sm text-slate-500">{hospital.address}</p>
                          <p className="text-xs text-slate-400">{hospital.postcode}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Submitted by: {hospital.submitted_by_email}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-[#007F3B] hover:bg-[#006630]"
                            onClick={() => approveHospital(hospital.id)}
                            data-testid={`approve-hospital-${hospital.id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectHospital(hospital.id)}
                            data-testid={`reject-hospital-${hospital.id}`}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* All Hospitals */}
            {activeTab === "hospitals" && (
              <div className="space-y-4">
                {allHospitals.map((hospital) => (
                  <Card key={hospital.id} data-testid={`admin-hospital-${hospital.id}`}>
                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-[#0A1128]">{hospital.name}</h3>
                        <p className="text-sm text-slate-500">{hospital.postcode}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <WaitTimeBadge minutes={hospital.current_wait_minutes} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOverride(hospital)}
                          data-testid={`override-wait-${hospital.id}`}
                        >
                          Override
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Users */}
            {activeTab === "users" && (
              <div className="space-y-4">
                {/* Add User Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => setAddUserDialogOpen(true)}
                    className="bg-[#005EB8] hover:bg-[#004C97]"
                    data-testid="add-user-button"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                </div>

                {users.map((u) => (
                  <Card key={u.id} data-testid={`admin-user-${u.id}`}>
                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-medium text-[#0A1128]">{u.name}</p>
                          <p className="text-sm text-slate-500">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.is_admin && <Badge>Admin</Badge>}
                        {u.is_paid && !u.is_admin && <Badge className="bg-[#007F3B]">Paid</Badge>}
                        {!u.is_paid && !u.is_admin && <Badge variant="secondary">Unpaid</Badge>}
                        {u.id !== user.id && !u.is_admin && (
                          <Button
                            size="sm"
                            variant={u.is_paid ? "outline" : "default"}
                            className={!u.is_paid ? "bg-[#007F3B] hover:bg-[#006630]" : ""}
                            onClick={() => toggleUserPaid(u.id)}
                            data-testid={`toggle-paid-${u.id}`}
                          >
                            {u.is_paid ? "Revoke Access" : "Mark as Paid"}
                          </Button>
                        )}
                        {u.id !== user.id && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteUser(u.id)}
                            data-testid={`delete-user-${u.id}`}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Override Wait Time</DialogTitle>
            <DialogDescription>
              {selectedHospital?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="override-minutes">New wait time (minutes)</Label>
            <Input
              id="override-minutes"
              type="number"
              min="0"
              max="720"
              value={overrideMinutes}
              onChange={(e) => setOverrideMinutes(e.target.value)}
              placeholder="e.g., 90"
              className="mt-2"
              data-testid="override-minutes-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97]"
              onClick={submitOverride}
              data-testid="submit-override-button"
            >
              Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Add New User</DialogTitle>
            <DialogDescription>
              Create a user account and optionally mark them as paid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="new-user-name">Full Name</Label>
              <Input
                id="new-user-name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="e.g., John Smith"
                className="mt-2"
                data-testid="new-user-name-input"
              />
            </div>
            <div>
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="e.g., john@example.com"
                className="mt-2"
                data-testid="new-user-email-input"
              />
            </div>
            <div>
              <Label htmlFor="new-user-password">Password</Label>
              <Input
                id="new-user-password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className="mt-2"
                data-testid="new-user-password-input"
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="new-user-paid"
                checked={newUser.is_paid}
                onChange={(e) => setNewUser({ ...newUser, is_paid: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-[#005EB8] focus:ring-[#005EB8]"
                data-testid="new-user-paid-checkbox"
              />
              <Label htmlFor="new-user-paid" className="cursor-pointer">
                Mark as paid (grant full access)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97]"
              onClick={createUser}
              data-testid="create-user-button"
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#F8FAFC]">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/*"
              element={
                <>
                  <Header />
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/admin" element={<AdminPage />} />
                  </Routes>
                </>
              }
            />
          </Routes>
          <Toaster position="top-right" richColors />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
