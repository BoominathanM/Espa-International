import WhatsAppSettings from '../models/WhatsAppSettings.js'

function getMessageApiBase() {
  const fromEnv =
    process.env.ASKEVA_MESSAGE_API_URL ||
    process.env.ASKEVA_SYNC_API_URL ||
    ''
  if (fromEnv) return String(fromEnv).replace(/\/$/, '')
  // Postman Interactive API collection uses backend.askeva.io
  return 'https://backend.askeva.io'
}

async function getAskEvaToken() {
  const fromEnv =
    (process.env.ASKEVA_API_TOKEN || '').trim() ||
    (process.env.WHATSAPP_API_KEY || '').trim()
  if (fromEnv) return fromEnv

  try {
    const settings = await WhatsAppSettings.getSettings()
    if (settings?.apiKey) return String(settings.apiKey).trim()
  } catch {
    /* ignore */
  }
  return ''
}

/**
 * Build AskEVA send-message payload from Postman Interactive API shapes.
 * @param {{ to: string, type: string, text?: string, mediaUrl?: string, filename?: string, caption?: string }} opts
 */
export function buildAskEvaSendPayload(opts) {
  const to = String(opts.to || '').replace(/\D/g, '')
  const type = opts.type || 'text'
  const caption = opts.caption || opts.text || ''

  if (type === 'text') {
    return {
      to,
      type: 'text',
      text: {
        preview_url: true,
        body: String(opts.text || ''),
      },
    }
  }

  if (type === 'image') {
    return {
      to,
      type: 'image',
      image: {
        link: opts.mediaUrl,
        caption: caption || undefined,
      },
    }
  }

  if (type === 'video') {
    return {
      to,
      type: 'video',
      video: {
        link: opts.mediaUrl,
        caption: caption || undefined,
      },
    }
  }

  if (type === 'document') {
    return {
      to,
      type: 'document',
      document: {
        link: opts.mediaUrl,
        caption: caption || undefined,
        filename: opts.filename || 'document.pdf',
      },
    }
  }

  throw new Error(`Unsupported message type: ${type}`)
}

/**
 * POST https://backend.askeva.io/v1/message/send-message?token=...
 */
export async function sendAskEvaMessage(opts) {
  const token = await getAskEvaToken()
  if (!token) {
    const err = new Error(
      'AskEVA token missing. Set ASKEVA_API_TOKEN or WHATSAPP_API_KEY in backend/.env (or WhatsApp API settings).'
    )
    err.code = 'MISSING_TOKEN'
    throw err
  }

  const payload = buildAskEvaSendPayload(opts)
  if (!payload.to) {
    const err = new Error('Recipient phone number is required')
    err.code = 'MISSING_TO'
    throw err
  }

  if (payload.type !== 'text' && !opts.mediaUrl) {
    const err = new Error('Media URL is required for image/document messages')
    err.code = 'MISSING_MEDIA'
    throw err
  }

  const base = getMessageApiBase()
  const url = `${base}/v1/message/send-message?token=${encodeURIComponent(token)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  let data = null
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.raw ||
      `AskEVA send failed (${res.status})`
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message))
    const msgLower = String(message).toLowerCase()
    if (msgLower.includes('session is not opened') || msgLower.includes('session not open')) {
      err.code = 'SESSION_NOT_OPENED'
      err.message =
        'WhatsApp session is not open for this number. Ask the customer to message your business WhatsApp first (opens a 24-hour window), then retry. Or send a pre-approved template from AskEVA to start the conversation.'
    } else {
      err.code = 'ASKEVA_SEND_FAILED'
    }
    err.status = res.status
    err.response = data
    throw err
  }

  return { success: true, data, payload, url: url.replace(/token=[^&]+/, 'token=***') }
}
