import React, { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  App,
  Tag,
  Tooltip,
  Badge,
  Dropdown,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, MoreOutlined } from '@ant-design/icons'
import { canCreate, canEdit, canDelete, isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
} from '../../store/api/branchApi'
import { useGetUnassignedUsersQuery, useGetUsersQuery } from '../../store/api/userApi'
import { countryCodes, parsePhoneNumber, formatPhoneNumber } from '../../utils/countryCodes'
import { PageLayout, PageHeader, ContentCard } from '../../components/ds-layout'
import MotionButton from '../../components/MotionButton'

const { Option } = Select

const Branch = () => {
  const { message } = App.useApp()
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [deleteForm] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [branchToDelete, setBranchToDelete] = useState(null)
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91')

  // API hooks
  const { data: branchesData, isLoading: branchesLoading, refetch: refetchBranches } = useGetBranchesQuery()
  const { data: unassignedUsersData, refetch: refetchUnassignedUsers } = useGetUnassignedUsersQuery()
  const { data: allUsersData } = useGetUsersQuery()
  const [createBranch, { isLoading: createLoading }] = useCreateBranchMutation()
  const [updateBranch, { isLoading: updateLoading }] = useUpdateBranchMutation()
  const [deleteBranch] = useDeleteBranchMutation()

  const branches = branchesData?.branches || []
  const unassignedUsers = unassignedUsersData?.users || []
  const allUsers = allUsersData?.users || []

  // Get available users for dropdown (unassigned + users from current branch if editing)
  const getAvailableUsers = () => {
    if (selectedBranch) {
      // When editing, include users already assigned to this branch
      const branchUsers = selectedBranch.assignedUsers?.map((u) => u._id || u.id) || []
      return allUsers.filter(
        (user) => !user.branch || branchUsers.includes(user._id || user.id)
      )
    }
    return unassignedUsers
  }

  const availableUsers = getAvailableUsers()

  const columns = [
    {
      title: 'Branch Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'User Count',
      key: 'userCount',
      render: (_, record) => {
        const count = record.assignedUsers?.length || 0
        return (
          <Badge count={count} showZero className="branch-user-badge" title={`${count} user(s) assigned`}>
            <UserOutlined className="branch-user-badge-icon" />
          </Badge>
        )
      },
    },
    {
      title: 'Assigned Users',
      key: 'assignedUsers',
      render: (_, record) => {
        const users = record.assignedUsers || []
        if (users.length === 0) {
          return <Tag color="default">No users assigned</Tag>
        }
        return (
          <Space wrap>
            {users.slice(0, 3).map((user) => (
              <Tooltip
                key={user._id || user.id}
                title={`${user.name} (${user.email}) - ${user.role}`}
              >
                <Tag color="blue">{user.name}</Tag>
              </Tooltip>
            ))}
            {users.length > 3 && (
              <Tag color="default">+{users.length - 3} more</Tag>
            )}
          </Space>
        )
      },
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
                { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent?.stopPropagation()
                if (key === 'edit') handleEdit(record)
                if (key === 'delete') {
                  const hasUsers = (record.assignedUsers?.length || 0) > 0
                  if (hasUsers) {
                    handleDeleteClick(record)
                  } else {
                    Modal.confirm({
                      title: 'Delete this branch?',
                      content: 'This cannot be undone.',
                      okText: 'Delete',
                      okType: 'danger',
                      cancelText: 'Cancel',
                      onOk: () => handleDelete(record._id || record.id),
                    })
                  }
                }
              },
            }}
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="settings-actions-dropdown"
          >
            <Button
              type="text"
              icon={<MoreOutlined className="settings-table-action-icon" />}
              aria-label="Branch actions"
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        ) : null,
    },
  ]

  const handleAdd = () => {
    setSelectedBranch(null)
    setSelectedCountryCode('+91')
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedBranch(record)
    const assignedUserIds = record.assignedUsers?.map((u) => u._id || u.id) || []
    
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
      assignedUsers: assignedUserIds,
      phoneNumber: phoneNumber,
      countryCode: countryCode,
    })
    setIsModalVisible(true)
  }

  const handleDeleteClick = (record) => {
    setBranchToDelete(record)
    const userCount = record.assignedUsers?.length || 0
    
    if (userCount > 0) {
      // Show modal to select target branch
      setIsDeleteModalVisible(true)
      deleteForm.resetFields()
    }
    // If no users, Modal.confirm from dropdown handles delete
  }

  const handleDelete = async (id, targetBranchId = null) => {
    try {
      await deleteBranch({ id, targetBranchId }).unwrap()
      message.success('Branch deleted successfully')
      setIsDeleteModalVisible(false)
      setBranchToDelete(null)
      deleteForm.resetFields()
      refetchBranches()
      refetchUnassignedUsers()
    } catch (error) {
      const errorMessage = error?.data?.message || 'Failed to delete branch'
      message.error(errorMessage)
      
      // If error indicates users need to be moved, show the modal
      if (error?.data?.userCount > 0 && !isDeleteModalVisible) {
        setIsDeleteModalVisible(true)
      }
    }
  }

  const handleDeleteConfirm = async (values) => {
    if (branchToDelete) {
      await handleDelete(branchToDelete._id || branchToDelete.id, values.targetBranch)
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
        phone: fullPhoneNumber,
      }
      
      // Remove temporary fields
      delete formData.phoneNumber
      delete formData.countryCode
      delete formData.email

      if (selectedBranch) {
        await updateBranch({
          id: selectedBranch._id || selectedBranch.id,
          ...formData,
        }).unwrap()
        message.success('Branch updated successfully')
      } else {
        await createBranch(formData).unwrap()
        message.success('Branch created successfully')
      }
      setIsModalVisible(false)
      form.resetFields()
      setSelectedCountryCode('+91')
      refetchBranches()
      refetchUnassignedUsers()
    } catch (error) {
      message.error(error?.data?.message || 'Operation failed')
    }
  }

  return (
    <PageLayout>
      <PageHeader
        title="Branch Configuration"
        extra={
          isSuperAdmin() ? (
            <MotionButton type="primary" icon={<PlusOutlined />} onClick={handleAdd} size={isMobile ? 'small' : 'middle'}>
              {isMobile ? 'Add' : 'Add Branch'}
            </MotionButton>
          ) : null
        }
      />

      <ContentCard staggerIndex={0} className="ds-table-shell" innerClassName="ds-content-card__inner--flush">
        <div className="table-responsive-wrapper">
          <Table
            columns={columns}
            dataSource={branches}
            loading={branchesLoading}
            rowKey={(record) => record._id || record.id}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 'max-content' }}
          />
        </div>
      </ContentCard>

      <Modal
        title={selectedBranch ? 'Edit Branch' : 'Add New Branch'}
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
          onFinish={handleSubmit}
          initialValues={{
            countryCode: '+91',
          }}
        >
          <Form.Item
            name="name"
            label="Branch Name"
            rules={[{ required: true, message: 'Please enter branch name' }]}
          >
            <Input placeholder="Enter branch name" />
          </Form.Item>

          <Form.Item
            name="address"
            label="Address"
            rules={[{ required: true, message: 'Please enter address' }]}
          >
            <Input.TextArea rows={3} placeholder="Enter address" />
          </Form.Item>

          <Form.Item
            label="Phone Number"
            required
          >
            <Space.Compact style={{ width: '100%', display: 'flex' }}>
              <Form.Item
                name="countryCode"
                noStyle
                initialValue="+91"
                rules={[{ required: true }]}
              >
                <Select
                  style={{ width: isMobile ? 120 : 180, minWidth: 120 }}
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
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{country.flag}</span>
                        <span>{country.dialCode}</span>
                        <span style={{ opacity: 0.7 }}>{country.name}</span>
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
                <Input
                  placeholder="Enter phone number"
                  style={{ flex: 1 }}
                  maxLength={15}
                  type="tel"
                />
              </Form.Item>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="assignedUsers"
            label="Assign Users"
            tooltip="Select users to assign to this branch. Users already assigned to other branches will not appear."
          >
            <Select
              mode="multiple"
              placeholder="Select users to assign"
              showSearch
              filterOption={(input, option) =>
                (option?.children?.toLowerCase() || '').includes(input.toLowerCase())
              }
              notFoundContent={
                availableUsers.length === 0
                  ? 'No unassigned users available'
                  : 'No users found'
              }
            >
              {availableUsers.map((user) => (
                <Option key={user._id || user.id} value={user._id || user.id}>
                  {user.name} ({user.email}) - {user.role}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {availableUsers.length === 0 && (
            <div style={{ marginBottom: 16, padding: 12, background: '#2a2a2a', borderRadius: 4 }}>
              <p style={{ color: '#ffa940', margin: 0 }}>
                <strong>Note:</strong> All users are currently assigned to other branches. Unassign
                users from other branches first to assign them here.
              </p>
            </div>
          )}

          <Form.Item>
            <div
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 8,
                width: '100%',
              }}
            >
              <Button
                type="primary"
                htmlType="submit"
                loading={createLoading || updateLoading}
                style={{ width: isMobile ? '100%' : 'auto' }}
              >
                {selectedBranch ? 'Update' : 'Create'}
              </Button>
              <Button
                onClick={() => setIsModalVisible(false)}
                style={{ width: isMobile ? '100%' : 'auto' }}
              >
                Cancel
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Delete Branch Modal - Shows when branch has users */}
      <Modal
        title="Delete Branch"
        open={isDeleteModalVisible}
        onCancel={() => {
          setIsDeleteModalVisible(false)
          setBranchToDelete(null)
          deleteForm.resetFields()
        }}
        footer={null}
        width={isMobile ? '95%' : 500}
      >
        {branchToDelete && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <p className="mgmt-body-text" style={{ marginBottom: 8 }}>
                <strong>{branchToDelete.name}</strong> has{' '}
                <strong style={{ color: '#ff4d4f' }}>
                  {branchToDelete.assignedUsers?.length || 0} user(s)
                </strong>{' '}
                assigned to it.
              </p>
              <p style={{ color: '#ffa940', marginBottom: 0 }}>
                You must move these users to another branch before deleting this branch.
              </p>
            </div>

            {branchToDelete.assignedUsers && branchToDelete.assignedUsers.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: '#2a2a2a', borderRadius: 4 }}>
                <p className="mgmt-body-text" style={{ marginBottom: 8, fontWeight: 'bold' }}>
                  Users to be moved:
                </p>
                <Space wrap>
                  {branchToDelete.assignedUsers.map((user) => (
                    <Tag key={user._id || user.id} color="blue">
                      {user.name} ({user.email})
                    </Tag>
                  ))}
                </Space>
              </div>
            )}

            <Form
              form={deleteForm}
              layout="vertical"
              onFinish={handleDeleteConfirm}
            >
              <Form.Item
                name="targetBranch"
                label="Move users to branch"
                rules={[
                  { 
                    required: true, 
                    message: 'Please select a branch to move users to' 
                  }
                ]}
              >
                <Select
                  placeholder="Select target branch"
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children?.toLowerCase() || '').includes(input.toLowerCase())
                  }
                >
                  {branches
                    .filter((branch) => {
                      const currentBranchId = branchToDelete?._id || branchToDelete?.id
                      const branchId = branch._id || branch.id
                      return branchId !== currentBranchId
                    })
                    .map((branch) => (
                      <Option key={branch._id || branch.id} value={branch._id || branch.id}>
                        {branch.name} ({branch.assignedUsers?.length || 0} users)
                      </Option>
                    ))}
                </Select>
              </Form.Item>

              {branches.filter((branch) => {
                const currentBranchId = branchToDelete?._id || branchToDelete?.id
                const branchId = branch._id || branch.id
                return branchId !== currentBranchId
              }).length === 0 && (
                <div style={{ marginBottom: 16, padding: 12, background: '#2a2a2a', borderRadius: 4 }}>
                  <p style={{ color: '#ff4d4f', margin: 0 }}>
                    <strong>Error:</strong> No other branches available. Please create another branch first before deleting this one.
                  </p>
                </div>
              )}

              <Form.Item>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: 8,
                    width: '100%',
                    justifyContent: 'flex-end',
                  }}
                >
                  <Button
                    onClick={() => {
                      setIsDeleteModalVisible(false)
                      setBranchToDelete(null)
                      deleteForm.resetFields()
                    }}
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="primary"
                    danger
                    htmlType="submit"
                    disabled={
                      branches.filter((branch) => {
                        const currentBranchId = branchToDelete?._id || branchToDelete?.id
                        const branchId = branch._id || branch.id
                        return branchId !== currentBranchId
                      }).length === 0
                    }
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    Delete & Move Users
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </PageLayout>
  )
}

export default Branch
