import React, { useState } from 'react'
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
} from 'antd'
import { PlusOutlined, EditOutlined, MoreOutlined, StopOutlined } from '@ant-design/icons'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import MotionButton from '../../components/MotionButton'
import { isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useLazyGetDisablePreviewQuery,
  useDisableUserMutation,
} from '../../store/api/userApi'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import { countryCodes, parsePhoneNumber, formatPhoneNumber } from '../../utils/countryCodes'

const { Option } = Select

const Users = () => {
  const { message } = App.useApp()
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91')
  const [disableModalOpen, setDisableModalOpen] = useState(false)
  const [disableTarget, setDisableTarget] = useState(null)
  const [disableForm] = Form.useForm()

  // API hooks
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useGetUsersQuery()
  const { data: branchesData, refetch: refetchBranches } = useGetBranchesQuery()
  const [createUser, { isLoading: createLoading }] = useCreateUserMutation()
  const [updateUser, { isLoading: updateLoading }] = useUpdateUserMutation()
  const [fetchDisablePreview, { data: disablePreview, isFetching: disablePreviewLoading }] =
    useLazyGetDisablePreviewQuery()
  const [disableUser, { isLoading: disableSubmitting }] = useDisableUserMutation()

  const users = usersData?.users || []
  const branches = branchesData?.branches || []

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
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedUser(record)
    const branchId = record.branch?._id || record.branch?.id || record.branch || null
    
    // Parse phone number if exists
    let phoneNumber = ''
    let countryCode = '+91'
    if (record.phone) {
      const parsed = parsePhoneNumber(record.phone)
      countryCode = parsed.dialCode
      phoneNumber = parsed.number
    }
    
    setSelectedCountryCode(countryCode)
    form.setFieldsValue({
      ...record,
      branch: branchId,
      phoneNumber: phoneNumber,
      countryCode: countryCode,
      cloudAgentAgentId: record.cloudAgentAgentId || '',
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
      setSelectedCountryCode('+91')
      refetchUsers()
      // Refetch branches to update agent count and display
      refetchBranches()
    } catch (error) {
      message.error(error?.data?.message || 'Operation failed')
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
                <Select placeholder="Select role">
                  <Option value="superadmin">Super Admin</Option>
                  <Option value="admin">Admin</Option>
                  <Option value="supervisor">Supervisor</Option>
                  <Option value="staff">Staff</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="branch" label="Branch">
                <Select placeholder="Select branch (optional)" allowClear>
                  {branches.map((branch) => (
                    <Option key={branch._id || branch.id} value={branch._id || branch.id}>
                      {branch.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

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
