import { apiSlice } from './apiSlice'

export const telecmiSettingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTeleCMISettings: builder.query({
      query: () => '/telecmi-settings',
      providesTags: ['TeleCMISettings'],
    }),
    updateTeleCMISettings: builder.mutation({
      query: (settingsData) => ({
        url: '/telecmi-settings',
        method: 'PUT',
        body: settingsData,
      }),
      invalidatesTags: ['TeleCMISettings'],
    }),
    // Live read from TeleCMI (app balance, agents) — fetched on demand only.
    getTeleCMIAccountStatus: builder.query({
      query: () => '/telecmi-settings/account-status',
      keepUnusedDataFor: 0,
    }),
  }),
})

export const {
  useGetTeleCMISettingsQuery,
  useUpdateTeleCMISettingsMutation,
  useLazyGetTeleCMIAccountStatusQuery,
} = telecmiSettingsApi
