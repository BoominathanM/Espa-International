import React, { useState } from 'react'
import { Table, Tag, Card, Tabs, Button, Space, message, Typography } from 'antd'
import { CheckOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { 
  useGetAllNotificationsQuery, 
  useMarkAsReadMutation, 
  useMarkAllAsReadMutation, 
  useClearAllNotificationsMutation 
} from '../../store/api/notificationApi'

const Logs = ({ defaultActiveTab }) => {
  const [notificationPage, setNotificationPage] = useState(1)
  const [notificationLimit] = useState(50)
  const [activeTab, setActiveTab] = useState(defaultActiveTab || 'chat')
  
  // Notification API hooks
  const { data: notificationsData, isLoading: notificationsLoading, refetch: refetchNotifications } = useGetAllNotificationsQuery({
    page: notificationPage,
    limit: notificationLimit,
  })
  const [markAsRead] = useMarkAsReadMutation()
  const [markAllAsRead] = useMarkAllAsReadMutation()
  const [clearAllNotifications] = useClearAllNotificationsMutation()
  
  const notifications = notificationsData?.notifications || []
  const notificationPagination = notificationsData?.pagination || { total: 0, page: 1, limit: 50, pages: 1 }
  
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

  // Notification handlers
  const handleMarkAsRead = async (notificationId) => {
    try {
      await markAsRead(notificationId).unwrap()
      message.success('Notification marked as read')
      refetchNotifications()
    } catch (error) {
      message.error('Failed to mark notification as read')
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead().unwrap()
      message.success('All notifications marked as read')
      refetchNotifications()
    } catch (error) {
      message.error('Failed to mark all as read')
    }
  }

  const handleClearAll = async () => {
    try {
      await clearAllNotifications().unwrap()
      message.success('All notifications cleared')
      refetchNotifications()
    } catch (error) {
      message.error('Failed to clear notifications')
    }
  }

  const getNotificationTypeColor = (type) => {
    const colors = {
      info: 'blue',
      success: 'green',
      warning: 'orange',
      error: 'red',
    }
    return colors[type] || 'default'
  }

  const notificationColumns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: record.isRead ? 'normal' : 'bold', color: record.isRead ? '#888' : '#ffffff' }}>
            {text}
          </div>
        </div>
      ),
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      render: (text, record) => (
        <div style={{ color: record.isRead ? '#666' : '#aaa', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {text}
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type) => (
        <Tag color={getNotificationTypeColor(type)}>{type?.toUpperCase() || 'INFO'}</Tag>
      ),
    },
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
      render: (user, record) => {
        // First, try to get target user (user-specific notification)
        if (user && typeof user === 'object' && user.name) {
          return user.name
        }
        // If no target user, show creator (for role-based notifications)
        if (record.createdBy && typeof record.createdBy === 'object' && record.createdBy.name) {
          return record.createdBy.name
        }
        return '-'
      },
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role, record) => {
        // Priority 1: If notification has a direct role (role-based notification), use it
        if (role && typeof role === 'string') {
          return role.charAt(0).toUpperCase() + role.slice(1)
        }
        // Priority 2: If notification is user-specific, get role from populated user object
        if (record.user && typeof record.user === 'object' && record.user.role) {
          return record.user.role.charAt(0).toUpperCase() + record.user.role.slice(1)
        }
        // Priority 3: If no target user/role, get role from creator (for system notifications)
        if (record.createdBy && typeof record.createdBy === 'object' && record.createdBy.role) {
          return record.createdBy.role.charAt(0).toUpperCase() + record.createdBy.role.slice(1)
        }
        return '-'
      },
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
      render: (branch, record) => {
        // If notification has a direct branch (branch-based notification), use it
        if (branch && typeof branch === 'object' && branch.name) {
          return branch.name
        }
        // If notification is user-specific, get branch from populated user object
        if (record.user && typeof record.user === 'object' && record.user.branch) {
          if (typeof record.user.branch === 'object' && record.user.branch.name) {
            return record.user.branch.name
          }
        }
        // If no target branch, get branch from creator
        if (record.createdBy && typeof record.createdBy === 'object' && record.createdBy.branch) {
          if (typeof record.createdBy.branch === 'object' && record.createdBy.branch.name) {
            return record.createdBy.branch.name
          }
        }
        return '-'
      },
    },
    {
      title: 'Status',
      dataIndex: 'isRead',
      key: 'isRead',
      render: (isRead) => (
        <Tag color={isRead ? 'default' : 'blue'}>{isRead ? 'Read' : 'Unread'}</Tag>
      ),
    },
    {
      title: 'Read By',
      dataIndex: 'readBy',
      key: 'readBy',
      render: (readBy) => readBy?.name || '-',
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => dayjs(date).format('MMM DD, YYYY HH:mm'),
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {!record.isRead && (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleMarkAsRead(record._id)}
              style={{ color: '#D4AF37', padding: 0 }}
            >
              Mark read
            </Button>
          )}
        </Space>
      ),
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
    {
      key: 'notifications',
      label: 'Notification Logs',
      children: (
        <div className="table-responsive-wrapper">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Typography.Text style={{ color: '#D4AF37', fontSize: 16 }}>
                All Notifications ({notificationPagination.total})
              </Typography.Text>
            </div>
            <Space>
              <Button
                icon={<CheckOutlined />}
                onClick={handleMarkAllAsRead}
                style={{ color: '#D4AF37', borderColor: '#D4AF37' }}
              >
                Mark All as Read
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleClearAll}
              >
                Clear All
              </Button>
            </Space>
          </div>
          <Table
            columns={notificationColumns}
            dataSource={notifications.map(n => ({ ...n, key: n._id }))}
            loading={notificationsLoading}
            pagination={{
              current: notificationPagination.page,
              pageSize: notificationPagination.limit,
              total: notificationPagination.total,
              showSizeChanger: false,
              showTotal: (total) => `Total ${total} notifications`,
            }}
            onChange={(pagination) => {
              setNotificationPage(pagination.current)
            }}
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
      <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} />
    </div>
  )
}

export default Logs
