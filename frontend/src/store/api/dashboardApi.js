import { apiSlice } from './apiSlice'

export const dashboardApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getDashboard: builder.query({
      query: (params = {}) => {
        const { branch, date } = params
        const queryParams = new URLSearchParams()
        if (branch && branch !== 'all') queryParams.append('branch', branch)
        if (date) queryParams.append('date', date)
        const qs = queryParams.toString()
        return `/dashboard${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Dashboard'],
    }),
  }),
})

export const { useGetDashboardQuery } = dashboardApi
