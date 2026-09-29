// Module keys match the permission keys used by the sidebar menu and the backend activity API.
export const ACTIVITY_MODULE_LABELS = {
  dashboard: 'Dashboard',
  leads: 'Lead Management',
  calls: 'Call Records',
  appointmentBookings: 'Appointment Bookings',
  customers: 'Customer Management',
  reports: 'Reports & Analytics',
  settings: 'System Settings',
  other: 'Other',
}

const MODULE_BY_SEGMENT = {
  '': 'dashboard',
  dashboard: 'dashboard',
  leads: 'leads',
  calls: 'calls',
  'appointment-bookings': 'appointmentBookings',
  customers: 'customers',
  reports: 'reports',
  settings: 'settings',
}

/** '/leads' → 'leads'; null for pages that are not tracked (login). */
export const moduleFromPath = (pathname = '') => {
  const segment = String(pathname).split('/').filter(Boolean)[0] || ''
  if (segment === 'login') return null
  return MODULE_BY_SEGMENT[segment] || 'other'
}

export const moduleLabel = (key) => ACTIVITY_MODULE_LABELS[key] || key || 'Other'

/** 18725 → '5h 12m', 750 → '12m 30s', 42 → '42s', 0 → '0m'. */
export const formatDuration = (totalSeconds) => {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0))
  if (s === 0) return '0m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return sec > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${m}m`
  return `${sec}s`
}
