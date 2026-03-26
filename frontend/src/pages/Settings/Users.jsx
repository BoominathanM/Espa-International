import React, { useMemo, useState } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Tag,
  App,
  Row,
  Col,
  Dropdown,
  Spin,
  Alert,
  Checkbox,
  Switch,
  Divider,
} from 'antd'
import { PlusOutlined, EditOutlined, MoreOutlined, StopOutlined } from '@ant-design/icons'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import MotionButton from '../../components/MotionButton'
import { getDefaultPermissions, isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetUsersQuery,
  useGetUserRoleCountsQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useLazyGetDisablePreviewQuery,
  useDisableUserMutation,
} from '../../store/api/userApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import { useCreateRoleMutation, useDeleteRoleMutation, useGetRolesQuery } from '../../store/api/roleApi'
import { countryCodes, parsePhoneNumber, formatPhoneNumber } from '../../utils/countryCodes'

const { Option } = Select

const PERMISSION_MODULES = [
  { key: 'dashboard', name: 'Dashboard' },
  { key: 'leads', name: 'Lead Management' },
  { key: 'appointmentBookings', name: 'Appointment Bookings' },
  { key: 'calls', name: 'Call Records' },
  { key: 'customers', name: 'Customer Management' },
  { key: 'reports', name: 'Reports & Analytics' },
  { key: 'settings', name: 'System Settings' },
]

const CRUD_PERMISSIONS = ['create', 'read', 'edit', 'delete']
const ALL_BRANCH_OPTION = '__ALL__'
const LOCKED_RED_PERMISSIONS = {
  dashboard: ['create', 'edit', 'delete'],
  calls: ['create', 'edit', 'delete'],
  customers: ['delete'],
  reports: ['create', 'edit', 'delete'],
}

const sanitizePermissionDraft = (permissions = {}) => {
  const sanitized = {}
  Object.keys(permissions || {}).forEach((moduleKey) => {
    const actions = Array.isArray(permissions[moduleKey]) ? permissions[moduleKey] : []
    const lockedActions = LOCKED_RED_PERMISSIONS[moduleKey] || []
    sanitized[moduleKey] = actions.filter((action) => !lockedActions.includes(action))
  })
  return sanitized
}

const Users = () => {
  const { message } = App.useApp()
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91')
  const [hasCustomPermissions, setHasCustomPermissions] = useState(true)
  const [permissionDraft, setPermissionDraft] = useState({})
  const [newRoleInput, setNewRoleInput] = useState('')
  const [removeRoleValue, setRemoveRoleValue] = useState('')
  const [disableModalOpen, setDisableModalOpen] = useState(false)
  const [disableTarget, setDisableTarget] = useState(null)
  const [disableForm] = Form.useForm()

  // API hooks
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useGetUsersQuery()
  const { data: roleCountsData } = useGetUserRoleCountsQuery()
  const { data: rolesData, refetch: refetchRoles } = useGetRolesQuery()
  const { data: branchesData, refetch: refetchBranches } = useGetBranchesQuery()
  const [createRole, { isLoading: createRoleLoading }] = useCreateRoleMutation()
  const [deleteRole, { isLoading: deleteRoleLoading }] = useDeleteRoleMutation()
  const [createUser, { isLoading: createLoading }] = useCreateUserMutation()
  const [updateUser, { isLoading: updateLoading }] = useUpdateUserMutation()
  const [fetchDisablePreview, { data: disablePreview, isFetching: disablePreviewLoading }] =
    useLazyGetDisablePreviewQuery()
  const [disableUser, { isLoading: disableSubmitting }] = useDisableUserMutation()

  const users = usersData?.users || []
  const branches = branchesData?.branches || []
  const roleCounts = roleCountsData?.roleCounts || {}
  const roleNamesFromDb = (rolesData?.roles || []).map((r) => r.name).filter(Boolean)
  const normalizedRoleOptions = useMemo(() => {
    const roleSet = new Set(roleNamesFromDb)
    users.forEach((u) => {
      if (u?.role) roleSet.add(String(u.role))
    })
    return [...roleSet]
  }, [roleNamesFromDb, users])

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        const colors = {
          superadmin: 'red',
          admin: 'orange',
          supervisor: 'blue',
          staff: 'green',
        }
        return <Tag color={colors[role]}>{role.toUpperCase()}</Tag>
      },
    },
    {
      title: 'Branch',
      key: 'branch',
      render: (_, record) => {
        if (record.allBranches) return <Tag color="purple">All</Tag>
        const recordBranches = Array.isArray(record.branches) ? record.branches : []
        if (recordBranches.length > 0) {
          return (
            <Space wrap>
              {recordBranches.map((b) => (
                <Tag key={b._id || b.id || b}>{typeof b === 'object' ? b.name : String(b)}</Tag>
              ))}
            </Space>
          )
        }
        const branch = record.branch
        return branch ? (typeof branch === 'object' ? branch.name : branch) : 'Not Assigned'
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Phone Number',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone) => phone || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 72,
      align: 'center',
      render: (_, record) =>
        isSuperAdmin() ? (
          <Dropdown
            menu={{
              items: [
                { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
                ...(record.status === 'active'
                  ? [
                      { type: 'divider' },
                      {
                        key: 'disable',
                        label: 'Disable user',
                        icon: <StopOutlined />,
                        danger: true,
                      },
                    ]
                  : []),
              ],
              onClick: ({ key, domEvent }) => {
                domEvent?.stopPropagation()
                if (key === 'edit') handleEdit(record)
                if (key === 'disable') openDisableModal(record)
              },
            }}
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="settings-actions-dropdown"
          >
            <Button
              type="text"
              icon={<MoreOutlined className="settings-table-action-icon" />}
              aria-label="User actions"
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        ) : null,
    },
  ]

  const handleAdd = () => {
    setSelectedUser(null)
    setSelectedCountryCode('+91')
    setHasCustomPermissions(true)
    const defaultPermissions = sanitizePermissionDraft(getDefaultPermissions('staff'))
    setPermissionDraft(defaultPermissions)
    setNewRoleInput('')
    form.resetFields()
    form.setFieldsValue({
      role: 'staff',
      status: 'active',
      countryCode: '+91',
      permissions: defaultPermissions,
    })
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedUser(record)
    const branchIds = Array.isArray(record.branches)
      ? record.branches.map((b) => b?._id || b?.id || b).filter(Boolean)
      : record.branch
      ? [record.branch?._id || record.branch?.id || record.branch]
      : []
    const selectedBranches = record.allBranches ? [ALL_BRANCH_OPTION] : branchIds
    const customPermissions = record.permissions || {}
    const editablePermissions =
      Object.keys(customPermissions).length > 0 ? customPermissions : getDefaultPermissions(record.role || 'staff')
    
    // Parse phone number if exists
    let phoneNumber = ''
    let countryCode = '+91'
    if (record.phone) {
      const parsed = parsePhoneNumber(record.phone)
      countryCode = parsed.dialCode
      phoneNumber = parsed.number
    }
    
    setSelectedCountryCode(countryCode)
    setHasCustomPermissions(true)
    const sanitizedPermissions = sanitizePermissionDraft(editablePermissions)
    setPermissionDraft(sanitizedPermissions)
    setNewRoleInput('')
    form.setFieldsValue({
      ...record,
      branches: selectedBranches,
      phoneNumber: phoneNumber,
      countryCode: countryCode,
      cloudAgentAgentId: record.cloudAgentAgentId || '',
      permissions: sanitizedPermissions,
    })
    setIsModalVisible(true)
  }

  const openDisableModal = (record) => {
    setDisableTarget(record)
    disableForm.resetFields()
    setDisableModalOpen(true)
    fetchDisablePreview(record._id || record.id)
  }

  const closeDisableModal = () => {
    setDisableModalOpen(false)
    setDisableTarget(null)
    disableForm.resetFields()
  }

  const handleConfirmDisable = async () => {
    if (!disableTarget) return
    const id = disableTarget._id || disableTarget.id
    try {
      const needs = disablePreview?.needsReassignment
      let reassignToUserId
      if (needs) {
        const values = await disableForm.validateFields(['reassignToUserId'])
        reassignToUserId = values.reassignToUserId
      }
      await disableUser({ id, reassignToUserId }).unwrap()
      message.success('User disabled successfully')
      closeDisableModal()
      refetchUsers()
      refetchBranches()
    } catch (e) {
      if (e?.errorFields) throw e
      message.error(e?.data?.message || e?.message || 'Failed to disable user')
      throw e
    }
  }

  const handleSubmit = async (values) => {
    try {
      // Format phone number with country code
      const fullPhoneNumber = values.phoneNumber
        ? formatPhoneNumber(values.countryCode || selectedCountryCode, values.phoneNumber)
        : ''
      
      const formData = {
        ...values,
        phone: fullPhoneNumber || '',
        permissions: sanitizePermissionDraft(permissionDraft || {}),
        allBranches: (values.branches || []).includes(ALL_BRANCH_OPTION),
        branches: (values.branches || []).filter((id) => id !== ALL_BRANCH_OPTION),
      }

      if (!values.branches || values.branches.length === 0) {
        message.error('Branch is mandatory (select branches or All)')
        return
      }
      const hasAnyPermission = Object.values(permissionDraft || {}).some(
        (actions) => Array.isArray(actions) && actions.length > 0
      )
      if (!hasAnyPermission) {
        message.error('User-specific permissions are mandatory')
        return
      }
      
      // Remove temporary fields
      delete formData.phoneNumber
      delete formData.countryCode

      // Handle password update for edit mode
      if (selectedUser) {
        // Only include password if new password is provided
        if (values.newPassword) {
          formData.password = values.newPassword
        }
        // Remove confirm password from form data
        delete formData.confirmPassword
        delete formData.newPassword

        await updateUser({
          id: selectedUser._id || selectedUser.id,
          ...formData,
        }).unwrap()
        message.success('User updated successfully')
      } else {
        await createUser(formData).unwrap()
        message.success('User created successfully')
      }
      setIsModalVisible(false)
      form.resetFields()
      setHasCustomPermissions(true)
      setPermissionDraft({})
      setSelectedCountryCode('+91')
      refetchUsers()
      // Refetch branches to update agent count and display
      refetchBranches()
    } catch (error) {
      message.error(error?.data?.message || 'Operation failed')
    }
  }

  const handleAddRoleOption = async () => {
    const cleanedRole = newRoleInput.trim().toLowerCase()
    if (!cleanedRole) {
      message.warning('Enter role name')
      return
    }
    if (normalizedRoleOptions.includes(cleanedRole)) {
      message.info('Role already exists in options')
      return
    }
    try {
      await createRole({
        name: cleanedRole,
        displayName: cleanedRole,
        permissions: {},
      }).unwrap()
      await refetchRoles()
      setNewRoleInput('')
      setRemoveRoleValue('')
      form.setFieldValue('role', cleanedRole)
      if (!hasCustomPermissions) {
        const roleDefaults = sanitizePermissionDraft(getDefaultPermissions(cleanedRole))
        setPermissionDraft(roleDefaults)
        form.setFieldValue('permissions', roleDefaults)
      }
      message.success('Role option added')
    } catch (error) {
      message.error(error?.data?.message || 'Failed to add role option')
    }
  }

  const handleRemoveRoleOption = async () => {
    const roleToRemove = String(removeRoleValue || '').trim().toLowerCase()
    if (!roleToRemove) {
      message.warning('Select role to remove')
      return
    }
    try {
      await deleteRole(roleToRemove).unwrap()
      await refetchRoles()
      if ((form.getFieldValue('role') || '').toLowerCase() === roleToRemove) {
        form.setFieldValue('role', undefined)
      }
      setRemoveRoleValue('')
      message.success('Role option removed')
    } catch (error) {
      message.error(error?.data?.message || 'Failed to remove role option')
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="User Management"
        extra={
          isSuperAdmin() ? (
            <MotionButton type="primary" icon={<PlusOutlined />} onClick={handleAdd} size={isMobile ? 'small' : 'middle'}>
              {isMobile ? 'Add' : 'Add User'}
            </MotionButton>
          ) : null
        }
      />

      <ContentCard staggerIndex={0} className="ds-table-shell" innerClassName="ds-content-card__inner--flush">
        <Row gutter={[12, 12]} style={{ padding: 16 }}>
          <Col xs={12} sm={8} md={4}>
            <div className="mgmt-muted">Total</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{roleCounts.total || 0}</div>
          </Col>
          <Col xs={12} sm={8} md={5}>
            <div className="mgmt-muted">Super Admin</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{roleCounts.superadmin || 0}</div>
          </Col>
          <Col xs={12} sm={8} md={5}>
            <div className="mgmt-muted">Admin</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{roleCounts.admin || 0}</div>
          </Col>
          <Col xs={12} sm={8} md={5}>
            <div className="mgmt-muted">Supervisor</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{roleCounts.supervisor || 0}</div>
          </Col>
          <Col xs={12} sm={8} md={5}>
            <div className="mgmt-muted">Staff</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{roleCounts.staff || 0}</div>
          </Col>
        </Row>
      </ContentCard>

      <ContentCard staggerIndex={1} className="ds-table-shell" innerClassName="ds-content-card__inner--flush">
        <div className="table-responsive-wrapper">
          <Table
            columns={columns}
            dataSource={users}
            loading={usersLoading}
            rowKey={(record) => record._id || record.id}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 'max-content' }}
          />
        </div>
      </ContentCard>

      <Modal
        className="ds-modal-wide"
        title={selectedUser ? 'Edit User' : 'Add New User'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
          setHasCustomPermissions(true)
          setPermissionDraft({})
        }}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        <Form
          form={form}
          layout="vertical"
          className="ds-form-grid"
          onFinish={handleSubmit}
          initialValues={{
            role: 'staff',
            status: 'active',
            countryCode: '+91',
          }}
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                name="name"
                label="Name"
                rules={[{ required: true, message: 'Please enter name' }]}
              >
                <Input placeholder="Enter name" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Please enter email' },
                  { type: 'email', message: 'Please enter valid email' },
                ]}
              >
                <Input placeholder="Enter email" />
              </Form.Item>
            </Col>
          </Row>

          {!selectedUser && (
            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: 'Please enter password' },
                { min: 6, message: 'Password must be at least 6 characters' },
              ]}
            >
              <Input.Password placeholder="Enter password (min 6 characters)" />
            </Form.Item>
          )}

          {selectedUser && (
            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="newPassword"
                  label="New Password"
                  rules={[{ min: 6, message: 'Password must be at least 6 characters' }]}
                >
                  <Input.Password placeholder="Enter new password (optional, min 6 characters)" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="confirmPassword"
                  label="Confirm New Password"
                  dependencies={['newPassword']}
                  rules={[
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || !getFieldValue('newPassword')) {
                          return Promise.resolve()
                        }
                        if (value && getFieldValue('newPassword') === value) {
                          return Promise.resolve()
                        }
                        return Promise.reject(new Error('Passwords do not match'))
                      },
                    }),
                  ]}
                >
                  <Input.Password placeholder="Confirm new password" />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                name="role"
                label="Role"
                rules={[{ required: true, message: 'Please select role' }]}
              >
                <Select
                  placeholder="Select role"
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    String(option?.children || '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  onChange={(roleValue) => {
                    if (!hasCustomPermissions) {
                      const roleDefaults = sanitizePermissionDraft(getDefaultPermissions(roleValue))
                      setPermissionDraft(roleDefaults)
                      form.setFieldValue('permissions', roleDefaults)
                    }
                  }}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space.Compact style={{ display: 'flex', padding: '0 8px 8px' }}>
                        <Input
                          placeholder="Enter Role Name"
                          value={newRoleInput}
                          onChange={(e) => setNewRoleInput(e.target.value)}
                          onPressEnter={(e) => {
                            e.preventDefault()
                            handleAddRoleOption()
                          }}
                        />
                        <Button type="primary" onClick={handleAddRoleOption} loading={createRoleLoading}>
                          + Add
                        </Button>
                      </Space.Compact>
                      <Space.Compact style={{ display: 'flex', padding: '0 8px 8px' }}>
                        <Select
                          value={removeRoleValue || undefined}
                          placeholder="Select role to remove"
                          onChange={setRemoveRoleValue}
                          style={{ width: '100%' }}
                        >
                          {normalizedRoleOptions.map((roleValue) => (
                            <Option key={`remove-${roleValue}`} value={roleValue}>
                              {roleValue}
                            </Option>
                          ))}
                        </Select>
                        <Button danger onClick={handleRemoveRoleOption} loading={deleteRoleLoading}>
                          Remove
                        </Button>
                      </Space.Compact>
                    </>
                  )}
                >
                  {normalizedRoleOptions.map((roleValue) => (
                    <Option key={roleValue} value={roleValue}>
                      {roleValue}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="branches"
                label="Branch"
                rules={[{ required: true, message: 'Please select branch' }]}
              >
                <Select
                  placeholder="Select or search branch"
                  mode="multiple"
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    String(option?.children || '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  onChange={(selectedValues = []) => {
                    const hasAll = selectedValues.includes(ALL_BRANCH_OPTION)
                    if (hasAll) {
                      form.setFieldValue('branches', [ALL_BRANCH_OPTION])
                    }
                  }}
                >
                  <Option key={ALL_BRANCH_OPTION} value={ALL_BRANCH_OPTION}>
                    All
                  </Option>
                  {branches.map((branch) => (
                    <Option key={branch._id || branch.id} value={branch._id || branch.id}>
                      {branch.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="User-specific permissions">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space>
                <Switch checked={hasCustomPermissions} disabled />
                <span>Custom permissions enabled (mandatory)</span>
              </Space>
              {(
                <div className="table-responsive-wrapper">
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="key"
                    dataSource={PERMISSION_MODULES}
                    columns={[
                      { title: 'Module', dataIndex: 'name', key: 'name', width: 220 },
                      ...CRUD_PERMISSIONS.map((permission) => ({
                        title: permission.charAt(0).toUpperCase() + permission.slice(1),
                        key: permission,
                        render: (_, module) => {
                          const selectedPermissions = permissionDraft[module.key] || []
                          const checked = selectedPermissions.includes(permission)
                          const isLocked = (LOCKED_RED_PERMISSIONS[module.key] || []).includes(permission)
                          return (
                            <div
                              style={
                                isLocked
                                  ? {
                                     
                    
                                    }
                                  : undefined
                              }
                            >
                              <Checkbox
                                checked={checked}
                                disabled={isLocked}
                                onChange={(e) => {
                                  const nextPermissions = e.target.checked
                                    ? [...new Set([...selectedPermissions, permission])]
                                    : selectedPermissions.filter((p) => p !== permission)
                                  const nextDraft = {
                                    ...permissionDraft,
                                    [module.key]: nextPermissions,
                                  }
                                  setPermissionDraft(nextDraft)
                                  form.setFieldValue(['permissions', module.key], nextPermissions)
                                }}
                              />
                            </div>
                          )
                        },
                      })),
                    ]}
                  />
                </div>
              )}
            </Space>
          </Form.Item>

          <Form.Item name="status" label="Status">
            <Select placeholder="Select status">
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Phone Number" required>
            <Space.Compact className="ds-phone-row">
              <Form.Item name="countryCode" noStyle initialValue="+91" rules={[{ required: true }]}>
                <Select
                  className="ds-phone-code-select"
                  value={selectedCountryCode}
                  onChange={(value) => {
                    setSelectedCountryCode(value)
                    form.setFieldValue('countryCode', value)
                  }}
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) => {
                    const label = option?.label || ''
                    const value = option?.value || ''
                    return (
                      label.toLowerCase().includes(input.toLowerCase()) ||
                      value.includes(input)
                    )
                  }}
                >
                  {countryCodes.map((country) => (
                    <Option
                      key={country.code}
                      value={country.dialCode}
                      label={`${country.flag} ${country.dialCode} ${country.name}`}
                    >
                      <span className="ds-select-option-row">
                        <span>{country.flag}</span>
                        <span>{country.dialCode}</span>
                        <span className="ds-select-option-muted">{country.name}</span>
                      </span>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="phoneNumber"
                noStyle
                rules={[
                  { required: true, message: 'Phone number is required' },
                  {
                    pattern: /^[0-9]{6,15}$/,
                    message: 'Phone number must be 6-15 digits',
                  },
                ]}
              >
                <Input placeholder="Enter phone number" maxLength={15} type="tel" />
              </Form.Item>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="cloudAgentAgentId"
            label="CloudAgent Agent ID"
            extra="Optional. Required for Click-to-Call from Leads. Get this from CloudAgent Admin → Campaign → Agent IDs."
          >
            <Input placeholder="e.g. agent_123" />
          </Form.Item>

          <Form.Item>
            <div className={`ds-form-footer ${isMobile ? 'ds-form-footer--stack-sm' : ''}`.trim()}>
              <Button type="primary" htmlType="submit" loading={createLoading || updateLoading}>
                {selectedUser ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>Cancel</Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Disable user"
        open={disableModalOpen}
        onCancel={closeDisableModal}
        destroyOnClose
        okText="Disable user"
        okButtonProps={{ danger: true, loading: disableSubmitting, disabled: disablePreviewLoading || !disablePreview }}
        onOk={handleConfirmDisable}
        cancelText="Cancel"
        width={isMobile ? '95%' : 520}
      >
        {disablePreviewLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
            <p className="mgmt-muted" style={{ marginTop: 12 }}>
              Checking assigned leads…
            </p>
          </div>
        ) : disablePreview ? (
          <>
            <p style={{ marginBottom: 12 }}>
              <strong>{disableTarget?.name}</strong> ({disableTarget?.email}) will be set to <strong>inactive</strong> and
              cannot sign in. Branch membership will be removed.
            </p>
            {disablePreview.needsReassignment ? (
              <>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Reassign before disabling"
                  description={
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      <li>{disablePreview.assignedLeadCount} lead(s) assigned to this user</li>
                      {disablePreview.leadsWithReminderAssignments > 0 ? (
                        <li>
                          {disablePreview.leadsWithReminderAssignments} lead(s) with follow-up reminders assigned to this
                          user
                        </li>
                      ) : null}
                      <li>
                        <strong>{disablePreview.totalLeadsAffected}</strong> unique lead record(s) will be updated.
                      </li>
                    </ul>
                  }
                />
                <Form form={disableForm} layout="vertical">
                  <Form.Item
                    name="reassignToUserId"
                    label="Reassign all of the above to"
                    rules={[{ required: true, message: 'Select an active user' }]}
                  >
                    <Select
                      placeholder="Choose active user"
                      showSearch
                      optionFilterProp="children"
                      getPopupContainer={(n) => n.parentElement}
                    >
                      {users
                        .filter(
                          (u) =>
                            u.status === 'active' &&
                            String(u._id || u.id) !== String(disableTarget?._id || disableTarget?.id)
                        )
                        .map((u) => (
                          <Option key={u._id || u.id} value={u._id || u.id}>
                            {u.name} ({u.email}) — {u.role}
                          </Option>
                        ))}
                    </Select>
                  </Form.Item>
                </Form>
              </>
            ) : (
              <Alert
                type="info"
                showIcon
                message="No reassignment needed"
                description="This user has no leads assigned and no reminders tied to them. You can disable immediately."
              />
            )}
          </>
        ) : (
          <Alert type="error" message="Could not load preview. Close and try again." />
        )}
      </Modal>
    </PageLayout>
  )
}

export default Users
