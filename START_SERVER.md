# 🚀 Start Backend Server

## Quick Start

### 1. Open Terminal
Open a **NEW** terminal window (keep it open!)

### 2. Navigate to Backend
```bash
cd C:\Boomi\Espa-International\backend
```

### 3. Start Server
```bash
npm run dev
```

### 4. Verify It's Running
You should see:
```
Connected to MongoDB
Server is running on port 3001
```

**⚠️ KEEP TERMINAL OPEN!** Server stops if you close it.

### 5. Test Connection
Open in browser: `http://localhost:3001/api/health`

Should show: `{"status":"OK","message":"Server is running"}`

## Login Credentials
- Email: `superadmin@gmail.com`
- Password: `123456`

## Troubleshooting

**If port 3001 is busy:**
- Change PORT in `backend/.env` to another port (e.g., 3002)
- Update `frontend/src/store/api/apiSlice.js` baseUrl to match

**If MongoDB connection fails:**
- Check `.env` file has correct MONGODB_URI
- Verify MongoDB Atlas connection
