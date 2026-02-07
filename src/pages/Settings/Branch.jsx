import React, { useState } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  message,
  Popconfirm,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { canCreate, canEdit, canDelete, isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'

const Branch = () => {
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [branches, setBranches] = useState([
    {
      key: '1',
      name: 'Branch 1',
      address: '123 Main Street, City',
      phone: '+91 9876543210',
      email: 'branch1@gmail.com',
      manager: 'Manager A',
    },
    {
      key: '2',
      name: 'Branch 2',
      address: '456 Park Avenue, City',
      phone: '+91 9876543211',
      email: 'branch2@gmail.com',
      manager: 'Manager B',
    },
    {
      key: '3',
      name: 'Branch 3',
      address: '789 Market Road, City',
      phone: '+91 9876543212',
      email: 'branch3@gmail.com',
      manager: 'Manager C',
    },
  ])

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
      title: 'Manager',
      dataIndex: 'manager',
      key: 'manager',
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
    setSelectedBranch(null)
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedBranch(record)
    form.setFieldsValue(record)
    setIsModalVisible(true)
  }

  const handleDelete = (key) => {
    setBranches(branches.filter((branch) => branch.key !== key))
    message.success('Branch deleted successfully')
  }

  const handleSubmit = (values) => {
    if (selectedBranch) {
      setBranches(
        branches.map((branch) =>
          branch.key === selectedBranch.key ? { ...branch, ...values } : branch
        )
      )
      message.success('Branch updated successfully')
    } else {
      const newBranch = {
        key: Date.now().toString(),
        ...values,
      }
      setBranches([...branches, newBranch])
      message.success('Branch created successfully')
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
        <h2 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>Branch Configuration</h2>
        {isSuperAdmin() && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size={isMobile ? 'small' : 'middle'}>
            {isMobile ? 'Add' : 'Add Branch'}
          </Button>
        )}
      </div>

      <div className="table-responsive-wrapper">
        <Table
          columns={columns}
          dataSource={branches}
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
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
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

          <Form.Item name="manager" label="Manager">
            <Input placeholder="Enter manager name" />
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
