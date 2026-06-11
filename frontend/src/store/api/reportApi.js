import { apiSlice } from './apiSlice'
import { appendBranchQueryParams } from '../../utils/branchQueryParams'

export const reportApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getReports: builder.query({
      query: (params = {}) => {
        const { branch, dateFrom, dateTo, reportType, details } = params
        const q = new URLSearchParams()
        appendBranchQueryParams(q, branch)
        if (dateFrom) q.append('dateFrom', dateFrom)
        if (dateTo) q.append('dateTo', dateTo)
        if (reportType) q.append('reportType', reportType)
        if (details) q.append('details', details)
        const qs = q.toString()
        return `/reports${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Report'],
      keepUnusedDataFor: 120,
    }),
  }),
})

export const { useGetReportsQuery, useLazyGetReportsQuery } = reportApi
