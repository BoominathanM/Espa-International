import React, { useState } from 'react'
import { Alert, Button, Descriptions, Spin, Table, Tag, message } from 'antd'
import { ApiOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  useGetGoogleCalendarStatusQuery,
  useTestGoogleCalendarMutation,
  useSyncGoogleCalendarNowMutation,
} from '../../store/api/googleCalendarApi'
import { useResponsive } from '../../hooks/useResponsive'

const STATUS_LABELS = [
  ['synced', 'In Google', 'green'],
  ['pending', 'Waiting', 'blue'],
  ['error', 'Failed', 'red'],
  ['skipped', 'Not sent', 'default'],
  ['deleted_in_google', 'Deleted in Google', 'orange'],
]

const fmt = (value) => (value ? dayjs(value).format('DD/MM/YYYY hh:mm A') : '—')

/** Settings → API & Integrations → Google Calendar. Read-only: everything is configured in backend/.env. */
const GoogleCalendarSettings = () => {
  const { isMobile } = useResponsive()
  const [messageApi, contextHolder] = message.useMessage()
  const { data, isLoading, error, refetch, isFetching } = useGetGoogleCalendarStatusQuery()
  const [testAccess, { isLoading: testing }] = useTestGoogleCalendarMutation()
  const [syncNow, { isLoading: syncing }] = useSyncGoogleCalendarNowMutation()
  const [access, setAccess] = useState(null) // calendarId -> { ok, error }

  const onTest = async () => {
    try {
      const res = await testAccess().unwrap()
      setAccess(Object.fromEntries((res.calendars || []).map((c) => [c.calendarId, c])))
      if (res.ok) messageApi.success('All calendars are reachable')
      else messageApi.warning(res.error || 'Some calendars could not be reached — see the Access column')
    } catch (e) {
      messageApi.error(e?.data?.message || 'Connection test failed')
    }
  }

  const onSyncNow = async () => {
    try {
      const res = await syncNow().unwrap()
      messageApi.success(
        res.skipped ? 'A sync is already running' : `Sync done — ${res.backfilled || 0} upcoming appointment(s) queued for Google`
      )
      refetch()
    } catch (e) {
      messageApi.error(e?.data?.message || 'Sync failed')
    }
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (error) {
    return (
      <Alert
        type="warning"
        showIcon
        message={error?.status === 403 ? 'Access restricted' : 'Could not load Google Calendar status'}
        description={error?.status === 403 ? 'Only Super Admin can view the Google Calendar integration.' : error?.data?.message}
      />
    )
  }

  const branchColumns = [
    { title: 'Branch', dataIndex: 'name', key: 'name' },
    {
      title: '.env variable',
      dataIndex: 'envKey',
      key: 'envKey',
      render: (v) => <code style={{ fontSize: 12 }}>{v}</code>,
    },
    {
      title: 'Calendar',
      key: 'calendarId',
      render: (_, row) =>
        row.calendarId ? (
          <span style={{ wordBreak: 'break-all', fontSize: 12 }}>
            {row.calendarId} {row.source === 'default' && <Tag>default</Tag>}
          </span>
        ) : (
          <Tag color="orange">Not set — not synced</Tag>
        ),
    },
    {
      title: 'Access',
      key: 'access',
      render: (_, row) => {
        const check = access?.[row.calendarId]
        if (!row.calendarId || !check) return '—'
        return check.ok ? <Tag color="green">OK</Tag> : <Tag color="red" title={check.error}>Failed</Tag>
      },
    },
  ]

  const failedChecks = Object.values(access || {}).filter((c) => !c.ok)

  return (
    <div>
      {contextHolder}
      <Alert
        type={data.enabled ? 'success' : 'info'}
        showIcon
        style={{ marginBottom: 16 }}
        message={data.enabled ? 'Two-way sync is ON' : 'Two-way sync is OFF'}
        description={
          data.enabled
            ? 'Appointments are copied to each branch’s Google Calendar, and moves / deletions / "Name - Phone" bookings made in Google come back into the CRM.'
            : 'Set GOOGLE_CALENDAR_SYNC_ENABLED=true in backend/.env and restart the backend to turn it on. You can test the connection first.'
        }
      />

      <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
        <Descriptions.Item label={data.credentials.mode === 'service_account' ? 'Service account' : 'Google account'}>
          {data.credentials.ok ? (
            <span style={{ wordBreak: 'break-all' }}>{data.credentials.clientEmail}</span>
          ) : (
            <span style={{ color: '#ff4d4f' }}>{data.credentials.error}</span>
          )}
        </Descriptions.Item>
        {data.enabled && data.syncServer && (
          <Descriptions.Item label="Sync server">
            {data.syncServer.isThisServer ? (
              <span>This server ({data.syncServer.thisServer}) runs the sync</span>
            ) : data.syncServer.activeServer ? (
              <span>
                {data.syncServer.activeServer}
                {data.syncServer.activeHost ? ` (${data.syncServer.activeHost})` : ''} runs the sync — this server (
                {data.syncServer.thisServer}, {data.syncServer.thisHost}) is passive; its changes reach Google through that
                server
                {data.syncServer.activeServer === data.syncServer.thisServer && (
                  <div style={{ color: '#faad14', marginTop: 4 }}>
                    Two servers use the same GOOGLE_CALENDAR_SERVER_NAME — set it (and GOOGLE_CALENDAR_WEBHOOK_URL) only in
                    the .env of the server that should run the sync, then restart the other one.
                  </div>
                )}
              </span>
            ) : (
              <span>Starting… (no server is running the sync yet)</span>
            )}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Google → CRM updates">
          {data.webhookUrl ? `Instant (push to ${data.webhookUrl}), plus a check every ${data.pollMinutes} min` : `Checked every ${data.pollMinutes} min (set GOOGLE_CALENDAR_WEBHOOK_URL for instant updates)`}
        </Descriptions.Item>
        <Descriptions.Item label="Reminder">
          {data.reminderMinutes > 0 ? `Pop-up ${data.reminderMinutes} min before` : 'None'}
        </Descriptions.Item>
        <Descriptions.Item label="Appointments">
          {STATUS_LABELS.map(([key, label, color]) => (
            <Tag key={key} color={color} style={{ marginBottom: 4 }}>
              {label}: {data.counts?.[key] || 0}
            </Tag>
          ))}
        </Descriptions.Item>
      </Descriptions>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 16 }}>
        <Button icon={<ApiOutlined />} onClick={onTest} loading={testing}>
          Test connection
        </Button>
        <Button type="primary" icon={<SyncOutlined />} onClick={onSyncNow} loading={syncing} disabled={!data.enabled}>
          Sync now
        </Button>
        <Button onClick={() => refetch()} loading={isFetching}>
          Refresh
        </Button>
      </div>

      {failedChecks.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Calendar access problems"
          description={failedChecks.map((c) => (
            <div key={c.calendarId} style={{ wordBreak: 'break-all' }}>
              {c.calendarId}: {c.error}
            </div>
          ))}
        />
      )}

      <Table
        rowKey="name"
        size="small"
        columns={branchColumns}
        dataSource={data.branches}
        pagination={false}
        scroll={{ x: true }}
        style={{ marginBottom: 16 }}
      />

      {data.calendars.length > 0 && (
        <Table
          rowKey="calendarId"
          size="small"
          pagination={false}
          scroll={{ x: true }}
          style={{ marginBottom: 16 }}
          dataSource={data.calendars}
          columns={[
            {
              title: 'Calendar',
              dataIndex: 'calendarId',
              key: 'calendarId',
              render: (v, row) => (
                <span style={{ wordBreak: 'break-all', fontSize: 12 }}>
                  {v}
                  <br />
                  <span style={{ opacity: 0.7 }}>{row.branches.join(', ') || 'default'}</span>
                </span>
              ),
            },
            {
              title: 'Last read from Google',
              key: 'lastSyncAt',
              render: (_, row) => (row.lastError ? <span style={{ color: '#ff4d4f' }}>{row.lastError}</span> : fmt(row.lastSyncAt)),
            },
            {
              title: 'Push notifications',
              key: 'push',
              render: (_, row) =>
                row.pushError ? (
                  <span style={{ color: '#faad14' }}>{row.pushError}</span>
                ) : row.pushUntil ? (
                  `On until ${fmt(row.pushUntil)}`
                ) : (
                  '—'
                ),
            },
          ]}
        />
      )}

      {data.recentErrors.length > 0 && (
        <Table
          rowKey={(r) => r.id}
          size="small"
          pagination={false}
          scroll={{ x: true }}
          title={() => 'Recent failures (retried automatically)'}
          dataSource={data.recentErrors}
          columns={[
            { title: 'Customer', dataIndex: 'name', key: 'name' },
            {
              title: 'Appointment',
              key: 'when',
              render: (_, r) => `${r.appointmentDate ? dayjs(r.appointmentDate).format('DD/MM/YYYY') : '—'} ${r.slot}`,
            },
            { title: 'Error', dataIndex: 'error', key: 'error' },
            { title: 'Tries', dataIndex: 'attempts', key: 'attempts', width: 60 },
          ]}
        />
      )}
    </div>
  )
}

export default GoogleCalendarSettings
