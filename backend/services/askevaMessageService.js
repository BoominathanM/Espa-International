/**
 * The AskEVA base URL + token of one WhatsApp account (Settings → WhatsApp API).
 * Throws MISSING_TOKEN when there is no account or it isn't filled in.
 */
export function getAskEvaCredentials(account) {
  const base = String(account?.backendUrl || '').trim().replace(/\/+$/, '')
  const token = String(account?.apiKey || '').trim()
  if (!base || !token) {
    const err = new Error(
      account
        ? `WhatsApp account "${account.name}" has no Backend URL / API Key. Save them in Settings → WhatsApp API → WhatsApp Configuration.`
        : 'No WhatsApp account for this branch. Add one in Settings → WhatsApp API → WhatsApp Configuration.'
    )
    err.code = 'MISSING_TOKEN'
    throw err
  }
  return { base, token }
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
 * POST {account Backend URL}/v1/message/send-message?token=...
 * @param {object} opts see buildAskEvaSendPayload, plus opts.account (the WhatsApp account to send from)
 */
export async function sendAskEvaMessage(opts) {
  const { base, token } = getAskEvaCredentials(opts.account)

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
