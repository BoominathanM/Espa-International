# ESPA International Backend

Backend API server for ESPA International CRM system.

## Setup Instructions

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env` (or create `.env` file)
   - Update the MongoDB URI and JWT secret in `.env`:
     ```
     PORT=3001
     MONGODB_URI=mongodb+srv://boominathanaskeva_db:Boomi%40183724@boominathan.b5yavux.mongodb.net/e-spa
     JWT_SECRET=your_jwt_secret_key_change_in_production
     NODE_ENV=development
     WEBSITE_API_KEY=esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4
     ```

3. **Seed Super Admin**
   ```bash
   npm run seed
   ```
   This will create a superadmin user:
   - Email: `superadmin@gmail.com`
   - Password: `123456`

4. **Start the Server**
   ```bash
   # Development mode (with auto-reload)
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user (requires auth)
- `GET /api/auth/me` - Get current user (requires auth)

### Users
- `GET /api/users` - Get all users (requires auth)
- `GET /api/users/unassigned` - Get unassigned users (requires auth)
- `GET /api/users/:id` - Get single user (requires auth)
- `POST /api/users` - Create user (requires superadmin)
- `PUT /api/users/:id` - Update user (requires superadmin)
- `DELETE /api/users/:id` - Delete user (requires superadmin)

### Branches
- `GET /api/branches` - Get all branches (requires auth)
- `GET /api/branches/:id` - Get single branch (requires auth)
- `POST /api/branches` - Create branch (requires superadmin)
- `PUT /api/branches/:id` - Update branch (requires superadmin)
- `DELETE /api/branches/:id` - Delete branch (requires superadmin)

### Leads
- `POST /api/leads/website` - Create lead from website contact form (requires API key)
- `POST /api/leads` - Create lead from frontend (requires auth)
- `GET /api/leads` - Get all leads with filters and pagination (requires auth)
- `GET /api/leads/export` - Export leads to CSV (requires auth)
- `POST /api/leads/import` - Import leads from CSV (requires auth)
- `GET /api/leads/:id` - Get single lead (requires auth)
- `PUT /api/leads/:id` - Update lead (requires auth)
- `DELETE /api/leads/:id` - Delete lead (requires superadmin)

## Features

- User authentication with JWT
- User management with role-based access control
- Branch management with user assignment
- Prevents duplicate user assignments across branches
- MongoDB database integration
- Password hashing with bcrypt

## Database Models

### User
- name, email, password, role, branch, status, phone

### Branch
- name, address, phone, email, assignedUsers

### Lead
- name, email, phone, whatsapp, subject, message, source, status, branch, assignedTo, notes, websiteUrl, ipAddress, lastInteraction
