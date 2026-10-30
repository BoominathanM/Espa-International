import WhatsAppSettings from '../models/WhatsAppSettings.js'
import WhatsAppTemplate from '../models/WhatsAppTemplate.js'
import WhatsAppEventMapping from '../models/WhatsAppEventMapping.js'
import Branch from '../models/Branch.js'
import { getPublicBaseUrl, toAskEvaRecipient } from '../services/chatService.js'
import { checkAskEvaConnection } from '../services/whatsappTemplateService.js'

const LOG = '[WA-SETTINGS]'
const str = (v) => (v === null || v === undefined ? '' : String(v).trim())
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''))
const URL_RE = /^https?:\/\/\S+$/i

const toView = (account) => ({
  _id: account._id,
  name: account.name,
  backendUrl: account.backendUrl,
  apiKey: account.apiKey,
  phoneNumber: account.phoneNumber,
  branch: account.branch,
  isDefault: !!account.isDefault,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
})

// @desc    Get the default WhatsApp account
// @route   GET /api/whatsapp-settings
// @access  Private (Super Admin only)
export const getWhatsAppSettings = async (req, res) => {
  try {
    const settings = await WhatsAppSettings.getSettings()

    res.json({ success: true, settings: toView(settings) })
  } catch (error) {
    console.error('Get WhatsApp settings error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

// @desc    Update the default WhatsApp account's Backend URL + API Key
// @route   PUT /api/whatsapp-settings
// @access  Private (Super Admin only)
export const updateWhatsAppSettings = async (req, res) => {
  try {
    const { backendUrl, apiKey } = req.body

    // Validate required fields
    if (!backendUrl || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Backend URL and API Key are required',
      })
    }

    // Validate URL format (only if backendUrl is provided)
    if (backendUrl && backendUrl.trim()) {
      const urlRegex = /^https?:\/\/.+/
      if (!urlRegex.test(backendUrl.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid backend URL',
        })
      }
    }

    const settings = await WhatsAppSettings.getSettings()
    settings.backendUrl = backendUrl.trim()
    settings.apiKey = apiKey.trim()
    settings.lastUpdatedBy = req.user?._id || null
    await settings.save()

    res.json({
      success: true,
      message: 'WhatsApp settings updated successfully',
      settings: toView(settings),
    })
  } catch (error) {
    console.error('Update WhatsApp settings error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

/* ------------------------------------------------------------------------------------------
 * WhatsApp accounts (Settings → WhatsApp API → WhatsApp Configuration)
 * ------------------------------------------------------------------------------------------ */

/** The account fields of a request, cleaned, plus what is wrong with them. */
const readAccountBody = (body = {}) => {
  const data = {
    name: str(body.name),
    backendUrl: str(body.backendUrl).replace(/\/+$/, ''),
    apiKey: str(body.apiKey),
    phoneNumber: toAskEvaRecipient(body.phoneNumber),
    branch: str(body.branch) || null,
    isDefault: !!body.isDefault,
  }
  let error = ''
  if (!data.name) error = 'Account name is required'
  else if (!URL_RE.test(data.backendUrl)) error = 'Enter a valid Backend URL (https://…)'
  else if (!data.apiKey) error = 'WhatsApp API Key is required'
  else if (data.phoneNumber.length < 11 || data.phoneNumber.length > 15) error = 'Enter the WhatsApp number with country code'
  else if (data.branch && !isObjectId(data.branch)) error = 'Invalid branch'
  return { data, error }
}

/** Why these values can't be saved next to the other accounts, or ''. */
const findClash = async (data, excludeId) => {
  const others = await WhatsAppSettings.find(excludeId ? { _id: { $ne: excludeId } } : {}).lean()
  const sameName = others.find((a) => a.name.toLowerCase() === data.name.toLowerCase())
  if (sameName) return `An account named "${sameName.name}" already exists`
  const sameNumber = others.find((a) => a.phoneNumber && a.phoneNumber === data.phoneNumber)
  if (sameNumber) return `This WhatsApp number is already used by "${sameNumber.name}"`
  if (data.branch) {
    if (!(await Branch.exists({ _id: data.branch }))) return 'Branch not found'
    const sameBranch = others.find((a) => String(a.branch) === String(data.branch))
    if (sameBranch) return `This branch is already assigned to "${sameBranch.name}"`
  }
  return ''
}

/** Only one default: the others lose it when this account takes it. */
const clearOtherDefaults = (id) => WhatsAppSettings.updateMany({ _id: { $ne: id }, isDefault: true }, { $set: { isDefault: false } })

// @route GET /api/whatsapp-settings/accounts
export const listWhatsAppAccounts = async (req, res) => {
  try {
    const accounts = await WhatsAppSettings.find({})
      .sort({ isDefault: -1, createdAt: 1 })
      .populate('branch', 'name')
      .lean()
    const [templates, events] = await Promise.all(
      [WhatsAppTemplate, WhatsAppEventMapping].map((model) =>
        model.aggregate([{ $group: { _id: '$account', count: { $sum: 1 } } }])
      )
    )
    const countOf = (rows, id) => rows.find((r) => String(r._id) === String(id))?.count || 0
    const base = getPublicBaseUrl(req)
    res.json({
      success: true,
      accounts: accounts.map((a) => ({
        ...toView(a),
        templateCount: countOf(templates, a._id),
        eventCount: countOf(events, a._id),
        webhookUrl: `${base}/api/whatsapp/webhook?account=${a._id}`,
      })),
    })
  } catch (error) {
    console.error(LOG, 'list accounts error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to load WhatsApp accounts' })
  }
}

// @route POST /api/whatsapp-settings/accounts
export const createWhatsAppAccount = async (req, res) => {
  try {
    const { data, error } = readAccountBody(req.body)
    if (error) return res.status(400).json({ success: false, message: error })
    const clash = await findClash(data)
    if (clash) return res.status(409).json({ success: false, message: clash })

    // The first account is the default — nothing could send otherwise
    if (!(await WhatsAppSettings.exists({}))) data.isDefault = true
    const account = await WhatsAppSettings.create({ ...data, lastUpdatedBy: req.user?._id || null })
    if (account.isDefault) await clearOtherDefaults(account._id)
    res.status(201).json({ success: true, message: 'WhatsApp account added', account: toView(account) })
  } catch (error) {
    console.error(LOG, 'create account error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to add WhatsApp account' })
  }
}

// @route PUT /api/whatsapp-settings/accounts/:id
export const updateWhatsAppAccount = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid account id' })
    const account = await WhatsAppSettings.findById(id)
    if (!account) return res.status(404).json({ success: false, message: 'WhatsApp account not found' })

    const { data, error } = readAccountBody(req.body)
    if (error) return res.status(400).json({ success: false, message: error })
    const clash = await findClash(data, account._id)
    if (clash) return res.status(409).json({ success: false, message: clash })

    Object.assign(account, data, { lastUpdatedBy: req.user?._id || null })
    await account.save()
    if (account.isDefault) await clearOtherDefaults(account._id)
    res.json({ success: true, message: 'WhatsApp account saved', account: toView(account) })
  } catch (error) {
    console.error(LOG, 'update account error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to save WhatsApp account' })
  }
}

/**
 * The account's templates and event mappings go with it; sent-message history is kept.
 * The default account can't be deleted: branches without their own account depend on it.
 * @route DELETE /api/whatsapp-settings/accounts/:id
 */
export const deleteWhatsAppAccount = async (req, res) => {
  try {
    const { id } = req.params
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid account id' })
    const account = await WhatsAppSettings.findById(id)
    if (!account) return res.status(404).json({ success: false, message: 'WhatsApp account not found' })
    if (account.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'This is the default account. Make another account the default first (or switch Default off here).',
      })
    }
    await Promise.all([
      WhatsAppTemplate.deleteMany({ account: account._id }),
      WhatsAppEventMapping.deleteMany({ account: account._id }),
      account.deleteOne(),
    ])
    res.json({ success: true, message: 'WhatsApp account deleted' })
  } catch (error) {
    console.error(LOG, 'delete account error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to delete WhatsApp account' })
  }
}

/**
 * Check a Backend URL + API Key (saved or still in the form) against AskEVA.
 * @route POST /api/whatsapp-settings/accounts/test   body: { name, backendUrl, apiKey }
 */
export const testWhatsAppAccount = async (req, res) => {
  try {
    const result = await checkAskEvaConnection({
      name: str(req.body?.name) || 'New account',
      backendUrl: str(req.body?.backendUrl),
      apiKey: str(req.body?.apiKey),
    })
    res.status(result.ok ? 200 : 400).json({
      success: result.ok,
      message: result.ok
        ? `Connected to AskEVA — ${result.total} template(s) on this account`
        : `Connection failed — check the Backend URL and API Key. AskEVA said: ${result.error}`,
    })
  } catch (error) {
    console.error(LOG, 'test account error:', error.message)
    res.status(500).json({ success: false, message: 'Connection test failed' })
  }
}
