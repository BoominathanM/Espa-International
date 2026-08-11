import dotenv from 'dotenv'
import mongoose from 'mongoose'

dotenv.config()

const TeleCMICallLog = mongoose.model(
  'TeleCMICallLog',
  new mongoose.Schema({}, { strict: false, collection: 'telecmicalllogs' })
)
const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }))

const startedAt = new Date()
const knownDocs = new Map() // _id -> last seen status/updatedAt, to detect changes
const knownTokens = new Map() // userId -> whether they had a token last check

const log = (line) => {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`)
}

const pollCallLogs = async () => {
  const docs = await TeleCMICallLog.find({ updatedAt: { $gte: startedAt } }).sort({ updatedAt: 1 }).lean()
  for (const doc of docs) {
    const id = String(doc._id)
    const key = `${doc.status || ''}|${doc.callId || ''}|${doc.requestId || ''}`
    const prevKey = knownDocs.get(id)
    if (prevKey === key) continue
    const isNew = prevKey === undefined
    knownDocs.set(id, key)
    log(
      `${isNew ? '[CALL LOG CREATED]' : '[CALL LOG UPDATED]'} variant=${doc.variant} agent=${doc.agentCode || '-'} to=${doc.customerNumber || doc.toNumber || '-'} status=${doc.status || '-'} callId=${doc.callId || '-'} requestId=${doc.requestId || '-'} duration=${doc.duration || 0}s lead=${doc.lead || 'none'}`
    )
  }
}

const pollAgentLogins = async () => {
  const users = await User.find({ telecmiAgentId: { $exists: true, $ne: '' } })
    .select('name telecmiAgentId telecmiAgentToken telecmiAgentTokenExpiresAt')
    .lean()
  for (const u of users) {
    const id = String(u._id)
    const hasToken = !!u.telecmiAgentToken
    const prevHasToken = knownTokens.get(id)
    if (prevHasToken === undefined) {
      knownTokens.set(id, hasToken)
      continue // don't report pre-existing state on first poll, only new transitions
    }
    if (hasToken && !prevHasToken) {
      log(`[AGENT LOGIN] user=${u.name} telecmiAgentId=${u.telecmiAgentId} token acquired, expires=${u.telecmiAgentTokenExpiresAt}`)
    }
    knownTokens.set(id, hasToken)
  }
}

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI)
  log('[WATCHER READY] connected to MongoDB, watching TeleCMICallLog + User agent tokens...')

  // seed knownTokens without reporting so we only report *new* logins from here on
  await pollAgentLogins()

  setInterval(async () => {
    try {
      await pollCallLogs()
      await pollAgentLogins()
    } catch (e) {
      log(`[WATCHER ERROR] ${e.message}`)
    }
  }, 1500)
}

run().catch((e) => {
  log(`[WATCHER FATAL] ${e.message}`)
  process.exit(1)
})
