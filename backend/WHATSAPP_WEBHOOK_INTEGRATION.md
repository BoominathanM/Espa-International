# WhatsApp Webhook Integration Guide

This document explains how to configure and use the WhatsApp API webhook integration for the E Spa International CRM system.

## Overview

The WhatsApp webhook integration allows the ASK EVA platform to send lead events (created, updated, deleted) to your CRM system in real-time. This enables automatic lead synchronization between WhatsApp and your CRM.

## Configuration

### 1. Environment Variables

Add the following to your `.env` file:

```env
# WhatsApp API Key (from ASK EVA platform)
WHATSAPP_API_KEY=74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
```

### 2. Webhook URL Configuration

Configure the webhook URL in your ASK EVA platform settings:

**For Local Development:**
```
http://localhost:3001/api/whatsapp/webhook
```

**For Production:**
```
https://e-spa.askeva.net/api/whatsapp/webhook
```

### 3. Webhook Authentication

The webhook endpoint requires authentication using the WhatsApp API key. Include it in the request header:

```
X-WhatsApp-API-Key: 74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
```

Alternatively, you can use:
```
X-API-Key: 74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
```

Or:
```
Authorization: Bearer 74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
```

## Webhook Payload Structure

### Lead Created Event

When a new lead is created in WhatsApp, the following payload is sent:

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

When a lead is updated in WhatsApp:

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

When a lead is deleted in WhatsApp:

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

## API Endpoints

### 1. Webhook Endpoint

**POST** `/api/whatsapp/webhook`

Receives webhook events from WhatsApp API.

**Headers:**
```
Content-Type: application/json
X-WhatsApp-API-Key: your_api_key_here
```

**Request Body:**
See payload structures above.

**Response (Success):**
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

### 2. Get Leads Endpoint (for WhatsApp API)

**GET** `/api/leads/whatsapp`

Allows WhatsApp API to fetch leads from your CRM.

**Headers:**
```
X-WhatsApp-API-Key: your_api_key_here
```

**Query Parameters:**
- `status` - Filter by status (New, In Progress, Follow-Up, Converted, Lost)
- `source` - Filter by source
- `branch` - Filter by branch ID
- `assignedTo` - Filter by assigned user ID
- `search` - Search in name, email, phone
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)

**Example Request:**
```
GET /api/leads/whatsapp?status=New&page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "leads": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone": "1234567890",
      "source": "WhatsApp",
      "status": "New",
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

### 3. Sample Payload Endpoint

**GET** `/api/whatsapp/webhook/sample`

Returns a sample webhook payload for testing/documentation purposes.

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

## Status Mapping

The webhook maps WhatsApp status values to CRM status values:

| WhatsApp Status | CRM Status |
|----------------|------------|
| New Lead       | New        |
| In Progress    | In Progress|
| Follow-Up      | Follow-Up  |
| Converted      | Converted  |
| Lost           | Lost       |

## Branch Assignment

- If `company` field in webhook data matches a branch name, the lead is assigned to that branch
- If no branch match is found, the lead defaults to "Anna Nagar" branch
- Leads are automatically assigned to available staff/supervisor users in the branch

## Testing the Webhook

### Using cURL

**Test Lead Created Event:**
```bash
curl -X POST http://localhost:3001/api/whatsapp/webhook \
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

**Test Get Leads:**
```bash
curl -X GET "http://localhost:3001/api/leads/whatsapp?status=New&page=1&limit=10" \
  -H "X-WhatsApp-API-Key: 74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5"
```

### Using Postman

1. Create a new POST request to `http://localhost:3001/api/whatsapp/webhook`
2. Add header `X-WhatsApp-API-Key` with your API key
3. Set Content-Type to `application/json`
4. Use the sample payload from the documentation

## Step-by-Step Configuration in ASK EVA Platform

1. **Login to ASK EVA Platform**
   - Go to https://e-spa.askeva.net/
   - Navigate to **Integration** → **Webhook Configuration**

2. **Configure Webhook URL**
   - **For Production:** `https://e-spa.askeva.net/api/whatsapp/webhook`
   - **For Development:** `http://localhost:3000/api/whatsapp/webhook` (if using ngrok or similar)

3. **Add Header Parameters (Optional)**
   - **Header Key:** `X-WhatsApp-API-Key`
   - **Header Value:** `74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5`

4. **Select Events**
   - Select "All" or specific events (lead_created, lead_updated, lead_deleted)

5. **Save Configuration**
   - Click "Save" to activate the webhook

## Troubleshooting

### Webhook Not Receiving Events

1. **Check API Key:**
   - Verify `WHATSAPP_API_KEY` is set correctly in `.env`
   - Ensure the API key in the webhook header matches the one in `.env`

2. **Check Webhook URL:**
   - For local development, use a tunneling service like ngrok
   - Ensure the URL is accessible from the internet

3. **Check Server Logs:**
   - Look for webhook-related logs in the console
   - Check for authentication errors

### Duplicate Leads

- The system checks for duplicates by email and phone
- If a duplicate is found, the webhook returns the existing lead instead of creating a new one

### Branch Assignment Issues

- Ensure branch names match exactly (case-insensitive)
- Default branch "Anna Nagar" must exist in the database
- Check that branch has assigned users for auto-assignment

## Security Considerations

1. **API Key Security:**
   - Never commit API keys to version control
   - Use environment variables for all sensitive data
   - Rotate API keys periodically

2. **HTTPS:**
   - Always use HTTPS in production
   - Verify SSL certificates

3. **Rate Limiting:**
   - Consider implementing rate limiting for webhook endpoints
   - Monitor for suspicious activity

## Support

For issues or questions:
- Check server logs for detailed error messages
- Verify webhook payload matches the expected structure
- Test with the sample payload endpoint first

