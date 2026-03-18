import { apiSlice } from './apiSlice'

export const leadApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLeads: builder.query({
      query: (params = {}) => {
        const { status, source, branch, assignedTo, search, appointmentDate, appointmentDateFrom, appointmentDateTo, hasReminders, page = 1, limit = 50 } = params
        const queryParams = new URLSearchParams()
        
        if (status) queryParams.append('status', status)
        if (source) queryParams.append('source', source)
        if (branch) queryParams.append('branch', branch)
        if (assignedTo) queryParams.append('assignedTo', assignedTo)
        if (search) queryParams.append('search', search)
        if (hasReminders) queryParams.append('hasReminders', 'true')
        if (appointmentDate) queryParams.append('appointmentDate', appointmentDate)
        if (appointmentDateFrom) queryParams.append('appointmentDateFrom', appointmentDateFrom)
        if (appointmentDateTo) queryParams.append('appointmentDateTo', appointmentDateTo)
        if (page) queryParams.append('page', page)
        if (limit) queryParams.append('limit', limit)
        
        const queryString = queryParams.toString()
        return `/leads${queryString ? `?${queryString}` : ''}`
      },
      providesTags: ['Lead'],
    }),
    getLead: builder.query({
      query: (id) => `/leads/${id}`,
      providesTags: (result, error, id) => [{ type: 'Lead', id }],
    }),
    createLead: builder.mutation({
      query: (leadData) => ({
        url: '/leads',
        method: 'POST',
        body: leadData,
      }),
      invalidatesTags: ['Lead', 'Dashboard', 'Report'],
    }),
    updateLead: builder.mutation({
      query: ({ id, ...leadData }) => ({
        url: `/leads/${id}`,
        method: 'PUT',
        body: leadData,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Lead', id }, 'Lead', 'Dashboard', 'Report'],
    }),
    deleteLead: builder.mutation({
      query: (id) => ({
        url: `/leads/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Lead', 'Dashboard', 'Report'],
    }),
    exportLeads: builder.query({
      query: (params = {}) => {
        const { status, source, branch, assignedTo, search } = params
        const queryParams = new URLSearchParams()
        queryParams.set('format', 'json')
        if (status) queryParams.append('status', status)
        if (source) queryParams.append('source', source)
        if (branch) queryParams.append('branch', branch)
        if (assignedTo) queryParams.append('assignedTo', assignedTo)
        if (search) queryParams.append('search', search)
        const queryString = queryParams.toString()
        return `/leads/export?${queryString}`
      },
    }),
    importLeads: builder.mutation({
      query: (leadsData) => ({
        url: '/leads/import',
        method: 'POST',
        body: { leads: leadsData },
      }),
      invalidatesTags: ['Lead', 'Report'],
    }),
    syncAskEvaLeads: builder.mutation({
      query: () => ({
        url: '/leads/sync-askeva',
        method: 'POST',
      }),
      invalidatesTags: ['Lead', 'Report'],
    }),
    addReminder: builder.mutation({
      query: ({ leadId, ...data }) => ({
        url: `/leads/${leadId}/reminders`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { leadId }) => [{ type: 'Lead', id: leadId }, 'Lead'],
    }),
    updateReminder: builder.mutation({
      query: ({ leadId, reminderId, ...data }) => ({
        url: `/leads/${leadId}/reminders/${reminderId}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { leadId }) => [{ type: 'Lead', id: leadId }, 'Lead'],
    }),
    deleteReminder: builder.mutation({
      query: ({ leadId, reminderId }) => ({
        url: `/leads/${leadId}/reminders/${reminderId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { leadId }) => [{ type: 'Lead', id: leadId }, 'Lead'],
    }),
    completeAppointment: builder.mutation({
      query: ({ id, completion_notes }) => ({
        url: `/leads/${id}/complete`,
        method: 'POST',
        body: { completion_notes },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Lead', id }, 'Lead'],
    }),
    rescheduleAppointment: builder.mutation({
      query: ({ id, appointment_date, slot_time, reason }) => ({
        url: `/leads/${id}/reschedule`,
        method: 'POST',
        body: { appointment_date, slot_time, reason },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Lead', id }, 'Lead'],
    }),
    addAppointmentNote: builder.mutation({
      query: ({ id, text }) => ({
        url: `/leads/${id}/appointment-notes`,
        method: 'POST',
        body: { text },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Lead', id }, 'Lead'],
    }),
  }),
})

export const {
  useGetLeadsQuery,
  useGetLeadQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useLazyExportLeadsQuery,
  useImportLeadsMutation,
  useSyncAskEvaLeadsMutation,
  useAddReminderMutation,
  useUpdateReminderMutation,
  useDeleteReminderMutation,
  useCompleteAppointmentMutation,
  useRescheduleAppointmentMutation,
  useAddAppointmentNoteMutation,
} = leadApi
