import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const baseQuery = fetchBaseQuery({
  baseUrl: 'http://localhost:3001/api',
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
