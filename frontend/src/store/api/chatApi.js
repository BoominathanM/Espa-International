import { apiSlice } from './apiSlice'

export const chatApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getChatMessages: builder.query({
      query: (params = {}) => {
        const q = new URLSearchParams()
        if (params.chatId) q.append('chatId', params.chatId)
        if (params.customerId) q.append('customerId', params.customerId)
        if (params.waId) q.append('waId', params.waId)
        if (params.phone) q.append('phone', params.phone)
        if (params.limit) q.append('limit', String(params.limit))
        const qs = q.toString()
        return `/whatsapp/chats/messages${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Chat'],
    }),
    getChats: builder.query({
      query: (params = {}) => {
        const q = new URLSearchParams()
        if (params.customerId) q.append('customerId', params.customerId)
        if (params.waId) q.append('waId', params.waId)
        if (params.phone) q.append('phone', params.phone)
        if (params.limit) q.append('limit', String(params.limit))
        const qs = q.toString()
        return `/whatsapp/chats${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Chat'],
    }),
    sendChatMessage: builder.mutation({
      query: ({ customerId, type = 'text', text = '', file, mediaUrl, filename }) => {
        const formData = new FormData()
        formData.append('customerId', customerId)
        formData.append('type', type)
        if (text) formData.append('text', text)
        if (mediaUrl) formData.append('mediaUrl', mediaUrl)
        if (filename) formData.append('filename', filename)
        if (file) formData.append('file', file)
        return {
          url: '/whatsapp/chats/send',
          method: 'POST',
          body: formData,
        }
      },
      invalidatesTags: ['Chat', 'Customer'],
    }),
  }),
})

export const {
  useGetChatMessagesQuery,
  useGetChatsQuery,
  useSendChatMessageMutation,
} = chatApi
