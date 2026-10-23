import { apiSlice } from './apiSlice'

export const googleCalendarApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Configuration comes from backend/.env; this reports what was picked up + sync health.
    getGoogleCalendarStatus: builder.query({
      query: () => '/google-calendar/status',
    }),
    testGoogleCalendar: builder.mutation({
      query: () => ({ url: '/google-calendar/test', method: 'POST' }),
    }),
    syncGoogleCalendarNow: builder.mutation({
      query: () => ({ url: '/google-calendar/sync-now', method: 'POST' }),
    }),
  }),
})

export const {
  useGetGoogleCalendarStatusQuery,
  useTestGoogleCalendarMutation,
  useSyncGoogleCalendarNowMutation,
} = googleCalendarApi
