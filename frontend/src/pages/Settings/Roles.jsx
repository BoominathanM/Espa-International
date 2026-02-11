import React, { useState, useEffect } from 'react'
import { Card, Table, Checkbox, Button, Space, App } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetRolesQuery,
  useUpdateRoleMutation,
  useInitializeRolesMutation,
} from '../../store/api/roleApi'

const Roles = () => {
  const { message } = App.useApp()
  const { isMobile } = useResponsive()
  const { data: rolesData, isLoading, refetch } = useGetRolesQuery()
  const [updateRole, { isLoading: updateLoading }] = useUpdateRoleMutation()
  const [initializeRoles, { isLoading: initLoading }] = useInitializeRolesMutation()

  const [localRoles, setLocalRoles] = useState([])

  useEffect(() => {
    if (rolesData?.roles) {
      setLocalRoles(rolesData.roles)
    }
  }, [rolesData])

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

  const handlePermissionChange = (roleName, moduleKey, permission, checked) => {
    setLocalRoles(
      localRoles.map((role) => {
        if (role.name === roleName) {
          const currentPermissions = role.permissions?.[moduleKey] || []
          const newPermissions = checked
            ? [...currentPermissions, permission]
            : currentPermissions.filter((p) => p !== permission)

          return {
            ...role,
            permissions: {
              ...role.permissions,
              [moduleKey]: newPermissions,
            },
          }
        }
        return role
      })
    )
  }

  const handleSave = async () => {
    try {
      // Save all role changes
      const updatePromises = localRoles.map((role) =>
        updateRole({
          name: role.name,
          permissions: role.permissions,
        }).unwrap()
      )

      await Promise.all(updatePromises)
      message.success('Permissions saved successfully')
      refetch()
    } catch (error) {
      message.error(error?.data?.message || 'Failed to save permissions')
    }
  }

  const handleInitialize = async () => {
    try {
      await initializeRoles().unwrap()
      message.success('Roles initialized successfully')
      refetch()
    } catch (error) {
      message.error(error?.data?.message || 'Failed to initialize roles')
    }
  }

  const columns = [
    {
      title: 'Module',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    ...localRoles.map((role) => ({
      title: role.displayName || role.name,
      key: role.name,
      render: (_, module) => (
        <Space>
          {permissions.map((permission) => (
            <Checkbox
              key={permission}
              checked={
                localRoles
                  .find((r) => r.name === role.name)
                  ?.permissions?.[module.key]?.includes(permission) || false
              }
              onChange={(e) =>
                handlePermissionChange(role.name, module.key, permission, e.target.checked)
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

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: 50, color: '#ffffff' }}>Loading...</div>
  }

  if (localRoles.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 50, color: '#ffffff' }}>
        <p>No roles found. Please initialize roles first.</p>
        <Button type="primary" onClick={handleInitialize} loading={initLoading}>
          Initialize Roles
        </Button>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
        }}
      >
        <h2 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>
          Role Management
        </h2>
        <Space>
          <Button
            type="default"
            onClick={handleInitialize}
            loading={initLoading}
            size={isMobile ? 'small' : 'middle'}
          >
            Initialize
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={updateLoading}
            size={isMobile ? 'small' : 'middle'}
          >
            {isMobile ? 'Save' : 'Save Permissions'}
          </Button>
        </Space>
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
