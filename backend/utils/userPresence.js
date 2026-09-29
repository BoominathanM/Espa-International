// Shared "is this user online right now" rules for the activity summary and the dashboard Live Agents card.

// Heartbeat within this window → the user has the CRM open right now.
export const ONLINE_WINDOW_MS = 3 * 60 * 1000
// Open but no mouse/keyboard input for this long → away.
export const AWAY_AFTER_MS = 5 * 60 * 1000

const ms = (d) => (d ? new Date(d).getTime() : 0)

/**
 * Presence of ONE user from their UserSession docs
 * ({ lastSeenAt, lastActiveAt, endedAt, currentModule, currentTab }).
 * Returns { status: 'online' | 'away' | 'offline', currentModule, currentTab }.
 */
export const presenceFromSessions = (sessions = [], nowMs = Date.now()) => {
  const live = sessions.filter((s) => !s.endedAt && nowMs - ms(s.lastSeenAt) <= ONLINE_WINDOW_MS)
  if (!live.length) return { status: 'offline', currentModule: '', currentTab: '' }
  const latest = live.reduce((a, b) => (ms(b.lastSeenAt) > ms(a.lastSeenAt) ? b : a))
  const lastActiveMs = Math.max(0, ...live.map((s) => ms(s.lastActiveAt)))
  return {
    status: nowMs - lastActiveMs <= AWAY_AFTER_MS ? 'online' : 'away',
    currentModule: latest.currentModule || '',
    currentTab: latest.currentTab || '',
  }
}
