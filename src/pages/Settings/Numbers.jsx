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

const Numbers = () => {
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [numbers, setNumbers] = useState([
    {
      key: '1',
      number: '+91 9876543210',
      branch: 'Branch 1',
      type: 'Call',
      assignedAgents: ['Agent A', 'Agent B'],
      status: 'active',
    },
    {
      key: '2',
      number: '+91 9876543211',
      branch: 'Branch 2',
      type: 'WhatsApp',
      assignedAgents: ['Agent C'],
      status: 'active',
    },
    {
      key: '3',
      number: '+91 9876543212',
      branch: 'Branch 1',
      type: 'Call',
      assignedAgents: ['Agent D'],
      status: 'inactive',
    },
  ])

  const columns = [
    {
      title: 'Phone Number',
      dataIndex: 'number',
      key: 'number',
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type) => (
        <Tag color={type === 'Call' ? 'blue' : 'green'}>{type}</Tag>
      ),
    },
    {
      title: 'Assigned Agents',
      dataIndex: 'assignedAgents',
      key: 'assignedAgents',
      render: (agents) => agents.join(', '),
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
                title="Delete this number?"
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
    setSelectedNumber(null)
    form.resetFields()
    setIsModalVisible(true)
  }

  const handleEdit = (record) => {
    setSelectedNumber(record)
    form.setFieldsValue({
      ...record,
      assignedAgents: record.assignedAgents,
    })
    setIsModalVisible(true)
  }

  const handleDelete = (key) => {
    setNumbers(numbers.filter((number) => number.key !== key))
    message.success('Number deleted successfully')
  }

  const handleSubmit = (values) => {
    if (selectedNumber) {
      setNumbers(
        numbers.map((number) =>
          number.key === selectedNumber.key
            ? { ...number, ...values, assignedAgents: values.assignedAgents || [] }
            : number
        )
      )
      message.success('Number updated successfully')
    } else {
      const newNumber = {
        key: Date.now().toString(),
        ...values,
        assignedAgents: values.assignedAgents || [],
      }
      setNumbers([...numbers, newNumber])
      message.success('Number created successfully')
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
        <h2 style={{ color: '#D4AF37', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>Number Configuration</h2>
        {isSuperAdmin() && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size={isMobile ? 'small' : 'middle'}>
            {isMobile ? 'Add' : 'Add Number'}
          </Button>
        )}
      </div>

      <div className="table-responsive-wrapper">
        <Table
          columns={columns}
          dataSource={numbers}
          pagination={{ pageSize: 10 }}
          style={{ background: '#1a1a1a' }}
          scroll={{ x: 'max-content' }}
        />
      </div>

      <Modal
        title={selectedNumber ? 'Edit Number' : 'Add New Number'}
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
            type: 'Call',
            status: 'active',
          }}
        >
          <Form.Item
            name="number"
            label="Phone Number"
            rules={[{ required: true, message: 'Please enter phone number' }]}
          >
            <Input placeholder="Enter phone number" />
          </Form.Item>

          <Form.Item
            name="branch"
            label="Branch"
            rules={[{ required: true, message: 'Please select branch' }]}
          >
            <Select placeholder="Select branch">
              <Option value="Branch 1">Branch 1</Option>
              <Option value="Branch 2">Branch 2</Option>
              <Option value="Branch 3">Branch 3</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="type"
            label="Type"
            rules={[{ required: true, message: 'Please select type' }]}
          >
            <Select placeholder="Select type">
              <Option value="Call">Call</Option>
              <Option value="WhatsApp">WhatsApp</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="assignedAgents"
            label="Assigned Agents"
          >
            <Select
              mode="multiple"
              placeholder="Select agents"
            >
              <Option value="Agent A">Agent A</Option>
              <Option value="Agent B">Agent B</Option>
              <Option value="Agent C">Agent C</Option>
              <Option value="Agent D">Agent D</Option>
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
                {selectedNumber ? 'Update' : 'Create'}
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

export default Numbers
