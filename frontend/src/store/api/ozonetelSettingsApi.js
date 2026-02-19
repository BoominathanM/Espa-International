import { apiSlice } from './apiSlice'

export const ozonetelSettingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getOzonetelSettings: builder.query({
      query: () => '/ozonetel-settings',
      providesTags: ['OzonetelSettings'],
    }),
    updateOzonetelSettings: builder.mutation({
      query: (settingsData) => ({
        url: '/ozonetel-settings',
        method: 'PUT',
        body: settingsData,
      }),
      invalidatesTags: ['OzonetelSettings'],
    }),
  }),
})

export const {
  useGetOzonetelSettingsQuery,
  useUpdateOzonetelSettingsMutation,
} = ozonetelSettingsApi
