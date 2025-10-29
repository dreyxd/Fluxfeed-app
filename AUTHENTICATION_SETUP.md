# Fluxfeed Authentication System

## ✅ Implementation Complete

The JWT-based authentication system has been successfully integrated into Fluxfeed.

## 🔐 Features Implemented

### Backend
- **PostgreSQL Database**: Connected to DigitalOcean managed database
- **Users Table**: Stores user credentials, subscription tier, and API usage tracking
- **JWT Authentication**: 7-day token expiry with httpOnly cookies
- **Password Security**: bcrypt hashing with 10 salt rounds
- **Auth Routes**:
  - `POST /api/auth/register` - Create new user account
  - `POST /api/auth/login` - User login with email/password
  - `GET /api/auth/me` - Get current user profile (protected)
  - `POST /api/auth/logout` - Clear authentication cookie

### Frontend
- **Auth Context**: Global authentication state management
- **Login Page**: `/auth/login` - Email/password login form
- **Register Page**: `/auth/register` - New user registration form
- **Protected Routes**: `/app` requires authentication
- **Navbar Updates**:
  - "Sign In" button (left of "Launch App") when not authenticated
  - User email + "Logout" button when authenticated
  - "Launch App" redirects to login if not authenticated

## 🗄️ Database Schema

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255),
  subscription_tier VARCHAR(50) DEFAULT 'free',
  api_calls_used INTEGER DEFAULT 0,
  api_calls_limit INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

## 🚀 How to Use

### 1. Start the servers
```bash
npm run dev:all
```

This starts both the backend (port 8787) and frontend (port 5173).

### 2. Register a new account
- Visit http://localhost:5173
- Click "Sign In" button in the navbar
- Click "Sign up" link on the login page
- Fill in full name, email, and password (min 6 characters)
- Click "Create account"

### 3. Access protected features
- After registration/login, you'll be automatically redirected to `/app`
- Your email will appear in the navbar
- Click "Logout" to sign out

### 4. API Usage Tracking
- Each user has a `subscription_tier` (default: 'free')
- Free tier: 100 API calls per account
- Usage is tracked in `api_calls_used` column
- Can be upgraded by changing `subscription_tier`

## 🔑 Environment Variables

Required in `.env` file:

```env
# Database
DB_HOST=db-fluxfeednews-v1-do-user-26683588-0.d.db.ondigitalocean.com
DB_PORT=25060
DB_USER=doadmin
DB_PASSWORD=your_password
DB_NAME=defaultdb
DB_SSL=true

# JWT
JWT_SECRET=fluxfeed_super_secret_key_2025_change_in_production_xK9mP2qL5nR8vT4wY7zA3bC6dF1gH0jN
```

⚠️ **IMPORTANT**: Change `JWT_SECRET` in production!

## 🔧 Technical Details

### Auth Flow
1. User submits credentials to `/api/auth/login` or `/api/auth/register`
2. Backend validates credentials and generates JWT token
3. Token is set as httpOnly cookie (secure in production)
4. Frontend AuthContext checks token on page load via `/api/auth/me`
5. Protected routes redirect to login if no valid token
6. Logout clears the cookie

### Security Features
- Passwords hashed with bcrypt (never stored in plain text)
- JWT tokens stored in httpOnly cookies (not accessible via JavaScript)
- CORS configured to only allow requests from frontend origin
- Email validation regex
- Password minimum length enforcement
- Case-insensitive email storage

### Cookie Configuration
```typescript
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
})
```

## 📝 Testing Checklist

- [x] Backend server starts without errors
- [x] Frontend connects to backend API
- [ ] Register new user → check database for entry
- [ ] Login with valid credentials → receives JWT cookie
- [ ] Access `/app` when not logged in → redirects to login
- [ ] Access `/app` after login → shows signals page
- [ ] Logout → cookie cleared, redirected to landing page
- [ ] Invalid credentials → error message displayed
- [ ] Password too short → validation error

## 🐛 Troubleshooting

### "Port already in use" error
```bash
# Stop all Node processes
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue

# Restart servers
npm run dev:all
```

### Database connection issues
- Verify `.env` credentials are correct
- Check DigitalOcean database is running
- Ensure SSL is enabled: `DB_SSL=true`

### JWT errors
- Check `JWT_SECRET` is set in `.env`
- Verify cookie-parser middleware is enabled
- Check browser allows cookies from localhost

## 🎯 Next Steps

1. **Test Complete Flow**: Register → Login → Access /app → Logout
2. **Verify Database**: Check PostgreSQL for new user entries
3. **Add Password Reset**: Implement forgot password flow
4. **Email Verification**: Send verification emails on registration
5. **Rate Limiting**: Add API rate limiting based on `api_calls_used`
6. **Subscription Tiers**: Implement premium features for paid users
7. **Admin Panel**: Create admin interface to manage users

## 📚 Files Created/Modified

### New Files
- `server/db.ts` - PostgreSQL connection pool
- `server/init-db.ts` - Database schema initialization
- `server/middleware/auth.ts` - JWT verification middleware
- `server/routes/auth.ts` - Authentication endpoints
- `src/contexts/AuthContext.tsx` - React auth context
- `src/components/Auth/Login.tsx` - Login form component
- `src/components/Auth/Register.tsx` - Registration form component

### Modified Files
- `server/index.ts` - Added auth routes and middleware
- `src/App.tsx` - Added auth routes and protected route wrapper
- `src/components/FluxfeedLanding.tsx` - Added Sign In button and auth-gated Launch App
- `.env` - Added database credentials and JWT secret
- `package.json` - Added auth dependencies (pg, bcrypt, jsonwebtoken, etc.)

---

**Status**: ✅ Fully Implemented and Ready for Testing

**Version**: 1.0.0

**Last Updated**: January 2025
