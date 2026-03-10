/**
 * AskEva CRM Lead Sync Service
 * Fetches all leads from AskEva API (apiv2.askeva.io) and syncs to local leads collection.
 * Uses no-cache headers to avoid 304 Not Modified responses.
 */

function getAskevaApiBase() {
  const base = process.env.ASKEVA_API_URL != null ? String(process.env.ASKEVA_API_URL).trim() : ''
  return base.length > 0 ? base : 'https://apiv2.askeva.io'
}

/** Read token at runtime so it works even if .env loads after this module */
function getAskevaApiToken() {
  const a = process.env.ASKEVA_API_TOKEN != null ? String(process.env.ASKEVA_API_TOKEN).trim() : ''
  const w = process.env.WHATSAPP_API_KEY != null ? String(process.env.WHATSAPP_API_KEY).trim() : ''
  return a.length > 0 ? a : w.length > 0 ? w : ''
}

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
 * Fetch all leads from AskEva API
 * @returns {Promise<{ success: boolean, data?: Array, error?: string }>}
 */
export async function fetchAskEvaLeads() {
  const token = getAskevaApiToken()
  if (!token) {
    return {
      success: false,
      error: 'Add WHATSAPP_API_KEY (or ASKEVA_API_TOKEN) in backend/.env and restart the server.',
    }
  }

  const base = getAskevaApiBase().replace(/\/$/, '')
  const userId = process.env.ASKEVA_USER_ID != null ? String(process.env.ASKEVA_USER_ID).trim() : ''

  const cacheHeaders = {
    'Accept': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  }

  const urlVariants = []
  urlVariants.push(`${base}/v1/lead-configuration/leads`)
  if (userId.length > 0) {
    urlVariants.push(`${base}/v1/users/${encodeURIComponent(userId)}/lead-configuration/leads`)
    urlVariants.push(`${base}/v1/lead-configuration/leads?userId=${encodeURIComponent(userId)}`)
    urlVariants.push(`${base}/v1/users/${encodeURIComponent(userId)}/leads`)
  }

  const authStrategies = [
    { headers: { 'Authorization': `Bearer ${token}` } },
    { headers: { 'X-API-Key': token } },
    { headers: { 'X-WhatsApp-API-Key': token } },
    { headers: { 'Authorization': `Bearer ${token}`, 'X-API-Key': token } },
  ]
  if (userId.length > 0) {
    authStrategies.push({ headers: { 'X-API-Key': token, 'X-User-Id': userId } })
    authStrategies.push({ headers: { 'X-WhatsApp-API-Key': token, 'X-User-Id': userId } })
  }

  const cacheBust = () => `_t=${Date.now()}`
  const tryFetch = async (url, headers) => {
    const fullUrl = url + (url.includes('?') ? '&' : '?') + cacheBust()
    return fetch(fullUrl, { method: 'GET', headers: { ...cacheHeaders, ...headers }, cache: 'no-store' })
  }

  try {
    let res = null
    outer: for (const url of urlVariants) {
      for (const strategy of authStrategies) {
        res = await tryFetch(url, strategy.headers)
        if (res.ok) break outer
        if (res.status !== 401 && res.status !== 403) break outer
      }
    }

    if (!res || !res.ok) {
      const text = await res?.text() || 'No response'
      const status = res?.status
      const is403 = status === 403
      const is304 = status === 304
      let hint = ''
      if (is403) hint = ' AskEva returned 403: ensure your API key can read leads. In AskEva dashboard look for an API/Integration token with "read leads" (or ask support for the correct endpoint and auth for GET leads).'
      else if (is304) hint = ' AskEva returned 304 Not Modified (cached). Sync uses cache-busting; if this persists, try Sync AskEva again in a few seconds.'
      return {
        success: false,
        error: `AskEva API error ${status || 'unknown'}: ${text || res?.statusText || 'Unknown'}${hint}`,
      }
    }

    const json = await res.json()
    const leads = json.data || json
    return { success: true, data: Array.isArray(leads) ? leads : [] }
  } catch (err) {
    console.error('[AskEva Sync] Fetch error:', err.message)
    return {
      success: false,
      error: err.message || 'Failed to fetch from AskEva API',
    }
  }
}

/**
 * Sync AskEva leads into local Lead collection
 * @param {object} deps - { Lead, Branch, autoAssignLeadToBranchUser }
 * @returns {Promise<{ success: boolean, created: number, updated: number, skipped: number, error?: string }>}
 */
export async function syncAskEvaLeadsToDb(deps) {
  const { Lead, Branch, autoAssignLeadToBranchUser } = deps
  const result = { success: false, created: 0, updated: 0, skipped: 0 }

  const fetchResult = await fetchAskEvaLeads()
  if (!fetchResult.success) {
    result.error = fetchResult.error
    return result
  }

  const askevaLeads = fetchResult.data || []
  const defaultBranch = await Branch.findOne({ name: 'Anna Nagar' })
  const defaultBranchId = defaultBranch?._id || null

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

  result.success = true
  return result
}
