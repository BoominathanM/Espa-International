import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Form,
  Switch,
  Select,
  Input,
  Radio,
  Checkbox,
  Button,
  Table,
  Tag,
  Alert,
  Divider,
  Popconfirm,
  Collapse,
  Row,
  Col,
  Spin,
  Modal,
  Empty,
  Tooltip,
  InputNumber,
  message,
} from 'antd'
import {
  SaveOutlined,
  SendOutlined,
  EyeOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  CloseOutlined,
  RightOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetWhatsAppEventsQuery,
  useGetWhatsAppTemplatesQuery,
  useSaveWhatsAppEventMappingMutation,
  useDeleteWhatsAppEventMappingMutation,
  useTestWhatsAppEventMappingMutation,
  useGetRecentAiCallsForEventQuery,
  usePreviewWhatsAppEventForCallMutation,
  useSendWhatsAppEventForCallMutation,
  useRunWhatsAppEventCheckMutation,
  useGetWhatsAppEventLogsQuery,
} from '../../store/api/whatsappAutomationApi'
import { formatDateTime, variableTag, TemplateText } from './WhatsAppTemplates'

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g
const MEDIA_HEADERS = ['IMAGE', 'VIDEO', 'DOCUMENT']
const LOG_STATUS_COLORS = { sent: 'green', failed: 'red', skipped: 'orange', pending: 'blue' }
const SOURCE_LABELS = {
  'ai-callback': 'AI call-back',
  'ai-inbound': 'AI inbound',
  test: 'Test',
  'telecmi-missed': 'TeleCMI missed',
  'ai-callback-missed': 'AI call-back missed',
  'ai-inbound-missed': 'AI inbound missed',
}
// "Missed Call Hi Message" (backend services/whatsappMissedCallService.js)
const MISSED_CALL_EVENT = 'missed_call_message'
const DEFAULT_MISSED_TEXT = 'Hi'
const MISSED_TRIGGER_LABELS = {
  telecmi: 'TeleCMI call missed',
  aiCallback: 'AI call-back not answered',
  aiInbound: 'AI inbound call not answered',
}
const MISSED_VALUE_KEYS = ['name', 'mobile', 'branch']
const VALUE_LABELS = {
  name: 'Customer Name',
  mobile: 'Mobile Number',
  branch: 'Branch',
  therapy: 'Therapy',
  appointment: 'Appointment Date & Time',
  payment_link: 'Payment Link',
}

/** Picker value of a recent call — a TeleCMI row can be missed twice (the call + its AI call-back). */
const callKey = (c) => c.key || String(c.refId)

const sameVar = (a, b) =>
  a.component === b.component && String(a.key) === String(b.key) && (a.component !== 'button' || Number(a.buttonIndex) === Number(b.buttonIndex))

/** First guess of what a new template variable should be filled with, from its name / example. */
const guessSource = (v) => {
  const t = `${v.key} ${v.example || ''}`.toLowerCase()
  if (v.component === 'button' || /pay|link|https?:/.test(t)) return 'payment_link'
  if (/appoint|date|time|slot|book|schedule/.test(t)) return 'appointment'
  if (/therap|treat|service|massage|spa/.test(t)) return 'therapy'
  if (/branch|location|outlet|centre|center/.test(t)) return 'branch'
  if (/mobile|phone|contact|number/.test(t)) return 'mobile'
  if (/name|customer|guest|sir|madam|user/.test(t)) return 'name'
  return ''
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Same rewrite the backend applies before sending (resolveRelativeDate), so the preview matches. */
const previewRelativeDate = (text) => {
  const rules = [
    [/\bday\s+after\s+(tomorrow|tommorow|tomorow)\b/i, 2],
    [/\b(tomorrow|tommorow|tomorow|tmrw)\b/i, 1],
    [/\btoday\b/i, 0],
  ]
  for (const [re, days] of rules) {
    if (re.test(text)) {
      const d = new Date(Date.now() + IST_OFFSET_MS + days * 24 * 60 * 60 * 1000)
      const day = `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
      return text.replace(re, day).replace(/\s{2,}/g, ' ').trim()
    }
  }
  return text
}

const EMPTY_SAMPLE = {
  to: '',
  name: 'Test Customer',
  mobile: '9876543210',
  branch: 'Anna Nagar',
  therapy: 'body pain relief',
  appointment: 'tomorrow 10 a.m.',
}

const ValuesTable = ({ values, keys }) => (
  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
    <tbody>
      {Object.entries(VALUE_LABELS).filter(([k]) => !keys || keys.includes(k)).map(([k, label]) => (
        <tr key={k} style={{ borderBottom: '1px solid var(--border-color)' }}>
          <td style={{ padding: '4px 8px 4px 0', width: '40%' }} className="mgmt-muted">{label}</td>
          <td style={{ padding: '4px 0', wordBreak: 'break-all' }}>
            {values?.[k] ? String(values[k]) : <span className="mgmt-muted">—</span>}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

const JsonBlock = ({ value }) => (
  <pre style={{ fontSize: 12, maxHeight: 280, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
    {JSON.stringify(value, null, 2)}
  </pre>
)

/** Server unreachable (e.g. the backend restarting) or a gateway error — worth trying again. */
const isTransientError = (err) =>
  err?.status === 'FETCH_ERROR' || err?.status === 'TIMEOUT_ERROR' || [502, 503, 504].includes(err?.status)

/**
 * Run an idempotent request (the event PUT / DELETE) and retry it while the server can't be
 * reached. The local backend restarts for a few seconds whenever a backend file changes; a save
 * sent in that window used to be lost, and the event was "missing" after a refresh.
 */
const RETRY_DELAYS_MS = [1000, 2000, 3000, 4000]
const withRetry = async (run, onRetry) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (err) {
      if (!isTransientError(err) || attempt >= RETRY_DELAYS_MS.length) throw err
      onRetry?.(attempt + 1, RETRY_DELAYS_MS.length)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }
}

const EventMappingCard = ({ event, templates, onRemove, removing, defaultOpen = false }) => {
  const { isMobile } = useResponsive()
  const [form] = Form.useForm()
  const mapping = event.mapping
  const isMissed = event.key === MISSED_CALL_EVENT
  const [variables, setVariables] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [dirty, setDirty] = useState(false)
  const [sample, setSample] = useState(EMPTY_SAMPLE)
  const [testResult, setTestResult] = useState(null)
  const [selectedCall, setSelectedCall] = useState(undefined)
  const [preview, setPreview] = useState(null)
  const [logPage, setLogPage] = useState(1)
  const [saveNotice, setSaveNotice] = useState(null) // { type, title, items } of the last Save
  // A saved event starts collapsed to its summary line; one just added from "Add Event" opens.
  // Collapsing only hides the body — the form stays mounted, so unsaved edits are kept.
  const [expanded, setExpanded] = useState(!mapping || defaultOpen)
  const [everOpened, setEverOpened] = useState(!mapping || defaultOpen)
  const open = !mapping || expanded
  const toggleOpen = () => {
    setExpanded(!open)
    setEverOpened(true)
  }
  useEffect(() => {
    if (!defaultOpen) return
    setExpanded(true)
    setEverOpened(true)
  }, [defaultOpen])

  const [saveMapping, { isLoading: isSaving }] = useSaveWhatsAppEventMappingMutation()
  const [testMapping, { isLoading: isTesting }] = useTestWhatsAppEventMappingMutation()
  const [previewForCall, { isLoading: isPreviewing }] = usePreviewWhatsAppEventForCallMutation()
  const [sendForCall, { isLoading: isSendingForCall }] = useSendWhatsAppEventForCallMutation()
  const [runCheck, { isLoading: isRunningCheck }] = useRunWhatsAppEventCheckMutation()
  // Recent calls / message log load only once the card has been opened.
  const { data: recentData, isFetching: isFetchingRecent, refetch: refetchRecent } = useGetRecentAiCallsForEventQuery(
    event.key,
    { skip: !everOpened }
  )
  const { data: logsData, isFetching: isFetchingLogs, refetch: refetchLogs } = useGetWhatsAppEventLogsQuery(
    { eventKey: event.key, page: logPage, limit: 10 },
    { skip: !everOpened }
  )

  // Load the saved mapping (again only when it really changed — not on every refetch while editing).
  useEffect(() => {
    form.setFieldsValue({
      isActive: !!mapping?.isActive,
      headerMediaUrl: mapping?.headerMediaUrl || '',
      headerMediaFilename: mapping?.headerMediaFilename || '',
      paymentLink: mapping?.paymentLink || '',
      sendTo: mapping?.sendTo || 'call_number',
      triggerAiCallback: mapping ? mapping.triggerAiCallback !== false : true,
      triggerAiInbound: !!mapping?.triggerAiInbound,
      resolveRelativeDates: mapping ? mapping.resolveRelativeDates !== false : true,
      ...(isMissed
        ? {
            messageType: mapping?.messageType || 'text',
            textMessage: mapping?.textMessage || DEFAULT_MISSED_TEXT,
            missedTriggers: {
              telecmi: mapping?.missedTriggers?.telecmi !== false,
              aiCallback: mapping?.missedTriggers?.aiCallback !== false,
              aiInbound: mapping?.missedTriggers?.aiInbound !== false,
            },
            cooldownHours: mapping?.cooldownHours ?? 24,
            skipIfAnswered: mapping ? mapping.skipIfAnswered !== false : true,
          }
        : {}),
    })
    setTemplateId(mapping?.templateId || '')
    setVariables((mapping?.variables || []).map((v) => ({ ...v })))
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping?._id, mapping?.updatedAt])

  const template = useMemo(() => templates.find((t) => t.templateId === templateId) || null, [templates, templateId])

  // Keep the example text of each variable from the synced template.
  const rows = useMemo(
    () => variables.map((v) => ({ ...v, example: template?.variables?.find((tv) => sameVar(tv, v))?.example || '' })),
    [variables, template]
  )

  const headerFormat = template?.headerFormat || mapping?.headerFormat || ''
  const needsMedia = MEDIA_HEADERS.includes(headerFormat)
  const paymentLink = Form.useWatch('paymentLink', form)
  const resolveRelativeDates = Form.useWatch('resolveRelativeDates', form)
  const messageType = Form.useWatch('messageType', form)
  const textMessage = Form.useWatch('textMessage', form)
  // Missed-call event in plain-text mode: the template is only the (optional) fallback.
  const isTextMode = isMissed && messageType === 'text'
  const canSendWithoutTemplate = isTextMode

  const templateOptions = useMemo(() => {
    const opts = templates.map((t) => ({
      value: t.templateId,
      disabled: t.status !== 'APPROVED' || t.missingFromLastSync,
      label: `${t.name} (${t.language})${t.status !== 'APPROVED' ? ` — ${t.status}` : ''}${t.missingFromLastSync ? ' — removed' : ''}`,
    }))
    if (mapping?.templateId && !templates.some((t) => t.templateId === mapping.templateId)) {
      opts.unshift({ value: mapping.templateId, label: `${mapping.templateName} (${mapping.templateLanguage}) — not synced` })
    }
    return opts
  }, [templates, mapping])

  const markDirty = () => setDirty(true)

  const handleTemplateChange = (id) => {
    const t = templates.find((x) => x.templateId === id)
    // Only guess a value this event offers (the missed-call event has no therapy / payment link…)
    const allowed = new Set((event.sources || []).map((s) => s.key))
    setTemplateId(id || '')
    setVariables(
      (t?.variables || []).map((tv) => {
        const prev = variables.find((p) => sameVar(p, tv))
        const guess = guessSource(tv)
        return prev
          ? { ...prev }
          : {
              component: tv.component,
              key: tv.key,
              buttonIndex: tv.buttonIndex ?? null,
              source: allowed.has(guess) ? guess : '',
              staticValue: '',
              fallback: '',
            }
      })
    )
    markDirty()
  }

  const updateVariable = (index, patch) => {
    setVariables((list) => list.map((v, i) => (i === index ? { ...v, ...patch } : v)))
    markDirty()
  }

  const buildBody = () => {
    const values = form.getFieldsValue()
    return {
      eventKey: event.key,
      ...values,
      templateId: template?.templateId || templateId || mapping?.templateId || '',
      templateName: template?.name || (templateId === mapping?.templateId ? mapping?.templateName : '') || '',
      templateLanguage: template?.language || mapping?.templateLanguage || 'en',
      headerFormat,
      variables: variables.map(({ component, key, buttonIndex, source, staticValue, fallback }) => ({
        component,
        key,
        buttonIndex,
        source,
        staticValue,
        fallback,
      })),
    }
  }

  // The outcome of the last Save stays in the card (a toast alone was easy to miss, and a save that
  // silently failed looked like "saved, then gone after refresh").
  const handleSave = async () => {
    try {
      await form.validateFields()
    } catch (err) {
      setSaveNotice({ type: 'error', title: 'Not saved — fix the highlighted fields', items: [] })
      return
    }
    try {
      const body = buildBody()
      const result = await withRetry(
        () => saveMapping(body).unwrap(),
        (n, total) =>
          setSaveNotice({ type: 'info', title: `Server not reachable (it may be restarting) — retrying ${n}/${total}…`, items: [] })
      )
      setDirty(false)
      if (result.activationProblems?.length) {
        setSaveNotice({
          type: 'warning',
          title: 'Saved — but automatic sending is OFF until you finish:',
          items: result.activationProblems,
        })
        message.warning('Saved as Inactive — see the list in the card')
      } else {
        setSaveNotice(null)
        message.success(result.message || 'Event mapping saved')
      }
    } catch (err) {
      const title = isTransientError(err)
        ? 'Not saved — could not reach the server. Check that the backend is running, then click Save Mapping again.'
        : `Not saved — ${err?.data?.message || 'the server refused the request'}`
      setSaveNotice({ type: 'error', title, items: err?.data?.errors?.length > 1 ? err.data.errors : [] })
      message.error(title)
    }
  }

  // Unsaved work (an added event not saved yet, or edits) — warn before a refresh / tab close drops it.
  useEffect(() => {
    if (mapping && !dirty) return undefined
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [mapping, dirty])

  const handleTest = async () => {
    if (!sample.to.trim()) {
      message.warning('Enter the WhatsApp number to send the test to')
      return
    }
    setTestResult(null)
    try {
      const result = await testMapping({ ...buildBody(), to: sample.to, sample }).unwrap()
      setTestResult(result)
      message.success(result.message || 'Test message sent')
    } catch (err) {
      setTestResult(err?.data || { success: false, message: 'Test send failed' })
      message.error(err?.data?.message || 'Test send failed')
    }
  }

  const handlePreview = async () => {
    setPreview(null)
    const call = (recentData?.calls || []).find((c) => callKey(c) === String(selectedCall))
    try {
      const result = await previewForCall({ ...buildBody(), source: call?.source, refId: call?.refId }).unwrap()
      setPreview(result)
      if (!selectedCall && result.refId) setSelectedCall(result.key || String(result.refId))
    } catch (err) {
      message.error(err?.data?.message || 'Preview failed')
    }
  }

  const handleSendForCall = async () => {
    if (!preview?.refId) return
    try {
      const result = await sendForCall({ eventKey: event.key, source: preview.source, refId: preview.refId }).unwrap()
      message.success(result.message || 'Confirmation sent')
      refetchRecent()
      refetchLogs()
      handlePreview()
    } catch (err) {
      message.error(err?.data?.message || 'Send failed')
      refetchLogs()
    }
  }

  // Missed-call event: run the 5-minute check right now
  const handleRunCheck = async () => {
    try {
      const result = await runCheck(event.key).unwrap()
      message.success(result.message || 'Check finished')
      refetchRecent()
      refetchLogs()
    } catch (err) {
      message.error(err?.data?.message || 'Check failed')
    }
  }

  /** Value a variable shows in the message preview (sample data from the test section). */
  const sampleValueFor = (v) => {
    if (!v) return ''
    let value = ''
    if (v.source === 'static') value = v.staticValue
    else if (v.source === 'payment_link') value = paymentLink
    else if (v.source === 'appointment' && resolveRelativeDates !== false) value = previewRelativeDate(String(sample.appointment || ''))
    else if (v.source) value = sample[v.source]
    return String(value || v.fallback || '').trim()
  }

  const fill = (text, component, buttonIndex = null) =>
    String(text || '').replace(PLACEHOLDER_RE, (m, key) => {
      const v = variables.find((x) => sameVar(x, { component, key, buttonIndex }))
      const val = sampleValueFor(v)
      return val || `[${v?.source ? VALUE_LABELS[v.source] || 'Custom text' : `{{${key}}} not mapped`}]`
    })

  const sourceOptions = (event.sources || []).map((s) => ({ value: s.key, label: s.label }))
  const recentCalls = recentData?.calls || []
  const canEdit = isSuperAdmin()

  const variableColumns = [
    {
      title: 'Variable',
      key: 'var',
      width: 150,
      render: (_, v) => (
        <>
          <Tag color="blue">{variableTag(v)}</Tag>
          {v.example && <div className="mgmt-muted" style={{ fontSize: 11 }}>e.g. {v.example}</div>}
        </>
      ),
    },
    {
      title: 'Map to',
      key: 'source',
      width: 220,
      render: (_, v, i) => (
        <Select
          value={v.source || undefined}
          placeholder="Select value"
          options={sourceOptions}
          onChange={(source) => updateVariable(i, { source })}
          style={{ width: '100%' }}
          status={!v.source ? 'warning' : undefined}
          disabled={!canEdit}
        />
      ),
    },
    {
      title: 'Custom text / Fallback',
      key: 'extra',
      render: (_, v, i) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {v.source === 'static' && (
            <Input
              value={v.staticValue}
              placeholder="Text to send"
              onChange={(e) => updateVariable(i, { staticValue: e.target.value })}
              disabled={!canEdit}
            />
          )}
          <Input
            value={v.fallback}
            placeholder="Fallback when empty (optional)"
            onChange={(e) => updateVariable(i, { fallback: e.target.value })}
            disabled={!canEdit}
          />
        </div>
      ),
    },
  ]

  const logColumns = [
    { title: 'Time', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: formatDateTime },
    { title: 'Trigger', dataIndex: 'source', key: 'source', width: 110, render: (s) => SOURCE_LABELS[s] || s },
    { title: 'To', dataIndex: 'to', key: 'to', width: 130 },
    { title: 'Customer', dataIndex: 'customerName', key: 'customerName', width: 130, render: (v) => v || '—' },
    {
      title: 'Template',
      dataIndex: 'templateName',
      key: 'templateName',
      width: 140,
      // Missed-call event in plain-text mode logs the text instead of a template
      render: (v, r) =>
        v || (r.requestPayload?.type === 'text' ? `Text: ${r.requestPayload?.text?.body || ''}` : '—'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s, r) => (
        <>
          <Tag color={LOG_STATUS_COLORS[s] || 'default'}>{s}</Tag>
          {r.attempts > 1 && <div className="mgmt-muted" style={{ fontSize: 11 }}>{r.attempts} attempts</div>}
        </>
      ),
    },
    {
      title: 'Details',
      key: 'details',
      render: (_, r) =>
        r.skippedReason ||
        r.error ||
        [r.note, r.messageId ? `Message id ${r.messageId}` : ''].filter(Boolean).join(' · ') ||
        '—',
    },
  ]

  const triggerSummary = (
    isMissed
      ? Object.entries(MISSED_TRIGGER_LABELS).map(([k, label]) => mapping?.missedTriggers?.[k] !== false && label)
      : [mapping?.triggerAiCallback !== false && 'AI call-back answered', mapping?.triggerAiInbound && 'AI inbound answered']
  )
    .filter(Boolean)
    .join(', ')
  const sweep = event.sweep || null

  return (
    <Card className="mgmt-settings-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div
          style={{ flex: 1, minWidth: 240, cursor: mapping ? 'pointer' : 'default' }}
          onClick={mapping ? toggleOpen : undefined}
        >
          <h4 className="mgmt-card-title-text" style={{ margin: 0 }}>
            {mapping && (
              <RightOutlined
                rotate={open ? 90 : 0}
                style={{ fontSize: 12, marginRight: 8, transition: 'transform 0.2s' }}
              />
            )}
            {event.name}{' '}
            <Tag color={!mapping ? 'blue' : mapping.isActive ? 'green' : 'default'} style={{ marginLeft: 6 }}>
              {!mapping ? 'Not saved yet' : mapping.isActive ? 'Active' : 'Inactive'}
            </Tag>
            {!open && dirty && <Tag color="gold">Unsaved changes</Tag>}
          </h4>
          {open ? (
            <p className="mgmt-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{event.description}</p>
          ) : (
            <p className="mgmt-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              {isMissed && mapping.messageType === 'text' ? (
                <>
                  Message: <strong>“{mapping.textMessage || DEFAULT_MISSED_TEXT}”</strong>
                  {mapping.templateName ? ` (fallback template ${mapping.templateName})` : ''}
                </>
              ) : (
                <>
                  Template: <strong>{mapping.templateName || 'not selected'}</strong>
                  {mapping.templateName && mapping.templateLanguage ? ` (${mapping.templateLanguage})` : ''}
                </>
              )}
              {' · '}Sends when: {triggerSummary || 'no trigger'}
              {' · '}Updated {formatDateTime(mapping.updatedAt)}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mapping && (
            <Button icon={open ? <UpOutlined /> : <DownOutlined />} onClick={toggleOpen} aria-expanded={open}>
              {open ? 'Collapse' : 'Expand'}
            </Button>
          )}
          {canEdit && onRemove && (
            mapping ? (
              <Popconfirm
                title="Remove this event?"
                description="Its mapping is deleted and no more WhatsApp messages are sent for it. Sent-message history is kept."
                onConfirm={onRemove}
                okText="Remove"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />} loading={removing}>Remove</Button>
              </Popconfirm>
            ) : (
              <Button icon={<CloseOutlined />} onClick={onRemove}>Cancel</Button>
            )
          )}
        </div>
      </div>

      <div style={{ display: open ? 'block' : 'none' }}>
      <Divider style={{ margin: '16px 0' }} />

      <Form form={form} layout="vertical" onValuesChange={markDirty} disabled={!canEdit}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="isActive" label="Send automatically" valuePropName="checked">
              <Switch checkedChildren="On" unCheckedChildren="Off" />
            </Form.Item>
          </Col>
          {isMissed && (
            <Col xs={24} md={12}>
              <Form.Item name="messageType" label="Message to send">
                <Radio.Group>
                  <Radio value="text">Plain text (e.g. “Hi”)</Radio>
                  <Radio value="template">WhatsApp template</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          )}
          {isMissed && (
            <Col xs={24} md={12}>
              {/* hidden, not unmounted, in template mode — so the text is kept on Save */}
              <Form.Item
                name="textMessage"
                label="Message text"
                hidden={!isTextMode}
                rules={[{ max: 4096, message: 'At most 4096 characters' }]}
              >
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder={DEFAULT_MISSED_TEXT} />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} md={12}>
            <Form.Item
              label={isTextMode ? 'Fallback template (recommended)' : 'WhatsApp template'}
              required={!isTextMode}
              help={
                isTextMode
                  ? 'Sent instead of the text when WhatsApp refuses it because the customer has not messaged you in the last 24 hours'
                  : undefined
              }
            >
              <Select
                showSearch
                allowClear
                value={templateId || undefined}
                placeholder={templates.length ? 'Select an approved template' : 'Sync templates first (Sync Templates tab)'}
                options={templateOptions}
                optionFilterProp="label"
                onChange={handleTemplateChange}
              />
            </Form.Item>
          </Col>
        </Row>

        {isTextMode && (
          <Alert
            type={templateId ? 'info' : 'warning'}
            showIcon
            style={{ marginBottom: 16 }}
            message={
              templateId
                ? 'The text is tried first. Customers who have not messaged your WhatsApp number in the last 24 hours get the fallback template instead.'
                : 'WhatsApp only delivers plain text to customers who messaged your business number in the last 24 hours — for everyone else AskEVA refuses it. Select a fallback template so every missed caller gets a message.'
            }
          />
        )}

        {isTextMode && (
          <div style={{ marginBottom: 16, maxWidth: 420 }}>
            <div className="mgmt-muted" style={{ fontSize: 12, marginBottom: 4 }}>Message preview</div>
            <div style={{ padding: 12, borderRadius: 8, background: '#dcf8c6', color: '#111', whiteSpace: 'pre-wrap', fontSize: 13 }}>
              {String(textMessage || '').trim() || DEFAULT_MISSED_TEXT}
            </div>
          </div>
        )}

        {template && (
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <div style={{ marginBottom: 16 }}>
                <div className="mgmt-muted" style={{ fontSize: 12, marginBottom: 4 }}>Template</div>
                <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <TemplateText template={template} />
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ marginBottom: 16 }}>
                <div className="mgmt-muted" style={{ fontSize: 12, marginBottom: 4 }}>Preview with sample values</div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: '#dcf8c6',
                    color: '#111',
                    whiteSpace: 'pre-wrap',
                    fontSize: 13,
                  }}
                >
                  {template.headerFormat === 'TEXT' && template.headerText && (
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{fill(template.headerText, 'header')}</div>
                  )}
                  {MEDIA_HEADERS.includes(template.headerFormat) && (
                    <div style={{ marginBottom: 4, fontStyle: 'italic' }}>[{template.headerFormat.toLowerCase()}]</div>
                  )}
                  <div>{fill(template.bodyText, 'body')}</div>
                  {template.footerText && <div style={{ marginTop: 4, fontSize: 12, color: '#555' }}>{template.footerText}</div>}
                  {(template.buttons || []).map((b, i) => (
                    <div key={i} style={{ marginTop: 6, textAlign: 'center', color: '#0a7cff', fontSize: 12 }}>
                      {b.text}
                      {b.url && String(b.url).includes('{{') ? ` → ${fill(b.url, 'button', i)}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            </Col>
          </Row>
        )}

        {(template || rows.length > 0) && (
          rows.length ? (
            <>
              <div className="mgmt-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Map each template variable to a value. If a variable ends up empty (e.g. the customer gave no
                appointment time) and it has no fallback, the message is <strong>not sent</strong> for that call.
              </div>
              <Table
                rowKey={(v) => variableTag(v)}
                size="small"
                columns={variableColumns}
                dataSource={rows}
                pagination={false}
                scroll={{ x: 600 }}
                style={{ marginBottom: 16 }}
              />
            </>
          ) : (
            <Alert type="info" showIcon style={{ marginBottom: 16 }} message="This template has no variables — it is sent as is." />
          )
        )}

        {needsMedia && (
          <Row gutter={16}>
            <Col xs={24} md={headerFormat === 'DOCUMENT' ? 16 : 24}>
              <Form.Item
                name="headerMediaUrl"
                label={`Header ${headerFormat.toLowerCase()} URL`}
                rules={[{ type: 'url', message: 'Enter a valid URL' }]}
                help="Public link to the file sent as the template header"
              >
                <Input placeholder="https://…" />
              </Form.Item>
            </Col>
            {headerFormat === 'DOCUMENT' && (
              <Col xs={24} md={8}>
                <Form.Item name="headerMediaFilename" label="Document file name">
                  <Input placeholder="document.pdf" />
                </Form.Item>
              </Col>
            )}
          </Row>
        )}

        {isMissed ? (
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="Send when">
                {Object.entries(MISSED_TRIGGER_LABELS).map(([k, label]) => (
                  <div key={k}>
                    <Form.Item name={['missedTriggers', k]} valuePropName="checked" noStyle>
                      <Checkbox>{label}</Checkbox>
                    </Form.Item>
                  </div>
                ))}
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Once per customer every"
                help="A customer who misses several calls gets only one message in this time (0 = every missed call)"
              >
                <Form.Item name="cooldownHours" noStyle>
                  <InputNumber min={0} max={720} style={{ width: 120 }} />
                </Form.Item>
                <span style={{ marginLeft: 8 }}>hours</span>
              </Form.Item>
              <Form.Item name="skipIfAnswered" valuePropName="checked" style={{ marginTop: 8 }}>
                <Checkbox>Don’t send if the customer answered another call (e.g. the AI call-back) around or after the missed one</Checkbox>
              </Form.Item>
            </Col>
          </Row>
        ) : (
        <>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="paymentLink"
              label="Payment Link"
              rules={[{ type: 'url', message: 'Enter a valid URL (https://…)' }]}
              help="Value of the “Payment Link” variable"
            >
              <Input placeholder="https://pay.example.com/espa" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="sendTo" label="Send to">
              <Radio.Group>
                <Radio value="call_number">Customer mobile number (the number on the AI call)</Radio>
                <Radio value="collected_whatsapp">WhatsApp number collected by AI (else mobile number)</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Send when">
              <Form.Item name="triggerAiCallback" valuePropName="checked" noStyle>
                <Checkbox>AI call-back (missed call) is answered</Checkbox>
              </Form.Item>
              <br />
              <Form.Item name="triggerAiInbound" valuePropName="checked" noStyle>
                <Checkbox>AI inbound call is answered</Checkbox>
              </Form.Item>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="resolveRelativeDates"
              label="Convert “today / tomorrow” to the real date"
              valuePropName="checked"
              help="“tomorrow 10 a.m.” said on the call → “Wed, 30 Sep 2026 10 a.m.”"
            >
              <Switch checkedChildren="Yes" unCheckedChildren="No" />
            </Form.Item>
          </Col>
        </Row>
        </>
        )}

        {canEdit ? (
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={isSaving}
            onClick={handleSave}
            style={{ width: isMobile ? '100%' : 'auto', marginTop: 8 }}
          >
            Save Mapping
          </Button>
        ) : (
          <p className="mgmt-body-text">Only Super Admin can configure event mappings.</p>
        )}
        {canEdit && (dirty || !mapping) && (
          <span style={{ marginLeft: 12, fontSize: 12, color: '#d48806' }}>
            {mapping ? 'Unsaved changes' : 'Not saved yet — click Save Mapping to keep this event'}
          </span>
        )}
        {canEdit && !dirty && mapping && (
          <span className="mgmt-muted" style={{ marginLeft: 12, fontSize: 12 }}>
            Saved · {formatDateTime(mapping.updatedAt)}
          </span>
        )}
        {saveNotice && (
          <Alert
            style={{ marginTop: 12 }}
            type={saveNotice.type}
            showIcon
            closable
            onClose={() => setSaveNotice(null)}
            message={saveNotice.title}
            description={
              saveNotice.items?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {saveNotice.items.map((p) => <li key={p}>{p}</li>)}
                </ul>
              ) : null
            }
          />
        )}
      </Form>

      <Divider orientation="left" style={{ fontSize: 14 }}>Send a test message</Divider>
      <Row gutter={[12, 8]}>
        <Col xs={24} md={8}>
          <Input
            prefix={<span className="mgmt-muted">WhatsApp to</span>}
            placeholder="9876543210"
            value={sample.to}
            onChange={(e) => setSample((s) => ({ ...s, to: e.target.value }))}
          />
        </Col>
        {(isMissed ? (templateId ? MISSED_VALUE_KEYS : []) : ['name', 'mobile', 'branch', 'therapy', 'appointment']).map((k) => (
          <Col xs={24} md={k === 'appointment' ? 8 : 4} key={k}>
            <Input
              placeholder={VALUE_LABELS[k]}
              title={VALUE_LABELS[k]}
              value={sample[k]}
              onChange={(e) => setSample((s) => ({ ...s, [k]: e.target.value }))}
            />
          </Col>
        ))}
      </Row>
      <p className="mgmt-muted" style={{ fontSize: 12, margin: '6px 0 8px' }}>
        {isMissed
          ? isTextMode
            ? 'Sends the text above (saved or not); if WhatsApp refuses it, the fallback template with these sample values.'
            : 'Uses the mapping above (saved or not) with these sample values.'
          : 'Uses the mapping above (saved or not) with these sample values. Payment Link comes from the field above.'}
      </p>
      <Button
        icon={<SendOutlined />}
        loading={isTesting}
        onClick={handleTest}
        disabled={!canEdit || (!templateId && !canSendWithoutTemplate)}
      >
        Send Test
      </Button>
      {testResult && (
        <Alert
          style={{ marginTop: 12 }}
          type={testResult.success ? 'success' : 'error'}
          showIcon
          message={testResult.message}
          description={
            testResult.payload ? (
              <Collapse
                ghost
                size="small"
                items={[{ key: 'p', label: 'Request sent to AskEVA', children: <JsonBlock value={testResult.payload} /> }]}
              />
            ) : null
          }
        />
      )}

      {isMissed && (
        <>
          <Divider orientation="left" style={{ fontSize: 14 }}>Automatic check</Divider>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 260, fontSize: 13 }}>
              {sweep?.enabled ? (
                <>
                  Missed calls are checked right after the call and again every{' '}
                  <strong>{Math.round((sweep.everyMs || 300000) / 60000)} min</strong> (calls from the last{' '}
                  {sweep.lookbackHours || 6} h, missed after the event was switched on).
                </>
              ) : (
                <>Missed calls are checked right after the call. The periodic check is switched off on the server.</>
              )}
              <div className="mgmt-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {sweep?.last
                  ? `Last check ${formatDateTime(sweep.last.finishedAt || sweep.last.at)}: ${
                      sweep.last.note
                        ? sweep.last.note
                        : `${sweep.last.checked} missed call(s) — sent ${sweep.last.sent}, not sent ${sweep.last.skipped}, failed ${sweep.last.failed}`
                    }`
                  : 'No check has run since the server started.'}
              </div>
            </div>
            {canEdit && (
              <Button icon={<ReloadOutlined />} loading={isRunningCheck} onClick={handleRunCheck} disabled={dirty}>
                Check missed calls now
              </Button>
            )}
          </div>
          {dirty && <div className="mgmt-muted" style={{ fontSize: 12, marginTop: 4 }}>Save the mapping first to run the check.</div>}
        </>
      )}

      <Divider orientation="left" style={{ fontSize: 14 }}>
        {isMissed ? 'Check against a recent missed call' : 'Check against a real answered AI call'}
      </Divider>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Select
          allowClear
          style={{ flex: 1, minWidth: 260 }}
          placeholder={isMissed ? 'Latest missed call' : 'Latest answered AI call'}
          value={selectedCall}
          onChange={(v) => {
            setSelectedCall(v)
            setPreview(null)
          }}
          loading={isFetchingRecent}
          options={recentCalls.map((c) => ({
            value: callKey(c),
            label: `${c.name || 'Unknown'} · ${c.phone || '—'} · ${formatDateTime(c.at)} · ${SOURCE_LABELS[c.source] || c.source}${
              c.whatsappStatus ? ` · WhatsApp ${c.whatsappStatus}` : ''
            }`,
          }))}
        />
        <Button icon={<ReloadOutlined />} onClick={() => refetchRecent()} />
        <Button
          icon={<EyeOutlined />}
          loading={isPreviewing}
          onClick={handlePreview}
          disabled={!templateId && !canSendWithoutTemplate}
        >
          Preview
        </Button>
      </div>
      <p className="mgmt-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
        Preview shows exactly what would be sent for that call — nothing is sent.
      </p>

      {preview && (
        <div style={{ marginTop: 12 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <div className="mgmt-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {isMissed ? 'Values resolved from the missed call' : 'Values resolved from the AI call'}
              </div>
              <ValuesTable values={preview.values} keys={isMissed ? MISSED_VALUE_KEYS : undefined} />
              <p style={{ marginTop: 8 }}>
                <strong>Send to:</strong> {preview.to || <span className="mgmt-muted">no valid number</span>}
              </p>
              {isMissed && preview.mode === 'text' && (
                <p>
                  <strong>Text:</strong> {preview.text}
                </p>
              )}
              {preview.whatsappConfirmation?.status && (
                <p>
                  <strong>Already on this call:</strong>{' '}
                  <Tag color={LOG_STATUS_COLORS[preview.whatsappConfirmation.status]}>{preview.whatsappConfirmation.status}</Tag>
                  {preview.whatsappConfirmation.reason && (
                    <span className="mgmt-muted" style={{ fontSize: 12 }}>{preview.whatsappConfirmation.reason}</span>
                  )}
                </p>
              )}
            </Col>
            <Col xs={24} md={12}>
              {preview.problems?.length ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Would NOT be sent"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {preview.problems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  }
                />
              ) : (
                <Alert type="success" showIcon message="Ready — this message would be sent" />
              )}
              {preview.notes?.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 8 }}
                  message={
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {preview.notes.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  }
                />
              )}
              <Collapse
                ghost
                size="small"
                style={{ marginTop: 8 }}
                items={[
                  { key: 'p', label: 'Request to AskEVA', children: <JsonBlock value={preview.payload} /> },
                  ...(preview.fallbackPayload
                    ? [{ key: 'f', label: 'Fallback template request', children: <JsonBlock value={preview.fallbackPayload} /> }]
                    : []),
                ]}
              />
              {canEdit && (
                <Popconfirm
                  title="Send this WhatsApp message now?"
                  description={`It goes to the real customer ${preview.to}. Uses the SAVED mapping; never sends twice for the same call.`}
                  onConfirm={handleSendForCall}
                  okText="Send"
                  disabled={dirty || !!preview.problems?.length || preview.whatsappConfirmation?.status === 'sent'}
                >
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={isSendingForCall}
                    disabled={dirty || !!preview.problems?.length || preview.whatsappConfirmation?.status === 'sent'}
                    style={{ marginTop: 8 }}
                  >
                    Send now for this call
                  </Button>
                </Popconfirm>
              )}
              {dirty && <div className="mgmt-muted" style={{ fontSize: 12, marginTop: 4 }}>Save the mapping first to send.</div>}
            </Col>
          </Row>
        </div>
      )}

      <Divider orientation="left" style={{ fontSize: 14 }}>Recent messages</Divider>
      <div style={{ textAlign: 'right', marginBottom: 8 }}>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchLogs()}>Refresh</Button>
      </div>
      <Table
        rowKey="_id"
        size="small"
        loading={isFetchingLogs}
        columns={logColumns}
        dataSource={logsData?.logs || []}
        scroll={{ x: 900 }}
        pagination={{
          current: logPage,
          pageSize: 10,
          total: logsData?.pagination?.total || 0,
          onChange: setLogPage,
          showSizeChanger: false,
        }}
        expandable={{
          expandedRowRender: (r) => (
            <Row gutter={16}>
              <Col xs={24} md={10}>
                <ValuesTable values={r.values} keys={isMissed ? MISSED_VALUE_KEYS : undefined} />
              </Col>
              <Col xs={24} md={14}>
                <JsonBlock value={r.requestPayload} />
              </Col>
            </Row>
          ),
        }}
      />
      </div>
    </Card>
  )
}

/**
 * Event Mapping tab: starts empty. "Add Event" → pick an event name → the event is SAVED right
 * away (switched off, no template yet) and its card opens; "Save Mapping" stores the rest. Only
 * events stored in the database are listed, so what you see is what survives a refresh.
 */
const WhatsAppEventMapping = () => {
  const { isMobile } = useResponsive()
  const { data, isLoading, error } = useGetWhatsAppEventsQuery()
  const { data: templatesData } = useGetWhatsAppTemplatesQuery()
  const [saveMapping] = useSaveWhatsAppEventMappingMutation()
  const [deleteMapping, { isLoading: isRemoving }] = useDeleteWhatsAppEventMappingMutation()
  const [addOpen, setAddOpen] = useState(false)
  const [pickedKey, setPickedKey] = useState(undefined)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [justAddedKeys, setJustAddedKeys] = useState([])

  const events = data?.events || []
  const shownEvents = events.filter((e) => e.mapping)
  const availableEvents = events.filter((e) => !e.mapping)
  const picked = events.find((e) => e.key === pickedKey)

  const closeAdd = () => {
    setAddOpen(false)
    setPickedKey(undefined)
    setAddError('')
  }

  const handleAdd = async () => {
    if (!pickedKey) return
    setAdding(true)
    setAddError('')
    try {
      await withRetry(() => saveMapping({ eventKey: pickedKey, isActive: false }).unwrap())
      setJustAddedKeys((keys) => [...keys.filter((k) => k !== pickedKey), pickedKey])
      message.success(`"${picked?.name || 'Event'}" added — choose its template, then Save Mapping`)
      closeAdd()
    } catch (err) {
      setAddError(
        isTransientError(err)
          ? 'Could not reach the server — the event was NOT added. Check that the backend is running and try again.'
          : `Not added — ${err?.data?.message || 'the server refused the request'}`
      )
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (event) => {
    try {
      await withRetry(() => deleteMapping(event.key).unwrap())
      setJustAddedKeys((keys) => keys.filter((k) => k !== event.key))
      message.success(`"${event.name}" removed`)
    } catch (err) {
      message.error(
        isTransientError(err) ? 'Could not reach the server — the event was NOT removed' : err?.data?.message || 'Failed to remove event'
      )
    }
  }

  if (isLoading) {
    return (
      <Card className="mgmt-settings-card">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <p className="mgmt-loading-text">Loading events...</p>
        </div>
      </Card>
    )
  }
  if (error) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Could not load event mappings"
        description={error?.data?.message || 'Please try again.'}
      />
    )
  }
  return (
    <>
      <Card className="mgmt-settings-card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'stretch' : 'center',
            gap: 12,
          }}
        >
          <div>
            <h4 className="mgmt-card-title-text" style={{ margin: 0 }}>Event Mapping</h4>
            <span className="mgmt-muted" style={{ fontSize: 13 }}>
              Send a WhatsApp template automatically when an event happens.
            </span>
          </div>
          {isSuperAdmin() && (
            <Tooltip title={availableEvents.length ? '' : 'All events are already added'}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)} disabled={!availableEvents.length}>
                Add Event
              </Button>
            </Tooltip>
          )}
        </div>
        {!shownEvents.length && (
          <Empty
            style={{ marginTop: 24 }}
            description="No events added yet. Click “Add Event” and choose an event to map a WhatsApp template to it."
          />
        )}
      </Card>

      {shownEvents.map((event) => (
        <EventMappingCard
          key={event.key}
          event={event}
          templates={templatesData?.templates || []}
          onRemove={() => handleRemove(event)}
          removing={isRemoving}
          defaultOpen={justAddedKeys.includes(event.key)}
        />
      ))}

      <Modal
        title="Add Event"
        open={addOpen}
        onOk={handleAdd}
        onCancel={closeAdd}
        okText="Add"
        okButtonProps={{ disabled: !pickedKey, loading: adding }}
      >
        <Form layout="vertical">
          <Form.Item label="Event name" required>
            <Select
              placeholder="Select an event"
              value={pickedKey}
              onChange={setPickedKey}
              options={availableEvents.map((e) => ({ value: e.key, label: e.name }))}
            />
          </Form.Item>
        </Form>
        {picked && <Alert type="info" showIcon message={picked.name} description={picked.description} />}
        {addError && <Alert style={{ marginTop: 12 }} type="error" showIcon message={addError} />}
      </Modal>
    </>
  )
}

export default WhatsAppEventMapping
