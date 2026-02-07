import React, { useState } from 'react'
import {
  Table,
  Button,
  Input,
  Select,
  DatePicker,
  Space,
  Modal,
  Form,
  Tag,
  Card,
  Timeline,
  message,
  Popconfirm,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  PhoneOutlined,
  EyeOutlined,
  ImportOutlined,
  ExportOutlined,
  FilterOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { canCreate, canEdit, canDelete } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Option } = Select

const Leads = () => {
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isTimelineVisible, setIsTimelineVisible] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [leads, setLeads] = useState([
    {
      key: '1',
      name: 'John Doe',
      mobile: '+91 9876543210',
      whatsapp: '+91 9876543210',
      source: 'Call',
      branch: 'Branch 1',
      status: 'New',
      assignedTo: 'Agent A',
      lastInteraction: '2024-01-15 10:30',
      notes: 'Interested in spa services',
      createdAt: '2024-01-15',
    },
    {
      key: '2',
      name: 'Jane Smith',
      mobile: '+91 9876543211',
      whatsapp: '+91 9876543211',
      source: 'WhatsApp',
      branch: 'Branch 2',
      status: 'In Progress',
      assignedTo: 'Agent B',
      lastInteraction: '2024-01-15 14:20',
      notes: 'Follow-up scheduled',
      createdAt: '2024-01-14',
    },
    {
      key: '3',
      name: 'Mike Johnson',
      mobile: '+91 9876543212',
      whatsapp: '+91 9876543212',
      source: 'AI Bot',
      branch: 'Branch 1',
      status: 'Follow-Up',
      assignedTo: 'Agent C',
      lastInteraction: '2024-01-15 16:45',
      notes: 'AI bot captured lead',
      createdAt: '2024-01-13',
    },
  ])

  const navigate = useNavigate()

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
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (source) => {
        const colors = {
          Call: 'gold',
          WhatsApp: 'green',
          Facebook: 'blue',
          'AI Bot': 'cyan',
          Website: 'purple',
        }
        return <Tag color={colors[source]}>{source}</Tag>
      },
      filters: [
        { text: 'Call', value: 'Call' },
        { text: 'WhatsApp', value: 'WhatsApp' },
        { text: 'Facebook', value: 'Facebook' },
        { text: 'AI Bot', value: 'AI Bot' },
        { text: 'Website', value: 'Website' },
      ],
      onFilter: (value, record) => record.source === value,
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
      filters: [
        { text: 'Branch 1', value: 'Branch 1' },
        { text: 'Branch 2', value: 'Branch 2' },
        { text: 'Branch 3', value: 'Branch 3' },
      ],
      onFilter: (value, record) => record.branch === value,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = {
          New: 'blue',
          'In Progress': 'orange',
          'Follow-Up': 'purple',
          Converted: 'green',
          Lost: 'red',
        }
        return <Tag color={colors[status]}>{status}</Tag>
      },
      filters: [
        { text: 'New', value: 'New' },
        { text: 'In Progress', value: 'In Progress' },
        { text: 'Follow-Up', value: 'Follow-Up' },
        { text: 'Converted', value: 'Converted' },
        { text: 'Lost', value: 'Lost' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Assigned Agent',
      dataIndex: 'assignedTo',
      key: 'assignedTo',
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
              setSelectedLead(record)
              setIsTimelineVisible(true)
            }}
          >
            Timeline
          </Button>
          <Button
            type="link"
            icon={<PhoneOutlined />}
            onClick={() => navigate(`/calls?lead=${record.key}`)}
          >
            Call
          </Button>
          {canEdit('leads') && (
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              Edit
            </Button>
          )}
          {canDelete('leads') && (
            <Popconfirm
              title="Delete this lead?"
              onConfirm={() => handleDelete(record.key)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const handleAdd = () => {
    setSelectedLead(null)
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedLead(record)
    form.setFieldsValue({
      ...record,
      createdAt: record.createdAt ? dayjs(record.createdAt) : null,
    })
    setIsModalVisible(true)
  }

  const handleDelete = (key) => {
    setLeads(leads.filter((lead) => lead.key !== key))
    message.success('Lead deleted successfully')
  }

  const handleSubmit = (values) => {
    if (selectedLead) {
      setLeads(
        leads.map((lead) =>
          lead.key === selectedLead.key
            ? { ...lead, ...values, createdAt: values.createdAt?.format('YYYY-MM-DD') }
            : lead
        )
      )
      message.success('Lead updated successfully')
    } else {
      const newLead = {
        key: Date.now().toString(),
        ...values,
        createdAt: values.createdAt?.format('YYYY-MM-DD'),
        lastInteraction: dayjs().format('YYYY-MM-DD HH:mm'),
      }
      setLeads([...leads, newLead])
      message.success('Lead created successfully')
    }
    setIsModalVisible(false)
    form.resetFields()
  }

  const timelineData = selectedLead
    ? [
        {
          color: 'blue',
          children: `Lead created - ${selectedLead.createdAt}`,
        },
        {
          color: 'green',
          children: `Last interaction - ${selectedLead.lastInteraction}`,
        },
        {
          color: 'orange',
          children: `Assigned to ${selectedLead.assignedTo}`,
        },
        {
          color: 'purple',
          children: `Notes: ${selectedLead.notes}`,
        },
      ]
    : []

  const handleImport = () => {
    message.info('Import functionality will be implemented')
    // In production, this would open file picker and import leads
  }

  const handleExport = () => {
    message.success('Exporting leads to Excel...')
    // In production, this would export leads to Excel/CSV
  }

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
        <h1 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '20px' : '24px' }}>Lead Management</h1>
        <Space wrap style={{ width: isMobile ? '100%' : 'auto' }}>
          <Button icon={<ImportOutlined />} onClick={handleImport} size={isMobile ? 'small' : 'middle'}>
            {isMobile ? 'Import' : 'Import'}
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport} size={isMobile ? 'small' : 'middle'}>
            {isMobile ? 'Export' : 'Export'}
          </Button>
          <Button
            icon={showFilters ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setShowFilters(!showFilters)}
            size={isMobile ? 'small' : 'middle'}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
          {canCreate('leads') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size={isMobile ? 'small' : 'middle'}>
              {isMobile ? 'Add' : 'Add Lead'}
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
            <Select placeholder="Filter by Source" style={{ width: isMobile ? '100%' : 150 }} allowClear>
              <Option value="Call">Call</Option>
              <Option value="WhatsApp">WhatsApp</Option>
              <Option value="Facebook">Facebook</Option>
              <Option value="AI Bot">AI Bot</Option>
              <Option value="Website">Website</Option>
            </Select>
            <Select placeholder="Filter by Status" style={{ width: isMobile ? '100%' : 150 }} allowClear>
              <Option value="New">New</Option>
              <Option value="In Progress">In Progress</Option>
              <Option value="Follow-Up">Follow-Up</Option>
              <Option value="Converted">Converted</Option>
              <Option value="Lost">Lost</Option>
            </Select>
            <Select placeholder="Filter by Branch" style={{ width: isMobile ? '100%' : 150 }} allowClear>
              <Option value="Branch 1">Branch 1</Option>
              <Option value="Branch 2">Branch 2</Option>
              <Option value="Branch 3">Branch 3</Option>
            </Select>
            <RangePicker style={{ width: isMobile ? '100%' : 200 }} />
            <Button type="primary" style={{ width: isMobile ? '100%' : 'auto' }}>Apply Filter</Button>
          </div>
        </Card>
      )}

      <div className="table-responsive-wrapper">
        <Table
          columns={columns}
          dataSource={leads}
          pagination={{ pageSize: 10 }}
          style={{ background: '#1a1a1a' }}
          scroll={{ x: 'max-content' }}
          size={isMobile ? 'small' : 'middle'}
        />
      </div>

      <Modal
        title={selectedLead ? 'Edit Lead' : 'Add New Lead'}
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
            source: 'Call',
            status: 'New',
            branch: 'Branch 1',
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
            label="Mobile"
            rules={[{ required: true, message: 'Please enter mobile number' }]}
          >
            <Input placeholder="Enter mobile number" />
          </Form.Item>

          <Form.Item name="whatsapp" label="WhatsApp Number">
            <Input placeholder="Enter WhatsApp number" />
          </Form.Item>

          <Form.Item
            name="branch"
            label="Branch"
            rules={[{ required: true, message: 'Please select branch' }]}
          >
            <Select placeholder="Select branch">
              <Option value="Branch 1">Branch 1</Option>
              <Option value="Branch 2">Branch 2</Option>
              <Option value="Branch 3">Branch 3</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="source"
            label="Lead Source"
            rules={[{ required: true, message: 'Please select source' }]}
          >
            <Select placeholder="Select source">
              <Option value="Call">Call</Option>
              <Option value="WhatsApp">WhatsApp</Option>
              <Option value="Facebook">Facebook</Option>
              <Option value="AI Bot">AI Bot</Option>
              <Option value="Website">Website</Option>
            </Select>
          </Form.Item>

          <Form.Item name="status" label="Lead Stage">
            <Select placeholder="Select stage">
              <Option value="New">New</Option>
              <Option value="In Progress">In Progress</Option>
              <Option value="Follow-Up">Follow-Up</Option>
              <Option value="Converted">Converted</Option>
              <Option value="Lost">Lost</Option>
            </Select>
          </Form.Item>

          <Form.Item name="assignedTo" label="Assigned To">
            <Select placeholder="Select agent">
              <Option value="Agent A">Agent A</Option>
              <Option value="Agent B">Agent B</Option>
              <Option value="Agent C">Agent C</Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={4} placeholder="Enter notes" />
          </Form.Item>

          <Form.Item name="createdAt" label="Created Date">
            <DatePicker style={{ width: '100%' }} />
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
                {selectedLead ? 'Update' : 'Create'}
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
        title="Lead Timeline"
        open={isTimelineVisible}
        onCancel={() => setIsTimelineVisible(false)}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        <Timeline items={timelineData} />
      </Modal>
    </div>
  )
}

export default Leads
