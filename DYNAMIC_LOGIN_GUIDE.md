# Dynamic Role-Based Login System

## Overview

The ESPA International CRM now uses a **dynamic, role-based login system** that automatically determines user roles based on their @gmail.com email address.

## How It Works

### Email Domain
- **Required**: All emails must end with `@gmail.com`
- The system validates the email domain before authentication

### Role Detection Logic

The system extracts the email prefix (part before @gmail.com) and checks for role keywords:

1. **Super Admin Role**
   - Email contains: `superadmin`
   - Examples: `superadmin@gmail.com`, `superadmin123@gmail.com`, `mysuperadmin@gmail.com`
   - Access: Full system access + all settings

2. **Admin Role**
   - Email contains: `admin` (but NOT `superadmin`)
   - Examples: `admin@gmail.com`, `adminuser@gmail.com`, `myadmin@gmail.com`
   - Access: Leads, calls, customers, reports, partial settings (read-only)

3. **Supervisor Role**
   - Email contains: `supervisor` OR `super` (but not `superadmin`)
   - Examples: `supervisor@gmail.com`, `super@gmail.com`, `supervisor1@gmail.com`
   - Access: Assigned branch data + lead assignment

4. **Staff Role** (Default)
   - Email contains: `staff` OR `agent`
   - OR any other @gmail.com email that doesn't match above patterns
   - Examples: `staff@gmail.com`, `agent@gmail.com`, `john@gmail.com`, `user123@gmail.com`
   - Access: Only assigned leads + chat + call logs

### Password
- **All accounts**: `123456`
- Password validation is enforced

## Examples

| Email | Detected Role | Reason |
|-------|--------------|--------|
| `superadmin@gmail.com` | Super Admin | Contains "superadmin" |
| `admin@gmail.com` | Admin | Contains "admin" (not "superadmin") |
| `supervisor@gmail.com` | Supervisor | Contains "supervisor" |
| `super@gmail.com` | Supervisor | Contains "super" |
| `staff@gmail.com` | Staff | Contains "staff" |
| `agent@gmail.com` | Staff | Contains "agent" |
| `john@gmail.com` | Staff | Default (no role keywords) |
| `user123@gmail.com` | Staff | Default (no role keywords) |

## Implementation Details

### Login Flow
1. User enters email and password
2. System validates:
   - Email format (must be valid email)
   - Email domain (must be @gmail.com)
   - Password (must be "123456")
3. System extracts email prefix
4. System checks for role keywords in prefix
5. System assigns role and permissions
6. User is logged in with appropriate access

### Code Location
- **Login Logic**: `src/pages/Login.jsx`
- **Role Detection**: Lines 25-45 in Login.jsx
- **Permission Assignment**: Uses `getDefaultPermissions(role)` from `src/utils/permissions.js`

## User Management

When creating users in the System Settings:
- Email must be @gmail.com (validated in form)
- Role can be manually selected
- Super Admin can create users with any role

## Benefits

1. **Flexibility**: Any @gmail.com email can be used
2. **Automatic Role Assignment**: No need to pre-configure every email
3. **Easy Testing**: Quick role switching by changing email
4. **Scalable**: Works with any number of users
5. **Secure**: Still requires password validation

## Future Enhancements

For production, consider:
- Backend API integration for actual authentication
- Database lookup for user roles
- Email verification
- Password hashing and complexity requirements
- Multi-factor authentication
- Session management

---

**Current System**: Mock authentication with localStorage
**Production Ready**: Requires backend API integration
