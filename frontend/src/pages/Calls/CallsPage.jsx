import React, { useState, useMemo } from 'react'
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Spin,
  App,
} from 'antd'
import {
  PhoneOutlined,
  PlayCircleOutlined,
  UserAddOutlined,
  SearchOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useResponsive } from '../../hooks/useResponsive'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import MotionButton from '../../components/MotionButton'
import { useGetCallLogsQuery } from '../../store/api/cloudAgentApi'
import dayjs from 'dayjs'
import './CallsPage.css'

const { Option } = Select

const formatDuration = (seconds) => {
  if (seconds == null || seconds === 0) return '00:00'
  const m = Math.floor(Number(seconds) / 60)
  const s = Math.floor(Number(seconds) % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const Calls = () => {
  const { message: messageApi } = App.useApp()
  const navigate = useNavigate()
  const { isMobile } = useResponsive()
  const [isCreateLeadVisible, setIsCreateLeadVisible] = useState(false)
  const [selectedCall, setSelectedCall] = useState(null)
  const [isRecordingVisible, setIsRecordingVisible] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterType, setFilterType] = useState(undefined)
  const [filterStatus, setFilterStatus] = useState(undefined)
  const [searchText, setSearchText] = useState('')
  const [callPage, setCallPage] = useState(1)
  const [callPageSize, setCallPageSize] = useState(10)

  const { data: callLogsData, isLoading: callsLoading } = useGetCallLogsQuery({
    page: callPage,
    limit: callPageSize,
    type: filterType || undefined,
    status: filterStatus || undefined,
    search: searchText?.trim() || undefined,
  })

  const callLogs = callLogsData?.callLogs || []
  const pagination = callLogsData?.pagination || { total: 0, page: 1, limit: 10, pages: 1 }

  const calls = useMemo(() => {
    return callLogs.map((log) => ({
      key: log._id,
      _id: log._id,
      type: log.call_type || 'Outbound',
      phoneNumber: log.customer_number || '-',
      duration: formatDuration(log.duration_seconds),
      durationSeconds: log.duration_seconds,
      agent: log.agent_id || '-',
      status: log.call_status || '-',
      recordingUrl: log.recording_url,
      date: log.start_time ? dayjs(log.start_time).format('YYYY-MM-DD HH:mm') : dayjs(log.createdAt).format('YYYY-MM-DD HH:mm'),
      leadLinked: !!log.lead,
      leadId: log.lead?._id,
      lead: log.lead,
    }))
  }, [callLogs])

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
          {record.recordingUrl ? (
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
          ) : null}
          {!record.leadLinked && (
            <Button
              type="link"
              className="calls-create-lead-link"
              icon={<UserAddOutlined />}
              onClick={() => {
                setSelectedCall(record)
                setIsCreateLeadVisible(true)
              }}
            >
              Create Lead
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const handleCreateLead = () => {
    if (selectedCall?.phoneNumber) {
      navigate('/leads', { state: { createLeadFromCall: true, phone: selectedCall.phoneNumber.replace(/\D/g, '') } })
      messageApi.success('Redirecting to create lead with this number')
    }
    setIsCreateLeadVisible(false)
  }

  return (
    <PageLayout className="mgmt-page">
      <PageHeader
        title="Call Management"
        extra={
          <Space wrap className={isMobile ? 'ds-page-header__extra--full-mobile' : ''}>
            <Button
              icon={showFilters ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setShowFilters(!showFilters)}
              size={isMobile ? 'small' : 'middle'}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            {/* <MotionButton type="primary" icon={<PhoneOutlined />} size={isMobile ? 'small' : 'middle'} onClick={() => navigate('/leads')}>
              {isMobile ? 'Call' : 'Make Call (from Leads)'}
            </MotionButton> */}
          </Space>
        }
      />

      {showFilters && (
        <ContentCard staggerIndex={0} compact>
          <div className="ds-filters-row ds-filters-row--responsive">
            <Input
              className="ds-filter-grow"
              placeholder="Search by phone number"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <Select className="ds-filter-fixed" placeholder="Filter by Type" allowClear value={filterType} onChange={setFilterType}>
              <Option value="Inbound">Inbound</Option>
              <Option value="Outbound">Outbound</Option>
            </Select>
            <Select className="ds-filter-fixed" placeholder="Filter by Status" allowClear value={filterStatus} onChange={setFilterStatus}>
              <Option value="Answered">Answered</Option>
              <Option value="Missed">Missed</Option>
            </Select>
          </div>
        </ContentCard>
      )}

      <ContentCard staggerIndex={showFilters ? 1 : 0} className="ds-table-shell" innerClassName="ds-content-card__inner--flush">
        <div className="table-responsive-wrapper">
          {callsLoading ? (
            <div className="ds-loading-block">
              <Spin size="large" />
              <p className="mgmt-loading-text">Loading call logs...</p>
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={calls}
              rowKey="key"
              pagination={{
                current: pagination.page,
                pageSize: pagination.limit,
                total: pagination.total,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} calls`,
                onChange: (page, size) => {
                  setCallPage(page)
                  setCallPageSize(size)
                },
              }}
              scroll={{ x: 'max-content' }}
              size={isMobile ? 'small' : 'middle'}
            />
          )}
        </div>
      </ContentCard>

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
            {selectedCall.recordingUrl ? (
              <div style={{ marginTop: 16 }}>
                <audio controls style={{ width: '100%' }}>
                  <source src={selectedCall.recordingUrl} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
                <p style={{ marginTop: 8, fontSize: 12 }}>
                  <a href={selectedCall.recordingUrl} target="_blank" rel="noopener noreferrer">Open in new tab</a>
                </p>
              </div>
            ) : (
              <p className="mgmt-muted" style={{ marginTop: 16 }}>No recording URL available for this call.</p>
            )}
          </div>
        )}
      </Modal>
    </PageLayout>
  )
}

export default Calls
