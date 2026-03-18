# ESPA International Backend

Backend API server for ESPA International CRM system.

## Setup Instructions

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment Variables**
   - Create `.env` file in the backend directory
   - Add the following environment variables:
     ```
     PORT=3001
     MONGODB_URI=mongodb+srv://boominathanaskeva_db:Boomi%40183724@boominathan.b5yavux.mongodb.net/e-spa
     JWT_SECRET=your_jwt_secret_key_change_in_production
     NODE_ENV=development
     WEBSITE_API_KEY=esp_b3ed2ffba4d8d15a52b3eeca54f9b6dfeba5b8364dfafcc67c807784d32b5de4
     WHATSAPP_API_KEY=74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
     FRONTEND_URLS=https://e-spa.askeva.net,http://localhost:3000
     PRODUCTION_FRONTEND_URL=https://e-spa.askeva.net
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
- `GET /api/users/:id/disable-preview` - Preview leads/reminders before disable (superadmin)
- `POST /api/users/:id/disable` - Disable user; body `{ reassignToUserId }` when reassignment required (superadmin)

### Branches
- `GET /api/branches` - Get all branches (requires auth)
- `GET /api/branches/:id` - Get single branch (requires auth)
- `POST /api/branches` - Create branch (requires superadmin)
- `PUT /api/branches/:id` - Update branch (requires superadmin)
- `DELETE /api/branches/:id` - Delete branch (requires superadmin)

### Leads
- `POST /api/leads/website` - Create lead from website contact form (requires API key)
- `GET /api/leads/whatsapp` - Get leads for WhatsApp API (requires WhatsApp API key)
- `POST /api/leads` - Create lead from frontend (requires auth)
- `GET /api/leads` - Get all leads with filters and pagination (requires auth)
- `GET /api/leads/export` - Export leads to CSV (requires auth)
- `POST /api/leads/import` - Import leads from CSV (requires auth)
- `GET /api/leads/:id` - Get single lead (requires auth)
- `PUT /api/leads/:id` - Update lead (requires auth)
- `DELETE /api/leads/:id` - Delete lead (requires superadmin)

### WhatsApp Integration
- `POST /api/whatsapp/webhook` - Receive webhook events from WhatsApp API (requires WhatsApp API key)
- `GET /api/whatsapp/webhook/sample` - Get sample webhook payload (public)

## Features

- User authentication with JWT
- User management with role-based access control
- Branch management with user assignment
- Prevents duplicate user assignments across branches
- MongoDB database integration
- Password hashing with bcrypt
- WhatsApp webhook integration for real-time lead synchronization
- Website contact form integration
- Lead auto-assignment to branch users

## Database Models

### User
- name, email, password, role, branch, status, phone

### Branch
- name, address, phone, email, assignedUsers

### Lead
- first_name, last_name, email, phone, whatsapp, subject, message, source, status, branch, assignedTo, notes, websiteUrl, ipAddress, lastInteraction, appointment_date, slot_time, spa_package

## WhatsApp Webhook Integration

For detailed information about configuring WhatsApp webhooks, see [WHATSAPP_WEBHOOK_INTEGRATION.md](./WHATSAPP_WEBHOOK_INTEGRATION.md)

### Quick Setup

1. **Add WhatsApp API Key to `.env`:**
   ```
   WHATSAPP_API_KEY=74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
   ```

2. **Configure Webhook URL in ASK EVA Platform:**
   - Production: `https://e-spa.askeva.net/api/whatsapp/webhook`
   - Development: `http://localhost:3001/api/whatsapp/webhook` (use ngrok for local testing)

3. **Webhook Events Supported:**
   - `lead_created` - Creates a new lead in CRM
   - `lead_updated` - Updates an existing lead
   - `lead_deleted` - Deletes a lead from CRM
