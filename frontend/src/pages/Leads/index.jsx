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
import { useNavigate } from 'react-router-dom'
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
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Option } = Select

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
      name: lead.name,
      mobile: lead.phone,
      whatsapp: lead.whatsapp || lead.phone,
      email: lead.email,
      subject: lead.subject,
      message: lead.message,
      source: lead.source,
      status: lead.status,
      branch: lead.branch?.name || lead.branch || 'Unassigned',
      branchId: lead.branch?._id || lead.branch?.id || null,
      assignedTo: lead.assignedTo?.name || lead.assignedTo || 'Unassigned',
      assignedToId: lead.assignedTo?._id || lead.assignedTo?.id || null,
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
      render: (assignedTo) => assignedTo || 'Unassigned',
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
      name: record.name,
      email: record.email,
      phone: record.mobile,
      whatsapp: record.whatsapp,
      subject: record.subject,
      message: record.message,
      source: record.source,
      status: record.status,
      branch: record.branchId,
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

  const handleSubmit = async (values) => {
    try {
      const leadData = {
        name: values.name.trim(),
        email: values.email?.trim() || '',
        phone: values.phone.trim(),
        whatsapp: values.whatsapp?.trim() || values.phone.trim(),
        subject: values.subject?.trim() || '',
        message: values.message?.trim() || '',
        source: values.source,
        status: values.status || 'New',
        branch: values.branch || null,
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
        {
          color: 'green',
          children: `Last interaction - ${selectedLead.lastInteraction || 'N/A'}`,
        },
        selectedLead.assignedTo && selectedLead.assignedTo !== 'Unassigned' && {
          color: 'orange',
          children: `Assigned to ${selectedLead.assignedTo}`,
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
        : 'https://espa-international.onrender.com/api'

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
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input placeholder="Enter name" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: 'email', message: 'Please enter a valid email' }]}
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
        width={isMobile ? '95%' : 600}
      >
        {selectedLead && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <p><strong>Name:</strong> {selectedLead.name}</p>
              <p><strong>Email:</strong> {selectedLead.email || 'N/A'}</p>
              <p><strong>Mobile:</strong> {selectedLead.mobile}</p>
              <p><strong>WhatsApp:</strong> {selectedLead.whatsapp || 'N/A'}</p>
              <p><strong>Source:</strong> <Tag color="purple">{selectedLead.source}</Tag></p>
              <p><strong>Status:</strong> <Tag>{selectedLead.status}</Tag></p>
              <p><strong>Branch:</strong> {selectedLead.branch}</p>
              <p><strong>Assigned To:</strong> {selectedLead.assignedTo}</p>
              {selectedLead.subject && <p><strong>Subject:</strong> {selectedLead.subject}</p>}
              {selectedLead.message && <p><strong>Message:</strong> {selectedLead.message}</p>}
              {selectedLead.notes && <p><strong>Notes:</strong> {selectedLead.notes}</p>}
            </div>
            <Timeline items={timelineData} />
          </div>
        )}
      </Modal>

      <Modal
        title="Import Leads from CSV"
        open={isImportModalVisible}
        onCancel={() => setIsImportModalVisible(false)}
        footer={null}
        width={isMobile ? '95%' : 700}
      >
        <Alert
          message="CSV Format Requirements"
          description={
            <div>
              <p><strong>Mandatory Fields:</strong> Name, Phone</p>
              <p><strong>Optional Fields:</strong> Email, WhatsApp, Subject, Message</p>
              <p><strong style={{ color: '#ff4d4f' }}>Important:</strong> Only the above fields are allowed. Any other columns will be rejected.</p>
              <p style={{ marginTop: 8, fontSize: '12px', color: '#888' }}>
                • Duplicate email/phone entries (in file or database) will be rejected<br/>
                • Source will be set to "Import" automatically<br/>
                • Status will be set to "New" automatically<br/>
                • Branch, Assigned To, Notes, and Status cannot be imported via CSV
              </p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
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
