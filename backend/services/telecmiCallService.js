import Lead from '../models/Lead.js'
import Branch from '../models/Branch.js'

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
