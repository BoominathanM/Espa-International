import { apiSlice } from './apiSlice'

export const leadApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLeads: builder.query({
      query: (params = {}) => {
        const { status, source, branch, assignedTo, search, page = 1, limit = 50 } = params
        const queryParams = new URLSearchParams()
        
        if (status) queryParams.append('status', status)
        if (source) queryParams.append('source', source)
        if (branch) queryParams.append('branch', branch)
        if (assignedTo) queryParams.append('assignedTo', assignedTo)
        if (search) queryParams.append('search', search)
        if (page) queryParams.append('page', page)
        if (limit) queryParams.append('limit', limit)
        
        const queryString = queryParams.toString()
        return `/leads${queryString ? `?${queryString}` : ''}`
      },
      providesTags: ['Lead'],
    }),
    getLead: builder.query({
      query: (id) => `/leads/${id}`,
      providesTags: (result, error, id) => [{ type: 'Lead', id }],
    }),
    createLead: builder.mutation({
      query: (leadData) => ({
        url: '/leads',
        method: 'POST',
        body: leadData,
      }),
      invalidatesTags: ['Lead'],
    }),
    updateLead: builder.mutation({
      query: ({ id, ...leadData }) => ({
        url: `/leads/${id}`,
        method: 'PUT',
        body: leadData,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Lead', id }, 'Lead'],
    }),
    deleteLead: builder.mutation({
      query: (id) => ({
        url: `/leads/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Lead'],
    }),
  }),
})

export const {
  useGetLeadsQuery,
  useGetLeadQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
} = leadApi
