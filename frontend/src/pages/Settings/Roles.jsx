import React, { useState, useEffect } from 'react'
import { Table, Checkbox, Button, Space, App } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetRolesQuery,
  useUpdateRoleMutation,
  useInitializeRolesMutation,
} from '../../store/api/roleApi'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import MotionButton from '../../components/MotionButton'

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
    { key: 'calls', name: 'Call Records' },
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
      <div className="mgmt-empty-permission">
        <p className="mgmt-body-text">Only Super Admin can manage role permissions.</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="mgmt-empty-permission">Loading...</div>
  }

  if (localRoles.length === 0) {
    return (
      <div className="mgmt-empty-permission">
        <p>No roles found. Please initialize roles first.</p>
        <Button type="primary" onClick={handleInitialize} loading={initLoading}>
          Initialize Roles
        </Button>
      </div>
    )
  }

  return (
    <PageLayout>
      <PageHeader
        title="Role Management"
        extra={
          <Space wrap>
            <Button type="default" onClick={handleInitialize} loading={initLoading} size={isMobile ? 'small' : 'middle'}>
              Initialize
            </Button>
            <MotionButton
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={updateLoading}
              size={isMobile ? 'small' : 'middle'}
            >
              {isMobile ? 'Save' : 'Save Permissions'}
            </MotionButton>
          </Space>
        }
      />

      <ContentCard staggerIndex={0} compact>
        <p className="roles-legend-text mgmt-body-text">
          <strong>Legend:</strong> C = Create, R = Read, E = Edit, D = Delete
        </p>
      </ContentCard>

      <ContentCard staggerIndex={1} className="ds-table-shell" innerClassName="ds-content-card__inner--flush">
        <div className="table-responsive-wrapper">
          <Table
            columns={columns}
            dataSource={modules}
            pagination={false}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
          />
        </div>
      </ContentCard>
    </PageLayout>
  )
}

export default Roles
