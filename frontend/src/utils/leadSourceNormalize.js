/**
 * Lead source catalog (mirrors backend `utils/leadSourceNormalize.js`).
 *
 * `value` is what the Lead model stores, `label` is what the UI shows.
 * - system: captured automatically (website form, IVR, Meta/Google ads, WhatsApp) — shown but
 *   never selectable in Add Lead; rendered as solid tags.
 * - manual: picked by staff in Add Lead; rendered as light tinted tags.
 * - legacy: kept so existing leads (Import / Other) still display and filter.
 * Note: stored "Facebook" is the legacy Meta Ads value, so the manual Facebook source is
 * stored as "Facebook Organic" and labelled "Facebook".
 */
export const LEAD_SOURCES = [
  { value: 'Website', label: 'Website', kind: 'system', color: '#722ed1' },
  { value: 'IVR', label: 'IVR', kind: 'system', color: '#d4380d', aliases: ['Call'] },
  { value: 'Facebook', label: 'Meta Ads', kind: 'system', color: '#1877F2', aliases: ['Insta'] },
  { value: 'Google Ads', label: 'Google Ads', kind: 'system', color: '#FBBC05', textColor: '#3b2a00' },
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

  { value: 'Import', label: 'Import', kind: 'legacy', color: '#8c8c8c' },
  { value: 'Other', label: 'Other', kind: 'legacy', color: '#8c8c8c' },
]

export const SYSTEM_LEAD_SOURCES = LEAD_SOURCES.filter((s) => s.kind === 'system')
export const MANUAL_LEAD_SOURCES = LEAD_SOURCES.filter((s) => s.kind === 'manual')

const keyOf = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const BY_VALUE = new Map(LEAD_SOURCES.map((s) => [keyOf(s.value), s]))
const BY_ALIAS = new Map(LEAD_SOURCES.flatMap((s) => (s.aliases || []).map((a) => [keyOf(a), s])))
const BY_LABEL = new Map(LEAD_SOURCES.map((s) => [keyOf(s.label), s]))

/**
 * Resolve a stored source value (or alias) to its catalog entry. Stored values win over labels,
 * so "Facebook" resolves to Meta Ads — pass raw DB values here, not already-normalized labels.
 */
export function findLeadSource(raw) {
  const k = keyOf(raw)
  if (!k) return null
  return BY_VALUE.get(k) || BY_ALIAS.get(k) || BY_LABEL.get(k) || null
}

/** Catalog entry for a display label (e.g. report rows the backend already normalized). */
export function findLeadSourceByLabel(label) {
  return BY_LABEL.get(keyOf(label)) || null
}

/**
 * Display label for a value the backend already normalized (reports / dashboard rows).
 * Keeps the manual "Facebook" label instead of re-reading it as the legacy Meta Ads value.
 */
export function leadSourceReportLabel(value) {
  return findLeadSourceByLabel(value)?.label || normalizeLeadSourceDisplay(value)
}

/** Canonical labels (matches backend `normalizeLeadSourceForReport`). */
export function normalizeLeadSourceDisplay(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 'Other'
  return findLeadSource(s)?.label || s
}

export function isSystemLeadSource(raw) {
  return findLeadSource(raw)?.kind === 'system'
}

/** Form value for a stored source (aliases such as Add / Call collapse to their canonical value). */
export function leadSourceFormValue(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return undefined
  return findLeadSource(s)?.value || s
}

/**
 * Value for the GET /api/leads `source` filter: aliased sources use their label
 * (backend expands IVR / Walk-in / Meta Ads), everything else its stored value.
 */
export function leadSourceFilterValue(entry) {
  return entry.aliases?.length ? entry.label : entry.value
}

export const LEAD_SOURCE_TAG_COLORS = Object.fromEntries(LEAD_SOURCES.map((s) => [s.label, s.color]))

export function leadSourceTagColor(raw) {
  return findLeadSource(raw)?.color || 'default'
}

function tagPropsForEntry(entry) {
  if (!entry) return {}
  if (entry.kind === 'system') {
    return {
      style: {
        background: entry.color,
        borderColor: entry.color,
        color: entry.textColor || '#fff',
        fontWeight: 600,
      },
    }
  }
  return {
    style: {
      background: `${entry.color}1f`,
      borderColor: `${entry.color}80`,
    },
  }
}

/** Props for antd <Tag>: auto-captured sources are solid, manual sources a light tint. */
export function leadSourceTagProps(raw) {
  return tagPropsForEntry(findLeadSource(raw))
}

/** Same as `leadSourceTagProps` for an already-normalized label. */
export function leadSourceTagPropsForLabel(label) {
  return tagPropsForEntry(findLeadSourceByLabel(label))
}

const LEAD_SOURCE_ENUM = new Set([...LEAD_SOURCES.map((s) => s.value), 'Call', 'Insta', 'Add'])

/** Map a form value / label to the Lead model `source` enum (Meta Ads → Facebook; legacy Call/Add stay valid). */
export function leadSourceToDbEnumValue(raw) {
  const entry = findLeadSource(raw)
  if (entry) return entry.value
  const t = String(raw ?? '').trim()
  if (LEAD_SOURCE_ENUM.has(t)) return t
  return 'Website'
}
