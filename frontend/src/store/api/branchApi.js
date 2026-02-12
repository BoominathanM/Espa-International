import { apiSlice } from './apiSlice'

export const branchApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getBranches: builder.query({
      query: () => '/branches',
      providesTags: ['Branch'],
    }),
    getBranch: builder.query({
      query: (id) => `/branches/${id}`,
      providesTags: (result, error, id) => [{ type: 'Branch', id }],
    }),
    createBranch: builder.mutation({
      query: (branchData) => ({
        url: '/branches',
        method: 'POST',
        body: branchData,
      }),
      invalidatesTags: ['Branch', 'User'],
    }),
    updateBranch: builder.mutation({
      query: ({ id, ...branchData }) => ({
        url: `/branches/${id}`,
        method: 'PUT',
        body: branchData,
      }),
      invalidatesTags: ['Branch', 'User'],
    }),
    deleteBranch: builder.mutation({
      query: ({ id, targetBranchId }) => {
        const params = new URLSearchParams()
        if (targetBranchId) {
          params.append('targetBranchId', targetBranchId)
        }
        const queryString = params.toString()
        return {
          url: `/branches/${id}${queryString ? `?${queryString}` : ''}`,
          method: 'DELETE',
        }
      },
      invalidatesTags: ['Branch', 'User'],
    }),
  }),
})

export const {
  useGetBranchesQuery,
  useGetBranchQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
} = branchApi
