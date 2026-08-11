import ChatMessage from '../models/ChatMessage.js'
import {
  normalizePhoneDigits,
  findCustomerForWaId,
  upsertChat,
} from './chatService.js'

function extractMessageBody(message) {
  if (!message || typeof message !== 'object') {
    return { type: 'unknown', body: '', mediaId: '', mediaMimeType: '', mediaCaption: '', mediaUrl: '' }
  }

  const type = message.type || (message.text ? 'text' : 'unknown')

  switch (type) {
    case 'text':
      return {
        type: 'text',
        body: message.text?.body || message.body || message.message || '',
        mediaId: '',
        mediaMimeType: '',
        mediaCaption: '',
        mediaUrl: '',
      }
    case 'image':
      return {
        type: 'image',
        body: message.image?.caption || message.caption || '[Image]',
        mediaId: message.image?.id || '',
        mediaMimeType: message.image?.mime_type || '',
        mediaCaption: message.image?.caption || message.caption || '',
        mediaUrl: message.image?.link || message.image?.url || message.link || '',
      }
    case 'audio':
      return {
        type: 'audio',
        body: '[Audio]',
        mediaId: message.audio?.id || '',
        mediaMimeType: message.audio?.mime_type || '',
        mediaCaption: '',
        mediaUrl: message.audio?.link || message.audio?.url || '',
      }
    case 'video':
      return {
        type: 'video',
        body: message.video?.caption || message.caption || '[Video]',
        mediaId: message.video?.id || '',
        mediaMimeType: message.video?.mime_type || '',
        mediaCaption: message.video?.caption || '',
        mediaUrl: message.video?.link || message.video?.url || message.link || '',
      }
    case 'document':
      return {
        type: 'document',
        body: message.document?.filename || message.document?.caption || message.caption || '[Document]',
        mediaId: message.document?.id || '',
        mediaMimeType: message.document?.mime_type || '',
        mediaCaption: message.document?.caption || '',
        mediaUrl: message.document?.link || message.document?.url || message.link || '',
      }
    case 'button':
      return {
        type: 'button',
        body: message.button?.text || message.button?.payload || '[Button]',
        mediaId: '',
        mediaMimeType: '',
        mediaCaption: '',
        mediaUrl: '',
      }
    case 'interactive':
      return {
        type: 'interactive',
        body:
          message.interactive?.button_reply?.title ||
          message.interactive?.list_reply?.title ||
          '[Interactive]',
        mediaId: '',
        mediaMimeType: '',
        mediaCaption: '',
        mediaUrl: '',
      }
    default:
      return {
        type: type === 'unknown' ? 'unknown' : type,
        body: message.body || message.message || message.text?.body || `[${type}]`,
        mediaId: '',
        mediaMimeType: '',
        mediaCaption: '',
        mediaUrl: message.link || message.url || '',
      }
  }
}

export async function storeInboundMessage({
  message,
  contactName = '',
  phoneNumberId = '',
  displayPhoneNumber = '',
  wabaId = '',
}) {
  const waId = normalizePhoneDigits(message.from || message.wa_id || message.mobile || message.phone)
  if (!waId) return { skipped: true, reason: 'missing_from' }

  const wamid = message.id || message.messageId || message.wamid || ''
  if (wamid) {
    const existing = await ChatMessage.findOne({ wamid }).lean()
    if (existing) return { skipped: true, reason: 'duplicate', messageId: existing._id }
  }

  const extracted = extractMessageBody(message)
  const tsSeconds = Number(message.timestamp || message.time || message.ts)
  const timestamp =
    Number.isFinite(tsSeconds) && tsSeconds > 0
      ? new Date(tsSeconds > 1e12 ? tsSeconds : tsSeconds * 1000)
      : message.createdAt
        ? new Date(message.createdAt)
        : new Date()

  const customer = await findCustomerForWaId(waId)
  const chat = await upsertChat({
    waId,
    contactName: contactName || message.profileName || message.name || '',
    phoneNumberId,
    displayPhoneNumber,
    wabaId,
    preview: extracted.body,
    direction: 'inbound',
    timestamp,
    customerId: customer?._id || null,
  })

  const saved = await ChatMessage.create({
    chat: chat._id,
    wamid: wamid ? String(wamid) : '',
    direction: 'inbound',
    type: extracted.type,
    body: extracted.body,
    mediaId: extracted.mediaId,
    mediaUrl: extracted.mediaUrl,
    mediaMimeType: extracted.mediaMimeType,
    mediaCaption: extracted.mediaCaption,
    status: 'received',
    timestamp,
    from: waId,
    to: displayPhoneNumber || phoneNumberId || '',
    contactName: contactName || message.profileName || message.name || chat.contactName || '',
    customer: customer?._id || null,
    raw: message,
  })

  return { skipped: false, chatId: chat._id, messageId: saved._id, customerId: customer?._id || null }
}

/**
 * Process Meta Cloud API envelope OR simplified AskEVA/message payloads.
 * Returns { handled: boolean, results: [] }
 */
export async function processInboundWebhookPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { handled: false, results: [] }
  }

  const results = []

  // ── Meta / WABA envelope ──────────────────────────────────────────────────
  if (payload.object === 'whatsapp_business_account' || Array.isArray(payload.entry)) {
    const entries = Array.isArray(payload.entry) ? payload.entry : []
    for (const entry of entries) {
      const wabaId = entry?.id || ''
      const changes = Array.isArray(entry?.changes) ? entry.changes : []
      for (const change of changes) {
        if (change?.field && change.field !== 'messages') continue
        const value = change?.value || {}
        const metadata = value.metadata || {}
        const phoneNumberId = metadata.phone_number_id || ''
        const displayPhoneNumber = metadata.display_phone_number || ''
        const contacts = Array.isArray(value.contacts) ? value.contacts : []
        const contactNameByWaId = {}
        for (const c of contacts) {
          if (c?.wa_id) contactNameByWaId[normalizePhoneDigits(c.wa_id)] = c.profile?.name || ''
        }

        for (const message of Array.isArray(value.messages) ? value.messages : []) {
          const fromKey = normalizePhoneDigits(message.from)
          const contactName = contactNameByWaId[fromKey] || contacts[0]?.profile?.name || ''
          results.push(
            await storeInboundMessage({
              message,
              contactName,
              phoneNumberId,
              displayPhoneNumber,
              wabaId,
            })
          )
        }
      }
    }
    return { handled: results.length > 0 || entries.length > 0, results, kind: 'meta' }
  }

  // ── Flat messages array (some BSPs) ───────────────────────────────────────
  if (Array.isArray(payload.messages) && payload.messages.length) {
    const contacts = Array.isArray(payload.contacts) ? payload.contacts : []
    const contactName = contacts[0]?.profile?.name || contacts[0]?.name || payload.name || ''
    for (const message of payload.messages) {
      results.push(
        await storeInboundMessage({
          message,
          contactName,
          displayPhoneNumber: payload.metadata?.display_phone_number || '',
          phoneNumberId: payload.metadata?.phone_number_id || '',
        })
      )
    }
    return { handled: true, results, kind: 'messages_array' }
  }

  // ── AskEVA-style event wrappers ───────────────────────────────────────────
  const event = String(payload.event || payload.type || payload.message?.event || '').toLowerCase()
  const data =
    payload.data ||
    payload.message?.data ||
    payload.payload ||
    (payload.from || payload.mobile || payload.text || payload.body ? payload : null)

  const messageEvents = [
    'message',
    'messages',
    'message_received',
    'incoming_message',
    'inbound_message',
    'chat_message',
    'whatsapp_message',
    'user_message',
  ]

  if (data && (messageEvents.includes(event) || data.from || data.mobile || data.wa_id || data.text || data.body)) {
    // Skip pure lead payloads
    if (
      event.includes('lead') ||
      data.leadId ||
      data.askevaLeadId ||
      (data.email && data.mobile && !data.text && !data.body && !data.message && data.type !== 'text')
    ) {
      // only skip if it looks like a lead create, not a chat message
      if (!data.text && !data.body && !data.message && !data.type) {
        return { handled: false, results: [] }
      }
    }

    const message = {
      from: data.from || data.wa_id || data.mobile || data.phone || data.sender,
      id: data.id || data.messageId || data.wamid || data.message_id,
      timestamp: data.timestamp || data.time || data.createdAt,
      type: data.type || (data.image ? 'image' : data.document ? 'document' : 'text'),
      text:
        typeof data.text === 'string'
          ? { body: data.text }
          : data.text || { body: data.body || data.message || data.content || '' },
      image: data.image,
      document: data.document,
      video: data.video,
      audio: data.audio,
      button: data.button,
      interactive: data.interactive,
      link: data.link || data.url,
      name: data.name || data.profileName || data.contactName,
      body: data.body,
      message: typeof data.message === 'string' ? data.message : undefined,
    }

    if (!message.from) {
      return { handled: false, results: [] }
    }

    results.push(
      await storeInboundMessage({
        message,
        contactName: message.name || '',
      })
    )
    return { handled: true, results, kind: 'askeva_event' }
  }

  return { handled: false, results: [] }
}

/**
 * Find chat(s) for a customer using flexible OR matching.
 */
export async function findChatForCustomer({ chatId, waId, customerId, phone }) {
  const Chat = (await import('../models/Chat.js')).default

  if (chatId) {
    return Chat.findById(chatId)
  }

  const or = []
  if (customerId) or.push({ customer: customerId })
  if (waId) {
    const digits = normalizePhoneDigits(waId)
    if (digits) {
      or.push({ waId: digits })
      or.push({ phoneNormalized: digits })
      or.push({ phoneNormalized: { $regex: `${digits.slice(-10)}$` } })
    }
  }
  if (phone) {
    const digits = normalizePhoneDigits(phone)
    if (digits) {
      or.push({ waId: digits })
      or.push({ phoneNormalized: digits })
      or.push({ phoneNormalized: { $regex: `${digits.slice(-10)}$` } })
      if (digits.length === 10) {
        or.push({ waId: `91${digits}` })
        or.push({ phoneNormalized: `91${digits}` })
      }
    }
  }

  if (!or.length) return null
  return Chat.findOne({ $or: or }).sort({ lastMessageAt: -1 })
}
