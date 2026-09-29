/**
 * Live Chat quick replies. Mounted under /api/whatsapp/quick-replies:
 * any logged-in user can list the active ones (Live Chat ⚡ picker);
 * create / edit / delete is Super Admin only (Settings → WhatsApp API → Quick Replies).
 */
import QuickReply from '../models/QuickReply.js'

const LOG = '[QUICK-REPLY]'
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''))
const str = (v) => (v === null || v === undefined ? '' : String(v).trim())
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const TITLE_MAX = 80
const MESSAGE_MAX = 3500
const LINK_MAX = 500

/** "www.x.com" → "https://www.x.com"; returns '' for blank, null when not a valid http(s) URL. */
const normalizeLink = (value) => {
  let link = str(value)
  if (!link) return ''
  if (/^www\./i.test(link)) link = `https://${link}`
  if (!/^https?:\/\/\S+$/i.test(link)) return null
  try {
    const url = new URL(link)
    if (!url.hostname || !url.hostname.includes('.')) return null
  } catch {
    return null
  }
  return link
}

/** Validates the body; returns { error } or { data } with the cleaned fields. */
const readQuickReplyBody = (body = {}) => {
  const title = str(body.title)
  const message = str(body.message)
  const link = normalizeLink(body.link)

  if (!title) return { error: 'Title is required' }
  if (title.length > TITLE_MAX) return { error: `Title must be ${TITLE_MAX} characters or less` }
  if (message.length > MESSAGE_MAX) return { error: `Message must be ${MESSAGE_MAX} characters or less` }
  if (link === null) return { error: 'Link must be a valid URL starting with http:// or https://' }
  if (link.length > LINK_MAX) return { error: `Link must be ${LINK_MAX} characters or less` }
  if (!message && !link) return { error: 'Enter a message or a link' }

  const data = { title, message, link }
  if (body.isActive !== undefined) data.isActive = body.isActive === true || body.isActive === 'true'
  return { data }
}

const findTitleClash = (title, excludeId) =>
  QuickReply.findOne({
    title: { $regex: `^${escapeRegex(title)}$`, $options: 'i' },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).lean()

// @route GET /api/whatsapp/quick-replies  (?includeInactive=true — Super Admin only)
export const listQuickReplies = async (req, res) => {
  try {
    const includeInactive =
      req.user?.role === 'superadmin' && String(req.query.includeInactive) === 'true'
    const filter = includeInactive ? {} : { isActive: true }
    const quickReplies = await QuickReply.find(filter)
      .sort({ title: 1 })
      .collation({ locale: 'en', strength: 2 })
      .lean()
    res.json({ success: true, quickReplies })
  } catch (error) {
    console.error(LOG, 'list error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to load quick replies' })
  }
}

// @route POST /api/whatsapp/quick-replies
export const createQuickReply = async (req, res) => {
  try {
    const { error, data } = readQuickReplyBody(req.body)
    if (error) return res.status(400).json({ success: false, message: error })

    if (await findTitleClash(data.title)) {
      return res.status(409).json({ success: false, message: 'A quick reply with this title already exists' })
    }

    const quickReply = await QuickReply.create({
      ...data,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    })
    res.status(201).json({ success: true, message: 'Quick reply added', quickReply })
  } catch (error) {
    console.error(LOG, 'create error:', error.message)
    const status = error.name === 'ValidationError' ? 400 : 500
    res.status(status).json({ success: false, message: error.message || 'Failed to add quick reply' })
  }
}

// @route PUT /api/whatsapp/quick-replies/:id
export const updateQuickReply = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid quick reply id' })

    const quickReply = await QuickReply.findById(id)
    if (!quickReply) return res.status(404).json({ success: false, message: 'Quick reply not found' })

    // Toggle-only update (the Active switch in the list) — keep the rest as is
    const body = { ...req.body }
    if (body.title === undefined) body.title = quickReply.title
    if (body.message === undefined) body.message = quickReply.message
    if (body.link === undefined) body.link = quickReply.link

    const { error, data } = readQuickReplyBody(body)
    if (error) return res.status(400).json({ success: false, message: error })

    if (await findTitleClash(data.title, quickReply._id)) {
      return res.status(409).json({ success: false, message: 'A quick reply with this title already exists' })
    }

    Object.assign(quickReply, data, { updatedBy: req.user?._id || null })
    await quickReply.save()
    res.json({ success: true, message: 'Quick reply updated', quickReply })
  } catch (error) {
    console.error(LOG, 'update error:', error.message)
    const status = error.name === 'ValidationError' ? 400 : 500
    res.status(status).json({ success: false, message: error.message || 'Failed to update quick reply' })
  }
}

// @route DELETE /api/whatsapp/quick-replies/:id
export const deleteQuickReply = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid quick reply id' })

    const deleted = await QuickReply.findByIdAndDelete(id)
    if (!deleted) return res.status(404).json({ success: false, message: 'Quick reply not found' })
    res.json({ success: true, message: 'Quick reply deleted' })
  } catch (error) {
    console.error(LOG, 'delete error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to delete quick reply' })
  }
}
