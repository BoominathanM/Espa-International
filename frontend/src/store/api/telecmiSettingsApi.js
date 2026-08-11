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
  }),
})

export const {
  useGetTeleCMISettingsQuery,
  useUpdateTeleCMISettingsMutation,
} = telecmiSettingsApi
