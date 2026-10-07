import { apiSlice } from './apiSlice'

export const leadStageApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLeadStages: builder.query({
      query: () => '/lead-stages',
      providesTags: ['LeadStage'],
    }),
    createLeadStage: builder.mutation({
      query: (name) => ({
        url: '/lead-stages',
        method: 'POST',
        body: { name },
      }),
      invalidatesTags: ['LeadStage'],
    }),
    deleteLeadStage: builder.mutation({
      query: (id) => ({
        url: `/lead-stages/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['LeadStage'],
    }),
  }),
})

export const { useGetLeadStagesQuery, useCreateLeadStageMutation, useDeleteLeadStageMutation } = leadStageApi
