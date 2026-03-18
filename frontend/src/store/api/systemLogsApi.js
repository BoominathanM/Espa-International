import { apiSlice } from './apiSlice'

export const systemLogsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getChatDeletionLogs: builder.query({
      query: ({ page = 1, limit = 50 } = {}) =>
        `/system-logs/chat-deletions?page=${page}&limit=${limit}`,
    }),
    getLeadActivityLogs: builder.query({
      query: ({ page = 1, limit = 50 } = {}) =>
        `/system-logs/lead-activity?page=${page}&limit=${limit}`,
    }),
  }),
})

export const { useGetChatDeletionLogsQuery, useGetLeadActivityLogsQuery } = systemLogsApi
