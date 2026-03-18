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
  Calendar,
  Space,
  App,
  Empty,
  Tag,
  Timeline,
  Spin,
  Alert,
  Avatar,
} from 'antd'
import {
  PlusOutlined,
  CalendarOutlined,
  UnorderedListOutlined,
  SearchOutlined,
  FilterOutlined,
  PrinterOutlined,
  LeftOutlined,
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
} from '@ant-design/icons'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetLeadsQuery,
  useGetLeadQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useCompleteAppointmentMutation,
  useRescheduleAppointmentMutation,
  useAddAppointmentNoteMutation,
} from '../../store/api/leadApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import dayjs from 'dayjs'

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
  if (status === 'Follow-Up') return { label: 'Rescheduled', color: 'orange' }
  if (status === 'In Progress') return { label: 'Current', color: 'blue' }
  return { label: 'Current', color: 'blue' }
}

/** Full appointment detail: tabs persist via API (complete / reschedule / notes). */
function AppointmentDetailPanel({ leadId, onBack, isMobile, messageApi }) {
  const { data, isLoading, isFetching, error, refetch } = useGetLeadQuery(leadId)
  const [detailTab, setDetailTab] = useState('details')
  const [completeForm] = Form.useForm()
  const [rescheduleForm] = Form.useForm()
  const [noteForm] = Form.useForm()
  const [completeAppt, { isLoading: completing }] = useCompleteAppointmentMutation()
  const [rescheduleAppt, { isLoading: rescheduling }] = useRescheduleAppointmentMutation()
  const [addNote, { isLoading: noteSaving }] = useAddAppointmentNoteMutation()

  const lead = data?.lead
  const isDone = lead?.status === 'Converted'

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
        <div style={{ color: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ color: '#888', fontSize: 12 }}>Created</div>
              <div>{lead.createdAt ? dayjs(lead.createdAt).format('D/M/YYYY h:mm A') : '-'}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 12 }}>ID</div>
              <div>{appointmentDisplayId(lead)}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 12 }}>User</div>
              <div>{lead.assignedTo?.name || '-'}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 12 }}>Department</div>
              <div>{lead.branch?.name || '-'}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 12 }}>Status</div>
              <Tag color={st.color}>{st.label}</Tag>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 12 }}>Appointment</div>
              <div>
                {lead.appointment_date ? dayjs(lead.appointment_date).format('DD/MM/YYYY') : '-'} · {lead.slot_time || '-'}
              </div>
            </div>
            <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
              <div style={{ color: '#888', fontSize: 12 }}>Description</div>
              <div>{lead.message || lead.notes || '-'}</div>
            </div>
            {lead.completion_notes && (
              <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                <div style={{ color: '#888', fontSize: 12 }}>Completion notes</div>
                <div>{lead.completion_notes}</div>
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
        <div style={{ color: '#fff' }}>
          <Tag color="success" style={{ marginBottom: 12 }}>
            Completed
          </Tag>
          <div style={{ color: '#888', fontSize: 12 }}>Completion notes</div>
          <div>{lead.completion_notes || '-'}</div>
        </div>
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
            <Button type="primary" icon={<CheckCircleOutlined />} loading={completing} onClick={onComplete} style={{ background: '#52c41a', borderColor: '#52c41a' }}>
              Mark as Complete
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
      children: isDone ? (
        <Alert type="info" message="Completed appointments cannot be rescheduled" showIcon />
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
              <Button type="primary" loading={rescheduling} onClick={onReschedule} style={{ background: '#52c41a', borderColor: '#52c41a' }}>
                Save Reschedule
              </Button>
            </Space>
          </Form>
          <h4 style={{ color: '#fff', marginTop: 24 }}>Reschedule History</h4>
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
        <div style={{ color: '#fff' }}>
          <h4 style={{ marginBottom: 16 }}>Appointment Activity Timeline</h4>
          {logs.length === 0 ? (
            <Empty description="No activity" />
          ) : (
            <Timeline
              items={logs.map((log) => ({
                children: (
                  <div>
                    <div>{log.action}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>{log.details}</div>
                    <div style={{ color: '#666', fontSize: 11 }}>
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
        <div style={{ color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <Avatar size={64} style={{ background: '#52c41a' }}>
              {(lead.first_name || '?')[0]}
            </Avatar>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{name}</div>
              <div style={{ color: '#888' }}>{lead.phone || '-'}</div>
            </div>
          </div>
          <Space wrap style={{ marginBottom: 16 }}>
            <Card size="small" style={{ minWidth: 120, background: '#252525', borderColor: '#333' }}>
              <div style={{ fontSize: 20, fontWeight: 600 }}>1</div>
              <div style={{ fontSize: 12, color: '#888' }}>Total Visits</div>
            </Card>
            <Card size="small" style={{ minWidth: 120, background: '#252525', borderColor: '#333' }}>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{isDone ? 1 : 0}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Completed</div>
            </Card>
            <Card size="small" style={{ minWidth: 120, background: '#252525', borderColor: '#333' }}>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{history.length}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Rescheduled</div>
            </Card>
            <Card size="small" style={{ minWidth: 120, background: '#252525', borderColor: '#333' }}>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{notesList.length}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Total Notes</div>
            </Card>
          </Space>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <Card size="small" title="Visit Timeline" style={{ background: '#252525', borderColor: '#333' }}>
              First visit: {lead.appointment_date ? dayjs(lead.appointment_date).format('DD/MM/YYYY') : '-'}
            </Card>
            <Card size="small" title="Departments Visited" style={{ background: '#252525', borderColor: '#333' }}>
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
            <Button type="primary" loading={noteSaving} onClick={onAddNote} style={{ background: '#52c41a', borderColor: '#52c41a' }}>
              Save Note
            </Button>
          </Form>
          <h4 style={{ color: '#fff', marginTop: 24 }}>Saved notes</h4>
          {notesList.length === 0 ? (
            <Empty description="No notes yet" style={{ color: '#888' }} />
          ) : (
            <ul style={{ color: '#fff', paddingLeft: 20 }}>
              {notesList.map((n) => (
                <li key={n._id || n.createdAt} style={{ marginBottom: 12 }}>
                  <div>{n.text}</div>
                  <div style={{ color: '#888', fontSize: 12 }}>
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
        <div
          style={{
            padding: 24,
            background: '#1a1a1a',
            borderRadius: 8,
            border: '1px solid #333',
            minHeight: 120,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 16,
              background: '#252525',
              borderRadius: 8,
              border: '1px solid #404040',
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#1890ff',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              i
            </span>
            <div style={{ flex: 1, color: '#e8e8e8' }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#fff' }}>No Feedback Found</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#ccc' }}>
                No feedback responses found for appointment <strong style={{ color: '#e8e8e8' }}>{appointmentDisplayId(lead)}</strong>, patient{' '}
                <strong style={{ color: '#e8e8e8' }}>{name}</strong>, mobile <strong style={{ color: '#e8e8e8' }}>{lead.phone || '—'}</strong>.
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
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
      style={{ background: '#1a1a1a', borderColor: '#333' }}
      title={
        <Space>
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ color: '#52c41a', padding: 0 }}>
            Bookings
          </Button>
          <span style={{ color: '#fff' }}>Appointment Details — {appointmentDisplayId(lead)}</span>
          {isFetching && !isLoading && <Spin size="small" />}
        </Space>
      }
    >
      <div style={{ marginBottom: 20, padding: 16, background: '#252525', borderRadius: 8, border: '1px solid #333' }}>
        <div style={{ color: '#52c41a', fontWeight: 600, marginBottom: 12 }}>{name}&apos;s Appointment Details</div>
        <Space wrap size="large" style={{ color: '#ccc', fontSize: 13 }}>
          <span>Created: {lead.createdAt ? dayjs(lead.createdAt).format('D/M/YYYY h:mm A') : '-'}</span>
          <span>ID: {appointmentDisplayId(lead)}</span>
          <span>User: {lead.assignedTo?.name || '-'}</span>
          <span>Dept: {lead.branch?.name || '-'}</span>
          <Tag color={st.color}>{st.label}</Tag>
          <span>Desc: {lead.message || lead.notes || '—'}</span>
        </Space>
      </div>
      <Tabs activeKey={detailTab} onChange={setDetailTab} items={detailTabItems} style={{ color: '#fff' }} />
    </Card>
  )
}

const AppointmentBookingsPage = () => {
  const { message: messageApi } = App.useApp()
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [activeView, setActiveView] = useState('calendar') // 'calendar' | 'list'
  const [listTab, setListTab] = useState('current') // current | rescheduled | completed | feedbacks
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [calendarMonth, setCalendarMonth] = useState(dayjs())
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [detailLeadId, setDetailLeadId] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const dateStr = selectedDate.format('YYYY-MM-DD')

  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useGetLeadsQuery({
    appointmentDate: dateStr,
    page: 1,
    limit: 500,
  })

  const { data: branchesData } = useGetBranchesQuery()
  const [createLead, { isLoading: createLoading }] = useCreateLeadMutation()
  const [updateLead, { isLoading: updateLoading }] = useUpdateLeadMutation()

  const branches = branchesData?.branches || []
  const leads = leadsData?.leads || []

  const filteredByTab = useMemo(() => {
    const statuses = APPOINTMENT_TAB_STATUS[listTab]
    if (listTab === 'feedbacks') return leads
    return leads.filter((l) => statuses.includes(l.status))
  }, [leads, listTab])

  const searchFiltered = useMemo(() => {
    if (!searchText.trim()) return filteredByTab
    const q = searchText.toLowerCase()
    return filteredByTab.filter(
      (l) =>
        (l.first_name && l.first_name.toLowerCase().includes(q)) ||
        (l.last_name && l.last_name.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && String(l.phone).includes(q)) ||
        (l._id && String(l._id).toLowerCase().includes(q))
    )
  }, [filteredByTab, searchText])

  const summaryCounts = useMemo(() => {
    const total = leads.length
    const closed = leads.filter((l) => l.status === 'Converted').length
    const current = leads.filter((l) => ['New', 'In Progress'].includes(l.status)).length
    return { total, closed, current }
  }, [leads])

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
      width: 100,
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
      width: 110,
      render: (s) => {
        const u = uiAppointmentStatus(s)
        return <Tag color={u.color}>{u.label}</Tag>
      },
    },
    {
      title: 'Action',
      key: 'action',
      width: 90,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} title="View" />
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit" />
        </Space>
      ),
    },
  ]

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
      <div style={{ padding: isMobile ? 8 : 0 }}>
        <AppointmentDetailPanel
          leadId={detailLeadId}
          onBack={() => {
            setDetailLeadId(null)
            refetchLeads()
          }}
          isMobile={isMobile}
          messageApi={messageApi}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? 8 : 0 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          marginBottom: 16,
          gap: 12,
        }}
      >
         <Tabs
            activeKey={activeView}
            onChange={setActiveView}
            items={[
              {
                key: 'calendar',
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CalendarOutlined /> Calendar View
                  </span>
                ),
              },
              {
                key: 'list',
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UnorderedListOutlined /> Appointments
                  </span>
                ),
              },
            ]}
            style={{ marginBottom: 0 }}
          />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewAppointment} style={{ background: '#D4AF37', borderColor: '#D4AF37' }}>
            New Appointment
          </Button>
        </div>
      </div>

      {activeView === 'calendar' && (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, flex: 1 }}>
          <Card
            style={{
              width: isMobile ? '100%' : 320,
              background: '#1a1a1a',
              border: '1px solid #333',
            }}
            bodyStyle={{ padding: 16 }}
          >
            <Calendar
              fullscreen={false}
              value={calendarMonth}
              onSelect={(d) => {
                setSelectedDate(d)
              }}
              onChange={(d) => setCalendarMonth(d)}
              headerRender={({ value, onChange }) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Button type="text" icon={<LeftOutlined />} onClick={() => onChange(value.subtract(1, 'month'))} style={{ color: '#D4AF37' }} />
                  <span style={{ color: '#fff', fontWeight: 600 }}>{value.format('MMMM YYYY')}</span>
                  <Button type="text" icon={<RightOutlined />} onClick={() => onChange(value.add(1, 'month'))} style={{ color: '#D4AF37' }} />
                </div>
              )}
            />
            <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 2, background: '#D4AF37' }} /> Selected date
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1px solid #888' }} /> Has appointments
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Card size="small" style={{ flex: 1, minWidth: 70, background: '#1890ff', border: 'none', textAlign: 'center' }}>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{summaryCounts.total}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>Total</div>
              </Card>
              <Card size="small" style={{ flex: 1, minWidth: 70, background: '#D4AF37', border: 'none', textAlign: 'center' }}>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{summaryCounts.closed}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>Closed</div>
              </Card>
              <Card size="small" style={{ flex: 1, minWidth: 70, background: '#fa8c16', border: 'none', textAlign: 'center' }}>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{summaryCounts.current}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>Current</div>
              </Card>
            </div>
          </Card>

          <Card
            style={{
              flex: 1,
              minWidth: 0,
              background: '#1a1a1a',
              border: '1px solid #333',
            }}
            bodyStyle={{ padding: 16, maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <Button
                type="primary"
                size="small"
                style={{ background: '#D4AF37', borderColor: '#D4AF37' }}
                onClick={() => setSelectedDate(dayjs())}
              >
                Today
              </Button>
              <Button
                type="text"
                icon={<LeftOutlined />}
                onClick={() => setSelectedDate(selectedDate.subtract(1, 'day'))}
                style={{ color: '#D4AF37' }}
              />
              <span style={{ color: '#fff', minWidth: 180 }}>
                {selectedDate.format('dddd, MMMM D')}
              </span>
              <Button
                type="text"
                icon={<RightOutlined />}
                onClick={() => setSelectedDate(selectedDate.add(1, 'day'))}
                style={{ color: '#D4AF37' }}
              />
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
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: isSel ? '#D4AF37' : 'transparent',
                      color: isSel ? '#fff' : '#ccc',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                      width: "100%",
                    }}
                  >
                    <div style={{ fontSize: 11 }}>{day.format('ddd')}</div>
                    <div style={{ fontWeight: 600 }}>{day.date()}</div>
                  </div>
                )
              })}
            </div>
            <h3 style={{ color: '#fff', marginBottom: 12 }}>
              Appointments for {selectedDate.format('dddd, MMMM D')}
            </h3>
            <div style={{ display: 'flex', minHeight: 400 }}>
              <div style={{ width: 60, flexShrink: 0, color: '#888', fontSize: 12 }}>
                {hourSlots.map((h) => (
                  <div key={h} style={{ height: 40 }}>
                    {h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {leadsLoading ? (
                  <div style={{ color: '#888', padding: 24 }}>Loading...</div>
                ) : leads.length === 0 ? (
                  <Empty description="No appointments" style={{ color: '#888', marginTop: 24 }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(appointmentsBySlot).map(([slot, list]) => (
                      <Card
                        size="small"
                        key={slot}
                        style={{ background: '#252525', border: '1px solid #333' }}
                        title={slot}
                      >
                        {list.map((l) => (
                          <div
                            key={l._id}
                            style={{
                              padding: '6px 0',
                              borderBottom: '1px solid #333',
                              color: '#fff',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span>
                              {(l.first_name || '')} {(l.last_name || '').trim()}
                              {l.spa_package && ` · ${l.spa_package}`}
                            </span>
                            <Button type="gold" size="small" icon={<EyeOutlined />} onClick={() => handleView(l)}>View</Button>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <Input
              placeholder="Search..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Button icon={<FilterOutlined />} style={{ background: '#D4AF37', borderColor: '#D4AF37', color: '#fff' }}>
              Filter
            </Button>
            <Button icon={<PrinterOutlined />} />
          
            {(searchText || filterOpen) && (
              <Button type="text" onClick={() => { setSearchText(''); setFilterOpen(false); }}>
                Clear
              </Button>
            )}
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
                  style={{
                    padding: '12px 16px',
                    borderRadius: 6,
                    background: isSel ? '#D4AF37' : '#1a1a1a',
                    border: `1px solid ${isSel ? '#D4AF37' : '#333'}`,
                    color: isSel ? '#fff' : '#ccc',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    width:" 100%",
                  }}
                >
                  <div style={{ fontSize: 11 }}>{day.format('ddd')}</div>
                  <div style={{ fontWeight: 600, fontSize: 18 }}>{day.date()}</div>
                  <div style={{ fontSize: 10 }}>{day.format('MMM')}</div>
                </div>
              )
            })}
          </div>
          <Tabs
            activeKey={listTab}
            onChange={setListTab}
            items={[
              { key: 'current', label: 'Current' },
              { key: 'rescheduled', label: 'Rescheduled' },
              { key: 'completed', label: 'Completed' },
              { key: 'feedbacks', label: 'Feedbacks' },
            ]}
            style={{ borderBottom: '1px solid #333', marginBottom: 16 }}
          />
          <Table
            columns={listColumns}
            dataSource={searchFiltered}
            rowKey="_id"
            loading={leadsLoading}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} appointments` }}
            scroll={{ x: 1200 }}
            locale={{ emptyText: 'No data' }}
            style={{ background: '#1a1a1a' }}
          />
        </>
      )}

      <Modal
        title={editingLead ? 'Edit Appointment' : 'New Appointment'}
        open={newAppointmentOpen}
        onCancel={() => {
          setNewAppointmentOpen(false)
          setEditingLead(null)
          form.resetFields()
        }}
        footer={null}
        width={640}
        styles={{ body: {  padding: 24 } }}
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
              <Button type="primary" htmlType="submit" loading={createLoading || updateLoading} style={{ background: '#D4AF37', borderColor: '#D4AF37' }}>
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
    </div>
  )
}

export default AppointmentBookingsPage
