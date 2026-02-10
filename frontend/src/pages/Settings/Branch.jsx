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
  Popconfirm,
  Tag,
  Tooltip,
  Badge,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons'
import { canCreate, canEdit, canDelete, isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
} from '../../store/api/branchApi'
import { useGetUnassignedUsersQuery, useGetUsersQuery } from '../../store/api/userApi'

const { Option } = Select

const Branch = () => {
  const { message } = App.useApp()
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState(null)

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
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'User Count',
      key: 'userCount',
      render: (_, record) => {
        const count = record.assignedUsers?.length || 0
        return (
          <Badge
            count={count}
            showZero
            style={{ backgroundColor: '#D4AF37' }}
            title={`${count} user(s) assigned`}
          >
            <UserOutlined style={{ fontSize: 18, color: '#D4AF37' }} />
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
                title="Delete this branch?"
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
    setSelectedBranch(null)
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedBranch(record)
    const assignedUserIds = record.assignedUsers?.map((u) => u._id || u.id) || []
    form.setFieldsValue({
      ...record,
      assignedUsers: assignedUserIds,
    })
    setIsModalVisible(true)
  }

  const handleDelete = async (id) => {
    try {
      await deleteBranch(id).unwrap()
      message.success('Branch deleted successfully')
      refetchBranches()
      refetchUnassignedUsers()
    } catch (error) {
      message.error(error?.data?.message || 'Failed to delete branch')
    }
  }

  const handleSubmit = async (values) => {
    try {
      if (selectedBranch) {
        await updateBranch({
          id: selectedBranch._id || selectedBranch.id,
          ...values,
        }).unwrap()
        message.success('Branch updated successfully')
      } else {
        await createBranch(values).unwrap()
        message.success('Branch created successfully')
      }
      setIsModalVisible(false)
      form.resetFields()
      refetchBranches()
      refetchUnassignedUsers()
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
          Branch Configuration
        </h2>
        {isSuperAdmin() && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            size={isMobile ? 'small' : 'middle'}
          >
            {isMobile ? 'Add' : 'Add Branch'}
          </Button>
        )}
      </div>

      <div className="table-responsive-wrapper">
        <Table
          columns={columns}
          dataSource={branches}
          loading={branchesLoading}
          rowKey={(record) => record._id || record.id}
          pagination={{ pageSize: 10 }}
          style={{ background: '#1a1a1a' }}
          scroll={{ x: 'max-content' }}
        />
      </div>

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
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
            name="phone"
            label="Phone"
            rules={[{ required: true, message: 'Please enter phone number' }]}
          >
            <Input placeholder="Enter phone number" />
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
    </div>
  )
}

export default Branch
