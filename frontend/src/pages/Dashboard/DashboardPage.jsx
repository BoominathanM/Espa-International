import React, { useState, useMemo } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Select, Space, DatePicker } from 'antd'
import {
  UserAddOutlined,
  PhoneOutlined,
  TeamOutlined,
  ArrowUpOutlined,
  CloseCircleOutlined,
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
import { getBranchOptions } from '../../utils/branches'
import { isSuperAdmin, isAdmin, isSupervisor } from '../../utils/permissions'
import dayjs from 'dayjs'
import AnimatedWrapper from '../../components/AnimatedWrapper'
import MotionButton from '../../components/MotionButton'
import './dashboard-page.css'

const { Option } = Select

const SOURCE_TAG = {
  Call: 'gold',
  WhatsApp: 'green',
  Facebook: 'blue',
  Insta: 'magenta',
  Website: 'purple',
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
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedDate, setSelectedDate] = useState(null)

  const showBranchDropdown = isSuperAdmin() || isAdmin() || isSupervisor()

  const getChartHeight = () => {
    if (isMobile || isTablet) return 250
    if (isSmallLaptop || isDesktop) return 280
    return 300
  }

  const chartHeight = getChartHeight()

  const todayLeads = 45
  const callsReceived = 120
  const callsMissed = 8
  const onlineAgents = 12
  const offlineAgents = 3

  const leadTrendData = [
    { name: 'Mon', leads: 40, calls: 100 },
    { name: 'Tue', leads: 45, calls: 110 },
    { name: 'Wed', leads: 50, calls: 120 },
    { name: 'Thu', leads: 42, calls: 105 },
    { name: 'Fri', leads: 48, calls: 115 },
    { name: 'Sat', leads: 35, calls: 90 },
    { name: 'Sun', leads: 30, calls: 80 },
  ]

  const sourceData = [
    { name: 'Call', value: 30, fillVar: '--chart-pie-call' },
    { name: 'WhatsApp', value: 25, fillVar: '--chart-pie-wa' },
    { name: 'Facebook', value: 20, fillVar: '--chart-pie-fb' },
    { name: 'Insta', value: 18, fillVar: '--chart-pie-insta' },
    { name: 'Website', value: 10, fillVar: '--chart-pie-web' },
  ]

  const branchData = [
    { name: 'Branch 1', leads: 120, calls: 350 },
    { name: 'Branch 2', leads: 95, calls: 280 },
    { name: 'Branch 3', leads: 80, calls: 220 },
    { name: 'Branch 4', leads: 65, calls: 180 },
  ]

  const agentPerformanceData = [
    { name: 'Agent A', leads: 45, calls: 120, converted: 15 },
    { name: 'Agent B', leads: 38, calls: 110, converted: 12 },
    { name: 'Agent C', leads: 42, calls: 105, converted: 14 },
    { name: 'Agent D', leads: 35, calls: 95, converted: 10 },
    { name: 'Agent E', leads: 30, calls: 85, converted: 8 },
  ]

  const topAgentsData = [
    { key: '1', agent: 'Agent A', branch: 'Branch 1', leads: 45, calls: 120, converted: 15, conversionRate: '33.3%' },
    { key: '2', agent: 'Agent B', branch: 'Branch 2', leads: 38, calls: 110, converted: 12, conversionRate: '31.6%' },
    { key: '3', agent: 'Agent C', branch: 'Branch 1', leads: 42, calls: 105, converted: 14, conversionRate: '33.3%' },
    { key: '4', agent: 'Agent D', branch: 'Branch 3', leads: 35, calls: 95, converted: 10, conversionRate: '28.6%' },
    { key: '5', agent: 'Agent E', branch: 'Branch 2', leads: 30, calls: 85, converted: 8, conversionRate: '26.7%' },
  ]

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

  const allRecentLeads = [
    { key: '1', name: 'John Doe', mobile: '+91 9876543210', source: 'Call', status: 'New', branch: 'Branch 1', agent: 'Agent A', date: dayjs().subtract(1, 'day') },
    { key: '2', name: 'Jane Smith', mobile: '+91 9876543211', source: 'WhatsApp', status: 'In Progress', branch: 'Branch 2', agent: 'Agent B', date: dayjs() },
    { key: '3', name: 'Sarah Williams', mobile: '+91 9876543213', source: 'Insta', status: 'New', branch: 'Branch 2', agent: 'Agent D', date: dayjs().subtract(2, 'day') },
    { key: '4', name: 'David Brown', mobile: '+91 9876543214', source: 'Facebook', status: 'Converted', branch: 'Branch 1', agent: 'Agent A', date: dayjs() },
  ]

  const recentLeads = useMemo(() => {
    if (!selectedDate) return allRecentLeads
    return allRecentLeads.filter((lead) => lead.date && lead.date.isSame(selectedDate, 'day'))
  }, [selectedDate])

  const alerts = [
    { type: 'error', message: '8 missed calls need attention' },
    { type: 'warning', message: '5 unassigned leads' },
    { type: 'info', message: 'Chatbot captured leads need follow-up' },
  ]

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile' },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (source) => <Tag color={SOURCE_TAG[source]}>{source}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color={STATUS_TAG[status]}>{status}</Tag>,
    },
    { title: 'Branch', dataIndex: 'branch', key: 'branch' },
    { title: 'Agent', dataIndex: 'agent', key: 'agent' },
  ]

  const headerClass = isMobile ? 'dashboard-header dashboard-header--stack' : 'dashboard-header'

  return (
    <div
      className="dashboard-page"
      style={{ '--dashboard-chart-h': `${chartHeight}px` }}
    >
      <div className={headerClass}>
        <h1 className="dashboard-title">Dashboard</h1>
        {showBranchDropdown && (
          <Space wrap className="dashboard-toolbar">
            <MotionButton type="primary" size={isMobile ? 'small' : 'middle'} onClick={() => navigate('/leads')}>
              View leads
            </MotionButton>
            <Select
              value={selectedBranch}
              onChange={(value) => setSelectedBranch(value || 'all')}
              allowClear={selectedBranch !== 'all'}
              clearIcon={<CloseCircleOutlined className="dashboard-select-clear" />}
              className="dashboard-field"
              size={isMobile ? 'small' : 'middle'}
            >
              {getBranchOptions().map((branch) => (
                <Option key={branch.value} value={branch.value}>
                  {branch.label}
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
        )}
      </div>

      <Row gutter={[16, 16]} className="dashboard-row">
        {alerts.map((alert, index) => (
          <Col xs={24} sm={24} md={8} key={index}>
            <Card className={`dashboard-card dashboard-alert--${alert.type}`}>
              <p className={`dashboard-alert `}>{alert.message}</p>
            </Card>
          </Col>
        ))}
      </Row>

      <AnimatedWrapper variant="fadeUp">
        <Row gutter={[16, 16]} className="dashboard-row">
          <Col xs={24} sm={12} md={12} lg={6} xl={6}>
            <Card hoverable onClick={() => navigate('/leads')} className="dashboard-card dashboard-card--interactive">
              <Statistic
                title={<span className="dashboard-stat-title">Today&apos;s Leads</span>}
                value={todayLeads}
                prefix={<UserAddOutlined className="dashboard-stat-prefix" />}
                suffix={<ArrowUpOutlined className="dashboard-stat-suffix-success" />}
              />
              <div className="dashboard-stat-spacer" />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={12} lg={6} xl={6}>
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
          <Col xs={24} sm={12} md={12} lg={6} xl={6}>
            <Card className="dashboard-card dashboard-card--interactive dashboard-card--stat-green">
              <Statistic
                title={<span className="dashboard-stat-title">Online Agents</span>}
                value={onlineAgents}
                prefix={<TeamOutlined />}
              />
              <div className="dashboard-stat-meta dashboard-stat-meta--muted">{offlineAgents} offline</div>
            </Card>
          </Col>
           <Col xs={24} sm={12} md={12} lg={6} xl={6}>
            <Card className="dashboard-card dashboard-card--interactive dashboard-card--stat-green">
              <Statistic
                title={<span className="dashboard-stat-title">Appointments</span>}
                value={onlineAgents}
                prefix={<TeamOutlined />}
              />
              <div className="dashboard-stat-meta dashboard-stat-meta--muted">{offlineAgents} offline</div>
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
            className="dashboard-card dashboard-card--chart"
          >
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={`var(${entry.fillVar})`} />
                  ))}
                </Pie>
                <Tooltip />
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
                  onClick: () => navigate(`/leads/${record.key}`),
                  style: { cursor: 'pointer' },
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
                <YAxis dataKey="name" type="category" />
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
    </div>
  )
}

export default Dashboard
