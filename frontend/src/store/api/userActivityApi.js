import { apiSlice } from './apiSlice'
import { appendBranchQueryParams } from '../../utils/branchQueryParams'

export const userActivityApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getUserActivitySummary: builder.query({
      query: ({ from, to, branch } = {}) => {
        const params = new URLSearchParams()
        if (from) params.append('from', from)
        if (to) params.append('to', to)
        appendBranchQueryParams(params, branch)
        const qs = params.toString()
        return `/activity/summary${qs ? `?${qs}` : ''}`
      },
      providesTags: ['UserActivity'],
    }),
  }),
})

export const { useGetUserActivitySummaryQuery } = userActivityApi
