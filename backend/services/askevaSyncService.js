/**
 * AskEva CRM Lead Sync Service
 * GET {Backend URL}/v1/leads?token=... on every WhatsApp account (response { success, data }).
 * Deduplicates by askevaLeadId / phone; updates existing leads, creates new ones in the branch of
 * the account they came from.
 */
import { getAskEvaCredentials } from './askevaMessageService.js'
import { accountsForSync, leadBranchFor } from './whatsappAccountService.js'

/**
 * Map AskEva status to our Lead status enum
 */
function mapAskEvaStatus(status) {
  const statusMap = {
    'New Lead': 'New',
    'In Progress': 'In Progress',
    'Follow-Up': 'Follow-Up',
    'Converted': 'Converted',
    'Lost': 'Lost',
    'Cold': 'New',
    'Warm': 'In Progress',
    'Hot': 'Follow-Up',
  }
  return statusMap[status] || 'New'
}

/**
 * Map AskEva source to our Lead source enum
 */
function mapAskEvaSource(source) {
  if (!source) return 'WhatsApp'
  const s = String(source).toLowerCase()
  if (s.includes('whatsapp')) return 'WhatsApp'
  if (s.includes('website')) return 'Website'
  if (s.includes('facebook')) return 'Facebook'
  if (s.includes('insta') || s.includes('instagram')) return 'Insta'
  if (s.includes('call')) return 'Call'
  if (s.includes('walk')) return 'Walk-in'
  if (s.includes('referral')) return 'Referral'
  if (s.includes('social')) return 'Other'
  return 'WhatsApp'
}

/**
 * Fetch all leads of one WhatsApp account from AskEva v1/leads, with ?token= and Bearer.
 * Response: { success: true, data: [ { id, name, fullMobile, mobile, source, status, ... } ] }
 * @returns {Promise<{ success: boolean, data?: Array, error?: string }>}
 */
export async function fetchAskEvaLeads(account) {
  try {
    const { base, token } = getAskEvaCredentials(account)
    const res = await fetch(`${base}/v1/leads?token=${encodeURIComponent(token)}&_t=${Date.now()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const hint = res.status === 401 || res.status === 403 ? ` Check the API Key of "${account.name}" in WhatsApp Configuration.` : ''
      return { success: false, error: `AskEva v1/leads ${res.status}: ${text || res.statusText || 'Unknown'}${hint}` }
    }
    const json = await res.json()
    const data = json.data != null && Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : [])
    return { success: true, data }
  } catch (err) {
    console.error('[AskEva Sync] Fetch error:', err.message)
    return { success: false, error: err.message || 'Failed to fetch from AskEva API' }
  }
}

/**
 * Sync the AskEva leads of every WhatsApp account into local Lead collection. One account failing
 * doesn't stop the others: result.warning names it.
 * @param {object} deps - { Lead, Branch, autoAssignLeadToBranchUser }
 * @returns {Promise<{ success: boolean, created: number, updated: number, skipped: number, error?: string, warning?: string }>}
 */
export async function syncAskEvaLeadsToDb(deps) {
  const result = { success: false, created: 0, updated: 0, skipped: 0 }

  const accounts = await accountsForSync()
  if (!accounts.length) {
    result.error = 'Add a WhatsApp account (Backend URL + API Key) in Settings → WhatsApp API → WhatsApp Configuration.'
    return result
  }

  const failures = []
  for (const account of accounts) {
    const fetchResult = await fetchAskEvaLeads(account)
    if (!fetchResult.success) {
      failures.push(`${account.name}: ${fetchResult.error}`)
      continue
    }
    await saveLeads(fetchResult.data || [], await leadBranchFor(account), deps, result)
    result.success = true
  }

  if (!result.success) result.error = failures.join('; ')
  else if (failures.length) result.warning = `Not synced — ${failures.join('; ')}`
  return result
}

async function saveLeads(askevaLeads, defaultBranchId, { Lead, autoAssignLeadToBranchUser }, result) {
  for (const row of askevaLeads) {
    const askevaId = String(row.id || '')
    const name = String(row.name || '').trim()
    const mobile = String(row.fullMobile || row.mobile || '').trim()

    if (!name || !mobile) {
      result.skipped++
      continue
    }

    const nameParts = name.split(' ')
    const firstName = nameParts[0] || 'Unknown'
    const lastName = nameParts.slice(1).join(' ') || ''

    // Check existing by askevaLeadId or phone
    let existing = null
    if (askevaId) {
      existing = await Lead.findOne({ askevaLeadId: askevaId })
    }
    if (!existing && mobile) {
      existing = await Lead.findOne({ $or: [{ phone: mobile }, { whatsapp: mobile }] })
    }

    const leadDate = row.leadDate || row.createdAt
    const lastInteraction = leadDate ? new Date(leadDate) : new Date()
    const emailVal = (row.email || '').trim()
    const validEmail = /^\S+@\S+\.\S+$/.test(emailVal) ? emailVal : ''
    const leadData = {
      first_name: firstName,
      last_name: lastName,
      email: validEmail,
      phone: mobile,
      whatsapp: mobile,
      subject: 'Synced from AskEva CRM',
      message: row.description || `Synced from AskEva: ${row.source || 'WhatsApp'}`,
      source: mapAskEvaSource(row.source),
      status: mapAskEvaStatus(row.status),
      branch: defaultBranchId,
      lastInteraction,
      askevaLeadId: askevaId,
      notes: row.description ? `AskEva Lead ID: ${askevaId}\n${row.description}` : `AskEva Lead ID: ${askevaId}`,
    }

    if (existing) {
      existing.first_name = leadData.first_name
      existing.last_name = leadData.last_name
      existing.email = leadData.email || existing.email
      existing.phone = leadData.phone
      existing.whatsapp = leadData.whatsapp
      existing.message = leadData.message
      existing.source = leadData.source
      existing.status = leadData.status
      existing.lastInteraction = leadData.lastInteraction
      existing.askevaLeadId = askevaId
      existing.notes = leadData.notes
      await existing.save()
      result.updated++
    } else {
      // Auto-assign
      if (defaultBranchId) {
        const assignedId = await autoAssignLeadToBranchUser(defaultBranchId)
        leadData.assignedTo = assignedId
      }
      await Lead.create(leadData)
      result.created++
    }
  }
}
