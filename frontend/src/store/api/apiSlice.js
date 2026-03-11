import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { getApiBaseUrl } from '../../utils/apiConfig'

const API_BASE_URL = getApiBaseUrl()

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include', // Include cookies in requests
  prepareHeaders: (headers, { getState, endpoint }) => {
    // Cookies are automatically sent with credentials: 'include'
    // No need to manually add Authorization header for cookie-based auth
    headers.set('Content-Type', 'application/json')
    return headers
  },
})

export const apiSlice = createApi({
  baseQuery,
  tagTypes: ['User', 'Branch', 'Auth', 'Role', 'Notification', 'LoginHistory', 'WebsiteSettings', 'WhatsAppSettings', 'OzonetelSettings', 'Lead', 'CallLog'],
  endpoints: (builder) => ({}),
})
