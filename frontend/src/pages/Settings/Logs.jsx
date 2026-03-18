import React, { useState } from 'react'
import { Table, Tag, Tabs, Button, Space, message, Typography, Tooltip, Empty, Spin } from 'antd'
import { CheckOutlined, DeleteOutlined, GlobalOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { 
  useGetAllNotificationsQuery, 
  useMarkAsReadMutation, 
  useMarkAllAsReadMutation, 
  useClearAllNotificationsMutation 
} from '../../store/api/notificationApi'
import { useGetLoginHistoryQuery } from '../../store/api/loginHistoryApi'
import { useGetChatDeletionLogsQuery, useGetLeadActivityLogsQuery } from '../../store/api/systemLogsApi'
import { PageLayout, PageHeader } from '../../components/ds-layout'

const Logs = ({ defaultActiveTab }) => {
  const [notificationPage, setNotificationPage] = useState(1)
  const [notificationLimit] = useState(50)
  const [loginHistoryPage, setLoginHistoryPage] = useState(1)
  const [loginHistoryLimit] = useState(50)
  const [chatLogPage, setChatLogPage] = useState(1)
  const [activityLogPage, setActivityLogPage] = useState(1)
  const [logPageSize] = useState(50)
  const [activeTab, setActiveTab] = useState(defaultActiveTab || 'chat')
  
  // Notification API hooks
  const { data: notificationsData, isLoading: notificationsLoading, refetch: refetchNotifications } = useGetAllNotificationsQuery({
    page: notificationPage,
    limit: notificationLimit,
  })
  const [markAsRead] = useMarkAsReadMutation()
  const [markAllAsRead] = useMarkAllAsReadMutation()
  const [clearAllNotifications] = useClearAllNotificationsMutation()
  
  // Login History API hooks
  const { data: loginHistoryData, isLoading: loginHistoryLoading } = useGetLoginHistoryQuery({
    page: loginHistoryPage,
    limit: loginHistoryLimit,
  })
  
  const notifications = notificationsData?.notifications || []
  const notificationPagination = notificationsData?.pagination || { total: 0, page: 1, limit: 50, pages: 1 }
  
  const loginHistory = loginHistoryData?.loginHistory || []
  const loginHistoryPagination = loginHistoryData?.pagination || { total: 0, page: 1, limit: 50, pages: 1 }

  const { data: chatDeletionData, isLoading: chatDeletionLoading } = useGetChatDeletionLogsQuery(
    { page: chatLogPage, limit: logPageSize },
    { skip: activeTab !== 'chat' }
  )
  const chatLogs = chatDeletionData?.logs || []
  const chatPagination = chatDeletionData?.pagination || { total: 0, page: 1, limit: logPageSize, pages: 0 }

  const { data: activityData, isLoading: activityLoading } = useGetLeadActivityLogsQuery(
    { page: activityLogPage, limit: logPageSize },
    { skip: activeTab !== 'activity' }
  )
  const activityLogs = activityData?.logs || []
  const activityPagination = activityData?.pagination || { total: 0, page: 1, limit: logPageSize, pages: 0 }

  const chatColumns = [
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 140,
      render: (action) => <Tag color="red">{action}</Tag>,
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 130,
      render: (source) => (
        <Tag color={source === 'whatsapp_webhook' ? 'green' : 'blue'}>
          {source === 'whatsapp_webhook' ? 'WhatsApp' : 'CRM'}
        </Tag>
      ),
    },
    {
      title: 'User / Actor',
      dataIndex: 'user',
      key: 'user',
      ellipsis: true,
    },
    {
      title: 'Chat / Lead ID',
      dataIndex: 'chatId',
      key: 'chatId',
      ellipsis: true,
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
      ellipsis: true,
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
      render: (p) => p || '-',
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
      width: 120,
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      render: (timestamp) => (timestamp ? dayjs(timestamp).format('MMM DD, YYYY HH:mm:ss') : '-'),
    },
  ]

  const activityActionColor = (action) => {
    const a = (action || '').toLowerCase()
    if (a.includes('convert')) return 'green'
    if (a.includes('delete') || a.includes('lost')) return 'red'
    if (a.includes('created') || a.includes('add')) return 'cyan'
    if (a.includes('update') || a.includes('chang')) return 'blue'
    if (a.includes('reminder') || a.includes('follow')) return 'orange'
    if (a.includes('call')) return 'purple'
    return 'default'
  }

  const activityColumns = [
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 160,
      render: (action) => <Tag color={activityActionColor(action)}>{action}</Tag>,
    },
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Details',
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
    },
    {
      title: 'Lead',
      key: 'lead',
      width: 140,
      ellipsis: true,
      render: (_, row) => row.leadName || '-',
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
      width: 120,
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      render: (timestamp) => (timestamp ? dayjs(timestamp).format('MMM DD, YYYY HH:mm:ss') : '-'),
    },
  ]

  const loginColumns = [
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
      width: 120,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 180,
    },
    {
      title: 'IP Address',
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={status === 'Success' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 120,
      render: (country) => country || '-',
    },
    {
      title: 'Region/State',
      dataIndex: 'region',
      key: 'region',
      width: 150,
      render: (region) => region || '-',
    },
    {
      title: 'City',
      dataIndex: 'city',
      key: 'city',
      width: 120,
      render: (city) => city || '-',
    },
    {
      title: 'Postal Code',
      dataIndex: 'postalCode',
      key: 'postalCode',
      width: 110,
      render: (postalCode) => postalCode || '-',
    },
    {
      title: 'Coordinates',
      key: 'coordinates',
      width: 150,
      render: (_, record) => {
        if (record.latitude && record.longitude) {
          const coords = `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`
          const mapUrl = `https://www.google.com/maps?q=${record.latitude},${record.longitude}`
          return (
            <Tooltip title="Click to open in Google Maps">
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#D4AF37' }}
              >
                <GlobalOutlined /> {coords}
              </a>
            </Tooltip>
          )
        }
        return '-'
      },
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp) => dayjs(timestamp).format('MMM DD, YYYY HH:mm:ss'),
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
          <div className={record.isRead ? 'logs-notification-read' : 'logs-notification-unread'}>
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
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            Records when a lead is removed from the CRM or via WhatsApp (ASK EVA) sync. New entries appear after
            deletions occur.
          </Typography.Paragraph>
          <Table
            columns={chatColumns}
            dataSource={chatLogs.map((r) => ({ ...r, key: r._id }))}
            loading={chatDeletionLoading}
            locale={{
              emptyText: chatDeletionLoading ? <Spin /> : <Empty description="No chat/lead deletion logs yet" />,
            }}
            pagination={{
              current: chatPagination.page,
              pageSize: chatPagination.limit,
              total: chatPagination.total,
              showSizeChanger: false,
              showTotal: (total) => `Total ${total} entries`,
            }}
            onChange={(p) => setChatLogPage(p.current)}
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
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            Lead activity from follow-ups, edits, calls, reminders, and conversions (same timeline as on each lead).
          </Typography.Paragraph>
          <Table
            columns={activityColumns}
            dataSource={activityLogs.map((r) => ({ ...r, key: r._id }))}
            loading={activityLoading}
            locale={{
              emptyText: activityLoading ? <Spin /> : <Empty description="No lead activity yet" />,
            }}
            pagination={{
              current: activityPagination.page,
              pageSize: activityPagination.limit,
              total: activityPagination.total,
              showSizeChanger: false,
              showTotal: (total) => `Total ${total} events`,
            }}
            onChange={(p) => setActivityLogPage(p.current)}
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
            dataSource={loginHistory}
            loading={loginHistoryLoading}
            pagination={{
              current: loginHistoryPagination.page,
              pageSize: loginHistoryPagination.limit,
              total: loginHistoryPagination.total,
              showSizeChanger: false,
              showTotal: (total) => `Total ${total} login attempts`,
            }}
            onChange={(pagination) => {
              setLoginHistoryPage(pagination.current)
            }}
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
                style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
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
            scroll={{ x: 'max-content' }}
          />
        </div>
      ),
    },
  ]

  return (
    <PageLayout className="mgmt-page">
      <PageHeader title="System Logs" stackOnMobile={false} />
      <Tabs className="mgmt-tabs" items={tabItems} activeKey={activeTab} onChange={setActiveTab} />
    </PageLayout>
  )
}

export default Logs
