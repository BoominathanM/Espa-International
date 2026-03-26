import { apiSlice } from './apiSlice'

export const userApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query({
      query: () => '/users',
      providesTags: ['User'],
    }),
    getUserRoleCounts: builder.query({
      query: () => '/users/role-counts',
      providesTags: ['User'],
    }),
    getUnassignedUsers: builder.query({
      query: () => '/users/unassigned',
      providesTags: ['User'],
    }),
    getUser: builder.query({
      query: (id) => `/users/${id}`,
      providesTags: (result, error, id) => [{ type: 'User', id }],
    }),
    createUser: builder.mutation({
      query: (userData) => ({
        url: '/users',
        method: 'POST',
        body: userData,
      }),
      invalidatesTags: ['User'],
    }),
    updateUser: builder.mutation({
      query: ({ id, ...userData }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: userData,
      }),
      invalidatesTags: ['User'],
    }),
    getDisablePreview: builder.query({
      query: (id) => `/users/${id}/disable-preview`,
    }),
    disableUser: builder.mutation({
      query: ({ id, reassignToUserId }) => ({
        url: `/users/${id}/disable`,
        method: 'POST',
        body: reassignToUserId ? { reassignToUserId } : {},
      }),
      invalidatesTags: ['User', 'Lead', 'Branch'],
    }),
  }),
})

export const {
  useGetUsersQuery,
  useGetUserRoleCountsQuery,
  useGetUnassignedUsersQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useLazyGetDisablePreviewQuery,
  useDisableUserMutation,
} = userApi
