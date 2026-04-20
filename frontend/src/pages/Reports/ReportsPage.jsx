import React, { useState, useMemo, useCallback } from 'react'
import {
  Card,
  Select,
  DatePicker,
  Button,
  Space,
  Table,
  Row,
  Col,
  Statistic,
  message,
  Spin,
  Alert,
  Empty,
  Tag,
} from 'antd'
import {
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useResponsive } from '../../hooks/useResponsive'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import { useChartThemeTokens } from '../../hooks/useChartThemeTokens'
import { isSuperAdmin, isAdmin, isSupervisor } from '../../utils/permissions'
import { useGetReportsQuery } from '../../store/api/reportApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { exportReportToPdf } from '../../utils/reportsPdfExport'
import { normalizeLeadSourceDisplay, leadSourceTagColor } from '../../utils/leadSourceNormalize'
import './reports-page.css'

const { RangePicker } = DatePicker
const { Option } = Select

/** Excel: sheet name ≤31 chars; no : \\ / ? * [ ] */
function buildAgentSheetName(prefix, agentNames) {
  const uniq = [
    ...new Set(
      (agentNames || []).map((n) => String(n || '').trim()).filter((x) => x && x !== '-')
    ),
  ]
  let tag = ''
  if (uniq.length === 1) tag = uniq[0]
  else if (uniq.length > 1)
    tag = uniq.length <= 3 ? uniq.join(', ') : `${uniq[0]} +${uniq.length - 1}`
  let s = tag ? `${prefix} ${tag}` : prefix
  s = s.replace(/[:\\/*?[\]]/g, '-').replace(/\s+/g, ' ').trim()
  if (s.length > 31) s = `${s.slice(0, 30)}…`
  return s || prefix.slice(0, 31)
}

function takeUniqueSheetName(desired, used) {
  let n = desired.slice(0, 31)
  let k = 2
  while (used.has(n)) {
    const suf = ` ${k}`
    n = `${desired.slice(0, Math.max(0, 31 - suf.length))}${suf}`.slice(0, 31)
    k += 1
  }
  used.add(n)
  return n
}

function sortLocale(a, b) {
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
}

function reportSourceCell(source) {
  const s = normalizeLeadSourceDisplay(source)
  return <Tag color={leadSourceTagColor(source)}>{s}</Tag>
}

/** Match backend normalizeOzonetelAgentId for export grouping. */
function normOzIdForSheet(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  return s.split(/\s*(?:->|=>|→)\s*/)[0].trim()
}

function callRowMatchesAgentProfile(row, agent) {
  const pid = normOzIdForSheet(agent.ozonetelAgentId)
  const rid = normOzIdForSheet(row.agentId)
  const rcrm = normOzIdForSheet(row.crmCloudAgentId)
  if (pid && (rid === pid || rcrm === pid)) return true
  const an = String(agent.name || '').trim().toLowerCase()
  if (!an) return false
  if (String(row.crmAgentName || '').trim().toLowerCase() === an) return true
  if (String(row.agentName || '').trim().toLowerCase() === an) return true
  return false
}

const AGENT_X_SUMMARY_HEADERS = [
  'Agent name',
  'Agent email',
  'Agent role',
  'Ozonetel agent ID',
  'Leads',
  'Calls',
  'Converted',
]
const AGENT_X_LEAD_HEADERS = [
  'Agent name',
  'Agent email',
  'Agent role',
  'Agent Ozonetel ID',
  'S.No.',
  'Created date',
  'Lead name',
  'Phone',
  'Email',
  'Source',
  'Status',
  'Branch',
]
const AGENT_X_CALL_HEADERS = [
  'Agent name (Ozonetel)',
  'Ozonetel agent ID',
  'CRM agent name',
  'CRM email',
  'CRM role',
  'CRM Ozonetel ID',
  'Call type',
  'Call status',
  'S.No.',
  'Start time',
  'End time',
  'Duration (sec)',
  'Duration',
  'Customer number',
  'Branches',
  'Recording URL',
  'Call ref',
]

function buildAgentCombinedSheetAoA(perfRow, leadRows, callRows) {
  const aoa = []
  aoa.push(['Summary'])
  if (perfRow) {
    aoa.push(AGENT_X_SUMMARY_HEADERS)
    aoa.push([
      perfRow.name,
      perfRow.agentEmail ?? '',
      perfRow.agentRole ?? '',
      perfRow.ozonetelAgentId ?? '',
      perfRow.leads,
      perfRow.calls,
      perfRow.converted,
    ])
  } else {
    aoa.push([
      '(No CRM summary row for this tab — leads/calls below are matched by assignee or Ozonetel name/ID.)',
    ])
  }
  aoa.push([])
  aoa.push(['Assigned leads'])
  aoa.push(AGENT_X_LEAD_HEADERS)
  if (!leadRows.length) {
    aoa.push(['(No rows in this period)', ...Array(AGENT_X_LEAD_HEADERS.length - 1).fill('')])
  } else {
    leadRows.forEach((r, i) => {
      aoa.push([
        r.assignedAgent,
        r.assignedEmail,
        r.assignedRole ?? '',
        r.assignedOzonetelId ?? '',
        i + 1,
        r.createdDate,
        r.leadName,
        r.phone,
        r.email,
        r.source,
        r.status,
        r.branch,
      ])
    })
  }
  aoa.push([])
  aoa.push(['Calls (Ozonetel)'])
  aoa.push(AGENT_X_CALL_HEADERS)
  if (!callRows.length) {
    aoa.push(['(No rows in this period)', ...Array(AGENT_X_CALL_HEADERS.length - 1).fill('')])
  } else {
    callRows.forEach((r, i) => {
      aoa.push([
        r.agentName,
        r.agentId,
        r.crmAgentName ?? '',
        r.crmAgentEmail ?? '',
        r.crmAgentRole ?? '',
        r.crmCloudAgentId ?? '',
        r.callType ?? r.type,
        r.callStatus,
        i + 1,
        r.startTime,
        r.endTime,
        r.durationSec,
        r.duration,
        r.customerNumber,
        r.branches,
        r.recordingUrl,
        r.callRef,
      ])
    })
  }
  return aoa
}

function callGroupKeyForExport(r) {
  const id = String(r.agentId ?? '').trim()
  const nm = String(r.agentName ?? '').trim()
  return id || nm || '_'
}

const BRANCH_X_LEAD_HEADERS = [
  'S.No.',
  'Created date',
  'Name',
  'Email',
  'Phone',
  'WhatsApp',
  'Source',
  'Status',
  'Branch',
  'Assigned to',
  'Appointment date',
  'Slot',
  'Spa package',
  'Subject',
]

/** One Excel sheet: summary row + lead detail rows for a single branch. */
function buildBranchCombinedSheetAoA(perfRow, leadRows, orphanBranchLabel) {
  const aoa = []
  aoa.push(['Summary'])
  aoa.push(['Branch', 'Leads', 'Converted', 'Lost', 'Conv. %', 'Revenue index'])
  if (perfRow) {
    aoa.push([
      perfRow.name,
      perfRow.leads,
      perfRow.converted ?? 0,
      perfRow.lost ?? 0,
      perfRow.conversionRate ?? 0,
      perfRow.revenue ?? 0,
    ])
  } else {
    const total = leadRows.length
    const conv = leadRows.filter((l) => l.status === 'Converted').length
    const lost = leadRows.filter((l) => l.status === 'Lost').length
    const rate = total > 0 ? Math.round((conv / total) * 1000) / 10 : 0
    aoa.push([
      orphanBranchLabel || '—',
      total,
      conv,
      lost,
      rate,
      conv * 5000,
    ])
  }
  aoa.push([])
  aoa.push(['Lead details'])
  aoa.push(BRANCH_X_LEAD_HEADERS)
  if (!leadRows.length) {
    aoa.push(['(No lead rows in this export for this branch)', ...Array(BRANCH_X_LEAD_HEADERS.length - 1).fill('')])
  } else {
    leadRows.forEach((r, i) => {
      aoa.push([
        i + 1,
        r.createdDate ?? '',
        r.name ?? '',
        r.email ?? '',
        r.phone ?? '',
        r.whatsapp ?? '',
        r.source ?? '',
        r.status ?? '',
        r.branch ?? '',
        r.assignedTo ?? '',
        r.appointmentDate ?? '',
        r.slot ?? '',
        r.spaPackage ?? '',
        r.subject ?? '',
      ])
    })
  }
  return aoa
}

const leadReportColumns = [
  { title: 'Date', dataIndex: 'date', key: 'date' },
  { title: 'Total Leads', dataIndex: 'total', key: 'total' },
  { title: 'Converted', dataIndex: 'converted', key: 'converted' },
  { title: 'Lost', dataIndex: 'lost', key: 'lost' },
  {
    title: 'Conversion Rate',
    dataIndex: 'rate',
    key: 'rate',
    render: (rate) => `${rate}%`,
  },
]

const leadDetailsColumns = [
  { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 56 },
  { title: 'Created', dataIndex: 'createdDate', key: 'createdDate', width: 104 },
  { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: 'Email', dataIndex: 'email', key: 'email', ellipsis: true },
  { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 112 },
  { title: 'WhatsApp', dataIndex: 'whatsapp', key: 'whatsapp', width: 112 },
  { title: 'Source', dataIndex: 'source', key: 'source', width: 96, render: (s) => reportSourceCell(s) },
  { title: 'Status', dataIndex: 'status', key: 'status', width: 104 },
  { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 96 },
  { title: 'Assigned', dataIndex: 'assignedTo', key: 'assignedTo', width: 108 },
  { title: 'Appt date', dataIndex: 'appointmentDate', key: 'appointmentDate', width: 104 },
  { title: 'Slot', dataIndex: 'slot', key: 'slot', width: 88 },
  { title: 'Package', dataIndex: 'spaPackage', key: 'spaPackage', ellipsis: true },
  { title: 'Subject', dataIndex: 'subject', key: 'subject', ellipsis: true },
]

const appointmentReportColumns = [
  { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 60 },
  { title: 'Date', dataIndex: 'date', key: 'date', width: 110 },
  { title: 'Customer', dataIndex: 'customer', key: 'customer', ellipsis: true },
  { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 120 },
  { title: 'Source', dataIndex: 'source', key: 'source', width: 100, render: (s) => reportSourceCell(s) },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    width: 110,
    render: (s) => {
      const labels = {
        Converted: 'Completed',
        Cancelled: 'Cancelled',
        'Follow-Up': 'Rescheduled',
        New: 'Current',
        'In Progress': 'Current',
        Lost: 'Lost',
      }
      const colors = {
        Converted: 'green',
        Cancelled: 'red',
        'Follow-Up': 'orange',
        New: 'blue',
        'In Progress': 'blue',
        Lost: 'default',
      }
      return <Tag color={colors[s] || 'default'}>{labels[s] || s}</Tag>
    },
  },
  { title: 'Slot', dataIndex: 'slot', key: 'slot', width: 130 },
  { title: 'Package', dataIndex: 'package', key: 'package', ellipsis: true },
  { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 100 },
  { title: 'Assigned To', dataIndex: 'assignedTo', key: 'assignedTo', width: 100 },
]

const callTypeCell = {
  title: 'Call type',
  dataIndex: 'callType',
  key: 'callType',
  width: 96,
  render: (_, r) => r.callType || r.type || '—',
}

const callDetailsColumns = [
  { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 56 },
  { title: 'Start', dataIndex: 'startTime', key: 'startTime', width: 152 },
  { title: 'End', dataIndex: 'endTime', key: 'endTime', width: 152 },
  { title: 'Duration', dataIndex: 'duration', key: 'duration', width: 72 },
  { title: 'Customer #', dataIndex: 'customerNumber', key: 'customerNumber', width: 120 },
  callTypeCell,
  { title: 'Call status', dataIndex: 'callStatus', key: 'callStatus', width: 100 },
  { title: 'Agent name (Ozonetel)', dataIndex: 'agentName', key: 'agentName', ellipsis: true },
  { title: 'Ozonetel agent ID', dataIndex: 'agentId', key: 'agentId', width: 112 },
  { title: 'CRM name', dataIndex: 'crmAgentName', key: 'crmAgentName', ellipsis: true },
  { title: 'CRM email', dataIndex: 'crmAgentEmail', key: 'crmAgentEmail', ellipsis: true },
  { title: 'CRM role', dataIndex: 'crmAgentRole', key: 'crmAgentRole', width: 88 },
  { title: 'CRM Ozonetel ID', dataIndex: 'crmCloudAgentId', key: 'crmCloudAgentId', width: 112 },
  { title: 'Branches', dataIndex: 'branches', key: 'branches', ellipsis: true },
  { title: 'Call ref', dataIndex: 'callRef', key: 'callRef', width: 120 },
  {
    title: 'Recording',
    dataIndex: 'recordingUrl',
    key: 'recordingUrl',
    ellipsis: true,
    render: (url) =>
      url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Link
        </a>
      ) : (
        '—'
      ),
  },
]

/** Agent performance table: agent + call type first; Excel export stacks Summary → leads → calls on one tab per agent. */
const agentCallsReportColumns = [
  { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 56 },
  { title: 'Agent name (Ozonetel)', dataIndex: 'agentName', key: 'agentName', ellipsis: true },
  { title: 'Ozonetel agent ID', dataIndex: 'agentId', key: 'agentId', width: 112 },
  { title: 'CRM name', dataIndex: 'crmAgentName', key: 'crmAgentName', ellipsis: true },
  { title: 'CRM email', dataIndex: 'crmAgentEmail', key: 'crmAgentEmail', ellipsis: true },
  { title: 'CRM role', dataIndex: 'crmAgentRole', key: 'crmAgentRole', width: 88 },
  { title: 'CRM Ozonetel ID', dataIndex: 'crmCloudAgentId', key: 'crmCloudAgentId', width: 112 },
  callTypeCell,
  { title: 'Call status', dataIndex: 'callStatus', key: 'callStatus', width: 100 },
  { title: 'Start', dataIndex: 'startTime', key: 'startTime', width: 152 },
  { title: 'End', dataIndex: 'endTime', key: 'endTime', width: 152 },
  { title: 'Duration', dataIndex: 'duration', key: 'duration', width: 72 },
  { title: 'Customer #', dataIndex: 'customerNumber', key: 'customerNumber', width: 120 },
  { title: 'Branches', dataIndex: 'branches', key: 'branches', ellipsis: true },
  { title: 'Call ref', dataIndex: 'callRef', key: 'callRef', width: 120 },
  {
    title: 'Recording',
    dataIndex: 'recordingUrl',
    key: 'recordingUrl',
    ellipsis: true,
    render: (url) =>
      url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Link
        </a>
      ) : (
        '—'
      ),
  },
]

const branchPerformanceColumns = [
  { title: 'Branch', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: 'Leads', dataIndex: 'leads', key: 'leads', width: 88 },
  { title: 'Converted', dataIndex: 'converted', key: 'converted', width: 96 },
  { title: 'Lost', dataIndex: 'lost', key: 'lost', width: 80 },
  {
    title: 'Conv. %',
    dataIndex: 'conversionRate',
    key: 'conversionRate',
    width: 88,
    render: (v) => `${v ?? 0}%`,
  },
  {
    title: 'Revenue index (₹)',
    dataIndex: 'revenue',
    key: 'revenue',
    width: 140,
    render: (v) => (v != null ? Number(v).toLocaleString('en-IN') : '—'),
  },
]

const agentAssignedLeadsColumns = [
  { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 56 },
  { title: 'Agent name', dataIndex: 'assignedAgent', key: 'assignedAgent', ellipsis: true },
  { title: 'Agent email', dataIndex: 'assignedEmail', key: 'assignedEmail', ellipsis: true },
  { title: 'Agent role', dataIndex: 'assignedRole', key: 'assignedRole', width: 88 },
  { title: 'Agent Ozonetel ID', dataIndex: 'assignedOzonetelId', key: 'assignedOzonetelId', width: 120 },
  { title: 'Created', dataIndex: 'createdDate', key: 'createdDate', width: 104 },
  { title: 'Lead name', dataIndex: 'leadName', key: 'leadName', ellipsis: true },
  { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 112 },
  { title: 'Email', dataIndex: 'email', key: 'email', ellipsis: true },
  { title: 'Source', dataIndex: 'source', key: 'source', width: 96, render: (s) => reportSourceCell(s) },
  { title: 'Status', dataIndex: 'status', key: 'status', width: 104 },
  { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 96 },
]

const Reports = () => {
  const { isMobile } = useResponsive()
  const [reportType, setReportType] = useState('lead')
  const [selectedBranchIds, setSelectedBranchIds] = useState([])
  const [dateFrom, setDateFrom] = useState(() => dayjs().subtract(29, 'day').format('YYYY-MM-DD'))
  const [dateTo, setDateTo] = useState(() => dayjs().format('YYYY-MM-DD'))
  const [rangeValue, setRangeValue] = useState(() => [dayjs().subtract(29, 'day'), dayjs()])
  const [showFilters, setShowFilters] = useState(false)
  const chartT = useChartThemeTokens()

  const showBranchDropdown = isSuperAdmin() || isAdmin() || isSupervisor()
  const { data: branchesData } = useGetBranchesQuery()
  const branches = branchesData?.branches || []

  const reportParams = useMemo(
    () => ({
      branch: selectedBranchIds.length ? selectedBranchIds : undefined,
      dateFrom,
      dateTo,
    }),
    [selectedBranchIds, dateFrom, dateTo]
  )

  const { data: reportRes, isLoading, isFetching, error, refetch } = useGetReportsQuery(reportParams)

  const report = reportRes?.success ? reportRes : null
  const meta = report?.meta

  const getChartHeight = () => {
    if (isMobile) return 250
    return 280
  }
  const chartHeight = getChartHeight()

  const handleGenerateReport = () => {
    if (!rangeValue?.[0] || !rangeValue?.[1]) {
      message.warning('Select a date range')
      return
    }
    setDateFrom(rangeValue[0].format('YYYY-MM-DD'))
    setDateTo(rangeValue[1].format('YYYY-MM-DD'))
    message.success('Report updated')
  }

  const handleExport = useCallback(
    (format) => {
      if (!report) {
        message.warning('Load a report first')
        return
      }
      if (format === 'pdf') {
        try {
          exportReportToPdf({ reportType, report, meta, dateFrom, dateTo })
          message.success('PDF downloaded')
        } catch (e) {
          console.error(e)
          message.error('PDF export failed')
        }
        return
      }
      if (format !== 'excel') {
        message.info('Use Excel or PDF export')
        return
      }

      const appendReportInfoSheet = (wb) => {
        const rows = [
          { Field: 'Date from', Value: meta?.dateFrom ?? dateFrom },
          { Field: 'Date to', Value: meta?.dateTo ?? dateTo },
          { Field: 'Report', Value: reportType },
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Report info')
      }

      try {
        const wb = XLSX.utils.book_new()
        const fileBase = `report_${reportType}_${dateFrom}_${dateTo}`

        switch (reportType) {
          case 'lead': {
            const st = report.lead?.stats || {}
            const leadRows = report.lead?.detailsTable || []
            const detailLeads = report.lead?.leadDetailsTable || []
            const trend = report.lead?.performanceTrend || []
            const sources = report.lead?.sourceDistribution || []

            const infoRows = [
              { Field: 'Date from', Value: meta?.dateFrom ?? dateFrom },
              { Field: 'Date to', Value: meta?.dateTo ?? dateTo },
              { Field: 'Report', Value: reportType },
            ]
            if (meta?.leadDetailsTruncated) {
              infoRows.push({
                Field: 'Lead details note',
                Value: `List capped at ${meta.leadDetailsCap ?? 15000} rows; narrow the date range to export fewer leads per request.`,
              })
            }
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), 'Report info')

            const summaryRows = [
              { Metric: 'Total leads', Value: st.totalLeads ?? 0 },
              { Metric: 'Converted', Value: st.converted ?? 0 },
              { Metric: 'Lost', Value: st.lost ?? 0 },
              { Metric: 'Conversion rate %', Value: st.conversionRate ?? 0 },
            ]
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Lead summary')

            if (trend.length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(
                  trend.map((r) => ({
                    Period: r.name,
                    Leads: r.leads,
                    Converted: r.converted,
                    Lost: r.lost,
                  }))
                ),
                'Performance trend'
              )
            }

            if (sources.length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(sources.map((s) => ({ Source: s.name, Count: s.value }))),
                'Source distribution'
              )
            }

            if (leadRows.length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(
                  leadRows.map((r) => ({
                    Date: r.date,
                    'Total Leads': r.total,
                    Converted: r.converted,
                    Lost: r.lost,
                    'Conversion Rate %': r.rate,
                  }))
                ),
                'Daily details'
              )
            }

            if (detailLeads.length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(
                  detailLeads.map((r) => ({
                    'S.No.': r.sno,
                    'Created date': r.createdDate,
                    Name: r.name,
                    Email: r.email,
                    Phone: r.phone,
                    WhatsApp: r.whatsapp,
                    Source: r.source,
                    Status: r.status,
                    Branch: r.branch,
                    'Assigned to': r.assignedTo,
                    'Appointment date': r.appointmentDate,
                    'Slot': r.slot,
                    'Spa package': r.spaPackage,
                    Subject: r.subject,
                  }))
                ),
                'Lead details'
              )
            }

            const hasAnyDetail =
              trend.length > 0 ||
              sources.length > 0 ||
              leadRows.length > 0 ||
              detailLeads.length > 0
            if (!hasAnyDetail && (st.totalLeads ?? 0) === 0) {
              message.info('No data to export for this range')
              return
            }
            XLSX.writeFile(wb, `${fileBase}.xlsx`)
            message.success(
              detailLeads.length
                ? `Excel downloaded (${detailLeads.length} lead row${detailLeads.length === 1 ? '' : 's'})`
                : 'Excel downloaded'
            )
            break
          }

          case 'appointment': {
            const aptStats = report.lead?.appointmentStats || {}
            const aptRows = report.lead?.appointmentDetailsTable || []

            appendReportInfoSheet(wb)

            const summaryRows = [
              { Metric: 'Total appointments', Value: aptStats.totalAppointments ?? 0 },
              { Metric: 'Completed', Value: aptStats.completed ?? 0 },
              { Metric: 'Cancelled', Value: aptStats.cancelled ?? 0 },
              { Metric: 'Rescheduled', Value: aptStats.rescheduled ?? 0 },
            ]
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Appointment summary')

            if (aptRows.length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(
                  aptRows.map((r) => ({
                    'S.No.': r.sno,
                    Date: r.date,
                    Customer: r.customer,
                    Phone: r.phone,
                    Source: r.source,
                    Status: r.status,
                    Slot: r.slot,
                    Package: r.package,
                    Branch: r.branch,
                    'Assigned To': r.assignedTo,
                  }))
                ),
                'Appointment details'
              )
            }

            if ((aptStats.totalAppointments ?? 0) === 0 && aptRows.length === 0) {
              message.info('No appointment data to export for this range')
              return
            }
            XLSX.writeFile(wb, `${fileBase}.xlsx`)
            message.success('Excel downloaded')
            break
          }

          case 'agent': {
            const perf = report.agent?.performance || []
            const assignedRows = report.agent?.assignedLeadsTable || []
            const agentCallRows = report.agent?.agentCallsTable || []
            const sheetNamesUsed = new Set(['Report info'])
            const infoRows = [
              { Field: 'Date from', Value: meta?.dateFrom ?? dateFrom },
              { Field: 'Date to', Value: meta?.dateTo ?? dateTo },
              { Field: 'Report', Value: 'Agent performance (all agents)' },
              {
                Field: 'Excel sheets',
                Value:
                  'One tab per agent. Each tab has Summary at the top, then Assigned leads, then Calls (same agent only). Extra tabs appear only for assignees without CRM summary or Ozonetel-only agents. Sheet names truncated to 31 characters.',
              },
            ]
            if (meta?.agentAssignedLeadsTruncated) {
              infoRows.push({
                Field: 'Assigned leads note',
                Value: `List capped at ${meta?.agentDetailCap ?? 15000} rows; narrow the date range if needed.`,
              })
            }
            if (meta?.agentCallsByAgentTruncated) {
              infoRows.push({
                Field: 'Agent calls note',
                Value: `Calls list capped at ${meta?.agentDetailCap ?? 15000} rows; narrow the date range if needed.`,
              })
            }
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), 'Report info')

            const leadsByNorm = new Map()
            for (const row of assignedRows) {
              const raw = String(row.assignedAgent ?? '').trim() || '-'
              const nk = raw === '-' ? '-' : raw.toLowerCase()
              if (!leadsByNorm.has(nk)) leadsByNorm.set(nk, [])
              leadsByNorm.get(nk).push(row)
            }

            const usedCallKeys = new Set()
            const takeCallsForProfile = (profile) => {
              const out = []
              for (const row of agentCallRows) {
                if (usedCallKeys.has(row.key)) continue
                if (callRowMatchesAgentProfile(row, profile)) {
                  usedCallKeys.add(row.key)
                  out.push(row)
                }
              }
              return out
            }

            const perfSorted = [...perf].sort((a, b) => sortLocale(a.name || '', b.name || ''))
            const perfNameNorms = new Set(
              perf.map((p) => String(p.name || '').trim().toLowerCase()).filter(Boolean)
            )

            const appendAgentSheet = (displayName, perfRow, leadRows, callRows) => {
              const label = String(displayName || '').trim() || 'Unknown'
              const sh = takeUniqueSheetName(buildAgentSheetName('Agent', [label]), sheetNamesUsed)
              const aoa = buildAgentCombinedSheetAoA(perfRow, leadRows, callRows)
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sh)
            }

            for (const r of perfSorted) {
              const norm = String(r.name || '').trim().toLowerCase()
              const leadRows = norm ? leadsByNorm.get(norm) || [] : []
              const profile = {
                name: r.name,
                ozonetelAgentId: r.ozonetelAgentId,
              }
              const callRows = takeCallsForProfile(profile)
              appendAgentSheet(r.name, r, leadRows, callRows)
            }

            const leadNormsSorted = [...leadsByNorm.keys()].sort((a, b) => {
              if (a === '-') return 1
              if (b === '-') return -1
              return sortLocale(a, b)
            })
            for (const nk of leadNormsSorted) {
              if (nk === '-' || perfNameNorms.has(nk)) continue
              const leadRows = leadsByNorm.get(nk) || []
              const first = leadRows[0]
              const displayName = String(first.assignedAgent || '').trim() || 'Unknown'
              const profile = {
                name: first.assignedAgent,
                ozonetelAgentId: first.assignedOzonetelId,
              }
              const callRows = takeCallsForProfile(profile)
              appendAgentSheet(displayName, null, leadRows, callRows)
            }

            if (leadsByNorm.has('-') && !perfNameNorms.has('-')) {
              const leadRows = leadsByNorm.get('-') || []
              const first = leadRows[0]
              const profile = {
                name: first?.assignedAgent || '-',
                ozonetelAgentId: first?.assignedOzonetelId ?? '',
              }
              const callRows = takeCallsForProfile(profile)
              appendAgentSheet('Unassigned', null, leadRows, callRows)
            }

            const remainingCalls = agentCallRows.filter((row) => !usedCallKeys.has(row.key))
            const callsByCk = new Map()
            for (const row of remainingCalls) {
              const ck = callGroupKeyForExport(row)
              if (!callsByCk.has(ck)) callsByCk.set(ck, [])
              callsByCk.get(ck).push(row)
            }
            const ckSorted = [...callsByCk.keys()].sort(sortLocale)
            for (const ck of ckSorted) {
              const callRows = callsByCk.get(ck)
              const first = callRows[0]
              const displayName =
                String(first.agentName || first.agentId || ck).trim() || 'Unknown'
              appendAgentSheet(displayName, null, [], callRows)
            }
            if (perf.length === 0 && assignedRows.length === 0 && agentCallRows.length === 0) {
              message.info('No agent data to export for this range')
              return
            }
            XLSX.writeFile(wb, `${fileBase}.xlsx`)
            message.success('Excel downloaded')
            break
          }

          case 'call': {
            const { summary, totalCalls, answered, missed, callDetailsTable: callDetailRows = [] } = report.call || {}
            const infoRows = [
              { Field: 'Date from', Value: meta?.dateFrom ?? dateFrom },
              { Field: 'Date to', Value: meta?.dateTo ?? dateTo },
              { Field: 'Report', Value: reportType },
            ]
            if (meta?.callDetailsTruncated) {
              infoRows.push({
                Field: 'Call details note',
                Value: `List capped at ${meta?.callDetailsCap ?? 15000} rows; narrow the date range for a smaller export.`,
              })
            }
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), 'Report info')
            const summaryRows = [
              { Metric: 'Total calls', Value: totalCalls ?? 0 },
              { Metric: 'Answered', Value: answered ?? 0 },
              { Metric: 'Missed', Value: missed ?? 0 },
            ]
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Call summary')
            if ((summary || []).length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet((summary || []).map((s) => ({ Segment: s.name, Count: s.value }))),
                'Call breakdown'
              )
            }
            if (callDetailRows.length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(
                  callDetailRows.map((r) => ({
                    'S.No.': r.sno,
                    'Start time': r.startTime,
                    'End time': r.endTime,
                    'Duration (sec)': r.durationSec,
                    Duration: r.duration,
                    'Customer number': r.customerNumber,
                    'Call type': r.callType ?? r.type,
                    'Call status': r.callStatus,
                    'Agent name (Ozonetel)': r.agentName,
                    'Ozonetel agent ID': r.agentId,
                    'CRM agent name': r.crmAgentName ?? '',
                    'CRM email': r.crmAgentEmail ?? '',
                    'CRM role': r.crmAgentRole ?? '',
                    'CRM Ozonetel ID': r.crmCloudAgentId ?? '',
                    Branches: r.branches,
                    'Recording URL': r.recordingUrl,
                    'Call ref': r.callRef,
                  }))
                ),
                'Call details'
              )
            }
            if ((totalCalls ?? 0) === 0 && callDetailRows.length === 0) {
              message.info('No call data to export for this range')
              return
            }
            XLSX.writeFile(wb, `${fileBase}.xlsx`)
            message.success(
              callDetailRows.length
                ? `Excel downloaded (${callDetailRows.length} call row${callDetailRows.length === 1 ? '' : 's'})`
                : 'Excel downloaded'
            )
            break
          }

          case 'branch': {
            const perf = report.branch?.performance || []
            const detailLeads = report.lead?.leadDetailsTable || []
            const branchInfoRows = [
              { Field: 'Date from', Value: meta?.dateFrom ?? dateFrom },
              { Field: 'Date to', Value: meta?.dateTo ?? dateTo },
              { Field: 'Report', Value: reportType },
              {
                Field: 'Sheets',
                Value:
                  'One worksheet per branch: tab title includes the branch name; Summary on top, only that branch’s lead rows below.',
              },
            ]
            if (meta?.leadDetailsTruncated) {
              branchInfoRows.push({
                Field: 'Lead details note',
                Value: `API list capped at ${meta.leadDetailsCap ?? 15000} rows total; per-branch sheets may be incomplete. Narrow the date range for a full export.`,
              })
            }
            const sheetNamesUsed = new Set(['Report info'])
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(branchInfoRows), 'Report info')

            const leadsByNorm = new Map()
            for (const row of detailLeads) {
              const raw = String(row.branch ?? '').trim() || 'Unassigned'
              const nk = raw.toLowerCase()
              if (!leadsByNorm.has(nk)) leadsByNorm.set(nk, { displayName: raw, rows: [] })
              leadsByNorm.get(nk).rows.push(row)
            }

            const perfSorted = [...perf].sort((a, b) => sortLocale(a.name || '', b.name || ''))
            const coveredNorms = new Set()

            for (const r of perfSorted) {
              const nk = String(r.name || '').trim().toLowerCase()
              coveredNorms.add(nk)
              const bundle = leadsByNorm.get(nk)
              const rowsForBranch = bundle?.rows || []
              const sh = takeUniqueSheetName(buildAgentSheetName('Branch', [r.name]), sheetNamesUsed)
              const aoa = buildBranchCombinedSheetAoA(r, rowsForBranch, null)
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sh)
            }

            for (const [nk, bundle] of leadsByNorm) {
              if (coveredNorms.has(nk)) continue
              if (!bundle.rows.length) continue
              const sh = takeUniqueSheetName(
                buildAgentSheetName('Branch', [bundle.displayName]),
                sheetNamesUsed
              )
              const aoa = buildBranchCombinedSheetAoA(null, bundle.rows, bundle.displayName)
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sh)
            }

            if (perf.length === 0 && detailLeads.length === 0) {
              message.info('No branch data to export for this range')
              return
            }
            XLSX.writeFile(wb, `${fileBase}.xlsx`)
            {
              const n = sheetNamesUsed.size - 1
              message.success(
                `Excel downloaded (${n} branch sheet${n === 1 ? '' : 's'} plus Report info)`
              )
            }
            break
          }

          case 'repeat': {
            const rep = report.repeat || {}
            const dist = rep.distribution || []
            appendReportInfoSheet(wb)
            const summaryRows = [
              { Metric: 'Unique phones (1 lead each)', Value: rep.newCustomers ?? 0 },
              { Metric: 'Phones with multiple leads', Value: rep.repeatCustomerPhones ?? 0 },
              { Metric: 'Total lead rows (same phone)', Value: rep.repeatLeadRows ?? 0 },
            ]
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Repeat summary')
            if (dist.length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(dist.map((d) => ({ Category: d.name, Count: d.value }))),
                'Distribution'
              )
            }
            const hasData =
              (rep.newCustomers ?? 0) > 0 ||
              (rep.repeatCustomerPhones ?? 0) > 0 ||
              (rep.repeatLeadRows ?? 0) > 0
            if (!hasData) {
              message.info('No repeat-customer data to export for this range')
              return
            }
            XLSX.writeFile(wb, `${fileBase}.xlsx`)
            message.success('Excel downloaded')
            break
          }

          default:
            message.info('Export is not available for this view')
        }
      } catch (e) {
        console.error(e)
        message.error('Export failed')
      }
    },
    [report, dateFrom, dateTo, reportType, meta]
  )

  const renderReportContent = () => {
    if (isLoading && !report) {
      return (
        <div className="reports-loading-wrap">
          <Spin size="large" />
          <p className="reports-loading-text">Loading report data…</p>
        </div>
      )
    }

    if (error) {
      return (
        <Alert
          type="error"
          showIcon
          message="Failed to load reports"
          description={error?.data?.message || error?.message || 'Try again or adjust filters.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      )
    }

    if (!report) return null

    switch (reportType) {
      case 'lead': {
        const { stats, performanceTrend, sourceDistribution, detailsTable, leadDetailsTable } = report.lead || {}
        const st = stats || { totalLeads: 0, converted: 0, lost: 0, conversionRate: 0 }
        const trend = performanceTrend?.length ? performanceTrend : []
        const sources = sourceDistribution?.length ? sourceDistribution : []
        const tableRows = detailsTable?.length ? detailsTable : []
        const leadDetailRows = leadDetailsTable?.length ? leadDetailsTable : []

        return (
          <>
            <Row gutter={16} className="reports-stat-row">
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Total Leads</span>}
                    value={st.totalLeads}
                    valueStyle={{ color: 'var(--primary-color)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Converted</span>}
                    value={st.converted}
                    valueStyle={{ color: 'var(--color-success)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Lost</span>}
                    value={st.lost}
                    valueStyle={{ color: 'var(--color-danger)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Conversion Rate</span>}
                    value={st.conversionRate}
                    suffix="%"
                    valueStyle={{ color: 'var(--primary-color)' }}
                  />
                </Card>
              </Col>
            </Row>
            <p className="reports-range-hint">
              Range: {meta?.dateFrom} → {meta?.dateTo}
              {isFetching ? ' (updating…)' : ''}
            </p>
            <Row gutter={[16, 16]} className="reports-chart-row">
              <Col xs={24} lg={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Lead performance trend</span>}>
                  {trend.length === 0 ? (
                    <Empty description="No leads in this period" />
                  ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <LineChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartT.grid} />
                        <XAxis dataKey="name" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                        <YAxis stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                        <Tooltip contentStyle={chartT.tooltipContent} />
                        <Legend />
                        <Line type="monotone" dataKey="leads" stroke={chartT.primary} strokeWidth={2} name="Leads" />
                        <Line type="monotone" dataKey="converted" stroke="var(--color-success)" strokeWidth={2} name="Converted" />
                        <Line type="monotone" dataKey="lost" stroke="var(--color-danger)" strokeWidth={2} name="Lost" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Lead source distribution</span>}>
                  {sources.length === 0 ? (
                    <Empty description="No source data" />
                  ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <PieChart>
                        <Pie
                          data={sources}
                          cx="50%"
                          cy="45%"
                          labelLine={false}
                          label={false}
                          outerRadius={72}
                          dataKey="value"
                        >
                          {sources.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartT.tooltipContentPrimaryBorder} />
                        <Legend layout="vertical" align="right" verticalAlign="middle" />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                  <p className="reports-footnote" style={{ marginTop: 12, marginBottom: 0 }}>
                    Chart counts merge legacy values: Call with IVR, Add / walk-in with Walk-in, Facebook / Insta with Meta Ads.
                  </p>
                </Card>
              </Col>
            </Row>
            <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Lead report details (daily)</span>}>
              <Table
                columns={leadReportColumns}
                dataSource={tableRows}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: 'No rows for this range' }}
              />
            </Card>
            {meta?.leadDetailsTruncated && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="Lead list truncated for display and export"
                description={`Showing and exporting up to ${meta?.leadDetailsCap ?? 15000} leads for this range. Use a shorter date range to load all rows.`}
              />
            )}
            <Card
              className="mgmt-card"
              title={<span className="mgmt-card-title-text">Lead details (one row per lead — same as Excel “Lead details” sheet)</span>}
            >
              <Table
                columns={leadDetailsColumns}
                dataSource={leadDetailRows}
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '30', '50'] }}
                locale={{ emptyText: 'No leads in this date range' }}
                scroll={{ x: 1400 }}
                size={isMobile ? 'small' : 'middle'}
              />
            </Card>
          </>
        )
      }

      case 'appointment': {
        const aptStats = report.lead?.appointmentStats || {}
        const aptTable = report.lead?.appointmentDetailsTable || []
        const total = aptStats.totalAppointments ?? 0
        const completed = aptStats.completed ?? 0
        const cancelled = aptStats.cancelled ?? 0
        const rescheduled = aptStats.rescheduled ?? 0
        const otherActive = Math.max(0, total - completed - cancelled - rescheduled)
        const barData = [
          { name: 'Completed', value: completed, fill: 'var(--color-success)' },
          { name: 'Cancelled', value: cancelled, fill: 'var(--color-danger)' },
          { name: 'Rescheduled', value: rescheduled, fill: '#fa8c16' },
          { name: 'Current / Other', value: otherActive, fill: chartT.primary },
        ]
        const pieData = barData.filter((d) => d.value > 0)
        const pieSum = pieData.reduce((acc, d) => acc + d.value, 0)

        return (
          <>
            <p className="reports-range-hint" style={{ marginBottom: 16 }}>
              Appointments filtered by <strong>appointment date</strong> in range: {meta?.dateFrom} → {meta?.dateTo}
              {isFetching ? ' (updating…)' : ''}
            </p>
            <Row gutter={16} className="reports-stat-row">
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Total Appointments</span>}
                    value={total}
                    valueStyle={{ color: 'var(--primary-color)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Completed</span>}
                    value={completed}
                    valueStyle={{ color: 'var(--color-success)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Cancelled</span>}
                    value={cancelled}
                    valueStyle={{ color: 'var(--color-danger)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Rescheduled</span>}
                    value={rescheduled}
                    valueStyle={{ color: '#fa8c16' }}
                  />
                </Card>
              </Col>
            </Row>
            <Row gutter={[16, 16]} className="reports-chart-row">
              <Col xs={24} lg={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Appointment performance (by status)</span>}>
                  {total === 0 ? (
                    <Empty description="No appointments in this date range" />
                  ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartT.grid} />
                        <XAxis dataKey="name" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                        <YAxis stroke={chartT.axis} tick={{ fill: chartT.axis }} allowDecimals={false} />
                        <Tooltip contentStyle={chartT.tooltipContent} />
                        <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                          {barData.map((entry, index) => (
                            <Cell key={`apt-bar-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Status mix</span>}>
                  {total === 0 || pieData.length === 0 ? (
                    <Empty description="No data" />
                  ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <Pie
                          data={pieData}
                          cx="42%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={78}
                          paddingAngle={pieData.length > 1 ? 2 : 0}
                          dataKey="value"
                          nameKey="name"
                          label={false}
                          stroke="var(--card-bg, #1f1f1f)"
                          strokeWidth={1}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`apt-pie-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload
                            const n = d?.value ?? 0
                            const pct = pieSum > 0 ? ((n / pieSum) * 100).toFixed(1) : '0'
                            return (
                              <div style={chartT.tooltipContentPrimaryBorder}>
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>{d?.name}</div>
                                <div>
                                  {n} {n === 1 ? 'appointment' : 'appointments'} ({pct}%)
                                </div>
                              </div>
                            )
                          }}
                        />
                        <Legend
                          layout="vertical"
                          align="right"
                          verticalAlign="middle"
                          wrapperStyle={{
                            width: '52%',
                            maxWidth: 240,
                            paddingLeft: 12,
                            right: 4,
                            fontSize: 13,
                            lineHeight: 1.6,
                          }}
                          formatter={(value, entry) => {
                            const v = entry?.payload?.value ?? 0
                            const pct = pieSum > 0 ? ((v / pieSum) * 100).toFixed(1) : '0'
                            return `${value}: ${v} (${pct}%)`
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
            </Row>
            <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Appointment details</span>}>
              <Table
                columns={appointmentReportColumns}
                dataSource={aptTable}
                pagination={{ pageSize: 15 }}
                locale={{ emptyText: 'No appointments in this date range' }}
                scroll={{ x: 1020 }}
              />
            </Card>
          </>
        )
      }

      case 'agent': {
        const perf = report.agent?.performance || []
        const assignedRows = report.agent?.assignedLeadsTable || []
        const agentCallRows = report.agent?.agentCallsTable || []
        return (
          <>
            <p className="reports-range-hint" style={{ marginBottom: 16 }}>
              <strong>Assigned leads</strong> are leads created in range with an assignee. <strong>Calls by agent</strong> are Ozonetel logs in range with an agent name. Range: {meta?.dateFrom} → {meta?.dateTo}
              {isFetching ? ' (updating…)' : ''}
            </p>
            <Card className="mgmt-card reports-chart-card" title={<span className="mgmt-card-title-text">Summary chart (Excel: one tab per agent — Summary, then leads, then calls on the same sheet)</span>}>
              {perf.length === 0 ? (
                <Empty description="No assigned-lead aggregates in this period (chart uses assigned leads only)" />
              ) : (
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <BarChart data={perf}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartT.grid} />
                    <XAxis dataKey="name" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                    <YAxis stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                    <Tooltip contentStyle={chartT.tooltipContent} />
                    <Legend />
                    <Bar dataKey="leads" fill={chartT.primary} name="Leads" />
                    <Bar dataKey="calls" fill="#25D366" name="Calls" />
                    <Bar dataKey="converted" fill="var(--color-success)" name="Converted" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            {meta?.agentAssignedLeadsTruncated && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 16 }}
                message="Assigned leads list truncated"
                description={`Showing up to ${meta?.agentDetailCap ?? 15000} rows. Narrow the date range to load more.`}
              />
            )}
            <Card
              className="mgmt-card"
              style={{ marginTop: 16 }}
              title={<span className="mgmt-card-title-text">Leads by agent (Excel: same tab as summary + calls, middle section)</span>}
            >
              <Table
                columns={agentAssignedLeadsColumns}
                dataSource={assignedRows}
                rowKey="key"
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '30', '50'] }}
                locale={{ emptyText: 'No assigned leads in this date range' }}
                scroll={{ x: 1200 }}
                size={isMobile ? 'small' : 'middle'}
              />
            </Card>
            {meta?.agentCallsByAgentTruncated && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 16 }}
                message="Calls-by-agent list truncated"
                description={`Showing up to ${meta?.agentDetailCap ?? 15000} rows. Narrow the date range to load more.`}
              />
            )}
            <Card
              className="mgmt-card"
              style={{ marginTop: 16 }}
              title={<span className="mgmt-card-title-text">Calls by agent (Excel: same tab as summary + leads, bottom section)</span>}
            >
              <Table
                columns={agentCallsReportColumns}
                dataSource={agentCallRows}
                rowKey="key"
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '30', '50'] }}
                locale={{ emptyText: 'No calls with an agent name in this date range' }}
                scroll={{ x: 1600 }}
                size={isMobile ? 'small' : 'middle'}
              />
            </Card>
          </>
        )
      }

      case 'call': {
        const { summary, totalCalls, answered, missed, callDetailsTable: callDetailRows = [] } = report.call || {}
        const pieData = (summary || []).filter((x) => x.value > 0)
        const pieSum = pieData.reduce((a, x) => a + (x.value || 0), 0)
        return (
          <>
            <Row gutter={[16, 16]} className="reports-chart-row">
              <Col span={24}>
                <p className="reports-range-hint" style={{ marginBottom: 0 }}>
                  Calls with <strong>start time</strong> in range: {meta?.dateFrom} → {meta?.dateTo}
                  {isFetching ? ' (updating…)' : ''}
                </p>
              </Col>
              <Col xs={24} lg={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Call summary (type and status)</span>}>
                  {pieData.length === 0 ? (
                    <Empty description="No calls in this period for the selected scope" />
                  ) : (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          outerRadius={80}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={chartT.tooltipContent}
                          formatter={(value, _name, props) => {
                            const v = Number(value) || 0
                            const pct = pieSum > 0 ? ((v / pieSum) * 100).toFixed(1) : '0'
                            return [`${v} (${pct}%)`, props?.payload?.name || 'Count']
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card className="mgmt-card reports-call-stats-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Total calls</span>}
                    value={totalCalls ?? 0}
                    valueStyle={{ color: 'var(--primary-color)' }}
                  />
                  <div className="reports-stat-stack">
                    <Statistic
                      title={<span className="mgmt-stat-title">Answered</span>}
                      value={answered ?? 0}
                      valueStyle={{ color: 'var(--color-success)' }}
                    />
                  </div>
                  <div className="reports-stat-stack">
                    <Statistic
                      title={<span className="mgmt-stat-title">Missed</span>}
                      value={missed ?? 0}
                      valueStyle={{ color: 'var(--color-danger)' }}
                    />
                  </div>
                </Card>
              </Col>
            </Row>
            {meta?.callDetailsTruncated && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 16 }}
                message="Call list truncated"
                description={`Table and export show up to ${meta?.callDetailsCap ?? 15000} calls. Narrow the date range to load more.`}
              />
            )}
            <Card
              className="mgmt-card"
              style={{ marginTop: 16 }}
              title={<span className="mgmt-card-title-text">Call details (one row per call — same as Excel “Call details” sheet)</span>}
            >
              <Table
                columns={callDetailsColumns}
                dataSource={callDetailRows}
                rowKey="key"
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '30', '50'] }}
                locale={{ emptyText: 'No calls in this date range' }}
                scroll={{ x: 1600 }}
                size={isMobile ? 'small' : 'middle'}
              />
            </Card>
          </>
        )
      }

      case 'branch': {
        const perf = report.branch?.performance || []
        const branchLeadDetails = report.lead?.leadDetailsTable || []
        const perfChart = perf.map((p) => ({
          ...p,
          converted: p.converted ?? 0,
          lost: p.lost ?? 0,
        }))
        return (
          <>
            <p className="reports-range-hint" style={{ marginBottom: 16 }}>
              Leads are counted by <strong>created date</strong> in range and current branch filters. Summary is grouped by lead branch;
              detail rows list every lead (same data as Lead report details).
              {isFetching ? ' (updating…)' : ''}
            </p>
            {meta?.leadDetailsTruncated && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="Lead details list truncated"
                description={`Showing up to ${meta?.leadDetailsCap ?? 15000} rows. Narrow the date range to load more.`}
              />
            )}
            <Card className="mgmt-card reports-chart-card" title={<span className="mgmt-card-title-text">Branch comparison (chart)</span>}>
              {perf.length === 0 ? (
                <Empty description="No branch data for this period" />
              ) : (
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <BarChart data={perfChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartT.grid} />
                    <XAxis dataKey="name" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                    <YAxis stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                    <Tooltip contentStyle={chartT.tooltipContent} />
                    <Legend />
                    <Bar dataKey="leads" fill={chartT.primary} name="Leads" />
                    <Bar dataKey="converted" fill="var(--color-success)" name="Converted" />
                    <Bar dataKey="lost" fill="#ff7875" name="Lost" />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="reports-footnote" style={{ marginTop: 12 }}>
                Revenue index (in the table below) = converted leads × 5,000 (placeholder until revenue is tracked per branch).
              </p>
            </Card>
            <Card
              className="mgmt-card"
              style={{ marginTop: 16 }}
              title={<span className="mgmt-card-title-text">Branch summary</span>}
            >
              {perf.length === 0 ? (
                <Empty description="No branch aggregates" />
              ) : (
                <Table
                  columns={branchPerformanceColumns}
                  dataSource={perf.map((r, i) => ({ ...r, key: String(i) }))}
                  pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '30', '50'] }}
                  scroll={{ x: 900 }}
                  size={isMobile ? 'small' : 'middle'}
                />
              )}
            </Card>
            <Card className="mgmt-card" style={{ marginTop: 16 }} title={<span className="mgmt-card-title-text">Lead details (by branch)</span>}>
              <Table
                columns={leadDetailsColumns}
                dataSource={branchLeadDetails}
                rowKey="key"
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '30', '50'] }}
                locale={{ emptyText: 'No leads in this date range' }}
                scroll={{ x: 1400 }}
                size={isMobile ? 'small' : 'middle'}
              />
            </Card>
          </>
        )
      }

      case 'repeat': {
        const rep = report.repeat || {}
        const dist = rep.distribution || []
        const pieData = dist.filter((d) => d.value > 0)
        return (
          <Row gutter={[16, 16]} className="reports-chart-row">
            <Col xs={24} lg={12}>
              <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Leads by phone (in range)</span>}>
                {pieData.length === 0 ? (
                  <Empty description="No phone data in this period" />
                ) : (
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={false}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartT.tooltipContent} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card className="mgmt-card reports-call-stats-card">
                <Statistic
                  title={<span className="mgmt-stat-title">Unique phones (1 lead each)</span>}
                  value={rep.newCustomers ?? 0}
                  valueStyle={{ color: 'var(--primary-color)' }}
                />
                <div className="reports-stat-stack">
                  <Statistic
                    title={<span className="mgmt-stat-title">Phones with multiple leads</span>}
                    value={rep.repeatCustomerPhones ?? 0}
                    valueStyle={{ color: 'var(--color-success)' }}
                  />
                </div>
                <div className="reports-stat-stack">
                  <Statistic
                    title={<span className="mgmt-stat-title">Total lead rows (multi-phone)</span>}
                    value={rep.repeatLeadRows ?? 0}
                    valueStyle={{ color: 'var(--text-secondary)' }}
                  />
                </div>
              </Card>
            </Col>
          </Row>
        )
      }

      default:
        return null
    }
  }

  return (
    <PageLayout className="mgmt-page reports-page">
      <PageHeader
        title="Reports & Analytics"
        extra={
          <Space wrap>
            {showBranchDropdown && (
              <Select
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                value={selectedBranchIds}
                onChange={setSelectedBranchIds}
                className="ds-report-toolbar-select"
                size={isMobile ? 'small' : 'middle'}
                placeholder="Branches (all if empty)"
                style={{ minWidth: isMobile ? 160 : 220 }}
              >
                {branches.map((b) => (
                  <Option key={b._id} value={b._id}>
                    {b.name}
                  </Option>
                ))}
              </Select>
            )}
            <Select
              value={reportType}
              onChange={setReportType}
              className="ds-report-toolbar-select"
              size={isMobile ? 'small' : 'middle'}
              style={{ minWidth: 200 }}
            >
              <Option value="lead">Lead performance</Option>
              <Option value="appointment">Appointment performance</Option>
              <Option value="agent">Agent performance</Option>
              <Option value="call">Call summary</Option>
              <Option value="branch">Branch performance</Option>
              <Option value="repeat">Repeat customer stats</Option>
            </Select>
            <Button
              icon={showFilters ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setShowFilters(!showFilters)}
              size={isMobile ? 'small' : 'middle'}
            >
              {showFilters ? 'Hide filters' : 'Show filters'}
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              onClick={() => handleExport('excel')}
              size={isMobile ? 'small' : 'middle'}
            >
              {isMobile ? 'Excel' : 'Export Excel'}
            </Button>
            <Button
              icon={<FilePdfOutlined />}
              onClick={() => handleExport('pdf')}
              size={isMobile ? 'small' : 'middle'}
            >
              {isMobile ? 'PDF' : 'Export PDF'}
            </Button>
          </Space>
        }
      />

      {showFilters && (
        <ContentCard staggerIndex={0} compact>
          <div className="ds-filters-row ds-filters-row--responsive">
            <RangePicker
              className="ds-filter-grow"
              value={rangeValue}
              onChange={(v) => setRangeValue(v || [])}
              allowClear={false}
            />
            <Button type="primary" icon={<DownloadOutlined />} onClick={handleGenerateReport} loading={isFetching}>
              Generate report
            </Button>
          </div>
        </ContentCard>
      )}

      {renderReportContent()}
    </PageLayout>
  )
}

export default Reports
