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
  }),
})

export const {
  useGetWhatsAppSettingsQuery,
  useUpdateWhatsAppSettingsMutation,
} = whatsappSettingsApi

