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
    createRole: builder.mutation({
      query: ({ name, displayName, permissions }) => ({
        url: '/roles',
        method: 'POST',
        body: { name, displayName, permissions },
      }),
      invalidatesTags: ['Role'],
    }),
    deleteRole: builder.mutation({
      query: (name) => ({
        url: `/roles/${encodeURIComponent(name)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Role'],
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
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useInitializeRolesMutation,
} = roleApi
