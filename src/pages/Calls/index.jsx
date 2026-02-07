import React, { useState } from 'react'
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Card,
  Modal,
  message,
  Popconfirm,
} from 'antd'
import {
  PhoneOutlined,
  PlayCircleOutlined,
  UserAddOutlined,
  SearchOutlined,
  DeleteOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { canCreate, canDelete } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import dayjs from 'dayjs'

const { Option } = Select

const Calls = () => {
  const { isMobile } = useResponsive()
  const [isCreateLeadVisible, setIsCreateLeadVisible] = useState(false)
  const [selectedCall, setSelectedCall] = useState(null)
  const [isRecordingVisible, setIsRecordingVisible] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [calls, setCalls] = useState([
    {
      key: '1',
      type: 'Inbound',
      phoneNumber: '+91 9876543210',
      duration: '05:32',
      agent: 'Agent A',
      status: 'Answered',
      recording: 'recording1.mp3',
      date: '2024-01-15 10:30',
      leadLinked: true,
      leadId: '1',
    },
    {
      key: '2',
      type: 'Outbound',
      phoneNumber: '+91 9876543211',
      duration: '03:15',
      agent: 'Agent B',
      status: 'Answered',
      recording: 'recording2.mp3',
      date: '2024-01-15 11:20',
      leadLinked: true,
      leadId: '2',
    },
    {
      key: '3',
      type: 'Inbound',
      phoneNumber: '+91 9876543212',
      duration: '00:00',
      agent: '-',
      status: 'Missed',
      recording: null,
      date: '2024-01-15 12:45',
      leadLinked: false,
      leadId: null,
    },
  ])

  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type) => (
        <Tag color={type === 'Inbound' ? 'green' : 'blue'}>{type}</Tag>
      ),
      filters: [
        { text: 'Inbound', value: 'Inbound' },
        { text: 'Outbound', value: 'Outbound' },
      ],
      onFilter: (value, record) => record.type === value,
    },
    {
      title: 'Phone Number',
      dataIndex: 'phoneNumber',
      key: 'phoneNumber',
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      sorter: (a, b) => {
        const aTime = a.duration.split(':').map(Number)
        const bTime = b.duration.split(':').map(Number)
        return aTime[0] * 60 + aTime[1] - (bTime[0] * 60 + bTime[1])
      },
    },
    {
      title: 'Agent',
      dataIndex: 'agent',
      key: 'agent',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Answered' ? 'green' : 'red'}>{status}</Tag>
      ),
      filters: [
        { text: 'Answered', value: 'Answered' },
        { text: 'Missed', value: 'Missed' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Date & Time',
      dataIndex: 'date',
      key: 'date',
      sorter: (a, b) => new Date(a.date) - new Date(b.date),
    },
    {
      title: 'Lead Linked',
      key: 'leadLinked',
      render: (_, record) => (
        <Tag color={record.leadLinked ? 'green' : 'default'}>
          {record.leadLinked ? 'Yes' : 'No'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {record.recording && (
            <Button
              type="link"
              icon={<PlayCircleOutlined />}
              onClick={() => {
                setSelectedCall(record)
                setIsRecordingVisible(true)
              }}
            >
              Play
            </Button>
          )}
          {!record.leadLinked && (
            <Button
              type="link"
              icon={<UserAddOutlined />}
              onClick={() => {
                setSelectedCall(record)
                setIsCreateLeadVisible(true)
              }}
            >
              Create Lead
            </Button>
          )}
          {canDelete('calls') && (
            <Popconfirm
              title="Delete this call log?"
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

  const handleDelete = (key) => {
    setCalls(calls.filter((call) => call.key !== key))
    message.success('Call log deleted successfully')
  }

  const handleCreateLead = () => {
    // Update call to mark as linked
    if (selectedCall) {
      setCalls(
        calls.map((call) =>
          call.key === selectedCall.key
            ? { ...call, leadLinked: true, leadId: Date.now().toString() }
            : call
        )
      )
      message.success('Lead created and linked to call')
    }
    setIsCreateLeadVisible(false)
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
        <h1 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '20px' : '24px' }}>Call Management</h1>
        <Space wrap style={{ width: isMobile ? '100%' : 'auto' }}>
          <Button
            icon={showFilters ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setShowFilters(!showFilters)}
            size={isMobile ? 'small' : 'middle'}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
          <Button type="primary" icon={<PhoneOutlined />} size={isMobile ? 'small' : 'middle'}>
            {isMobile ? 'Call' : 'Make Call'}
          </Button>
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
              placeholder="Search by phone number"
              prefix={<SearchOutlined />}
              style={{ width: isMobile ? '100%' : 250, flex: isMobile ? 'none' : '1 1 auto' }}
            />
            <Select placeholder="Filter by Type" style={{ width: isMobile ? '100%' : 150 }} allowClear>
              <Option value="Inbound">Inbound</Option>
              <Option value="Outbound">Outbound</Option>
            </Select>
            <Select placeholder="Filter by Status" style={{ width: isMobile ? '100%' : 150 }} allowClear>
              <Option value="Answered">Answered</Option>
              <Option value="Missed">Missed</Option>
            </Select>
            <Select placeholder="Filter by Agent" style={{ width: isMobile ? '100%' : 150 }} allowClear>
              <Option value="Agent A">Agent A</Option>
              <Option value="Agent B">Agent B</Option>
              <Option value="Agent C">Agent C</Option>
            </Select>
            <Button type="primary" style={{ width: isMobile ? '100%' : 'auto' }}>Apply Filter</Button>
          </div>
        </Card>
      )}

      <div className="table-responsive-wrapper">
        <Table
          columns={columns}
          dataSource={calls}
          pagination={{ pageSize: 10 }}
          style={{ background: '#1a1a1a' }}
          scroll={{ x: 'max-content' }}
          size={isMobile ? 'small' : 'middle'}
        />
      </div>

      <Modal
        title="Create Lead from Call"
        open={isCreateLeadVisible}
        onOk={handleCreateLead}
        onCancel={() => setIsCreateLeadVisible(false)}
        width={isMobile ? '95%' : 500}
        okButtonProps={{ style: { width: isMobile ? '100%' : 'auto' } }}
        cancelButtonProps={{ style: { width: isMobile ? '100%' : 'auto' } }}
      >
        <p>
          Create a new lead for phone number: <strong>{selectedCall?.phoneNumber}</strong>
        </p>
        <p style={{ color: '#888' }}>
          The lead will be automatically linked to this call record.
        </p>
      </Modal>

      <Modal
        title="Call Recording"
        open={isRecordingVisible}
        onCancel={() => setIsRecordingVisible(false)}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        {selectedCall && (
          <div>
            <p>
              <strong>Phone:</strong> {selectedCall.phoneNumber}
            </p>
            <p>
              <strong>Duration:</strong> {selectedCall.duration}
            </p>
            <p>
              <strong>Date:</strong> {selectedCall.date}
            </p>
            <div style={{ marginTop: 16 }}>
              <audio controls style={{ width: '100%' }}>
                <source src={`/recordings/${selectedCall.recording}`} type="audio/mpeg" />
                Your browser does not support the audio element.
              </audio>
            </div>
            <p style={{ marginTop: 16, color: '#888', fontSize: 12 }}>
              Note: This is a placeholder. In production, this would connect to Ozonetel API
              to fetch actual recordings.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default Calls
