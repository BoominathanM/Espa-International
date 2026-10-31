import Lead from '../models/Lead.js'
import Branch from '../models/Branch.js'
import User from '../models/User.js'
import { autoAssignLeadToBranchUser } from '../utils/leadAssignment.js'
import { findLeadByPhone, leadPhoneFrom, phoneTail, phoneTailRegex } from './zenxaiInboundLeadService.js'

const NOT_AVAILABLE = 'not available'

const cleanValue = (value) => {
  const s = String(value ?? '').trim()
  if (!s || s.toLowerCase() === NOT_AVAILABLE || s.toLowerCase() === 'unknown') return ''
  return s
}

const resolveBranchId = async (branchNameRaw) => {
  const branchName = cleanValue(branchNameRaw)
  if (!branchName) return null
  const escaped = branchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const branch = await Branch.findOne({ name: new RegExp(`^${escaped}$`, 'i') })
    .select('_id')
    .lean()
  return branch?._id || null
}

/**
 * Create or update a Lead by phone number, used by TeleCMI's native CDR webhook.
 */
export const createOrUpdateLeadFromPhone = async ({ phone, name, whatsapp, service, branchName, noteLine }) => {
  try {
    const cleanPhone = cleanValue(phone)
    if (!cleanPhone) {
      return { success: false, error: 'No phone number in payload' }
    }

    const cleanName = cleanValue(name) || 'Unknown'
    const cleanWhatsapp = cleanValue(whatsapp)
    const cleanService = cleanValue(service)
    const branchId = await resolveBranchId(branchName)

    let lead = await Lead.findOne({ phone: cleanPhone })

    if (!lead) {
      lead = await Lead.create({
        first_name: cleanName,
        phone: cleanPhone,
        whatsapp: cleanWhatsapp,
        subject: cleanService,
        source: 'IVR',
        branch: branchId,
        notes: noteLine || '',
      })
    } else {
      if (branchId && !lead.branch) lead.branch = branchId
      if (cleanWhatsapp && !lead.whatsapp) lead.whatsapp = cleanWhatsapp
      if (cleanService && !lead.subject) lead.subject = cleanService
      if (noteLine) lead.notes = lead.notes ? `${lead.notes}\n${noteLine}` : noteLine
      lead.lastInteraction = new Date()
      await lead.save()
    }

    return { success: true, lead }
  } catch (error) {
    console.error('[TELECMI] createOrUpdateLeadFromPhone error:', error.message)
    return { success: false, error: error.message }
  }
}

/** Staff and branch phones ring our own DIDs too (and test calls do): those callers are no lead. */
const isOurOwnPhone = async (tail) => {
  const branches = await Branch.find({}).select('phone telecmiNumber').lean()
  if (branches.some((b) => phoneTail(b.phone) === tail || phoneTail(b.telecmiNumber) === tail)) return true
  return !!(await User.exists({ phone: phoneTailRegex(tail) }))
}

/**
 * Tie an inbound call to the branch whose DID was dialled and to the caller's Lead. A caller with
 * no Lead gets one, missed calls included: the AI call-back's result is only kept on a Lead. An
 * existing Lead keeps its branch (filled in only when blank) and the note is added once per call.
 *
 * @param {object} call
 * @param {string|number} call.did     the DID dialled (`virtual_number`)
 * @param {string|number} call.caller  the caller's number
 * @param {string} call.status         'answered' | 'missed'
 * @param {number} [call.seconds]      talk time
 * @returns {Promise<{ branch: object|null, lead: object|null }>} never throws
 */
export const linkInboundCall = async ({ did, caller, status, seconds }) => {
  let branch = null
  try {
    const didTail = phoneTail(did)
    if (didTail) {
      const numbered = await Branch.find({ telecmiNumber: { $nin: ['', null] } }).select('_id name telecmiNumber').lean()
      branch = numbered.find((b) => phoneTail(b.telecmiNumber) === didTail) || null
      if (!branch) console.warn('[TELECMI] inbound DID has no branch — set it in Branch Configuration:', did)
    }

    const tail = phoneTail(caller)
    if (tail.length !== 10 || (await isOurOwnPhone(tail))) return { branch, lead: null }

    const noteLine = `[TeleCMI Inbound Call] ${status === 'answered' ? `${seconds || 0}s` : 'Missed'}${branch ? ` — ${branch.name}` : ''}`
    let lead = await findLeadByPhone(caller)
    if (!lead) {
      const phone = leadPhoneFrom(caller)
      lead = await Lead.create({
        first_name: 'Unknown',
        phone,
        whatsapp: phone,
        source: 'IVR',
        branch: branch?._id || null,
        assignedTo: branch ? await autoAssignLeadToBranchUser(branch._id) : null,
        notes: noteLine,
        lastInteraction: new Date(),
        activityLogs: [{ action: 'Lead Created', details: `Lead was created from an inbound call${branch ? ` to ${branch.name}` : ''}`, performedBy: 'TeleCMI' }],
      })
      return { branch, lead }
    }

    if (branch && !lead.branch) {
      lead.branch = branch._id
      if (!lead.assignedTo) lead.assignedTo = (await autoAssignLeadToBranchUser(branch._id)) || null
    }
    lead.notes = lead.notes ? `${lead.notes}\n${noteLine}` : noteLine
    lead.lastInteraction = new Date()
    await lead.save()
    return { branch, lead }
  } catch (error) {
    console.error('[TELECMI] linkInboundCall error:', error.message)
    return { branch, lead: null }
  }
}
