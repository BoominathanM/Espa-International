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

const API_BASE_URL = getApiBaseUrl()

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include', // Include cookies in requests
  prepareHeaders: (headers) => {
    // Do not force Content-Type — FormData needs multipart boundary from the browser.
    // fetchBaseQuery sets application/json automatically for plain object bodies.
    return headers
  },
})

export const apiSlice = createApi({
  baseQuery,
  tagTypes: ['User', 'Branch', 'Auth', 'Role', 'Notification', 'LoginHistory', 'WebsiteSettings', 'WhatsAppSettings', 'OzonetelSettings', 'TeleCMISettings', 'Lead', 'CallLog', 'TeleCMICallLog', 'Dashboard', 'Report', 'Customer', 'Chat'],
  endpoints: (builder) => ({}),
})