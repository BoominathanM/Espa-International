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
    // Production: use Render backend URL
    return 'https://espa-international.onrender.com/api'
  }
}

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
  tagTypes: ['User', 'Branch', 'Auth', 'Role'],
  endpoints: (builder) => ({}),
})
