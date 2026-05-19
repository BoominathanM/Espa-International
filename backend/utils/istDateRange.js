/** IST offset (UTC+5:30) in milliseconds — matches Ozonetel call timestamp handling. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Start of calendar day in IST for a YYYY-MM-DD string (inclusive).
 */
export function parseIstDayStart(dateStr) {
  const m = String(dateStr || '').trim().match(DATE_ONLY_RE)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0) - IST_OFFSET_MS)
}

/**
 * End of calendar day in IST for a YYYY-MM-DD string (inclusive).
 */
export function parseIstDayEnd(dateStr) {
  const m = String(dateStr || '').trim().match(DATE_ONLY_RE)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return new Date(Date.UTC(y, mo, d, 23, 59, 59, 999) - IST_OFFSET_MS)
}

/**
 * Inclusive IST date range for CRM list filters (call logs, etc.).
 */
export function parseIstDateRange(fromStr, toStr) {
  const from = parseIstDayStart(fromStr)
  const to = parseIstDayEnd(toStr)
  if (!from || !to || from.getTime() > to.getTime()) return null
  return { from, to }
}
