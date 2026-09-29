import { apiSlice } from './apiSlice'

// Live Chat quick replies — managed in Settings → API & Integrations → WhatsApp API → Quick Replies,
// picked from the ⚡ button in the Live Chat composer.
export const quickReplyApi = apiSlice
  .enhanceEndpoints({ addTagTypes: ['QuickReply'] })
  .injectEndpoints({
    endpoints: (builder) => ({
      getQuickReplies: builder.query({
        query: ({ includeInactive = false } = {}) => ({
          url: '/whatsapp/quick-replies',
          params: includeInactive ? { includeInactive: 'true' } : undefined,
        }),
        providesTags: ['QuickReply'],
      }),
      createQuickReply: builder.mutation({
        query: (body) => ({ url: '/whatsapp/quick-replies', method: 'POST', body }),
        invalidatesTags: ['QuickReply'],
      }),
      updateQuickReply: builder.mutation({
        query: ({ id, ...body }) => ({ url: `/whatsapp/quick-replies/${id}`, method: 'PUT', body }),
        invalidatesTags: ['QuickReply'],
      }),
      deleteQuickReply: builder.mutation({
        query: (id) => ({ url: `/whatsapp/quick-replies/${id}`, method: 'DELETE' }),
        invalidatesTags: ['QuickReply'],
      }),
    }),
  })

/** The text that goes to the customer: message, then the link on its own line. */
export const composeQuickReplyText = (reply) =>
  [reply?.message, reply?.link].map((v) => String(v || '').trim()).filter(Boolean).join('\n')

export const {
  useGetQuickRepliesQuery,
  useCreateQuickReplyMutation,
  useUpdateQuickReplyMutation,
  useDeleteQuickReplyMutation,
} = quickReplyApi
