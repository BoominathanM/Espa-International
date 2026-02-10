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
  CloseCircleOutlined,
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
    { name: 'AI Bot', value: 15, color: '#4A90E2' },
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
                <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
                  <Statistic
                    title={<span style={{ color: '#ffffff' }}>Total Leads</span>}
                    value={970}
                    valueStyle={{ color: '#D4AF37' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
                  <Statistic
                    title={<span style={{ color: '#ffffff' }}>Converted</span>}
                    value={357}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
                  <Statistic
                    title={<span style={{ color: '#ffffff' }}>Lost</span>}
                    value={117}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
                  <Statistic
                    title={<span style={{ color: '#ffffff' }}>Conversion Rate</span>}
                    value={36.8}
                    suffix="%"
                    valueStyle={{ color: '#D4AF37' }}
                  />
                </Card>
              </Col>
            </Row>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                <Card
                  title={<span style={{ color: '#D4AF37' }}>Lead Performance Trend</span>}
                  style={{ background: '#1a1a1a', border: '1px solid #333' }}
                >
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <LineChart data={leadPerformanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#ffffff" />
                      <YAxis stroke="#ffffff" />
                      <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', color: '#ffffff' }} />
                      <Legend />
                      <Line type="monotone" dataKey="leads" stroke="#D4AF37" strokeWidth={2} name="Leads" />
                      <Line type="monotone" dataKey="converted" stroke="#52c41a" strokeWidth={2} name="Converted" />
                      <Line type="monotone" dataKey="lost" stroke="#ff4d4f" strokeWidth={2} name="Lost" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                <Card
                  title={<span style={{ color: '#D4AF37' }}>Lead Source Distribution</span>}
                  style={{ background: '#1a1a1a', border: '1px solid #333' }}
                >
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
            <Card
              title={<span style={{ color: '#D4AF37' }}>Lead Report Details</span>}
              style={{ background: '#1a1a1a', border: '1px solid #333' }}
            >
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
            <Card
              title={<span style={{ color: '#D4AF37' }}>Agent Performance</span>}
              style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 24 }}
            >
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={agentPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" />
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', color: '#ffffff' }} />
                  <Legend />
                  <Bar dataKey="leads" fill="#D4AF37" name="Leads" />
                  <Bar dataKey="calls" fill="#25D366" name="Calls" />
                  <Bar dataKey="chats" fill="#4A90E2" name="Chats" />
                  <Bar dataKey="converted" fill="#52c41a" name="Converted" />
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
                <Card
                  title={<span style={{ color: '#D4AF37' }}>Call Summary</span>}
                  style={{ background: '#1a1a1a', border: '1px solid #333' }}
                >
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
                      <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', color: '#ffffff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card style={{ background: '#1a1a1a', border: '1px solid #333', height: '100%' }}>
                  <Statistic
                    title={<span style={{ color: '#ffffff' }}>Total Calls</span>}
                    value={575}
                    valueStyle={{ color: '#D4AF37' }}
                  />
                  <div style={{ marginTop: 24 }}>
                    <Statistic
                      title={<span style={{ color: '#ffffff' }}>Answered</span>}
                      value={530}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <Statistic
                      title={<span style={{ color: '#ffffff' }}>Missed</span>}
                      value={45}
                      valueStyle={{ color: '#ff4d4f' }}
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
            <Card
              title={<span style={{ color: '#D4AF37' }}>Branch Performance</span>}
              style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 24 }}
            >
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={branchPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" />
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', color: '#ffffff' }} />
                  <Legend />
                  <Bar dataKey="leads" fill="#D4AF37" name="Leads" />
                  <Bar dataKey="revenue" fill="#52c41a" name="Revenue (₹)" />
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
                <Card
                  title={<span style={{ color: '#D4AF37' }}>Customer Distribution</span>}
                  style={{ background: '#1a1a1a', border: '1px solid #333' }}
                >
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
                      <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', color: '#ffffff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card style={{ background: '#1a1a1a', border: '1px solid #333', height: '100%' }}>
                  <Statistic
                    title={<span style={{ color: '#ffffff' }}>Total Customers</span>}
                    value={430}
                    valueStyle={{ color: '#D4AF37' }}
                  />
                  <div style={{ marginTop: 24 }}>
                    <Statistic
                      title={<span style={{ color: '#ffffff' }}>New Customers</span>}
                      value={250}
                      valueStyle={{ color: '#D4AF37' }}
                    />
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <Statistic
                      title={<span style={{ color: '#ffffff' }}>Repeat Customers</span>}
                      value={180}
                      valueStyle={{ color: '#52c41a' }}
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
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', position: 'relative' }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center',
        marginBottom: 16,
        gap: 12,
      }}>
        <h1 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '20px' : '24px' }}>Reports & Analytics</h1>
        <Space wrap style={{ width: isMobile ? '100%' : 'auto' }}>
          {showBranchDropdown && (
            <Select
              value={selectedBranch}
              onChange={(value) => setSelectedBranch(value || 'all')}
              allowClear={selectedBranch !== 'all'}
              clearIcon={<CloseCircleOutlined style={{ color: '#ffffff' }} />}
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
        <Card style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 16 }}>
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
