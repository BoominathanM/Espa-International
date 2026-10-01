/**
 * "Send feedback call" button — ZenXAI FEEDBACK assistant calls a customer on demand.
 *
 *   POST /api/leads/:id/feedback-call       Appointment Bookings (action menu + detail page)
 *   POST /api/customers/:id/feedback-call   Customer Management (action menu + details modal)
 *
 * Each press creates a zenxaifeedbackcalls row (models/ZenxaiFeedbackCall.js) and asks ZenXAI's
 * feedback assistant to call the customer's mobile. ZenXAI's webhook events are matched back to
 * that row (findManualFeedbackCall, used by handleZenxaiApiEvent), and once the call ends its
 * result is written as ONE note: the appointment's Notes tab, or the customer's Timeline Notes.
 * The responses themselves are served to both modules by the *FeedbackCalls endpoints at the
 * bottom, which also catch up on results the webhook never applied (syncFeedbackCall).
 * Replaces the old automatic feedback call after an answered AI call-back (now opt-in only).
 */
import mongoose from 'mongoose'
import Lead from '../models/Lead.js'
import Customer from '../models/Customer.js'
import ZenxaiFeedbackCall from '../models/ZenxaiFeedbackCall.js'
import ZenxaiWebhookEvent from '../models/ZenxaiWebhookEvent.js'
import TeleCMICallLog from '../models/TeleCMICallLog.js'
import { canAccessBranch } from '../utils/branchAccess.js'
import { placeManualZenxaiFeedbackCall, fetchZenxaiCall } from '../services/zenxaiMissedCallService.js'
import { toTeleCMINumber } from '../services/telecmiAgentCallService.js'

const LOG = '[ZENXAI-FEEDBACK]'
const RESULT_NOTE_AUTHOR = 'ZenXAI Feedback'
// Statuses after which the call is over (ours: 'failed' / 'skipped' when it was never placed).
const DONE_STATUSES = ['completed', 'no_answer', 'busy', 'failed', 'cancelled', 'skipped']
// A second press for the same number while the first call is still running is refused for this long.
const REPEAT_GUARD_MS = 2 * 60 * 1000
const NOT_CONFIGURED = 'ZENXAI_FEEDBACK_API_KEY/ZENXAI_FEEDBACK_API_ASSISTANT_ID'

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''))

/** "+91XXXXXXXXXX" for the first dialable value ("0XXXXXXXXXX", "a / b", spaced, …), else ''. */
const dialablePhone = (...values) => {
  for (const v of values) {
    const n = toTeleCMINumber(v)
    if (n) return `+${n}`
  }
  return ''
}

/** What the UI needs about one button-placed feedback call. */
export const shapeFeedbackCall = (fb) => ({
  _id: fb._id,
  origin: fb.origin,
  phone: fb.phone,
  customerName: fb.customerName,
  status: fb.status,
  zenxaiCallId: fb.zenxaiCallId,
  requestedAt: fb.requestedAt,
  requestedByName: fb.requestedByName,
})

// Numbers with a request being placed right now — the DB check below can't see a row that the
// other request hasn't created yet (two clicks inside the same few ms). In-process only.
const placingNow = new Set()

const requestFeedbackCall = async (req, res, { origin, lead = null, customerId = null, branch = null, name, phones }) => {
  const phone = dialablePhone(...phones)
  if (!phone) {
    return res.status(400).json({ success: false, message: 'No valid mobile number to call' })
  }

  const tail = phone.slice(-10)
  if (placingNow.has(tail)) {
    return res.status(409).json({ success: false, message: 'A feedback call to this number is already being placed' })
  }
  placingNow.add(tail)
  try {
    // A double click, or two staff pressing for the same customer, must not ring them twice.
    const running = await ZenxaiFeedbackCall.findOne({
      phone: new RegExp(`${tail}$`),
      requestedAt: { $gte: new Date(Date.now() - REPEAT_GUARD_MS) },
      status: { $nin: DONE_STATUSES },
    }).lean()
    if (running) {
      return res.status(409).json({
        success: false,
        message: 'A feedback call to this number was placed just now — wait for it to finish before sending another',
      })
    }

    const fb = await ZenxaiFeedbackCall.create({
      origin,
      lead: lead?._id || null,
      customer: customerId || null,
      branch: branch || null,
      customerName: name || '',
      phone,
      requestedBy: req.user?._id || null,
      requestedByName: req.user?.name || '',
      requestedAt: new Date(),
    })

    let result
    try {
      result = await placeManualZenxaiFeedbackCall(fb)
    } catch (err) {
      const errText = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message
      await ZenxaiFeedbackCall.updateOne(
        { _id: fb._id },
        { $set: { status: 'failed', error: String(errText).slice(0, 500) } }
      ).catch(() => {})
      const zenxaiMsg = err.response?.data?.error?.message || err.response?.data?.message || ''
      return res.status(502).json({
        success: false,
        message: `ZenXAI did not accept the feedback call${zenxaiMsg ? `: ${zenxaiMsg}` : ''}`,
      })
    }

    if (result?.skipped) {
      const missing = result.missing || []
      await ZenxaiFeedbackCall.updateOne({ _id: fb._id }, { $set: { status: 'skipped', error: missing.join(', ') } })
      const notConfigured = missing.includes(NOT_CONFIGURED)
      return res.status(notConfigured ? 503 : 400).json({
        success: false,
        message: notConfigured
          ? 'AI feedback call is not configured on the server (ZenXAI feedback assistant key / id missing)'
          : `Feedback call not placed: ${missing.join(', ')}`,
      })
    }

    // A webhook event may already have bound the call and moved its status on — never undo that.
    const status = String(result?.data?.status || 'queued')
    await ZenxaiFeedbackCall.updateOne({ _id: fb._id, status: 'requested' }, { $set: { status } })
    if (result?.zenxaiCallId) {
      await ZenxaiFeedbackCall.updateOne({ _id: fb._id, zenxaiCallId: '' }, { $set: { zenxaiCallId: result.zenxaiCallId } })
    }

    if (lead) {
      // updateOne, not save(): an old Lead failing today's validation must not hide a call that was placed.
      await Lead.updateOne(
        { _id: lead._id },
        {
          $push: {
            activityLogs: {
              action: 'AI Feedback Call Sent',
              details: `ZenXAI feedback call to ${phone}`,
              performedBy: req.user?.name || 'User',
            },
          },
        }
      ).catch((err) => console.error(LOG, `activity log on lead ${lead._id} failed:`, err.message))
    }

    console.log(LOG, `${origin} feedback call ${fb._id} placed to ${phone} by ${req.user?.name || '—'} — call_id ${result?.zenxaiCallId || '—'}`)
    const saved = await ZenxaiFeedbackCall.findById(fb._id).lean()
    return res.status(202).json({
      success: true,
      message: `Feedback call placed to ${phone}`,
      feedbackCall: shapeFeedbackCall(saved || fb),
    })
  } finally {
    placingNow.delete(tail)
  }
}

// @route POST /api/leads/:id/feedback-call
export const sendAppointmentFeedbackCall = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Valid appointment id is required' })
    const lead = await Lead.findById(id).select('first_name last_name phone whatsapp branch customer').lean()
    if (!lead) return res.status(404).json({ success: false, message: 'Appointment not found' })
    if (!canAccessBranch(req.user, lead.branch)) {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }
    return await requestFeedbackCall(req, res, {
      origin: 'appointment',
      lead,
      customerId: lead.customer || null,
      branch: lead.branch || null,
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      phones: [lead.phone, lead.whatsapp],
    })
  } catch (error) {
    console.error(LOG, 'appointment feedback call error:', error.message)
    return res.status(500).json({ success: false, message: 'Failed to place feedback call' })
  }
}

// @route POST /api/customers/:id/feedback-call
export const sendCustomerFeedbackCall = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Valid customer id is required' })
    const customer = await Customer.findById(id).select('name phone whatsapp branch').lean()
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' })
    if (!canAccessBranch(req.user, customer.branch)) {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }
    return await requestFeedbackCall(req, res, {
      origin: 'customer',
      customerId: customer._id,
      branch: customer.branch || null,
      name: customer.name || '',
      phones: [customer.phone, customer.whatsapp],
    })
  } catch (error) {
    console.error(LOG, 'customer feedback call error:', error.message)
    return res.status(500).json({ success: false, message: 'Failed to place feedback call' })
  }
}

/* ------------------------------------------------------------------------------------------
 * Results: ZenXAI webhook events (handleZenxaiApiEvent) and on-view sync (syncFeedbackCall)
 * ------------------------------------------------------------------------------------------ */

// ZenXAI statuses after which a call is over (a final status is never replaced by a non-final one).
const ZENXAI_FINAL = new Set(['completed', 'no_answer', 'busy', 'failed', 'cancelled'])
const STATUS_LABELS = {
  completed: 'Answered',
  no_answer: 'Not answered',
  busy: 'Busy / declined',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
// On-view sync: a call still unfinished after API_SYNC_AFTER_MS is asked from ZenXAI directly,
// at most once per API_SYNC_EVERY_MS, and only for calls placed in the last SYNC_WINDOW_MS.
const API_SYNC_AFTER_MS = 60 * 1000
const API_SYNC_EVERY_MS = 60 * 1000
const SYNC_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_SYNC_PER_REQUEST = 5

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** collected_data ({ key: { label, value, heard } }) → answered questions only. */
const feedbackResponses = (collected) =>
  collected && typeof collected === 'object'
    ? Object.entries(collected)
        .map(([key, v]) => ({
          key,
          label: (v && typeof v === 'object' && v.label) || key,
          value: v && typeof v === 'object' ? v.value : v,
        }))
        .filter((r) => r.value !== null && r.value !== undefined && String(r.value).trim() !== '')
        .map((r) => ({ ...r, value: String(r.value) }))
    : []

/** The one note line for a finished feedback call, e.g. "[ZenXAI Feedback · Answered (42s)] Rating: 5 | …". */
export const feedbackNoteLine = (state) => {
  const status = String(state.status || '')
  if (!ZENXAI_FINAL.has(status)) return ''
  if (status === 'completed') {
    const dur = Number(state.durationSec) > 0 ? ` (${state.durationSec}s)` : ''
    const summary = String(state.summary || '').replace(/\s+/g, ' ').trim()
    const answers = feedbackResponses(state.collectedData).map((r) => `${r.label}: ${r.value}`).join(' | ')
    const parts = [answers, summary ? `Summary: ${summary}` : ''].filter(Boolean)
    return `[ZenXAI Feedback · Answered${dur}]${parts.length ? ` ${parts.join(' | ')}` : ''}`
  }
  return `[ZenXAI Feedback · ${STATUS_LABELS[status] || status}]${state.failureReason ? ` ${state.failureReason}` : ''}`
}

/**
 * The button-placed feedback call a ZenXAI event belongs to, or null when it isn't one (then the
 * event goes down the existing TeleCMI call-log path unchanged). Bound call_id first; before our
 * write of the 202 call_id, our own metadata.manualFeedbackId.
 */
export const findManualFeedbackCall = async (data) => {
  const callId = String(data?.call_id || '')
  if (callId) {
    const byCallId = await ZenxaiFeedbackCall.findOne({ zenxaiCallId: callId })
    if (byCallId) return byCallId
  }
  const id = data?.metadata?.manualFeedbackId
  if (isObjectId(id)) {
    const byId = await ZenxaiFeedbackCall.findById(id)
    if (byId && (!byId.zenxaiCallId || !callId || byId.zenxaiCallId === callId)) return byId
  }
  return null
}

const resultNoteTarget = (fb) =>
  fb.origin === 'customer' && fb.customer
    ? { Model: Customer, id: fb.customer, path: 'timelineNoteEntries' }
    : fb.lead
      ? { Model: Lead, id: fb.lead, path: 'appointmentNoteEntries' }
      : null

/**
 * Write (or replace in place) the one result note for a button-placed feedback call: the
 * appointment's Notes tab (appointmentNoteEntries) or the customer's Timeline Notes. Uses
 * targeted updates so an old record failing today's validation can't block it. The first note
 * is claimed on the feedback row before it's added, so two writers (a webhook event and an
 * on-view sync) can never both add one. Never throws.
 * @returns {Promise<boolean>} true when a note was written/updated
 */
export const writeFeedbackResultNote = async (fbId, line) => {
  if (!line) return false
  const fb = await ZenxaiFeedbackCall.findById(fbId).lean()
  if (!fb || line === fb.resultNote) return false
  const target = resultNoteTarget(fb)
  if (!target) return false
  const { Model, id, path } = target
  const replace = async (noteId) => {
    const r = await Model.updateOne(
      { _id: id, [`${path}._id`]: noteId },
      { $set: { [`${path}.$.text`]: line, [`${path}.$.updatedAt`]: new Date() } }
    )
    if (r.matchedCount) await ZenxaiFeedbackCall.updateOne({ _id: fb._id }, { $set: { resultNote: line } })
    return r.matchedCount > 0
  }
  try {
    if (fb.resultNoteId && (await replace(fb.resultNoteId))) return true
    // First result (or staff deleted the earlier note): claim the slot, then add the note.
    const noteId = new mongoose.Types.ObjectId()
    const claim = await ZenxaiFeedbackCall.updateOne(
      { _id: fb._id, resultNoteId: fb.resultNoteId || null },
      { $set: { resultNoteId: noteId, resultNote: line } }
    )
    if (!claim.modifiedCount) {
      // Another writer claimed it a moment ago — update its note once it has been added.
      for (let i = 0; i < 5; i += 1) {
        await sleep(200)
        const cur = await ZenxaiFeedbackCall.findById(fb._id).select('resultNoteId').lean()
        if (cur?.resultNoteId && (await replace(cur.resultNoteId))) return true
      }
      return false
    }
    const r = await Model.updateOne(
      { _id: id },
      {
        $push: { [path]: { _id: noteId, text: line, performedBy: RESULT_NOTE_AUTHOR } },
        $set: { lastInteraction: new Date() },
      }
    )
    if (!r.matchedCount) {
      await ZenxaiFeedbackCall.updateOne({ _id: fb._id, resultNoteId: noteId }, { $set: { resultNoteId: null, resultNote: '' } })
      return false
    }
    return true
  } catch (err) {
    console.error(LOG, `result note for feedback call ${fb._id} failed:`, err.message)
    return false
  }
}

/**
 * Apply one ZenXAI call snapshot (a webhook event's `data`, or GET /calls/{id}) to a button-placed
 * feedback call and refresh its result note. A final status is never replaced by a non-final one,
 * a known duration never by ZenXAI's occasional 0, and answers are only ever added.
 */
export const applyFeedbackCallSnapshot = async (fbId, type, data) => {
  const fb = await ZenxaiFeedbackCall.findById(fbId).lean()
  if (!fb || !data || typeof data !== 'object') return { noted: false }
  const set = { lastEvent: type, lastEventAt: new Date() }
  if (data.call_id && !fb.zenxaiCallId) set.zenxaiCallId = String(data.call_id)
  const incoming = String(data.status || '')
  if (incoming && (!ZENXAI_FINAL.has(fb.status) || ZENXAI_FINAL.has(incoming))) set.status = incoming
  if (Number.isFinite(Number(data.attempts)) && Number(data.attempts) >= (fb.attempts || 0)) {
    set.attempts = Number(data.attempts)
  }
  if (data.duration_sec !== null && data.duration_sec !== undefined) {
    const sec = Number(data.duration_sec) || 0
    if (sec > 0 || fb.durationSec === null || fb.durationSec === undefined) set.durationSec = sec
  }
  if (data.ended_reason) set.endedReason = String(data.ended_reason)
  if (data.failure_reason) set.failureReason = String(data.failure_reason)
  if (data.collected_data && typeof data.collected_data === 'object' && Object.keys(data.collected_data).length) {
    set.collectedData = data.collected_data
  }
  if (data.summary) set.summary = String(data.summary)
  if (data.recording_url) set.recordingUrl = String(data.recording_url)
  if (data.ended_at) set.endedAt = new Date(data.ended_at)
  const statusNow = set.status || fb.status
  if (type === 'call.completed' || type === 'call.analysis_ready' || (type === 'api.snapshot' && statusNow === 'completed')) {
    set.conversationAt = new Date()
  }
  await ZenxaiFeedbackCall.updateOne({ _id: fb._id }, { $set: set })
  const noted = await writeFeedbackResultNote(fb._id, feedbackNoteLine({ ...fb, ...set }))
  return { noted, status: statusNow }
}

/** Still worth syncing: placed recently and not finished (or "answered" but with nothing stored yet). */
const needsSync = (fb) =>
  !!fb?.zenxaiCallId &&
  Date.now() - new Date(fb.requestedAt || fb.createdAt).getTime() < SYNC_WINDOW_MS &&
  (!ZENXAI_FINAL.has(fb.status) || (fb.status === 'completed' && !fb.collectedData && !fb.recordingUrl))

/**
 * Bring one button-placed feedback call up to date when someone looks at it:
 *  1) replay webhook events that were stored but never applied to it — e.g. received by a
 *     server still running code without the button (each event row is claimed first, so an
 *     event is applied exactly once even with the webhook handling it at the same time);
 *  2) still unfinished a minute after it was placed: ask ZenXAI (GET /calls/{id}) directly,
 *     at most once a minute — covers a webhook that never arrived.
 * @returns {Promise<boolean>} true when anything was applied
 */
export const syncFeedbackCall = async (fbId) => {
  let fb = await ZenxaiFeedbackCall.findById(fbId).lean()
  if (!needsSync(fb)) return false
  let changed = false

  const unlinked = await ZenxaiWebhookEvent.find({ zenxaiCallId: fb.zenxaiCallId, feedbackCall: null })
    .sort({ eventCreatedAt: 1, createdAt: 1 })
    .lean()
  for (const evt of unlinked) {
    const data = evt.payload?.data
    if (!data || typeof data !== 'object' || evt.type === 'call.test') continue
    const claim = await ZenxaiWebhookEvent.updateOne(
      { _id: evt._id, feedbackCall: null },
      { $set: { feedbackCall: fb._id, lead: fb.lead || null, assistantKind: 'feedback' } }
    )
    if (!claim.modifiedCount) continue
    await applyFeedbackCallSnapshot(fb._id, evt.type, data)
    changed = true
  }
  if (unlinked.length) console.log(LOG, `feedback call ${fb._id}: applied ${unlinked.length} stored event(s) on view`)

  fb = await ZenxaiFeedbackCall.findById(fbId).lean()
  if (needsSync(fb) && Date.now() - new Date(fb.requestedAt || fb.createdAt).getTime() > API_SYNC_AFTER_MS) {
    const claim = await ZenxaiFeedbackCall.updateOne(
      { _id: fb._id, $or: [{ apiSyncedAt: null }, { apiSyncedAt: { $lt: new Date(Date.now() - API_SYNC_EVERY_MS) } }] },
      { $set: { apiSyncedAt: new Date() } }
    )
    if (claim.modifiedCount) {
      const snap = await fetchZenxaiCall(fb.zenxaiCallId, 'feedback')
      const data = snap?.call_id ? snap : snap?.data?.call_id ? snap.data : null
      if (data && String(data.call_id) === fb.zenxaiCallId) {
        await applyFeedbackCallSnapshot(fb._id, 'api.snapshot', data)
        changed = true
        console.log(LOG, `feedback call ${fb._id}: synced from ZenXAI API (status ${data.status || '—'})`)
      }
    }
  }
  return changed
}

/* ------------------------------------------------------------------------------------------
 * Feedback responses for the UI
 *   GET  /api/leads/:id/feedback-calls       appointment detail → Feedback tab
 *   POST /api/leads/feedback-calls           { leadIds } appointment list → Feedbacks tab
 *   GET  /api/customers/:id/feedback-calls   customer details / timeline → Feedback
 * A person's feedback calls are matched by appointment (lead), customer and phone number, so a
 * call placed from either module shows in both. Older automatic feedback calls (stored on
 * TeleCMICallLog.zenxaiFeedback) are included as kind 'auto'.
 * ------------------------------------------------------------------------------------------ */

/** Last-10-digit tails of every number in a phone field ("a / b", "a or b", spaced, +91…). */
const phoneTails = (value) =>
  [String(value ?? ''), ...String(value ?? '').split(/[/,;|]|\s+or\s+/i)]
    .map((part) => part.replace(/\D/g, ''))
    .filter((digits) => digits.length >= 10 && digits.length <= 15)
    .map((digits) => digits.slice(-10))

const tailOf = (value) => String(value ?? '').replace(/\D/g, '').slice(-10)

/** Protocol-relative URL of the authenticated recording proxy (streamZenxaiRecording). */
const recordingProxyUrl = (req, zenxaiCallId) => {
  const host = req?.get?.('host')
  return `${host ? `//${host}` : ''}/api/telecmi/zenxai-recording/${encodeURIComponent(zenxaiCallId)}`
}

/** "402 {"error":{"message":"Insufficient credits"}}" → "Insufficient credits". */
const friendlyError = (error) => {
  const text = String(error || '')
  const m = text.match(/^\d{3}\s+(\{[\s\S]*\})$/)
  if (m) {
    try {
      const body = JSON.parse(m[1])
      return body?.error?.message || body?.message || text
    } catch {
      return text
    }
  }
  return text
}

const shapeButtonCall = (fb, req) => ({
  key: `fb-${fb._id}`,
  id: fb._id,
  kind: 'button',
  origin: fb.origin,
  zenxaiCallId: fb.zenxaiCallId || '',
  status: fb.status || '',
  phone: fb.phone || '',
  phoneTail: tailOf(fb.phone),
  customerName: fb.customerName || '',
  lead: fb.lead || null,
  customer: fb.customer || null,
  requestedByName: fb.requestedByName || '',
  requestedAt: fb.requestedAt || fb.createdAt || null,
  endedAt: fb.endedAt || null,
  durationSec: fb.durationSec ?? null,
  attempts: fb.attempts || 0,
  failureReason: fb.failureReason || (['failed', 'skipped'].includes(fb.status) ? friendlyError(fb.error) : ''),
  summary: fb.summary || '',
  responses: feedbackResponses(fb.collectedData),
  questionsAsked: fb.collectedData && typeof fb.collectedData === 'object' ? Object.keys(fb.collectedData).length : 0,
  recordingUrl: fb.zenxaiCallId && fb.recordingUrl ? recordingProxyUrl(req, fb.zenxaiCallId) : '',
  sortAt: fb.requestedAt || fb.createdAt,
})

/** The older automatic feedback call (after an answered AI call-back), kept on the TeleCMI row. */
const shapeAutoCall = (log, req) => {
  const f = log.zenxaiFeedback || {}
  return {
    key: `auto-${log._id}`,
    id: log._id,
    kind: 'auto',
    origin: 'auto',
    zenxaiCallId: f.callId || '',
    status: f.status || 'queued',
    phone: log.customerNumber || '',
    phoneTail: tailOf(log.customerNumber),
    customerName: log.customerName || '',
    lead: log.lead || null,
    customer: null,
    requestedByName: '',
    requestedAt: f.requestedAt || null,
    endedAt: f.endedAt || null,
    durationSec: f.durationSec ?? null,
    attempts: f.attempts || 0,
    failureReason: f.failureReason || friendlyError(f.error),
    summary: f.summary || '',
    responses: feedbackResponses(f.collectedData),
    questionsAsked: f.collectedData && typeof f.collectedData === 'object' ? Object.keys(f.collectedData).length : 0,
    recordingUrl: f.callId && f.recordingUrl ? recordingProxyUrl(req, f.callId) : '',
    sortAt: f.requestedAt || log.createdAt,
  }
}

const collectFeedbackCalls = async (req, { leadIds = [], customerIds = [], phones = [] }) => {
  const tails = [...new Set(phones.flatMap(phoneTails))]
  const tailRe = tails.length ? new RegExp(`(?:${tails.join('|')})$`) : null
  const who = []
  if (leadIds.length) who.push({ lead: { $in: leadIds } })
  if (customerIds.length) who.push({ customer: { $in: customerIds } })
  if (tailRe) who.push({ phone: tailRe })
  if (!who.length) return []

  let rows = await ZenxaiFeedbackCall.find({ $or: who }).sort({ requestedAt: -1 }).limit(300).lean()
  const stale = rows.filter(needsSync).slice(0, MAX_SYNC_PER_REQUEST)
  if (stale.length) {
    const results = await Promise.allSettled(stale.map((fb) => syncFeedbackCall(fb._id)))
    results
      .filter((r) => r.status === 'rejected')
      .forEach((r) => console.error(LOG, 'sync on view failed:', r.reason?.message || r.reason))
    if (results.some((r) => r.status === 'fulfilled' && r.value)) {
      rows = await ZenxaiFeedbackCall.find({ _id: { $in: rows.map((r) => r._id) } }).lean()
    }
  }

  const autoWho = []
  if (leadIds.length) autoWho.push({ lead: { $in: leadIds } })
  if (tailRe) autoWho.push({ customerNumber: tailRe })
  const autoRows = autoWho.length
    ? await TeleCMICallLog.find({ 'zenxaiFeedback.callId': { $nin: ['', null] }, $or: autoWho })
        .select('customerNumber customerName lead zenxaiFeedback createdAt')
        .sort({ 'zenxaiFeedback.requestedAt': -1 })
        .limit(100)
        .lean()
    : []

  return [...rows.map((fb) => shapeButtonCall(fb, req)), ...autoRows.map((l) => shapeAutoCall(l, req))].sort(
    (a, b) => new Date(b.sortAt || 0) - new Date(a.sortAt || 0)
  )
}

// @route GET /api/leads/:id/feedback-calls
export const getAppointmentFeedbackCalls = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Valid appointment id is required' })
    const lead = await Lead.findById(id).select('phone whatsapp branch customer').lean()
    if (!lead) return res.status(404).json({ success: false, message: 'Appointment not found' })
    if (!canAccessBranch(req.user, lead.branch)) return res.status(403).json({ success: false, message: 'Not allowed' })
    const calls = await collectFeedbackCalls(req, {
      leadIds: [lead._id],
      customerIds: lead.customer ? [lead.customer] : [],
      phones: [lead.phone, lead.whatsapp],
    })
    return res.json({ success: true, calls })
  } catch (error) {
    console.error(LOG, 'appointment feedback calls error:', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load feedback calls' })
  }
}

// @route POST /api/leads/feedback-calls   body: { leadIds: [...] }  (max 500)
export const getFeedbackCallsForLeads = async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body?.leadIds) ? req.body.leadIds : []).map(String).filter(isObjectId))].slice(0, 500)
    if (!ids.length) return res.json({ success: true, byLead: {} })
    const leads = (await Lead.find({ _id: { $in: ids } }).select('phone whatsapp branch customer').lean()).filter((l) =>
      canAccessBranch(req.user, l.branch)
    )
    const calls = await collectFeedbackCalls(req, {
      leadIds: leads.map((l) => l._id),
      customerIds: leads.map((l) => l.customer).filter(Boolean),
      phones: leads.flatMap((l) => [l.phone, l.whatsapp]),
    })
    const byLead = {}
    for (const l of leads) {
      const tails = new Set([l.phone, l.whatsapp].flatMap(phoneTails))
      const customerId = l.customer ? String(l.customer) : ''
      byLead[l._id] = calls.filter(
        (c) =>
          String(c.lead || '') === String(l._id) ||
          (customerId && String(c.customer || '') === customerId) ||
          (c.phoneTail && tails.has(c.phoneTail))
      )
    }
    return res.json({ success: true, byLead })
  } catch (error) {
    console.error(LOG, 'feedback calls for leads error:', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load feedback calls' })
  }
}

// @route GET /api/customers/:id/feedback-calls
export const getCustomerFeedbackCalls = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Valid customer id is required' })
    const customer = await Customer.findById(id).select('phone whatsapp branch').lean()
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' })
    if (!canAccessBranch(req.user, customer.branch)) return res.status(403).json({ success: false, message: 'Not allowed' })
    const calls = await collectFeedbackCalls(req, {
      customerIds: [customer._id],
      phones: [customer.phone, customer.whatsapp],
    })
    return res.json({ success: true, calls })
  } catch (error) {
    console.error(LOG, 'customer feedback calls error:', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load feedback calls' })
  }
}
