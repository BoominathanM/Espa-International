import React, { useState } from 'react'
import { Tabs } from 'antd'
import Users from './Users'
import Roles from './Roles'
import Branch from './Branch'
import Numbers from './Numbers'
import API from './API'
import Logs from './Logs'
import { canRead } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'

const Settings = () => {
  const { isMobile } = useResponsive()
  
  if (!canRead('settings')) {
    return (
      <div style={{ textAlign: 'center', padding: 50, color: '#888' }}>
        You don't have permission to access settings.
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
      key: 'roles',
      label: 'Role Management',
      children: <Roles />,
    },
    {
      key: 'branch',
      label: 'Branch Configuration',
      children: <Branch />,
    },
    {
      key: 'numbers',
      label: 'Number Configuration',
      children: <Numbers />,
    },
    {
      key: 'api',
      label: 'API & Integrations',
      children: <API />,
    },
    {
      key: 'logs',
      label: 'System Logs',
      children: <Logs />,
    },
  ]

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', position: 'relative' }}>
      <h1 style={{ color: '#D4AF37', marginBottom: 24, fontSize: isMobile ? '20px' : '24px' }}>System Settings</h1>
      <Tabs 
        items={tabItems} 
        type={isMobile ? 'card' : 'line'}
        size={isMobile ? 'small' : 'middle'}
      />
    </div>
  )
}

export default Settings
