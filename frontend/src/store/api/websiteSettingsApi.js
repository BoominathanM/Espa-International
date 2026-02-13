import { apiSlice } from './apiSlice'

export const websiteSettingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getWebsiteSettings: builder.query({
      query: () => '/website-settings',
      providesTags: ['WebsiteSettings'],
    }),
    updateWebsiteSettings: builder.mutation({
      query: (settingsData) => ({
        url: '/website-settings',
        method: 'PUT',
        body: settingsData,
      }),
      invalidatesTags: ['WebsiteSettings'],
    }),
  }),
})

export const {
  useGetWebsiteSettingsQuery,
  useUpdateWebsiteSettingsMutation,
} = websiteSettingsApi
