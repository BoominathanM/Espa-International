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
import './reports-page.css'

const { RangePicker } = DatePicker
const { Option } = Select

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

const appointmentReportColumns = [
  { title: 'S.No.', dataIndex: 'sno', key: 'sno', width: 60 },
  { title: 'Date', dataIndex: 'date', key: 'date', width: 110 },
  { title: 'Customer', dataIndex: 'customer', key: 'customer', ellipsis: true },
  { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 120 },
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

const Reports = () => {
  const { isMobile } = useResponsive()
  const [reportType, setReportType] = useState('lead')
  const [selectedBranch, setSelectedBranch] = useState('all')
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
      branch: selectedBranch === 'all' ? undefined : selectedBranch,
      dateFrom,
      dateTo,
    }),
    [selectedBranch, dateFrom, dateTo]
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
      if (format === 'excel') {
        try {
          const wb = XLSX.utils.book_new()
          const leadRows = report.lead?.detailsTable || []
          const aptRows = report.lead?.appointmentDetailsTable || []

          if (reportType === 'appointment') {
            if (aptRows.length === 0) {
              message.info('No appointment rows to export for this range')
              return
            }
            const wsApt = XLSX.utils.json_to_sheet(
              aptRows.map((r) => ({
                'S.No.': r.sno,
                Date: r.date,
                Customer: r.customer,
                Phone: r.phone,
                Status: r.status,
                Slot: r.slot,
                Package: r.package,
                Branch: r.branch,
                'Assigned To': r.assignedTo,
              }))
            )
            XLSX.utils.book_append_sheet(wb, wsApt, 'Appointment details')
            XLSX.writeFile(wb, `report_appointments_${dateFrom}_${dateTo}.xlsx`)
            message.success('Excel downloaded')
            return
          }

          if (leadRows.length > 0) {
            const wsLead = XLSX.utils.json_to_sheet(
              leadRows.map((r) => ({
                Date: r.date,
                'Total Leads': r.total,
                Converted: r.converted,
                Lost: r.lost,
                'Conversion Rate %': r.rate,
              }))
            )
            XLSX.utils.book_append_sheet(wb, wsLead, 'Lead report')
          }
          if (aptRows.length > 0) {
            const wsApt = XLSX.utils.json_to_sheet(
              aptRows.map((r) => ({
                'S.No.': r.sno,
                Date: r.date,
                Customer: r.customer,
                Phone: r.phone,
                Status: r.status,
                Slot: r.slot,
                Package: r.package,
                Branch: r.branch,
                'Assigned To': r.assignedTo,
              }))
            )
            XLSX.utils.book_append_sheet(wb, wsApt, 'Appointments')
          }
          if (leadRows.length === 0 && aptRows.length === 0) {
            message.info('No tabular data to export for this range')
            return
          }
          XLSX.writeFile(wb, `report_${dateFrom}_${dateTo}.xlsx`)
          message.success('Excel downloaded')
        } catch (e) {
          message.error('Export failed')
        }
      } else {
        message.info('PDF export coming soon — use Excel for now')
      }
    },
    [report, dateFrom, dateTo, reportType]
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
        const { stats, performanceTrend, sourceDistribution, detailsTable } = report.lead || {}
        const st = stats || { totalLeads: 0, converted: 0, lost: 0, conversionRate: 0 }
        const trend = performanceTrend?.length ? performanceTrend : []
        const sources = sourceDistribution?.length ? sourceDistribution : []
        const tableRows = detailsTable?.length ? detailsTable : []

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
                scroll={{ x: 900 }}
              />
            </Card>
          </>
        )
      }

      case 'agent': {
        const perf = report.agent?.performance || []
        return (
          <Card className="mgmt-card reports-chart-card" title={<span className="mgmt-card-title-text">Agent performance</span>}>
            {perf.length === 0 ? (
              <Empty description="No assigned leads in this period" />
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
        )
      }

      case 'call': {
        const { summary, totalCalls, answered, missed } = report.call || {}
        const pieData = (summary || []).filter((x) => x.value > 0)
        return (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Call summary</span>}>
                {pieData.length === 0 ? (
                  <Empty description="No calls in this period for the selected scope" />
                ) : (
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartT.tooltipContent} />
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
        )
      }

      case 'branch': {
        const perf = report.branch?.performance || []
        return (
          <Card className="mgmt-card reports-chart-card" title={<span className="mgmt-card-title-text">Branch performance</span>}>
            {perf.length === 0 ? (
              <Empty description="No branch data for this period" />
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={perf}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartT.grid} />
                  <XAxis dataKey="name" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                  <YAxis yAxisId="left" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                  <YAxis yAxisId="right" orientation="right" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                  <Tooltip contentStyle={chartT.tooltipContent} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="leads" fill={chartT.primary} name="Leads" />
                  <Bar yAxisId="right" dataKey="revenue" fill="var(--color-success)" name="Revenue index (₹)" />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="reports-footnote">Revenue index = converted leads × 5,000 (placeholder until revenue is tracked).</p>
          </Card>
        )
      }

      case 'repeat': {
        const rep = report.repeat || {}
        const dist = rep.distribution || []
        const pieData = dist.filter((d) => d.value > 0)
        return (
          <Row gutter={[16, 16]}>
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
                value={selectedBranch}
                onChange={(v) => setSelectedBranch(v || 'all')}
                className="ds-report-toolbar-select"
                size={isMobile ? 'small' : 'middle'}
                placeholder="Branch"
                style={{ minWidth: 160 }}
              >
                <Option value="all">All branches</Option>
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
