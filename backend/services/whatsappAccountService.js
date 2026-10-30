/**
 * Which WhatsApp (AskEVA) account a message belongs to. Accounts live in the database only
 * (Settings → API & Integrations → WhatsApp API → WhatsApp Configuration):
 *
 *   branch   → the account assigned to that branch, else the default account
 *   chat     → the number the customer wrote to in the last 24 h (WhatsApp only delivers free text
 *              inside that session, and only from that number), else the customer's branch account
 *   inbound  → the account named in the webhook URL (?account=<id>) or the API key it sent, else
 *              the business number in the payload's metadata
 */
import WhatsAppSettings from '../models/WhatsAppSettings.js'
import WhatsAppEventMapping from '../models/WhatsAppEventMapping.js'
import WhatsAppTemplate from '../models/WhatsAppTemplate.js'
import WhatsAppEventLog from '../models/WhatsAppEventLog.js'
import ChatMessage from '../models/ChatMessage.js'
import Branch from '../models/Branch.js'

const LOG = '[WA-ACCOUNTS]'
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000
const FIRST_ACCOUNT_NAME = 'Main WhatsApp Account'

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v || ''))
const str = (v) => (v === null || v === undefined ? '' : String(v).trim())
const tail10 = (v) => String(v ?? '').replace(/\D/g, '').slice(-10)

export const getDefaultAccount = () => WhatsAppSettings.findOne({ isDefault: true }).lean()

export const getAccountById = (id) => (isObjectId(id) ? WhatsAppSettings.findById(id).lean() : null)

/** The account a Settings screen works on: the chosen one, else the default, else the oldest. */
export const accountForSettings = async (id) => {
  if (id) return getAccountById(id)
  return (await getDefaultAccount()) || WhatsAppSettings.findOne().sort({ createdAt: 1 }).lean()
}

/** The account that sends for a branch: its own, else the default (null when there is neither). */
export const accountForBranch = async (branchId) => {
  if (branchId) {
    const own = await WhatsAppSettings.findOne({ branch: branchId }).lean()
    if (own) return own
  }
  return getDefaultAccount()
}

/** The account owning a business number (any format), or null. */
export const accountForBusinessNumber = async (number) => {
  const tail = tail10(number)
  if (tail.length !== 10) return null
  return WhatsAppSettings.findOne({ phoneNumber: new RegExp(`${tail}$`) }).lean()
}

/**
 * The account a Live Chat message to this customer goes out on.
 * @param {string} o.phone  the customer's number, digits with country code (ChatMessage.from)
 * @param {string} o.branch the customer's branch id
 */
export const accountForChat = async ({ phone, branch }) => {
  if (phone) {
    const lastInbound = await ChatMessage.findOne({
      direction: 'inbound',
      from: phone,
      timestamp: { $gte: new Date(Date.now() - SESSION_WINDOW_MS) },
    })
      .sort({ timestamp: -1 })
      .select('whatsappAccount to')
      .lean()
    if (lastInbound) {
      const account =
        (await getAccountById(lastInbound.whatsappAccount)) || (await accountForBusinessNumber(lastInbound.to))
      if (account) return account
    }
  }
  return accountForBranch(branch)
}

/** Which account a webhook call is for, when it says so. Never throws (webhooks must not fail). */
export const accountFromWebhook = async (req) => {
  try {
    const named = await getAccountById(req.query?.account)
    if (named) return named
    const key = str(
      req.header('X-WhatsApp-API-Key') || req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '')
    )
    return key ? await WhatsAppSettings.findOne({ apiKey: key }).lean() : null
  } catch (err) {
    console.error(LOG, 'webhook account lookup failed:', err.message)
    return null
  }
}

/** Every API key the webhooks accept. */
export const allAccountKeys = async () => {
  const accounts = await WhatsAppSettings.find({ apiKey: { $ne: '' } }).select('apiKey').lean()
  return accounts.map((a) => str(a.apiKey))
}

/** Accounts to pull leads / appointments from, default first; one AskEVA login is only read once. */
export const accountsForSync = async () => {
  const accounts = await WhatsAppSettings.find({ apiKey: { $ne: '' }, backendUrl: { $ne: '' } })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean()
  const seen = new Set()
  return accounts.filter((a) => !seen.has(a.apiKey) && seen.add(a.apiKey))
}

/** Branch for a lead that came from an account: the account's, the default account's, else the oldest branch. */
export const leadBranchFor = async (account) => {
  const branch = account?.branch || (await getDefaultAccount())?.branch
  if (branch) return branch
  return (await Branch.findOne().sort({ createdAt: 1 }).select('_id').lean())?._id || null
}

const dropLegacyIndex = async (model, name) => {
  const indexes = await model.collection.indexes().catch(() => [])
  if (!indexes.some((i) => i.name === name)) return
  await model.collection.dropIndex(name)
  console.log(LOG, `dropped old unique index ${model.collection.name}.${name}`)
}

/**
 * Runs at startup, safe to repeat. Turns the single settings document into the first account and
 * moves existing templates / event mappings / logs onto it. The credentials that were really in
 * use win: until now the .env values overrode what was saved in Settings. From here on only the
 * saved accounts are used.
 */
export const migrateWhatsAppAccounts = async () => {
  try {
    await dropLegacyIndex(WhatsAppEventMapping, 'eventKey_1')
    await dropLegacyIndex(WhatsAppTemplate, 'templateId_1')

    const envKey = str(process.env.ASKEVA_API_TOKEN) || str(process.env.WHATSAPP_API_KEY)
    const envUrl = str(process.env.ASKEVA_MESSAGE_API_URL) || str(process.env.ASKEVA_SYNC_API_URL)
    const legacy = await WhatsAppSettings.findOne({ isDefault: { $exists: false } }).lean()
    if (legacy) {
      await WhatsAppSettings.updateOne(
        { _id: legacy._id },
        {
          $set: {
            name: legacy.name || FIRST_ACCOUNT_NAME,
            backendUrl: envUrl || legacy.backendUrl || '',
            apiKey: envKey || legacy.apiKey || '',
            isDefault: true,
          },
        }
      )
      console.log(LOG, `settings moved to WhatsApp account "${legacy.name || FIRST_ACCOUNT_NAME}"`)
    } else if (envKey && envUrl && !(await WhatsAppSettings.exists({}))) {
      await WhatsAppSettings.create({ name: FIRST_ACCOUNT_NAME, backendUrl: envUrl, apiKey: envKey, isDefault: true })
      console.log(LOG, `WhatsApp account "${FIRST_ACCOUNT_NAME}" created from .env`)
    }

    const first = await accountForSettings()
    if (!first) return
    const unowned = { account: null }
    const moved = await Promise.all(
      [WhatsAppEventMapping, WhatsAppTemplate, WhatsAppEventLog].map((m) => m.updateMany(unowned, { $set: { account: first._id } }))
    )
    const count = moved.reduce((n, r) => n + (r.modifiedCount || 0), 0)
    if (count) console.log(LOG, `${count} template(s) / event mapping(s) / log(s) moved to "${first.name}"`)
  } catch (err) {
    console.error(LOG, 'WhatsApp account migration failed:', err.message)
  }
}
