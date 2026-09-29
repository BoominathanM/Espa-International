import mongoose from 'mongoose'
import User from '../models/User.js'
import LoginHistory from '../models/LoginHistory.js'
import UserSession from '../models/UserSession.js'
import UserModuleActivity from '../models/UserModuleActivity.js'
import { istDateKey, parseIstDateRange } from '../utils/istDateRange.js'
import { parseRequestedBranchIds } from '../utils/branchAccess.js'
import { ONLINE_WINDOW_MS, AWAY_AFTER_MS, presenceFromSessions } from '../utils/userPresence.js'

// No heartbeat for this long → the session is over (it ends at its lastSeenAt).
const SESSION_TIMEOUT_MS = 5 * 60 * 1000
// A heartbeat may report at most (time since the previous heartbeat + grace) of active time.
const FLUSH_GRACE_MS = 2 * 60 * 1000
const MAX_FLUSH_MS = 15 * 60 * 1000
const MAX_ENTRIES = 60
const MAX_RANGE_DAYS = 93
const SESSIONS_PER_USER = 30
const DAY_MS = 24 * 60 * 60 * 1000

const MODULE_KEYS = new Set([
  'dashboard',
  'leads',
  'calls',
  'appointmentBookings',
  'customers',
  'reports',
  'settings',
  'other',
])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return String(forwarded).split(',')[0].trim()
  return req.headers['x-real-ip'] || req.headers['cf-connecting-ip'] || req.ip || req.socket?.remoteAddress || ''
}

// The tracker sends text/plain JSON (keeps it a simple CORS request and works with keepalive).
const parseBody = (req) => {
  const raw = req.body
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' ? raw : {}
}

const cleanSessionId = (value) => {
  const s = String(value || '').trim()
  return SESSION_ID_RE.test(s) ? s : ''
}

const cleanModule = (value) => {
  const s = String(value || '').trim()
  return MODULE_KEYS.has(s) ? s : ''
}

const cleanTab = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120)

const toSeconds = (ms) => Math.max(0, Math.round((Number(ms) || 0) / 1000))

/** Validate + merge the tracker's { date, module, tab, ms } entries. */
const normalizeEntries = (rawEntries, now) => {
  if (!Array.isArray(rawEntries)) return []
  const allowedDates = new Set([-2, -1, 0, 1].map((d) => istDateKey(now.getTime() + d * DAY_MS)))
  const merged = new Map()
  for (const entry of rawEntries.slice(0, MAX_ENTRIES)) {
    if (!entry || typeof entry !== 'object') continue
    const date = String(entry.date || '').trim()
    const module = cleanModule(entry.module)
    const tab = cleanTab(entry.tab)
    const ms = Number(entry.ms)
    if (!DATE_RE.test(date) || !allowedDates.has(date) || !module || !Number.isFinite(ms) || ms <= 0) continue
    const key = JSON.stringify([date, module, tab])
    const prevMs = merged.get(key)?.ms || 0
    merged.set(key, { date, module, tab, ms: Math.min(prevMs + ms, MAX_FLUSH_MS) })
  }
  return [...merged.values()]
}

/** $inc the per-day module/tab rows; returns the milliseconds actually recorded. */
const recordEntries = async (userId, entries, allowedMs, now) => {
  const totalMs = entries.reduce((sum, e) => sum + e.ms, 0)
  if (!totalMs || allowedMs <= 0) return 0
  const scale = totalMs > allowedMs ? allowedMs / totalMs : 1

  let recordedMs = 0
  const ops = []
  for (const e of entries) {
    const ms = Math.round(e.ms * scale)
    if (ms <= 0) continue
    recordedMs += ms
    ops.push({
      updateOne: {
        filter: { user: userId, date: e.date, module: e.module, tab: e.tab },
        update: { $inc: { durationMs: ms }, $set: { lastActivityAt: now } },
        upsert: true,
      },
    })
  }
  if (!ops.length) return 0

  try {
    await UserModuleActivity.bulkWrite(ops, { ordered: false })
  } catch (error) {
    // Two tabs creating the same new row at once collide on the unique index;
    // the row exists now, so re-apply only those increments.
    const retry = (error?.writeErrors || [])
      .filter((w) => (w.code ?? w.err?.code) === 11000)
      .map((w) => ops[w.index])
      .filter(Boolean)
    if (!retry.length) throw error
    await UserModuleActivity.bulkWrite(retry, { ordered: false })
  }
  return recordedMs
}

const handleHeartbeat = async (req, res, { end = false } = {}) => {
  const now = new Date()
  const body = parseBody(req)
  const clientSessionId = cleanSessionId(body.sessionId)
  if (!clientSessionId) {
    return res.status(400).json({ success: false, message: 'A valid sessionId is required' })
  }

  const userId = req.user._id
  // Another account logged in on this browser since the tracker captured this data.
  if (body.userId && String(body.userId) !== String(userId)) {
    return res.status(409).json({ success: false, message: 'Activity belongs to a different user' })
  }
  const entries = normalizeEntries(body.entries, now)
  const idleMs = Number(body.idleMs)
  const set = {
    lastSeenAt: now,
    currentModule: cleanModule(body.module),
    currentTab: cleanTab(body.tab),
  }
  if (end) {
    set.endedAt = now
    set.endReason = 'logout'
  }
  const update = { $set: set }
  if (Number.isFinite(idleMs) && idleMs >= 0) {
    update.$max = { lastActiveAt: new Date(now.getTime() - Math.min(idleMs, DAY_MS)) }
  }

  const openSession = {
    user: userId,
    clientSessionId,
    endedAt: null,
    lastSeenAt: { $gte: new Date(now.getTime() - SESSION_TIMEOUT_MS) },
  }

  let previous
  if (end) {
    previous = await UserSession.findOneAndUpdate(openSession, update, { sort: { lastSeenAt: -1 } }).lean()
  } else {
    update.$setOnInsert = {
      startedAt: now,
      ipAddress: getClientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    }
    // Returns the pre-update document, or null when a new session was started.
    previous = await UserSession.findOneAndUpdate(openSession, update, {
      sort: { lastSeenAt: -1 },
      upsert: true,
    }).lean()
  }

  const previousSeenMs = previous?.lastSeenAt ? new Date(previous.lastSeenAt).getTime() : now.getTime()
  const allowedMs = Math.min(MAX_FLUSH_MS, Math.max(0, now.getTime() - previousSeenMs) + FLUSH_GRACE_MS)
  const recordedMs = await recordEntries(userId, entries, allowedMs, now)

  return res.json({ success: true, recordedMs, serverTime: now.toISOString() })
}

// @desc    Activity heartbeat: keeps the login session alive and records module/tab time
// @route   POST /api/activity/heartbeat
// @access  Private
export const recordHeartbeat = async (req, res) => {
  try {
    await handleHeartbeat(req, res)
  } catch (error) {
    console.error('[UserActivity] Heartbeat error:', error)
    res.status(500).json({ success: false, message: 'Failed to record activity' })
  }
}

// @desc    Close the current login session (called by the frontend just before logout)
// @route   POST /api/activity/end
// @access  Private
export const endSession = async (req, res) => {
  try {
    await handleHeartbeat(req, res, { end: true })
  } catch (error) {
    console.error('[UserActivity] End session error:', error)
    res.status(500).json({ success: false, message: 'Failed to end session' })
  }
}

const describeDevice = (userAgent = '') => {
  const ua = String(userAgent)
  if (!ua) return ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} · ${os}` : browser
}

const branchLabel = (user) => {
  if (user.allBranches) return 'All branches'
  const names = []
  const seen = new Set()
  for (const b of [user.branch, ...(Array.isArray(user.branches) ? user.branches : [])]) {
    const name = b?.name
    if (name && !seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }
  return names.join(', ')
}

/** Clip sessions to [rangeStart, rangeEnd] and merge overlaps (multiple tabs/devices never double count). */
const mergeSessionIntervals = (sessions, rangeStart, rangeEnd) => {
  const intervals = []
  for (const s of sessions) {
    const start = Math.max(new Date(s.startedAt).getTime(), rangeStart)
    const end = Math.min(new Date(s.endedAt || s.lastSeenAt).getTime(), rangeEnd)
    if (end > start) intervals.push([start, end])
  }
  intervals.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

const resolveRange = (query, now) => {
  const todayKey = istDateKey(now)
  let from = String(query.from || query.date || todayKey).trim()
  let to = String(query.to || query.date || from).trim()
  if (!DATE_RE.test(from)) from = todayKey
  if (!DATE_RE.test(to)) to = from
  if (from > to) [from, to] = [to, from]
  let range = parseIstDateRange(from, to)
  if (!range) {
    from = todayKey
    to = todayKey
    range = parseIstDateRange(from, to)
  }
  if (range.to.getTime() - range.from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    from = istDateKey(range.to.getTime() - (MAX_RANGE_DAYS - 1) * DAY_MS)
    range = parseIstDateRange(from, to)
  }
  return { from, to, range }
}

// @desc    Login time + module/tab time per user. Superadmin sees every user, everyone else only themselves.
// @route   GET /api/activity/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=<id>&userId=<id>
// @access  Private
export const getActivitySummary = async (req, res) => {
  try {
    const now = new Date()
    const nowMs = now.getTime()
    const { from, to, range } = resolveRange(req.query, now)
    const isSuperAdmin = req.user.role === 'superadmin'

    const userFilter = {}
    if (isSuperAdmin) {
      if (req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) {
        userFilter._id = new mongoose.Types.ObjectId(req.query.userId)
      }
      const branchIds = (parseRequestedBranchIds(req.query.branch) || [])
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id))
      if (branchIds.length) {
        userFilter.$or = [
          { branch: { $in: branchIds } },
          { branches: { $in: branchIds } },
          { allBranches: true },
        ]
      }
    } else {
      userFilter._id = req.user._id
    }

    const users = await User.find(userFilter)
      .select('name email role status branch branches allBranches')
      .populate('branch', 'name')
      .populate('branches', 'name')
      .sort({ name: 1 })
      .lean()
    const userIds = users.map((u) => u._id)

    const [sessions, activityRows, lastLogins, liveSessions] = await Promise.all([
      UserSession.find({
        user: { $in: userIds },
        startedAt: { $lte: range.to },
        lastSeenAt: { $gte: range.from },
      })
        .select('user startedAt lastSeenAt endedAt endReason ipAddress userAgent')
        .sort({ startedAt: -1 })
        .lean(),
      UserModuleActivity.aggregate([
        { $match: { user: { $in: userIds }, date: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { user: '$user', module: '$module', tab: '$tab' },
            ms: { $sum: '$durationMs' },
          },
        },
      ]),
      LoginHistory.aggregate([
        { $match: { user: { $in: userIds }, status: 'Success' } },
        { $group: { _id: '$user', lastLoginAt: { $max: '$createdAt' } } },
      ]),
      UserSession.find({
        user: { $in: userIds },
        endedAt: null,
        lastSeenAt: { $gte: new Date(nowMs - ONLINE_WINDOW_MS) },
      })
        .select('user lastSeenAt lastActiveAt currentModule currentTab')
        .lean(),
    ])

    const group = (rows, getUserId) => {
      const map = new Map()
      for (const row of rows) {
        const key = String(getUserId(row))
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(row)
      }
      return map
    }
    const sessionsByUser = group(sessions, (s) => s.user)
    const activityByUser = group(activityRows, (r) => r._id.user)
    const liveByUser = group(liveSessions, (s) => s.user)
    const lastLoginByUser = new Map(lastLogins.map((r) => [String(r._id), r.lastLoginAt]))

    const rangeStart = range.from.getTime()
    const rangeEnd = Math.min(range.to.getTime(), nowMs)
    const moduleTotals = new Map()

    const list = []
    for (const user of users) {
      const id = String(user._id)
      const userSessions = sessionsByUser.get(id) || []

      const intervals = mergeSessionIntervals(userSessions, rangeStart, rangeEnd)
      const sessionMs = intervals.reduce((sum, [start, end]) => sum + (end - start), 0)

      const moduleMap = new Map()
      let activeMs = 0
      for (const row of activityByUser.get(id) || []) {
        const moduleKey = row._id.module
        const tab = row._id.tab || ''
        const entry = moduleMap.get(moduleKey) || { ms: 0, tabs: new Map() }
        entry.ms += row.ms
        entry.tabs.set(tab, (entry.tabs.get(tab) || 0) + row.ms)
        moduleMap.set(moduleKey, entry)
        activeMs += row.ms
        moduleTotals.set(moduleKey, (moduleTotals.get(moduleKey) || 0) + row.ms)
      }
      const modules = [...moduleMap.entries()]
        .map(([module, entry]) => ({
          module,
          seconds: toSeconds(entry.ms),
          tabs: [...entry.tabs.entries()]
            .map(([tab, ms]) => ({ tab, seconds: toSeconds(ms) }))
            .filter((t) => t.seconds > 0)
            .sort((a, b) => b.seconds - a.seconds),
        }))
        .filter((m) => m.seconds > 0)
        .sort((a, b) => b.seconds - a.seconds)

      // Active time is measured inside sessions, so login time can never be lower than it.
      const loginMs = Math.max(sessionMs, activeMs)

      const { status, currentModule, currentTab } = presenceFromSessions(liveByUser.get(id) || [], nowMs)

      if (user.status !== 'active' && loginMs === 0 && status === 'offline') continue

      list.push({
        userId: id,
        name: user.name || '',
        email: user.email || '',
        role: user.role || '',
        accountStatus: user.status || 'active',
        branch: branchLabel(user),
        status,
        currentModule,
        currentTab,
        lastLoginAt: lastLoginByUser.get(id) || null,
        firstSeenAt: intervals.length ? new Date(intervals[0][0]).toISOString() : null,
        lastSeenAt: intervals.length ? new Date(intervals[intervals.length - 1][1]).toISOString() : null,
        loginSeconds: toSeconds(loginMs),
        activeSeconds: toSeconds(activeMs),
        idleSeconds: toSeconds(loginMs - activeMs),
        sessionsCount: intervals.length,
        modules,
        sessions: userSessions.slice(0, SESSIONS_PER_USER).map((s) => {
          const endMs = new Date(s.endedAt || s.lastSeenAt).getTime()
          const startMs = new Date(s.startedAt).getTime()
          return {
            id: String(s._id),
            startedAt: s.startedAt,
            endedAt: s.endedAt || null,
            lastSeenAt: s.lastSeenAt,
            durationSeconds: toSeconds(endMs - startMs),
            state: s.endedAt ? 'logout' : nowMs - new Date(s.lastSeenAt).getTime() <= ONLINE_WINDOW_MS ? 'active' : 'timeout',
            ipAddress: s.ipAddress || '',
            device: describeDevice(s.userAgent),
          }
        }),
      })
    }

    list.sort((a, b) => b.loginSeconds - a.loginSeconds || a.name.localeCompare(b.name))

    const totals = {
      users: list.length,
      loggedIn: list.filter((u) => u.loginSeconds > 0).length,
      online: list.filter((u) => u.status === 'online').length,
      away: list.filter((u) => u.status === 'away').length,
      loginSeconds: list.reduce((sum, u) => sum + u.loginSeconds, 0),
      activeSeconds: list.reduce((sum, u) => sum + u.activeSeconds, 0),
      modules: [...moduleTotals.entries()]
        .map(([module, ms]) => ({ module, seconds: toSeconds(ms) }))
        .filter((m) => m.seconds > 0)
        .sort((a, b) => b.seconds - a.seconds),
    }

    res.json({
      success: true,
      scope: isSuperAdmin ? 'all' : 'self',
      range: { from, to },
      generatedAt: now.toISOString(),
      thresholds: {
        awayAfterMinutes: AWAY_AFTER_MS / 60000,
        sessionTimeoutMinutes: SESSION_TIMEOUT_MS / 60000,
      },
      totals,
      users: list,
    })
  } catch (error) {
    console.error('[UserActivity] Summary error:', error)
    res.status(500).json({ success: false, message: 'Failed to load user activity' })
  }
}
