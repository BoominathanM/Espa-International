/**
 * Branch <-> Google Calendar mapping, from GOOGLE_CALENDAR_ID_<BRANCH_NAME> (+ GOOGLE_CALENDAR_ID_DEFAULT
 * for branches without their own calendar).
 */
import Branch from '../../models/Branch.js'
import { branchEnvKey, branchCalendarIdFromEnv, getSettings } from './config.js'

const CACHE_MS = 60000
let cache = { at: 0, value: null }

export async function getCalendarMap({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value
  const { defaultCalendarId } = getSettings()
  const branches = await Branch.find().select('name address').sort({ name: 1 }).lean()
  const byBranchId = new Map()
  const branchesByCalendar = new Map() // explicit per-branch calendars only
  const calendars = new Set()
  for (const branch of branches) {
    const explicit = branchCalendarIdFromEnv(branch.name)
    const calendarId = explicit || defaultCalendarId
    byBranchId.set(String(branch._id), {
      branch,
      envKey: branchEnvKey(branch.name),
      calendarId,
      source: explicit ? 'branch' : defaultCalendarId ? 'default' : 'none',
    })
    if (explicit) branchesByCalendar.set(explicit, [...(branchesByCalendar.get(explicit) || []), branch])
    if (calendarId) calendars.add(calendarId)
  }
  if (defaultCalendarId) calendars.add(defaultCalendarId)
  cache = {
    at: Date.now(),
    value: { byBranchId, branchesByCalendar, calendars: [...calendars], defaultCalendarId },
  }
  return cache.value
}

/** Calendar an appointment belongs in ('' = none configured for its branch). */
export function calendarForLead(map, lead) {
  const branchId = lead.branch?._id || lead.branch
  const entry = branchId ? map.byBranchId.get(String(branchId)) : null
  return entry ? entry.calendarId : map.defaultCalendarId || ''
}

/** The one branch whose own calendar this is, or null (default / shared calendar). */
export function branchForCalendar(map, calendarId) {
  const list = map.branchesByCalendar.get(calendarId) || []
  return list.length === 1 ? list[0] : null
}
