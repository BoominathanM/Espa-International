import React, { useState, useEffect } from 'react'
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
  Popconfirm,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { canCreate, canEdit, canDelete, isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
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

  // API hooks
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useGetUsersQuery()
  const { data: branchesData, refetch: refetchBranches } = useGetBranchesQuery()
  const [createUser, { isLoading: createLoading }] = useCreateUserMutation()
  const [updateUser, { isLoading: updateLoading }] = useUpdateUserMutation()
  const [deleteUser] = useDeleteUserMutation()

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
      render: (_, record) => (
        <Space>
          {isSuperAdmin() && (
            <>
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              >
                Edit
              </Button>
              <Popconfirm
                title="Delete this user?"
                onConfirm={() => handleDelete(record._id || record.id)}
                okText="Yes"
                cancelText="No"
              >
                <Button type="link" danger icon={<DeleteOutlined />}>
                  Delete
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
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
    })
    setIsModalVisible(true)
  }

  const handleDelete = async (id) => {
    try {
      await deleteUser(id).unwrap()
      message.success('User deleted successfully')
      refetchUsers()
      // Refetch branches to update agent count and display
      refetchBranches()
    } catch (error) {
      message.error(error?.data?.message || 'Failed to delete user')
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
          User Management
        </h2>
        {isSuperAdmin() && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            size={isMobile ? 'small' : 'middle'}
          >
            {isMobile ? 'Add' : 'Add User'}
          </Button>
        )}
      </div>

      <div className="table-responsive-wrapper">
        <Table
          columns={columns}
          dataSource={users}
          loading={usersLoading}
          rowKey={(record) => record._id || record.id}
          pagination={{ pageSize: 10 }}
          style={{ background: '#1a1a1a' }}
          scroll={{ x: 'max-content' }}
        />
      </div>

      <Modal
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
          onFinish={handleSubmit}
          initialValues={{
            role: 'staff',
            status: 'active',
            countryCode: '+91',
          }}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input placeholder="Enter name" />
          </Form.Item>

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
            <>
              <Form.Item
                name="newPassword"
                label="New Password"
                rules={[
                  { min: 6, message: 'Password must be at least 6 characters' },
                ]}
              >
                <Input.Password placeholder="Enter new password (optional, min 6 characters)" />
              </Form.Item>
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
            </>
          )}

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

          <Form.Item name="branch" label="Branch">
            <Select placeholder="Select branch (optional)" allowClear>
              {branches.map((branch) => (
                <Option key={branch._id || branch.id} value={branch._id || branch.id}>
                  {branch.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="status" label="Status">
            <Select placeholder="Select status">
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
            </Select>
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
                {selectedUser ? 'Update' : 'Create'}
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
    </div>
  )
}

export default Users
