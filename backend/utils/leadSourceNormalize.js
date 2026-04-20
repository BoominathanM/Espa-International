/**
 * Align reports with Leads UI: legacy raw values map to canonical labels.
 */
export function normalizeLeadSourceForReport(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 'Other'
  const u = s.toLowerCase().replace(/\s+/g, ' ').trim()
  if (u === 'call' || u === 'ivr') return 'IVR'
  if (u === 'add' || u === 'walk in' || u === 'walk-in') return 'Walk-in'
  if (u === 'facebook' || u === 'insta' || u === 'instagram') return 'Meta Ads'
  return s
}

/** DB values per canonical filter (Lead schema `source` enum). */
const CANONICAL_SOURCE_DB_VALUES = {
  IVR: ['IVR', 'Call'],
  'Walk-in': ['Walk-in', 'Add'],
  'Meta Ads': ['Facebook', 'Insta'],
}

/** Apply GET /api/leads `source` query using canonical labels (IVR / Walk-in / Meta Ads). */
export function applyCanonicalSourceToLeadQuery(query, sourceParam) {
  const raw = String(sourceParam || '').trim()
  if (!raw) return
  const expanded = CANONICAL_SOURCE_DB_VALUES[raw]
  if (expanded?.length) {
    query.source = { $in: expanded }
  } else {
    query.source = raw
  }
}
