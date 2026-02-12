import { apiSlice } from './apiSlice'

export const notificationApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAllNotifications: builder.query({
      query: (params = {}) => {
        const queryParams = new URLSearchParams()
        if (params.user) queryParams.append('user', params.user)
        if (params.role) queryParams.append('role', params.role)
        if (params.branch) queryParams.append('branch', params.branch)
        if (params.isRead !== undefined) queryParams.append('isRead', params.isRead)
        if (params.page) queryParams.append('page', params.page)
        if (params.limit) queryParams.append('limit', params.limit)
        
        const queryString = queryParams.toString()
        return {
          url: `/notifications${queryString ? `?${queryString}` : ''}`,
          credentials: 'include',
        }
      },
      providesTags: ['Notification'],
    }),
    getRecentNotifications: builder.query({
      query: () => ({
        url: '/notifications/recent',
        credentials: 'include',
      }),
      providesTags: ['Notification'],
    }),
    markAsRead: builder.mutation({
      query: (id) => ({
        url: `/notifications/${id}/read`,
        method: 'PUT',
        credentials: 'include',
      }),
      invalidatesTags: ['Notification'],
    }),
    markAllAsRead: builder.mutation({
      query: () => ({
        url: '/notifications/mark-all-read',
        method: 'PUT',
        credentials: 'include',
      }),
      invalidatesTags: ['Notification'],
    }),
    clearAllNotifications: builder.mutation({
      query: () => ({
        url: '/notifications/clear-all',
        method: 'DELETE',
        credentials: 'include',
      }),
      invalidatesTags: ['Notification'],
    }),
    createNotification: builder.mutation({
      query: (notification) => ({
        url: '/notifications',
        method: 'POST',
        body: notification,
        credentials: 'include',
      }),
      invalidatesTags: ['Notification'],
    }),
  }),
})

export const {
  useGetAllNotificationsQuery,
  useGetRecentNotificationsQuery,
  useMarkAsReadMutation,
  useMarkAllAsReadMutation,
  useClearAllNotificationsMutation,
  useCreateNotificationMutation,
} = notificationApi
