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
          const rows = report.lead?.detailsTable || []
          if (rows.length === 0) {
            message.info('No tabular data to export for this range')
            return
          }
          const ws = XLSX.utils.json_to_sheet(
            rows.map((r) => ({
              Date: r.date,
              'Total Leads': r.total,
              Converted: r.converted,
              Lost: r.lost,
              'Conversion Rate %': r.rate,
            }))
          )
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Lead report')
          XLSX.writeFile(wb, `report_leads_${dateFrom}_${dateTo}.xlsx`)
          message.success('Excel downloaded')
        } catch (e) {
          message.error('Export failed')
        }
      } else {
        message.info('PDF export coming soon — use Excel for now')
      }
    },
    [report, dateFrom, dateTo]
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
              style={{ minWidth: 180 }}
            >
              <Option value="lead">Lead performance</Option>
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
