import React, { useState, useMemo } from 'react'
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
} from '@ant-design/icons'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetLeadsQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
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
  const [viewingLead, setViewingLead] = useState(null)
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
    setViewingLead(record)
  }

  const handleEdit = (record) => {
    setViewingLead(null)
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
    })
    setNewAppointmentOpen(true)
  }

  const openEditFromView = () => {
    if (viewingLead) {
      handleEdit(viewingLead)
      setViewingLead(null)
    }
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
    { title: 'ID', dataIndex: '_id', key: 'id', width: 80, ellipsis: true, render: (id) => (id ? String(id).slice(-6) : '-') },
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
      width: 100,
      render: (s) => (
        <Tag
          color={
            s === 'Converted' ? 'green' : s === 'Follow-Up' ? 'orange' : s === 'In Progress' ? 'blue' : 'default'
          }
        >
          {s || 'New'}
        </Tag>
      ),
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

      {/* View Appointment modal (read-only) */}
      <Modal
        title="View Appointment"
        open={!!viewingLead}
        onCancel={() => setViewingLead(null)}
        footer={[
          <Button key="close" onClick={() => setViewingLead(null)}>
            Close
          </Button>,
          <Button
            key="edit"
            type="primary"
            icon={<EditOutlined />}
            onClick={openEditFromView}
            style={{ background: '#D4AF37', borderColor: '#D4AF37' }}
          >
            Edit
          </Button>,
        ]}
        width={560}
        styles={{ body: { padding: 24, background: '#1a1a1a' } }}
      >
        {viewingLead && (
          <div style={{ color: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>First Name</div>
                <div>{viewingLead.first_name || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Last Name</div>
                <div>{viewingLead.last_name || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Contact</div>
                <div>{viewingLead.phone || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Email</div>
                <div>{viewingLead.email || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Branch</div>
                <div>{viewingLead.branch?.name || viewingLead.branch || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Spa Package</div>
                <div>{viewingLead.spa_package || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Preferred Appointment Date</div>
                <div>{viewingLead.appointment_date ? dayjs(viewingLead.appointment_date).format('MM/DD/YYYY') : '-'}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Preferred Slot Time</div>
                <div>{viewingLead.slot_time || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Status</div>
                <div>
                  <Tag color={viewingLead.status === 'Converted' ? 'green' : viewingLead.status === 'Follow-Up' ? 'orange' : viewingLead.status === 'In Progress' ? 'blue' : 'default'}>
                    {viewingLead.status || 'New'}
                  </Tag>
                </div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Assigned To</div>
                <div>{viewingLead.assignedTo?.name || viewingLead.assignedTo || '-'}</div>
              </div>
            </div>
          </div>
        )}
      </Modal>

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
