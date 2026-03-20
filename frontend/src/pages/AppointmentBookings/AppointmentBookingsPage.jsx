import React, { useState, useMemo, useEffect } from 'react'
import {
  Button,
  Input,
  Select,
  DatePicker,
  Table,
  Modal,
  Form,
  Card,
  Tabs,
  Segmented,
  Calendar,
  Space,
  App,
  Empty,
  Tag,
  Timeline,
  Dropdown,
  Spin,
  Alert,
  Avatar,
} from 'antd'
import {
  PlusOutlined,
  CalendarOutlined,
  UnorderedListOutlined,
  SearchOutlined,
  LeftOutlined,
  UpOutlined,
  DownOutlined,
  RightOutlined,
  EditOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  UserOutlined,
  IdcardOutlined,
  MessageOutlined,
  ArrowLeftOutlined,
  ScheduleOutlined,
  MoreOutlined,
  SyncOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetLeadsQuery,
  useGetLeadQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useCompleteAppointmentMutation,
  useCancelAppointmentMutation,
  useRescheduleAppointmentMutation,
  useAddAppointmentNoteMutation,
  useSyncAskEvaAppointmentsMutation,
} from '../../store/api/leadApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import dayjs from 'dayjs'
import './AppointmentBookingsPage.css'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'

const { Option } = Select

const SPA_PACKAGES = [
  'Bali Signature (2 Hours)',
  'Bamboo Massage (2 Hours)',
  'Banana Leaf Spa (2 Hours)',
  'Couple Combo (2 Hours)',
  'Cucumber Full Body Facial Signature (2 Hours)',
  'E Spa Signature (2 Hours)',
  'Full Body Facial Signature (2 Hours)',
  'Hot Stone Massage (2 Hours)',
  'Thailand Balm Signature (2 Hours)',
  'Thailand Signature (2 Hours)',
]

const SLOT_TIMES = [
  '10 AM - 12 PM',
  '12 PM - 2 PM',
  '2 PM - 4 PM',
  '4 PM - 6 PM',
  '6 PM - 8 PM',
  '8 PM - 10 PM',
]

const APPOINTMENT_TAB_STATUS = {
  current: ['New', 'In Progress'],
  rescheduled: ['Follow-Up'],
  completed: ['Converted'],
  cancelled: ['Cancelled'],
  feedbacks: [],
}

function appointmentDisplayId(lead) {
  if (!lead?._id) return '-'
  const id = String(lead._id)
  const tail = id.slice(-6).toUpperCase().replace(/[^A-F0-9]/g, '0')
  return `A${tail.padStart(6, '0')}`
}

function uiAppointmentStatus(status) {
  if (status === 'Converted') return { label: 'Completed', color: 'green' }
  if (status === 'Cancelled') return { label: 'Cancelled', color: 'red' }
  if (status === 'Follow-Up') return { label: 'Rescheduled', color: 'orange' }
  if (status === 'In Progress') return { label: 'Current', color: 'blue' }
  return { label: 'Current', color: 'blue' }
}

/** Full appointment detail: tabs persist via API (complete / reschedule / notes). */
function AppointmentDetailPanel({ leadId, onBack, isMobile, messageApi }) {
  const { data, isLoading, isFetching, error, refetch } = useGetLeadQuery(leadId)
  const [detailTab, setDetailTab] = useState('details')
  const [completeForm] = Form.useForm()
  const [cancelForm] = Form.useForm()
  const [rescheduleForm] = Form.useForm()
  const [noteForm] = Form.useForm()
  const [completeAppt, { isLoading: completing }] = useCompleteAppointmentMutation()
  const [cancelAppt, { isLoading: cancelling }] = useCancelAppointmentMutation()
  const [rescheduleAppt, { isLoading: rescheduling }] = useRescheduleAppointmentMutation()
  const [addNote, { isLoading: noteSaving }] = useAddAppointmentNoteMutation()

  const lead = data?.lead
  const isDone = lead?.status === 'Converted'
  const isCancelled = lead?.status === 'Cancelled'

  useEffect(() => {
    if (lead && detailTab === 'reschedule') {
      rescheduleForm.setFieldsValue({
        appointment_date: lead.appointment_date ? dayjs(lead.appointment_date) : null,
        slot_time: lead.slot_time || undefined,
        reason: '',
      })
    }
  }, [lead, detailTab, rescheduleForm])

  const onComplete = async () => {
    try {
      const v = await completeForm.validateFields()
      await completeAppt({ id: leadId, completion_notes: v.completion_notes }).unwrap()
      messageApi.success('Appointment marked complete')
      completeForm.resetFields()
      refetch()
    } catch (e) {
      if (e?.data?.message) messageApi.error(e.data.message)
    }
  }

  const onReschedule = async () => {
    try {
      const v = await rescheduleForm.validateFields()
      await rescheduleAppt({
        id: leadId,
        appointment_date: v.appointment_date.format('YYYY-MM-DD'),
        slot_time: v.slot_time,
        reason: v.reason || '',
      }).unwrap()
      messageApi.success('Reschedule saved')
      rescheduleForm.setFieldsValue({ reason: '' })
      refetch()
    } catch (e) {
      if (e?.data?.message) messageApi.error(e.data.message)
    }
  }

  const onCancel = async () => {
    try {
      const v = await cancelForm.validateFields()
      await cancelAppt({ id: leadId, cancellation_notes: v.cancellation_notes }).unwrap()
      messageApi.success('Appointment marked as cancelled')
      cancelForm.resetFields()
      refetch()
    } catch (e) {
      if (e?.data?.message) messageApi.error(e.data.message)
    }
  }

  const onAddNote = async () => {
    try {
      const v = await noteForm.validateFields()
      await addNote({ id: leadId, text: v.note_text }).unwrap()
      messageApi.success('Note saved')
      noteForm.resetFields()
      refetch()
    } catch (e) {
      if (e?.data?.message) messageApi.error(e.data.message)
    }
  }

  if (error) {
    return (
      <Card>
        <Alert type="error" message="Could not load appointment" showIcon />
        <Button onClick={onBack} style={{ marginTop: 16 }}>
          Back
        </Button>
      </Card>
    )
  }

  if (isLoading || !lead) {
    return (
      <Card>
        <Spin size="large" style={{ display: 'block', margin: 48 }} />
      </Card>
    )
  }

  const name = `${(lead.first_name || '').trim()} ${(lead.last_name || '').trim()}`.trim() || 'Patient'
  const st = uiAppointmentStatus(lead.status)
  const history = [...(lead.rescheduleHistory || [])].reverse()
  const logs = [...(lead.activityLogs || [])].reverse()
  const notesList = [...(lead.appointmentNoteEntries || [])].reverse()

  const detailTabItems = [
    {
      key: 'details',
      label: (
        <span>
          <UserOutlined /> Appointment Details
        </span>
      ),
      children: (
        <div className="appt-detail-body">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <div>
              <div className="appt-detail-label">Created</div>
              <div>{lead.createdAt ? dayjs(lead.createdAt).format('D/M/YYYY h:mm A') : '-'}</div>
            </div>
            <div>
              <div className="appt-detail-label">ID</div>
              <div>{appointmentDisplayId(lead)}</div>
            </div>
            <div>
              <div className="appt-detail-label">User</div>
              <div>{lead.assignedTo?.name || '-'}</div>
            </div>
            <div>
              <div className="appt-detail-label">Department</div>
              <div>{lead.branch?.name || '-'}</div>
            </div>
            <div>
              <div className="appt-detail-label">Status</div>
              <Tag color={st.color}>{st.label}</Tag>
            </div>
            <div>
              <div className="appt-detail-label">Appointment</div>
              <div>
                {lead.appointment_date ? dayjs(lead.appointment_date).format('DD/MM/YYYY') : '-'} · {lead.slot_time || '-'}
              </div>
            </div>
            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <div className="appt-detail-label">Description</div>
              <div>{lead.message || lead.notes || '-'}</div>
            </div>
            {lead.completion_notes && (
              <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                <div className="appt-detail-label">Completion notes</div>
                <div>{lead.completion_notes}</div>
              </div>
            )}
            {lead.cancellation_notes && (
              <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                <div className="appt-detail-label">Cancel notes / description</div>
                <div>{lead.cancellation_notes}</div>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'complete',
      label: (
        <span>
          <CheckCircleOutlined /> Complete
        </span>
      ),
      children: isDone ? (
        <div className="appt-detail-body">
          <Tag color="success" style={{ marginBottom: 12 }}>
            Completed
          </Tag>
          <div className="appt-detail-label">Completion notes</div>
          <div>{lead.completion_notes || '-'}</div>
        </div>
      ) : isCancelled ? (
        <Alert type="info" message="Cancelled appointments cannot be marked as complete" showIcon />
      ) : (
        <Form form={completeForm} layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item
            name="completion_notes"
            label="Completion Notes / Description"
            rules={[{ required: true, message: 'Required' }, { max: 500 }]}
          >
            <Input.TextArea rows={5} maxLength={500} showCount placeholder="Enter completion notes and details" />
          </Form.Item>
          <Space>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={completing} onClick={onComplete} className="appt-btn-success">
              Mark as Complete
            </Button>
          </Space>
        </Form>
      ),
    },
    {
      key: 'cancel',
      label: (
        <span>
          <CloseCircleOutlined /> Cancel
        </span>
      ),
      children: isCancelled ? (
        <div className="appt-detail-body">
          <Tag color="error" style={{ marginBottom: 12 }}>
            Cancelled
          </Tag>
          <div className="appt-detail-label">Cancel Notes / Description</div>
          <div>{lead.cancellation_notes || '-'}</div>
        </div>
      ) : isDone ? (
        <Alert type="info" message="Completed appointments cannot be cancelled" showIcon />
      ) : (
        <Form form={cancelForm} layout="vertical" style={{ maxWidth: 560 }}>
          <Form.Item
            name="cancellation_notes"
            label="Cancel Notes / Description"
            rules={[{ required: true, message: 'Required' }, { max: 500 }]}
          >
            <Input.TextArea rows={5} maxLength={500} showCount placeholder="Enter reason or description for cancellation" />
          </Form.Item>
          <Space>
            <Button type="primary" danger icon={<CloseCircleOutlined />} loading={cancelling} onClick={onCancel}>
              Mark as Cancel
            </Button>
          </Space>
        </Form>
      ),
    },
    {
      key: 'reschedule',
      label: (
        <span>
          <ScheduleOutlined /> Reschedule
        </span>
      ),
      children: isDone || isCancelled ? (
        <Alert type="info" message="Completed or cancelled appointments cannot be rescheduled" showIcon />
      ) : (
        <>
          <Form form={rescheduleForm} layout="vertical" style={{ maxWidth: 560 }}>
            <Form.Item name="appointment_date" label="Appointment Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="slot_time" label="Appointment Timing" rules={[{ required: true, message: 'Select time slot' }]}>
              <Select placeholder="Select Time Slot" options={SLOT_TIMES.map((t) => ({ label: t, value: t }))} />
            </Form.Item>
            <Form.Item name="reason" label="Reschedule Reason / Description" rules={[{ max: 500 }]}>
              <Input.TextArea rows={4} maxLength={500} showCount />
            </Form.Item>
            <Space>
              <Button type="primary" loading={rescheduling} onClick={onReschedule} className="appt-btn-success">
                Save Reschedule
              </Button>
            </Space>
          </Form>
          <h4 className="appt-detail-h4">Reschedule History</h4>
          <Table
            size="small"
            rowKey={(r) => r._id || `${r.newAppointmentDate}-${r.newSlot}`}
            dataSource={history}
            pagination={false}
            columns={[
              { title: 'S.No.', render: (_, __, i) => i + 1, width: 60 },
              { title: 'Description', dataIndex: 'description', ellipsis: true },
              {
                title: 'Update Date',
                render: (_, r) => (r.createdAt ? dayjs(r.createdAt).format('DD/MM/YYYY') : '-'),
              },
              {
                title: 'Update Time',
                render: (_, r) => (r.createdAt ? dayjs(r.createdAt).format('HH:mm') : '-'),
              },
            ]}
            locale={{ emptyText: 'No reschedule history yet' }}
          />
        </>
      ),
    },
    {
      key: 'activity',
      label: (
        <span>
          <HistoryOutlined /> Activity Logs
        </span>
      ),
      children: (
        <div className="appt-detail-body">
          <h4 style={{ marginBottom: 16 }}>Appointment Activity Timeline</h4>
          {logs.length === 0 ? (
            <Empty description="No activity" />
          ) : (
            <Timeline
              items={logs.map((log) => ({
                children: (
                  <div>
                    <div>{log.action}</div>
                    <div className="appt-activity-detail">{log.details}</div>
                    <div className="appt-activity-meta">
                      {log.createdAt ? dayjs(log.createdAt).format('DD/MM/YYYY, HH:mm:ss') : ''}
                    </div>
                  </div>
                ),
              }))}
            />
          )}
        </div>
      ),
    },
    {
      key: 'profile',
      label: (
        <span>
          <IdcardOutlined /> Profile
        </span>
      ),
      children: (
        <div className="appt-detail-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <Avatar size={64} style={{ background: 'var(--color-success)' }}>
              {(lead.first_name || '?')[0]}
            </Avatar>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{name}</div>
              <div className="appt-detail-label">{lead.phone || '-'}</div>
            </div>
          </div>
          <Space wrap style={{ marginBottom: 16 }}>
            <Card size="small" className="appt-detail-stat-card">
              <div style={{ fontSize: 20, fontWeight: 600 }}>1</div>
              <div className="appt-detail-stat-label">Total Visits</div>
            </Card>
            <Card size="small" className="appt-detail-stat-card">
              <div style={{ fontSize: 20, fontWeight: 600 }}>{isDone ? 1 : 0}</div>
              <div className="appt-detail-stat-label">Completed</div>
            </Card>
            <Card size="small" className="appt-detail-stat-card">
              <div style={{ fontSize: 20, fontWeight: 600 }}>{history.length}</div>
              <div className="appt-detail-stat-label">Rescheduled</div>
            </Card>
            <Card size="small" className="appt-detail-stat-card">
              <div style={{ fontSize: 20, fontWeight: 600 }}>{notesList.length}</div>
              <div className="appt-detail-stat-label">Total Notes</div>
            </Card>
          </Space>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <Card size="small" title="Visit Timeline" className="appt-detail-stat-card">
              First visit: {lead.appointment_date ? dayjs(lead.appointment_date).format('DD/MM/YYYY') : '-'}
            </Card>
            <Card size="small" title="Departments Visited" className="appt-detail-stat-card">
              {lead.branch?.name ? <Tag>{lead.branch.name}</Tag> : '-'}
            </Card>
          </div>
        </div>
      ),
    },
    {
      key: 'notes',
      label: (
        <span>
          <EditOutlined /> Notes
        </span>
      ),
      children: (
        <div>
          <Form form={noteForm} layout="vertical" style={{ maxWidth: 560 }}>
            <Form.Item name="note_text" label="Add note" rules={[{ required: true }, { max: 2000 }]}>
              <Input.TextArea rows={4} maxLength={2000} showCount />
            </Form.Item>
            <Button type="primary" loading={noteSaving} onClick={onAddNote} className="appt-btn-success">
              Save Note
            </Button>
          </Form>
          <h4 className="appt-detail-h4">Saved notes</h4>
          {notesList.length === 0 ? (
            <Empty description="No notes yet" />
          ) : (
            <ul className="appt-detail-body" style={{ paddingLeft: 20 }}>
              {notesList.map((n) => (
                <li key={n._id || n.createdAt} style={{ marginBottom: 12 }}>
                  <div>{n.text}</div>
                  <div className="appt-detail-label">
                    {n.performedBy} · {n.createdAt ? dayjs(n.createdAt).format('DD/MM/YYYY HH:mm') : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      key: 'feedback',
      label: (
        <span>
          <MessageOutlined /> Feedback
        </span>
      ),
      children: (
        <div className="appt-feedback-outer">
          <div className="appt-feedback-inner">
            <span className="appt-feedback-icon">i</span>
            <div className="appt-feedback-text">
              <div className="appt-feedback-title">No Feedback Found</div>
              <div className="appt-feedback-desc">
                No feedback responses found for appointment <strong>{appointmentDisplayId(lead)}</strong>, patient{' '}
                <strong>{name}</strong>, mobile <strong>{lead.phone || '—'}</strong>.
              </div>
              <div className="appt-feedback-footnote">
                Feedback can be linked when your WhatsApp flows store responses by this mobile number.
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ]

  return (
    <Card
      className="appt-detail-card"
      title={
        <Space>
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} className="appt-detail-back">
            Bookings
          </Button>
          <span className="appt-detail-body">Appointment Details — {appointmentDisplayId(lead)}</span>
          {isFetching && !isLoading && <Spin size="small" />}
        </Space>
      }
    >
      <div className="appt-detail-summary">
        <div className="appt-detail-summary-title">{name}&apos;s Appointment Details</div>
        <Space wrap size="large" className="appt-detail-summary-meta">
          <span>Created: {lead.createdAt ? dayjs(lead.createdAt).format('D/M/YYYY h:mm A') : '-'}</span>
          <span>ID: {appointmentDisplayId(lead)}</span>
          <span>User: {lead.assignedTo?.name || '-'}</span>
          <span>Dept: {lead.branch?.name || '-'}</span>
          <Tag color={st.color}>{st.label}</Tag>
          <span>Desc: {lead.message || lead.notes || '—'}</span>
        </Space>
      </div>
      <Tabs activeKey={detailTab} onChange={setDetailTab} items={detailTabItems} className="appt-detail-tabs" />
    </Card>
  )
}

const AppointmentBookingsPage = () => {
  const { message: messageApi } = App.useApp()
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [activeView, setActiveView] = useState('calendar') // 'calendar' | 'list'
  const [listTab, setListTab] = useState('current') // current | rescheduled | completed | cancelled | feedbacks
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [calendarMonth, setCalendarMonth] = useState(dayjs())
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [detailLeadId, setDetailLeadId] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterBranch, setFilterBranch] = useState(undefined)
  const [filterSource, setFilterSource] = useState(undefined)
  const [filterSlot, setFilterSlot] = useState(undefined)
  const [listPage, setListPage] = useState(1)

  const dateStr = selectedDate.format('YYYY-MM-DD')

  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useGetLeadsQuery({
    appointmentDate: dateStr,
    page: 1,
    limit: 500,
  })

  const { data: branchesData } = useGetBranchesQuery()
  const [createLead, { isLoading: createLoading }] = useCreateLeadMutation()
  const [updateLead, { isLoading: updateLoading }] = useUpdateLeadMutation()
  const [syncAskEvaAppointments, { isLoading: syncAskEvaLoading }] = useSyncAskEvaAppointmentsMutation()

  const branches = branchesData?.branches || []
  const leads = leadsData?.leads || []

  const filteredByTab = useMemo(() => {
    const statuses = APPOINTMENT_TAB_STATUS[listTab]
    if (listTab === 'feedbacks') return leads
    return leads.filter((l) => statuses.includes(l.status))
  }, [leads, listTab])

  const attributeFiltered = useMemo(() => {
    return filteredByTab.filter((l) => {
      if (filterBranch) {
        const bid = l.branch?._id || l.branch
        if (String(bid || '') !== String(filterBranch)) return false
      }
      if (filterSource && l.source !== filterSource) return false
      if (filterSlot && (l.slot_time || '') !== filterSlot) return false
      return true
    })
  }, [filteredByTab, filterBranch, filterSource, filterSlot])

  const searchFiltered = useMemo(() => {
    if (!searchText.trim()) return attributeFiltered
    const q = searchText.toLowerCase()
    return attributeFiltered.filter(
      (l) =>
        (l.first_name && l.first_name.toLowerCase().includes(q)) ||
        (l.last_name && l.last_name.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && String(l.phone).includes(q)) ||
        (l._id && String(l._id).toLowerCase().includes(q))
    )
  }, [attributeFiltered, searchText])

  const handleApplyAppointmentFilters = () => {
    setListPage(1)
  }

  const handleClearAppointmentFilters = () => {
    setSearchText('')
    setFilterBranch(undefined)
    setFilterSource(undefined)
    setFilterSlot(undefined)
    setListPage(1)
  }

  const summaryCounts = useMemo(() => {
    const total = leads.length
    const closed = leads.filter((l) => l.status === 'Converted').length
    const current = leads.filter((l) => ['New', 'In Progress'].includes(l.status)).length
    const cancelled = leads.filter((l) => l.status === 'Cancelled').length
    return { total, closed, current, cancelled }
  }, [leads])

  const handleSyncAskEva = async () => {
    try {
      const result = await syncAskEvaAppointments().unwrap()
      messageApi.success(
        `AskEva appointments synced: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`
      )
      refetchLeads()
    } catch (error) {
      console.error('AskEva appointments sync error:', error)
      messageApi.error(error?.data?.message || error?.message || 'Failed to sync AskEva appointments')
    }
  }

  const handleNewAppointment = () => {
    setEditingLead(null)
    form.resetFields()
    form.setFieldsValue({
      preferredAppointmentDate: selectedDate,
    })
    setNewAppointmentOpen(true)
  }

  const handleView = (record) => {
    setDetailLeadId(record._id)
  }

  const handleEdit = (record) => {
    setDetailLeadId(null)
    setEditingLead(record)
    form.setFieldsValue({
      first_name: record.first_name,
      last_name: record.last_name,
      contact: record.phone,
      email: record.email,
      branch: record.branch?._id || record.branch,
      spaPackage: record.spa_package,
      preferredAppointmentDate: record.appointment_date ? dayjs(record.appointment_date) : null,
      preferredSlotTime: record.slot_time,
      description: record.message || '',
    })
    setNewAppointmentOpen(true)
  }


  const handleFormSubmit = async (values) => {
    try {
      const payload = {
        first_name: values.first_name?.trim() || '',
        last_name: values.last_name?.trim() || '',
        email: values.email?.trim() || '',
        phone: (values.contact || '').trim(),
        whatsapp: (values.contact || '').trim(),
        branch: values.branch || null,
        spa_package: values.spaPackage || '',
        appointment_date: values.preferredAppointmentDate
          ? values.preferredAppointmentDate.format('YYYY-MM-DD')
          : null,
        slot_time: values.preferredSlotTime || '',
        message: (values.description || '').trim(),
        source: 'Add',
        status: 'New',
      }
      if (editingLead) {
        await updateLead({ id: editingLead._id, ...payload }).unwrap()
        messageApi.success('Appointment updated successfully')
      } else {
        await createLead(payload).unwrap()
        messageApi.success('Appointment created successfully')
      }
      setNewAppointmentOpen(false)
      form.resetFields()
      setEditingLead(null)
      refetchLeads()
    } catch (e) {
      messageApi.error(e?.data?.message || 'Failed to save appointment')
    }
  }

  const listColumns = [
    { title: 'S.No.', key: 'sno', width: 60, render: (_, __, i) => i + 1 },
    {
      title: 'ID',
      key: 'id',
      width: 100,
      render: (_, r) => appointmentDisplayId(r),
    },
    {
      title: 'Name',
      key: 'name',
      width: 140,
      render: (_, r) => `${(r.first_name || '').trim()} ${(r.last_name || '').trim()}`.trim() || '-',
    },

    {
      title: 'Appointment Date',
      key: 'appointment_date',
      width: 120,
      render: (_, r) => (r.appointment_date ? dayjs(r.appointment_date).format('MMM DD, YYYY') : '-'),
    },
    { title: 'Appointment Timing', dataIndex: 'slot_time', key: 'slot_time', width: 130 },
    {
      title: 'User',
      key: 'user',
      width: 90,
      render: (_, r) => (r.assignedTo?.name || r.assignedTo || '-'),
    },
    {
      title: 'Department',
      key: 'department',
      width: 100,
      render: (_, r) => (r.branch?.name || r.branch || '-'),
    },

    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s) => {
        const u = uiAppointmentStatus(s)
        return <Tag color={u.color}>{u.label}</Tag>
      },
    },
    {
      title: 'Action',
      key: 'action',
      width: 56,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              { key: 'view', label: 'View details', icon: <EyeOutlined /> },
              { key: 'edit', label: 'Edit appointment', icon: <EditOutlined /> },
            ],
            onClick: ({ key, domEvent }) => {
              domEvent?.stopPropagation()
              if (key === 'view') handleView(record)
              else if (key === 'edit') handleEdit(record)
            },
          }}
          trigger={['click']}
          placement="bottomRight"
          overlayClassName="appt-actions-dropdown"
        >
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined className="appt-table-action-icon" style={{ fontSize: 18 }} />}
            onClick={(e) => e.stopPropagation()}
            aria-label="Appointment actions"
          />
        </Dropdown>
      ),
    },
  ]

  useEffect(() => {
    setListPage(1)
  }, [listTab, selectedDate])

  const hourSlots = []
  for (let h = 0; h < 24; h++) {
    hourSlots.push(h)
  }

  const appointmentsBySlot = useMemo(() => {
    const map = {}
    leads.forEach((l) => {
      const slot = l.slot_time || 'Other'
      if (!map[slot]) map[slot] = []
      map[slot].push(l)
    })
    return map
  }, [leads])

  if (detailLeadId) {
    return (
      <PageLayout className="appointment-bookings-page appt-page-shell">
        <AppointmentDetailPanel
          leadId={detailLeadId}
          onBack={() => {
            setDetailLeadId(null)
            refetchLeads()
          }}
          isMobile={isMobile}
          messageApi={messageApi}
        />
      </PageLayout>
    )
  }

  return (
    <PageLayout className="appointment-bookings-page appt-page-shell">
      <PageHeader
        title="Appointment Bookings"
        extra={
          <Space wrap>
            {activeView === 'list' && (
              <Button
                icon={showFilters ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setShowFilters(!showFilters)}
                size={isMobile ? 'small' : 'middle'}
              >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
            )}
            <Button
              icon={<SyncOutlined />}
              onClick={handleSyncAskEva}
              loading={syncAskEvaLoading}
              size={isMobile ? 'small' : 'middle'}
            >
              Sync AskEva
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleNewAppointment} className="appt-btn-primary">
              New Appointment
            </Button>
          </Space>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Segmented
          block={isMobile}
          value={activeView}
          onChange={(v) => {
            setActiveView(v)
            if (v === 'calendar') setShowFilters(false)
          }}
          options={[
            {
              value: 'calendar',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CalendarOutlined />
                  Calendar View
                </span>
              ),
            },
            {
              value: 'list',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <UnorderedListOutlined />
                  Appointments
                </span>
              ),
            },
          ]}
          size={isMobile ? 'small' : 'middle'}
          className="appt-view-segmented"
        />
      </div>
      <p className="appt-view-subtitle">
        {activeView === 'calendar'
          ? 'Choose a date on the calendar, then review time slots and open an appointment.'
          : 'Search and filter appointments. Click a row or use the menu to view or edit.'}
      </p>

      {activeView === 'list' && showFilters && (
        <ContentCard compact className="appt-filters-card">
          <div className="appt-filters-row ds-filters-row--responsive">
            <Input
              className="ds-filter-grow"
              placeholder="Search by name, email or phone"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleApplyAppointmentFilters}
              allowClear
            />
            <Select
              className="ds-filter-fixed"
              placeholder="Filter by Branch"
              allowClear
              value={filterBranch}
              onChange={setFilterBranch}
              style={{ minWidth: 160 }}
            >
              {branches.map((b) => (
                <Option key={b._id || b.id} value={b._id || b.id}>
                  {b.name}
                </Option>
              ))}
            </Select>
            <Select
              className="ds-filter-fixed"
              placeholder="Filter by Source"
              allowClear
              value={filterSource}
              onChange={setFilterSource}
              style={{ minWidth: 140 }}
            >
              <Option value="Add">Add</Option>
              <Option value="Call">Call</Option>
              <Option value="WhatsApp">WhatsApp</Option>
              <Option value="Facebook">Facebook</Option>
              <Option value="Insta">Insta</Option>
              <Option value="Website">Website</Option>
              <Option value="Import">Import</Option>
            </Select>
            <Select
              className="ds-filter-fixed"
              placeholder="Filter by slot"
              allowClear
              value={filterSlot}
              onChange={setFilterSlot}
              style={{ minWidth: 160 }}
            >
              {SLOT_TIMES.map((s) => (
                <Option key={s} value={s}>
                  {s}
                </Option>
              ))}
            </Select>
            <Button type="primary" className="appt-btn-primary" onClick={handleApplyAppointmentFilters}>
              Apply Filter
            </Button>
            <Button onClick={handleClearAppointmentFilters}>Clear</Button>
          </div>
        </ContentCard>
      )}

      {activeView === 'calendar' && (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, flex: 1 }}>
          <Card className="appt-card" style={{ width: isMobile ? '100%' : 320 }} bodyStyle={{ padding: 16 }}>
            <div className="appt-calendar-wrap">
              <Calendar
                fullscreen={false}
                value={calendarMonth}
                onSelect={(d) => {
                  setSelectedDate(d)
                }}
                onChange={(d) => setCalendarMonth(d)}
                headerRender={({ value, onChange }) => (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Button type="text" icon={<LeftOutlined />} onClick={() => onChange(value.subtract(1, 'month'))} className="appt-btn-text-gold" />
                    <span className="appt-calendar-header-month">{value.format('MMMM YYYY')}</span>
                    <Button type="text" icon={<RightOutlined />} onClick={() => onChange(value.add(1, 'month'))} className="appt-btn-text-gold" />
                  </div>
                )}
              />
            </div>
            <div className="appt-legend">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="appt-legend-swatch-selected" /> Selected date
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="appt-legend-swatch-dot" /> Has appointments
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Card size="small" className="appt-stat-total appt-stat-card">
                <div className="appt-stat-val">{summaryCounts.total}</div>
                <div className="appt-stat-label">Total</div>
              </Card>
              <Card size="small" className="appt-stat-closed appt-stat-card">
                <div className="appt-stat-val">{summaryCounts.closed}</div>
                <div className="appt-stat-label">Closed</div>
              </Card>
              <Card size="small" className="appt-stat-current appt-stat-card">
                <div className="appt-stat-val">{summaryCounts.current}</div>
                <div className="appt-stat-label">Current</div>
              </Card>
              <Card size="small" className="appt-stat-cancelled appt-stat-card">
                <div className="appt-stat-val">{summaryCounts.cancelled}</div>
                <div className="appt-stat-label">Cancelled</div>
              </Card>
            </div>
          </Card>

          <Card
            className="appt-card appt-schedule-scroll"
            style={{ flex: 1, minWidth: 0 }}
            bodyStyle={{ padding: 16, maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <Button type="primary" size="small" className="appt-btn-primary" onClick={() => setSelectedDate(dayjs())}>
                Today
              </Button>
              <Button type="text" icon={<LeftOutlined />} onClick={() => setSelectedDate(selectedDate.subtract(1, 'day'))} className="appt-btn-text-gold" />
              <span className="appt-date-title">{selectedDate.format('dddd, MMMM D')}</span>
              <Button type="text" icon={<RightOutlined />} onClick={() => setSelectedDate(selectedDate.add(1, 'day'))} className="appt-btn-text-gold" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
              {[-3, -2, -1, 0, 1, 2, 3].map((d) => {
                const day = selectedDate.add(d, 'day')
                const str = day.format('YYYY-MM-DD')
                const isSel = str === dateStr
                return (
                  <div
                    key={str}
                    onClick={() => setSelectedDate(day)}
                    className={`appt-week-strip-day ${isSel ? 'appt-week-strip-day--sel' : ''}`}
                  >
                    <div className="appt-week-strip-sub">{day.format('ddd')}</div>
                    <div className="appt-week-strip-num">{day.date()}</div>
                  </div>
                )
              })}
            </div>
            <h3 className="appt-section-title">
              Appointments for {selectedDate.format('dddd, MMMM D')}
            </h3>
            <div style={{ display: 'flex', minHeight: 400 }}>
              <div className="appt-time-rail">
                {hourSlots.map((h) => (
                  <div key={h} style={{ height: 40 }}>
                    {h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {leadsLoading ? (
                  <div className="appt-muted">Loading...</div>
                ) : leads.length === 0 ? (
                  <Empty description="No appointments" style={{ marginTop: 24 }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(appointmentsBySlot).map(([slot, list]) => (
                      <Card size="small" key={slot} className="appt-slot-card" title={slot}>
                        {list.map((l) => (
                          <div key={l._id} className="appt-slot-row">
                            <span>
                              {(l.first_name || '')} {(l.last_name || '').trim()}
                              {l.spa_package && ` · ${l.spa_package}`}
                            </span>
                            <Button
                              type="link"
                              size="small"
                              className="appt-slot-view-btn"
                              icon={<EyeOutlined />}
                              onClick={() => handleView(l)}
                            >
                              View
                            </Button>
                          </div>
                        ))}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeView === 'list' && (
        <>
     
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {[-3, -2, -1, 0, 1, 2, 3].map((d) => {
              const day = selectedDate.add(d, 'day')
              const str = day.format('YYYY-MM-DD')
              const isSel = str === dateStr
              return (
                <div
                  key={str}
                  onClick={() => setSelectedDate(day)}
                  className={`appt-week-strip-day appt-week-strip-day--large ${isSel ? 'appt-week-strip-day--sel' : ''}`}
                >
                  <div className="appt-week-strip-sub">{day.format('ddd')}</div>
                  <div className="appt-week-strip-num">{day.date()}</div>
                  <div className="appt-week-strip-month">{day.format('MMM')}</div>
                </div>
              )
            })}
          </div>
          <Tabs
            activeKey={listTab}
            onChange={(k) => {
              setListTab(k)
              setListPage(1)
            }}
            items={[
              { key: 'current', label: 'Current' },
              { key: 'rescheduled', label: 'Rescheduled' },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
              { key: 'feedbacks', label: 'Feedbacks' },
            ]}
            className="appt-list-tabs"
          />
          <div className="appt-table-wrap">
            <Table
              columns={listColumns}
              dataSource={searchFiltered}
              rowKey="_id"
              loading={leadsLoading}
              pagination={{
                current: listPage,
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (t) => `Total ${t} appointments`,
                onChange: (page) => setListPage(page),
                onShowSizeChange: () => setListPage(1),
              }}
              scroll={{ x: 1200 }}
              locale={{ emptyText: 'No data' }}
              onRow={(record) => ({
                onClick: (e) => {
                  if (
                    e.target.closest('button') ||
                    e.target.closest('a') ||
                    e.target.closest('.ant-dropdown') ||
                    e.target.closest('.ant-popconfirm') ||
                    e.target.closest('.ant-select')
                  ) {
                    return
                  }
                  handleView(record)
                },
                style: { cursor: 'pointer' },
              })}
            />
          </div>
        </>
      )}

      <Modal
        className="appt-form-modal"
        title={editingLead ? 'Edit Appointment' : 'New Appointment'}
        open={newAppointmentOpen}
        onCancel={() => {
          setNewAppointmentOpen(false)
          setEditingLead(null)
          form.resetFields()
        }}
        footer={null}
        width={640}
        styles={{ body: { padding: 24 } }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          requiredMark={true}
          style={{ maxWidth: 560 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="first_name"
              label="FIRST NAME"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input placeholder="FIRST NAME *" style={{ borderRadius: 6 }} />
            </Form.Item>
            <Form.Item
              name="last_name"
              label="LAST NAME"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input placeholder="LAST NAME *" style={{ borderRadius: 6 }} />
            </Form.Item>
            <Form.Item
              name="contact"
              label="CONTACT"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input placeholder="CONTACT *" style={{ borderRadius: 6 }} />
            </Form.Item>
            <Form.Item
              name="email"
              label="EMAIL"
              rules={[
                { required: true, message: 'Required' },
                { type: 'email', message: 'Invalid email' },
              ]}
            >
              <Input placeholder="EMAIL *" style={{ borderRadius: 6 }} />
            </Form.Item>
            <Form.Item
              name="branch"
              label="CHOOSE BRANCH"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select placeholder="CHOOSE BRANCH *" allowClear style={{ borderRadius: 6 }}>
                {branches.map((b) => (
                  <Option key={b._id || b.id} value={b._id || b.id}>
                    {b.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              name="spaPackage"
              label="CHOOSE SPA PACKAGE"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select placeholder="CHOOSE SPA PACKAGE *" allowClear style={{ borderRadius: 6 }}>
                {SPA_PACKAGES.map((p) => (
                  <Option key={p} value={p}>
                    {p}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          <Form.Item
            name="preferredAppointmentDate"
            label="PREFERRED APPOINTMENT DATE"
            rules={[{ required: true, message: 'Required' }]}
          >
            <DatePicker
              format="MM/DD/YYYY"
              placeholder="mm/dd/yyyy"
              style={{ width: '100%', borderRadius: 6 }}
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>
          <Form.Item
            name="preferredSlotTime"
            label="PREFERRED SLOT TIME"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Select placeholder="PREFERRED SLOT TIME *" allowClear style={{ borderRadius: 6 }}>
              {SLOT_TIMES.map((t) => (
                <Option key={t} value={t}>
                  {t}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="DESCRIPTION / NOTES">
            <Input.TextArea rows={2} placeholder="Short description for appointment card" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 16 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={createLoading || updateLoading} className="appt-btn-primary">
                {editingLead ? 'Update' : 'Create'}
              </Button>
              <Button
                onClick={() => {
                  setNewAppointmentOpen(false)
                  setEditingLead(null)
                  form.resetFields()
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageLayout>
  )
}

export default AppointmentBookingsPage
