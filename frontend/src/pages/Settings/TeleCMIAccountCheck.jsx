import React from 'react'
import { Alert, Button, Descriptions, Tag } from 'antd'
import { SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useLazyGetTeleCMIAccountStatusQuery } from '../../store/api/telecmiSettingsApi'
import { useResponsive } from '../../hooks/useResponsive'

const fmt = (value) => (value ? dayjs(value).format('DD/MM/YYYY hh:mm A') : '—')

/**
 * Settings → API & Integrations → TeleCMI Integration: reads the TeleCMI app's own call balance,
 * validity and agents live from TeleCMI (read-only), so a "balance is 0" block can be checked
 * against what TeleCMI reports for the app rather than the account wallet.
 */
const TeleCMIAccountCheck = () => {
  const { isMobile } = useResponsive()
  const [runCheck, { data, error, isFetching }] = useLazyGetTeleCMIAccountStatusQuery()

  return (
    <div data-testid="telecmi-account-check" style={{ marginTop: 8 }}>
      <h4 className="mgmt-card-title-text" style={{ marginBottom: 4 }}>TeleCMI account check</h4>
      <p className="mgmt-modal-hint">
        Asks TeleCMI for this app&apos;s call balance, validity and users. Nothing is changed and no call is placed.
      </p>
      <Button
        icon={<SyncOutlined spin={isFetching} />}
        onClick={() => runCheck()}
        loading={isFetching}
        style={{ width: isMobile ? '100%' : 'auto', marginBottom: 16 }}
        data-testid="telecmi-account-check-btn"
      >
        Check TeleCMI account
      </Button>

      {error && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Could not check the TeleCMI account"
          description={error?.data?.message}
        />
      )}

      {data && !isFetching && (
        <>
          <Alert
            type={data.ready ? 'success' : 'warning'}
            showIcon
            style={{ marginBottom: 16 }}
            message={data.ready ? 'TeleCMI is ready for click-to-call' : 'TeleCMI click-to-call will not work yet'}
            description={
              data.warnings?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="telecmi-account-warnings">
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : (
                `Checked ${fmt(data.checkedAt)}`
              )
            }
          />

          <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="TeleCMI app">{data.appId || '—'}</Descriptions.Item>
            <Descriptions.Item label="App call balance">
              {data.balance?.ok ? (
                <span data-testid="telecmi-account-balance">
                  <Tag color={data.balance.balance > 0 ? 'green' : data.balanceCheckEnabled ? 'red' : 'default'}>
                    ₹{Number(data.balance.balance).toFixed(2)}
                  </Tag>
                  {!data.balanceCheckEnabled && <Tag>not blocking calls (block only with TELECMI_BALANCE_CHECK=true)</Tag>}
                </span>
              ) : (
                <span style={{ color: '#ff4d4f' }}>{data.balance?.message || '—'}</span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Valid till">
              {data.balance?.expire ? (
                <Tag color={data.balance.expire > Date.now() ? 'green' : 'red'}>{fmt(data.balance.expire)}</Tag>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="App number">
              {data.appNumber ? `+${data.appNumber}` : '—'}
              {data.appNumber && data.fromPhoneNumber && (
                <span className="mgmt-modal-hint"> (From Phone Number: {data.fromPhoneNumber})</span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Last webhook">
              {data.lastWebhook ? `${fmt(data.lastWebhook.at)} — ${data.lastWebhook.variant} ${data.lastWebhook.status}` : 'None received'}
            </Descriptions.Item>
            <Descriptions.Item label="Users">
              {data.agents?.length ? (
                data.agents.map((a) => (
                  <div key={`${a.name}-${a.agentId}`} style={{ marginBottom: 4 }}>
                    <Tag color={a.ok ? 'green' : a.ok === false ? 'red' : 'default'}>
                      {a.ok ? 'OK' : a.ok === false ? 'Will fail' : 'Not checked'}
                    </Tag>
                    {a.name} — <code style={{ fontSize: 12 }}>{a.agentId}</code>
                    {!a.active && <Tag style={{ marginLeft: 4 }}>inactive</Tag>}
                    {a.reason && <span className="mgmt-modal-hint"> {a.reason}</span>}
                  </div>
                ))
              ) : (
                'No user has a TeleCMI User ID (Settings → User Management)'
              )}
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
    </div>
  )
}

export default TeleCMIAccountCheck
