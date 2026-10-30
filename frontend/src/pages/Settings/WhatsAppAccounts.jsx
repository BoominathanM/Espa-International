import React, { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { ApiOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { useResponsive } from '../../hooks/useResponsive'
import { useGetBranchesQuery } from '../../store/api/branchApi'
import {
  useGetWhatsAppAccountsQuery,
  useCreateWhatsAppAccountMutation,
  useUpdateWhatsAppAccountMutation,
  useDeleteWhatsAppAccountMutation,
  useTestWhatsAppAccountMutation,
} from '../../store/api/whatsappSettingsApi'

export const accountLabel = (a) => `${a.name}${a.branch?.name ? ` — ${a.branch.name}` : a.isDefault ? ' — Default' : ''}`

const EMPTY_ACCOUNT = { name: '', branch: undefined, phoneNumber: '', backendUrl: '', apiKey: '', isDefault: false }

/** Add / edit one WhatsApp account. Mounted only while open, so each opening starts from fresh values. */
const AccountModal = ({ account, accounts, onClose }) => {
  const [form] = Form.useForm()
  const { data: branchesData } = useGetBranchesQuery()
  const [createAccount, { isLoading: isCreating }] = useCreateWhatsAppAccountMutation()
  const [updateAccount, { isLoading: isUpdating }] = useUpdateWhatsAppAccountMutation()
  const [testAccount, { isLoading: isTesting }] = useTestWhatsAppAccountMutation()
  const [testResult, setTestResult] = useState(null)
  const isFirstAccount = !account && !accounts.length

  const branchOptions = (branchesData?.branches || branchesData || []).map((b) => {
    const usedBy = accounts.find((a) => a._id !== account?._id && a.branch?._id === b._id)
    return {
      value: b._id,
      label: usedBy ? `${b.name} — used by ${usedBy.name}` : b.name,
      disabled: !!usedBy,
    }
  })

  const handleTest = async () => {
    const values = await form.validateFields(['backendUrl', 'apiKey']).catch(() => null)
    if (!values) return
    setTestResult(null)
    try {
      const result = await testAccount({ name: form.getFieldValue('name'), ...values }).unwrap()
      setTestResult({ type: 'success', text: result.message })
    } catch (err) {
      setTestResult({ type: 'error', text: err?.data?.message || 'Connection test failed' })
    }
  }

  const handleSave = async () => {
    const values = await form.validateFields().catch(() => null)
    if (!values) return
    try {
      const body = { ...values, branch: values.branch || null }
      const result = account
        ? await updateAccount({ id: account._id, ...body }).unwrap()
        : await createAccount(body).unwrap()
      message.success(result.message || 'WhatsApp account saved')
      onClose()
    } catch (err) {
      message.error(err?.data?.message || 'Failed to save WhatsApp account')
    }
  }

  return (
    <Modal
      title={account ? `Edit ${account.name}` : 'Add WhatsApp Account'}
      open
      onCancel={onClose}
      width={560}
      footer={[
        <Button key="test" icon={<ApiOutlined />} loading={isTesting} onClick={handleTest}>
          Test Connection
        </Button>,
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" icon={<SaveOutlined />} loading={isCreating || isUpdating} onClick={handleSave}>
          Save Account
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        initialValues={
          account
            ? { ...account, branch: account.branch?._id || undefined }
            : { ...EMPTY_ACCOUNT, isDefault: isFirstAccount }
        }
      >
        <Form.Item
          name="name"
          label="Account Name"
          rules={[{ required: true, whitespace: true, message: 'Please enter a name for this account' }]}
        >
          <Input placeholder="e.g. Anna Nagar WhatsApp" />
        </Form.Item>
        <Form.Item
          name="branch"
          label="Branch"
          help="Messages for this branch's customers go out from this account's number."
        >
          <Select allowClear showSearch optionFilterProp="label" placeholder="Select a branch" options={branchOptions} />
        </Form.Item>
        <Form.Item
          name="phoneNumber"
          label="WhatsApp Number"
          rules={[{ required: true, whitespace: true, message: 'Please enter the WhatsApp number' }]}
          help="The business number of this AskEVA account, with country code. Incoming replies are matched to the account by it."
        >
          <Input placeholder="919876543210" />
        </Form.Item>
        <Form.Item
          name="backendUrl"
          label="Backend URL"
          rules={[
            { required: true, message: 'Please enter Backend URL' },
            { type: 'url', message: 'Please enter a valid URL (e.g., https://api.example.com)' },
          ]}
        >
          <Input placeholder="Enter Backend URL (e.g., https://api.example.com)" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label="WhatsApp API Key"
          rules={[{ required: true, whitespace: true, message: 'Please enter WhatsApp API Key' }]}
        >
          <Input.Password placeholder="Enter WhatsApp API Key" autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="isDefault"
          label="Default account"
          valuePropName="checked"
          help="Also sends for every branch that has no account of its own. Only one account can be the default."
        >
          <Switch checkedChildren="Yes" unCheckedChildren="No" disabled={isFirstAccount} />
        </Form.Item>
      </Form>
      {testResult && <Alert style={{ marginTop: 16 }} type={testResult.type} showIcon message={testResult.text} />}
    </Modal>
  )
}

/** WhatsApp Configuration tab: every account, each with its own branch, number and credentials. */
const WhatsAppAccounts = () => {
  const { isMobile } = useResponsive()
  const { data, isLoading, error } = useGetWhatsAppAccountsQuery()
  const [deleteAccount] = useDeleteWhatsAppAccountMutation()
  const [modal, setModal] = useState({ open: false, account: null })

  const accounts = data?.accounts || []
  const hasDefault = accounts.some((a) => a.isDefault)
  const closeModal = () => setModal({ open: false, account: null })

  const handleDelete = async (account) => {
    try {
      const result = await deleteAccount(account._id).unwrap()
      message.success(result.message || 'WhatsApp account deleted')
    } catch (err) {
      message.error(err?.data?.message || 'Failed to delete WhatsApp account')
    }
  }

  const columns = [
    {
      title: 'Account',
      key: 'name',
      render: (_, a) => (
        <div>
          <strong>{a.name}</strong>
          {a.isDefault && <Tag color="blue" style={{ marginLeft: 8 }}>Default</Tag>}
          <div className="mgmt-muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>{a.backendUrl || 'No Backend URL'}</div>
        </div>
      ),
    },
    {
      title: 'Branch',
      key: 'branch',
      width: 180,
      render: (_, a) =>
        a.branch?.name || (
          <span className="mgmt-muted">{a.isDefault ? 'Branches without an account' : 'Not assigned'}</span>
        ),
    },
    {
      title: 'WhatsApp Number',
      key: 'phoneNumber',
      width: 160,
      render: (_, a) => a.phoneNumber || <Tag color="orange">Number missing</Tag>,
    },
    {
      title: 'Setup',
      key: 'setup',
      width: 170,
      render: (_, a) => (
        <span className="mgmt-muted" style={{ fontSize: 12 }}>
          {a.templateCount} template(s) · {a.eventCount} event(s)
        </span>
      ),
    },
    {
      title: 'Webhook URL',
      key: 'webhookUrl',
      render: (_, a) => (
        <Typography.Text copyable={{ text: a.webhookUrl }} style={{ fontSize: 12, wordBreak: 'break-all' }}>
          {a.webhookUrl}
        </Typography.Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      render: (_, a) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              size="small"
              icon={<EditOutlined />}
              aria-label={`Edit ${a.name}`}
              onClick={() => setModal({ open: true, account: a })}
            />
          </Tooltip>
          <Popconfirm
            title={`Delete ${a.name}?`}
            description="Its templates and event mappings are deleted and its branch uses the default account. Sent-message history is kept."
            onConfirm={() => handleDelete(a)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${a.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (isLoading) {
    return (
      <Card className="mgmt-settings-card">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <p className="mgmt-loading-text">Loading settings...</p>
        </div>
      </Card>
    )
  }

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
          <h4 className="mgmt-card-title-text" style={{ margin: 0 }}>WhatsApp Accounts</h4>
          <span className="mgmt-muted" style={{ fontSize: 13 }}>
            One account per branch. Each has its own number, templates and event mappings.
          </span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, account: null })}>
          Add Account
        </Button>
      </div>

      {error && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Could not load WhatsApp accounts"
          description={error?.data?.message || 'Please try again.'}
        />
      )}
      {!error && accounts.length > 0 && !hasDefault && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="No default account"
          description="Customers of a branch without its own account get no WhatsApp messages. Edit an account and switch Default on if they should."
        />
      )}

      {accounts.length ? (
        <Table rowKey="_id" size="small" columns={columns} dataSource={accounts} pagination={false} scroll={{ x: 1000 }} />
      ) : (
        !error && <Empty description="No WhatsApp accounts yet. Click “Add Account” to add the first one." />
      )}

      <div style={{ marginTop: 24, padding: 16, background: '#2a2a2a', borderRadius: 4, border: '1px solid #444' }}>
        <h4 className="mgmt-card-title-text" style={{ marginBottom: 8 }}>Integration Information</h4>
        <p style={{ color: '#ccc', margin: '4px 0', fontSize: '14px' }}>
          <strong>Sending:</strong> Live Chat and automatic messages go out from the account of the customer&apos;s branch.
          Live Chat replies from the number the customer wrote to if they messaged in the last 24 hours.
        </p>
        <p style={{ color: '#ccc', margin: '4px 0', fontSize: '14px' }}>
          <strong>Webhook URL:</strong> Paste each account&apos;s URL into that account&apos;s webhook settings on AskEVA, so its
          messages and leads come in to its branch.
        </p>
      </div>

      {modal.open && <AccountModal account={modal.account} accounts={accounts} onClose={closeModal} />}
    </Card>
  )
}

/**
 * Account picker above Sync Templates / Event Mapping. Those tabs work on one account at a time:
 * `children(account)` renders them for the picked account (default account until one is picked).
 */
export const WhatsAppAccountScope = ({ value, onChange, children }) => {
  const { isMobile } = useResponsive()
  const { data, isLoading } = useGetWhatsAppAccountsQuery()
  const accounts = data?.accounts || []
  const account = accounts.find((a) => a._id === value) || accounts[0]

  if (isLoading) {
    return (
      <Card className="mgmt-settings-card">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
        </div>
      </Card>
    )
  }
  if (!account) {
    return (
      <Card className="mgmt-settings-card">
        <Empty description="Add a WhatsApp account in the WhatsApp Configuration tab first." />
      </Card>
    )
  }
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="mgmt-muted" style={{ fontSize: 13 }}>WhatsApp account</span>
        <Select
          aria-label="WhatsApp account"
          value={account._id}
          onChange={onChange}
          style={{ width: isMobile ? '100%' : 320 }}
          options={accounts.map((a) => ({ value: a._id, label: accountLabel(a) }))}
        />
      </div>
      {children(account)}
    </>
  )
}

export default WhatsAppAccounts
