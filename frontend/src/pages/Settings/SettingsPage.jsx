import React, { useState, useEffect } from 'react'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import Users from './Users'
import Branch from './Branch'
import API from './API'
import Logs from './Logs'
import { canRead } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import { PageLayout, PageHeader } from '../../components/ds-layout'

const Settings = () => {
  const { isMobile } = useResponsive()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('users')
  
  // Check for tab parameter in URL
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'notifications') {
      setActiveTab('logs')
      // Also need to set the active tab in Logs component
    }
  }, [searchParams])
  
  if (!canRead('settings')) {
    return (
      <div className="mgmt-empty-permission">
        You don&apos;t have permission to access settings.
      </div>
    )
  }

  const tabItems = [
    {
      key: 'users',
      label: 'User Management',
      children: <Users />,
    },
    {
      key: 'branch',
      label: 'Branch Configuration',
      children: <Branch />,
    },
    {
      key: 'api',
      label: 'API & Integrations',
      children: <API />,
    },
    {
      key: 'logs',
      label: 'System Logs',
      children: <Logs defaultActiveTab={searchParams.get('tab') === 'notifications' ? 'notifications' : undefined} />,
    },
  ]

  const handleTabChange = (key) => {
    setActiveTab(key)
    // Remove tab parameter when switching tabs
    if (searchParams.get('tab')) {
      setSearchParams({})
    }
  }

  return (
    <PageLayout className="ds-settings-shell mgmt-page">
      <PageHeader title="System Settings" stackOnMobile={false} />
      <Tabs
        className="mgmt-tabs"
        items={tabItems}
        activeKey={activeTab}
        onChange={handleTabChange}
        type={isMobile ? 'card' : 'line'}
        size={isMobile ? 'small' : 'middle'}
      />
    </PageLayout>
  )
}

export default Settings
