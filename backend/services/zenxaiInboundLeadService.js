import Lead from '../models/Lead.js'
import Branch from '../models/Branch.js'
import { autoAssignLeadToBranchUser } from '../utils/leadAssignment.js'

/**
 * Lead side of the ZenXAI INBOUND assistant (see controllers/zenxaiInboundController.js).
 *
 * The caller is matched to an existing Lead by the last 10 digits of their number — the same
 * convention every TeleCMI / ZenXAI lookup uses. An existing Lead is only filled in where it is
 * blank (nothing already set is overwritten). When no Lead exists and the call was answered, a
 * new one is created (source "IVR", like every other call-created lead), placed in the branch the
 * caller asked for — else the website's default branch — and round-robin assigned exactly like
 * website/WhatsApp leads.
 *
 * Env:
 *   ZENXAI_INBOUND_DEFAULT_BRANCH  branch for new leads when the caller's branch can't be matched
 *                                  (default "Espa Head Offices Tambaram", the website default)
 */
const DEFAULT_BRANCH_NAME = 'Espa Head Offices Tambaram'
const EMAIL_RE = /^\S+@\S+\.\S+$/
const BY = 'ZenXAI AI Inbound'

const clean = (value) => {
  const s = String(value ?? '').trim()
  if (!s || /^(not available|unknown|null|undefined|n\/a)$/i.test(s)) return ''
  return s
}

/** The `value` of one collected_data field ({ key: { label, value, heard } }). */
export const collectedValue = (collected, key) => {
  const v = collected?.[key]
  return clean(v && typeof v === 'object' ? v.value : v)
}

const digitsOf = (v) => String(v ?? '').replace(/\D/g, '')

/** Last 10 digits of a phone number, for comparing values that may or may not carry a country code. */
export const phoneTail = (v) => digitsOf(v).slice(-10)

/** A phone as stored on Leads: Indian numbers as their 10 digits (like website leads), others +<digits>. */
export const leadPhoneFrom = (raw) => {
  const d = digitsOf(raw)
  if (!d) return ''
  if (d.length === 10) return d
  if (d.length === 12 && d.startsWith('91')) return d.slice(2)
  if (d.length === 11 && d.startsWith('0')) return d.slice(1)
  return `+${d}`
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Other names callers use for a branch -> a word in that branch's CRM name.
const BRANCH_ALIASES = {
  bengaluru: 'bangalore',
  puducherry: 'pondicherry',
  pondy: 'pondicherry',
  kovai: 'coimbatore',
  oragadam: 'vallakkottai',
}

/** The Branch the caller named ("anna nagar", "Annanagar branch", "Bengaluru"), or null. */
export const resolveBranchByName = async (spoken) => {
  let wanted = normName(spoken)
  if (!wanted) return null
  for (const [alias, target] of Object.entries(BRANCH_ALIASES)) {
    if (wanted.includes(alias) && !wanted.includes(target)) wanted = wanted.replace(alias, target)
  }
  const branches = await Branch.find({}).select('_id name').lean()
  const exact = branches.find((b) => normName(b.name) === wanted)
  if (exact) return exact
  if (wanted.length < 4) return null
  // "Tambaram" -> "Espa Head Offices Tambaram", "Anna Nagar branch" -> "Anna Nagar"; only when unambiguous.
  const partial = branches.filter((b) => {
    const n = normName(b.name)
    return n && (n.includes(wanted) || wanted.includes(n))
  })
  return partial.length === 1 ? partial[0] : null
}

const defaultBranch = async () => {
  const name = String(process.env.ZENXAI_INBOUND_DEFAULT_BRANCH || DEFAULT_BRANCH_NAME).trim()
  return name ? Branch.findOne({ name }).select('_id name').lean() : null
}

/**
 * Regex matching a stored phone that ends with these digits, ignoring separators between them.
 * Leads are stored in many shapes — "9876543210", "98765 43210", "+91 98765 43210",
 * "987 654 3210" (≈3.4k of 34k leads have spaces) — and a plain /9876543210$/ misses all the
 * spaced ones, which would create a duplicate Lead for an existing customer.
 */
export const phoneTailRegex = (tail) => new RegExp(`${String(tail).split('').join('\\D*')}\\D*$`)

/** Most recent Lead whose phone ends with the caller's last 10 digits (any formatting). */
export const findLeadByPhone = async (phone) => {
  const tail = phoneTail(phone)
  if (!tail) return null
  return Lead.findOne({ phone: phoneTailRegex(tail) }).sort({ createdAt: -1 })
}

/**
 * Link an inbound AI call to its Lead and keep that call's ONE note line on it up to date.
 *
 * @param {object} call  ZenxaiInboundCall (lean or document)
 * @param {object} opts
 * @param {string} opts.noteLine      the call's note line as of now
 * @param {string} [opts.previousNote] the line written for this call before (replaced in place)
 * @param {boolean} opts.allowCreate  create a Lead when the caller has none
 * @returns {Promise<{ lead: object|null, created: boolean }>}
 */
export const syncLeadForInboundCall = async (call, { noteLine, previousNote = '', allowCreate }) => {
  const collected = call.collectedData || {}
  const email = collectedValue(collected, 'email').toLowerCase()
  const validEmail = EMAIL_RE.test(email) ? email : ''
  const whatsapp = leadPhoneFrom(collectedValue(collected, 'whatsapp_number'))
  const therapy = collectedValue(collected, 'therapy') || collectedValue(collected, 'product_enquiry')
  const spokenBranch = collectedValue(collected, 'branch')
  const name = clean(call.callerName)

  let lead = call.lead ? await Lead.findById(call.lead) : null
  if (!lead) lead = await findLeadByPhone(call.callerPhone)

  if (!lead) {
    const phone = leadPhoneFrom(call.callerPhone)
    if (!allowCreate || !phone) return { lead: null, created: false }

    const [firstName, ...rest] = (name || 'Unknown').split(/\s+/)
    const matchedBranch = await resolveBranchByName(spokenBranch)
    const branch = matchedBranch || (await defaultBranch())
    const assignedTo = branch ? await autoAssignLeadToBranchUser(branch._id) : null
    const productEnquiry = collectedValue(collected, 'product_enquiry')
    const appointment = collectedValue(collected, 'appointment_date_and_time')
    const message = [
      'Enquiry received on the ZenXAI AI inbound line.',
      productEnquiry && `Product enquiry: ${productEnquiry}`,
      appointment && `Requested appointment: ${appointment}`,
      spokenBranch && !matchedBranch && `Preferred branch (as said): ${spokenBranch}`,
    ]
      .filter(Boolean)
      .join('\n')

    lead = await Lead.create({
      first_name: firstName,
      last_name: rest.join(' '),
      email: validEmail,
      phone,
      whatsapp: whatsapp || phone,
      subject: therapy,
      message,
      source: 'IVR',
      branch: branch?._id || null,
      assignedTo: assignedTo || null,
      notes: noteLine || '',
      lastInteraction: new Date(),
      activityLogs: [
        { action: 'Lead Created', details: `Lead "${firstName}" was created from a ZenXAI AI inbound call`, performedBy: BY },
      ],
    })
    return { lead, created: true }
  }

  // Existing Lead: fill blanks only.
  if (name && /^unknown$/i.test(String(lead.first_name || '').trim())) {
    const [firstName, ...rest] = name.split(/\s+/)
    lead.first_name = firstName
    if (!lead.last_name) lead.last_name = rest.join(' ')
  }
  if (validEmail && !lead.email) lead.email = validEmail
  if (whatsapp && !lead.whatsapp) lead.whatsapp = whatsapp
  if (therapy && !lead.subject) lead.subject = therapy
  if (!lead.branch && spokenBranch) {
    const branch = await resolveBranchByName(spokenBranch)
    if (branch) {
      lead.branch = branch._id
      if (!lead.assignedTo) lead.assignedTo = (await autoAssignLeadToBranchUser(branch._id)) || null
    }
  }
  if (noteLine && noteLine !== previousNote) {
    const notes = lead.notes || ''
    lead.notes =
      previousNote && notes.includes(previousNote)
        ? notes.replace(previousNote, () => noteLine) // function form: no "$&"-style expansion of the note text
        : notes
          ? `${notes}\n${noteLine}`
          : noteLine
  }
  if (noteLine && !previousNote) {
    lead.activityLogs.push({ action: 'AI Inbound Call', details: noteLine.slice(0, 500), performedBy: BY })
  }
  lead.lastInteraction = new Date()
  await lead.save()
  return { lead, created: false }
}
