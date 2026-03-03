import React, { useState, useEffect, useMemo } from 'react'
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
  Spin,
  App,
  Upload,
  Alert,
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
  UpOutlined,
  DownOutlined,
  UploadOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { canCreate, canEdit, canDelete } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetLeadsQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useLazyExportLeadsQuery,
  useImportLeadsMutation,
} from '../../store/api/leadApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import { useGetUsersQuery } from '../../store/api/userApi'
import { useGetCampaignsQuery, useMakeCallMutation } from '../../store/api/cloudAgentApi'
import { useGetMeQuery } from '../../store/api/authApi'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
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

const Leads = () => {
  const { message: messageApi } = App.useApp()
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isTimelineVisible, setIsTimelineVisible] = useState(false)
  const [isImportModalVisible, setIsImportModalVisible] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  // Filter states
  const [searchText, setSearchText] = useState('')
  const [filterSource, setFilterSource] = useState(null)
  const [filterStatus, setFilterStatus] = useState(null)
  const [filterBranch, setFilterBranch] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const navigate = useNavigate()
  const location = useLocation()

  // Open Add Lead modal with phone prefilled when coming from Calls "Create Lead"
  useEffect(() => {
    const state = location.state
    if (state?.createLeadFromCall && state?.phone) {
      form.setFieldsValue({
        phone: state.phone,
        source: 'Call',
        status: 'New',
      })
      setSelectedLead(null)
      setIsModalVisible(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  // API hooks
  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useGetLeadsQuery({
    search: searchText || undefined,
    source: filterSource || undefined,
    status: filterStatus || undefined,
    branch: filterBranch || undefined,
    page: currentPage,
    limit: pageSize,
  })

  const { data: branchesData } = useGetBranchesQuery()
  const { data: usersData } = useGetUsersQuery()
  const { data: meData } = useGetMeQuery()
  const { data: campaignsData } = useGetCampaignsQuery()
  const [makeCall, { isLoading: callLoading }] = useMakeCallMutation()

  const campaignIds = campaignsData?.campaignIds || []
  const defaultCampaign = campaignsData?.defaultCampaign || ''
  const [createLead, { isLoading: createLoading }] = useCreateLeadMutation()
  const [updateLead, { isLoading: updateLoading }] = useUpdateLeadMutation()
  const [deleteLeadMutation] = useDeleteLeadMutation()
  const [exportLeads] = useLazyExportLeadsQuery()
  const [importLeads, { isLoading: importLoading }] = useImportLeadsMutation()

  const leads = leadsData?.leads || []
  const branches = branchesData?.branches || []
  const users = usersData?.users || []
  const pagination = leadsData?.pagination || { total: 0, page: 1, limit: 10, pages: 1 }

  // Transform backend data to frontend format
  const transformedLeads = useMemo(() => {
    return leads.map((lead) => ({
      key: lead._id || lead.id,
      _id: lead._id || lead.id,
      name: lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '',
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      mobile: lead.phone,
      whatsapp: lead.whatsapp || lead.phone,
      email: lead.email,
      subject: lead.subject,
      message: lead.message,
      source: lead.source,
      status: lead.status,
      branch: lead.branch?.name || lead.branch || 'Unassigned',
      branchId: lead.branch?._id || lead.branch?.id || null,
      appointment_date: lead.appointment_date || null,
      slot_time: lead.slot_time || '',
      spa_package: lead.spa_package || '',
      assignedTo: (() => {
        if (!lead.assignedTo) return 'Unassigned'
        if (typeof lead.assignedTo === 'object' && lead.assignedTo.name) {
          return lead.assignedTo.name
        }
        if (typeof lead.assignedTo === 'string' && lead.assignedTo.trim() !== '' && lead.assignedTo !== 'undefined') {
          return lead.assignedTo
        }
        return 'Unassigned'
      })(),
      assignedToId: (() => {
        if (!lead.assignedTo) return null
        if (typeof lead.assignedTo === 'object') {
          return lead.assignedTo._id || lead.assignedTo.id || null
        }
        if (typeof lead.assignedTo === 'string' && lead.assignedTo.trim() !== '' && lead.assignedTo !== 'undefined') {
          return lead.assignedTo
        }
        return null
      })(),
      lastInteraction: lead.lastInteraction ? dayjs(lead.lastInteraction).format('YYYY-MM-DD HH:mm') : dayjs(lead.createdAt).format('YYYY-MM-DD HH:mm'),
      notes: lead.notes || '',
      createdAt: lead.createdAt ? dayjs(lead.createdAt).format('YYYY-MM-DD') : '',
      websiteUrl: lead.websiteUrl,
      ipAddress: lead.ipAddress,
    }))
  }, [leads])

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
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email) => email || '-',
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (source) => {
        const colors = {
          Add: 'orange',
          Call: 'gold',
          WhatsApp: 'green',
          Facebook: 'blue',
          Insta: 'pink',
          Website: 'purple',
          Import: 'cyan',
        }
        return <Tag color={colors[source] || 'default'}>{source}</Tag>
      },
      filters: [
        { text: 'Add', value: 'Add' },
        { text: 'Call', value: 'Call' },
        { text: 'WhatsApp', value: 'WhatsApp' },
        { text: 'Facebook', value: 'Facebook' },
        { text: 'Insta', value: 'Insta' },
        { text: 'Website', value: 'Website' },
        { text: 'Import', value: 'Import' },
      ],
      onFilter: (value, record) => record.source === value,
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
      render: (branch) => branch || 'Unassigned',
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
        return <Tag color={colors[status] || 'default'}>{status}</Tag>
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
      render: (assignedTo) => {
        if (!assignedTo || assignedTo === 'undefined' || assignedTo === 'null' || assignedTo === 'Unassigned') {
          return 'Unassigned'
        }
        return String(assignedTo).trim() || 'Unassigned'
      },
    },
    {
      title: 'Last Interaction',
      dataIndex: 'lastInteraction',
      key: 'lastInteraction',
      sorter: (a, b) => new Date(a.lastInteraction) - new Date(b.lastInteraction),
      render: (text) => text || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          {canCreate('calls') && record.mobile && (
            <Button
              type="link"
              size="small"
              icon={<PhoneOutlined />}
              onClick={() => openCallModal(record)}
            >
              Call
            </Button>
          )}
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedLead(record)
              setIsTimelineVisible(true)
            }}
          >
            View
          </Button>
          {canEdit('leads') && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              Edit
            </Button>
          )}
          {canDelete('leads') && (
            <Popconfirm
              title="Delete this lead?"
              onConfirm={() => handleDelete(record._id)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
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
    form.setFieldsValue({
      source: 'Add',
      status: 'New',
    })
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedLead(record)
    form.setFieldsValue({
      first_name: record.first_name || '',
      last_name: record.last_name || '',
      email: record.email,
      phone: record.mobile,
      whatsapp: record.whatsapp,
      subject: record.subject,
      message: record.message,
      source: record.source,
      status: record.status,
      branch: record.branchId,
      appointment_date: record.appointment_date ? dayjs(record.appointment_date) : null,
      slot_time: record.slot_time || '',
      spa_package: record.spa_package || '',
      assignedTo: record.assignedToId,
      notes: record.notes,
    })
    setIsModalVisible(true)
  }

  const handleDelete = async (leadId) => {
    try {
      await deleteLeadMutation(leadId).unwrap()
      messageApi.success('Lead deleted successfully')
      refetchLeads()
    } catch (error) {
      messageApi.error(error?.data?.message || 'Failed to delete lead')
    }
  }

  const openCallModal = (record) => {
    const phoneNumber = (record.mobile || record.phone || '').trim().replace(/\s/g, '')
    if (!phoneNumber) {
      messageApi.warning('No phone number for this lead')
      return
    }
    const currentUser = meData?.user
    const agentId = currentUser?.cloudAgentAgentId || ''
    if (!agentId) {
      messageApi.warning('Set your CloudAgent Agent ID in Settings → User Management (edit your user) to use Click-to-Call.')
      return
    }
    setCallLeadRecord(record)
    setCallCampaign(campaignsData?.defaultCampaign || campaignIds?.[0] || '')
    setIsCallModalVisible(true)
  }

  const handleCloseCallModal = () => {
    setIsCallModalVisible(false)
    setCallLeadRecord(null)
    setCallCampaign('')
  }

  const handleConfirmCall = async () => {
    if (!callLeadRecord) return
    const phoneNumber = (callLeadRecord.mobile || callLeadRecord.phone || '').trim().replace(/\s/g, '')
    const agentId = meData?.user?.cloudAgentAgentId || ''
    const campaignName = (callCampaign || defaultCampaign || campaignIds?.[0] || '').trim()
    if (!campaignName) {
      messageApi.warning('Select a campaign or set Default Campaign in Settings → Ozonetel Integration.')
      return
    }
    try {
      await makeCall({ phoneNumber, agentId, campaignName }).unwrap()
      messageApi.success('Call initiated. You will be connected shortly.')
      handleCloseCallModal()
    } catch (error) {
      messageApi.error(error?.data?.message || 'Call failed')
    }
  }

  const handleSubmit = async (values) => {
    try {
      const leadData = {
        first_name: values.first_name?.trim() || '',
        last_name: values.last_name?.trim() || '',
        email: values.email?.trim() || '',
        phone: values.phone.trim(),
        whatsapp: values.whatsapp?.trim() || values.phone.trim(),
        subject: values.subject?.trim() || '',
        message: values.message?.trim() || '',
        source: values.source,
        status: values.status || 'New',
        branch: values.branch || null,
        appointment_date: values.appointment_date ? values.appointment_date.format('YYYY-MM-DD') : null,
        slot_time: values.slot_time || '',
        spa_package: values.spa_package || '',
        assignedTo: values.assignedTo || null,
        notes: values.notes?.trim() || '',
      }

      if (selectedLead) {
        await updateLead({ id: selectedLead._id, ...leadData }).unwrap()
        messageApi.success('Lead updated successfully')
      } else {
        await createLead(leadData).unwrap()
        messageApi.success('Lead created successfully')
      }

      setIsModalVisible(false)
      form.resetFields()
      refetchLeads()
    } catch (error) {
      messageApi.error(error?.data?.message || 'Failed to save lead')
    }
  }

  const handleApplyFilters = () => {
    setCurrentPage(1) // Reset to first page when filters change
    refetchLeads()
  }

  const handleClearFilters = () => {
    setSearchText('')
    setFilterSource(null)
    setFilterStatus(null)
    setFilterBranch(null)
    setCurrentPage(1)
  }

  const timelineData = selectedLead
    ? [
      {
        color: 'blue',
        children: `Lead created - ${selectedLead.createdAt || 'N/A'}`,
      },
      selectedLead.appointment_date && {
        color: 'gold',
        children: `Appointment scheduled - ${dayjs(selectedLead.appointment_date).format('MMMM DD, YYYY')}${selectedLead.slot_time ? ` at ${selectedLead.slot_time}` : ''}${selectedLead.spa_package ? ` (${selectedLead.spa_package})` : ''}`,
      },
      selectedLead.assignedTo && selectedLead.assignedTo !== 'Unassigned' && {
        color: 'orange',
        children: `Assigned to ${selectedLead.assignedTo}`,
      },
      {
        color: 'green',
        children: `Last interaction - ${selectedLead.lastInteraction || 'N/A'}`,
      },
      selectedLead.notes && {
        color: 'purple',
        children: `Notes: ${selectedLead.notes}`,
      },
      selectedLead.source === 'Website' && selectedLead.websiteUrl && {
        color: 'cyan',
        children: `Source: ${selectedLead.websiteUrl}`,
      },
    ].filter(Boolean)
    : []

  // CSV Parser function - handles quoted fields with commas
  const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row')
    }

    // Parse CSV line handling quoted fields
    const parseCSVLine = (line) => {
      const result = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++ // Skip next quote
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    // Parse header
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))

    // Allowed headers only (case-insensitive mapping)
    const headerMap = {
      'name': 'name',
      'email': 'email',
      'phone': 'phone',
      'whatsapp': 'whatsapp',
      'subject': 'subject',
      'message': 'message',
    }

    // Check for disallowed headers
    const disallowedHeaders = headers.filter(header => {
      const normalized = header.toLowerCase().trim()
      return !headerMap[normalized]
    })

    if (disallowedHeaders.length > 0) {
      throw new Error(`Disallowed columns found: ${disallowedHeaders.join(', ')}. Only these columns are allowed: ${Object.keys(headerMap).join(', ')}`)
    }

    // Find column indices
    const columnIndices = {}
    headers.forEach((header, index) => {
      const normalizedHeader = header.toLowerCase().trim()
      if (headerMap[normalizedHeader]) {
        columnIndices[headerMap[normalizedHeader]] = index
      }
    })

    // Parse data rows
    const leads = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''))
      const lead = {}

      Object.keys(columnIndices).forEach(key => {
        const index = columnIndices[key]
        if (index !== undefined && values[index] && values[index].trim()) {
          lead[key] = values[index].trim()
        }
      })

      // Add all fields (validation will happen on backend)
      leads.push(lead)
    }

    return leads
  }

  const handleDownloadSample = async () => {
    try {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
      const baseUrl = isLocalhost
        ? 'http://localhost:3001/api'
        : 'https://espa-international.onrender.com/api'

      const response = await fetch(`${baseUrl}/leads/import/sample`, {
        method: 'GET',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to download sample')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'leads_import_sample.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      messageApi.success('Sample CSV file downloaded')
    } catch (error) {
      console.error('Download sample error:', error)
      messageApi.error('Failed to download sample file')
    }
  }

  const handleImport = () => {
    setIsImportModalVisible(true)
  }

  const handleFileImport = async (file) => {
    try {
      const text = await file.text()
      const leads = parseCSV(text)

      if (leads.length === 0) {
        messageApi.error('No valid leads found in the file. Please check the format.')
        return
      }

      // Import leads
      const result = await importLeads(leads).unwrap()

      // Show summary
      const summary = `Import completed: ${result.results.success} successful, ${result.results.failed} failed, ${result.results.duplicates} duplicates`

      if (result.results.errors.length > 0) {
        // Show errors in a detailed message
        const errorDetails = result.results.errors
          .slice(0, 10) // Show first 10 errors
          .map(err => `Row ${err.row}: ${err.error}`)
          .join('\n')

        messageApi.warning({
          content: (
            <div>
              <p>{summary}</p>
              {result.results.errors.length > 10 && (
                <p style={{ fontSize: '12px', color: '#888' }}>
                  Showing first 10 errors. Total errors: {result.results.errors.length}
                </p>
              )}
              <pre style={{
                background: '#2a2a2a',
                padding: 8,
                borderRadius: 4,
                fontSize: '11px',
                maxHeight: '200px',
                overflow: 'auto',
                marginTop: 8
              }}>
                {errorDetails}
              </pre>
            </div>
          ),
          duration: 10,
        })
      } else {
        messageApi.success(summary)
      }

      setIsImportModalVisible(false)
      refetchLeads()
    } catch (error) {
      console.error('Import error:', error)
      if (error?.data?.message) {
        messageApi.error(error.data.message)
      } else if (error.message) {
        messageApi.error(error.message)
      } else {
        messageApi.error('Failed to import leads. Please check the file format.')
      }
    }
  }

  const handleExport = async () => {
    try {
      // Build query params
      const params = new URLSearchParams()
      if (filterStatus) params.append('status', filterStatus)
      if (filterSource) params.append('source', filterSource)
      if (filterBranch) params.append('branch', filterBranch)
      if (searchText) params.append('search', searchText)

      const queryString = params.toString()

      // Use the same base URL logic as apiSlice
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
      const baseUrl = isLocalhost
        ? 'http://localhost:3001/api'
        : 'https://e-spa.askeva.net/api'

      const response = await fetch(`${baseUrl}/leads/export${queryString ? `?${queryString}` : ''}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Export failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      messageApi.success('Leads exported successfully')
    } catch (error) {
      console.error('Export error:', error)
      messageApi.error(error.message || 'Failed to export leads')
    }
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
              placeholder="Search by name, email or phone"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleApplyFilters}
              style={{ width: isMobile ? '100%' : 250, flex: isMobile ? 'none' : '1 1 auto' }}
            />
            <Select
              placeholder="Filter by Source"
              style={{ width: isMobile ? '100%' : 150 }}
              allowClear
              value={filterSource}
              onChange={setFilterSource}
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
              placeholder="Filter by Status"
              style={{ width: isMobile ? '100%' : 150 }}
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
            >
              <Option value="New">New</Option>
              <Option value="In Progress">In Progress</Option>
              <Option value="Follow-Up">Follow-Up</Option>
              <Option value="Converted">Converted</Option>
              <Option value="Lost">Lost</Option>
            </Select>
            <Select
              placeholder="Filter by Branch"
              style={{ width: isMobile ? '100%' : 150 }}
              allowClear
              value={filterBranch}
              onChange={setFilterBranch}
            >
              {branches.map((branch) => (
                <Option key={branch._id || branch.id} value={branch._id || branch.id}>
                  {branch.name}
                </Option>
              ))}
            </Select>
            <Button type="primary" onClick={handleApplyFilters} style={{ width: isMobile ? '100%' : 'auto' }}>
              Apply Filter
            </Button>
            <Button onClick={handleClearFilters} style={{ width: isMobile ? '100%' : 'auto' }}>
              Clear
            </Button>
          </div>
        </Card>
      )}

      <div className="table-responsive-wrapper">
        {leadsLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <p style={{ color: '#fff', marginTop: 16 }}>Loading leads...</p>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={transformedLeads}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: pagination.total,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} leads`,
              onChange: (page, size) => {
                setCurrentPage(page)
                setPageSize(size)
              },
            }}
            style={{ background: '#1a1a1a' }}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
          />
        )}
      </div>

      <Modal
        title={selectedLead ? 'Edit Lead' : 'Add New Lead'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
          setSelectedLead(null)
        }}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            source: 'Add',
            status: 'New',
          }}
        >
          <Form.Item
            name="first_name"
            label="First Name"
            rules={[{ required: true, message: 'Please enter first name' }]}
          >
            <Input placeholder="Enter first name" />
          </Form.Item>

          <Form.Item
            name="last_name"
            label="Last Name"
            rules={[{ required: true, message: 'Please enter last name' }]}
          >
            <Input placeholder="Enter last name (optional)" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="Enter email" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="Mobile"
            rules={[{ required: true, message: 'Please enter mobile number' }]}
          >
            <Input placeholder="Enter mobile number" />
          </Form.Item>

          <Form.Item name="whatsapp" label="WhatsApp Number">
            <Input placeholder="Enter WhatsApp number (optional)" />
          </Form.Item>

          <Form.Item name="subject" label="Subject">
            <Input placeholder="Enter subject (optional)" />
          </Form.Item>

          <Form.Item name="message" label="Message">
            <Input.TextArea rows={3} placeholder="Enter message (optional)" />
          </Form.Item>

          <Form.Item
            name="branch"
            label="Branch"
            rules={[{ required: true, message: 'Please select branch' }]}
          >
            <Select placeholder="Select branch (optional)" allowClear>
              {branches.map((branch) => (
                <Option key={branch._id || branch.id} value={branch._id || branch.id}>
                  {branch.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="appointment_date"
            label="Appointment Date"
            rules={[
              { required: true, message: 'Please select appointment date' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve()

                  const nowPlus24 = dayjs().add(24, 'hour')
                  if (value.isBefore(nowPlus24, 'day')) {
                    return Promise.reject(
                      new Error('Appointment must be booked at least 24 hours in advance')
                    )
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              disabledDate={(current) =>
                current && current < dayjs().startOf('day')
              }
            />
          </Form.Item>

          <Form.Item
            name="slot_time"
            label="Slot Time"
            rules={[{ required: true, message: 'Please select slot time' }]}
          >
            <Select placeholder="Select slot time">
              {SLOT_TIMES.map((time) => (
                <Option key={time} value={time}>
                  {time}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="spa_package"
            label="Spa Package"
            rules={[{ required: true, message: 'Please select spa package' }]}
          >
            <Select placeholder="Select spa package">
              {SPA_PACKAGES.map((pkg) => (
                <Option key={pkg} value={pkg}>
                  {pkg}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="source"
            label="Lead Source"
            rules={[{ required: true, message: 'Please select source' }]}
          >
            <Select placeholder="Select source">
              <Option value="Add">Add</Option>
              <Option value="Call">Call</Option>
              <Option value="WhatsApp">WhatsApp</Option>
              <Option value="Facebook">Facebook</Option>
              <Option value="Insta">Insta</Option>
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
            <Select placeholder="Select agent (optional)" allowClear>
              {users.map((user) => (
                <Option key={user._id || user.id} value={user._id || user.id}>
                  {user.name} ({user.email})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={4} placeholder="Enter notes (optional)" />
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
                loading={createLoading || updateLoading}
                style={{ width: isMobile ? '100%' : 'auto' }}
              >
                {selectedLead ? 'Update' : 'Create'}
              </Button>
              <Button
                onClick={() => {
                  setIsModalVisible(false)
                  form.resetFields()
                  setSelectedLead(null)
                }}
                style={{ width: isMobile ? '100%' : 'auto' }}
              >
                Cancel
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Lead Details"
        open={isTimelineVisible}
        onCancel={() => {
          setIsTimelineVisible(false)
          setSelectedLead(null)
        }}
        footer={null}
        width={isMobile ? '95%' : 700}
        style={{ top: 20 }}
        bodyStyle={{
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
          padding: '16px',
        }}
      >
        {selectedLead && (
          <div>
            <Card
              title="Personal Information"
              style={{ marginBottom: 16, background: '#1a1a1a', borderColor: '#303030' }}
              headStyle={{ color: '#D4AF37', borderColor: '#303030' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>First Name:</strong> {selectedLead.first_name || selectedLead.name?.split(' ')[0] || 'N/A'}
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Last Name:</strong> {selectedLead.last_name || selectedLead.name?.split(' ').slice(1).join(' ') || 'N/A'}
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Full Name:</strong> {selectedLead.name || `${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim() || 'N/A'}
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Email:</strong> {selectedLead.email || 'N/A'}
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Mobile:</strong> {selectedLead.mobile || 'N/A'}
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>WhatsApp:</strong> {selectedLead.whatsapp || 'N/A'}
                  </p>
                </div>
                <div>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Source:</strong> <Tag color="purple">{selectedLead.source || 'N/A'}</Tag>
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Status:</strong> <Tag color={
                      selectedLead.status === 'New' ? 'blue' :
                        selectedLead.status === 'In Progress' ? 'orange' :
                          selectedLead.status === 'Follow-Up' ? 'purple' :
                            selectedLead.status === 'Converted' ? 'green' :
                              selectedLead.status === 'Lost' ? 'red' : 'default'
                    }>{selectedLead.status || 'N/A'}</Tag>
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Branch:</strong> {selectedLead.branch || 'Unassigned'}
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Assigned To:</strong> {selectedLead.assignedTo || 'Unassigned'}
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Created At:</strong> {selectedLead.createdAt || 'N/A'}
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Last Interaction:</strong> {selectedLead.lastInteraction || 'N/A'}
                  </p>
                </div>
              </div>
            </Card>

            <Card
              title="Appointment Details"
              style={{ marginBottom: 16, background: '#1a1a1a', borderColor: '#303030' }}
              headStyle={{ color: '#D4AF37', borderColor: '#303030' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Appointment Date:</strong> {
                      selectedLead.appointment_date
                        ? dayjs(selectedLead.appointment_date).format('MMMM DD, YYYY')
                        : 'Not scheduled'
                    }
                  </p>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Slot Time:</strong> {selectedLead.slot_time || 'Not specified'}
                  </p>
                </div>
                <div>
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Spa Package:</strong> {selectedLead.spa_package || 'Not specified'}
                  </p>
                </div>
              </div>
            </Card>

            {(selectedLead.subject || selectedLead.message || selectedLead.notes) && (
              <Card
                title="Additional Information"
                style={{ marginBottom: 16, background: '#1a1a1a', borderColor: '#303030' }}
                headStyle={{ color: '#D4AF37', borderColor: '#303030' }}
              >
                {selectedLead.subject && (
                  <p style={{ margin: '8px 0', color: '#fff' }}>
                    <strong style={{ color: '#D4AF37' }}>Subject:</strong> {selectedLead.subject}
                  </p>
                )}
                {selectedLead.message && (
                  <div style={{ margin: '8px 0' }}>
                    <strong style={{ color: '#D4AF37' }}>Message:</strong>
                    <p style={{ color: '#fff', marginTop: 4, padding: 8, background: '#2a2a2a', borderRadius: 4 }}>
                      {selectedLead.message}
                    </p>
                  </div>
                )}
                {selectedLead.notes && (
                  <div style={{ margin: '8px 0' }}>
                    <strong style={{ color: '#D4AF37' }}>Notes:</strong>
                    <p style={{ color: '#fff', marginTop: 4, padding: 8, background: '#2a2a2a', borderRadius: 4 }}>
                      {selectedLead.notes}
                    </p>
                  </div>
                )}
              </Card>
            )}

            {timelineData && timelineData.length > 0 && (
              <Card
                title="Timeline"
                style={{ background: '#1a1a1a', borderColor: '#303030' }}
                headStyle={{ color: '#D4AF37', borderColor: '#303030' }}
              >
                <Timeline items={timelineData} />
              </Card>
            )}
          </div>
        )}
      </Modal>

      <Modal
        title="Make Call"
        open={isCallModalVisible}
        onCancel={handleCloseCallModal}
        footer={[
          <Button key="cancel" onClick={handleCloseCallModal}>
            Cancel
          </Button>,
          <Button
            key="call"
            type="primary"
            icon={<PhoneOutlined />}
            loading={callLoading}
            onClick={handleConfirmCall}
          >
            Call
          </Button>,
        ]}
        width={isMobile ? '95%' : 440}
      >
        {callLeadRecord && (
          <div>
            <p style={{ marginBottom: 8 }}>
              <strong>Lead:</strong> {callLeadRecord.name}
            </p>
            <p style={{ marginBottom: 16 }}>
              <strong>Phone:</strong> {callLeadRecord.mobile || callLeadRecord.phone}
            </p>
            <Form.Item label="Campaign" style={{ marginBottom: 0 }}>
              <Select
                placeholder="Select campaign"
                value={callCampaign || undefined}
                onChange={setCallCampaign}
                style={{ width: '100%' }}
                options={[
                  ...(defaultCampaign && !campaignIds.includes(defaultCampaign)
                    ? [{ value: defaultCampaign, label: `${defaultCampaign} (default)` }]
                    : []),
                  ...campaignIds.map((id) => ({ value: id, label: id })),
                ].filter((opt, i, arr) => arr.findIndex((o) => o.value === opt.value) === i)}
              />
            </Form.Item>
            {campaignIds.length === 0 && !defaultCampaign && (
              <p style={{ color: '#faad14', fontSize: 12, marginTop: 8 }}>
                Add Campaign / Agent IDs in Settings → API & Integrations → Ozonetel Integration.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        title="Import Leads from CSV"
        open={isImportModalVisible}
        onCancel={() => setIsImportModalVisible(false)}
        footer={null}
        width={isMobile ? '95%' : 700}
        style={{ color: '#000000' }}
      >
        <Alert
          message="CSV Format Requirements"
          description={
            <div>
              <p style={{ color: '#000000' }}><strong >Mandatory Fields:</strong> Name, Phone</p>
              <p style={{ color: '#000000' }}><strong >Optional Fields:</strong> Email, WhatsApp, Subject, Message</p>
              <p><strong style={{ color: '#ff4d4f' }}>Important:</strong> Only the above fields are allowed. Any other columns will be rejected.</p>
              <p style={{ marginTop: 8, fontSize: '12px', color: '#888' }}>
                • Duplicate email/phone entries (in file or database) will be rejected<br />
                • Source will be set to "Import" automatically<br />
                • Status will be set to "New" automatically<br />
                • Branch, Assigned To, Notes, and Status cannot be imported via CSV
              </p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16, color: '#000000' }}
        />
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadSample}
            block
            type="default"
          >
            Download Sample CSV File
          </Button>
          <Upload
            accept=".csv"
            beforeUpload={(file) => {
              handleFileImport(file)
              return false // Prevent auto upload
            }}
            showUploadList={false}
          >
            <Button icon={<UploadOutlined />} loading={importLoading} block type="primary">
              Select CSV File to Import
            </Button>
          </Upload>
        </Space>
        <div style={{ marginTop: 16, fontSize: '12px', color: '#888' }}>
          <p><strong>Allowed CSV Headers (case-insensitive):</strong></p>
          <p style={{ fontSize: '11px', fontFamily: 'monospace', background: '#2a2a2a', padding: 8, borderRadius: 4 }}>
            Name, Phone, Email, WhatsApp, Subject, Message
          </p>
        </div>
      </Modal>
    </div>
  )
}

export default Leads
