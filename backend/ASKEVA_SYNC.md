# AskEva CRM Lead Sync

Sync all leads from AskEva CRM (`apiv2.askeva.io`) into your local leads collection.

## Setup

### 1. Environment Variables

Add to `backend/.env`:

```env
# AskEva API (optional - defaults to WHATSAPP_API_KEY if not set)
ASKEVA_API_URL=https://apiv2.askeva.io
ASKEVA_API_TOKEN=your_askeva_api_token

# If AskEva returns 403, the API may require a user-scoped URL. Set this to your AskEva user ID
# (you can find it in the leads API response as "userId" on each lead, e.g. 699c27f2400f94f14670dd7f).
# ASKEVA_USER_ID=699c27f2400f94f14670dd7f
```

If `ASKEVA_API_TOKEN` is not set, the sync uses `WHATSAPP_API_KEY` (same key as your webhook).

### 2. API Token and 403 Forbidden

- Get your AskEva API token from the AskEva platform (Integration / API settings). If you use the same token as the WhatsApp webhook, leave `ASKEVA_API_TOKEN` empty.
- **If you get 403 Forbidden:** The webhook key may only have permission to receive events, not to read the leads API. In the AskEva dashboard, look for an **API token** or **Read leads** permission and use that token in `ASKEVA_API_TOKEN` or `WHATSAPP_API_KEY`.
- **If the API is user-scoped:** Add `ASKEVA_USER_ID=<your-askeva-user-id>` to `.env`. You can find your user ID in the AskEva leads response (each lead has a `userId` field) or in your AskEva account settings.

### 3. Bypassing 304 Cache

The sync service adds `Cache-Control: no-cache` and `Pragma: no-cache` headers when calling the AskEva API so you always get fresh data instead of 304 Not Modified.

## Usage

### From Leads Page (UI)

1. Log in to the CRM
2. Go to **Leads**
3. Click **Sync AskEva**
4. Wait for the sync to complete
5. A message shows: "X created, Y updated, Z skipped"

### From API (cURL)

```bash
curl -X POST https://e-spa.askeva.net/api/leads/sync-askeva \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## How It Works

1. Fetches all leads from `GET https://apiv2.askeva.io/v1/lead-configuration/leads`
2. Maps AskEva fields to your Lead model:
   - `name` → `first_name`, `last_name`
   - `fullMobile` / `mobile` → `phone`, `whatsapp`
   - `status` → mapped to your status enum
   - `source` → mapped to your source enum
   - `id` → stored in `askevaLeadId` for deduplication
3. Creates new leads or updates existing (matched by `askevaLeadId` or phone)
4. Auto-assigns new leads to branch users (default branch: Anna Nagar)

## Webhook + Sync

- **Webhook** (`POST /api/whatsapp/webhook`): Real-time events from AskEva (lead_created, lead_updated, lead_deleted)
- **Sync** (`POST /api/leads/sync-askeva`): Bulk fetch all leads and sync to your DB

Use the webhook for real-time updates and the sync for initial import or periodic refresh.

## Bypass Webhook API Key (when AskEva cannot send headers)

If AskEva does not send the API key in webhook requests (e.g. platform limitation), add to `.env`:

```env
WHATSAPP_WEBHOOK_SKIP_AUTH=true
```

This allows webhook requests with valid payload (event + data) to bypass API key validation. **Use only if AskEva cannot be configured to send X-WhatsApp-API-Key header.**
