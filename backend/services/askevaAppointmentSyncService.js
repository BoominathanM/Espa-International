/**
 * AskEva CRM Appointment Sync Service
 * Calls GET backend.askeva.net/v1/appointments?token=... (Bearer auth).
 * Maps response to local Lead records with appointment_date, slot_time, spa_package.
 * Deduplicates by askevaAppointmentId or phone + appointment_date.
 */

const ASKEVA_APPOINTMENTS_BASE = process.env.ASKEVA_SYNC_API_URL?.trim() || 'https://backend.askeva.net'

function getAskevaApiToken() {
  const a = process.env.ASKEVA_API_TOKEN?.trim() || ''
  const w = process.env.WHATSAPP_API_KEY?.trim() || ''
  return a || w || ''
}

/**
 * Fetch appointments from AskEva v1/appointments API
 * Response: { success: true, data: [ { id, name, phone, appointmentDate, slot, ... } ] }
 */
async function fetchAskEvaAppointments(token) {
  const base = ASKEVA_APPOINTMENTS_BASE.replace(/\/$/, '')
  const path = 'v1/appointments'
  const cacheBust = `_t=${Date.now()}`
  const url = `${base}/${path}?token=${encodeURIComponent(token)}&${cacheBust}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const hint = [401, 403].includes(res.status)
      ? ' Check token in .env (ASKEVA_API_TOKEN or WHATSAPP_API_KEY) matches Postman Bearer.'
      : ''
    return {
      success: false,
      error: `AskEva v1/appointments ${res.status}: ${text || res.statusText}${hint}`,
      data: [],
    }
  }

  const json = await res.json()
  const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
  return { success: true, data }
}

/** Flexible field extraction for various AskEva response shapes */
function pickField(row, ...keys) {
  for (const k of keys) {
    const v = row[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

function parseDate(val) {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Sync AskEva appointments into local Lead collection (leads with appointment_date)
 */
export async function syncAskEvaAppointmentsToDb(deps) {
  const { Lead, Branch, autoAssignLeadToBranchUser } = deps
  const result = { success: false, created: 0, updated: 0, skipped: 0 }

  const token = getAskevaApiToken()
  if (!token) {
    result.error = 'Add WHATSAPP_API_KEY (or ASKEVA_API_TOKEN) in backend/.env — same token as in Postman (v1/appointments?token=).'
    return result
  }

  const fetchResult = await fetchAskEvaAppointments(token)
  if (!fetchResult.success) {
    result.error = fetchResult.error
    return result
  }

  const appointments = fetchResult.data || []
  const defaultBranch = await Branch.findOne({ name: 'Anna Nagar' })
  const defaultBranchId = defaultBranch?._id || null

  for (const row of appointments) {
    const askevaId = String(row.id || row._id || '').trim()
    const name = pickField(row, 'name', 'fullName', 'customerName', 'firstName')
    const lastName = pickField(row, 'lastName', 'last_name')
    const fullName = name ? (lastName ? `${name} ${lastName}` : name) : pickField(row, 'customerName', 'customer')
    const phone = pickField(row, 'phone', 'mobile', 'fullMobile', 'contact', 'customerPhone')
    const appointmentDate = parseDate(row.appointmentDate || row.appointment_date || row.date || row.scheduledDate)
    const slotTime = pickField(row, 'slotTime', 'slot_time', 'slot', 'time', 'timeSlot')
    const spaPackage = pickField(row, 'spaPackage', 'spa_package', 'package', 'service', 'treatment')

    if (!phone) {
      result.skipped++
      continue
    }

    const firstName = fullName ? fullName.split(' ')[0] || 'Customer' : 'Customer'
    const lastNameVal = fullName ? fullName.split(' ').slice(1).join(' ') : ''
    const emailVal = pickField(row, 'email')
    const validEmail = /^\S+@\S+\.\S+$/.test(emailVal) ? emailVal : ''

    let existing = null
    if (askevaId) {
      existing = await Lead.findOne({ askevaAppointmentId: askevaId })
    }
    if (!existing && phone && appointmentDate) {
      const startOfDay = new Date(appointmentDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(appointmentDate)
      endOfDay.setHours(23, 59, 59, 999)
      existing = await Lead.findOne({
        $or: [{ phone: phone }, { whatsapp: phone }],
        appointment_date: { $gte: startOfDay, $lte: endOfDay },
        ...(slotTime ? { slot_time: slotTime } : {}),
      })
    }
    if (!existing && phone) {
      existing = await Lead.findOne({ $or: [{ phone: phone }, { whatsapp: phone }] })
    }

    const leadData = {
      first_name: firstName,
      last_name: lastNameVal,
      email: validEmail,
      phone: phone,
      whatsapp: phone,
      subject: 'Synced from AskEva Appointments',
      message: spaPackage ? `Appointment: ${spaPackage}` : 'Synced from AskEva Appointments',
      source: 'Add',
      status: 'New',
      branch: defaultBranchId,
      appointment_date: appointmentDate || undefined,
      slot_time: slotTime || undefined,
      spa_package: spaPackage || undefined,
      lastInteraction: appointmentDate || new Date(),
      askevaAppointmentId: askevaId || undefined,
      notes: askevaId ? `AskEva Appointment ID: ${askevaId}` : 'Synced from AskEva Appointments',
    }

    if (existing) {
      if (appointmentDate) existing.appointment_date = appointmentDate
      if (slotTime) existing.slot_time = slotTime
      if (spaPackage) existing.spa_package = spaPackage
      if (firstName) existing.first_name = firstName
      if (lastNameVal !== undefined) existing.last_name = lastNameVal
      if (validEmail) existing.email = validEmail
      if (askevaId) existing.askevaAppointmentId = askevaId
      existing.lastInteraction = leadData.lastInteraction
      existing.notes = leadData.notes
      await existing.save()
      result.updated++
    } else {
      if (defaultBranchId) {
        leadData.assignedTo = await autoAssignLeadToBranchUser(defaultBranchId)
      }
      await Lead.create(leadData)
      result.created++
    }
  }

  result.success = true
  return result
}
