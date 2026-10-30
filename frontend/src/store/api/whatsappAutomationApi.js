import { apiSlice } from './apiSlice'

// Settings → API & Integrations → WhatsApp API → "Sync Templates" and "Event Mapping" tabs.
// Every call is for one WhatsApp account (accountId), sent as ?account=<id>.
export const whatsappAutomationApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWhatsAppTemplates: builder.query({
      query: (accountId) => ({ url: '/whatsapp-settings/templates', params: { account: accountId } }),
      providesTags: ['WhatsAppTemplate'],
    }),
    syncWhatsAppTemplates: builder.mutation({
      query: (accountId) => ({ url: '/whatsapp-settings/templates/sync', method: 'POST', params: { account: accountId } }),
      invalidatesTags: ['WhatsAppTemplate'],
    }),
    getWhatsAppEvents: builder.query({
      query: (accountId) => ({ url: '/whatsapp-settings/events', params: { account: accountId } }),
      providesTags: ['WhatsAppEvent'],
    }),
    saveWhatsAppEventMapping: builder.mutation({
      query: ({ accountId, eventKey, ...body }) => ({
        url: `/whatsapp-settings/events/${eventKey}`,
        method: 'PUT',
        params: { account: accountId },
        body,
      }),
      invalidatesTags: ['WhatsAppEvent'],
    }),
    deleteWhatsAppEventMapping: builder.mutation({
      query: ({ accountId, eventKey }) => ({
        url: `/whatsapp-settings/events/${eventKey}`,
        method: 'DELETE',
        params: { account: accountId },
      }),
      invalidatesTags: ['WhatsAppEvent'],
    }),
    testWhatsAppEventMapping: builder.mutation({
      query: ({ accountId, eventKey, ...body }) => ({
        url: `/whatsapp-settings/events/${eventKey}/test`,
        method: 'POST',
        params: { account: accountId },
        body,
      }),
      invalidatesTags: ['WhatsAppEventLog'],
    }),
    getRecentAiCallsForEvent: builder.query({
      query: ({ accountId, eventKey }) => ({
        url: `/whatsapp-settings/events/${eventKey}/recent-calls`,
        params: { account: accountId },
      }),
      providesTags: ['WhatsAppEventLog'],
    }),
    previewWhatsAppEventForCall: builder.mutation({
      query: ({ accountId, eventKey, ...body }) => ({
        url: `/whatsapp-settings/events/${eventKey}/preview`,
        method: 'POST',
        params: { account: accountId },
        body,
      }),
    }),
    sendWhatsAppEventForCall: builder.mutation({
      query: ({ eventKey, ...body }) => ({ url: `/whatsapp-settings/events/${eventKey}/send-for-call`, method: 'POST', body }),
      invalidatesTags: ['WhatsAppEventLog', 'TeleCMICallLog'],
    }),
    // Missed Call Hi Message: run the 5-minute missed-call check now
    runWhatsAppEventCheck: builder.mutation({
      query: (eventKey) => ({ url: `/whatsapp-settings/events/${eventKey}/run-check`, method: 'POST' }),
      invalidatesTags: ['WhatsAppEvent', 'WhatsAppEventLog', 'TeleCMICallLog'],
    }),
    getWhatsAppEventLogs: builder.query({
      query: ({ accountId, eventKey, page = 1, limit = 20 } = {}) => ({
        url: '/whatsapp-settings/event-logs',
        params: { account: accountId, eventKey, page, limit },
      }),
      providesTags: ['WhatsAppEventLog'],
    }),
  }),
})

export const {
  useGetWhatsAppTemplatesQuery,
  useSyncWhatsAppTemplatesMutation,
  useGetWhatsAppEventsQuery,
  useSaveWhatsAppEventMappingMutation,
  useDeleteWhatsAppEventMappingMutation,
  useTestWhatsAppEventMappingMutation,
  useGetRecentAiCallsForEventQuery,
  usePreviewWhatsAppEventForCallMutation,
  useSendWhatsAppEventForCallMutation,
  useRunWhatsAppEventCheckMutation,
  useGetWhatsAppEventLogsQuery,
} = whatsappAutomationApi
