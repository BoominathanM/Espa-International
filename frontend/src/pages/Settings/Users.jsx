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
  message,
  Popconfirm,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { canCreate, canEdit, canDelete, isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'

const { Option } = Select

const Users = () => {
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [branches] = useState(['All', 'Branch 1', 'Branch 2', 'Branch 3'])
  const [users, setUsers] = useState([
    {
      key: '1',
      name: 'Super Admin',
      email: 'superadmin@gmail.com',
      role: 'superadmin',
      branch: 'All',
      status: 'active',
      phoneNumbers: ['+91 9876543210'],
    },
    {
      key: '2',
      name: 'Admin User',
      email: 'admin@gmail.com',
      role: 'admin',
      branch: 'Branch 1',
      status: 'active',
      phoneNumbers: ['+91 9876543211'],
    },
    {
      key: '3',
      name: 'Supervisor One',
      email: 'supervisor@gmail.com',
      role: 'supervisor',
      branch: 'Branch 2',
      status: 'active',
      phoneNumbers: ['+91 9876543212'],
    },
    {
      key: '4',
      name: 'Staff Agent',
      email: 'staff@gmail.com',
      role: 'staff',
      branch: 'Branch 1',
      status: 'active',
      phoneNumbers: ['+91 9876543213'],
    },
  ])

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
      dataIndex: 'branch',
      key: 'branch',
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
      title: 'Phone Numbers',
      dataIndex: 'phoneNumbers',
      key: 'phoneNumbers',
      render: (numbers) => numbers.join(', '),
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
                onConfirm={() => handleDelete(record.key)}
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
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedUser(record)
    form.setFieldsValue(record)
    setIsModalVisible(true)
  }

  const handleDelete = (key) => {
    setUsers(users.filter((user) => user.key !== key))
    message.success('User deleted successfully')
  }

  const handleSubmit = (values) => {
    if (selectedUser) {
      setUsers(
        users.map((user) =>
          user.key === selectedUser.key ? { ...user, ...values } : user
        )
      )
      message.success('User updated successfully')
    } else {
      const newUser = {
        key: Date.now().toString(),
        ...values,
        status: 'active',
      }
      setUsers([...users, newUser])
      message.success('User created successfully')
    }
    setIsModalVisible(false)
    form.resetFields()
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
        <h2 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>User Management</h2>
        {isSuperAdmin() && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size={isMobile ? 'small' : 'middle'}>
            {isMobile ? 'Add' : 'Add User'}
          </Button>
        )}
      </div>

      <div className="table-responsive-wrapper">
        <Table
          columns={columns}
          dataSource={users}
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
            branch: branches.length > 1 ? branches[1] : branches[0],
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
              {
                pattern: /@gmail\.com$/,
                message: 'Email must be @gmail.com',
              },
            ]}
          >
            <Input placeholder="Enter @gmail.com email" />
          </Form.Item>

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

          <Form.Item
            name="branch"
            label="Branch"
            rules={[{ required: true, message: 'Please select branch' }]}
          >
            <Select placeholder="Select branch">
              {branches.map((branch) => (
                <Option key={branch} value={branch}>
                  {branch === 'All' ? 'All Branches' : branch}
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

          <Form.Item>
            <div style={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              gap: 8,
              width: '100%'
            }}>
              <Button 
                type="primary" 
                htmlType="submit"
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
