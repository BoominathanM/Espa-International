import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'
import Customer from '../models/Customer.js'
import Lead from '../models/Lead.js'
import ChatMessage from '../models/ChatMessage.js'
import {
  normalizePhoneDigits,
  toAskEvaRecipient,
  upsertChat,
  getPublicBaseUrl,
} from '../services/chatService.js'
import { sendAskEvaMessage } from '../services/askevaMessageService.js'
import {
  isCloudinaryConfigured,
  uploadChatFileToCloudinary,
} from '../services/cloudinaryService.js'
import { ensureCustomerLinkedToLead } from './leadController.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const CHAT_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'chat')

if (!fs.existsSync(CHAT_UPLOAD_DIR)) {
  fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CHAT_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80)
    cb(null, `${Date.now()}-${safe}`)
  },
})

function fileFilter(_req, file, cb) {
  const mime = file.mimetype || ''
  const ok =
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime.startsWith('video/')
  if (!ok) {
    return cb(new Error('Only images, PDF, Word docs, or videos are allowed'))
  }
  cb(null, true)
}

export const chatUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 16 * 1024 * 1024 },
})

function detectTypeFromMime(mime, fallback = 'document') {
  if (!mime) return fallback
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

/**
 * AskEVA accepts any link and replies with a wamid, but WhatsApp then silently drops
 * the message if the link doesn't serve the actual file (e.g. the SPA's index.html).
 * Returns a reason string only on a definitive bad response; network errors/timeouts
 * return '' so a server that can't reach its own public domain still sends.
 */
async function findMediaUrlProblem(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    if (res.status === 405) return ''
    if (!res.ok) return `media link returned HTTP ${res.status}`
    const contentType = String(res.headers.get('content-type') || '').toLowerCase()
    if (contentType.startsWith('text/html')) return 'media link returns a web page instead of the file'
    return ''
  } catch (err) {
    console.warn('[Chat Send] Could not pre-check media URL, sending anyway:', url, err.message)
    return ''
  }
}

function previewForOutbound({ type, text, filename, mediaUrl }) {
  if (type === 'text') return text || ''
  if (type === 'image') return text ? `[Image] ${text}` : '[Image]'
  if (type === 'video') return text ? `[Video] ${text}` : '[Video]'
  if (type === 'document') return text || filename || mediaUrl || '[Document]'
  return text || `[${type}]`
}

/**
 * Send WhatsApp message via AskEVA Interactive API and store outbound in MongoDB.
 * Accepts multipart (file) or JSON (mediaUrl).
 *
 * Body fields:
 * - customerId (required unless leadId is provided)
 * - leadId (fallback when the chat is opened from a Lead/Appointment record that
 *   isn't linked to a Customer yet — the matching/created Customer is resolved
 *   from the lead's phone number, same as the existing "Convert to Customer" flow)
 * - type: text | image | document | video
 * - text / caption
 * - mediaUrl (optional if file uploaded)
 * - filename (optional)
 */
export const sendChatMessage = async (req, res) => {
  try {
    const customerId = req.body.customerId || req.body.customer_id
    const leadId = req.body.leadId || req.body.lead_id

    let customer = null

    if (customerId) {
      customer = await Customer.findById(customerId)
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found' })
      }
    } else if (leadId) {
      const lead = await Lead.findById(leadId)
      if (!lead) {
        return res.status(404).json({ success: false, message: 'Lead not found' })
      }
      customer = await ensureCustomerLinkedToLead({ lead, performedBy: req.user?.name || 'User' })
      if (!customer) {
        return res.status(400).json({
          success: false,
          message: 'Lead has no valid phone number for a customer record',
        })
      }
      await lead.save()
    } else {
      return res.status(400).json({ success: false, message: 'customerId is required' })
    }

    const recipientRaw = customer.whatsapp || customer.phone
    const to = toAskEvaRecipient(recipientRaw)
    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Customer has no valid WhatsApp/mobile number',
      })
    }

    const text = String(req.body.text || req.body.caption || '').trim()
    let type = String(req.body.type || 'text').toLowerCase()
    let mediaUrl = String(req.body.mediaUrl || req.body.link || '').trim()
    let filename = String(req.body.filename || '').trim()
    let mediaMimeType = ''
    let mediaStorage = mediaUrl ? 'external' : ''
    let cloudinaryInfo = null

    if (req.file) {
      mediaMimeType = req.file.mimetype || ''
      type = detectTypeFromMime(mediaMimeType, type === 'text' ? 'document' : type)
      filename = filename || req.file.originalname || req.file.filename
      const base = getPublicBaseUrl(req)
      mediaUrl = `${base}/api/uploads/chat/${req.file.filename}`
      mediaStorage = 'local'

      // Prefer Cloudinary: a public CDN link AskEVA/WhatsApp can always fetch,
      // independent of PUBLIC_BASE_URL / reverse-proxy routing of /uploads.
      if (isCloudinaryConfigured()) {
        try {
          const uploaded = await uploadChatFileToCloudinary({
            filePath: req.file.path,
            mimeType: mediaMimeType,
            originalName: req.file.originalname,
          })
          mediaUrl = uploaded.url
          mediaStorage = 'cloudinary'
          cloudinaryInfo = uploaded
          fs.promises.unlink(req.file.path).catch(() => {})
        } catch (err) {
          cloudinaryInfo = { error: err.message, code: err.code }
          console.error('[Chat Send] Cloudinary upload failed, using local URL:', err.message)
        }
      }
    }

    if (type === 'text' && !text) {
      return res.status(400).json({ success: false, message: 'Message text is required' })
    }

    if (type !== 'text' && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Attach an image/PDF or provide mediaUrl',
      })
    }

    // AskEVA image/document require a publicly reachable link
    let askevaResult = null
    let sendError = null
    try {
      if (type !== 'text') {
        const problem = await findMediaUrlProblem(mediaUrl)
        if (problem) {
          let advice = 'Check that the media URL is public.'
          if (mediaStorage === 'local') {
            advice = cloudinaryInfo?.error
              ? `Cloudinary upload failed first: ${cloudinaryInfo.error}` +
                (/missing permissions/i.test(cloudinaryInfo.error)
                  ? ' — the Cloudinary API key needs upload permission.'
                  : '')
              : 'Check the Cloudinary settings (CLOUDINARY_* in backend/.env) or PUBLIC_BASE_URL.'
          }
          const err = new Error(
            `Attachment not sent: ${problem}, so WhatsApp cannot download it. ${advice}`
          )
          err.code = 'MEDIA_URL_UNREACHABLE'
          throw err
        }
      }
      askevaResult = await sendAskEvaMessage({
        to,
        type,
        text,
        caption: text,
        mediaUrl,
        filename: filename || (type === 'document' ? 'document.pdf' : undefined),
      })
    } catch (err) {
      sendError = err
      console.error('[Chat Send] AskEVA error:', err.message, err.response || '')
    }

    const timestamp = new Date()
    const waId = normalizePhoneDigits(to)
    const preview = previewForOutbound({ type, text, filename, mediaUrl })

    const chat = await upsertChat({
      waId,
      contactName: customer.name,
      phoneNumberId: '',
      preview,
      direction: 'outbound',
      timestamp,
      customerId: customer._id,
    })

    const wamid =
      askevaResult?.data?.messages?.[0]?.id ||
      askevaResult?.data?.messageId ||
      askevaResult?.data?.id ||
      askevaResult?.data?.data?.id ||
      ''

    const saved = await ChatMessage.create({
      chat: chat._id,
      wamid: wamid ? String(wamid) : '',
      direction: 'outbound',
      type,
      body: type === 'text' ? text : text || filename || preview,
      mediaId: '',
      mediaUrl: mediaUrl || '',
      mediaFilename: filename || '',
      mediaMimeType,
      mediaCaption: type !== 'text' ? text : '',
      status: sendError ? 'failed' : 'sent',
      timestamp,
      from: 'agent',
      to: waId,
      contactName: customer.name,
      customer: customer._id,
      sentBy: req.user?._id || null,
      raw: {
        askevaRequest: {
          to,
          type,
          text,
          mediaUrl,
          filename,
        },
        mediaStorage,
        cloudinary: cloudinaryInfo,
        askevaResponse: askevaResult?.data || null,
        askevaError: sendError
          ? { message: sendError.message, code: sendError.code, status: sendError.status }
          : null,
      },
    })

    if (sendError) {
      return res.status(502).json({
        success: false,
        message: sendError.message || 'Failed to send via AskEVA',
        code: sendError.code || 'ASKEVA_SEND_FAILED',
        hint:
          sendError.code === 'SESSION_NOT_OPENED'
            ? 'Customer must WhatsApp you first within 24h, or use an AskEVA template message to open the session.'
            : undefined,
        messageRecord: saved,
        chat,
      })
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent',
      messageRecord: saved,
      chat,
      askeva: askevaResult?.data || null,
    })
  } catch (error) {
    console.error('[Chat Send] error:', error)
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send message',
    })
  }
}
