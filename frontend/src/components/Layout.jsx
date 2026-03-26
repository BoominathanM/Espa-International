import React, { useState, useEffect } from 'react'
import { Layout as AntLayout, Menu, Avatar, Dropdown, Badge, Breadcrumb, Drawer, Form, Input, Button, message, Space, Divider, Empty, Typography, Popover, Tooltip } from 'antd'
import {
  DashboardOutlined,
  UserOutlined,
  PhoneOutlined,
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
  CalendarOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons'
import { AnimatePresence, motion } from 'framer-motion'
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
import { useThemeMode } from '../hooks/useThemeMode'
import AnimatedWrapper from './AnimatedWrapper'

const { Header, Sider, Content } = AntLayout
const PERMISSION_LABELS = {
  dashboard: 'Dashboard',
  leads: 'Lead Management',
  appointmentBookings: 'Appointment Bookings',
  calls: 'Call Records',
  customers: 'Customer Management',
  reports: 'Reports & Analytics',
  settings: 'System Settings',
}

const Layout = ({ children }) => {
  const { isDark, toggleTheme } = useThemeMode()
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
        branches: Array.isArray(currentUserData.user.branches) ? currentUserData.user.branches : [],
        allBranches: Boolean(currentUserData.user.allBranches),
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
  const assignedBranches = Array.isArray(displayUser?.branches) ? displayUser.branches : []
  const visibleBranchList =
    assignedBranches.length > 0 ? assignedBranches : (displayUser?.branch ? [displayUser.branch] : [])
  const permissionsMap = displayUser?.permissions && typeof displayUser.permissions === 'object'
    ? displayUser.permissions
    : {}
  const permissionItems = Object.entries(permissionsMap)
    .filter(([, actions]) => Array.isArray(actions) && actions.length > 0)
    .map(([moduleKey, actions]) => ({
      key: moduleKey,
      label: PERMISSION_LABELS[moduleKey] || moduleKey,
      actions: [...actions].map((a) => String(a)).sort(),
    }))

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
      label: 'Call Records',
      permission: 'calls:read',
    },
    {
      key: '/appointment-bookings',
      icon: <CalendarOutlined />,
      label: 'Appointment Bookings',
      permission: 'appointmentBookings:read',
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
      title: (
        <Link to="/dashboard" className="app-breadcrumb-link">
          Home
        </Link>
      ),
    },
    ...pathSnippets.map((_, index) => {
      const url = `/${pathSnippets.slice(0, index + 1).join('/')}`
      const title = pathSnippets[index].charAt(0).toUpperCase() + pathSnippets[index].slice(1)
      return {
        title:
          index === pathSnippets.length - 1 ? (
            <span className="app-breadcrumb-current">{title}</span>
          ) : (
            <Link to={url} className="app-breadcrumb-link">
              {title}
            </Link>
          ),
      }
    }),
  ]

  const sidebarContent = (
    <>
      {/* Only show logo in sidebar when NOT using drawer (desktop fixed sidebar) */}
      {!useDrawer && (
        <div className="app-sidebar-logo">
          {collapsed ? (
            <span className="app-sidebar-logo-letter">E</span>
          ) : (
            <img
              src="/espalogo.png"
              alt="ESPA Logo"
              className="app-sidebar-logo-img"
              onError={(e) => {
                e.target.classList.add('app-sidebar-logo-img--hidden')
                e.target.nextSibling.classList.add('app-sidebar-logo-fallback--visible')
              }}
            />
          )}
          <span className="app-sidebar-logo-fallback">ESPA CRM</span>
        </div>
      )}
      <Menu
        theme={isDark ? 'dark' : 'light'}
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        className="app-sidebar-menu"
      />
    </>
  )

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      {useDrawer ? (
        <Drawer
          title={<img src="/espalogo.png" alt="ESPA Logo" className="app-drawer-logo" onError={(e) => { e.target.classList.add('app-sidebar-logo-img--hidden') }} />}
          placement="left"
          onClose={() => setMobileMenuVisible(false)}
          open={mobileMenuVisible}
          bodyStyle={{ padding: 0, background: 'var(--sidebar-bg)' }}
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
          className="app-layout-sider"
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            background: 'var(--sidebar-bg)',
            borderRight: '1px solid var(--border-color)',
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
        <Header className="app-layout-header">
          <div className="app-header-toolbar">
            {useDrawer ? (
              <MenuUnfoldOutlined onClick={() => setMobileMenuVisible(true)} className="app-trigger-icon app-trigger-icon--md" />
            ) : (
              React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
                className: 'trigger app-trigger-icon app-trigger-icon--md',
                onClick: () => setCollapsed(!collapsed),
              })
            )}
          </div>
          <div className={`app-header-toolbar app-header-toolbar--tight`}>
            <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
              <motion.button
                type="button"
                className="app-theme-toggle"
                onClick={toggleTheme}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {isDark ? <SunOutlined /> : <MoonOutlined />}
              </motion.button>
            </Tooltip>
            <Popover
              content={
                <div className="app-notification-popover" style={{ width: isMobile ? 280 : 360 }}>
                  <div className="app-notification-popover__header">
                    <span className="app-notification-popover__heading">Notifications</span>
                    <Space className="app-notification-popover__actions" size={4} wrap>
                      {unreadCount > 0 && (
                        <Button
                          type="text"
                          size="small"
                          icon={<CheckOutlined />}
                          onClick={handleMarkAllAsRead}
                        >
                          Mark all read
                        </Button>
                      )}
                      {notifications.length > 0 && (
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={handleClearAll}>
                          Clear all
                        </Button>
                      )}
                    </Space>
                  </div>

                  {notifications.length === 0 ? (
                    <Empty className="app-notification-popover__empty" description="No notifications" style={{ padding: '20px 0' }} />
                  ) : (
                    <div>
                      {notifications.map((notification) => {
                        const typeColor = getNotificationTypeColor(notification.type)
                        const isRead = notification.isRead
                        return (
                          <div
                            key={notification._id}
                            className={`app-notification-popover__item ${isRead ? 'app-notification-popover__item--read' : 'app-notification-popover__item--unread'}`}
                            style={
                              !isRead
                                ? { border: `1px solid ${typeColor}` }
                                : undefined
                            }
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <div
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      background: typeColor,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Typography.Text
                                    strong
                                    className={`app-notification-popover__item-title ${isRead ? 'app-notification-popover__item-title--read' : 'app-notification-popover__item-title--unread'}`}
                                  >
                                    {notification.title}
                                  </Typography.Text>
                                </div>
                                <Typography.Text
                                  className={`app-notification-popover__item-msg ${isRead ? 'app-notification-popover__item-msg--read' : 'app-notification-popover__item-msg--unread'}`}
                                >
                                  {notification.message}
                                </Typography.Text>
                                <Typography.Text className="app-notification-popover__item-time">
                                  {dayjs(notification.createdAt).format('MMM DD, YYYY HH:mm')}
                                </Typography.Text>
                              </div>
                              {!isRead && (
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<CheckOutlined />}
                                  className="app-notification-popover__mark-read"
                                  onClick={(e) => handleMarkAsRead(notification._id, e)}
                                  title="Mark as read"
                                />
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <div className="app-notification-popover__footer">
                        {isSuperAdmin() && (
                          <Button type="link" icon={<EyeOutlined />} className="app-notification-popover__view-all" onClick={handleViewAll}>
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
              overlayClassName="app-notification-popover-wrap"
            >
              <Badge count={unreadCount} offset={[-5, 5]}>
                <BellOutlined className="app-header-icon" style={{ fontSize: isMobile ? 18 : 20, cursor: 'pointer' }} />
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
                {!isMobile && <span className="app-header-user-name">{user?.name || 'User'}</span>}
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content className="app-main-content">
          <Breadcrumb items={breadcrumbItems} className="app-breadcrumb" style={{ marginBottom: isMobile ? 12 : 16 }} />
          <AnimatePresence mode="wait">
            <AnimatedWrapper key={location.pathname} variant="page" className="app-page-inner">
              {children}
            </AnimatedWrapper>
          </AnimatePresence>
        </Content>
      </AntLayout>

      {/* Profile Drawer — themed via .profile-drawer (light/dark) */}
      <Drawer
        rootClassName="profile-drawer"
        title={
          <div className="profile-drawer__title-wrap">
            <UserOutlined className="profile-drawer__title-icon" />
            <span className="profile-drawer__title-text">Profile</span>
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
      >
        <div className="profile-drawer__body">
          <div className="profile-drawer__section">
            <div className="profile-drawer__row">
              <MailOutlined className="profile-drawer__row-icon" />
              <div>
                <div className="profile-drawer__label">Email</div>
                <div className="profile-drawer__value">{displayUser?.email || 'N/A'}</div>
              </div>
            </div>
            <div className="profile-drawer__row">
              <BankOutlined className="profile-drawer__row-icon" />
              <div>
                <div className="profile-drawer__label">Assigned Branches ({visibleBranchList.length})</div>
                <div className="profile-drawer__value">
                  {visibleBranchList.length > 0
                    ? visibleBranchList.map((branch) => branch?.name).filter(Boolean).join(', ')
                    : 'Not Assigned'}
                </div>
              </div>
            </div>
            <div className="profile-drawer__row">
              <SafetyOutlined className="profile-drawer__row-icon" />
              <div>
                <div className="profile-drawer__label">Permissions</div>
                <div className="profile-drawer__value">
                  {permissionItems.length > 0
                    ? permissionItems.map((item) => `${item.label}: ${item.actions.join(', ')}`).join(' | ')
                    : 'No Permissions'}
                </div>
              </div>
            </div>
            <div className="profile-drawer__row">
              <SafetyOutlined className="profile-drawer__row-icon" />
              <div>
                <div className="profile-drawer__label">Role</div>
                <div className="profile-drawer__role">
                  {displayUser?.role ? displayUser.role.charAt(0).toUpperCase() + displayUser.role.slice(1) : 'Staff'}
                </div>
              </div>
            </div>
          </div>

          <Divider className="profile-drawer__divider" />

          {isSuperAdmin() && (
            <div className="profile-drawer__section profile-drawer__section--spaced">
              {!showChangePasswordForm ? (
                <Button
                  type="primary"
                  icon={<LockOutlined />}
                  onClick={() => setShowChangePasswordForm(true)}
                  block
                  size="large"
                  className="profile-drawer__btn-primary"
                >
                  Change Password
                </Button>
              ) : (
                <div>
                  <div className="profile-drawer__subsection-title">
                    <LockOutlined />
                    Change Password
                  </div>
                  <Form
                    form={changePasswordForm}
                    onFinish={handleChangePassword}
                    layout="vertical"
                    requiredMark={false}
                    className="profile-drawer__form"
                  >
                    <Form.Item
                      name="currentPassword"
                      label={<span className="profile-drawer__form-label">Current Password</span>}
                      rules={[{ required: true, message: 'Please enter current password' }]}
                    >
                      <Input.Password placeholder="Enter current password" className="profile-drawer__input" />
                    </Form.Item>
                    <Form.Item
                      name="newPassword"
                      label={<span className="profile-drawer__form-label">New Password</span>}
                      rules={[
                        { required: true, message: 'Please enter new password' },
                        { min: 6, message: 'Password must be at least 6 characters' },
                      ]}
                    >
                      <Input.Password placeholder="Enter new password" className="profile-drawer__input" />
                    </Form.Item>
                    <Form.Item
                      name="confirmPassword"
                      label={<span className="profile-drawer__form-label">Confirm New Password</span>}
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
                      <Input.Password placeholder="Confirm new password" className="profile-drawer__input" />
                    </Form.Item>
                    <Form.Item>
                      <Space className="profile-drawer__form-actions" direction="vertical" size="middle">
                        <Button type="primary" htmlType="submit" block className="profile-drawer__btn-primary">
                          Change Password
                        </Button>
                        <Button
                          onClick={() => {
                            setShowChangePasswordForm(false)
                            changePasswordForm.resetFields()
                          }}
                          block
                          className="profile-drawer__btn-secondary"
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

          <div className="profile-drawer__spacer" />

          <Divider className="profile-drawer__divider" />

          <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout} block size="large">
            Logout
          </Button>
        </div>
      </Drawer>
    </AntLayout>
  )
}

export default Layout
