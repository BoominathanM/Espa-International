import { apiSlice } from './apiSlice'

export const whatsappSettingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWhatsAppSettings: builder.query({
      query: () => '/whatsapp-settings',
      providesTags: ['WhatsAppSettings'],
    }),
    updateWhatsAppSettings: builder.mutation({
      query: (settingsData) => ({
        url: '/whatsapp-settings',
        method: 'PUT',
        body: settingsData,
      }),
      invalidatesTags: ['WhatsAppSettings'],
    }),
    // WhatsApp Configuration tab — one account per branch. Its list shows template / event counts.
    getWhatsAppAccounts: builder.query({
      query: () => '/whatsapp-settings/accounts',
      providesTags: ['WhatsAppSettings', 'WhatsAppTemplate', 'WhatsAppEvent'],
    }),
    createWhatsAppAccount: builder.mutation({
      query: (body) => ({ url: '/whatsapp-settings/accounts', method: 'POST', body }),
      invalidatesTags: ['WhatsAppSettings'],
    }),
    updateWhatsAppAccount: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/whatsapp-settings/accounts/${id}`, method: 'PUT', body }),
      invalidatesTags: ['WhatsAppSettings'],
    }),
    deleteWhatsAppAccount: builder.mutation({
      query: (id) => ({ url: `/whatsapp-settings/accounts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['WhatsAppSettings', 'WhatsAppTemplate', 'WhatsAppEvent'],
    }),
    testWhatsAppAccount: builder.mutation({
      query: (body) => ({ url: '/whatsapp-settings/accounts/test', method: 'POST', body }),
    }),
  }),
})

export const {
  useGetWhatsAppSettingsQuery,
  useUpdateWhatsAppSettingsMutation,
  useGetWhatsAppAccountsQuery,
  useCreateWhatsAppAccountMutation,
  useUpdateWhatsAppAccountMutation,
  useDeleteWhatsAppAccountMutation,
  useTestWhatsAppAccountMutation,
} = whatsappSettingsApi

