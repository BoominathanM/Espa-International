import React, { useState, useMemo } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Select, Space, DatePicker, Spin, Empty } from 'antd'
import {
  UserAddOutlined,
  PhoneOutlined,
  TeamOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useResponsive } from '../../hooks/useResponsive'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import { useGetDashboardQuery } from '../../store/api/dashboardApi'
import { isSuperAdmin, isAdmin, isSupervisor } from '../../utils/permissions'
import dayjs from 'dayjs'
import AnimatedWrapper from '../../components/AnimatedWrapper'
import MotionButton from '../../components/MotionButton'
import { PageLayout, PageHeader } from '../../components/ds-layout'
import './dashboard-page.css'

const { Option } = Select

const SOURCE_TAG = {
  IVR: 'gold',
  WhatsApp: 'green',
  Facebook: 'blue',
  Insta: 'magenta',
  Website: 'purple',
  'Walk-in': 'gold',
  'Meta Ads': 'blue',
  Import: 'default',
  Other: 'default',
}

const STATUS_TAG = {
  New: 'blue',
  'In Progress': 'orange',
  'Follow-Up': 'purple',
  Converted: 'green',
  Lost: 'red',
}

const Dashboard = () => {
  const { isMobile, isTablet, isSmallLaptop, isDesktop } = useResponsive()
  const navigate = useNavigate()
  const [selectedBranchIds, setSelectedBranchIds] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)

  const showBranchDropdown = isSuperAdmin() || isAdmin() || isSupervisor()

  const dateParam = selectedDate ? selectedDate.format('YYYY-MM-DD') : undefined
  const branchParam = selectedBranchIds.length ? selectedBranchIds : undefined

  const { data: branchesData } = useGetBranchesQuery(undefined, { skip: !showBranchDropdown })
  const { data: dashboardResponse, isLoading: dashboardLoading, isError: dashboardError } = useGetDashboardQuery(
    { branch: branchParam, date: dateParam },
    { refetchOnMountOrArgChange: true }
  )

  const dashboard = dashboardResponse?.dashboard
  const stats = dashboard?.stats ?? {}
  const leadTrendData = dashboard?.leadTrend ?? []
  const sourceData = dashboard?.sourceDistribution ?? []
  const branchData = dashboard?.branchActivity ?? []
  const agentPerformanceData = dashboard?.agentPerformance ?? []
  const topAgentsData = dashboard?.topAgents ?? []
  const liveAgents = dashboard?.liveAgents ?? []
  const alerts = dashboard?.alerts ?? [{ type: 'info', message: 'No pending alerts' }]

  const allRecentLeads = useMemo(() => (dashboard?.recentLeads ?? []).map((l) => ({ ...l, date: l.date ? dayjs(l.date) : null })), [dashboard?.recentLeads])
  const recentLeads = useMemo(() => {
    if (!selectedDate) return allRecentLeads
    return allRecentLeads.filter((lead) => lead.date && lead.date.isSame(selectedDate, 'day'))
  }, [selectedDate, allRecentLeads])

  const getChartHeight = () => {
    if (isMobile || isTablet) return 250
    if (isSmallLaptop || isDesktop) return 280
    return 300
  }

  const chartHeight = getChartHeight()

  const topAgentsColumns = [
    { title: 'Agent', dataIndex: 'agent', key: 'agent' },
    { title: 'Branch', dataIndex: 'branch', key: 'branch' },
    { title: 'Leads', dataIndex: 'leads', key: 'leads', sorter: (a, b) => a.leads - b.leads },
    { title: 'Calls', dataIndex: 'calls', key: 'calls', sorter: (a, b) => a.calls - b.calls },
    { title: 'Converted', dataIndex: 'converted', key: 'converted', sorter: (a, b) => a.converted - b.converted },
    {
      title: 'Conversion Rate',
      dataIndex: 'conversionRate',
      key: 'conversionRate',
      render: (rate) => <Tag color="green">{rate}</Tag>,
    },
  ]

  const branchOptions = useMemo(() => {
    const list = branchesData?.branches ?? []
    return list.map((b) => ({ value: b._id || b.id, label: b.name }))
  }, [branchesData])

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }) },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', sorter: (a, b) => String(a.mobile || '').localeCompare(String(b.mobile || ''), undefined, { sensitivity: 'base' }) },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (source) => <Tag color={SOURCE_TAG[source]}>{source}</Tag>,
      sorter: (a, b) => String(a.source || '').localeCompare(String(b.source || ''), undefined, { sensitivity: 'base' }),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color={STATUS_TAG[status]}>{status}</Tag>,
      sorter: (a, b) => String(a.status || '').localeCompare(String(b.status || ''), undefined, { sensitivity: 'base' }),
    },
    { title: 'Branch', dataIndex: 'branch', key: 'branch', sorter: (a, b) => String(a.branch || '').localeCompare(String(b.branch || ''), undefined, { sensitivity: 'base' }) },
    { title: 'Agent', dataIndex: 'agent', key: 'agent', sorter: (a, b) => String(a.agent || '').localeCompare(String(b.agent || ''), undefined, { sensitivity: 'base' }) },
  ]

  if (dashboardError) {
    return (
      <PageLayout className="dashboard-page">
        <PageHeader title="Dashboard" />
        <Card className="dashboard-card">
          <Empty description="Failed to load dashboard. Please try again." />
        </Card>
      </PageLayout>
    )
  }

  const todayLeads = stats.todayLeads ?? 0
  const callsReceived = stats.callsReceived ?? 0
  const callsMissed = stats.callsMissed ?? 0
  const totalAgents = stats.totalAgents ?? 0
  const frontOfficeAgents = stats.frontOfficeAgents ?? 0
  const offlineAgents = stats.offlineAgents ?? 0
  const appointmentsToday = stats.appointmentsToday ?? 0
  const liveAgentsCount = stats.liveAgentsCount ?? 0

  const liveAgentColumns = [
    {
      title: 'Agent',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
     
      ellipsis: true,
      sorter: (a, b) =>
        String(a.email || '').localeCompare(String(b.email || ''), undefined, { sensitivity: 'base' }),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      
      sorter: (a, b) =>
        String(a.role || '').localeCompare(String(b.role || ''), undefined, { sensitivity: 'base' }),
    },
    {
      title: 'Actions',
      dataIndex: 'actions',
      key: 'actions',
      
      sorter: (a, b) => (Number(a.actions) || 0) - (Number(b.actions) || 0),
    },
    {
      title: 'Last activity',
      dataIndex: 'lastActionAt',
      key: 'lastActionAt',
      width: 190,
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
      sorter: (a, b) => dayjs(a.lastActionAt || 0).valueOf() - dayjs(b.lastActionAt || 0).valueOf(),
    },
  ]

  return (
    <PageLayout className="dashboard-page">
      <PageHeader
        title="Dashboard"
        extra={
          showBranchDropdown ? (
            <Space wrap className="dashboard-toolbar">
              <MotionButton type="primary" size={isMobile ? 'small' : 'middle'} onClick={() => navigate('/leads')}>
                View leads
              </MotionButton>
              <Select
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                value={selectedBranchIds}
                onChange={setSelectedBranchIds}
                className="dashboard-field"
                size={isMobile ? 'small' : 'middle'}
                loading={!branchesData}
                placeholder="Branches (all if empty)"
                style={{ minWidth: isMobile ? 160 : 220 }}
              >
                {branchOptions.map((opt) => (
                  <Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Option>
                ))}
              </Select>
              <DatePicker
                value={selectedDate}
                onChange={(date) => setSelectedDate(date || null)}
                allowClear
                className="dashboard-field"
                size={isMobile ? 'small' : 'middle'}
                format="YYYY-MM-DD"
                placeholder="Select Date"
              />
            </Space>
          ) : null
        }
      />

      {dashboardLoading ? (
        <div className="dashboard-loading">
          <Spin size="large" tip="Loading dashboard..." />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]} className="dashboard-row">
            {alerts.map((alert, index) => (
              <Col xs={24} sm={24} md={8} key={index}>
                <Card className={`dashboard-card dashboard-alert--${alert.type}`}>
                  <p className="dashboard-alert">{alert.message}</p>
                </Card>
              </Col>
            ))}
          </Row>

          <AnimatedWrapper variant="fadeUp">
            <Row gutter={[16, 16]} className="dashboard-row dashboard-stats-row">
              <Col xs={24} sm={12} md={8}>
                <Card hoverable onClick={() => navigate('/leads')} className="dashboard-card dashboard-card--interactive">
                  <Statistic
                    title={<span className="dashboard-stat-title">Today&apos;s Leads</span>}
                    value={todayLeads}
                    prefix={<UserAddOutlined className="dashboard-stat-prefix" />}
                    suffix={todayLeads > 0 ? <ArrowUpOutlined className="dashboard-stat-suffix-success" /> : null}
                  />
                  <div className="dashboard-stat-spacer" />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card hoverable onClick={() => navigate('/calls')} className="dashboard-card dashboard-card--interactive">
                  <Statistic
                    title={<span className="dashboard-stat-title">Calls Received</span>}
                    value={callsReceived}
                    prefix={<PhoneOutlined className="dashboard-stat-prefix" />}
                  />
                  <div className="dashboard-stat-meta dashboard-stat-meta--danger">
                    {callsMissed} missed
                  </div>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card className="dashboard-card dashboard-card--interactive dashboard-card--stat-green">
                  <Statistic
                    title={<span className="dashboard-stat-title">Active Agents</span>}
                    value={totalAgents}
                    prefix={<TeamOutlined />}
                  />
                  <div className="dashboard-stat-spacer" />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card className="dashboard-card dashboard-card--interactive">
                  <Statistic
                    title={<span className="dashboard-stat-title">Front Office</span>}
                    value={frontOfficeAgents}
                    prefix={<UserOutlined />}
                  />
                  <div className="dashboard-stat-meta dashboard-stat-meta--muted">Active</div>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card hoverable onClick={() => navigate('/appointment-bookings')} className="dashboard-card dashboard-card--interactive dashboard-card--stat-green">
                  <Statistic
                    title={<span className="dashboard-stat-title">Appointments</span>}
                    value={appointmentsToday}
                    prefix={<CalendarOutlined />}
                  />
                  <div className="dashboard-stat-meta dashboard-stat-meta--muted">Today</div>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card className="dashboard-card dashboard-card--interactive">
                  <Statistic
                    title={<span className="dashboard-stat-title">Live Agents</span>}
                    value={liveAgentsCount}
                    prefix={<TeamOutlined />}
                  />
                  <div className="dashboard-stat-meta dashboard-stat-meta--muted">Last 30 mins (lead create/edit)</div>
                </Card>
              </Col>
            </Row>
          </AnimatedWrapper>

          <Row gutter={[16, 16]} className="dashboard-row">
            <Col xs={24} lg={12}>
              <Card
                title={<span className="dashboard-card-title">Lead Trend (Last 7 Days)</span>}
                className="dashboard-card dashboard-card--chart"
              >
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <LineChart data={leadTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leads" stroke="var(--primary-color)" strokeWidth={2} name="Leads" />
                <Line type="monotone" dataKey="calls" stroke="var(--chart-bar-secondary)" strokeWidth={2} name="Calls" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                title={<span className="dashboard-card-title">Lead Source Distribution</span>}
                className="dashboard-card dashboard-card--chart dashboard-card--pie"
              >
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="45%"
                      innerRadius={0}
                      outerRadius={70}
                      paddingAngle={1}
                      dataKey="value"
                      nameKey="name"
                      label={false}
                      labelLine={false}
                    >
                      {sourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fillVar ? `var(${entry.fillVar})` : 'var(--primary-color)'} name={entry.name} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, props) => [
                        `${value} (${props.payload?.percent != null ? (props.payload.percent * 100).toFixed(1) : '0'}%)`,
                        name,
                      ]}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ paddingLeft: 16 }}
                      formatter={(value, entry) => {
                        const item = sourceData.find((d) => d.name === value)
                        const total = sourceData.reduce((s, d) => s + d.value, 0)
                        const pct = total > 0 && item ? ((item.value / total) * 100).toFixed(1) : '0'
                        return `${value} (${pct}%)`
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} className="dashboard-row">
            <Col xs={24} lg={12}>
              <Card title={<span className="dashboard-card-title">Branch Activity</span>} className="dashboard-card dashboard-card--chart">
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <BarChart data={branchData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="leads" fill="var(--primary-color)" name="Leads" />
                    <Bar dataKey="calls" fill="var(--chart-bar-secondary)" name="Calls" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title={<span className="dashboard-card-title">Recent Leads</span>} className="dashboard-card dashboard-card--chart dashboard-card--table">
                <div className="dashboard-table-wrap">
                  <Table
                    dataSource={recentLeads}
                    columns={columns}
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content', y: chartHeight }}
                    onRow={(record) => ({
                      onClick: () => record.key && navigate(`/leads/${record.key}`),
                      style: { cursor: record.key ? 'pointer' : 'default' },
                    })}
                  />
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} className="dashboard-row">
            <Col xs={24} lg={12}>
              <Card title={<span className="dashboard-card-title">Agent Performance</span>} className="dashboard-card dashboard-card--chart">
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <BarChart data={agentPerformanceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="leads" fill="var(--primary-color)" name="Leads" />
                    <Bar dataKey="calls" fill="var(--chart-bar-secondary)" name="Calls" />
                    <Bar dataKey="converted" fill="var(--chart-bar-tertiary)" name="Converted" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title={<span className="dashboard-card-title">Top Agents</span>} className="dashboard-card dashboard-card--chart dashboard-card--table">
                <div className="dashboard-table-wrap">
                  <Table
                    dataSource={topAgentsData}
                    columns={topAgentsColumns}
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content', y: chartHeight }}
                  />
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} className="dashboard-row">
            <Col span={24}>
              <Card
                title={<span className="dashboard-card-title">Live Agents (last 30 mins)</span>}
                className="dashboard-card dashboard-card--chart dashboard-card--table"
              >
                <div className="dashboard-table-wrap">
                  <Table
                    dataSource={liveAgents}
                    columns={liveAgentColumns}
                    rowKey="key"
                    pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'No lead create/edit activity in the last 30 minutes' }}
                  />
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </PageLayout>
  )
}

export default Dashboard
