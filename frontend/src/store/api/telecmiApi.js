import { apiSlice } from './apiSlice'
import { appendBranchQueryParams } from '../../utils/branchQueryParams'

export const telecmiApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    makeTeleCMIAgentCall: builder.mutation({
      query: (body) => ({
        url: '/telecmi/agent-call',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['TeleCMICallLog'],
    }),
    getTeleCMICallLogs: builder.query({
      query: (params = {}) => {
        const { page, limit, variant, search, branch, callDateFrom, callDateTo } = params
        const queryParams = new URLSearchParams()
        if (page) queryParams.append('page', page)
        if (limit) queryParams.append('limit', limit)
        if (variant) queryParams.append('variant', variant)
        if (search) queryParams.append('search', search)
        if (callDateFrom) queryParams.append('callDateFrom', callDateFrom)
        if (callDateTo) queryParams.append('callDateTo', callDateTo)
        appendBranchQueryParams(queryParams, branch)
        const qs = queryParams.toString()
        return `/telecmi/call-logs${qs ? `?${qs}` : ''}`
      },
      providesTags: ['TeleCMICallLog'],
    }),
  }),
})

export const {
  useMakeTeleCMIAgentCallMutation,
  useGetTeleCMICallLogsQuery,
} = telecmiApi
