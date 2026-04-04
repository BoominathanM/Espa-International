import { apiSlice } from './apiSlice'
import { appendBranchQueryParams } from '../../utils/branchQueryParams'

export const reportApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getReports: builder.query({
      query: (params = {}) => {
        const { branch, dateFrom, dateTo } = params
        const q = new URLSearchParams()
        appendBranchQueryParams(q, branch)
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
