import { apiSlice } from './apiSlice'
import { appendBranchQueryParams } from '../../utils/branchQueryParams'

export const customerApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getCustomers: builder.query({
      query: (params = {}) => {
        const q = new URLSearchParams()
        if (params.search) q.append('search', params.search)
        appendBranchQueryParams(q, params.branch)
        if (params.lastInteractionFrom) q.append('lastInteractionFrom', params.lastInteractionFrom)
        if (params.lastInteractionTo) q.append('lastInteractionTo', params.lastInteractionTo)
        const qs = q.toString()
        return `/customers${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Customer'],
    }),
    getCustomerTimeline: builder.query({
      query: (id) => `/customers/${id}/timeline`,
      providesTags: (result, error, id) => [{ type: 'Customer', id }],
    }),
    addCustomerTimelineNote: builder.mutation({
      query: ({ id, text }) => ({
        url: `/customers/${id}/timeline-notes`,
        method: 'POST',
        body: { text },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Customer', id }, 'Customer'],
    }),
    updateCustomerTimelineNote: builder.mutation({
      query: ({ id, noteId, text }) => ({
        url: `/customers/${id}/timeline-notes/${noteId}`,
        method: 'PUT',
        body: { text },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Customer', id }, 'Customer'],
    }),
    createCustomer: builder.mutation({
      query: (body) => ({ url: '/customers', method: 'POST', body }),
      invalidatesTags: ['Customer'],
    }),
    updateCustomer: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/customers/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Customer'],
    }),
    convertLeadToCustomer: builder.mutation({
      query: (leadId) => ({
        url: '/customers/from-lead',
        method: 'POST',
        body: { leadId },
      }),
      invalidatesTags: ['Customer', 'Lead', 'Dashboard'],
    }),
    // "Send feedback call" — ZenXAI feedback assistant calls this customer's mobile now.
    sendCustomerFeedbackCall: builder.mutation({
      query: (id) => ({
        url: `/customers/${id}/feedback-call`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'Customer', id }, 'TeleCMICallLog', 'FeedbackCall'],
    }),
    // ZenXAI feedback calls + responses for one customer (details modal / timeline → Feedback).
    getCustomerFeedbackCalls: builder.query({
      query: (id) => `/customers/${id}/feedback-calls`,
      providesTags: ['FeedbackCall'],
    }),
  }),
})

export const {
  useGetCustomersQuery,
  useGetCustomerTimelineQuery,
  useAddCustomerTimelineNoteMutation,
  useUpdateCustomerTimelineNoteMutation,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useConvertLeadToCustomerMutation,
  useSendCustomerFeedbackCallMutation,
  useGetCustomerFeedbackCallsQuery,
} = customerApi
