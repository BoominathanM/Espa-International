import React, { useState, useMemo } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Select, Space, DatePicker } from 'antd'
import {
  UserAddOutlined,
  PhoneOutlined,
  MessageOutlined,
  TeamOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
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
import { useAuth } from '../../context/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'
import { getBranchOptions } from '../../utils/branches'
import { isSuperAdmin, isAdmin, isSupervisor } from '../../utils/permissions'
import dayjs from 'dayjs'

const { Option } = Select

const Dashboard = () => {
  const { isMobile, isTablet, isSmallLaptop, isDesktop } = useResponsive()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [selectedDate, setSelectedDate] = useState(null)
  
  // Check if user should see branch dropdown
  const showBranchDropdown = isSuperAdmin() || isAdmin() || isSupervisor()
  
  // Calculate chart height based on screen size
  const getChartHeight = () => {
    if (isMobile || isTablet) return 250
    if (isSmallLaptop || isDesktop) return 280
    return 300
  }
  
  const chartHeight = getChartHeight()

  // Mock data
  const todayLeads = 45
  const callsReceived = 120
  const callsMissed = 8
  const activeChats = 23
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
    { name: 'Call', value: 30, color: '#D4AF37' },
    { name: 'WhatsApp', value: 25, color: '#25D366' },
    { name: 'Facebook', value: 20, color: '#1877F2' },
    { name: 'Insta', value: 18, color: '#E4405F' },
    { name: 'AI Bot', value: 15, color: '#4A90E2' },
    { name: 'Website', value: 10, color: '#9B59B6' },
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
    {
      key: '1',
      agent: 'Agent A',
      branch: 'Branch 1',
      leads: 45,
      calls: 120,
      converted: 15,
      conversionRate: '33.3%',
    },
    {
      key: '2',
      agent: 'Agent B',
      branch: 'Branch 2',
      leads: 38,
      calls: 110,
      converted: 12,
      conversionRate: '31.6%',
    },
    {
      key: '3',
      agent: 'Agent C',
      branch: 'Branch 1',
      leads: 42,
      calls: 105,
      converted: 14,
      conversionRate: '33.3%',
    },
    {
      key: '4',
      agent: 'Agent D',
      branch: 'Branch 3',
      leads: 35,
      calls: 95,
      converted: 10,
      conversionRate: '28.6%',
    },
    {
      key: '5',
      agent: 'Agent E',
      branch: 'Branch 2',
      leads: 30,
      calls: 85,
      converted: 8,
      conversionRate: '26.7%',
    },
  ]

  const topAgentsColumns = [
    {
      title: 'Agent',
      dataIndex: 'agent',
      key: 'agent',
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
    },
    {
      title: 'Leads',
      dataIndex: 'leads',
      key: 'leads',
      sorter: (a, b) => a.leads - b.leads,
    },
    {
      title: 'Calls',
      dataIndex: 'calls',
      key: 'calls',
      sorter: (a, b) => a.calls - b.calls,
    },
    {
      title: 'Converted',
      dataIndex: 'converted',
      key: 'converted',
      sorter: (a, b) => a.converted - b.converted,
    },
    {
      title: 'Conversion Rate',
      dataIndex: 'conversionRate',
      key: 'conversionRate',
      render: (rate) => <Tag color="green">{rate}</Tag>,
    },
  ]

  const allRecentLeads = [
    {
      key: '1',
      name: 'John Doe',
      mobile: '+91 9876543210',
      source: 'Call',
      status: 'New',
      branch: 'Branch 1',
      agent: 'Agent A',
      date: dayjs().subtract(1, 'day'),
    },
    {
      key: '2',
      name: 'Jane Smith',
      mobile: '+91 9876543211',
      source: 'WhatsApp',
      status: 'In Progress',
      branch: 'Branch 2',
      agent: 'Agent B',
      date: dayjs(),
    },
    {
      key: '3',
      name: 'Mike Johnson',
      mobile: '+91 9876543212',
      source: 'AI Bot',
      status: 'Follow-Up',
      branch: 'Branch 1',
      agent: 'Agent C',
      date: dayjs(),
    },
    {
      key: '4',
      name: 'Sarah Williams',
      mobile: '+91 9876543213',
      source: 'Insta',
      status: 'New',
      branch: 'Branch 2',
      agent: 'Agent D',
      date: dayjs().subtract(2, 'day'),
    },
    {
      key: '5',
      name: 'David Brown',
      mobile: '+91 9876543214',
      source: 'Facebook',
      status: 'Converted',
      branch: 'Branch 1',
      agent: 'Agent A',
      date: dayjs(),
    },
  ]

  // Filter recent leads based on selected date
  const recentLeads = useMemo(() => {
    if (!selectedDate) return allRecentLeads
    return allRecentLeads.filter(lead => {
      if (!lead.date) return false
      return lead.date.isSame(selectedDate, 'day')
    })
  }, [selectedDate])

  const alerts = [
    { type: 'error', message: '8 missed calls need attention' },
    { type: 'warning', message: '5 unassigned leads' },
    { type: 'info', message: '12 AI bot captured leads need follow-up' },
  ]

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Mobile',
      dataIndex: 'mobile',
      key: 'mobile',
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (source) => {
        const colors = {
          Call: 'gold',
          WhatsApp: 'green',
          Facebook: 'blue',
          Insta: 'magenta',
          'AI Bot': 'cyan',
          Website: 'purple',
        }
        return <Tag color={colors[source]}>{source}</Tag>
      },
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
        return <Tag color={colors[status]}>{status}</Tag>
      },
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
    },
    {
      title: 'Agent',
      dataIndex: 'agent',
      key: 'agent',
    },
  ]

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', position: 'relative' }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'flex-start' : 'center',
        marginBottom: 24,
        gap: 12,
      }}>
        <h1 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '20px' : '24px' }}>Dashboard</h1>
        {showBranchDropdown && (
          <Space>
            <Select
              value={selectedBranch}
              onChange={(value) => setSelectedBranch(value || 'all')}
              allowClear={selectedBranch !== 'all'}
              clearIcon={<CloseCircleOutlined style={{ color: '#ffffff' }} />}
              style={{ width: isMobile ? 150 : 200 }}
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
              style={{ width: isMobile ? 150 : 200 }}
              size={isMobile ? 'small' : 'middle'}
              format="YYYY-MM-DD"
              placeholder="Select Date"
            />
          </Space>
        )}
      </div>

      {/* Alerts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {alerts.map((alert, index) => (
          <Col xs={24} sm={24} md={8} key={index}>
            <Card
              style={{
                background: alert.type === 'error' ? '#2a1a1a' : alert.type === 'warning' ? '#2a2a1a' : '#1a1a2a',
                border: `1px solid ${alert.type === 'error' ? '#ff4d4f' : alert.type === 'warning' ? '#faad14' : '#1890ff'}`,
              }}
            >
              <p style={{ color: '#ffffff', margin: 0 }}>{alert.message}</p>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <Card
            hoverable
            onClick={() => navigate('/leads')}
            style={{ cursor: 'pointer', background: '#1a1a1a', border: '1px solid #333', height: '100%', minHeight: '120px' }}
          >
            <Statistic
              title={<span style={{ color: '#ffffff' }}>Today's Leads</span>}
              value={todayLeads}
              prefix={<UserAddOutlined style={{ color: '#D4AF37' }} />}
              valueStyle={{ color: '#D4AF37' }}
              suffix={<ArrowUpOutlined style={{ color: '#52c41a' }} />}
            />
            <div style={{ marginTop: 8, height: '20px' }}></div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <Card
            hoverable
            onClick={() => navigate('/calls')}
            style={{ cursor: 'pointer', background: '#1a1a1a', border: '1px solid #333', height: '100%', minHeight: '120px' }}
          >
            <Statistic
              title={<span style={{ color: '#ffffff' }}>Calls Received</span>}
              value={callsReceived}
              prefix={<PhoneOutlined style={{ color: '#D4AF37' }} />}
              valueStyle={{ color: '#D4AF37' }}
            />
            <div style={{ marginTop: 8, color: '#ff4d4f', fontSize: 12 }}>
              {callsMissed} missed
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <Card
            hoverable
            onClick={() => navigate('/chats')}
            style={{ cursor: 'pointer', background: '#1a1a1a', border: '1px solid #333', height: '100%', minHeight: '120px' }}
          >
            <Statistic
              title={<span style={{ color: '#ffffff' }}>Active Chats</span>}
              value={activeChats}
              prefix={<MessageOutlined style={{ color: '#D4AF37' }} />}
              valueStyle={{ color: '#D4AF37' }}
            />
            <div style={{ marginTop: 8, height: '20px' }}></div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <Card style={{ background: '#1a1a1a', border: '1px solid #333', height: '100%', minHeight: '120px' }}>
            <Statistic
              title={<span style={{ color: '#ffffff' }}>Online Agents</span>}
              value={onlineAgents}
              prefix={<TeamOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
              {offlineAgents} offline
            </div>
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={24} md={24} lg={12} xl={12}>
          <Card title={<span style={{ color: '#D4AF37' }}>Lead Trend (Last 7 Days)</span>} style={{ background: '#1a1a1a', border: '1px solid #333' }}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={leadTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#ffffff" />
                <YAxis stroke="#ffffff" />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', color: '#ffffff' }} />
                <Legend />
                <Line type="monotone" dataKey="leads" stroke="#D4AF37" strokeWidth={2} name="Leads" />
                <Line type="monotone" dataKey="calls" stroke="#25D366" strokeWidth={2} name="Calls" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} sm={24} md={24} lg={12} xl={12}>
          <Card title={<span style={{ color: '#D4AF37' }}>Lead Source Distribution</span>} style={{ background: '#1a1a1a', border: '1px solid #333' }}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    background: '#1a1a1a', 
                    border: '2px solid #D4AF37', 
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    boxShadow: '0 4px 16px rgba(212, 175, 55, 0.3)',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                  itemStyle={{ color: '#ffffff', padding: '6px 0', fontSize: '13px' }}
                  labelStyle={{ color: '#D4AF37', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Branch Activity */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={24} md={24} lg={12} xl={12}>
          <Card 
            title={<span style={{ color: '#D4AF37' }}>Branch Activity</span>} 
            style={{ 
              background: '#1a1a1a', 
              border: '1px solid #333',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
            bodyStyle={{ 
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: chartHeight
            }}
          >
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={branchData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#ffffff" />
                <YAxis stroke="#ffffff" />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', color: '#ffffff' }} />
                <Legend />
                <Bar dataKey="leads" fill="#D4AF37" name="Leads" />
                <Bar dataKey="calls" fill="#25D366" name="Calls" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} sm={24} md={24} lg={12} xl={12}>
          <Card 
            title={<span style={{ color: '#D4AF37' }}>Recent Leads</span>} 
            style={{ 
              background: '#1a1a1a', 
              border: '1px solid #333',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
            bodyStyle={{ 
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              minHeight: isMobile || isTablet ? 250 : 300
            }}
          >
            <div style={{ 
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              maxHeight: chartHeight
            }}>
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

      {/* Agent Performance Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={24} md={24} lg={12} xl={12}>
          <Card 
            title={<span style={{ color: '#D4AF37' }}>Agent Performance</span>} 
            style={{ 
              background: '#1a1a1a', 
              border: '1px solid #333',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
            bodyStyle={{ 
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: chartHeight
            }}
          >
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={agentPerformanceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" stroke="#ffffff" />
                <YAxis dataKey="name" type="category" stroke="#ffffff" />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', color: '#ffffff' }} />
                <Legend />
                <Bar dataKey="leads" fill="#D4AF37" name="Leads" />
                <Bar dataKey="calls" fill="#25D366" name="Calls" />
                <Bar dataKey="converted" fill="#52c41a" name="Converted" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} sm={24} md={24} lg={12} xl={12}>
          <Card 
            title={<span style={{ color: '#D4AF37' }}>Top Agents</span>} 
            style={{ 
              background: '#1a1a1a', 
              border: '1px solid #333',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
            bodyStyle={{ 
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              minHeight: isMobile || isTablet ? 250 : 300
            }}
          >
            <div style={{ 
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              maxHeight: chartHeight
            }}>
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
