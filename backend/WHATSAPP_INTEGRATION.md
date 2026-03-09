# WhatsApp API Integration - Complete Guide

Complete documentation for integrating WhatsApp API webhooks with E Spa International CRM system.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Setup](#quick-setup)
3. [Configuration](#configuration)
4. [API Endpoints](#api-endpoints)
5. [Webhook Payload Structure](#webhook-payload-structure)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)
8. [Implementation Details](#implementation-details)

---

## Overview

The WhatsApp webhook integration allows the ASK EVA platform to send lead events (created, updated, deleted) to your CRM system in real-time. This enables automatic lead synchronization between WhatsApp and your CRM.

### Features

- ✅ Real-time lead synchronization
- ✅ Automatic lead creation, updates, and deletion
- ✅ Duplicate detection (by email/phone)
- ✅ Auto-assignment to branch users
- ✅ Branch matching from company field
- ✅ Status mapping from WhatsApp to CRM
- ✅ Secure API key authentication

---

## Quick Setup

### Step 1: Environment Configuration

Add to your `.env` file in the `backend` directory:

```env
# WhatsApp API Key (from ASK EVA platform)
WHATSAPP_API_KEY=74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5

# Frontend URLs (optional)
FRONTEND_URLS=https://e-spa.askeva.net,http://localhost:3000
PRODUCTION_FRONTEND_URL=https://e-spa.askeva.net
```

**Important:** Restart your server after updating `.env`!

### Step 2: Configure Webhook in ASK EVA Platform

1. **Login to ASK EVA Platform**
   - Go to: https://e-spa.askeva.net/
   - Navigate to: **Integration** → **Webhook Configuration**

2. **Enter Webhook URL**
   - **Production:** `https://e-spa.askeva.net/api/whatsapp/webhook`
   - **Local Development:** `http://localhost:3001/api/whatsapp/webhook` (use ngrok for local testing)

3. **Select Events**
   - Choose **"All"** or specific events:
     - ✅ lead_created
     - ✅ lead_updated
     - ✅ lead_deleted

4. **Add Header Parameters (REQUIRED for webhook to work)**
   - **Header Key:** `X-WhatsApp-API-Key`
   - **Header Value:** `74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5`
   
   **⚠️ IMPORTANT:** Without this header, webhook tests will fail with "401 Unauthorized" error!

5. **Save Configuration**

6. **Test the Webhook**
   - Click the "Test Webhook" button in ASK EVA platform
   - Should return success if configured correctly

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WHATSAPP_API_KEY` | Yes | API key from ASK EVA platform |
| `FRONTEND_URLS` | No | Comma-separated list of allowed frontend URLs |
| `PRODUCTION_FRONTEND_URL` | No | Production frontend URL |

### Webhook URLs

| Environment | URL |
|-------------|-----|
| Production | `https://e-spa.askeva.net/api/whatsapp/webhook` |
| Local Development | `http://localhost:3001/api/whatsapp/webhook` |

**Note:** For local development, use ngrok or similar tunneling service to expose your local server.

### Authentication

The webhook endpoint supports multiple authentication methods:

1. **X-WhatsApp-API-Key header** (preferred)
   ```
   X-WhatsApp-API-Key: your_api_key_here
   ```

2. **X-API-Key header** (alternative)
   ```
   X-API-Key: your_api_key_here
   ```

3. **Authorization Bearer** (alternative)
   ```
   Authorization: Bearer your_api_key_here
   ```

---

## API Endpoints

### 1. Webhook Verification (GET)
**Endpoint:** `GET /api/whatsapp/webhook`  
**Authentication:** None  
**Purpose:** Webhook system verification

**Response:**
```json
{
  "success": true,
  "message": "Webhook endpoint is active and ready to receive events",
  "endpoint": "/api/whatsapp/webhook",
  "methods": ["GET", "POST"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 2. Webhook Event Handler (POST)
**Endpoint:** `POST /api/whatsapp/webhook`  
**Authentication:** Required (`X-WhatsApp-API-Key` header)  
**Purpose:** Receive webhook events from WhatsApp API

**Headers:**
```
Content-Type: application/json
X-WhatsApp-API-Key: your_api_key_here
```

**Success Response:**
```json
{
  "success": true,
  "message": "Lead created successfully from WhatsApp webhook",
  "lead": {
    "_id": "507f1f77bcf86cd799439011",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "1234567890",
    "source": "WhatsApp",
    "status": "New",
    ...
  }
}
```

### 3. Test Webhook (GET)
**Endpoint:** `GET /api/whatsapp/webhook/test`  
**Authentication:** None  
**Purpose:** Test endpoint accessibility

**Response:**
```json
{
  "success": true,
  "message": "Test webhook endpoint is working (GET)",
  "method": "GET",
  "endpoint": "/api/whatsapp/webhook/test",
  "availableMethods": ["GET", "POST"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 4. Test Webhook (POST)
**Endpoint:** `POST /api/whatsapp/webhook/test`  
**Authentication:** None  
**Purpose:** Test webhook payload processing without authentication

### 5. Sample Payload (GET)
**Endpoint:** `GET /api/whatsapp/webhook/sample`  
**Authentication:** None  
**Purpose:** Get sample webhook payload for reference

**Response:**
```json
{
  "success": true,
  "message": "Sample webhook payload",
  "payload": {
    "event": "lead_created",
    "timestamp": "2023-07-20T12:34:56Z",
    "data": {
      "leadId": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "mobile": "1234567890",
      "company": "Example Corp",
      "status": "New Lead"
    }
  }
}
```

### 6. Get Leads (for WhatsApp API)
**Endpoint:** `GET /api/leads/whatsapp`  
**Authentication:** Required (`X-WhatsApp-API-Key` header)  
**Purpose:** Allow WhatsApp API to fetch leads from CRM

**Query Parameters:**
- `status` - Filter by status (New, In Progress, Follow-Up, Converted, Lost)
- `source` - Filter by source
- `branch` - Filter by branch ID
- `assignedTo` - Filter by assigned user ID
- `search` - Search in name, email, phone
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)

**Example:**
```
GET /api/leads/whatsapp?status=New&page=1&limit=10
```

---

## Webhook Payload Structure

### Lead Created Event

```json
{
  "event": "lead_created",
  "timestamp": "2023-07-20T12:34:56Z",
  "data": {
    "leadId": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "1234567890",
    "company": "Example Corp",
    "status": "New Lead"
  }
}
```

### Lead Updated Event

```json
{
  "event": "lead_updated",
  "timestamp": "2023-07-20T12:34:56Z",
  "data": {
    "leadId": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "1234567890",
    "company": "Example Corp",
    "status": "In Progress"
  }
}
```

### Lead Deleted Event

```json
{
  "event": "lead_deleted",
  "timestamp": "2023-07-20T12:34:56Z",
  "data": {
    "leadId": "507f1f77bcf86cd799439011",
    "email": "john@example.com",
    "mobile": "1234567890"
  }
}
```

### Status Mapping

| WhatsApp Status | CRM Status |
|----------------|------------|
| New Lead       | New        |
| In Progress    | In Progress|
| Follow-Up      | Follow-Up  |
| Converted      | Converted  |
| Lost           | Lost       |

### Field Mapping

| Webhook Field | CRM Field | Required |
|---------------|-----------|----------|
| `data.name` | `first_name`, `last_name` | Yes |
| `data.email` | `email` | No |
| `data.mobile` | `phone`, `whatsapp` | Yes |
| `data.company` | `branch` (matched by name) | No |
| `data.status` | `status` (mapped) | No |

---

## Testing

### Test GET Verification
```bash
curl https://e-spa.askeva.net/api/whatsapp/webhook
```

### Test GET Test Endpoint
```bash
curl https://e-spa.askeva.net/api/whatsapp/webhook/test
```

### Test POST Webhook (with authentication)
```bash
curl -X POST https://e-spa.askeva.net/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -H "X-WhatsApp-API-Key: 74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5" \
  -d '{
    "event": "lead_created",
    "timestamp": "2023-07-20T12:34:56Z",
    "data": {
      "leadId": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "mobile": "1234567890",
      "company": "Example Corp",
      "status": "New Lead"
    }
  }'
```

### Test POST Test Endpoint (without authentication)
```bash
curl -X POST https://e-spa.askeva.net/api/whatsapp/webhook/test \
  -H "Content-Type: application/json" \
  -d '{
    "event": "lead_created",
    "timestamp": "2023-07-20T12:34:56Z",
    "data": {
      "name": "Test User",
      "mobile": "1234567890",
      "email": "test@example.com"
    }
  }'
```

### Get Sample Payload
```bash
curl https://e-spa.askeva.net/api/whatsapp/webhook/sample
```

---

## Troubleshooting

### Issue 1: "Webhook test failed" in ASK EVA Platform

**Error Message:** `"WhatsApp API key is required. Please provide X-WhatsApp-API-Key or X-API-Key header."`

#### Root Cause:
The webhook test is failing because the API key header is not being sent from ASK EVA platform.

#### Solutions:

1. **Configure Header Parameters in ASK EVA Platform (MOST IMPORTANT)**
   - In the webhook configuration page, find "Header Parameters (Optional)" section
   - **Header Key:** `X-WhatsApp-API-Key` (exactly as shown, case-sensitive)
   - **Header Value:** `74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5`
   - **⚠️ CRITICAL:** This field is marked "Optional" but it's REQUIRED for the webhook to work!
   - Click "Save" after adding the header

2. **Verify Server is Running**
   ```bash
   curl https://e-spa.askeva.net/api/health
   ```

3. **Check Environment Variables**
   - Ensure `WHATSAPP_API_KEY` is set in `.env`
   - Restart server after updating `.env`

4. **Verify API Key**
   - Check API key in ASK EVA platform matches `.env`
   - Ensure complete API key (not truncated):
     ```
     74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
     ```

5. **Test Endpoint Directly**
   ```bash
   # Test GET (should work without auth)
   curl https://e-spa.askeva.net/api/whatsapp/webhook
   
   # Test POST (requires API key)
   curl -X POST https://e-spa.askeva.net/api/whatsapp/webhook \
     -H "Content-Type: application/json" \
     -H "X-WhatsApp-API-Key: 74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5" \
     -d '{"event":"lead_created","data":{"name":"Test","mobile":"1234567890"}}'
   ```

6. **Check Server Logs**
   - Look for: `[WhatsApp Webhook]` messages
   - Check for authentication errors
   - Verify request is reaching the server
   - Look for: `Missing API key` or `Invalid API key` messages

### Issue 2: Authentication Errors

**Error:** "Invalid WhatsApp API key"

**Solutions:**
1. Verify API key in `.env` matches webhook header
2. Check for extra spaces or newlines
3. Ensure server was restarted after updating `.env`
4. Verify header name: `X-WhatsApp-API-Key` or `X-API-Key`

**Error:** "WhatsApp API key is required"

**Solutions:**
1. Ensure header is set in ASK EVA platform
2. Check header name is correct
3. Verify header value is not empty

### Issue 3: Leads Not Being Created

**Solutions:**
1. Check server logs for error messages
2. Verify payload structure matches expected format
3. Ensure required fields (`name`, `mobile`) are present
4. Check MongoDB connection
5. Verify branch "Anna Nagar" exists (default branch)

### Issue 4: Duplicate Leads

**Behavior:**
- System checks for duplicates by email and phone
- If duplicate found, returns existing lead instead of creating new one
- This is expected behavior

### Issue 5: 404 Not Found

**Solutions:**
1. Verify route is registered in `server.js`:
   ```javascript
   app.use('/api/whatsapp', whatsappRoutes)
   ```
2. Check URL path is exactly `/api/whatsapp/webhook`
3. Ensure server is restarted after code changes

### Issue 6: CORS Errors

**Solutions:**
1. Check CORS configuration in `server.js`
2. Verify allowed origins include your domain
3. Check browser console for CORS error details

### Quick Fix Checklist

- [ ] Server is running and accessible
- [ ] `WHATSAPP_API_KEY` is set in `.env` file
- [ ] Server was restarted after updating `.env`
- [ ] Webhook URL is correct: `https://e-spa.askeva.net/api/whatsapp/webhook`
- [ ] API key in ASK EVA platform matches `.env` file
- [ ] Header name is correct: `X-WhatsApp-API-Key`
- [ ] Complete API key is used (not truncated)
- [ ] HTTPS is enabled (required for production)
- [ ] Server logs show incoming requests
- [ ] No firewall blocking requests

---

## Implementation Details

### Code Structure

**Files:**
- `controllers/whatsappWebhookController.js` - Webhook event handlers
- `routes/whatsapp.js` - Route definitions
- `middleware/auth.js` - Authentication middleware (`authenticateWhatsAppApiKey`)

**Key Functions:**
- `handleWebhook()` - Main webhook handler
- `handleLeadCreated()` - Process lead_created events
- `handleLeadUpdated()` - Process lead_updated events
- `handleLeadDeleted()` - Process lead_deleted events
- `verifyWebhook()` - Webhook verification (GET)
- `testWebhook()` - Test endpoint (GET/POST)

### Lead Processing Flow

1. Webhook receives event payload
2. Event type is determined (`lead_created`, `lead_updated`, `lead_deleted`)
3. Appropriate handler function processes the event
4. Lead data is validated and transformed
5. Duplicate check (by email/phone)
6. Branch assignment (by company name or default to "Anna Nagar")
7. Auto-assignment to branch user
8. Database operations are performed
9. Response is sent back to WhatsApp API

### Branch Assignment Logic

1. If `company` field matches a branch name → assign to that branch
2. If no match → default to "Anna Nagar" branch
3. Auto-assign to available staff/supervisor in the branch

### Duplicate Detection

- Checks by email (if provided)
- Checks by phone number
- Returns existing lead if duplicate found
- Prevents duplicate lead creation

---

## Local Development Setup

### Using ngrok for Local Testing

1. **Install ngrok:**
   ```bash
   npm install -g ngrok
   # or download from https://ngrok.com/
   ```

2. **Start your backend server:**
   ```bash
   npm run dev
   ```

3. **Start ngrok tunnel:**
   ```bash
   ngrok http 3001
   ```

4. **Use ngrok URL in webhook configuration:**
   ```
   https://your-ngrok-url.ngrok.io/api/whatsapp/webhook
   ```

---

## Production Setup

1. **Ensure HTTPS is enabled** (required for webhooks)
2. **Set environment variables** on your hosting platform
3. **Configure webhook URL** in ASK EVA platform:
   ```
   https://e-spa.askeva.net/api/whatsapp/webhook
   ```
4. **Test webhook** with a sample payload
5. **Monitor logs** for any errors

---

## Security Best Practices

1. ✅ Never commit `.env` file to version control
2. ✅ Use HTTPS in production
3. ✅ Rotate API keys periodically
4. ✅ Monitor webhook logs for suspicious activity
5. ✅ Validate webhook payloads before processing
6. ✅ Use API key authentication for all webhook endpoints
7. ✅ Implement rate limiting (future enhancement)

---

## Support

For additional help:
- Check server logs for detailed error messages
- Review this documentation
- Test with sample payload endpoint first
- Verify environment variables are set correctly

---

## Quick Reference

### API Key
```
74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
```

### Webhook URL
```
https://e-spa.askeva.net/api/whatsapp/webhook
```

### Required Headers
```
X-WhatsApp-API-Key: your_api_key_here
Content-Type: application/json
```

### Required Fields in Payload
- `event` (string) - Event type
- `data` (object) - Event data
- `data.name` (string) - Lead name (required)
- `data.mobile` (string) - Phone number (required)

---

**Last Updated:** 2024-01-15  
**Version:** 1.0.0

