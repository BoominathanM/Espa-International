import Chat from '../models/Chat.js'
import ChatMessage from '../models/ChatMessage.js'
import {
  processInboundWebhookPayload,
  findChatForCustomer,
} from '../services/inboundMessageService.js'
import { normalizePhoneDigits } from '../services/chatService.js'

async function applyStatusUpdate(statusObj) {
  const wamid = statusObj?.id
  if (!wamid) return { skipped: true, reason: 'missing_status_id' }

  const statusMap = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    deleted: 'deleted',
  }
  const nextStatus = statusMap[statusObj.status] || null
  if (!nextStatus) return { skipped: true, reason: 'unknown_status' }

  const updated = await ChatMessage.findOneAndUpdate(
    { wamid },
    { $set: { status: nextStatus } },
    { new: true }
  )

  if (!updated) {
    return { skipped: true, reason: 'message_not_found', wamid, status: nextStatus }
  }

  return { skipped: false, messageId: updated._id, status: nextStatus }
}

/**
 * Meta WhatsApp Cloud API webhook verification (GET).
 */
export const verifyMetaWebhook = (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_API_KEY || ''

  if (mode === 'subscribe' && token && expected && token === expected) {
    console.log('[WhatsApp Meta] Webhook verified')
    return res.status(200).send(String(challenge))
  }

  if (!mode && !token) {
    return res.status(200).json({
      success: true,
      message: 'Meta WhatsApp webhook is active',
      path: '/api/whatsapp/meta/webhook',
      alsoAccepts: 'POST Meta WABA payloads or AskEVA message events → stores ChatMessage',
    })
  }

  console.warn('[WhatsApp Meta] Webhook verification failed', { mode, tokenMatch: token === expected })
  return res.sendStatus(403)
}

/**
 * Receive inbound WhatsApp messages (Meta WABA or AskEVA-style) and store in MongoDB.
 */
export const handleMetaWebhook = async (req, res) => {
  res.status(200).json({ success: true })

  try {
    const payload = req.body || {}
    const { handled, results, kind } = await processInboundWebhookPayload(payload)

    // Also apply delivery statuses from Meta envelopes
    const statusResults = []
    if (Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        for (const change of entry?.changes || []) {
          for (const st of change?.value?.statuses || []) {
            statusResults.push(await applyStatusUpdate(st))
          }
        }
      }
    }

    console.log('[WhatsApp Inbound] Processed webhook', {
      kind: kind || (handled ? 'unknown' : 'ignored'),
      handled,
      messageResults: results?.length || 0,
      statusResults: statusResults.length,
      summary: results,
    })
  } catch (error) {
    console.error('[WhatsApp Inbound] Webhook processing error:', error)
  }
}

export const getMetaSamplePayload = (_req, res) => {
  res.json({
    success: true,
    webhookUrls: [
      '/api/whatsapp/meta/webhook',
      '/api/whatsapp/webhook (also accepts inbound chat messages)',
    ],
    verification: {
      method: 'GET',
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'YOUR_WHATSAPP_VERIFY_TOKEN',
        'hub.challenge': '123456',
      },
    },
    sampleMeta: {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1234567890',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15551234567',
                  phone_number_id: '123456789012345',
                },
                contacts: [{ profile: { name: 'John Doe' }, wa_id: '919025734853' }],
                messages: [
                  {
                    from: '919025734853',
                    id: 'wamid.SAMPLE_MESSAGE_ID',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: 'Hello from WhatsApp' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    },
    sampleAskEva: {
      event: 'message_received',
      data: {
        from: '919025734853',
        id: 'msg_sample_1',
        type: 'text',
        text: 'Hi, I want to book an appointment',
        name: 'Amirtha Solai',
        timestamp: String(Math.floor(Date.now() / 1000)),
      },
    },
  })
}

export const listChats = async (req, res) => {
  try {
    const { waId, customerId, phone, limit = 50 } = req.query
    const or = []
    if (customerId) or.push({ customer: customerId })
    if (waId) {
      const digits = normalizePhoneDigits(waId)
      or.push({ waId: digits })
      or.push({ phoneNormalized: { $regex: `${digits.slice(-10)}$` } })
    }
    if (phone) {
      const digits = normalizePhoneDigits(phone)
      or.push({ phoneNormalized: { $regex: `${digits.slice(-10)}$` } })
      or.push({ waId: { $regex: `${digits.slice(-10)}$` } })
    }

    const filter = or.length ? { $or: or } : {}
    const chats = await Chat.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .populate('customer', 'name phone whatsapp tags branch')
      .lean()

    res.json({ success: true, chats })
  } catch (error) {
    console.error('[WhatsApp] listChats error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to list chats' })
  }
}

export const listChatMessages = async (req, res) => {
  try {
    const { chatId, waId, customerId, phone, limit = 100 } = req.query

    const chat = await findChatForCustomer({ chatId, waId, customerId, phone })

    if (!chat) {
      return res.json({ success: true, chat: null, messages: [] })
    }

    // Also pull messages linked directly to this customer (covers split chats)
    const messageFilter = customerId
      ? { $or: [{ chat: chat._id }, { customer: customerId }] }
      : { chat: chat._id }

    const messages = await ChatMessage.find(messageFilter)
      .sort({ timestamp: 1 })
      .limit(Math.min(Number(limit) || 100, 500))
      .lean()

    // Deduplicate by _id
    const seen = new Set()
    const unique = []
    for (const m of messages) {
      const id = String(m._id)
      if (seen.has(id)) continue
      seen.add(id)
      unique.push(m)
    }

    res.json({ success: true, chat, messages: unique })
  } catch (error) {
    console.error('[WhatsApp] listChatMessages error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to list messages' })
  }
}
