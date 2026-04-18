/**
 * Ozonetel sometimes sends AgentID as a chained string, e.g. "555 -> 555 -> 555".
 * CRM and reports should use only the first segment for display and user matching.
 */
export function normalizeOzonetelAgentId(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  return s.split(/\s*(?:->|=>|→)\s*/)[0].trim()
}

/**
 * Map Ozonetel / dialer status strings into report buckets.
 * "Not answer", "No answer", "Not answered", etc. → Missed (same as dashboard missed regex intent).
 */
export function bucketCallStatus(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const t = s.replace(/_/g, ' ')

  if (/^missed$/i.test(t.trim())) return 'Missed'
  if (/\bunanswered\b/i.test(t)) return 'Missed'
  if (/\b(no|not)\s*[-]?\s*answer(ed)?\b/i.test(t)) return 'Missed'

  const simple = t.trim().toLowerCase().replace(/\s+/g, ' ')
  if (['noanswer', 'notanswer', 'notanswered', 'noans', 'notans'].includes(simple)) return 'Missed'
  if (['answered', 'connected', 'complete', 'completed', 'success'].includes(simple)) return 'Answered'

  if (/\banswered\b/i.test(t) && !/\b(no|not)\s*[-]?\s*answer/i.test(t)) return 'Answered'

  return null
}

/** UI / export: show Missed / Answered for known buckets; otherwise original status text. */
export function formatCallStatusLabel(raw) {
  const b = bucketCallStatus(raw)
  if (b === 'Missed' || b === 'Answered') return b
  const s = String(raw ?? '').trim()
  return s || '—'
}
