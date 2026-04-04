import React, { useState, useMemo, useEffect } from 'react'
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
  PlayCircleOutlined,
  UserAddOutlined,
  SearchOutlined,
  ReloadOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useResponsive } from '../../hooks/useResponsive'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import { useGetCallLogsQuery } from '../../store/api/cloudAgentApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import { useMergeCallAudioMutation } from '../../store/api/leadApi'
import dayjs from 'dayjs'
import './CallsPage.css'

const { Option } = Select

const formatDuration = (seconds) => {
  if (seconds == null || seconds === 0) return '00:00'
  const m = Math.floor(Number(seconds) / 60)
  const s = Math.floor(Number(seconds) % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const getAgentDisplayName = (log) => {
  const agentName = String(log.agent_name || log.agentName || '').trim()
  const agentId = String(log.agent_id || log.agentId || '').trim()
  return agentName || agentId || '-'
}

const getBranchDisplay = (log) => {
  const raw = log.branches
  if (!Array.isArray(raw) || raw.length === 0) return null
  const names = raw
    .map((b) => (typeof b === 'object' && b?.name ? String(b.name).trim() : ''))
    .filter(Boolean)
  return names.length ? names.join(', ') : null
}

/** Aligns provider spellings with CRM labels (Answered / Missed). Matches cloudagentController status filter. */
const normalizeCallRecordStatus = (raw) => {
  const s = String(raw ?? '').trim()
  if (!s || s === '-') return '-'
  if (/^answered$/i.test(s) || /^answer$/i.test(s) || /^connected$/i.test(s)) return 'Answered'
  if (
    /^missed$/i.test(s) ||
    /^no[\s-]?answer$/i.test(s) ||
    /^unanswered$/i.test(s) ||
    /^not[\s-]?answered$/i.test(s)
  ) {
    return 'Missed'
  }
  return s
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
  const [filterBranches, setFilterBranches] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [searchText, setSearchText] = useState('')
  const [callPage, setCallPage] = useState(1)
  const [callPageSize, setCallPageSize] = useState(10)
  const [mergeCallAudio, { isLoading: mergeAudioLoading }] = useMergeCallAudioMutation()

  const {
    data: callLogsData,
    isLoading: callsLoading,
    isFetching: callsFetching,
    refetch: refetchCalls,
  } = useGetCallLogsQuery({
    page: callPage,
    limit: callPageSize,
    type: filterType || undefined,
    status: filterStatus || undefined,
    search: searchText?.trim() || undefined,
    branch: filterBranches.length ? filterBranches : undefined,
  })

  const { data: branchesData } = useGetBranchesQuery()
  const branchOptions = useMemo(() => {
    const list = branchesData?.branches ?? []
    return list.map((b) => ({ value: b._id || b.id, label: b.name }))
  }, [branchesData])

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
      agent: getAgentDisplayName(log),
      branch: getBranchDisplay(log),
      status: normalizeCallRecordStatus(log.call_status || '-'),
      recordingUrl: log.recording_url,
      date: log.start_time ? dayjs(log.start_time).format('YYYY-MM-DD HH:mm') : dayjs(log.createdAt).format('YYYY-MM-DD HH:mm'),
      leadLinked: !!log.lead,
      leadId: log.lead?._id,
      leadStatus: log.lead?.status || '',
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
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
      render: (text) => (text ? <Tag color="blue">{text}</Tag> : <span className="mgmt-muted">—</span>),
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
          {record.recordingUrl && record.leadLinked ? (
            <Button
              type="link"
              loading={mergeAudioLoading}
              onClick={() => handleMergeAudio(record)}
            >
              Merge Audio
            </Button>
          ) : null}
          {!record.leadLinked && record.leadStatus !== 'Converted' && (
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
      navigate('/leads', {
        state: {
          createLeadFromCall: true,
          phone: selectedCall.phoneNumber.replace(/\D/g, ''),
          callLogId: selectedCall._id,
          callMeta: {
            recordingUrl: selectedCall.recordingUrl || '',
            callType: selectedCall.type || '',
            callStatus: selectedCall.status || '',
            agentName: selectedCall.agent || '',
            callStartedAt: selectedCall.date || '',
          },
        },
      })
      messageApi.success('Redirecting to create lead with this number')
    }
    setIsCreateLeadVisible(false)
  }

  const handleFilterTypeChange = (value) => {
    setCallPage(1)
    setFilterType(value)
  }

  const handleFilterStatusChange = (value) => {
    setCallPage(1)
    setFilterStatus(value)
  }

  const handleFilterBranchesChange = (value) => {
    setCallPage(1)
    setFilterBranches(value || [])
  }

  const handleRefreshCalls = async () => {
    try {
      await refetchCalls()
      messageApi.success('Call logs refreshed')
    } catch {
      messageApi.error('Failed to refresh call logs')
    }
  }

  const handleMergeAudio = async (record) => {
    try {
      await mergeCallAudio({
        leadId: record.leadId || undefined,
        phone: record.phoneNumber,
        callLogId: record._id,
        recordingUrl: record.recordingUrl,
        callType: record.type,
        callStatus: record.status,
        agentName: record.agent,
        callStartedAt: record.date,
      }).unwrap()
      messageApi.success('Audio merged to lead. Open Lead Details to listen.')
      refetchCalls()
    } catch (error) {
      messageApi.error(error?.data?.message || 'Unable to merge audio to lead')
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCallPage(1)
      setSearchText(searchInput)
    }, 350)

    return () => clearTimeout(timeoutId)
  }, [searchInput])

  return (
    <PageLayout className="mgmt-page">
      <PageHeader
        title="Call Management"
        extra={
          <Space wrap className={`calls-toolbar ${isMobile ? 'ds-page-header__extra--full-mobile' : ''}`}>
            <Button
              icon={showFilters ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setShowFilters(!showFilters)}
              size={isMobile ? 'small' : 'middle'}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            <Input
              className="calls-toolbar__search"
              placeholder="Search by phone number"
              prefix={<SearchOutlined />}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              allowClear
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="Branches (all if empty)"
              value={filterBranches}
              onChange={handleFilterBranchesChange}
              maxTagCount="responsive"
              optionFilterProp="children"
              style={{ minWidth: isMobile ? 140 : 200 }}
              size={isMobile ? 'small' : 'middle'}
            >
              {branchOptions.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
            <Button
              onClick={handleRefreshCalls}
              icon={<ReloadOutlined />}
              loading={callsFetching}
              size={isMobile ? 'small' : 'middle'}
            >
              Refresh
            </Button>
          </Space>
        }
      />

      {showFilters && (
        <ContentCard staggerIndex={0} compact>
          <div className="ds-filters-row ds-filters-row--responsive">
            <Select className="ds-filter-fixed" placeholder="Filter by Type" allowClear value={filterType} onChange={handleFilterTypeChange}>
              <Option value="Inbound">Inbound</Option>
              <Option value="Outbound">Outbound</Option>
            </Select>
            <Select className="ds-filter-fixed" placeholder="Filter by Status" allowClear value={filterStatus} onChange={handleFilterStatusChange}>
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
