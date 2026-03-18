import React, { useState } from 'react'
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
import { useChartThemeTokens } from '../../hooks/useChartThemeTokens'
import { getBranchOptions } from '../../utils/branches'
import { isSuperAdmin, isAdmin, isSupervisor } from '../../utils/permissions'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Option } = Select

const Reports = () => {
  const { isMobile, isTablet, isSmallLaptop, isDesktop } = useResponsive()
  const [reportType, setReportType] = useState('lead')
  const [selectedBranch, setSelectedBranch] = useState('all')
  
  // Check if user should see branch dropdown
  const showBranchDropdown = isSuperAdmin() || isAdmin() || isSupervisor()
  
  // Calculate chart height based on screen size
  const getChartHeight = () => {
    if (isMobile || isTablet) return 250
    if (isSmallLaptop || isDesktop) return 280
    return 300
  }
  
  const chartHeight = getChartHeight()
  const [showFilters, setShowFilters] = useState(false)
  const chartT = useChartThemeTokens()

  // Mock data
  const leadPerformanceData = [
    { name: 'Jan', leads: 120, converted: 45, lost: 15 },
    { name: 'Feb', leads: 135, converted: 52, lost: 18 },
    { name: 'Mar', leads: 150, converted: 60, lost: 20 },
    { name: 'Apr', leads: 140, converted: 55, lost: 17 },
    { name: 'May', leads: 160, converted: 65, lost: 22 },
    { name: 'Jun', leads: 170, converted: 70, lost: 25 },
  ]

  const agentPerformanceData = [
    { name: 'Agent A', leads: 45, calls: 120, chats: 30, converted: 15 },
    { name: 'Agent B', leads: 38, calls: 110, chats: 25, converted: 12 },
    { name: 'Agent C', leads: 42, calls: 105, chats: 28, converted: 14 },
    { name: 'Agent D', leads: 35, calls: 95, chats: 22, converted: 10 },
  ]

  const callSummaryData = [
    { name: 'Inbound', value: 350, color: '#D4AF37' },
    { name: 'Outbound', value: 180, color: '#25D366' },
    { name: 'Missed', value: 45, color: '#ff4d4f' },
  ]

  const branchPerformanceData = [
    { name: 'Branch 1', leads: 120, revenue: 45000 },
    { name: 'Branch 2', leads: 95, revenue: 38000 },
    { name: 'Branch 3', leads: 80, revenue: 32000 },
    { name: 'Branch 4', leads: 65, revenue: 28000 },
  ]

  const repeatCustomerData = [
    { name: 'New Customers', value: 250, color: '#D4AF37' },
    { name: 'Repeat Customers', value: 180, color: '#52c41a' },
  ]

  const leadSourceData = [
    { name: 'Call', value: 30, color: '#D4AF37' },
    { name: 'WhatsApp', value: 25, color: '#25D366' },
    { name: 'Facebook', value: 20, color: '#1877F2' },
    { name: 'Insta', value: 15, color: '#4A90E2' },
    { name: 'Website', value: 10, color: '#9B59B6' },
  ]

  const leadReportColumns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Total Leads',
      dataIndex: 'total',
      key: 'total',
    },
    {
      title: 'Converted',
      dataIndex: 'converted',
      key: 'converted',
    },
    {
      title: 'Lost',
      dataIndex: 'lost',
      key: 'lost',
    },
    {
      title: 'Conversion Rate',
      dataIndex: 'rate',
      key: 'rate',
      render: (rate) => `${rate}%`,
    },
  ]

  const leadReportData = [
    { key: '1', date: '2024-01-15', total: 45, converted: 18, lost: 5, rate: 40 },
    { key: '2', date: '2024-01-14', total: 42, converted: 16, lost: 6, rate: 38 },
    { key: '3', date: '2024-01-13', total: 38, converted: 15, lost: 4, rate: 39 },
  ]

  const handleExport = (format) => {
    message.success(`Exporting report as ${format.toUpperCase()}...`)
    // In production, this would trigger actual export
  }

  const renderReportContent = () => {
    switch (reportType) {
      case 'lead':
        return (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Total Leads</span>}
                    value={970}
                    valueStyle={{ color: 'var(--primary-color)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Converted</span>}
                    value={357}
                    valueStyle={{ color: 'var(--color-success)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Lost</span>}
                    value={117}
                    valueStyle={{ color: 'var(--color-danger)' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="mgmt-card">
                  <Statistic
                    title={<span className="mgmt-stat-title">Conversion Rate</span>}
                    value={36.8}
                    suffix="%"
                    valueStyle={{ color: 'var(--primary-color)' }}
                  />
                </Card>
              </Col>
            </Row>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Lead Performance Trend</span>}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <LineChart data={leadPerformanceData}>
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
                </Card>
              </Col>
              <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Lead Source Distribution</span>}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <PieChart>
                      <Pie
                        data={leadSourceData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {leadSourceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartT.tooltipContentPrimaryBorder}
                        itemStyle={chartT.pieItemStyle}
                        labelStyle={chartT.pieLabelStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            </Row>
            <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Lead Report Details</span>}>
              <Table
                columns={leadReportColumns}
                dataSource={leadReportData}
                pagination={{ pageSize: 10 }}
              />
            </Card>
          </>
        )

      case 'agent':
        return (
          <>
            <Card className="mgmt-card" style={{ marginBottom: 24 }} title={<span className="mgmt-card-title-text">Agent Performance</span>}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={agentPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartT.grid} />
                  <XAxis dataKey="name" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                  <YAxis stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                  <Tooltip contentStyle={chartT.tooltipContent} />
                  <Legend />
                  <Bar dataKey="leads" fill={chartT.primary} name="Leads" />
                  <Bar dataKey="calls" fill="#25D366" name="Calls" />
                  <Bar dataKey="chats" fill="#4A90E2" name="Chats" />
                  <Bar dataKey="converted" fill="var(--color-success)" name="Converted" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>
        )

      case 'call':
        return (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Call Summary</span>}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <PieChart>
                      <Pie
                        data={callSummaryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {callSummaryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartT.tooltipContent} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card className="mgmt-card" style={{ height: '100%' }}>
                  <Statistic
                    title={<span className="mgmt-stat-title">Total Calls</span>}
                    value={575}
                    valueStyle={{ color: 'var(--primary-color)' }}
                  />
                  <div style={{ marginTop: 24 }}>
                    <Statistic
                      title={<span className="mgmt-stat-title">Answered</span>}
                      value={530}
                      valueStyle={{ color: 'var(--color-success)' }}
                    />
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <Statistic
                      title={<span className="mgmt-stat-title">Missed</span>}
                      value={45}
                      valueStyle={{ color: 'var(--color-danger)' }}
                    />
                  </div>
                </Card>
              </Col>
            </Row>
          </>
        )

      case 'branch':
        return (
          <>
            <Card className="mgmt-card" style={{ marginBottom: 24 }} title={<span className="mgmt-card-title-text">Branch Performance</span>}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={branchPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartT.grid} />
                  <XAxis dataKey="name" stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                  <YAxis stroke={chartT.axis} tick={{ fill: chartT.axis }} />
                  <Tooltip contentStyle={chartT.tooltipContent} />
                  <Legend />
                  <Bar dataKey="leads" fill={chartT.primary} name="Leads" />
                  <Bar dataKey="revenue" fill="var(--color-success)" name="Revenue (₹)" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>
        )

      case 'repeat':
        return (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                <Card className="mgmt-card" title={<span className="mgmt-card-title-text">Customer Distribution</span>}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <PieChart>
                      <Pie
                        data={repeatCustomerData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {repeatCustomerData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartT.tooltipContent} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card className="mgmt-card" style={{ height: '100%' }}>
                  <Statistic
                    title={<span className="mgmt-stat-title">Total Customers</span>}
                    value={430}
                    valueStyle={{ color: 'var(--primary-color)' }}
                  />
                  <div style={{ marginTop: 24 }}>
                    <Statistic
                      title={<span className="mgmt-stat-title">New Customers</span>}
                      value={250}
                      valueStyle={{ color: 'var(--primary-color)' }}
                    />
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <Statistic
                      title={<span className="mgmt-stat-title">Repeat Customers</span>}
                      value={180}
                      valueStyle={{ color: 'var(--color-success)' }}
                    />
                  </div>
                </Card>
              </Col>
            </Row>
          </>
        )

      default:
        return null
    }
  }

  return (
    <div className="mgmt-page reports-page">
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center',
        marginBottom: 16,
        gap: 12,
      }}>
        <h1 className="mgmt-page-title">Reports & Analytics</h1>
        <Space wrap style={{ width: isMobile ? '100%' : 'auto' }}>
          {showBranchDropdown && (
            <Select
              value={selectedBranch}
              onChange={(value) => setSelectedBranch(value || 'all')}
              allowClear={selectedBranch !== 'all'}
              style={{ width: isMobile ? '100%' : 200 }}
              size={isMobile ? 'small' : 'middle'}
              placeholder="Select Branch"
            >
              {getBranchOptions().map((branch) => (
                <Option key={branch.value} value={branch.value}>
                  {branch.label}
                </Option>
              ))}
            </Select>
          )}
          <Select
            value={reportType}
            onChange={setReportType}
            style={{ width: isMobile ? '100%' : 200 }}
            size={isMobile ? 'small' : 'middle'}
          >
            <Option value="lead">Lead Performance</Option>
            <Option value="agent">Agent Performance</Option>
            <Option value="call">Call Summary</Option>
            <Option value="branch">Branch Performance</Option>
            <Option value="repeat">Repeat Customer Stats</Option>
          </Select>
          <Button
            icon={showFilters ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setShowFilters(!showFilters)}
            size={isMobile ? 'small' : 'middle'}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
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
      </div>

      {showFilters && (
        <Card className="mgmt-filters-card">
          <div style={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            justifyContent: isMobile ? 'stretch' : 'flex-end',
            gap: 12,
            width: '100%'
          }}>
            <RangePicker style={{ width: isMobile ? '100%' : 250 }} />
            <Button type="primary" icon={<DownloadOutlined />} style={{ width: isMobile ? '100%' : 'auto' }}>
              Generate Report
            </Button>
          </div>
        </Card>
      )}

      {renderReportContent()}
    </div>
  )
}

export default Reports
