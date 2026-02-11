import { apiSlice } from './apiSlice'

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
        credentials: 'include', // Include cookies
      }),
      invalidatesTags: ['Auth'],
    }),
    logout: builder.mutation({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
        credentials: 'include', // Include cookies
      }),
      invalidatesTags: ['Auth'],
    }),
    getMe: builder.query({
      query: () => ({
        url: '/auth/me',
        credentials: 'include', // Include cookies
      }),
      providesTags: ['Auth'],
    }),
  }),
})

export const { useLoginMutation, useLogoutMutation, useGetMeQuery } = authApi
