# AskEva CRM Lead Sync

**Sync AskEva** calls `GET {Backend URL}/v1/leads?token=...` on every WhatsApp account (same as Postman), then compares with your local leads: **updates existing** (by AskEva `id` or phone) and **creates new** ones — no duplicate leads.

## Setup

### 1. WhatsApp accounts

Accounts are saved in **Settings > API & Integrations > WhatsApp API > WhatsApp Configuration** (Backend URL + API Key, the same token as in Postman). Sync reads every saved account; new leads go to that account's branch, or the Default account's branch when it has none, or else the oldest branch.

`ASKEVA_API_TOKEN` / `WHATSAPP_API_KEY` in `.env` are only read once, to create the first account on an empty database.

### 2. API Token and 403 Forbidden

- Get your AskEva API token from the AskEva platform (Integration / API settings).
- **If you get 403 Forbidden:** The webhook key may only have permission to receive events, not to read the leads API. In the AskEva dashboard, look for an **API token** or **Read leads** permission and save that token on the account.
- One account failing doesn't stop the others: the sync finishes and shows a warning naming the account.

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

1. **Fetch:** `GET {Backend URL}/v1/leads?token=TOKEN` for each account. Same request as in Postman; response `{ success: true, data: [ ... ] }`.
2. **Deduplication:** For each AskEva lead, finds an existing local lead by `askevaLeadId` (AskEva `id`) or by `phone`/`whatsapp`. If found → **update**; otherwise → **create** (no duplicates).
3. **Field mapping:** `id` → `askevaLeadId`, `name` → `first_name`/`last_name`, `fullMobile`/`mobile` → `phone`/`whatsapp`, `source`/`status` → your enums, `description` → message/notes.
4. Auto-assigns **new** leads to the users of the account's branch.

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
