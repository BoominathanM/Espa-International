/**
 * Helpers for turning a bare TeleCMI recording filename (e.g. "1788..._33338459.mp3")
 * into something the browser can play. The audio itself is fetched server-side from
 * TeleCMI's /v2/play (appid + secret) by the streamRecording proxy — see
 * controllers/telecmiCallController.js — so credentials never reach the client.
 */
export const RECORDING_NAME_RE = /^[A-Za-z0-9._-]+\.(mp3|wav)$/i

/**
 * @param {string} host      req.get('host') of the current request (for a protocol-relative URL)
 * @param {string} filename  the stored recording filename
 * @returns {string} playable URL, or '' when the filename is unusable
 */
export const telecmiRecordingUrl = (host, filename) => {
  const raw = String(filename || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw

  // An explicit CDN/base the account exposes wins over our proxy.
  const base = (process.env.TELECMI_RECORDING_BASE_URL || '').trim()
  if (base) {
    const [path, query] = base.split('?')
    const joined = `${path.replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`
    return query ? `${joined}?${query}` : joined
  }

  if (!RECORDING_NAME_RE.test(raw)) return ''
  const prefix = host ? `//${host}` : ''
  return `${prefix}/api/telecmi/recording?file=${encodeURIComponent(raw)}`
}
