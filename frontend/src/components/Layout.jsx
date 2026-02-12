import React, { useState, useEffect } from 'react'
import { Layout as AntLayout, Menu, Avatar, Dropdown, Badge, Breadcrumb, Drawer, Form, Input, Button, message, Space, Divider, Empty, Typography, Popover } from 'antd'
import {
  DashboardOutlined,
  UserOutlined,
  PhoneOutlined,
  MessageOutlined,
  TeamOutlined,
  BarChartOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  LogoutOutlined,
  FileTextOutlined,
  LockOutlined,
  MailOutlined,
  BankOutlined,
  SafetyOutlined,
  CheckOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasPermission, isSuperAdmin } from '../utils/permissions'
import { useResponsive } from '../hooks/useResponsive'
import { useLogoutMutation, useChangePasswordMutation, useGetMeQuery } from '../store/api/authApi'
import { 
  useGetRecentNotificationsQuery, 
  useMarkAsReadMutation, 
  useMarkAllAsReadMutation, 
  useClearAllNotificationsMutation 
} from '../store/api/notificationApi'
import dayjs from 'dayjs'

const { Header, Sider, Content } = AntLayout

const Layout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false)
  const { isMobile, isTablet, isSmallLaptop } = useResponsive()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, login } = useAuth()
  const [logoutMutation] = useLogoutMutation()
  const [changePasswordMutation] = useChangePasswordMutation()
  const [profileDrawerVisible, setProfileDrawerVisible] = useState(false)
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false)
  const [changePasswordForm] = Form.useForm()
  const [notificationVisible, setNotificationVisible] = useState(false)
  
  // Notification hooks
  const { data: notificationsData, refetch: refetchNotifications } = useGetRecentNotificationsQuery(undefined, {
    pollingInterval: 30000, // Poll every 30 seconds
  })
  const [markAsRead] = useMarkAsReadMutation()
  const [markAllAsRead] = useMarkAllAsReadMutation()
  const [clearAllNotifications] = useClearAllNotificationsMutation()
  
  const notifications = notificationsData?.notifications || []
  const unreadCount = notificationsData?.unreadCount || 0
  
  // Fetch fresh user data when profile drawer opens
  const { data: currentUserData, refetch: refetchUser } = useGetMeQuery(undefined, {
    skip: !profileDrawerVisible, // Only fetch when drawer is open
  })
  
  // Update user data when fresh data is fetched
  useEffect(() => {
    if (profileDrawerVisible && currentUserData?.success && currentUserData?.user) {
      const freshUserData = {
        _id: currentUserData.user._id || currentUserData.user.id,
        id: currentUserData.user._id || currentUserData.user.id,
        name: currentUserData.user.name || '',
        email: currentUserData.user.email || '',
        role: currentUserData.user.role || 'staff',
        branch: currentUserData.user.branch || null,
        status: currentUserData.user.status || 'active',
        phone: currentUserData.user.phone || '',
        permissions: currentUserData.user.permissions || user?.permissions || {},
      }
      // Update localStorage and context
      localStorage.setItem('crm_user', JSON.stringify(freshUserData))
      login(freshUserData)
    }
  }, [profileDrawerVisible, currentUserData, login, user?.permissions])
  
  // Use fresh user data from API if available, otherwise fall back to context user
  const displayUser = currentUserData?.success && currentUserData?.user 
    ? {
        ...currentUserData.user,
        permissions: currentUserData.user.permissions || user?.permissions || {},
      }
    : user

  // Use drawer for mobile (< 576px), tablet (576px - 767px), and small laptop (768px - 992px)
  // Desktop (992px+) uses normal fixed sidebar
  const useDrawer = isMobile || isTablet || isSmallLaptop

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
      permission: 'dashboard:read',
    },
    {
      key: '/leads',
      icon: <FileTextOutlined />,
      label: 'Lead Management',
      permission: 'leads:read',
    },
    {
      key: '/calls',
      icon: <PhoneOutlined />,
      label: 'Call Management',
      permission: 'calls:read',
    },
    {
      key: '/chats',
      icon: <MessageOutlined />,
      label: 'WhatsApp & AI Chat',
      permission: 'chats:read',
    },
    {
      key: '/customers',
      icon: <TeamOutlined />,
      label: 'Customer Management',
      permission: 'customers:read',
    },
    {
      key: '/reports',
      icon: <BarChartOutlined />,
      label: 'Reports & Analytics',
      permission: 'reports:read',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'System Settings',
      permission: 'settings:read',
    },
  ].filter((item) => {
    if (!item.permission) return true
    const [module, action] = item.permission.split(':')
    return hasPermission(module, action)
  })

  const handleMenuClick = ({ key }) => {
    navigate(key)
    if (useDrawer) {
      setMobileMenuVisible(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logoutMutation().unwrap()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      logout()
      navigate('/login')
    }
  }

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
    },
  ]

  const handleUserMenuClick = ({ key }) => {
    if (key === 'profile') {
      setProfileDrawerVisible(true)
    } else if (key === 'logout') {
      handleLogout()
    }
  }

  const handleChangePassword = async (values) => {
    try {
      await changePasswordMutation({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }).unwrap()
      message.success('Password changed successfully')
      changePasswordForm.resetFields()
      setShowChangePasswordForm(false)
    } catch (error) {
      message.error(error?.data?.message || 'Failed to change password')
    }
  }

  // Notification handlers
  const handleMarkAsRead = async (notificationId, e) => {
    e.stopPropagation()
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
      setNotificationVisible(false)
    } catch (error) {
      message.error('Failed to clear notifications')
    }
  }

  const handleViewAll = () => {
    setNotificationVisible(false)
    // Navigate to settings and open notification logs tab
    navigate('/settings?tab=notifications')
  }

  // Get notification type color
  const getNotificationTypeColor = (type) => {
    const colors = {
      info: '#1890ff',
      success: '#52c41a',
      warning: '#faad14',
      error: '#ff4d4f',
    }
    return colors[type] || colors.info
  }

  // Generate breadcrumbs
  const pathSnippets = location.pathname.split('/').filter((i) => i)
  const breadcrumbItems = [
    {
      title: <Link to="/dashboard" style={{ color: '#D4AF37' }}>Home</Link>,
    },
    ...pathSnippets.map((_, index) => {
      const url = `/${pathSnippets.slice(0, index + 1).join('/')}`
      const title = pathSnippets[index].charAt(0).toUpperCase() + pathSnippets[index].slice(1)
      return {
        title: index === pathSnippets.length - 1 ? (
          <span style={{ color: '#ffffff' }}>{title}</span>
        ) : (
          <Link to={url} style={{ color: '#D4AF37' }}>{title}</Link>
        ),
      }
    }),
  ]

  const sidebarContent = (
    <>
      {/* Only show logo in sidebar when NOT using drawer (desktop fixed sidebar) */}
      {!useDrawer && (
        <div
          style={{
            height: 64,
            margin: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#D4AF37',
          }}
        >
          {collapsed ? (
            <span style={{ fontSize: 24, fontWeight: 'bold' }}>E</span>
          ) : (
            <img
              src="/espalogo.png"
              alt="ESPA Logo"
              style={{
                maxWidth: '100%',
                transform: 'scale(1.8)',
                maxHeight: '50px',
                objectFit: 'contain',
              }}
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'block'
              }}
            />
          )}
          <span style={{ fontSize: 20, fontWeight: 'bold', display: 'none' }}>
            ESPA CRM
          </span>
        </div>
      )}
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
      />
    </>
  )

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      {useDrawer ? (
        <Drawer
          title={
            <img
              src="/espalogo.png"
              alt="ESPA Logo"
              style={{ maxHeight: '40px', objectFit: 'contain', transform: 'scale(1.2)' }}
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
          }
          placement="left"
          onClose={() => setMobileMenuVisible(false)}
          open={mobileMenuVisible}
          bodyStyle={{ padding: 0, background: '#1a1a1a' }}
          width={250}
        >
          {sidebarContent}
        </Drawer>
      ) : (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={250}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
          }}
          breakpoint="lg"
          collapsedWidth={80}
        >
          {sidebarContent}
        </Sider>
      )}
      <AntLayout 
        className="main-layout-content"
        style={{ 
          marginLeft: useDrawer ? 0 : (collapsed ? 80 : 250), 
          transition: 'all 0.2s',
          minHeight: '100vh',
          width: '100%',
          maxWidth: '100%',
          overflowX: 'hidden',
        }}
      >
        <Header
          style={{
            padding: isMobile ? '0 12px' : '0 24px',
            background: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #333',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {useDrawer ? (
              <MenuUnfoldOutlined
                onClick={() => setMobileMenuVisible(true)}
                style={{ fontSize: 18, color: '#D4AF37', cursor: 'pointer' }}
              />
            ) : (
              React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
                className: 'trigger',
                onClick: () => setCollapsed(!collapsed),
                style: { fontSize: 18, color: '#D4AF37', cursor: 'pointer' },
              })
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 24 }}>
            <Popover
              content={
                <div style={{ width: isMobile ? 280 : 360, maxHeight: 500, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #333' }}>
                    <Typography.Text strong style={{ color: '#D4AF37', fontSize: 16 }}>
                      Notifications
                    </Typography.Text>
                    <Space>
                      {unreadCount > 0 && (
                        <Button
                          type="text"
                          size="small"
                          icon={<CheckOutlined />}
                          onClick={handleMarkAllAsRead}
                          style={{ color: '#D4AF37' }}
                        >
                          Mark all read
                        </Button>
                      )}
                      {notifications.length > 0 && (
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={handleClearAll}
                        >
                          Clear all
                        </Button>
                      )}
                    </Space>
                  </div>
                  
                  {notifications.length === 0 ? (
                    <Empty
                      description={<span style={{ color: '#888' }}>No notifications</span>}
                      style={{ padding: '20px 0' }}
                    />
                  ) : (
                    <div>
                      {notifications.map((notification) => (
                        <div
                          key={notification._id}
                          style={{
                            padding: '12px',
                            marginBottom: 8,
                            background: notification.isRead ? '#1a1a1a' : '#252525',
                            borderRadius: 4,
                            border: `1px solid ${notification.isRead ? '#333' : getNotificationTypeColor(notification.type)}`,
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = notification.isRead ? '#252525' : '#2a2a2a'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = notification.isRead ? '#1a1a1a' : '#252525'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <div
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: getNotificationTypeColor(notification.type),
                                    flexShrink: 0,
                                  }}
                                />
                                <Typography.Text
                                  strong
                                  style={{
                                    color: notification.isRead ? '#888' : '#ffffff',
                                    fontSize: 13,
                                  }}
                                >
                                  {notification.title}
                                </Typography.Text>
                              </div>
                              <Typography.Text
                                style={{
                                  color: notification.isRead ? '#666' : '#aaa',
                                  fontSize: 12,
                                  display: 'block',
                                  marginBottom: 4,
                                }}
                              >
                                {notification.message}
                              </Typography.Text>
                              <Typography.Text
                                style={{
                                  color: '#666',
                                  fontSize: 11,
                                }}
                              >
                                {dayjs(notification.createdAt).format('MMM DD, YYYY HH:mm')}
                              </Typography.Text>
                            </div>
                            {!notification.isRead && (
                              <Button
                                type="text"
                                size="small"
                                icon={<CheckOutlined />}
                                onClick={(e) => handleMarkAsRead(notification._id, e)}
                                style={{
                                  color: '#D4AF37',
                                  padding: '0 4px',
                                  minWidth: 'auto',
                                  height: 'auto',
                                }}
                                title="Mark as read"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #333', textAlign: 'center' }}>
                        {isSuperAdmin() && (
                          <Button
                            type="link"
                            icon={<EyeOutlined />}
                            onClick={handleViewAll}
                            style={{ color: '#D4AF37' }}
                          >
                            View All
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              }
              title={null}
              trigger="click"
              placement="bottomRight"
              open={notificationVisible}
              onOpenChange={setNotificationVisible}
              overlayStyle={{ padding: 0 }}
            >
              <Badge count={unreadCount} offset={[-5, 5]}>
                <BellOutlined 
                  style={{ fontSize: isMobile ? 18 : 20, color: '#ffffff', cursor: 'pointer' }} 
                />
              </Badge>
            </Popover>
            <Dropdown
              menu={{
                items: userMenuItems,
                onClick: handleUserMenuClick,
              }}
              placement="bottomRight"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, cursor: 'pointer' }}>
                <Avatar
                  src="/user.png"
                  size={isMobile ? 'small' : 'default'}
                  icon={<UserOutlined />}
                  onError={() => true}
                />
                {!isMobile && (
                  <span style={{ color: '#ffffff', fontSize: isMobile ? 12 : 14 }}>
                    {user?.name || 'User'}
                  </span>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content
          style={{
            margin: isMobile ? '12px 8px' : '24px 16px',
            padding: isMobile ? '12px 32px 12px 16px' : '24px 48px 24px 32px',
            minHeight: 280,
            background: '#0a0a0a',
            overflowX: 'hidden',
            maxWidth: '100%',
          }}
        >
          <Breadcrumb
            items={breadcrumbItems}
            style={{ marginBottom: isMobile ? 12 : 16 }}
          />
          {children}
        </Content>
      </AntLayout>

      {/* Profile Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <UserOutlined style={{ color: '#D4AF37', fontSize: 20 }} />
            <span style={{ color: '#D4AF37', fontSize: 18, fontWeight: 'bold' }}>Profile</span>
          </div>
        }
        placement="right"
        onClose={() => {
          setProfileDrawerVisible(false)
          setShowChangePasswordForm(false)
          changePasswordForm.resetFields()
        }}
        open={profileDrawerVisible}
        width={isMobile ? '100%' : 400}
        bodyStyle={{ background: '#1a1a1a', padding: 24, display: 'flex', flexDirection: 'column', height: '100%' }}
        headerStyle={{ background: '#1a1a1a', borderBottom: '1px solid #333' }}
      >
        <div style={{ color: '#ffffff', display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* User Information */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <MailOutlined style={{ color: '#D4AF37', fontSize: 16 }} />
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Email</div>
                <div style={{ color: '#ffffff', fontSize: 14 }}>{displayUser?.email || 'N/A'}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <BankOutlined style={{ color: '#D4AF37', fontSize: 16 }} />
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Branch</div>
                <div style={{ color: '#ffffff', fontSize: 14 }}>
                  {displayUser?.branch?.name || 'Not Assigned'}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <SafetyOutlined style={{ color: '#D4AF37', fontSize: 16 }} />
              <div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Role</div>
                <div style={{ color: '#D4AF37', fontSize: 14, fontWeight: 'bold' }}>
                  {displayUser?.role ? displayUser.role.charAt(0).toUpperCase() + displayUser.role.slice(1) : 'Staff'}
                </div>
              </div>
            </div>
          </div>

          <Divider style={{ borderColor: '#333', margin: '24px 0' }} />

          {/* Change Password Section - Only for Super Admin */}
          {isSuperAdmin() && (
            <div style={{ marginBottom: 32 }}>
              {!showChangePasswordForm ? (
                <Button
                  type="primary"
                  icon={<LockOutlined />}
                  onClick={() => setShowChangePasswordForm(true)}
                  block
                  size="large"
                  style={{
                    background: '#D4AF37',
                    borderColor: '#D4AF37',
                    color: '#000',
                    fontWeight: 'bold',
                  }}
                >
                  Change Password
                </Button>
              ) : (
                <div>
                  <div style={{ color: '#D4AF37', fontSize: 16, fontWeight: 'bold', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LockOutlined />
                    Change Password
                  </div>
                  <Form
                    form={changePasswordForm}
                    onFinish={handleChangePassword}
                    layout="vertical"
                    requiredMark={false}
                  >
                    <Form.Item
                      name="currentPassword"
                      label={<span style={{ color: '#ffffff' }}>Current Password</span>}
                      rules={[{ required: true, message: 'Please enter current password' }]}
                    >
                      <Input.Password
                        placeholder="Enter current password"
                        style={{ background: '#0a0a0a', border: '1px solid #333', color: '#ffffff' }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="newPassword"
                      label={<span style={{ color: '#ffffff' }}>New Password</span>}
                      rules={[
                        { required: true, message: 'Please enter new password' },
                        { min: 6, message: 'Password must be at least 6 characters' },
                      ]}
                    >
                      <Input.Password
                        placeholder="Enter new password"
                        style={{ background: '#0a0a0a', border: '1px solid #333', color: '#ffffff' }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="confirmPassword"
                      label={<span style={{ color: '#ffffff' }}>Confirm New Password</span>}
                      dependencies={['newPassword']}
                      rules={[
                        { required: true, message: 'Please confirm new password' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) {
                              return Promise.resolve()
                            }
                            return Promise.reject(new Error('Passwords do not match'))
                          },
                        }),
                      ]}
                    >
                      <Input.Password
                        placeholder="Confirm new password"
                        style={{ background: '#0a0a0a', border: '1px solid #333', color: '#ffffff' }}
                      />
                    </Form.Item>
                    <Form.Item>
                      <Space style={{ width: '100%' }} direction="vertical" size="middle">
                        <Button
                          type="primary"
                          htmlType="submit"
                          block
                          style={{
                            background: '#D4AF37',
                            borderColor: '#D4AF37',
                            color: '#000',
                            fontWeight: 'bold',
                          }}
                        >
                          Change Password
                        </Button>
                        <Button
                          onClick={() => {
                            setShowChangePasswordForm(false)
                            changePasswordForm.resetFields()
                          }}
                          block
                          style={{
                            borderColor: '#333',
                            color: '#ffffff',
                          }}
                        >
                          Cancel
                        </Button>
                      </Space>
                    </Form.Item>
                  </Form>
                </div>
              )}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 20 }}></div>

          <Divider style={{ borderColor: '#333', margin: '24px 0' }} />

          {/* Logout Button */}
          <Button
            type="primary"
            danger
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            block
            size="large"
          >
            Logout
          </Button>
        </div>
      </Drawer>
    </AntLayout>
  )
}

export default Layout
