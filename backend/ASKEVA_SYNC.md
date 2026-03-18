# AskEva CRM Lead Sync

**Sync AskEva** calls `GET backend.askeva.net/v1/leads?token=...` (same as Postman), then compares with your local leads: **updates existing** (by AskEva `id` or phone) and **creates new** ones — no duplicate leads.

## Setup

### 1. Environment Variables

Add to `backend/.env`:

```env
# Token for v1/leads (same value as in Postman: ?token=... or Bearer)
WHATSAPP_API_KEY=your_token_here
# Or: ASKEVA_API_TOKEN=your_token_here

# Optional: override leads API base (default https://backend.askeva.net)
# ASKEVA_SYNC_API_URL=https://backend.askeva.net

# Fallback / legacy: only if v1/leads returns 404
# ASKEVA_API_URL=https://apiv2.askeva.io
# ASKEVA_USER_ID=699c27f2400f94f14670dd7f

# Use only legacy lead-configuration/leads (skip v1/leads)
# ASKEVA_SYNC_USE_LEADS_API_ONLY=true
```

If `ASKEVA_API_TOKEN` is not set, the sync uses `WHATSAPP_API_KEY`.

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

1. **Primary:** `GET {ASKEVA_SYNC_API_URL}/v1/leads?token=TOKEN` (default base: `https://backend.askeva.net`). Same request as in Postman; response `{ success: true, data: [ ... ] }`.
2. **Deduplication:** For each AskEva lead, finds an existing local lead by `askevaLeadId` (AskEva `id`) or by `phone`/`whatsapp`. If found → **update**; otherwise → **create** (no duplicates).
3. **Field mapping:** `id` → `askevaLeadId`, `name` → `first_name`/`last_name`, `fullMobile`/`mobile` → `phone`/`whatsapp`, `source`/`status` → your enums, `description` → message/notes.
4. **Fallback:** If v1/leads returns 404, sync tries legacy `.../lead-configuration/leads` with header auth.
5. Auto-assigns **new** leads to branch users (default branch: Anna Nagar).

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
