# CloudAgent (Ozonetel) integration

How the CRM integrates with Ozonetel CloudAgent for click-to-call and call logging.

## Backend

### Config: DB first, then `.env`

- **Settings → API & Integrations → Ozonetel Integration** (Super Admin) stores: Base URL, API Key, Is Active, Default Campaign, Campaign IDs. This is the main config.
- If no DB record or integration is inactive, the backend falls back to `.env`: `CLOUDAGENT_BASE_URL`, `CLOUDAGENT_API_KEY`, `CLOUDAGENT_CAMPAIGN` or `campaign_name`.

### API endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/ozonetel-settings | Super Admin | Get Ozonetel config |
| PUT | /api/ozonetel-settings | Super Admin | Update Ozonetel config |
| GET | /api/cloudagent/campaigns | Yes | Campaign list for dropdown |
| POST | /api/cloudagent/make-call | Yes | Click-to-call (body: phoneNumber, agentId?, campaignName?) |
| GET | /api/cloudagent/call-logs | Yes | Paginated call logs |
| POST | /webhook/cloudagent-events | No | CloudAgent webhook |

### User → Agent

- **Settings → User Management** → Edit user → **CloudAgent Agent ID**. Required for **Call** from Leads (or send `agentId` in make-call body).

### Call logs and webhook

- Webhook: **URL to Push** in CloudAgent = `https://<your-backend>/webhook/cloudagent-events`.
- Events are stored in **CallLog** and linked to leads by matching phone (digits-only).
- **Calls** page shows logs, filters, search, Play recording, Create Lead.

## Frontend

- **Leads**: **Call** opens a modal: select **Campaign** (from saved Campaign IDs / Default), then **Call**. Needs user’s CloudAgent Agent ID set.
- **Calls**: Real data from `/api/cloudagent/call-logs`; Create Lead redirects to Leads with phone prefilled.

## Security

- API key only on backend. Use HTTPS for webhook in production. Optionally whitelist your server IP with CloudAgent.
