/**
 * User activity tracker (singleton).
 *
 * - Login time: a heartbeat every minute keeps a server-side session open while the CRM is open.
 * - Active time: counted per module (from the URL) and tab (the active antd Tabs / Segmented
 *   item inside the page) only while this browser tab is visible, the user interacted within
 *   the last 5 minutes, and it is the CRM tab the user used most recently (no double counting).
 *
 * Pages need no changes. To keep a Tabs/Segmented control out of the tab name, wrap it in an
 * element with a `data-activity-ignore` attribute.
 */
import { API_BASE_URL } from '../store/api/apiSlice'
import { moduleFromPath } from './activityModules'

const TICK_MS = 1000
const FLUSH_MS = 60 * 1000
const IDLE_AFTER_MS = 5 * 60 * 1000
const MAX_TICK_GAP_MS = 5000
const HIDDEN_FLUSH_MIN_GAP_MS = 10 * 1000
const LEADER_REFRESH_MS = 5000
const END_TIMEOUT_MS = 1500
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

const SESSION_KEY = 'crm_activity_session' // localStorage: { userId, id } shared by all CRM tabs
const LEADER_KEY = 'crm_activity_leader' // localStorage: { tabId, at } — tab the user used last
const PENDING_KEY = 'crm_activity_pending' // sessionStorage: this tab's unsent time (survives reload)

const INTERACTION_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll']
const TAB_SELECTOR =
  '.ant-tabs-tab-active .ant-tabs-tab-btn, .ant-segmented-item-input:checked + .ant-segmented-item-label'

const getStorage = (type) => {
  try {
    return type === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

const readJson = (type, key) => {
  try {
    const raw = getStorage(type)?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeJson = (type, key, value) => {
  try {
    getStorage(type)?.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked — tracking still works in memory
  }
}

const removeKey = (type, key) => {
  try {
    getStorage(type)?.removeItem(key)
  } catch {
    // ignore
  }
}

const randomId = () => {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '')
  } catch {
    // not a secure context
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
}

const istDateKey = (ts) => new Date(ts + IST_OFFSET_MS).toISOString().slice(0, 10)

// "Appointments (12)" → "Appointments" so changing counts don't split the same tab.
const cleanLabel = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\(\d+\)$/, '')
    .slice(0, 60)

/** Visible active tab labels inside the page content, outer → inner (max 3 levels). */
const readActiveTab = () => {
  const root = document.querySelector('.app-main-content')
  if (!root) return ''
  const parts = []
  for (const el of root.querySelectorAll(TAB_SELECTOR)) {
    if (el.closest('[data-activity-ignore]')) continue
    if (!el.getClientRects().length) continue // inside a hidden tab pane
    const label = cleanLabel(el.textContent)
    if (label && !parts.includes(label)) parts.push(label)
    if (parts.length >= 3) break
  }
  return parts.join(' › ')
}

const state = {
  started: false,
  userId: null,
  sessionId: null,
  path: '/',
  module: null,
  tab: '',
  tabId: randomId(),
  lastTick: Date.now(),
  lastInteraction: Date.now(),
  lastLeaderWrite: 0,
  lastFlushAt: 0,
  pending: {}, // "date|module|tab" -> { date, module, tab, ms }
  inFlight: null,
}

const persistPending = () => {
  if (!state.userId) return
  writeJson('session', PENDING_KEY, { userId: state.userId, entries: state.pending })
}

const addTime = (entries, date, module, tab, ms) => {
  const key = `${date}|${module}|${tab}`
  const prev = entries[key]
  entries[key] = { date, module, tab, ms: (prev?.ms || 0) + ms }
}

const isLeader = () => {
  const leader = readJson('local', LEADER_KEY)
  return !leader?.tabId || leader.tabId === state.tabId
}

const markInteraction = (force = false) => {
  const now = Date.now()
  if (!force && now - state.lastInteraction < 1000) return
  state.lastInteraction = now
  // A CRM tab opened in the background must not take over until the user actually looks at it.
  if (!state.userId || document.visibilityState !== 'visible') return
  if (force || now - state.lastLeaderWrite > LEADER_REFRESH_MS || !isLeader()) {
    state.lastLeaderWrite = now
    writeJson('local', LEADER_KEY, { tabId: state.tabId, at: now })
  }
}

const isCounting = (now) =>
  document.visibilityState === 'visible' && now - state.lastInteraction < IDLE_AFTER_MS && isLeader()

const tick = () => {
  const now = Date.now()
  const gap = now - state.lastTick
  state.lastTick = now
  if (!state.userId) return

  state.module = moduleFromPath(state.path)
  if (document.visibilityState === 'visible') {
    state.tab = state.module ? readActiveTab() : ''
  }
  if (!state.module || gap <= 0 || !isCounting(now)) return

  addTime(state.pending, istDateKey(now), state.module, state.tab, Math.min(gap, MAX_TICK_GAP_MS))
  persistPending()
}

const restorePending = (userId, snapshot) => {
  if (state.userId !== userId) return
  for (const e of Object.values(snapshot)) addTime(state.pending, e.date, e.module, e.tab, e.ms)
  persistPending()
}

const flush = ({ end = false, keepalive = false } = {}) => {
  if (!state.userId || !state.sessionId) return Promise.resolve(false)
  if (state.inFlight && !end && !keepalive) return state.inFlight

  // Follow a session id another CRM tab of the same user may have started.
  const stored = readJson('local', SESSION_KEY)
  if (stored?.userId === state.userId && stored.id) state.sessionId = stored.id

  const userId = state.userId
  const snapshot = state.pending
  state.pending = {}
  persistPending()

  const now = Date.now()
  state.lastFlushAt = now
  const entries = Object.values(snapshot)
    .filter((e) => e.ms >= 250)
    .map((e) => ({ date: e.date, module: e.module, tab: e.tab, ms: Math.round(e.ms) }))

  const request = fetch(`${API_BASE_URL}/activity/${end ? 'end' : 'heartbeat'}`, {
    method: 'POST',
    credentials: 'include',
    keepalive,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({
      sessionId: state.sessionId,
      userId,
      module: state.module || '',
      tab: state.tab || '',
      idleMs: Math.max(0, now - state.lastInteraction),
      entries,
    }),
  })
    .then((res) => {
      // 400/401/409: not attributable (bad payload, logged out, other account) — drop it.
      if (res.ok || res.status === 400 || res.status === 401 || res.status === 409) return true
      throw new Error(`HTTP ${res.status}`)
    })
    .catch(() => {
      restorePending(userId, snapshot)
      return false
    })

  if (!end && !keepalive) {
    state.inFlight = request.finally(() => {
      state.inFlight = null
    })
    return state.inFlight
  }
  return request
}

const start = () => {
  if (state.started || typeof window === 'undefined') return
  state.started = true
  state.lastTick = Date.now()

  const onInteraction = () => markInteraction(false)
  INTERACTION_EVENTS.forEach((type) => window.addEventListener(type, onInteraction, { passive: true, capture: true }))
  window.addEventListener('focus', () => markInteraction(true))

  document.addEventListener('visibilitychange', () => {
    tick()
    if (document.visibilityState === 'visible') {
      markInteraction(true)
    } else if (Date.now() - state.lastFlushAt > HIDDEN_FLUSH_MIN_GAP_MS) {
      flush({ keepalive: true })
    }
  })
  window.addEventListener('pagehide', () => {
    tick()
    flush({ keepalive: true })
  })

  window.setInterval(tick, TICK_MS)
  window.setInterval(() => flush(), FLUSH_MS)
}

/** Called by <ActivityTracker /> whenever the logged-in user changes (null on logout). */
export const setActivityUser = (userId) => {
  const next = userId ? String(userId) : null
  if (next === state.userId) return
  const previous = state.userId
  state.userId = next
  state.pending = {}
  state.inFlight = null

  if (!next) {
    state.sessionId = null
    if (previous) {
      removeKey('local', SESSION_KEY)
      removeKey('session', PENDING_KEY)
    }
    return
  }

  const stored = readJson('local', SESSION_KEY)
  if (stored?.userId === next && stored.id) {
    state.sessionId = stored.id
  } else {
    state.sessionId = randomId()
    writeJson('local', SESSION_KEY, { userId: next, id: state.sessionId })
  }

  const saved = readJson('session', PENDING_KEY)
  if (saved?.userId === next && saved.entries && typeof saved.entries === 'object') {
    for (const e of Object.values(saved.entries)) {
      if (e && e.date && e.module && Number(e.ms) > 0) addTime(state.pending, e.date, e.module, e.tab || '', Number(e.ms))
    }
  }

  state.module = moduleFromPath(state.path)
  markInteraction(true)
  start()
  flush() // open (or resume) the server session right away
}

/** Called by <ActivityTracker /> on every route change. */
export const setActivityPath = (pathname) => {
  if (state.started) tick() // attribute the time so far to the previous page
  state.path = pathname || '/'
  state.module = moduleFromPath(state.path)
  markInteraction(true)
}

/** Send the last activity and close the session. Call before the logout request; never throws. */
export const endActivitySession = async () => {
  if (!state.userId || !state.sessionId) return
  try {
    tick()
    await Promise.race([flush({ end: true }), new Promise((resolve) => setTimeout(resolve, END_TIMEOUT_MS))])
  } catch {
    // logout must never be blocked by tracking
  }
  removeKey('local', SESSION_KEY)
  removeKey('session', PENDING_KEY)
  state.sessionId = null
  state.pending = {}
}
