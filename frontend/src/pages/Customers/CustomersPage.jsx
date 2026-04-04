import React, { useState, useMemo } from 'react'
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
} from '../../store/api/customerApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'

const { TextArea } = Input
const { Option } = Select

const Customers = () => {
  const { message } = App.useApp()
  const { isMobile } = useResponsive()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isTimelineVisible, setIsTimelineVisible] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [form] = Form.useForm()
  const [showFilters, setShowFilters] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterBranches, setFilterBranches] = useState([])
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedBranchIds, setAppliedBranchIds] = useState([])

  const { data: branchesData } = useGetBranchesQuery()
  const branches = branchesData?.branches || []

  const queryParams = useMemo(
    () => ({
      search: appliedSearch || undefined,
      branch: appliedBranchIds.length ? appliedBranchIds : undefined,
    }),
    [appliedSearch, appliedBranchIds]
  )

  const { data, isLoading, refetch } = useGetCustomersQuery(queryParams)
  const customers = data?.customers || []

  const [createCustomer, { isLoading: createLoading }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: updateLoading }] = useUpdateCustomerMutation()

  const handleApplyFilters = () => {
    setAppliedSearch(filterSearch.trim())
    setAppliedBranchIds(filterBranches)
  }

  const handleClearFilters = () => {
    setFilterSearch('')
    setFilterBranches([])
    setAppliedSearch('')
    setAppliedBranchIds([])
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

  const timelineData = selectedCustomer
    ? [
        { color: 'blue', children: `Customer profile — last updated ${selectedCustomer.lastInteraction || '—'}` },
        { color: 'green', children: `Leads linked (conversions): ${selectedCustomer.totalLeads ?? 0}` },
        { color: 'orange', children: `Calls (matched phone): ${selectedCustomer.totalCalls ?? 0}` },
        { color: 'purple', children: `Chat estimate: ${selectedCustomer.totalChats ?? 0}` },
      ]
    : []

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
        width={isMobile ? '95%' : 600}
      >
        {selectedCustomer && (
          <div>
            <h3 className="mgmt-section-heading">{selectedCustomer.name}</h3>
            <Timeline items={timelineData} />
            <div className="mgmt-muted" style={{ marginTop: 24 }}>
              <h4 className="mgmt-subheading">Notes</h4>
              <TextArea rows={3} placeholder="Use Edit customer to update profile." readOnly />
            </div>
          </div>
        )}
      </Modal>
    </PageLayout>
  )
}

export default Customers
