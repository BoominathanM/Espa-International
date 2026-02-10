# Quick Start Guide - ESPA International CRM

## 🚀 Getting Started

### Step 1: Install Dependencies
```bash
cd frontend
npm install
```

### Step 2: Start Development Server
```bash
npm run dev
```

The application will open at `http://localhost:3000`

## 🔐 Login Credentials

Use any @gmail.com email address. The role is determined dynamically based on the email prefix:

| Role | Email Examples | Password | Access Level |
|------|----------------|----------|--------------|
| Super Admin | `superadmin@gmail.com`, `superadmin123@gmail.com` | 123456 | Full system access + settings |
| Admin | `admin@gmail.com`, `adminuser@gmail.com` | 123456 | Leads, calls, customers, reports, partial settings |
| Supervisor | `supervisor@gmail.com`, `super@gmail.com` | 123456 | Assigned branch data + lead assignment |
| Staff | `staff@gmail.com`, `agent@gmail.com`, or any other @gmail.com | 123456 | Only assigned leads + chat + call logs |

**Role Detection Logic:**
- Email contains "superadmin" → Super Admin
- Email contains "admin" (but not "super") → Admin
- Email contains "supervisor" or "super" → Supervisor
- Email contains "staff" or "agent" → Staff
- Any other @gmail.com email → Staff (default)

## 📋 Features Overview

### ✅ Dashboard
- Real-time statistics widgets
- Lead trend charts
- Source distribution pie chart
- Branch activity bar chart
- Recent leads table
- Alerts for missed calls, unassigned leads, AI bot leads

### ✅ Lead Management
- Complete lead list with filters
- Create/Edit/Delete leads
- Lead timeline view
- Source-wise filtering (Call, WhatsApp, AI Bot, Website)
- Status management (New, In Progress, Follow-Up, Converted, Lost)
- Branch and agent assignment

### ✅ Call Management
- Inbound/Outbound call logs
- Call recording playback
- Create lead from unknown number
- Filter by type, status, agent
- Duration tracking
- Link calls to leads

### ✅ WhatsApp + AI Chat
- Chat inbox with sidebar
- Filter by status (Open, Closed, Assigned to Me)
- AI bot indicator (after 8 PM)
- Quick reply templates
- Chat timeline
- Close/Delete chat functionality

### ✅ Customer Management
- Customer profiles
- Tags (New Customer, Repeat Customer)
- Customer timeline
- Notes functionality
- Total leads, calls, chats tracking

### ✅ Reports & Analytics
- Lead Performance Report
- Agent Performance Report
- Call Summary Report
- Branch Performance Report
- Repeat Customer Statistics
- Export to Excel/PDF (UI ready)

### ✅ System Settings
- **User Management**: Add/Edit/Delete users, assign roles and branches
- **Role Management**: Configure CRUD permissions per module
- **Branch Configuration**: Manage branches
- **Number Configuration**: Manage phone numbers and assign agents
- **API & Integrations**: Ozonetel and WhatsApp API configuration
- **System Logs**: Chat deletion, activity, and login history

## 🎨 Color Theme

The application uses your logo colors:
- **Primary**: Golden Yellow (#D4AF37)
- **Background**: Black (#0a0a0a, #1a1a1a)
- **Text**: White (#ffffff)
- **Accents**: Various status colors

## 🔒 Permission System

Each module supports granular permissions:
- **Create**: Add new records
- **Read**: View records
- **Edit**: Modify records
- **Delete**: Remove records

Permissions are enforced at the UI level based on user role.

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/        # Reusable components (Layout, ProtectedRoute)
│   ├── pages/            # All page components
│   │   ├── Dashboard/
│   │   ├── Leads/
│   │   ├── Calls/
│   │   ├── Chats/
│   │   ├── Customers/
│   │   ├── Reports/
│   │   ├── Settings/     # Settings sub-modules
│   │   └── Login.jsx
│   ├── context/          # React Context (AuthContext)
│   ├── router/           # Routing configuration
│   ├── utils/            # Utility functions (permissions)
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── package.json
├── vite.config.js
└── index.html
```

## 🔧 Build for Production

```bash
npm run build
```

The build output will be in the `dist/` folder.

## 📝 Notes

- **Authentication**: Currently uses localStorage. Replace with actual API calls in production.
- **Data**: All data is mock data. Replace API calls with actual backend endpoints.
- **Integrations**: Ozonetel and WhatsApp integrations are UI-ready but need backend implementation.
- **Export**: Export functionality is UI-ready but needs backend implementation.

## 🐛 Troubleshooting

### Port already in use
If port 3000 is busy, Vite will automatically use the next available port.

### Module not found errors
Run `npm install` again to ensure all dependencies are installed.

### Styling issues
Make sure Ant Design CSS is properly imported (it's included via ConfigProvider in main.jsx).

## 🎯 Next Steps

1. Connect to backend API
2. Implement actual authentication
3. Integrate Ozonetel API for call management
4. Integrate WhatsApp API for chat
5. Implement export functionality
6. Add real-time updates (WebSocket)
7. Add more advanced filtering and search

---

**Built with ❤️ for ESPA International**
