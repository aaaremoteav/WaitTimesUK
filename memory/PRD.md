# A&E Hospital Wait Times - Product Requirements Document

## Original Problem Statement
App allowing users to update current wait times in A&E departments of UK hospitals. Features include:
- User-submitted hospital additions (admin approval required)
- Wait time updates (15-minute cooldown per user)
- Admin override capabilities
- Postcode-based search for nearest A&E hospitals
- Sort by lowest wait times
- £4.99 PayPal payment for full access
- Blurred wait times for non-paying users
- Last updated timestamps for accuracy tracking

## User Personas
1. **General Public** - View hospitals, see blurred wait times, search by postcode
2. **Paid Users** - Full access to wait times, can update wait times, submit new hospitals
3. **Admin** - Approve hospitals, override wait times, manage users

## Core Requirements (Static)
- NHS blue theme (#005EB8)
- UK-based A&E hospitals seeded (30 hospitals)
- PayPal NCP link integration for payment
- JWT-based authentication
- MongoDB database
- Postcodes.io API for geolocation

## What's Been Implemented (2026-03-29)
### Backend (FastAPI)
- User authentication (register/login with JWT)
- Hospital CRUD with approval workflow
- Wait time updates with 15-minute cooldown
- Admin endpoints for approvals/overrides/user management
- Postcode search with distance calculation (Haversine formula)
- 30 NHS A&E hospitals seeded with coordinates

### Frontend (React + Tailwind + shadcn/ui)
- Hero section with postcode search
- Hospital list with wait time badges (color-coded)
- Blurred wait times for non-authenticated/non-paid users
- Login/Register pages with PayPal payment flow
- Admin dashboard (pending hospitals, all hospitals, users)
- Responsive NHS blue design theme
- Last updated timestamps displayed

## Prioritized Backlog
### P0 (Completed)
- ✅ User registration with PayPal payment
- ✅ Hospital list and search
- ✅ Wait time updates with cooldown
- ✅ Admin dashboard
- ✅ Postcode-based proximity search

### P1 (Future)
- PayPal IPN/webhook verification for payment confirmation
- Email notifications for hospital approvals
- Password reset functionality
- User profile page

### P2 (Future)
- Historical wait time trends/charts
- Notifications for wait time changes
- Mobile app (React Native)
- NHS API integration for official data

## Next Tasks
1. Implement PayPal webhook for payment verification
2. Add email notifications using SendGrid/Resend
3. Add password reset functionality
4. Consider adding real-time updates with WebSockets
