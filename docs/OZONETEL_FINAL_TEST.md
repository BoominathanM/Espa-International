# Ozonetel integration – final test

Use this for your final run. It lists what we need from you, what you need to do, and what was cleaned in code.

---

## 1. What we need from you (details)

Please have these ready; the integration cannot be fully tested without them.

| # | What we need | Where you get it | Used for |
|---|----------------|------------------|----------|
| 1 | **CloudAgent Base URL** | Usually `https://cloudagent.ozonetel.com` | Backend calls Click-to-Call API |
| 2 | **CloudAgent API Key** | CloudAgent Admin → Settings → Admin Settings | Authenticate API requests |
| 3 | **Default Campaign name or ID** | Your CloudAgent campaign (e.g. `E-Spa International` or `Inb_918065480464`) | Default campaign for outbound calls |
| 4 | **Campaign / Agent IDs list** | Your 6 IDs (e.g. Inb_918065480464, …) | Shown in Leads “Make Call” dropdown |
| 5 | **CloudAgent Agent ID per user** | CloudAgent Admin → Campaign → Agents (one ID per CRM user who will click Call) | So each user is identified when making calls |
| 6 | **Your backend base URL (production)** | e.g. `https://espa-international.onrender.com` | So you can set Webhook “URL to Push” in CloudAgent |
| 7 | **Server public IP (if CloudAgent requires whitelist)** | Run `curl ifconfig.me` from the server (or ask your host) | Give to CloudAgent support for IP allowlist |

You do **not** need to share API keys or passwords in this doc; just confirm you have (1)–(7) and where you will store them (e.g. CRM Ozonetel Integration settings + User Management).

---

## 2. What you need to do (step-by-step)

### A. In the CRM (Super Admin)

1. **Settings → API & Integrations → Ozonetel Integration**
   - Base URL: `https://cloudagent.ozonetel.com` (or the URL from CloudAgent).
   - API Key: paste your CloudAgent API key.
   - Integration Status: **Active**.
   - Default Campaign: one campaign name/ID (e.g. `Inb_918065480464` or `E-Spa International`).
   - Campaign / Agent IDs: paste your 6 IDs, **one per line**.
   - Click **Save Configuration**.

2. **Settings → User Management**
   - For each user who will use **Call** from Leads: **Edit** → set **CloudAgent Agent ID** (from CloudAgent) → Save.

### B. In CloudAgent (Ozonetel)

3. **Campaign Settings → URL to Push**
   - Set to: `https://<your-backend-host>/webhook/cloudagent-events`  
     Example: `https://espa-international.onrender.com/webhook/cloudagent-events`
   - Save.

4. **(If they ask)** Give your server’s public IP to CloudAgent for whitelisting.

### C. Test in the CRM

5. **Leads** → open a lead with a phone number → click **Call**.
   - “Make Call” modal opens with Lead name, Phone, and **Campaign** dropdown.
   - Select a campaign (or keep default) → click **Call**.
   - Expect: “Call initiated…” or a clear error from the API.

6. **Calls** → confirm call logs appear (after real calls or after webhook events).
   - Use filters/search; use **Create Lead** if needed; use **Play** if recording URL is present.

7. Optional: Make a test call to a number that already exists as a lead; after webhook runs, that call log should show “Lead Linked: Yes”.

---

## 3. What was cleaned / fixed (developer side)

- **Calls page**: Removed unused `canDelete` import.
- **cloudAgentApi**: `getCampaigns` now only provides tag `OzonetelSettings` (removed unnecessary `CallLog`).
- **Docs**: `CLOUDAGENT_INTEGRATION.md` updated to match current behaviour (Ozonetel Settings UI, GET campaigns, campaign dropdown).  
- **No files removed**: All Ozonetel-related files are in use (models, controllers, routes, frontend API, Settings tab, Leads call modal, Calls page).
- **Webhook**: Lead linking uses digits-only phone matching so different formats still link to the same lead.
- **Settings**: Ozonetel tab only loads when user is Super Admin; non–Super Admin sees a clear message and no 403.

---

## 4. If something fails

- **“CloudAgent is not configured”** → Add API Key (and Default Campaign) in **Settings → Ozonetel Integration** and set Integration **Active**.
- **“Agent ID is required”** → Set **CloudAgent Agent ID** for the logged-in user in **User Management**.
- **“Campaign is required”** → Set **Default Campaign** in Ozonetel Integration or choose a campaign in the “Make Call” modal.
- **Call logs not appearing** → Check webhook URL in CloudAgent; confirm backend is reachable; check backend logs for `POST /webhook/cloudagent-events`.
- **Lead not linked to call** → Ensure lead’s phone (digits only) matches the webhook’s customer number (digits only).

For API details and endpoints, see **CLOUDAGENT_INTEGRATION.md**.
