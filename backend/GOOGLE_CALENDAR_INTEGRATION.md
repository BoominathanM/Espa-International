# Google Calendar Integration (Appointment Bookings)

Two-way sync between CRM appointments and one Google Calendar per branch, signed in either as a **Google account**
(OAuth "Desktop app" client + one-time sign-in) or as a **service account**.
Everything is configured in `backend/.env`; nothing happens until `GOOGLE_CALENDAR_SYNC_ENABLED=true`.

## What syncs

| CRM | Google Calendar |
|---|---|
| Appointment booked (CRM, website, import, AskEva, WhatsApp lead given a date) | Event in the branch's calendar |
| Edit / Reschedule | Event updated / moved |
| Branch changed | Event moves to the other branch's calendar |
| Cancel | Event kept, title `❌ CANCELLED – …`, grey |
| Complete | Event kept, title `✅ …`, green |
| Lead deleted | Event deleted |

| Google Calendar | CRM |
|---|---|
| Event moved to another day / time | Rescheduled (history + activity log; odd times kept exactly, e.g. `10:30 AM - 12:30 PM`) |
| Event deleted | Appointment cancelled ("Cancelled from Google Calendar") — completed ones stay completed |
| Event moved to another branch's calendar | Appointment's branch changed |
| New event titled exactly `Name - Phone` (e.g. `Priya - 9876543210`) | New appointment, round-robin assigned. Other titles are ignored |

- Event title: `Spa package – Customer name`; details: phone, assigned staff, branch; location: branch address; pop-up reminder.
- Unreadable slots (blank / unusual text) become all-day events.
- Only appointments from **today onwards** get new events (existing ones are backfilled on start-up).
- Title / description edits made in Google are ignored. Moving a completed / cancelled appointment in Google is undone.
- Branch booking limit (Branch Configuration → **Max bookings at the same time**, empty = no limit): a move in Google
  into a full slot is undone (reason in the appointment's activity), and a `Name - Phone` event in a full slot is not
  booked — it is retitled `⚠️ NOT BOOKED – …` with the reason. The CRM's own Add / Edit / Reschedule refuse it too
  (`utils/appointmentCapacity.js`). Website / AskEva / WhatsApp / import bookings are not refused.
- Google failures never block a CRM save; they are retried automatically (Settings shows failures).

## Google setup

1. console.cloud.google.com → create a project → **APIs & Services → Library → Google Calendar API → Enable**.
2. Pick **one** way to sign in:
   - **Google account (OAuth)** — the sync acts as one Google account; calendars it owns need no sharing.
     1. **Google Auth Platform → Branding**: app name, support email, your website's home page / privacy policy /
        terms links and its domain (no logo — a logo needs Google's review). **Audience**: External →
        **Publish app** so it shows *In production* (left in *Testing*, Google expires the sign-in after 7 days and the
        sync stops). Google's "needs verification" notice can be ignored — only the one signing-in account sees a warning.
     2. **Credentials → Create credentials → OAuth client ID → Desktop app** → download the JSON → save it in `backend/`
        as `google-oauth-client.json` (git-ignored).
     3. In `backend/` run `npm run google-calendar:auth`, sign in with the account that owns the branch calendars
        ("Google hasn't verified this app" → Advanced → Go to …). It saves `GOOGLE_OAUTH_REFRESH_TOKEN` and
        `GOOGLE_OAUTH_ACCOUNT_EMAIL` to `.env` and lists the calendars with their IDs
        (`npm run google-calendar:auth -- --list` lists them again; `-- --print` shows the token instead of writing `.env`,
        e.g. to copy it to the server's `.env` — the server needs no browser).
   - **Service account** — **IAM & Admin → Service Accounts → Create** (no roles) → **Keys → Add key → JSON** → save the file
     in `backend/` as `google-service-account.json` (git-ignored).
3. In Google Calendar create one calendar per branch (+ a TEST calendar for a server with its **own** test database —
   see "Several servers, one database").
4. Each calendar → **Settings and sharing → Share with specific people** → add the account the sync signs in as
   (the OAuth account, or the service account `…@….iam.gserviceaccount.com`) with **Make changes to events**.
   Not needed for calendars the OAuth account owns.
5. Each calendar → **Integrate calendar → Calendar ID** → put it in `.env`.

## backend/.env

```env
GOOGLE_CALENDAR_SYNC_ENABLED=true

# Google account (OAuth) — used whenever GOOGLE_OAUTH_REFRESH_TOKEN is set
GOOGLE_OAUTH_CLIENT_FILE=google-oauth-client.json
# or instead of the file: GOOGLE_OAUTH_CLIENT_ID= / GOOGLE_OAUTH_CLIENT_SECRET=
# Both written by npm run google-calendar:auth (the email is for display only)
GOOGLE_OAUTH_REFRESH_TOKEN=
GOOGLE_OAUTH_ACCOUNT_EMAIL=

# Service account
# GOOGLE_SERVICE_ACCOUNT_KEY_FILE=google-service-account.json
# or instead of the file:
# GOOGLE_SERVICE_ACCOUNT_EMAIL=crm-sync@your-project.iam.gserviceaccount.com
# GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# One calendar per branch: GOOGLE_CALENDAR_ID_ + branch name in CAPITALS, spaces -> _
GOOGLE_CALENDAR_ID_ANNA_NAGAR=
GOOGLE_CALENDAR_ID_BANGALORE=
GOOGLE_CALENDAR_ID_COIMBATORE=
GOOGLE_CALENDAR_ID_MEDAVAKKAM=
GOOGLE_CALENDAR_ID_VALLAKKOTTAI=
GOOGLE_CALENDAR_ID_ESPA_HEAD_OFFICES_TAMBARAM=
GOOGLE_CALENDAR_ID_ESPA_PONDICHERRY=

# Optional
# Used by any branch without its own ID (a server with its own test database: set ONLY this, to the TEST calendar)
GOOGLE_CALENDAR_ID_DEFAULT=
# Instant Google -> CRM updates (public HTTPS only; without it changes are picked up every 2 min).
# Set it only on the server that should run the sync — see "Several servers, one database".
GOOGLE_CALENDAR_WEBHOOK_URL=https://crm.espainternational.co.in/api/google-calendar/webhook
GOOGLE_CALENDAR_SERVER_NAME=crm.espainternational.co.in
GOOGLE_CALENDAR_REMINDER_MINUTES=30
GOOGLE_CALENDAR_POLL_MS=120000
```

Branch names come from Branch Configuration; **Settings → API & Integrations → Google Calendar** lists the exact
variable name for every branch, what was picked up, a **Test connection** button and sync health.

## Several servers, one database

Servers that share one MongoDB (localhost, the dev server and production all use the same `e-spa` database) must use
the **same** calendar IDs and the same Google sign-in. Only one of them runs the sync at a time — the one holding the
sync lease (`GoogleCalendarSyncLease`, renewed every 30 s, free again 3 min after its holder stops):

- A server with `GOOGLE_CALENDAR_WEBHOOK_URL` (the dev / production server — instant updates) takes the lease over from
  one without (localhost). With both running, the dev server syncs and localhost is passive.
- A passive server still marks its own saves as pending; the active server pushes them (within ~2 min).
- Appointments saved on a server without the sync (e.g. production on older code) are found by `updatedAt` every cycle;
  events of appointments deleted there are removed by a sweep every 6 h (and on **Sync now**).
- Settings → Google Calendar shows which server is active. Name a server with `GOOGLE_CALENDAR_SERVER_NAME`
  (default `host:port`); give each server its own name.

Never point servers with **different** databases at the same calendar — each would act on the same Google changes.

## Deploying

1. Deploy backend + frontend (no new npm packages). The OAuth client JSON is git-ignored: on a server use
   `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (they win over `GOOGLE_OAUTH_CLIENT_FILE`), plus the same
   refresh token, email and calendar IDs as localhost.
   `GOOGLE_CALENDAR_WEBHOOK_URL` and `GOOGLE_CALENDAR_SERVER_NAME` go **only** in the .env of the server that should run
   the sync — never in localhost's (it would compete with that server; Settings shows a warning if two share a name).
2. Restart; the log shows `[GoogleCalendar] sync is on — Google account …` and which server is active.
3. Settings → API & Integrations → Google Calendar → **Test connection** (all OK) and check the sync server.

A server without `GOOGLE_CALENDAR_SYNC_ENABLED=true` (e.g. production for now) is unaffected: no Google calls, no
calendar fields written; the sync server still picks up its appointment changes from the shared database.

## Endpoints

- `POST /api/google-calendar/webhook` — Google push notifications (public, verified by channel token)
- `GET /api/google-calendar/status`, `POST /api/google-calendar/test`, `POST /api/google-calendar/sync-now` — Super Admin

## Code

`services/googleCalendar/` (config, client, eventMapper, calendarMap, outboundSync = CRM→Google,
inboundSync = Google→CRM, leader = which server syncs, index = start-up / status); sign-in script
`scripts/googleCalendarAuth.js`. Lead hooks in `models/Lead.js` raise changes through `utils/leadChangeEvents.js`; the link is stored on the lead as `googleCalendar` and per-calendar state in
`GoogleCalendarSyncState`.
