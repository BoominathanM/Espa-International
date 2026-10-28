/**
 * Lead source catalog (mirrors frontend `utils/leadSourceNormalize.js`).
 * `value` is stored on Lead.source, `label` is what reports / UI show.
 * system = auto-captured (not selectable in Add Lead), manual = staff-selected, legacy = old data.
 * Stored "Facebook" is the legacy Meta Ads value, so manual Facebook is stored as "Facebook Organic".
 */
export const LEAD_SOURCES = [
  { value: 'Website', label: 'Website', kind: 'system', color: '#722ed1' },
  { value: 'IVR', label: 'IVR', kind: 'system', color: '#d4380d', aliases: ['Call'] },
  { value: 'Facebook', label: 'Meta Ads', kind: 'system', color: '#1877F2', aliases: ['Insta'] },
  { value: 'Google Ads', label: 'Google Ads', kind: 'system', color: '#FBBC05' },
  { value: 'WhatsApp', label: 'WhatsApp', kind: 'system', color: '#128C7E' },

  { value: 'Walk-in', label: 'Walk-in', kind: 'manual', color: '#2f54eb', aliases: ['Add', 'Walk in', 'Walkin'] },
  { value: 'Referral', label: 'Referral', kind: 'manual', color: '#9254de' },
  { value: 'WhatsApp (Outbound)', label: 'WhatsApp (Outbound)', kind: 'manual', color: '#389e0d' },
  { value: 'Old Data', label: 'Old Data', kind: 'manual', color: '#595959' },
  { value: 'Banner', label: 'Banner', kind: 'manual', color: '#d46b08' },
  { value: 'Pamphlet', label: 'Pamphlet', kind: 'manual', color: '#7cb305' },
  { value: 'Driver (Marketing)', label: 'Driver (Marketing)', kind: 'manual', color: '#13a8a8' },
  { value: 'Event', label: 'Event', kind: 'manual', color: '#ad8b00' },
  { value: 'Poster', label: 'Poster', kind: 'manual', color: '#a0522d' },
  { value: 'Instagram', label: 'Instagram', kind: 'manual', color: '#E1306C' },
  { value: 'Youtube', label: 'Youtube', kind: 'manual', color: '#cf1322' },
  { value: 'Facebook Organic', label: 'Facebook', kind: 'manual', color: '#0958d9' },
  { value: 'Membership Client', label: 'Membership Client', kind: 'manual', color: '#006d75' },

  { value: 'Import', label: 'Import', kind: 'legacy', color: '#9B59B6' },
  { value: 'Other', label: 'Other', kind: 'legacy', color: '#888888' },
]

/** Every value Lead.source accepts (catalog values + legacy aliases still present in old data). */
export const LEAD_SOURCE_DB_VALUES = [
  ...LEAD_SOURCES.map((s) => s.value),
  'Call',
  'Insta',
  'Add',
]

/** Report / chart colour per display label. */
export const LEAD_SOURCE_LABEL_COLORS = Object.fromEntries(LEAD_SOURCES.map((s) => [s.label, s.color]))

const keyOf = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const BY_VALUE = new Map(LEAD_SOURCES.map((s) => [keyOf(s.value), s]))
const BY_ALIAS = new Map(LEAD_SOURCES.flatMap((s) => (s.aliases || []).map((a) => [keyOf(a), s])))
const BY_LABEL = new Map(LEAD_SOURCES.map((s) => [keyOf(s.label), s]))

/**
 * Align reports with Leads UI: legacy raw values map to canonical labels.
 */
export function normalizeLeadSourceForReport(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 'Other'
  const k = keyOf(s)
  const entry = BY_VALUE.get(k) || BY_ALIAS.get(k) || BY_LABEL.get(k)
  return entry ? entry.label : s
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
