# WhatsApp API Integration - Quick Setup Guide

## Step-by-Step Configuration

### Step 1: Configure Environment Variables

Create or update your `.env` file in the `backend` directory:

```env
# WhatsApp API Key (from ASK EVA platform)
WHATSAPP_API_KEY=74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5
```

### Step 2: Configure Webhook in ASK EVA Platform

1. **Login to ASK EVA Platform**
   - Go to: https://e-spa.askeva.net/
   - Navigate to: **Integration** → **Webhook Configuration** (or **Leads** → **Lead Settings** → **Webhook Configuration**)

2. **Enter Webhook URL**
   - **For Production (Live):**
     ```
     https://e-spa.askeva.net/api/whatsapp/webhook
     ```
   - **For Local Development:**
     ```
     http://localhost:3000/api/whatsapp/webhook
     ```
     > **Note:** For local development, you'll need to use a tunneling service like ngrok to expose your local server to the internet.

3. **Select Events**
   - Choose **"All"** to receive all events, or select specific events:
     - ✅ lead_created
     - ✅ lead_updated
     - ✅ lead_deleted

4. **Add Header Parameters (Optional but Recommended)**
   - **Header Key:** `X-WhatsApp-API-Key`
   - **Header Value:** `74f3c98f9f65fa76cf3b8d349442e004ee27b990ac5a67c91f3c2695e1a251a681d9a566e2ef45ee476cf46c13745b74d69c77a6b1b51c914b7cfc2d6c3522f5`

5. **Save Configuration**
   - Click the **Save** button to activate the webhook

### Step 3: Verify Webhook Configuration

The webhook expects the following payload structure (as shown in the ASK EVA platform):

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

### Step 4: Test the Webhook

#### Option 1: Test with Sample Payload Endpoint

```bash
curl http://localhost:3001/api/whatsapp/webhook/sample
```

#### Option 2: Test with cURL

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

### Step 5: Verify Lead Creation

After sending a test webhook, check your CRM:
- Go to **Leads** section
- Verify the new lead was created
- Check that the lead source is "WhatsApp"
- Verify branch assignment (defaults to "Anna Nagar" if company doesn't match)

## API Endpoints Summary

### Webhook Endpoint
- **URL:** `POST /api/whatsapp/webhook`
- **Auth:** `X-WhatsApp-API-Key` header
- **Purpose:** Receive lead events from WhatsApp API

### Get Leads Endpoint (for WhatsApp API)
- **URL:** `GET /api/leads/whatsapp`
- **Auth:** `X-WhatsApp-API-Key` header
- **Purpose:** Allow WhatsApp API to fetch leads from CRM
- **Query Params:** `status`, `source`, `branch`, `assignedTo`, `search`, `page`, `limit`

### Sample Payload Endpoint
- **URL:** `GET /api/whatsapp/webhook/sample`
- **Auth:** None (public)
- **Purpose:** Get sample webhook payload for testing

## Troubleshooting

### Issue: Webhook not receiving events

**Solutions:**
1. Check that `WHATSAPP_API_KEY` is set in `.env` file
2. Verify the webhook URL is correct and accessible
3. For local development, ensure you're using ngrok or similar tunneling service
4. Check server logs for authentication errors
5. Verify the API key in the webhook header matches the one in `.env`

### Issue: Leads not being created

**Solutions:**
1. Check server logs for error messages
2. Verify the payload structure matches the expected format
3. Ensure required fields (name, mobile) are present in the payload
4. Check MongoDB connection

### Issue: Authentication errors

**Solutions:**
1. Verify `WHATSAPP_API_KEY` in `.env` matches the key in webhook header
2. Check that the header name is correct: `X-WhatsApp-API-Key` or `X-API-Key`
3. Ensure the API key is not missing or has extra spaces

## Local Development Setup

For local development, you need to expose your local server to the internet:

### Using ngrok:

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

## Production Setup

For production deployment:

1. **Ensure HTTPS is enabled** (required for webhooks)
2. **Set environment variables** on your hosting platform
3. **Configure webhook URL** in ASK EVA platform:
   ```
   https://e-spa.askeva.net/api/whatsapp/webhook
   ```
4. **Test webhook** with a sample payload
5. **Monitor logs** for any errors

## Security Best Practices

1. ✅ Never commit `.env` file to version control
2. ✅ Use HTTPS in production
3. ✅ Rotate API keys periodically
4. ✅ Monitor webhook logs for suspicious activity
5. ✅ Validate webhook payloads before processing

## Support

For detailed documentation, see:
- [WHATSAPP_WEBHOOK_INTEGRATION.md](./WHATSAPP_WEBHOOK_INTEGRATION.md) - Complete integration guide
- [README.md](./README.md) - General backend documentation

