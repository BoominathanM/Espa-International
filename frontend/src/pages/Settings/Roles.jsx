import React, { useState } from 'react'
import { Card, Table, Checkbox, Button, Space, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'

const Roles = () => {
  const { isMobile } = useResponsive()
  const [roles, setRoles] = useState([
    {
      key: 'superadmin',
      role: 'Super Admin',
      modules: {
        dashboard: ['read'],
        leads: ['create', 'read', 'edit', 'delete'],
        calls: ['create', 'read', 'edit', 'delete'],
        chats: ['create', 'read', 'edit', 'delete'],
        customers: ['create', 'read', 'edit', 'delete'],
        reports: ['read'],
        settings: ['create', 'read', 'edit', 'delete'],
      },
    },
    {
      key: 'admin',
      role: 'Admin',
      modules: {
        dashboard: ['read'],
        leads: ['create', 'read', 'edit', 'delete'],
        calls: ['read'],
        chats: ['read', 'edit'],
        customers: ['read', 'edit'],
        reports: ['read'],
        settings: ['read'],
      },
    },
    {
      key: 'supervisor',
      role: 'Supervisor',
      modules: {
        dashboard: ['read'],
        leads: ['create', 'read', 'edit'],
        calls: ['read'],
        chats: ['read', 'edit'],
        customers: ['read', 'edit'],
        reports: ['read'],
        settings: [],
      },
    },
    {
      key: 'staff',
      role: 'Staff',
      modules: {
        dashboard: ['read'],
        leads: ['read', 'edit'],
        calls: ['read'],
        chats: ['read', 'edit'],
        customers: ['read'],
        reports: [],
        settings: [],
      },
    },
  ])

  const modules = [
    { key: 'dashboard', name: 'Dashboard' },
    { key: 'leads', name: 'Lead Management' },
    { key: 'calls', name: 'Call Management' },
    { key: 'chats', name: 'WhatsApp & AI Chat' },
    { key: 'customers', name: 'Customer Management' },
    { key: 'reports', name: 'Reports & Analytics' },
    { key: 'settings', name: 'System Settings' },
  ]

  const permissions = ['create', 'read', 'edit', 'delete']

  const handlePermissionChange = (roleKey, moduleKey, permission, checked) => {
    setRoles(
      roles.map((role) => {
        if (role.key === roleKey) {
          const modulePermissions = role.modules[moduleKey] || []
          if (checked) {
            return {
              ...role,
              modules: {
                ...role.modules,
                [moduleKey]: [...modulePermissions, permission],
              },
            }
          } else {
            return {
              ...role,
              modules: {
                ...role.modules,
                [moduleKey]: modulePermissions.filter((p) => p !== permission),
              },
            }
          }
        }
        return role
      })
    )
  }

  const handleSave = () => {
    message.success('Permissions saved successfully')
    // In production, this would save to backend
  }

  const columns = [
    {
      title: 'Module',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    ...roles.map((role) => ({
      title: role.role,
      key: role.key,
      render: (_, module) => (
        <Space>
          {permissions.map((permission) => (
            <Checkbox
              key={permission}
              checked={
                role.modules[module.key]?.includes(permission) || false
              }
              onChange={(e) =>
                handlePermissionChange(role.key, module.key, permission, e.target.checked)
              }
            >
              {permission.charAt(0).toUpperCase()}
            </Checkbox>
          ))}
        </Space>
      ),
    })),
  ]

  if (!isSuperAdmin()) {
    return (
      <div style={{ textAlign: 'center', padding: 50, color: '#ffffff' }}>
        <p>Only Super Admin can manage role permissions.</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', position: 'relative' }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        marginBottom: 16,
        gap: 12,
      }}>
        <h2 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>Role Management</h2>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} size={isMobile ? 'small' : 'middle'}>
          {isMobile ? 'Save' : 'Save Permissions'}
        </Button>
      </div>

      <Card style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 16 }}>
        <p style={{ color: '#ffffff', marginBottom: 8 }}>
          <strong>Legend:</strong> C = Create, R = Read, E = Edit, D = Delete
        </p>
      </Card>

      <div className="table-responsive-wrapper">
        <Table
          columns={columns}
          dataSource={modules}
          pagination={false}
          style={{ background: '#1a1a1a' }}
          scroll={{ x: 'max-content' }}
          size={isMobile ? 'small' : 'middle'}
        />
      </div>
    </div>
  )
}

export default Roles
