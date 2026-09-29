import React, { useMemo, useState } from 'react'
import { Card, Button, Table, Tag, Input, Alert, Space, Modal, Form, Switch, Popconfirm, Tooltip, message } from 'antd'
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetQuickRepliesQuery,
  useCreateQuickReplyMutation,
  useUpdateQuickReplyMutation,
  useDeleteQuickReplyMutation,
  composeQuickReplyText,
} from '../../store/api/quickReplyApi'
import { formatDateTime } from './WhatsAppTemplates'

const LINK_RE = /^(https?:\/\/|www\.)\S+$/i

/**
 * Settings → API & Integrations → WhatsApp API → "Quick Replies" tab (Super Admin).
 * Each reply has a title, a message and/or a link; the active ones show up in the
 * Live Chat ⚡ picker and are sent to the customer as a text message.
 */
const WhatsAppQuickReplies = () => {
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null = closed, {} = new, reply = edit
  const [togglingId, setTogglingId] = useState(null)

  const { data, isLoading, isFetching, error } = useGetQuickRepliesQuery({ includeInactive: true })
  const [createQuickReply, { isLoading: isCreating }] = useCreateQuickReplyMutation()
  const [updateQuickReply, { isLoading: isUpdating }] = useUpdateQuickReplyMutation()
  const [deleteQuickReply] = useDeleteQuickReplyMutation()

  const watchedMessage = Form.useWatch('message', form)
  const watchedLink = Form.useWatch('link', form)
  const previewText = composeQuickReplyText({ message: watchedMessage, link: watchedLink })

  const quickReplies = data?.quickReplies || []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return quickReplies
    return quickReplies.filter((r) =>
      [r.title, r.message, r.link].some((v) => String(v || '').toLowerCase().includes(q))
    )
  }, [quickReplies, search])

  const openAdd = () => {
    form.resetFields()
    form.setFieldsValue({ title: '', message: '', link: '', isActive: true })
    setEditing({})
  }

  const openEdit = (reply) => {
    form.setFieldsValue({
      title: reply.title,
      message: reply.message || '',
      link: reply.link || '',
      isActive: reply.isActive !== false,
    })
    setEditing(reply)
  }

  const closeModal = () => {
    setEditing(null)
    form.resetFields()
  }

  const handleSave = async (values) => {
    const body = {
      title: values.title?.trim(),
      message: values.message?.trim() || '',
      link: values.link?.trim() || '',
      isActive: values.isActive !== false,
    }
    try {
      if (editing?._id) {
        await updateQuickReply({ id: editing._id, ...body }).unwrap()
        message.success('Quick reply updated')
      } else {
        await createQuickReply(body).unwrap()
        message.success('Quick reply added')
      }
      closeModal()
    } catch (err) {
      message.error(err?.data?.message || 'Failed to save quick reply')
    }
  }

  const handleToggle = async (reply, isActive) => {
    setTogglingId(reply._id)
    try {
      await updateQuickReply({ id: reply._id, isActive }).unwrap()
      message.success(isActive ? 'Quick reply enabled' : 'Quick reply disabled')
    } catch (err) {
      message.error(err?.data?.message || 'Failed to update quick reply')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (reply) => {
    try {
      await deleteQuickReply(reply._id).unwrap()
      message.success('Quick reply deleted')
    } catch (err) {
      message.error(err?.data?.message || 'Failed to delete quick reply')
    }
  }

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      render: (title) => <strong>{title}</strong>,
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      render: (text) =>
        text ? (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, maxHeight: 120, overflow: 'auto' }}>{text}</div>
        ) : (
          <span className="mgmt-muted">—</span>
        ),
    },
    {
      title: 'Link',
      dataIndex: 'link',
      key: 'link',
      width: 240,
      render: (link) =>
        link ? (
          <a href={link} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontSize: 13 }}>
            <LinkOutlined /> {link}
          </a>
        ) : (
          <span className="mgmt-muted">—</span>
        ),
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (isActive, reply) => (
        <Switch
          size="small"
          checked={isActive !== false}
          loading={togglingId === reply._id}
          onChange={(checked) => handleToggle(reply, checked)}
        />
      ),
    },
    {
      title: 'Last updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: formatDateTime,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      render: (_, reply) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(reply)} />
          </Tooltip>
          <Popconfirm
            title="Delete this quick reply?"
            description="It will no longer show in Live Chat."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(reply)}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const activeCount = quickReplies.filter((r) => r.isActive !== false).length

  return (
    <Card className="mgmt-settings-card">
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h4 className="mgmt-card-title-text" style={{ margin: 0 }}>Live Chat Quick Replies</h4>
          <span className="mgmt-muted" style={{ fontSize: 13 }}>
            {quickReplies.length} quick reply(s) · {activeCount} active in Live Chat
          </span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Add Quick Reply
        </Button>
      </div>

      {error && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Could not load quick replies"
          description={error?.data?.message || 'Please try again.'}
        />
      )}
      {!isLoading && !quickReplies.length && !error && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="No quick replies yet"
          description='Click "Add Quick Reply" to save a message and/or link. Active quick replies appear under the ⚡ button in Live Chat so staff can send them to the customer in one click.'
        />
      )}

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search title, message or link"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: isMobile ? '100%' : 280 }}
        />
      </Space>

      <Table
        rowKey="_id"
        size="small"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 900 }}
      />

      <Modal
        title={editing?._id ? 'Edit Quick Reply' : 'Add Quick Reply'}
        open={editing !== null}
        onCancel={closeModal}
        footer={null}
        width={isMobile ? '95%' : 600}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ isActive: true }}>
          <Form.Item
            name="title"
            label="Title"
            extra="Shown to staff in the Live Chat quick reply list (not sent to the customer)."
            rules={[
              { required: true, whitespace: true, message: 'Please enter a title' },
              { max: 80, message: 'Title must be 80 characters or less' },
            ]}
          >
            <Input placeholder="e.g. Welcome message, Price list, Location" maxLength={80} />
          </Form.Item>

          <Form.Item
            name="message"
            label="Message"
            dependencies={['link']}
            rules={[
              { max: 3500, message: 'Message must be 3500 characters or less' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (String(value || '').trim() || String(getFieldValue('link') || '').trim()) return Promise.resolve()
                  return Promise.reject(new Error('Enter a message or a link'))
                },
              }),
            ]}
          >
            <Input.TextArea
              placeholder="Type the reply text…"
              autoSize={{ minRows: 3, maxRows: 8 }}
              maxLength={3500}
              showCount
            />
          </Form.Item>

          <Form.Item
            name="link"
            label="Link (optional)"
            extra="Sent on its own line after the message; WhatsApp shows a preview for it."
            rules={[
              { max: 500, message: 'Link must be 500 characters or less' },
              {
                validator(_, value) {
                  const v = String(value || '').trim()
                  if (!v || LINK_RE.test(v)) return Promise.resolve()
                  return Promise.reject(new Error('Enter a valid link starting with https://'))
                },
              },
            ]}
          >
            <Input prefix={<LinkOutlined />} placeholder="https://example.com/brochure.pdf" maxLength={500} />
          </Form.Item>

          <Form.Item name="isActive" label="Show in Live Chat" valuePropName="checked">
            <Switch />
          </Form.Item>

          {previewText ? (
            <div style={{ marginBottom: 16 }}>
              <div className="mgmt-muted" style={{ fontSize: 12, marginBottom: 4 }}>Customer will receive:</div>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 13,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(179, 130, 0, 0.08)',
                  border: '1px solid rgba(179, 130, 0, 0.25)',
                }}
              >
                {previewText}
              </div>
            </div>
          ) : null}

          <Form.Item style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={isCreating || isUpdating}
                style={{ width: isMobile ? '100%' : 'auto' }}
              >
                {editing?._id ? 'Update' : 'Save'}
              </Button>
              <Button onClick={closeModal} style={{ width: isMobile ? '100%' : 'auto' }}>
                Cancel
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default WhatsAppQuickReplies
