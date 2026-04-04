import { apiSlice } from './apiSlice'
import { appendBranchQueryParams } from '../../utils/branchQueryParams'

export const customerApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getCustomers: builder.query({
      query: (params = {}) => {
        const q = new URLSearchParams()
        if (params.search) q.append('search', params.search)
        appendBranchQueryParams(q, params.branch)
        const qs = q.toString()
        return `/customers${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Customer'],
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
  }),
})

export const {
  useGetCustomersQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useConvertLeadToCustomerMutation,
} = customerApi
