/** Canonical labels (matches backend `normalizeLeadSourceForReport`). */
export function normalizeLeadSourceDisplay(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 'Other'
  const u = s.toLowerCase().replace(/\s+/g, ' ').trim()
  if (u === 'call' || u === 'ivr') return 'IVR'
  if (u === 'add' || u === 'walk in' || u === 'walk-in') return 'Walk-in'
  if (u === 'facebook' || u === 'insta' || u === 'instagram') return 'Meta Ads'
  return s
}

export const LEAD_SOURCE_TAG_COLORS = {
  Website: 'purple',
  IVR: 'purple',
  WhatsApp: 'green',
  'Meta Ads': 'blue',
  'Walk-in': 'geekblue',
  Referral: 'magenta',
  Import: 'cyan',
  Other: 'default',
}

export function leadSourceTagColor(raw) {
  const key = normalizeLeadSourceDisplay(raw)
  return LEAD_SOURCE_TAG_COLORS[key] || 'default'
}

const LEAD_SOURCE_ENUM = new Set([
  'Website',
  'Call',
  'IVR',
  'WhatsApp',
  'Facebook',
  'Insta',
  'Walk-in',
  'Referral',
  'Add',
  'Import',
  'Other',
])

/** Map UI label to Lead model `source` enum (Meta Ads → Facebook; legacy Call/Add stay valid). */
export function leadSourceToDbEnumValue(raw) {
  const canon = normalizeLeadSourceDisplay(raw)
  if (canon === 'Meta Ads') return 'Facebook'
  if (canon === 'IVR') return 'IVR'
  if (canon === 'Walk-in') return 'Walk-in'
  const t = String(raw ?? '').trim()
  if (LEAD_SOURCE_ENUM.has(t)) return t
  if (LEAD_SOURCE_ENUM.has(canon)) return canon
  return 'Website'
}
