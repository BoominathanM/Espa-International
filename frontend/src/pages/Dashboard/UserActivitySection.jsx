import React, { useMemo, useState } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, DatePicker, Input, Tooltip, Empty, Spin, Button, Alert } from 'antd'
import {
  FieldTimeOutlined,
  ReloadOutlined,
  SearchOutlined,
  CheckCircleFilled,
  PauseCircleFilled,
  MinusCircleFilled,
  InfoCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useGetUserActivitySummaryQuery } from '../../store/api/userActivityApi'
import { isSuperAdmin } from '../../utils/permissions'
import { formatDuration, moduleLabel } from '../../utils/activityModules'
import { useResponsive } from '../../hooks/useResponsive'
import './user-activity.css'

const { RangePicker } = DatePicker

export const STATUS_META = {
  online: { label: 'Online', color: 'success', icon: <CheckCircleFilled /> },
  away: { label: 'Away', color: 'warning', icon: <PauseCircleFilled /> },
  offline: { label: 'Offline', color: 'default', icon: <MinusCircleFilled /> },
}
export const STATUS_ORDER = { online: 0, away: 1, offline: 2 }

const SESSION_STATE = {
  active: { label: 'Active now', color: 'success' },
  logout: { label: 'Logged out', color: 'default' },
  timeout: { label: 'Closed / timed out', color: 'default' },
}

const HELP_TEXT =
  'Login time counts while the CRM is open in the browser. Active time counts only while the user is working in it; ' +
  'after 5 minutes without mouse or keyboard input the time is counted as idle. Module and tab time add up to the active time.'

const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

const capitalize = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '-')

const locationLabel = (moduleKey, tab) => (moduleKey ? [moduleLabel(moduleKey), tab].filter(Boolean).join(' › ') : '')

const ShareBar = ({ seconds, total, compact = false }) => (
  <div className={`ua-bar${compact ? ' ua-bar--compact' : ''}`} aria-hidden="true">
    <div className="ua-bar__fill" style={{ width: `${Math.min(100, percent(seconds, total))}%` }} />
  </div>
)

export const StatusTag = ({ status, moduleKey, tab }) => {
  const meta = STATUS_META[status] || STATUS_META.offline
  const where = status !== 'offline' ? locationLabel(moduleKey, tab) : ''
  return (
    <div>
      <Tag color={meta.color} icon={meta.icon} className="ua-status-tag">
        {meta.label}
      </Tag>
      {where && (
        <Tooltip title={`Currently in ${where}`}>
          <span className="ua-where">{where}</span>
        </Tooltip>
      )}
    </div>
  )
}

/** Active time per module, with the tabs inside each module. */
const ModuleBreakdown = ({ modules, activeSeconds }) => {
  if (!modules?.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No module activity recorded for this period" />
  }
  return (
    <div className="ua-modules">
      {modules.map((m) => {
        const label = moduleLabel(m.module)
        const hasTabs = m.tabs.some((t) => t.tab)
        return (
          <div className="ua-module" key={m.module}>
            <Tooltip title={`${label}: ${formatDuration(m.seconds)} (${percent(m.seconds, activeSeconds)}% of active time)`}>
              <div className="ua-row">
                <span className="ua-row__label">{label}</span>
                <ShareBar seconds={m.seconds} total={activeSeconds} />
                <span className="ua-row__value">
                  {formatDuration(m.seconds)}
                  <span className="ua-row__pct">{percent(m.seconds, activeSeconds)}%</span>
                </span>
              </div>
            </Tooltip>
            {hasTabs &&
              m.tabs.map((t) => (
                <Tooltip
                  key={t.tab || '__main'}
                  title={`${t.tab || 'Main view'}: ${formatDuration(t.seconds)} (${percent(t.seconds, m.seconds)}% of ${label} time)`}
                >
                  <div className="ua-row ua-row--tab">
                    <span className="ua-row__label">{t.tab || 'Main view'}</span>
                    <ShareBar seconds={t.seconds} total={m.seconds} compact />
                    <span className="ua-row__value">
                      {formatDuration(t.seconds)}
                      <span className="ua-row__pct">{percent(t.seconds, m.seconds)}%</span>
                    </span>
                  </div>
                </Tooltip>
              ))}
          </div>
        )
      })}
    </div>
  )
}

const SessionsTable = ({ sessions, timeFormat }) => {
  const columns = [
    {
      title: 'Login',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (v) => (v ? dayjs(v).format(timeFormat) : '-'),
    },
    {
      title: 'Logout / Last seen',
      key: 'end',
      render: (_, s) => {
        const meta = SESSION_STATE[s.state] || SESSION_STATE.timeout
        return (
          <span className="ua-session-end">
            {s.state === 'active' ? 'Now' : dayjs(s.endedAt || s.lastSeenAt).format(timeFormat)}
            <Tag color={meta.color} className="ua-session-tag">
              {meta.label}
            </Tag>
          </span>
        )
      },
    },
    {
      title: 'Duration',
      dataIndex: 'durationSeconds',
      key: 'durationSeconds',
      render: (v) => formatDuration(v),
    },
    {
      title: 'Device',
      key: 'device',
      render: (_, s) => (
        <span className="ua-muted">
          {[s.device, s.ipAddress].filter(Boolean).join(' · ') || '-'}
        </span>
      ),
    },
  ]
  return (
    <Table
      dataSource={sessions}
      columns={columns}
      rowKey="id"
      size="small"
      pagination={sessions.length > 10 ? { defaultPageSize: 10, size: 'small', showSizeChanger: false } : false}
      scroll={{ x: 'max-content' }}
      locale={{ emptyText: 'No login sessions in this period' }}
    />
  )
}

const UserActivityDetail = ({ user, timeFormat, showFacts = true }) => (
  <div className="ua-detail">
    {showFacts && (
      <div className="ua-facts">
        <span>
          Login time <strong>{formatDuration(user.loginSeconds)}</strong>
        </span>
        <span>
          Active <strong>{formatDuration(user.activeSeconds)}</strong>
        </span>
        <span>
          Idle <strong>{formatDuration(user.idleSeconds)}</strong>
        </span>
        <span>
          Sessions <strong>{user.sessionsCount}</strong>
        </span>
        <span>
          Last login <strong>{user.lastLoginAt ? dayjs(user.lastLoginAt).format('DD MMM YYYY, HH:mm') : '-'}</strong>
        </span>
      </div>
    )}
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={12}>
        <div className="ua-panel">
          <h4 className="ua-section-title">Time by module &amp; tab</h4>
          <ModuleBreakdown modules={user.modules} activeSeconds={user.activeSeconds} />
        </div>
      </Col>
      <Col xs={24} xl={12}>
        <div className="ua-panel">
          <h4 className="ua-section-title">Login sessions</h4>
          <SessionsTable sessions={user.sessions || []} timeFormat={timeFormat} />
        </div>
      </Col>
    </Row>
  </div>
)

const StatTile = ({ title, value, meta }) => (
  <div className="ua-tile">
    <Statistic title={title} value={value} />
    {meta ? <div className="ua-tile__meta">{meta}</div> : null}
  </div>
)

/**
 * Dashboard section: login time and module/tab time.
 * Superadmin → every user (respects the dashboard branch filter); everyone else → only themselves.
 */
const UserActivitySection = ({ branch }) => {
  const superAdmin = isSuperAdmin()
  const { isMobile } = useResponsive()
  const [range, setRange] = useState(() => [dayjs().startOf('day'), dayjs().endOf('day')])
  const [search, setSearch] = useState('')

  const todayKey = dayjs().format('YYYY-MM-DD')
  const from = range?.[0]?.format('YYYY-MM-DD') || todayKey
  const to = range?.[1]?.format('YYYY-MM-DD') || from
  const includesToday = to >= todayKey
  const multiDay = from !== to
  const timeFormat = multiDay ? 'DD MMM, HH:mm' : 'HH:mm'

  const { data, isLoading, isFetching, isError, refetch } = useGetUserActivitySummaryQuery(
    { from, to, branch: superAdmin ? branch : undefined },
    { pollingInterval: includesToday ? 60000 : 0, refetchOnMountOrArgChange: true }
  )

  const users = data?.users ?? []
  const totals = data?.totals

  const rangePresets = useMemo(
    () => [
      { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
      { label: 'Yesterday', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
      { label: 'Last 7 Days', value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] },
      { label: 'Last 30 Days', value: [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] },
      { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
    ],
    // recomputed per day so "Today" stays correct if the dashboard stays open overnight
    [todayKey]
  )

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      [u.name, u.email, u.branch, u.role].some((v) => String(v || '').toLowerCase().includes(q))
    )
  }, [users, search])

  const roleFilters = useMemo(
    () => [...new Set(users.map((u) => u.role).filter(Boolean))].map((r) => ({ text: capitalize(r), value: r })),
    [users]
  )

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <div className="ua-user">
          <span className="ua-user__name">{r.name || '-'}</span>
          <span className="ua-user__email">{r.email}</span>
        </div>
      ),
      sorter: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
    },
    {
      title: 'Branch',
      dataIndex: 'branch',
      key: 'branch',
      render: (v) => v || '-',
      sorter: (a, b) => String(a.branch || '').localeCompare(String(b.branch || ''), undefined, { sensitivity: 'base' }),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (v) => <Tag>{capitalize(v)}</Tag>,
      filters: roleFilters,
      onFilter: (value, r) => r.role === value,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v, r) => <StatusTag status={v} moduleKey={r.currentModule} tab={r.currentTab} />,
      filters: Object.entries(STATUS_META).map(([value, meta]) => ({ text: meta.label, value })),
      onFilter: (value, r) => r.status === value,
      sorter: (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3),
    },
    {
      title: 'First Seen',
      dataIndex: 'firstSeenAt',
      key: 'firstSeenAt',
      render: (v) => (v ? dayjs(v).format(timeFormat) : '-'),
      sorter: (a, b) => dayjs(a.firstSeenAt || 0).valueOf() - dayjs(b.firstSeenAt || 0).valueOf(),
    },
    {
      title: 'Last Seen',
      dataIndex: 'lastSeenAt',
      key: 'lastSeenAt',
      render: (v) => (v ? dayjs(v).format(timeFormat) : '-'),
      sorter: (a, b) => dayjs(a.lastSeenAt || 0).valueOf() - dayjs(b.lastSeenAt || 0).valueOf(),
    },
    {
      title: 'Login Time',
      dataIndex: 'loginSeconds',
      key: 'loginSeconds',
      render: (v) => <span className="ua-num">{formatDuration(v)}</span>,
      sorter: (a, b) => a.loginSeconds - b.loginSeconds,
    },
    {
      title: 'Active Time',
      dataIndex: 'activeSeconds',
      key: 'activeSeconds',
      render: (v, r) => (
        <Tooltip title={`Active ${formatDuration(v)} of ${formatDuration(r.loginSeconds)} login time · idle ${formatDuration(r.idleSeconds)}`}>
          <div className="ua-active-cell">
            <span className="ua-num">{formatDuration(v)}</span>
            <ShareBar seconds={v} total={r.loginSeconds} compact />
            <span className="ua-muted">{percent(v, r.loginSeconds)}%</span>
          </div>
        </Tooltip>
      ),
      sorter: (a, b) => a.activeSeconds - b.activeSeconds,
    },
    {
      title: 'Top Module',
      key: 'topModule',
      render: (_, r) =>
        r.modules?.[0] ? (
          <span>
            {moduleLabel(r.modules[0].module)} <span className="ua-muted">· {formatDuration(r.modules[0].seconds)}</span>
          </span>
        ) : (
          '-'
        ),
    },
  ]

  const me = !superAdmin ? users[0] : null

  const toolbar = (
    <div className="ua-toolbar">
      <span className="ua-toolbar__hint">
        {includesToday ? 'Updates every minute' : `${dayjs(from).format('DD MMM YYYY')} – ${dayjs(to).format('DD MMM YYYY')}`}
      </span>
      <div className="ua-toolbar__controls">
        {superAdmin && (
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search user, email, branch"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ua-search"
            size={isMobile ? 'small' : 'middle'}
          />
        )}
        <RangePicker
          value={range}
          onChange={(v) => setRange(v && v[0] && v[1] ? v : [dayjs().startOf('day'), dayjs().endOf('day')])}
          presets={rangePresets}
          allowClear={false}
          format="DD MMM YYYY"
          disabledDate={(d) => d && d.isAfter(dayjs().endOf('day'))}
          size={isMobile ? 'small' : 'middle'}
        />
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching && !isLoading} size={isMobile ? 'small' : 'middle'}>
          {isMobile ? null : 'Refresh'}
        </Button>
      </div>
    </div>
  )

  let body
  if (isLoading) {
    body = (
      <div className="dashboard-loading">
        <Spin />
      </div>
    )
  } else if (isError) {
    body = <Alert type="error" showIcon message="Could not load user activity. Please try again." />
  } else if (superAdmin) {
    const activePct = percent(totals?.activeSeconds || 0, totals?.loginSeconds || 0)
    body = (
      <>
        <Row gutter={[16, 16]} className="ua-summary-row">
          <Col xs={24} lg={10}>
            <Row gutter={[12, 12]}>
              <Col xs={12}>
                <StatTile
                  title="Online Now"
                  value={totals?.online ?? 0}
                  meta={`${totals?.away ?? 0} away · ${totals?.users ?? 0} users`}
                />
              </Col>
              <Col xs={12}>
                <StatTile title="Logged In" value={totals?.loggedIn ?? 0} meta={`of ${totals?.users ?? 0} users in this period`} />
              </Col>
              <Col xs={12}>
                <StatTile title="Total Login Time" value={formatDuration(totals?.loginSeconds)} meta="All users combined" />
              </Col>
              <Col xs={12}>
                <StatTile
                  title="Total Active Time"
                  value={formatDuration(totals?.activeSeconds)}
                  meta={`${activePct}% of login time`}
                />
              </Col>
            </Row>
          </Col>
          <Col xs={24} lg={14}>
            <div className="ua-panel">
              <h4 className="ua-section-title">Module usage · all users</h4>
              <ModuleBreakdown
                modules={(totals?.modules || []).map((m) => ({ ...m, tabs: [] }))}
                activeSeconds={totals?.activeSeconds || 0}
              />
            </div>
          </Col>
        </Row>
        <div className="ua-table-wrap">
          <Table
            dataSource={filteredUsers}
            columns={columns}
            rowKey="userId"
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{
              defaultPageSize: 10,
              showSizeChanger: !isMobile,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
            }}
            expandable={{
              expandedRowRender: (r) => <UserActivityDetail user={r} timeFormat={timeFormat} />,
            }}
            locale={{ emptyText: 'No users found' }}
          />
        </div>
      </>
    )
  } else if (me) {
    body = (
      <>
        <Row gutter={[12, 12]} className="ua-summary-row">
          <Col xs={12} md={6}>
            <StatTile title="Login Time" value={formatDuration(me.loginSeconds)} meta={`${me.sessionsCount} session${me.sessionsCount === 1 ? '' : 's'}`} />
          </Col>
          <Col xs={12} md={6}>
            <StatTile title="Active Time" value={formatDuration(me.activeSeconds)} meta={`${percent(me.activeSeconds, me.loginSeconds)}% of login time`} />
          </Col>
          <Col xs={12} md={6}>
            <StatTile title="Idle Time" value={formatDuration(me.idleSeconds)} meta="No mouse/keyboard for 5+ min" />
          </Col>
          <Col xs={12} md={6}>
            <StatTile
              title="First Seen"
              value={me.firstSeenAt ? dayjs(me.firstSeenAt).format(timeFormat) : '-'}
              meta={`Last login ${me.lastLoginAt ? dayjs(me.lastLoginAt).format('DD MMM, HH:mm') : '-'}`}
            />
          </Col>
        </Row>
        <UserActivityDetail user={me} timeFormat={timeFormat} showFacts={false} />
      </>
    )
  } else {
    body = <Empty description="No activity recorded yet" />
  }

  return (
    <Row gutter={[16, 16]} className="dashboard-row">
      <Col span={24}>
        <Card
          className="dashboard-card ua-card"
          title={
            <span className="dashboard-card-title">
              <FieldTimeOutlined /> {superAdmin ? 'User Activity & Login Time' : 'My Activity & Login Time'}{' '}
              <Tooltip title={HELP_TEXT}>
                <InfoCircleOutlined className="ua-help" />
              </Tooltip>
            </span>
          }
        >
          {toolbar}
          {body}
        </Card>
      </Col>
    </Row>
  )
}

export default UserActivitySection
