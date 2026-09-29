/**
 * WhatsApp templates through AskEVA (same token + base URL as the Live Chat sender in
 * askevaMessageService.js). From AskEVA's "Consumer API Documentation" Postman collection:
 *
 *   GET  {base}/v1/templates?token=…&limit=&after=   → { total, data: [Meta template], paging: { before, after } }
 *   POST {base}/v1/message/send-message?token=…      → body { to, type: 'template', template: {
 *          name, language: { policy: 'deterministic', code }, components: [
 *            { type: 'header', parameters: [{ type: 'text'|'image'|'video'|'document', … }] },
 *            { type: 'body',   parameters: [{ type: 'text', text }] },
 *            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text }] } ] } }
 *
 * A Meta template's variables are {{1}}, {{2}} … (positional) or {{customer_name}} (named).
 */
import WhatsAppTemplate from '../models/WhatsAppTemplate.js'
import { getAskEvaToken, getMessageApiBase } from './askevaMessageService.js'

const LOG = '[WA-TEMPLATES]'
const PAGE_LIMIT = 100
const MAX_PAGES = 50
const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g
// A hung AskEVA request must not leave Settings (Sync / Send Test) spinning for minutes.
const FETCH_TIMEOUT_MS = 30000

const missingTokenError = () => {
  const err = new Error('AskEVA token missing. Save the WhatsApp API Key in WhatsApp Configuration (or set ASKEVA_API_TOKEN / WHATSAPP_API_KEY).')
  err.code = 'MISSING_TOKEN'
  return err
}

const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

const errorMessageOf = (data, status) => {
  const m = data?.error?.message || data?.message || data?.error || data?.raw || `AskEVA request failed (${status})`
  return typeof m === 'string' ? m : JSON.stringify(m)
}

/** Unique placeholder keys of one text, in order of appearance ("Hi {{1}}, {{2}}" → ['1', '2']). */
const placeholdersIn = (text) => {
  const keys = []
  for (const m of String(text || '').matchAll(PLACEHOLDER_RE)) {
    if (!keys.includes(m[1])) keys.push(m[1])
  }
  return keys
}

const sortKeys = (keys) =>
  keys.every((k) => /^\d+$/.test(k)) ? [...keys].sort((a, b) => Number(a) - Number(b)) : keys

/** Split a Meta template's components into the fields the CRM shows + its fillable variables. */
export const describeTemplate = (components) => {
  const list = Array.isArray(components) ? components : []
  const find = (type) => list.find((c) => String(c?.type || '').toUpperCase() === type)
  const header = find('HEADER')
  const body = find('BODY')
  const footer = find('FOOTER')
  const buttons = Array.isArray(find('BUTTONS')?.buttons) ? find('BUTTONS').buttons : []

  const variables = []
  const headerFormat = String(header?.format || '').toUpperCase()
  if (header && headerFormat === 'TEXT') {
    const ex = header.example?.header_text?.[0] || header.example?.header_text_named_params?.[0]?.example || ''
    for (const key of placeholdersIn(header.text)) variables.push({ component: 'header', key, buttonIndex: null, example: String(ex || '') })
  }
  if (body) {
    const positional = body.example?.body_text?.[0] || []
    const named = body.example?.body_text_named_params || []
    for (const key of sortKeys(placeholdersIn(body.text))) {
      const ex = /^\d+$/.test(key) ? positional[Number(key) - 1] : named.find((p) => p?.param_name === key)?.example
      variables.push({ component: 'body', key, buttonIndex: null, example: String(ex ?? '') })
    }
  }
  buttons.forEach((b, i) => {
    if (String(b?.type || '').toUpperCase() !== 'URL') return
    for (const key of placeholdersIn(b.url)) {
      variables.push({ component: 'button', key, buttonIndex: i, example: String(b.example?.[0] ?? '') })
    }
  })

  return {
    headerFormat,
    headerText: header?.text || '',
    bodyText: body?.text || '',
    footerText: footer?.text || '',
    buttons,
    variables,
  }
}

/** Every template on the AskEVA account (follows paging.after). */
export const fetchAskEvaTemplates = async () => {
  const token = await getAskEvaToken()
  if (!token) throw missingTokenError()
  const base = getMessageApiBase()

  const all = []
  const seenCursors = new Set()
  let after = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ token, limit: String(PAGE_LIMIT) })
    if (after) qs.set('after', after)
    const res = await fetch(`${base}/v1/templates?${qs.toString()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const data = parseJson(await res.text())
    if (!res.ok) {
      const err = new Error(errorMessageOf(data, res.status))
      err.status = res.status
      throw err
    }
    const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.data?.data) ? data.data.data : []
    all.push(...rows)
    const next = data?.paging?.after || data?.paging?.cursors?.after || data?.data?.paging?.cursors?.after || ''
    // The last page still carries an "after" cursor; the page after it is empty with paging null.
    if (!rows.length || !next || seenCursors.has(next)) break
    seenCursors.add(next)
    after = next
  }
  return all
}

/** Pull templates from AskEVA into the whatsapptemplates collection. */
export const syncWhatsAppTemplates = async () => {
  const remote = await fetchAskEvaTemplates()
  const now = new Date()
  const seenIds = []
  for (const t of remote) {
    const templateId = String(t?.id || '').trim() || `${t?.name}:${t?.language}`
    if (!t?.name) continue
    seenIds.push(templateId)
    await WhatsAppTemplate.updateOne(
      { templateId },
      {
        $set: {
          templateId,
          name: String(t.name),
          language: String(t.language || 'en'),
          category: String(t.category || ''),
          status: String(t.status || ''),
          rejectedReason: t.rejected_reason && t.rejected_reason !== 'NONE' ? String(t.rejected_reason) : '',
          qualityScore: String(t.quality_score?.score || ''),
          parameterFormat: String(t.parameter_format || ''),
          components: Array.isArray(t.components) ? t.components : [],
          ...describeTemplate(t.components),
          lastSyncedAt: now,
          missingFromLastSync: false,
        },
      },
      { upsert: true }
    )
  }
  const flagged = await WhatsAppTemplate.updateMany(
    { templateId: { $nin: seenIds } },
    { $set: { missingFromLastSync: true } }
  )
  console.log(LOG, `synced ${seenIds.length} template(s) from AskEVA; ${flagged.modifiedCount || 0} no longer on AskEVA`)
  return { synced: seenIds.length, missing: flagged.modifiedCount || 0, syncedAt: now }
}

/** WhatsApp rejects parameters with new lines / tabs / 4+ spaces (error 132018) — flatten them. */
export const cleanParam = (value) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 1000)

/**
 * A URL button's variable is only the dynamic END of the link (the template holds the rest). If a
 * full link was given that starts with the template's fixed part, keep just the dynamic part.
 */
const buttonSuffix = (value, buttonUrl) => {
  const fixed = String(buttonUrl || '').split('{{')[0]
  const v = String(value || '')
  return fixed && v.startsWith(fixed) ? v.slice(fixed.length) : v
}

const textParam = (key, text) =>
  /^\d+$/.test(key) ? { type: 'text', text } : { type: 'text', parameter_name: key, text }

/**
 * AskEVA send-message body for a template.
 * @param {object} o
 * @param {string} o.to            recipient digits with country code (e.g. 919876543210)
 * @param {string} o.name          template name
 * @param {string} o.language      template language code
 * @param {Array}  o.params        [{ component, key, buttonIndex, value }]
 * @param {string} [o.headerFormat] IMAGE | VIDEO | DOCUMENT → o.headerMediaUrl is sent as the header
 * @param {Array}  [o.buttons]     the template's buttons (to trim full URLs to their dynamic part)
 */
export const buildTemplatePayload = ({ to, name, language, params = [], headerFormat = '', headerMediaUrl = '', headerMediaFilename = '', buttons = [] }) => {
  const components = []

  const media = String(headerFormat || '').toLowerCase()
  if (['image', 'video', 'document'].includes(media) && headerMediaUrl) {
    const obj = { link: headerMediaUrl }
    if (media === 'document') obj.filename = headerMediaFilename || 'document.pdf'
    components.push({ type: 'header', parameters: [{ type: media, [media]: obj }] })
  } else {
    const headerParams = params.filter((p) => p.component === 'header')
    if (headerParams.length) {
      components.push({ type: 'header', parameters: headerParams.map((p) => textParam(p.key, cleanParam(p.value))) })
    }
  }

  const bodyParams = params.filter((p) => p.component === 'body')
  if (bodyParams.length) {
    const ordered = sortKeys(bodyParams.map((p) => p.key)).map((k) => bodyParams.find((p) => p.key === k))
    components.push({ type: 'body', parameters: ordered.map((p) => textParam(p.key, cleanParam(p.value))) })
  }

  const byButton = new Map()
  for (const p of params.filter((x) => x.component === 'button')) {
    const i = Number(p.buttonIndex) || 0
    if (!byButton.has(i)) byButton.set(i, [])
    byButton.get(i).push(p)
  }
  for (const [i, list] of [...byButton.entries()].sort((a, b) => a[0] - b[0])) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(i),
      parameters: list.map((p) => ({ type: 'text', text: cleanParam(buttonSuffix(p.value, buttons?.[i]?.url)) })),
    })
  }

  const template = { language: { policy: 'deterministic', code: language || 'en' }, name }
  if (components.length) template.components = components
  return { to: String(to || '').replace(/\D/g, ''), type: 'template', template }
}

/**
 * POST the template message to AskEVA. Resolves { ok, status, data, messageId } for any HTTP
 * answer (ok=false when AskEVA refused it); throws only when there is no token or the request
 * itself fails.
 */
export const sendAskEvaTemplate = async (payload) => {
  const token = await getAskEvaToken()
  if (!token) throw missingTokenError()
  const url = `${getMessageApiBase()}/v1/message/send-message?token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const data = parseJson(await res.text())
  const ok = res.ok && data?.success !== false && !data?.error
  const messageId =
    data?.messages?.[0]?.id || data?.data?.messages?.[0]?.id || data?.messageId || data?.data?.id || data?.id || ''
  return {
    ok,
    status: res.status,
    data,
    messageId: String(messageId || ''),
    error: ok ? '' : errorMessageOf(data, res.status),
  }
}
