import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// Determine API base URL based on current window location
const getApiBaseUrl = () => {
  // Check if we're running on localhost
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === ''

  if (isLocalhost) {
    return 'http://localhost:3001/api'
  } else {
    // Any other host (production espacrm.in, dev crm.espainternational.co.in, etc.)
    // serves the API from the same origin as the frontend.
    return `${window.location.protocol}//${window.location.hostname}/api`
  }
}

export const API_BASE_URL = getApiBaseUrl()

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include', // Include cookies in requests
  prepareHeaders: (headers) => {
    // Do not force Content-Type — FormData needs multipart boundary from the browser.
    // fetchBaseQuery sets application/json automatically for plain object bodies.
    return headers
  },
})

// Fired when the server rejects the login cookie (expired, missing, or user deactivated).
// AuthContext listens for it, signs the user out and sends them to the login page instead of
// leaving every page showing empty data.
export const SESSION_EXPIRED_EVENT = 'crm:session-expired'

// Only the 401s sent by the backend `authenticate` middleware (exact messages) mean the session
// is gone. Other 401s must not log the user out: a wrong password on login / change-password, or a
// third-party API key rejection passed through by the server (e.g. CloudAgent make-call).
const SESSION_401_MESSAGES = ['No token, authorization denied', 'Token is not valid', 'User account is inactive']
// A 401 on logout needs no handling because the user is signing out anyway.
const NON_SESSION_401_PATHS = ['auth/login', 'auth/change-password', 'auth/logout']

const requestPath = (args) =>
  String(typeof args === 'string' ? args : args?.url || '')
    .split('?')[0]
    .replace(/^\/+/, '')

const isSessionRejected = (error, args) =>
  error?.status === 401 &&
  SESSION_401_MESSAGES.includes(error.data?.message) &&
  !NON_SESSION_401_PATHS.includes(requestPath(args))

const baseQueryWithSessionCheck = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions)
  if (isSessionRejected(result.error, args)) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  }
  return result
}

export const apiSlice = createApi({
  baseQuery: baseQueryWithSessionCheck,
  tagTypes: ['User', 'Branch', 'Auth', 'Role', 'Notification', 'LoginHistory', 'WebsiteSettings', 'WhatsAppSettings', 'OzonetelSettings', 'TeleCMISettings', 'Lead', 'LeadStage', 'CallLog', 'TeleCMICallLog', 'Dashboard', 'Report', 'Customer', 'Chat', 'WhatsAppTemplate', 'WhatsAppEvent', 'WhatsAppEventLog', 'UserActivity', 'FeedbackCall'],
  endpoints: (builder) => ({}),
})