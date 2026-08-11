import Chat from '../models/Chat.js'
import Customer from '../models/Customer.js'

export function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '')
}

/** Prefer E.164-ish digits for AskEVA `to` field (no +). */
export function toAskEvaRecipient(phone) {
  let digits = normalizePhoneDigits(phone)
  if (!digits) return ''
  // Common India local 10-digit → prefix 91
  if (digits.length === 10) digits = `91${digits}`
  return digits
}

export async function findCustomerForWaId(waId) {
  const digits = normalizePhoneDigits(waId)
  if (!digits) return null

  let customer = await Customer.findOne({ phoneNormalized: digits }).sort({ updatedAt: -1 })
  if (customer) return customer

  const last10 = digits.slice(-10)
  if (last10.length === 10) {
    customer = await Customer.findOne({
      $or: [
        { phoneNormalized: { $regex: `${last10}$` } },
        { whatsapp: { $regex: `${last10}$` } },
        { phone: { $regex: `${last10}$` } },
      ],
    }).sort({ updatedAt: -1 })
  }
  return customer
}

export async function upsertChat({
  waId,
  contactName,
  phoneNumberId = '',
  displayPhoneNumber = '',
  wabaId = '',
  preview,
  direction,
  timestamp,
  customerId,
}) {
  const phoneNormalized = normalizePhoneDigits(waId)
  const filter = {
    waId: String(waId),
    phoneNumberId: String(phoneNumberId || ''),
  }

  const update = {
    $set: {
      phoneNormalized,
      displayPhoneNumber: displayPhoneNumber || undefined,
      wabaId: wabaId || undefined,
      lastMessageAt: timestamp,
      lastMessagePreview: String(preview || '').slice(0, 500),
      lastDirection: direction,
    },
    $setOnInsert: {
      waId: String(waId),
      phoneNumberId: String(phoneNumberId || ''),
      unreadCount: 0,
    },
  }

  if (contactName) update.$set.contactName = contactName
  if (customerId) update.$set.customer = customerId

  const chat = await Chat.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  })

  if (direction === 'inbound') {
    chat.unreadCount = (chat.unreadCount || 0) + 1
    await chat.save()
  }

  if (customerId) {
    const inc = direction === 'inbound' ? { totalChats: 1 } : {}
    await Customer.findByIdAndUpdate(customerId, {
      lastInteraction: timestamp,
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
    })
  }

  return chat
}

export function getPublicBaseUrl(req) {
  const fromEnv =
    process.env.PUBLIC_BASE_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PRODUCTION_FRONTEND_URL ||
    ''
  if (fromEnv) return String(fromEnv).replace(/\/$/, '')

  if (req) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http'
    const host = req.get('x-forwarded-host') || req.get('host')
    if (host) return `${proto}://${host}`.replace(/\/$/, '')
  }

  return 'http://localhost:3001'
}
