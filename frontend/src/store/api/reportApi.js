import { apiSlice } from './apiSlice'

export const reportApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getReports: builder.query({
      query: (params = {}) => {
        const { branch, dateFrom, dateTo } = params
        const q = new URLSearchParams()
        if (branch && branch !== 'all') q.append('branch', branch)
        if (dateFrom) q.append('dateFrom', dateFrom)
        if (dateTo) q.append('dateTo', dateTo)
        const qs = q.toString()
        return `/reports${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Report'],
    }),
  }),
})

export const { useGetReportsQuery } = reportApi
