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
  Spin,
  App,
  Upload,
  Alert,
  Empty,
  Dropdown,
  Row,
  Col,
  Segmented,
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
  SyncOutlined,
  UpOutlined,
  DownOutlined,
  UploadOutlined,
  DownloadOutlined,
  BellOutlined,
  HistoryOutlined,
  CloseOutlined,
  CheckOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { canCreate, canEdit, canDelete } from '../../utils/permissions'
import './LeadsPage.css'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetLeadsQuery,
  useGetLeadQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useLazyExportLeadsQuery,
  useImportLeadsMutation,
  useSyncAskEvaLeadsMutation,
  useAddReminderMutation,
  useUpdateReminderMutation,
  useDeleteReminderMutation,
} from '../../store/api/leadApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import { useConvertLeadToCustomerMutation } from '../../store/api/customerApi'
import { useGetUsersQuery } from '../../store/api/userApi'
import { useGetCampaignsQuery, useMakeCallMutation } from '../../store/api/cloudAgentApi'
import { useGetMeQuery } from '../../store/api/authApi'
import { getApiBaseUrl } from '../../utils/apiConfig'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import MotionButton from '../../components/MotionButton'
import { SPA_PACKAGES, slotTimesWithCurrent } from '../../constants/appointments'

const { RangePicker } = DatePicker
const { Option } = Select

const Leads = () => {
  const { message: messageApi } = App.useApp()
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const watchedSpaPackage = Form.useWatch('spa_package', form)
  const watchedSlotTime = Form.useWatch('slot_time', form)
  const leadFormSlotOptions = useMemo(() => {
    if (!watchedSpaPackage || !String(watchedSpaPackage).trim()) return []
    return slotTimesWithCurrent(watchedSpaPackage, watchedSlotTime)
  }, [watchedSpaPackage, watchedSlotTime])
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isTimelineVisible, setIsTimelineVisible] = useState(false)
  const [isImportModalVisible, setIsImportModalVisible] = useState(false)
  const [isCallModalVisible, setIsCallModalVisible] = useState(false)
  const [callLeadRecord, setCallLeadRecord] = useState(null)
  const [callCampaign, setCallCampaign] = useState('')
  const [selectedLead, setSelectedLead] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [isFollowUpVisible, setIsFollowUpVisible] = useState(false)
  const [followUpLead, setFollowUpLead] = useState(null)
  const [callLeadMeta, setCallLeadMeta] = useState(null)
  const [followUpTab, setFollowUpTab] = useState('reminders')
  const [reminderDesc, setReminderDesc] = useState('')
  const [reminderDate, setReminderDate] = useState(null)
  const [reminderAssignee, setReminderAssignee] = useState('')

  // Filter states
  const [searchText, setSearchText] = useState('')
  const [filterSource, setFilterSource] = useState(null)
  const [filterStatus, setFilterStatus] = useState(null)
  const [filterBranches, setFilterBranches] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  /** 'all' = every lead; 'remainder' = leads that have at least one reminder */
  const [leadsListTab, setLeadsListTab] = useState('all')

  const navigate = useNavigate()
  const location = useLocation()

  // Open Add Lead modal with phone prefilled when coming from Calls "Create Lead"
  useEffect(() => {
    const state = location.state
    if (state?.createLeadFromCall && state?.phone) {
      const meta = state?.callMeta || {}
      form.setFieldsValue({
        phone: state.phone,
        source: 'IVR',
        status: 'New',
      })
      setCallLeadMeta({
        callLogId: state.callLogId || '',
        ivrCallRecordingUrl: meta.recordingUrl || '',
        ivrCallType: meta.callType || '',
        ivrCallStatus: meta.callStatus || '',
        ivrAgentName: meta.agentName || '',
        ivrCallStartedAt: meta.callStartedAt || '',
      })
      setSelectedLead(null)
      setIsModalVisible(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [form, location.state, location.pathname, navigate])

  // API hooks
  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useGetLeadsQuery({
    search: searchText || undefined,
    source: filterSource || undefined,
    status: filterStatus || undefined,
    branch: filterBranches.length ? filterBranches : undefined,
    page: currentPage,
    limit: pageSize,
    hasReminders: leadsListTab === 'remainder' ? true : undefined,
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
  const [triggerExport, { isLoading: exporting }] = useLazyExportLeadsQuery()
  const [importLeads, { isLoading: importLoading }] = useImportLeadsMutation()
  const [syncAskEvaLeads, { isLoading: syncAskEvaLoading }] = useSyncAskEvaLeadsMutation()
  const [addReminder, { isLoading: addReminderLoading }] = useAddReminderMutation()
  const [updateReminderApi] = useUpdateReminderMutation()
  const [deleteReminderApi] = useDeleteReminderMutation()
  const [convertLeadToCustomer, { isLoading: convertingToCustomer }] = useConvertLeadToCustomerMutation()

  const followUpLeadId = followUpLead?._id || followUpLead?.key
  const { data: leadDetailData, refetch: refetchLeadDetail } = useGetLeadQuery(followUpLeadId, {
    skip: !followUpLeadId || !isFollowUpVisible,
  })
  const leadDetail = leadDetailData?.lead

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
      reminders: lead.reminders || [],
      pendingReminderCount: (lead.reminders || []).filter((r) => r.status === 'Pending').length,
      ivrCallRecordingUrl: lead.ivrCallRecordingUrl || '',
      ivrCallType: lead.ivrCallType || '',
      ivrCallStatus: lead.ivrCallStatus || '',
      ivrAgentName: lead.ivrAgentName || '',
      ivrCallStartedAt: lead.ivrCallStartedAt || '',
    }))
  }, [leads])

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Mobile',
      dataIndex: 'mobile',
      key: 'mobile',
      width: 118,
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
          Website: 'purple',
          Call: 'gold',
          IVR: 'purple',
          WhatsApp: 'green',
          Facebook: 'blue',
          Insta: 'pink',
          'Walk-in': 'geekblue',
          Referral: 'magenta',
          Add: 'orange',
          Import: 'cyan',
          Other: 'default',
        }
        return <Tag color={colors[source] || 'default'}>{source}</Tag>
      },
      filters: [
        { text: 'Website', value: 'Website' },
        { text: 'Call', value: 'Call' },
        { text: 'IVR', value: 'IVR' },
        { text: 'WhatsApp', value: 'WhatsApp' },
        { text: 'Facebook', value: 'Facebook' },
        { text: 'Insta', value: 'Insta' },
        { text: 'Walk-in', value: 'Walk-in' },
        { text: 'Referral', value: 'Referral' },
        { text: 'Add', value: 'Add' },
        { text: 'Import', value: 'Import' },
        { text: 'Other', value: 'Other' },
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
      title: 'Assigned',
      dataIndex: 'assignedTo',
      key: 'assignedTo',
      ellipsis: true,
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
      title: 'Action',
      key: 'actions',
      fixed: 'right',
      width: 50,
      align: 'center',
      render: (_, record) => {
        const items = []
        // if (canCreate('calls') && record.mobile) {
        //   items.push({ key: 'call', label: 'Call', icon: <PhoneOutlined /> })
        // }
        items.push({ key: 'view', label: 'View details', icon: <EyeOutlined /> })
        if (canEdit('leads')) {
          items.push({ key: 'edit', label: 'Edit lead', icon: <EditOutlined /> })
        }
        if (canDelete('leads')) {
          items.push({ type: 'divider' })
          items.push({
            key: 'delete',
            label: 'Delete',
            icon: <DeleteOutlined />,
            danger: true,
          })
        }
        return (
          <Dropdown
            menu={{
              items,
              style: { maxHeight: 280, overflowY: 'auto' },
              onClick: ({ key, domEvent }) => {
                domEvent?.stopPropagation()
                if (key === 'call') openCallModal(record)
                else if (key === 'view') {
                  setSelectedLead(record)
                  setIsTimelineVisible(true)
                } else if (key === 'edit') handleEdit(record)
                else if (key === 'delete') {
                  Modal.confirm({
                    title: 'Delete this lead?',
                    content: 'This action cannot be undone.',
                    okText: 'Delete',
                    okType: 'danger',
                    cancelText: 'Cancel',
                    onOk: () => handleDelete(record._id),
                  })
                }
              },
            }}
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="leads-actions-dropdown"
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined className="leads-table-action-icon" style={{ fontSize: 18 }} />}
              onClick={(e) => e.stopPropagation()}
              aria-label="Lead actions"
            />
          </Dropdown>
        )
      },
    },
  ]

  const reminderSummaryColumn = {
    title: 'Reminders',
    key: 'reminderSummary',
    width: isMobile ? 88 : 132,
    render: (_, r) => {
      const list = r.reminders || []
      const pending = list.filter((x) => x.status === 'Pending').length
      const total = list.length
      if (isMobile) {
        return (
          <span className="leads-reminder-tag-wrap">
            <Tag color={pending > 0 ? 'gold' : 'default'} style={{ margin: 0 }}>
              {pending}/{total}
            </Tag>
          </span>
        )
      }
      return (
        <div className="leads-reminder-stats">
          <div className={pending > 0 ? 'leads-reminder-pending' : 'leads-reminder-pending-muted'}>{pending} pending</div>
          <div className="leads-reminder-total">{total} total</div>
        </div>
      )
    },
  }

  const tableColumns = (() => {
    let cols = isMobile
      ? columns.filter((c) => ['name', 'mobile', 'status', 'actions'].includes(c.key))
      : columns
    if (leadsListTab === 'remainder') {
      const actionIdx = cols.findIndex((c) => c.key === 'actions')
      if (actionIdx >= 0) {
        cols = [...cols.slice(0, actionIdx), reminderSummaryColumn, ...cols.slice(actionIdx)]
      } else {
        cols = [...cols, reminderSummaryColumn]
      }
    }
    return cols
  })()

  const handleAdd = () => {
    setSelectedLead(null)
    setCallLeadMeta(null)
    form.resetFields()
    form.setFieldsValue({
      source: 'Add',
      status: 'New',
    })
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedLead(record)
    setCallLeadMeta(null)
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
        source: callLeadMeta ? 'IVR' : values.source,
        status: values.status || 'New',
        branch: values.branch || null,
        appointment_date: values.appointment_date ? values.appointment_date.format('YYYY-MM-DD') : null,
        slot_time: values.slot_time || '',
        spa_package: values.spa_package || '',
        assignedTo: values.assignedTo || null,
        notes: values.notes?.trim() || '',
        ...(callLeadMeta || {}),
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
    setFilterBranches([])
    setCurrentPage(1)
  }

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
      // Use the same API URL logic as apiSlice
      const baseUrl = getApiBaseUrl()

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

  const handleSyncAskEva = async () => {
    try {
      const result = await syncAskEvaLeads().unwrap()
      messageApi.success(
        `AskEva sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`
      )
      refetchLeads()
    } catch (error) {
      console.error('AskEva sync error:', error)
      messageApi.error(error?.data?.message || error?.message || 'Failed to sync AskEva leads')
    }
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
                <p className="leads-import-note">
                  Showing first 10 errors. Total errors: {result.results.errors.length}
                </p>
              )}
              <pre className="leads-import-error-pre">
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
      const result = await triggerExport({
        status: filterStatus || undefined,
        source: filterSource || undefined,
        branch: filterBranches.length ? filterBranches : undefined,
        search: searchText?.trim() || undefined,
      }).unwrap()
      const rows = result?.leads || []
      if (rows.length === 0) {
        messageApi.info('No leads to export with current filters.')
        return
      }
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Leads')
      const fileName = `leads_${dayjs().format('YYYY-MM-DD')}.xlsx`
      XLSX.writeFile(wb, fileName)
      messageApi.success(`Exported ${rows.length} lead(s) to ${fileName}`)
    } catch (error) {
      console.error('Export error:', error)
      messageApi.error(error?.data?.message || error?.message || 'Failed to export leads')
    }
  }

  return (
    <PageLayout className="leads-management-page">
      <PageHeader
        title="Lead Management"
        subtitle="View, filter, and manage leads. Row click opens follow-up."
        extra={
          <Space wrap>
            <Button icon={<SyncOutlined />} onClick={handleSyncAskEva} loading={syncAskEvaLoading} size={isMobile ? 'small' : 'middle'}>
              {isMobile ? 'Sync AskEva' : 'Sync AskEva'}
            </Button>
            <Button icon={<ImportOutlined />} onClick={handleImport} size={isMobile ? 'small' : 'middle'}>
              {isMobile ? 'Import' : 'Import'}
            </Button>
            <Button icon={<ExportOutlined />} onClick={handleExport} loading={exporting} size={isMobile ? 'small' : 'middle'}>
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
              <MotionButton type="primary" icon={<PlusOutlined />} onClick={handleAdd} size={isMobile ? 'small' : 'middle'}>
                {isMobile ? 'Add' : 'Add Lead'}
              </MotionButton>
            )}
          </Space>
        }
      />

      {showFilters && (
        <ContentCard staggerIndex={0} compact className="leads-filters-card">
          <div className="leads-filters-row ds-filters-row--responsive">
            <Input
              className="ds-filter-grow"
              placeholder="Search by name, email or phone"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleApplyFilters}
            />
            <Select className="ds-filter-fixed" placeholder="Filter by Source" allowClear value={filterSource} onChange={setFilterSource}>
              <Option value="Website">Website</Option>
              <Option value="Call">Call</Option>
              <Option value="IVR">IVR</Option>
              <Option value="WhatsApp">WhatsApp</Option>
              <Option value="Facebook">Facebook</Option>
              <Option value="Insta">Insta</Option>
              <Option value="Walk-in">Walk-in</Option>
              <Option value="Referral">Referral</Option>
              <Option value="Add">Add</Option>
              <Option value="Import">Import</Option>
              <Option value="Other">Other</Option>
            </Select>
            <Select className="ds-filter-fixed" placeholder="Filter by Status" allowClear value={filterStatus} onChange={setFilterStatus}>
              <Option value="New">New</Option>
              <Option value="In Progress">In Progress</Option>
              <Option value="Follow-Up">Follow-Up</Option>
              <Option value="Converted">Converted</Option>
              <Option value="Lost">Lost</Option>
            </Select>
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
              {branches.map((branch) => (
                <Option key={branch._id || branch.id} value={branch._id || branch.id}>
                  {branch.name}
                </Option>
              ))}
            </Select>
            <Button type="primary" onClick={handleApplyFilters}>
              Apply Filter
            </Button>
            <Button onClick={handleClearFilters}>Clear</Button>
          </div>
        </ContentCard>
      )}

      <ContentCard
        staggerIndex={showFilters ? 1 : 0}
        className="leads-table-card ds-table-shell"
        innerClassName="ds-leads-table-inner"
        hoverLift={false}
      >
        <div className="leads-segmented-wrap">
          <Segmented
            block={isMobile}
            value={leadsListTab}
            onChange={(key) => {
              setLeadsListTab(key)
              setCurrentPage(1)
            }}
            options={[
              { label: 'All leads', value: 'all' },
              { label: 'Remainder leads', value: 'remainder' },
            ]}
            size={isMobile ? 'small' : 'middle'}
          />
        </div>
        <p className="leads-table-subtitle">
          {leadsListTab === 'all'
            ? 'Every lead in your CRM.'
            : 'Only leads with at least one reminder. Open a lead row → Follow-up → Reminders to add or manage.'}
        </p>
        <div className="table-responsive-wrapper leads-table-scroll">
          {leadsLoading ? (
            <div className="ds-loading-block">
              <Spin size="large" />
              <p className="leads-loading-text">Loading leads...</p>
            </div>
          ) : (
            <Table
              columns={tableColumns}
              dataSource={transformedLeads}
              pagination={{
                current: currentPage,
                pageSize: pageSize,
                total: pagination.total,
                showSizeChanger: true,
                showTotal: (total) =>
                  leadsListTab === 'remainder'
                    ? `Total ${total} leads with reminders`
                    : `Total ${total} leads`,
                onChange: (page, size) => {
                  setCurrentPage(page)
                  setPageSize(size)
                },
              }}
              scroll={{ x: 'max-content' }}
              size={isMobile ? 'small' : 'middle'}
              onRow={(record) => ({
                onClick: (e) => {
                  if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.ant-popconfirm')) return
                  setFollowUpLead(record)
                  setFollowUpTab('reminders')
                  setIsFollowUpVisible(true)
                },
                className: 'leads-table-row-clickable',
              })}
            />
          )}
        </div>
      </ContentCard>

      <Modal
        title={selectedLead ? 'Edit lead' : 'Add new lead'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
          setSelectedLead(null)
          setCallLeadMeta(null)
        }}
        footer={null}
        width={isMobile ? '100%' : 820}
        style={{ top: isMobile ? 0 : 24 }}
        styles={{
          body: {
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
            padding: isMobile ? '12px 16px' : '20px 24px',
          },
        }}
        className="leads-form-modal"
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
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="first_name"
                label="First name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="First name" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="last_name"
                label="Last name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="Last name" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Required' },
                  { type: 'email', message: 'Invalid email' },
                ]}
              >
                <Input placeholder="Email" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="phone"
                label="Mobile"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="Mobile number" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="whatsapp" label="WhatsApp">
                <Input placeholder="Optional" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="subject" label="Subject">
                <Input placeholder="Optional" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="message" label="Message">
                <Input.TextArea rows={2} placeholder="Optional" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="branch"
                label="Branch"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Select placeholder="Select branch" allowClear>
                  {branches.map((branch) => (
                    <Option key={branch._id || branch.id} value={branch._id || branch.id}>
                      {branch.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="appointment_date"
                label="Appointment date"
                rules={[
                  { required: true, message: 'Required' },
                ]}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  format="YYYY-MM-DD"
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="spa_package"
                label="Spa package"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Select
                  placeholder="Select package first"
                  onChange={() => form.setFieldsValue({ slot_time: undefined })}
                >
                  {SPA_PACKAGES.map((pkg) => (
                    <Option key={pkg} value={pkg}>
                      {pkg}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="slot_time"
                label="Slot time"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Select
                  placeholder={
                    watchedSpaPackage && String(watchedSpaPackage).trim()
                      ? 'Select time slot'
                      : 'Select spa package first'
                  }
                  disabled={!watchedSpaPackage || !String(watchedSpaPackage).trim()}
                >
                  {leadFormSlotOptions.map((time) => (
                    <Option key={time} value={time}>
                      {time}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="source"
                label="Lead source"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Select placeholder="Source">
                  <Option value="Website">Website</Option>
                  <Option value="Add">Add</Option>
                  <Option value="Call">Call</Option>
                  <Option value="IVR">IVR</Option>
                  <Option value="WhatsApp">WhatsApp</Option>
                  <Option value="Facebook">Facebook</Option>
                  <Option value="Insta">Insta</Option>
                  <Option value="Walk-in">Walk-in</Option>
                  <Option value="Referral">Referral</Option>
                  <Option value="Import">Import</Option>
                  <Option value="Other">Other</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="status" label="Stage">
                <Select placeholder="Stage">
                  <Option value="New">New</Option>
                  <Option value="In Progress">In Progress</Option>
                  <Option value="Follow-Up">Follow-Up</Option>
                  <Option value="Converted">Converted</Option>
                  <Option value="Lost">Lost</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="assignedTo" label="Assigned to">
                <Select placeholder="Agent (optional)" allowClear>
                  {users.map((user) => (
                    <Option key={user._id || user.id} value={user._id || user.id}>
                      {user.name} ({user.email})
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notes" label="Notes">
                <Input.TextArea rows={3} placeholder="Internal notes" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Space wrap style={{ width: '100%' }}>
              <Button type="primary" htmlType="submit" loading={createLoading || updateLoading} size="large">
                {selectedLead ? 'Save changes' : 'Create lead'}
              </Button>
              <Button
                size="large"
                onClick={() => {
                  setIsModalVisible(false)
                  form.resetFields()
                  setSelectedLead(null)
                  setCallLeadMeta(null)
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* View Modal - Lead Details (read-only) */}
      <Modal
        className="leads-view-modal"
        title="Lead Details"
        open={isTimelineVisible}
        onCancel={() => {
          setIsTimelineVisible(false)
          setSelectedLead(null)
        }}
        footer={null}
        width={isMobile ? '95%' : 700}
        style={{ top: 20 }}
      >
        {selectedLead && (
          <div>
            <Card title="Personal Information" className="leads-detail-card">
              <div className="leads-detail-grid">
                <div>
                  <p className="leads-detail-row"><strong className="leads-detail-label">First Name:</strong> {selectedLead.first_name || selectedLead.name?.split(' ')[0] || 'N/A'}</p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Last Name:</strong> {selectedLead.last_name || selectedLead.name?.split(' ').slice(1).join(' ') || 'N/A'}</p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Email:</strong> {selectedLead.email || 'N/A'}</p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Mobile:</strong> {selectedLead.mobile || 'N/A'}</p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">WhatsApp:</strong> {selectedLead.whatsapp || 'N/A'}</p>
                </div>
                <div>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Source:</strong> <Tag color="purple">{selectedLead.source || 'N/A'}</Tag></p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Status:</strong> <Tag color={
                    selectedLead.status === 'New' ? 'blue' :
                      selectedLead.status === 'In Progress' ? 'orange' :
                        selectedLead.status === 'Follow-Up' ? 'purple' :
                          selectedLead.status === 'Converted' ? 'green' :
                            selectedLead.status === 'Lost' ? 'red' : 'default'
                  }>{selectedLead.status || 'N/A'}</Tag></p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Branch:</strong> {selectedLead.branch || 'Unassigned'}</p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Assigned To:</strong> {selectedLead.assignedTo || 'Unassigned'}</p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Created At:</strong> {selectedLead.createdAt || 'N/A'}</p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Last Interaction:</strong> {selectedLead.lastInteraction || 'N/A'}</p>
                </div>
              </div>
            </Card>

            <Card title="Appointment Details" className="leads-detail-card">
              <div className="leads-detail-grid">
                <div>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Appointment Date:</strong> {selectedLead.appointment_date ? dayjs(selectedLead.appointment_date).format('MMMM DD, YYYY') : 'Not scheduled'}</p>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Slot Time:</strong> {selectedLead.slot_time || 'Not specified'}</p>
                </div>
                <div>
                  <p className="leads-detail-row"><strong className="leads-detail-label">Spa Package:</strong> {selectedLead.spa_package || 'Not specified'}</p>
                </div>
              </div>
            </Card>

            {selectedLead.ivrCallRecordingUrl && (
              <Card title="IVR Call Recording" className="leads-detail-card">
                <div className="leads-detail-grid">
                  <div>
                    <p className="leads-detail-row"><strong className="leads-detail-label">Agent:</strong> {selectedLead.ivrAgentName || 'N/A'}</p>
                    <p className="leads-detail-row"><strong className="leads-detail-label">Call Type:</strong> {selectedLead.ivrCallType || 'N/A'}</p>
                    <p className="leads-detail-row"><strong className="leads-detail-label">Call Status:</strong> {selectedLead.ivrCallStatus || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="leads-detail-row"><strong className="leads-detail-label">Call Time:</strong> {selectedLead.ivrCallStartedAt || 'N/A'}</p>
                  </div>
                </div>
                <audio controls style={{ width: '100%', marginTop: 8 }}>
                  <source src={selectedLead.ivrCallRecordingUrl} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
                <p style={{ marginTop: 8 }}>
                  <a href={selectedLead.ivrCallRecordingUrl} target="_blank" rel="noopener noreferrer">Open recording in new tab</a>
                </p>
              </Card>
            )}

            {(selectedLead.subject || selectedLead.message || selectedLead.notes) && (
              <Card title="Additional Information" className="leads-detail-card">
                {selectedLead.subject && (
                  <p className="leads-detail-row"><strong className="leads-detail-label">Subject:</strong> {selectedLead.subject}</p>
                )}
                {selectedLead.message && (
                  <div className="leads-detail-block">
                    <strong className="leads-detail-label">Message:</strong>
                    <p className="leads-detail-block-content">{selectedLead.message}</p>
                  </div>
                )}
                {selectedLead.notes && (
                  <div className="leads-detail-block">
                    <strong className="leads-detail-label">Notes:</strong>
                    <p className="leads-detail-block-content">{selectedLead.notes}</p>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* Follow-Up Modal - Reminders & Activity Logs */}
      <Modal
        className="leads-followup-modal"
        open={isFollowUpVisible}
        onCancel={() => {
          setIsFollowUpVisible(false)
          setFollowUpLead(null)
          setFollowUpTab('reminders')
          setReminderDesc('')
          setReminderDate(null)
          setReminderAssignee('')
        }}
        footer={null}
        width={isMobile ? '98%' : 900}
        style={{ top: 20 }}
        closable={false}
      >
        {followUpLead && (
          <div className="leads-followup-wrap">
            <div className="leads-followup-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="leads-followup-header-title">Lead Details –</span>
                <span className="leads-followup-header-name">
                  {followUpLead.name || `${followUpLead.first_name || ''} ${followUpLead.last_name || ''}`.trim()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span className="leads-followup-header-meta">
                  Company: <strong>{followUpLead.branch || 'N/A'}</strong>
                </span>
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setIsFollowUpVisible(false)
                    setFollowUpLead(null)
                    setFollowUpTab('reminders')
                  }}
                  className="leads-followup-close"
                />
              </div>
            </div>

            <div className="leads-followup-body">
              <div className="leads-followup-sidebar">
                {[
                  { key: 'reminders', icon: <BellOutlined />, label: 'Reminders' },
                  { key: 'activityLogs', icon: <HistoryOutlined />, label: 'Activity Logs' },
                ].map((tab) => (
                  <div
                    key={tab.key}
                    onClick={() => setFollowUpTab(tab.key)}
                    className={`leads-followup-tab ${followUpTab === tab.key ? 'active' : ''}`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </div>
                ))}
              </div>

              <div className="leads-followup-content">

                {/* ===== REMINDERS TAB ===== */}
                {followUpTab === 'reminders' && (
                  <div>
                    <h3 className="leads-followup-section-title">Set New Reminder</h3>

                    <div style={{ marginBottom: 12 }}>
                      <label className="leads-followup-label">
                        <span className="leads-followup-required">*</span> Description
                      </label>
                      <Input.TextArea
                        rows={3}
                        value={reminderDesc}
                        onChange={(e) => setReminderDesc(e.target.value)}
                        placeholder="Enter reminder description or select from quick replies below"
                        style={{ borderRadius: 6 }}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label className="leads-followup-label-optional">Quick Replies</label>
                      <Select
                        placeholder="Select a quick reply to insert in description"
                        style={{ width: '100%', borderRadius: 6 }}
                        allowClear
                        onChange={(val) => { if (val) setReminderDesc(val) }}
                        options={[
                          { value: 'Follow up on appointment booking', label: 'Follow up on appointment booking' },
                          { value: 'Reminder for spa package inquiry', label: 'Reminder for spa package inquiry' },
                          { value: 'Call back regarding pricing', label: 'Call back regarding pricing' },
                          { value: 'Send promotional offer details', label: 'Send promotional offer details' },
                          { value: 'Confirm appointment schedule', label: 'Confirm appointment schedule' },
                        ]}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div>
                        <label className="leads-followup-label">
                          <span className="leads-followup-required">*</span> Date & Time to be notified
                        </label>
                        <DatePicker
                          showTime
                          format="YYYY-MM-DD HH:mm"
                          value={reminderDate}
                          onChange={setReminderDate}
                          placeholder="Select date"
                          style={{ width: '100%', borderRadius: 6 }}
                          disabledDate={(current) => current && current < dayjs().startOf('day')}
                        />
                      </div>
                      <div>
                        <label className="leads-followup-label-optional">Set reminder to</label>
                        <Select
                          value={reminderAssignee || (followUpLead.branch || undefined)}
                          onChange={setReminderAssignee}
                          placeholder="Select assignee"
                          style={{ width: '100%', borderRadius: 6 }}
                          allowClear
                        >
                          <Option value={followUpLead.branch || 'Company'}>{followUpLead.branch || 'Company'}</Option>
                          {users.map((u) => (
                            <Option key={u._id || u.id} value={u.name}>{u.name}</Option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                      <Button
                        type="primary"
                        loading={addReminderLoading}
                        onClick={async () => {
                          if (!reminderDesc.trim()) { messageApi.warning('Please enter a description'); return }
                          if (!reminderDate) { messageApi.warning('Please select date & time'); return }
                          try {
                            await addReminder({
                              leadId: followUpLead._id || followUpLead.key,
                              description: reminderDesc.trim(),
                              remindAt: reminderDate.toISOString(),
                              assignedTo: reminderAssignee || followUpLead.branch || '',
                            }).unwrap()
                            messageApi.success('Reminder added')
                            setReminderDesc('')
                            setReminderDate(null)
                            setReminderAssignee('')
                            refetchLeadDetail()
                          } catch (err) {
                            messageApi.error(err?.data?.message || 'Failed to add reminder')
                          }
                        }}
                        style={{ borderRadius: 6, fontWeight: 600 }}
                      >
                        Add Reminder
                      </Button>
                    </div>

                    {/* Reminders Table */}
                    <Table
                      size="small"
                      dataSource={(leadDetail?.reminders || []).map((r, i) => ({ ...r, key: r._id || i, sno: i + 1 }))}
                      pagination={false}
                      locale={{ emptyText: <Empty description="No reminders found" /> }}
                      columns={[
                        { title: 'S.No', dataIndex: 'sno', key: 'sno', width: 50 },
                        {
                          title: 'Date', key: 'date', width: 120,
                          render: (_, r) => r.createdAt ? dayjs(r.createdAt).format('MMM DD, YYYY') : '-',
                        },
                        { title: 'Description', dataIndex: 'description', key: 'desc', ellipsis: true },
                        {
                          title: 'Remind', key: 'remind', width: 140,
                          render: (_, r) => r.remindAt ? dayjs(r.remindAt).format('MMM DD, YYYY HH:mm') : '-',
                        },
                        {
                          title: 'Status', key: 'status', width: 100,
                          render: (_, r) => (
                            <Tag color={r.status === 'Completed' ? 'green' : r.status === 'Cancelled' ? 'red' : 'gold'}>
                              {r.status}
                            </Tag>
                          ),
                        },
                        {
                          title: 'Action', key: 'action', width: 90,
                          render: (_, r) => (
                            <Space size="small">
                              {r.status === 'Pending' && (
                                <Button
                                  type="link" size="small"
                                  icon={<CheckOutlined style={{ color: 'var(--color-success)' }} />}
                                  title="Mark Complete"
                                  onClick={async () => {
                                    try {
                                      await updateReminderApi({
                                        leadId: followUpLead._id || followUpLead.key,
                                        reminderId: r._id,
                                        status: 'Completed',
                                      }).unwrap()
                                      messageApi.success('Reminder completed')
                                      refetchLeadDetail()
                                    } catch (err) {
                                      messageApi.error('Failed to update')
                                    }
                                  }}
                                />
                              )}
                              <Button
                                type="link" size="small" danger
                                icon={<DeleteOutlined />}
                                title="Delete"
                                onClick={async () => {
                                  try {
                                    await deleteReminderApi({
                                      leadId: followUpLead._id || followUpLead.key,
                                      reminderId: r._id,
                                    }).unwrap()
                                    messageApi.success('Reminder deleted')
                                    refetchLeadDetail()
                                  } catch (err) {
                                    messageApi.error('Failed to delete')
                                  }
                                }}
                              />
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </div>
                )}

                {/* ===== ACTIVITY LOGS TAB ===== */}
                {followUpTab === 'activityLogs' && (
                  <div>
                    <h3 className="leads-followup-section-title leads-followup-section-title-sm">
                      Lead Activity History ({leadDetail?.activityLogs?.length || 0})
                    </h3>
                    <div className="leads-followup-timeline-badge">
                      <HistoryOutlined /> Timeline View
                    </div>

                    {(leadDetail?.activityLogs?.length || 0) === 0 ? (
                      <Empty description="No activity logs yet" />
                    ) : (
                      <div className="leads-followup-timeline-box">
                        {[...(leadDetail?.activityLogs || [])].reverse().map((log, idx) => (
                          <div key={log._id || idx} className="leads-followup-timeline-item">
                            <div className="leads-followup-timeline-dot" />
                            {idx < (leadDetail.activityLogs.length - 1) && (
                              <div className="leads-followup-timeline-line" />
                            )}
                            <div style={{ flex: 1 }}>
                              <div className="leads-followup-timeline-text">
                                {log.action}{log.details ? ` – ${log.details}` : ''}
                              </div>
                              <div className="leads-followup-timeline-meta">
                                {log.createdAt ? dayjs(log.createdAt).format('M/D/YYYY, h:mm:ss A') : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="leads-followup-footer">
              <Button
                type="primary"
                loading={convertingToCustomer}
                disabled={!followUpLeadId || followUpLead?.status === 'Converted'}
                onClick={async () => {
                  if (!followUpLeadId) return
                  try {
                    await convertLeadToCustomer(followUpLeadId).unwrap()
                    messageApi.success('Lead converted to customer. Open Customer Management to view.')
                    setIsFollowUpVisible(false)
                    setFollowUpLead(null)
                    refetchLeads()
                  } catch (e) {
                    messageApi.error(e?.data?.message || e?.message || 'Could not convert to customer')
                  }
                }}
              >
                {followUpLead?.status === 'Converted' ? 'Already a customer' : 'Convert to Customer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        className="leads-call-modal"
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
            <p className="leads-call-row"><strong>Lead:</strong> {callLeadRecord.name}</p>
            <p className="leads-call-row"><strong>Phone:</strong> {callLeadRecord.mobile || callLeadRecord.phone}</p>
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
              <p className="leads-call-warning">
                Add Campaign / Agent IDs in Settings → API & Integrations → Ozonetel Integration.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        className="leads-import-modal"
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
              <p className="leads-import-strong"><strong>Mandatory Fields:</strong> Name, Phone</p>
              <p className="leads-import-strong"><strong>Optional Fields:</strong> Email, WhatsApp, Subject, Message</p>
              <p><strong style={{ color: 'var(--color-danger)' }}>Important:</strong> Only the above fields are allowed. Any other columns will be rejected.</p>
              <p className="leads-import-note">
                • Duplicate email/phone entries (in file or database) will be rejected<br />
                • Source will be set to "Import" automatically<br />
                • Status will be set to "New" automatically<br />
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
              return false
            }}
            showUploadList={false}
          >
            <Button icon={<UploadOutlined />} loading={importLoading} block type="primary">
              Select CSV File to Import
            </Button>
          </Upload>
        </Space>
        <div className="leads-import-note" style={{ marginTop: 16 }}>
          <p><strong>Allowed CSV Headers (case-insensitive):</strong></p>
          <p className="leads-import-code">Name, Phone, Email, WhatsApp, Subject, Message</p>
        </div>
      </Modal>
    </PageLayout>
  )
}

export default Leads
