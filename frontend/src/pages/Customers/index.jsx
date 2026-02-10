import React, { useState } from 'react'
import {
  Table,
  Button,
  Input,
  Card,
  Tag,
  Timeline,
  Modal,
  Form,
  Space,
  message,
  Tabs,
  Select,
} from 'antd'
import {
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  PlusOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { canEdit } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import dayjs from 'dayjs'

const { TextArea } = Input
const { Option } = Select

const Customers = () => {
  const { isMobile } = useResponsive()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isTimelineVisible, setIsTimelineVisible] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [form] = Form.useForm()
  const [showFilters, setShowFilters] = useState(false)
  const [customers, setCustomers] = useState([
    {
      key: '1',
      name: 'John Doe',
      mobile: '+91 9876543210',
      whatsapp: '+91 9876543210',
      branch: 'Branch 1',
      tags: ['New Customer'],
      totalLeads: 3,
      totalCalls: 5,
      totalChats: 2,
      lastInteraction: '2024-01-15 10:30',
    },
    {
      key: '2',
      name: 'Jane Smith',
      mobile: '+91 9876543211',
      whatsapp: '+91 9876543211',
      branch: 'Branch 2',
      tags: ['Repeat Customer'],
      totalLeads: 5,
      totalCalls: 8,
      totalChats: 4,
      lastInteraction: '2024-01-15 14:20',
    },
    {
      key: '3',
      name: 'Mike Johnson',
      mobile: '+91 9876543212',
      whatsapp: '+91 9876543212',
      branch: 'Branch 1',
      tags: ['New Customer'],
      totalLeads: 1,
      totalCalls: 2,
      totalChats: 1,
      lastInteraction: '2024-01-15 16:45',
    },
  ])

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
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
      render: (tags) => (
        <>
          {tags.map((tag) => (
            <Tag
              key={tag}
              color={tag === 'Repeat Customer' ? 'green' : 'blue'}
            >
              {tag}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: 'Total Leads',
      dataIndex: 'totalLeads',
      key: 'totalLeads',
      sorter: (a, b) => a.totalLeads - b.totalLeads,
    },
    {
      title: 'Last Interaction',
      dataIndex: 'lastInteraction',
      key: 'lastInteraction',
      sorter: (a, b) => new Date(a.lastInteraction) - new Date(b.lastInteraction),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedCustomer(record)
              setIsTimelineVisible(true)
            }}
          >
            Timeline
          </Button>
          {canEdit('customers') && (
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => {
                setSelectedCustomer(record)
                form.setFieldsValue(record)
                setIsModalVisible(true)
              }}
            >
              Edit
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const handleSubmit = (values) => {
    if (selectedCustomer) {
      setCustomers(
        customers.map((customer) =>
          customer.key === selectedCustomer.key
            ? { ...customer, ...values }
            : customer
        )
      )
      message.success('Customer updated successfully')
    } else {
      const newCustomer = {
        key: Date.now().toString(),
        ...values,
        totalLeads: 0,
        totalCalls: 0,
        totalChats: 0,
        lastInteraction: dayjs().format('YYYY-MM-DD HH:mm'),
      }
      setCustomers([...customers, newCustomer])
      message.success('Customer created successfully')
    }
    setIsModalVisible(false)
    form.resetFields()
  }

  const timelineData = selectedCustomer
    ? [
        {
          color: 'blue',
          children: `Customer created - ${selectedCustomer.lastInteraction}`,
        },
        {
          color: 'green',
          children: `Total Leads: ${selectedCustomer.totalLeads}`,
        },
        {
          color: 'orange',
          children: `Total Calls: ${selectedCustomer.totalCalls}`,
        },
        {
          color: 'purple',
          children: `Total Chats: ${selectedCustomer.totalChats}`,
        },
        {
          color: 'cyan',
          children: `Last Interaction: ${selectedCustomer.lastInteraction}`,
        },
      ]
    : []

  const tabItems = [
    {
      key: '1',
      label: 'All Customers',
      children: (
        <div className="table-responsive-wrapper">
          <Table
            columns={columns}
            dataSource={customers}
            pagination={{ pageSize: 10 }}
            style={{ background: '#1a1a1a' }}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
          />
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
            dataSource={customers.filter((c) => c.tags.includes('New Customer'))}
            pagination={{ pageSize: 10 }}
            style={{ background: '#1a1a1a' }}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
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
            dataSource={customers.filter((c) => c.tags.includes('Repeat Customer'))}
            pagination={{ pageSize: 10 }}
            style={{ background: '#1a1a1a' }}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
          />
        </div>
      ),
    },
  ]

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', position: 'relative' }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center',
        marginBottom: 16,
        gap: 12,
      }}>
        <h1 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '20px' : '24px' }}>Customer Management</h1>
        <Space wrap style={{ width: isMobile ? '100%' : 'auto' }}>
          <Button
            icon={showFilters ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setShowFilters(!showFilters)}
            size={isMobile ? 'small' : 'middle'}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
          {canEdit('customers') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedCustomer(null)
                form.resetFields()
                setIsModalVisible(true)
              }}
              size={isMobile ? 'small' : 'middle'}
            >
              {isMobile ? 'Add' : 'Add Customer'}
            </Button>
          )}
        </Space>
      </div>

      {showFilters && (
        <Card style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 16 }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            gap: 12,
            width: '100%'
          }}>
            <Input
              placeholder="Search by name or mobile"
              prefix={<SearchOutlined />}
              style={{ width: isMobile ? '100%' : 250, flex: isMobile ? 'none' : '1 1 auto' }}
            />
            <Select placeholder="Filter by Branch" style={{ width: isMobile ? '100%' : 150 }} allowClear>
              <Option value="Branch 1">Branch 1</Option>
              <Option value="Branch 2">Branch 2</Option>
              <Option value="Branch 3">Branch 3</Option>
            </Select>
            <Select placeholder="Filter by Tag" style={{ width: isMobile ? '100%' : 150 }} allowClear>
              <Option value="New Customer">New Customer</Option>
              <Option value="Repeat Customer">Repeat Customer</Option>
            </Select>
            <Button type="primary" style={{ width: isMobile ? '100%' : 'auto' }}>Apply Filter</Button>
          </div>
        </Card>
      )}

      <Tabs items={tabItems} style={{ color: '#ffffff' }} />

      <Modal
        title={selectedCustomer ? 'Edit Customer' : 'Add New Customer'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
        }}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            tags: ['New Customer'],
          }}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input placeholder="Enter name" />
          </Form.Item>

          <Form.Item
            name="mobile"
            label="Mobile (Primary Key)"
            rules={[{ required: true, message: 'Please enter mobile number' }]}
          >
            <Input placeholder="Enter mobile number" />
          </Form.Item>

          <Form.Item name="whatsapp" label="WhatsApp Number">
            <Input placeholder="Enter WhatsApp number" />
          </Form.Item>

          <Form.Item name="branch" label="Branch">
            <Input placeholder="Enter branch" />
          </Form.Item>

          <Form.Item>
            <div style={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              gap: 8,
              width: '100%'
            }}>
              <Button 
                type="primary" 
                htmlType="submit"
                style={{ width: isMobile ? '100%' : 'auto' }}
              >
                {selectedCustomer ? 'Update' : 'Create'}
              </Button>
              <Button 
                onClick={() => setIsModalVisible(false)}
                style={{ width: isMobile ? '100%' : 'auto' }}
              >
                Cancel
              </Button>
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
            <h3 style={{ color: '#D4AF37', marginBottom: 16 }}>
              {selectedCustomer.name}
            </h3>
            <Timeline items={timelineData} />
            <div style={{ marginTop: 24 }}>
              <h4 style={{ color: '#ffffff' }}>Add Note</h4>
              <TextArea rows={4} placeholder="Enter note..." />
              <Button type="primary" style={{ marginTop: 8, width: isMobile ? '100%' : 'auto' }}>
                Add Note
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Customers
