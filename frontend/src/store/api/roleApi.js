import { apiSlice } from './apiSlice'

export const roleApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getRoles: builder.query({
      query: () => '/roles',
      providesTags: ['Role'],
    }),
    getRole: builder.query({
      query: (name) => `/roles/${name}`,
      providesTags: (result, error, name) => [{ type: 'Role', id: name }],
    }),
    updateRole: builder.mutation({
      query: ({ name, permissions }) => ({
        url: `/roles/${name}`,
        method: 'PUT',
        body: { permissions },
      }),
      invalidatesTags: ['Role', 'Auth'],
    }),
    initializeRoles: builder.mutation({
      query: () => ({
        url: '/roles/initialize',
        method: 'POST',
      }),
      invalidatesTags: ['Role'],
    }),
  }),
})

export const {
  useGetRolesQuery,
  useGetRoleQuery,
  useUpdateRoleMutation,
  useInitializeRolesMutation,
} = roleApi
