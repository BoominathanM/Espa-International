import React, { useState, useEffect } from 'react'
import { Layout as AntLayout, Menu, Avatar, Dropdown, Badge, Breadcrumb, Drawer } from 'antd'
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
} from '@ant-design/icons'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasPermission } from '../utils/permissions'
import { useResponsive } from '../hooks/useResponsive'

const { Header, Sider, Content } = AntLayout

const Layout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false)
  const { isMobile, isTablet, isSmallLaptop } = useResponsive()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

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

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const userMenuItems = [
    {
      key: 'user-info',
      label: (
        <div style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
          <div style={{ color: '#ffffff', fontWeight: 'bold', marginBottom: 4 }}>
            {user?.name || 'User'}
          </div>
          <div style={{ color: '#D4AF37', fontSize: 12 }}>
            {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Staff'}
          </div>
        </div>
      ),
      disabled: true,
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
    if (key === 'logout') {
      handleLogout()
    }
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
            <Badge count={5}>
              <BellOutlined style={{ fontSize: isMobile ? 18 : 20, color: '#ffffff', cursor: 'pointer' }} />
            </Badge>
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
                  <>
                    <span style={{ color: '#ffffff', fontSize: isMobile ? 12 : 14 }}>
                      {user?.name || 'User'}
                    </span>
                    <span style={{ color: '#D4AF37', fontSize: 12 }}>
                      ({user?.role || 'staff'})
                    </span>
                  </>
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
    </AntLayout>
  )
}

export default Layout
