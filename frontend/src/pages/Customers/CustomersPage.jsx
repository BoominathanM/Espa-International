import React, { useEffect, useMemo, useState } from 'react'
import {
  Table,
  Button,
  Input,
  Tag,
  Timeline,
  Modal,
  Form,
  Space,
  App,
  Dropdown,
  Tabs,
  Select,
  Spin,
  Empty,
  DatePicker,
} from 'antd'
import {
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  PlusOutlined,
  UpOutlined,
  DownOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { canEdit } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import MotionButton from '../../components/MotionButton'
import {
  useGetCustomersQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useGetCustomerTimelineQuery,
  useAddCustomerTimelineNoteMutation,
  useUpdateCustomerTimelineNoteMutation,
} from '../../store/api/customerApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'

const { TextArea } = Input
const { Option } = Select
const { RangePicker } = DatePicker

const Customers = () => {
  const { message } = App.useApp()
  const { isMobile } = useResponsive()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isTimelineVisible, setIsTimelineVisible] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [form] = Form.useForm()
  const [timelineNotesDraft, setTimelineNotesDraft] = useState('')
  const [editingTimelineNoteId, setEditingTimelineNoteId] = useState(null)
  const [editingTimelineNoteText, setEditingTimelineNoteText] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterBranches, setFilterBranches] = useState([])
  const [filterLastInteractionRange, setFilterLastInteractionRange] = useState(null)
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedBranchIds, setAppliedBranchIds] = useState([])
  const [appliedLastInteractionRange, setAppliedLastInteractionRange] = useState(null)

  const { data: branchesData } = useGetBranchesQuery()
  const branches = branchesData?.branches || []

  const queryParams = useMemo(
    () => ({
      search: appliedSearch || undefined,
      branch: appliedBranchIds.length ? appliedBranchIds : undefined,
      lastInteractionFrom: appliedLastInteractionRange?.[0] || undefined,
      lastInteractionTo: appliedLastInteractionRange?.[1] || undefined,
    }),
    [appliedSearch, appliedBranchIds, appliedLastInteractionRange]
  )

  const { data, isLoading, refetch } = useGetCustomersQuery(queryParams)
  const customers = data?.customers || []

  const [createCustomer, { isLoading: createLoading }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: updateLoading }] = useUpdateCustomerMutation()
  const [addTimelineNote, { isLoading: addingNote }] = useAddCustomerTimelineNoteMutation()
  const [updateTimelineNote, { isLoading: updatingNote }] = useUpdateCustomerTimelineNoteMutation()

  const {
    data: timelineResp,
    isLoading: timelineLoading,
    isFetching: timelineFetching,
    error: timelineError,
    refetch: refetchTimeline,
  } = useGetCustomerTimelineQuery(selectedCustomer?._id, { skip: !selectedCustomer?._id || !isTimelineVisible })

  const timelineCustomer = timelineResp?.customer || selectedCustomer
  const timelineLeads = timelineResp?.leads || []
  const timelineNotes = timelineResp?.timelineNotes || []

  useEffect(() => {
    if (!isTimelineVisible) {
      setTimelineNotesDraft('')
      setEditingTimelineNoteId(null)
      setEditingTimelineNoteText('')
    }
  }, [isTimelineVisible])

  const handleApplyFilters = () => {
    setAppliedSearch(filterSearch.trim())
    setAppliedBranchIds(filterBranches)
    setAppliedLastInteractionRange(
      filterLastInteractionRange?.[0] && filterLastInteractionRange?.[1]
        ? [
            filterLastInteractionRange[0].format('YYYY-MM-DD'),
            filterLastInteractionRange[1].format('YYYY-MM-DD'),
          ]
        : null
    )
  }

  const handleClearFilters = () => {
    setFilterSearch('')
    setFilterBranches([])
    setFilterLastInteractionRange(null)
    setAppliedSearch('')
    setAppliedBranchIds([])
    setAppliedLastInteractionRange(null)
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
    },
    {
      title: 'Mobile',
      dataIndex: 'mobile',
      key: 'mobile',
    },
    {
      title: 'WhatsApp',
      dataIndex: 'whatsapp',
      key: 'whatsapp',
      render: (v) => v || '-',
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
    },
    {
      title: 'Tags',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags) =>
        (tags || []).map((tag) => (
          <Tag key={tag} color={tag === 'Repeat Customer' ? 'green' : 'blue'}>
            {tag}
          </Tag>
        )),
    },
    {
      title: 'Total Leads',
      dataIndex: 'totalLeads',
      key: 'totalLeads',
      sorter: (a, b) => (a.totalLeads || 0) - (b.totalLeads || 0),
    },
    {
      title: 'Last Interaction',
      dataIndex: 'lastInteraction',
      key: 'lastInteraction',
    },
    {
      title: 'Action',
      key: 'actions',
      fixed: 'right',
      width: 52,
      align: 'center',
      render: (_, record) => {
        const items = [
          { key: 'timeline', label: 'View timeline', icon: <EyeOutlined /> },
        ]
        if (canEdit('customers')) {
          items.push({ key: 'edit', label: 'Edit customer', icon: <EditOutlined /> })
        }
        const openEdit = () => {
          setSelectedCustomer(record)
          form.setFieldsValue({
            name: record.name,
            mobile: record.mobile,
            whatsapp: record.whatsapp,
            branch: record.branchId || undefined,
            email: record.email || '',
            tags: record.tags || ['New Customer'],
          })
          setIsModalVisible(true)
        }
        return (
          <Dropdown
            menu={{
              items,
              onClick: ({ key, domEvent }) => {
                domEvent?.stopPropagation()
                if (key === 'timeline') {
                  setSelectedCustomer(record)
                  setIsTimelineVisible(true)
                } else if (key === 'edit') openEdit()
              },
            }}
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="customers-actions-dropdown"
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined className="customers-table-action-icon" style={{ fontSize: 18 }} />}
              onClick={(e) => e.stopPropagation()}
              aria-label="Customer actions"
            />
          </Dropdown>
        )
      },
    },
  ]

  const handleSubmit = async (values) => {
    try {
      if (selectedCustomer?._id) {
        await updateCustomer({
          id: selectedCustomer._id,
          name: values.name,
          mobile: values.mobile,
          whatsapp: values.whatsapp,
          branch: values.branch,
          email: values.email,
          tags: values.tags,
        }).unwrap()
        message.success('Customer updated')
      } else {
        await createCustomer({
          name: values.name,
          mobile: values.mobile,
          whatsapp: values.whatsapp,
          branch: values.branch,
          email: values.email,
          tags: values.tags || ['New Customer'],
        }).unwrap()
        message.success('Customer created')
      }
      setIsModalVisible(false)
      form.resetFields()
      setSelectedCustomer(null)
      refetch()
    } catch (e) {
      message.error(e?.data?.message || e?.message || 'Operation failed')
    }
  }

  const timelineData = useMemo(() => {
    if (!timelineCustomer) return []
    const items = [
      { color: 'blue', children: `Customer profile — last updated ${timelineCustomer.lastInteraction || '—'}` },
      { color: 'green', children: `Leads linked (conversions): ${timelineCustomer.totalLeads ?? 0}` },
      { color: 'orange', children: `Calls (matched phone): ${timelineCustomer.totalCalls ?? 0}` },
    ]
    const legacy = String(timelineCustomer.notes || '').trim()
    if (legacy) {
      items.push({
        color: 'purple',
        children: (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Legacy Notes</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{legacy}</div>
          </div>
        ),
      })
    }
    if ((timelineNotes || []).length) {
      items.push({
        color: 'purple',
        children: (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Timeline Notes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...timelineNotes]
                .slice()
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map((n) => (
                  <div key={n._id} style={{ padding: 0 }}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                    <div className="mgmt-muted" style={{ marginTop: 6 }}>
                      {n.performedBy || 'User'} •{' '}
                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ),
      })
    }
    return items
  }, [timelineCustomer, timelineNotes])

  const appointmentColumns = [
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110, render: (v) => v || '-' },
    {
      title: 'Date',
      dataIndex: 'appointment_date',
      key: 'appointment_date',
      render: (v) => (v ? new Date(v).toLocaleDateString() : '-'),
    },
    { title: 'Slot', dataIndex: 'slot_time', key: 'slot_time', render: (v) => v || '-' },
    { title: 'Package', dataIndex: 'spa_package', key: 'spa_package', render: (v) => v || '-' },
    {
      title: 'Completion Notes',
      dataIndex: 'completion_notes',
      key: 'completion_notes',
      render: (v) => (v ? String(v) : '-'),
    },
  ]

  const completedAppointments = useMemo(
    () => (timelineLeads || []).filter((l) => l.status === 'Converted'),
    [timelineLeads]
  )

  const allAppointments = useMemo(() => timelineLeads || [], [timelineLeads])

  const handleAddTimelineNote = async () => {
    try {
      if (!selectedCustomer?._id) return
      const text = String(timelineNotesDraft || '').trim()
      if (!text) {
        message.warning('Enter a note')
        return
      }
      await addTimelineNote({ id: selectedCustomer._id, text }).unwrap()
      message.success('Note added')
      setTimelineNotesDraft('')
      refetchTimeline()
    } catch (e) {
      message.error(e?.data?.message || e?.message || 'Failed to add note')
    }
  }

  const openEditTimelineNote = (note) => {
    setEditingTimelineNoteId(note?._id || null)
    setEditingTimelineNoteText(note?.text || '')
  }

  const handleSaveEditedTimelineNote = async () => {
    try {
      if (!selectedCustomer?._id || !editingTimelineNoteId) return
      const text = String(editingTimelineNoteText || '').trim()
      if (!text) {
        message.warning('Enter a note')
        return
      }
      await updateTimelineNote({ id: selectedCustomer._id, noteId: editingTimelineNoteId, text }).unwrap()
      message.success('Note updated')
      setEditingTimelineNoteId(null)
      setEditingTimelineNoteText('')
      refetchTimeline()
    } catch (e) {
      message.error(e?.data?.message || e?.message || 'Failed to update note')
    }
  }

  const tabItems = [
    {
      key: '1',
      label: 'All Customers',
      children: (
        <div className="table-responsive-wrapper">
          {isLoading ? (
            <div className="ds-loading-block">
              <Spin />
            </div>
          ) : customers.length === 0 ? (
            <Empty description="No customers yet. Convert a lead from Lead Management → Follow-up, or add manually." />
          ) : (
            <Table
              columns={columns}
              dataSource={customers}
              rowKey="_id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
              size={isMobile ? 'small' : 'middle'}
            />
          )}
        </div>
      ),
    },
    {
      key: '2',
      label: 'New Customers',
      children: (
        <div className="table-responsive-wrapper">
          <Table
            columns={columns}
            dataSource={customers.filter((c) => (c.tags || []).includes('New Customer'))}
            rowKey="_id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
            locale={{ emptyText: 'No new customers' }}
          />
        </div>
      ),
    },
    {
      key: '3',
      label: 'Repeat Customers',
      children: (
        <div className="table-responsive-wrapper">
          <Table
            columns={columns}
            dataSource={customers.filter((c) => (c.tags || []).includes('Repeat Customer'))}
            rowKey="_id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
            locale={{ emptyText: 'No repeat customers yet' }}
          />
        </div>
      ),
    },
  ]

  return (
    <PageLayout className="mgmt-page">
      <PageHeader
        title="Customer Management"
        extra={
          <Space wrap>
            <Button
              icon={showFilters ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setShowFilters(!showFilters)}
              size={isMobile ? 'small' : 'middle'}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            {canEdit('customers') && (
              <MotionButton
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setSelectedCustomer(null)
                  form.resetFields()
                  form.setFieldsValue({ tags: ['New Customer'] })
                  setIsModalVisible(true)
                }}
                size={isMobile ? 'small' : 'middle'}
              >
                {isMobile ? 'Add' : 'Add Customer'}
              </MotionButton>
            )}
          </Space>
        }
      />

      {showFilters && (
        <ContentCard staggerIndex={0} compact>
          <div className="ds-filters-row ds-filters-row--responsive">
            <Input
              className="ds-filter-grow"
              placeholder="Search by name, mobile or email"
              prefix={<SearchOutlined />}
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              onPressEnter={handleApplyFilters}
            />
            <RangePicker
              className="ds-filter-fixed"
              value={filterLastInteractionRange}
              onChange={setFilterLastInteractionRange}
              allowClear
              format="YYYY-MM-DD"
              placeholder={['Last interaction from', 'Last interaction to']}
            />
            <Select
              className="ds-filter-fixed"
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              placeholder="Branches (all if empty)"
              value={filterBranches}
              onChange={setFilterBranches}
              style={{ minWidth: 200 }}
            >
              {branches.map((b) => (
                <Option key={b._id} value={b._id}>
                  {b.name}
                </Option>
              ))}
            </Select>
            <Button type="primary" onClick={handleApplyFilters}>
              Apply
            </Button>
            <Button onClick={handleClearFilters}>Clear</Button>
          </div>
        </ContentCard>
      )}

      <ContentCard staggerIndex={showFilters ? 1 : 0} hoverLift={false}>
        <Tabs items={tabItems} className="mgmt-tabs" />
      </ContentCard>

      <Modal
        title={selectedCustomer ? 'Edit Customer' : 'Add New Customer'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
          setSelectedCustomer(null)
        }}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ tags: ['New Customer'] }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Please enter name' }]}>
            <Input placeholder="Enter name" />
          </Form.Item>
          <Form.Item name="mobile" label="Mobile" rules={[{ required: true, message: 'Please enter mobile' }]}>
            <Input placeholder="Mobile number" disabled={!!selectedCustomer} />
          </Form.Item>
          <Form.Item name="whatsapp" label="WhatsApp">
            <Input placeholder="WhatsApp number" />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input placeholder="Email" />
          </Form.Item>
          <Form.Item name="branch" label="Branch">
            <Select placeholder="Select branch" allowClear>
              {branches.map((b) => (
                <Option key={b._id} value={b._id}>
                  {b.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="tags" label="Tags">
            <Select mode="multiple" placeholder="Tags">
              <Option value="New Customer">New Customer</Option>
              <Option value="Repeat Customer">Repeat Customer</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <div className={`ds-form-footer ${isMobile ? 'ds-form-footer--stack-sm' : ''}`.trim()}>
              <Button type="primary" htmlType="submit" loading={createLoading || updateLoading}>
                {selectedCustomer ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>Cancel</Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Customer Timeline"
        open={isTimelineVisible}
        onCancel={() => setIsTimelineVisible(false)}
        footer={null}
        width={isMobile ? '95%' : 1000}
      >
        {selectedCustomer && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h3 className="mgmt-section-heading" style={{ marginBottom: 0 }}>
                {timelineCustomer?.name || selectedCustomer.name}
              </h3>
              <Button onClick={() => refetchTimeline()} loading={timelineFetching} disabled={timelineLoading}>
                Refresh
              </Button>
            </div>

            {timelineError ? (
              <div className="mgmt-muted" style={{ marginTop: 12 }}>
                Failed to load timeline. You can still edit notes below.
              </div>
            ) : timelineLoading ? (
              <div className="ds-loading-block">
                <Spin />
              </div>
            ) : (
              <Tabs
                className="mgmt-tabs"
                items={[
                  {
                    key: 'summary',
                    label: 'Summary',
                    children: <Timeline items={timelineData} />,
                  },
                  {
                    key: 'appointments',
                    label: `Appointments (${allAppointments.length})`,
                    children: (
                      <Tabs
                        items={[
                          {
                            key: 'completed',
                            label: `Completed (${completedAppointments.length})`,
                            children: (
                              <Table
                                columns={appointmentColumns}
                                dataSource={completedAppointments}
                                rowKey="_id"
                                pagination={{ pageSize: 5 }}
                                size={isMobile ? 'small' : 'middle'}
                                scroll={{ x: 'max-content' }}
                                locale={{ emptyText: 'No completed appointments yet' }}
                              />
                            ),
                          },
                          {
                            key: 'all',
                            label: `All (${allAppointments.length})`,
                            children: (
                              <Table
                                columns={appointmentColumns}
                                dataSource={allAppointments}
                                rowKey="_id"
                                pagination={{ pageSize: 5 }}
                                size={isMobile ? 'small' : 'middle'}
                                scroll={{ x: 'max-content' }}
                                locale={{ emptyText: 'No appointments linked yet' }}
                              />
                            ),
                          },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'notes',
                    label: 'Timeline Notes',
                    children: (
                      <div style={{ marginTop: 4 }}>
                        <TextArea
                          rows={5}
                          placeholder="Type a note and click Add Note. Notes are saved one-by-one."
                          value={timelineNotesDraft}
                          onChange={(e) => setTimelineNotesDraft(e.target.value)}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                          <Button onClick={() => setTimelineNotesDraft('')}>Clear</Button>
                          <Button type="primary" onClick={handleAddTimelineNote} loading={addingNote}>
                            Add Note
                          </Button>
                        </div>

                        <div style={{ marginTop: 16 }}>
                          {(timelineNotes || []).length === 0 ? (
                            <div className="mgmt-muted">No notes yet</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {[...timelineNotes]
                                .slice()
                                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                .map((n) => (
                                  <div key={n._id} style={{ padding: 10, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                                    <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                                      <div className="mgmt-muted">
                                        {n.performedBy || 'User'} •{' '}
                                        {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                                      </div>
                                      <Button size="small" onClick={() => openEditTimelineNote(n)}>
                                        Edit
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}
      </Modal>

      <Modal
        title="Edit Note"
        open={!!editingTimelineNoteId}
        onCancel={() => {
          setEditingTimelineNoteId(null)
          setEditingTimelineNoteText('')
        }}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        <TextArea
          rows={5}
          value={editingTimelineNoteText}
          onChange={(e) => setEditingTimelineNoteText(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button
            onClick={() => {
              setEditingTimelineNoteId(null)
              setEditingTimelineNoteText('')
            }}
          >
            Cancel
          </Button>
          <Button type="primary" onClick={handleSaveEditedTimelineNote} loading={updatingNote}>
            Save
          </Button>
        </div>
      </Modal>
    </PageLayout>
  )
}

export default Customers
