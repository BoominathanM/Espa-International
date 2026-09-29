import { apiSlice } from './apiSlice'

// Settings → API & Integrations → WhatsApp API → "Sync Templates" and "Event Mapping" tabs.
export const whatsappAutomationApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWhatsAppTemplates: builder.query({
      query: () => '/whatsapp-settings/templates',
      providesTags: ['WhatsAppTemplate'],
    }),
    syncWhatsAppTemplates: builder.mutation({
      query: () => ({ url: '/whatsapp-settings/templates/sync', method: 'POST' }),
      invalidatesTags: ['WhatsAppTemplate'],
    }),
    getWhatsAppEvents: builder.query({
      query: () => '/whatsapp-settings/events',
      providesTags: ['WhatsAppEvent'],
    }),
    saveWhatsAppEventMapping: builder.mutation({
      query: ({ eventKey, ...body }) => ({ url: `/whatsapp-settings/events/${eventKey}`, method: 'PUT', body }),
      invalidatesTags: ['WhatsAppEvent'],
    }),
    deleteWhatsAppEventMapping: builder.mutation({
      query: (eventKey) => ({ url: `/whatsapp-settings/events/${eventKey}`, method: 'DELETE' }),
      invalidatesTags: ['WhatsAppEvent'],
    }),
    testWhatsAppEventMapping: builder.mutation({
      query: ({ eventKey, ...body }) => ({ url: `/whatsapp-settings/events/${eventKey}/test`, method: 'POST', body }),
      invalidatesTags: ['WhatsAppEventLog'],
    }),
    getRecentAiCallsForEvent: builder.query({
      query: (eventKey) => `/whatsapp-settings/events/${eventKey}/recent-calls`,
      providesTags: ['WhatsAppEventLog'],
    }),
    previewWhatsAppEventForCall: builder.mutation({
      query: ({ eventKey, ...body }) => ({ url: `/whatsapp-settings/events/${eventKey}/preview`, method: 'POST', body }),
    }),
    sendWhatsAppEventForCall: builder.mutation({
      query: ({ eventKey, ...body }) => ({ url: `/whatsapp-settings/events/${eventKey}/send-for-call`, method: 'POST', body }),
      invalidatesTags: ['WhatsAppEventLog', 'TeleCMICallLog'],
    }),
    getWhatsAppEventLogs: builder.query({
      query: ({ eventKey, page = 1, limit = 20 } = {}) => ({
        url: '/whatsapp-settings/event-logs',
        params: { eventKey, page, limit },
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
  useGetWhatsAppEventLogsQuery,
} = whatsappAutomationApi
