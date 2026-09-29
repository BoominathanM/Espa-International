import React, { useMemo, useState } from 'react'
import { Card, Button, Table, Tag, Input, Select, Alert, Space, message } from 'antd'
import { SyncOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import { useGetWhatsAppTemplatesQuery, useSyncWhatsAppTemplatesMutation } from '../../store/api/whatsappAutomationApi'

const STATUS_COLORS = { APPROVED: 'green', PENDING: 'gold', IN_APPEAL: 'gold', REJECTED: 'red', PAUSED: 'orange', DISABLED: 'default' }

export const formatDateTime = (v) => (v ? dayjs(v).format('DD MMM YYYY, hh:mm A') : '—')

/** "{{1}}" for positional variables, "{{customer_name}}" for named ones, with where it sits. */
export const variableTag = (v) => {
  const where = v.component === 'header' ? 'header ' : v.component === 'button' ? `button ${Number(v.buttonIndex) + 1} ` : ''
  return `${where}{{${v.key}}}`
}

/** The template's text as it reads, header / body / footer / buttons. */
export const TemplateText = ({ template }) => {
  if (!template) return null
  return (
    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
      {template.headerFormat && template.headerFormat !== 'TEXT' && (
        <div className="mgmt-muted" style={{ marginBottom: 4 }}>[{template.headerFormat.toLowerCase()} header]</div>
      )}
      {template.headerText && <div style={{ fontWeight: 600, marginBottom: 4 }}>{template.headerText}</div>}
      <div>{template.bodyText || <span className="mgmt-muted">(no body text)</span>}</div>
      {template.footerText && <div className="mgmt-muted" style={{ marginTop: 4, fontSize: 12 }}>{template.footerText}</div>}
      {(template.buttons || []).length > 0 && (
        <div style={{ marginTop: 6 }}>
          {template.buttons.map((b, i) => (
            <Tag key={i} style={{ marginBottom: 4 }}>
              {b.text}
              {b.url ? ` → ${b.url}` : b.phone_number ? ` → ${b.phone_number}` : ''}
            </Tag>
          ))}
        </div>
      )}
    </div>
  )
}

const WhatsAppTemplates = () => {
  const { isMobile } = useResponsive()
  const { data, isLoading, isFetching, error } = useGetWhatsAppTemplatesQuery()
  const [syncTemplates, { isLoading: isSyncing }] = useSyncWhatsAppTemplatesMutation()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const templates = data?.templates || []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter(
      (t) =>
        (!status || t.status === status) &&
        (!q || t.name.toLowerCase().includes(q) || String(t.bodyText || '').toLowerCase().includes(q))
    )
  }, [templates, search, status])

  const handleSync = async () => {
    try {
      const result = await syncTemplates().unwrap()
      message.success(result.message || 'Templates synced')
    } catch (err) {
      message.error(err?.data?.message || 'Template sync failed')
    }
  }

  const columns = [
    {
      title: 'Template',
      dataIndex: 'name',
      key: 'name',
      render: (name, t) => (
        <div>
          <strong>{name}</strong>
          <div className="mgmt-muted" style={{ fontSize: 12 }}>
            {t.language} · {t.category || '—'}
          </div>
          {t.missingFromLastSync && <Tag color="red" style={{ marginTop: 4 }}>Not on AskEVA any more</Tag>}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s, t) => (
        <>
          <Tag color={STATUS_COLORS[s] || 'default'}>{s || '—'}</Tag>
          {t.rejectedReason && <div className="mgmt-muted" style={{ fontSize: 11 }}>{t.rejectedReason}</div>}
        </>
      ),
    },
    {
      title: 'Variables',
      key: 'variables',
      width: 200,
      render: (_, t) =>
        (t.variables || []).length ? (
          (t.variables || []).map((v) => (
            <Tag key={variableTag(v)} color="blue" style={{ marginBottom: 4 }}>{variableTag(v)}</Tag>
          ))
        ) : (
          <span className="mgmt-muted">None</span>
        ),
    },
    {
      title: 'Message',
      key: 'bodyText',
      render: (_, t) => <TemplateText template={t} />,
    },
    {
      title: 'Last synced',
      dataIndex: 'lastSyncedAt',
      key: 'lastSyncedAt',
      width: 170,
      render: formatDateTime,
    },
  ]

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
          <h4 className="mgmt-card-title-text" style={{ margin: 0 }}>WhatsApp Templates (AskEVA)</h4>
          <span className="mgmt-muted" style={{ fontSize: 13 }}>
            {templates.length} template(s) · last synced {formatDateTime(data?.lastSyncedAt)}
          </span>
        </div>
        {isSuperAdmin() && (
          <Button type="primary" icon={<SyncOutlined spin={isSyncing} />} loading={isSyncing} onClick={handleSync}>
            Sync Templates
          </Button>
        )}
      </div>

      {error && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Could not load templates"
          description={error?.data?.message || 'Please try again.'}
        />
      )}
      {!isLoading && !templates.length && !error && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="No templates yet"
          description='Click "Sync Templates" to fetch your approved WhatsApp templates from AskEVA (uses the API key saved in WhatsApp Configuration).'
        />
      )}

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search name or text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: isMobile ? '100%' : 240 }}
        />
        <Select
          value={status}
          onChange={setStatus}
          style={{ width: 160 }}
          options={[
            { value: '', label: 'All statuses' },
            ...['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'].map((s) => ({ value: s, label: s })),
          ]}
        />
      </Space>

      <Table
        rowKey="templateId"
        size="small"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 900 }}
      />
    </Card>
  )
}

export default WhatsAppTemplates
