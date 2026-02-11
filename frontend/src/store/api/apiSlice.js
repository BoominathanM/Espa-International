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
  prepareHeaders: (headers, { getState, endpoint }) => {
    // Don't add auth token for login endpoint
    const isLoginEndpoint = endpoint === 'login' || endpoint?.includes('login')
    
    if (!isLoginEndpoint) {
      const token = localStorage.getItem('crm_token')
      if (token) {
        headers.set('authorization', `Bearer ${token}`)
      }
    }
    
    headers.set('Content-Type', 'application/json')
    return headers
  },
})

export const apiSlice = createApi({
  baseQuery,
  tagTypes: ['User', 'Branch', 'Auth', 'Role'],
  endpoints: (builder) => ({}),
})
