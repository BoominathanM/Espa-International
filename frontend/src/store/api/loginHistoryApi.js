import { apiSlice } from './apiSlice'

export const loginHistoryApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLoginHistory: builder.query({
      query: ({ page = 1, limit = 50, status, email, userId } = {}) => {
        const params = new URLSearchParams()
        params.append('page', page.toString())
        params.append('limit', limit.toString())
        if (status) params.append('status', status)
        if (email) params.append('email', email)
        if (userId) params.append('userId', userId)
        
        return {
          url: `/login-history?${params.toString()}`,
          credentials: 'include',
        }
      },
      providesTags: ['LoginHistory'],
    }),
  }),
})

export const { useGetLoginHistoryQuery } = loginHistoryApi
