import React from 'react'
import { Table, Tag, Card, Tabs } from 'antd'
import dayjs from 'dayjs'

const Logs = () => {
  const chatLogs = [
    {
      key: '1',
      action: 'Chat Deleted',
      user: 'Agent A',
      chatId: 'CHAT-001',
      customer: 'John Doe',
      timestamp: '2024-01-15 10:30:00',
    },
    {
      key: '2',
      action: 'Chat Deleted',
      user: 'Agent B',
      chatId: 'CHAT-002',
      customer: 'Jane Smith',
      timestamp: '2024-01-15 11:20:00',
    },
  ]

  const activityLogs = [
    {
      key: '1',
      action: 'Lead Created',
      user: 'Agent A',
      details: 'Created lead for John Doe',
      timestamp: '2024-01-15 10:30:00',
    },
    {
      key: '2',
      action: 'Lead Updated',
      user: 'Admin User',
      details: 'Updated lead status to Converted',
      timestamp: '2024-01-15 11:15:00',
    },
    {
      key: '3',
      action: 'User Created',
      user: 'Super Admin',
      details: 'Created new user: Staff Agent',
      timestamp: '2024-01-15 09:00:00',
    },
  ]

  const loginLogs = [
    {
      key: '1',
      user: 'Admin User',
      email: 'admin@gmail.com',
      ip: '192.168.1.100',
      status: 'Success',
      timestamp: '2024-01-15 08:30:00',
    },
    {
      key: '2',
      user: 'Agent A',
      email: 'agent@gmail.com',
      ip: '192.168.1.101',
      status: 'Success',
      timestamp: '2024-01-15 08:45:00',
    },
    {
      key: '3',
      user: 'Unknown',
      email: 'hacker@example.com',
      ip: '192.168.1.200',
      status: 'Failed',
      timestamp: '2024-01-15 09:00:00',
    },
  ]

  const chatColumns = [
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (action) => <Tag color="red">{action}</Tag>,
    },
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
    },
    {
      title: 'Chat ID',
      dataIndex: 'chatId',
      key: 'chatId',
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    },
  ]

  const activityColumns = [
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (action) => {
        const colors = {
          'Lead Created': 'green',
          'Lead Updated': 'blue',
          'User Created': 'orange',
          'User Updated': 'purple',
        }
        return <Tag color={colors[action] || 'default'}>{action}</Tag>
      },
    },
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
    },
    {
      title: 'Details',
      dataIndex: 'details',
      key: 'details',
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    },
  ]

  const loginColumns = [
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'IP Address',
      dataIndex: 'ip',
      key: 'ip',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Success' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    },
  ]

  const tabItems = [
    {
      key: 'chat',
      label: 'Chat Deletion Logs',
      children: (
        <div className="table-responsive-wrapper">
          <Table
            columns={chatColumns}
            dataSource={chatLogs}
            pagination={{ pageSize: 10 }}
            style={{ background: '#1a1a1a' }}
            scroll={{ x: 'max-content' }}
          />
        </div>
      ),
    },
    {
      key: 'activity',
      label: 'Activity Logs',
      children: (
        <div className="table-responsive-wrapper">
          <Table
            columns={activityColumns}
            dataSource={activityLogs}
            pagination={{ pageSize: 10 }}
            style={{ background: '#1a1a1a' }}
            scroll={{ x: 'max-content' }}
          />
        </div>
      ),
    },
    {
      key: 'login',
      label: 'Login History',
      children: (
        <div className="table-responsive-wrapper">
          <Table
            columns={loginColumns}
            dataSource={loginLogs}
            pagination={{ pageSize: 10 }}
            style={{ background: '#1a1a1a' }}
            scroll={{ x: 'max-content' }}
          />
        </div>
      ),
    },
  ]

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', position: 'relative' }}>
      <h2 style={{ color: '#D4AF37', marginBottom: 16 }}>System Logs</h2>
      <Tabs items={tabItems} />
    </div>
  )
}

export default Logs
