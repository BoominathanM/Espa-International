import { apiSlice } from './apiSlice'

export const cloudAgentApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getCampaigns: builder.query({
      query: () => '/cloudagent/campaigns',
      providesTags: ['OzonetelSettings'],
    }),
    makeCall: builder.mutation({
      query: (body) => ({
        url: '/cloudagent/make-call',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['CallLog'],
    }),
    getCallLogs: builder.query({
      query: (params = {}) => {
        const { page, limit, type, status, agentId, search } = params
        const queryParams = new URLSearchParams()
        if (page) queryParams.append('page', page)
        if (limit) queryParams.append('limit', limit)
        if (type) queryParams.append('type', type)
        if (status) queryParams.append('status', status)
        if (agentId) queryParams.append('agentId', agentId)
        if (search) queryParams.append('search', search)
        const qs = queryParams.toString()
        return `/cloudagent/call-logs${qs ? `?${qs}` : ''}`
      },
      providesTags: ['CallLog'],
    }),
  }),
})

export const {
  useGetCampaignsQuery,
  useMakeCallMutation,
  useGetCallLogsQuery,
  useLazyGetCallLogsQuery,
} = cloudAgentApi
