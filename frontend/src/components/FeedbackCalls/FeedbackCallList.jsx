import React from 'react'
import { Button, Empty, Rate, Spin, Tag, Tooltip } from 'antd'
import { PhoneOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import './FeedbackCallList.css'

/**
 * ZenXAI feedback calls and the customer's responses — shared by Appointment Bookings
 * (Feedbacks list tab + detail Feedback tab) and Customer Management (details + timeline).
 * Calls come from GET /api/leads/:id/feedback-calls, POST /api/leads/feedback-calls or
 * GET /api/customers/:id/feedback-calls (backend zenxaiFeedbackCallController.js).
 */

export const FEEDBACK_STATUS = {
  requested: { label: 'Requested', color: 'default' },
  queued: { label: 'Queued', color: 'default' },
  dialing: { label: 'Calling', color: 'processing' },
  in_progress: { label: 'In progress', color: 'processing' },
  retry_scheduled: { label: 'Retry scheduled', color: 'gold' },
  completed: { label: 'Answered', color: 'green' },
  no_answer: { label: 'Not answered', color: 'orange' },
  busy: { label: 'Busy / declined', color: 'orange' },
  failed: { label: 'Failed', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'default' },
  skipped: { label: 'Not sent', color: 'default' },
}

const PENDING = new Set(['requested', 'queued', 'dialing', 'in_progress', 'retry_scheduled'])
export const isFeedbackPending = (call) => PENDING.has(call?.status)

/** RTK Query pollingInterval: every 10 s while a call on screen is still running, else off. */
export const feedbackPollInterval = (calls) => ((calls || []).some(isFeedbackPending) ? 10000 : 0)

export function FeedbackStatusTag({ status }) {
  const s = FEEDBACK_STATUS[status] || { label: status || 'Sent', color: 'default' }
  return <Tag color={s.color}>{s.label}</Tag>
}

const RATING_RE = /rating|rate|score|stars?/i
/** { n, max } when a response is a numeric rating (out of 5 or 10), else null. */
const ratingOf = (r) => {
  if (!RATING_RE.test(`${r.key} ${r.label}`)) return null
  const n = Number(String(r.value).trim())
  if (!Number.isFinite(n) || n < 0) return null
  if (n <= 5) return { n, max: 5 }
  if (n <= 10) return { n, max: 10 }
  return null
}

/** Ratings first, everything else after, each group in ZenXAI's own order. */
const sortResponses = (responses) =>
  [...(responses || [])].sort((a, b) => (ratingOf(b) ? 1 : 0) - (ratingOf(a) ? 1 : 0))

const formatDuration = (sec) => {
  const s = Math.round(Number(sec) || 0)
  if (s <= 0) return ''
  const m = Math.floor(s / 60)
  return m ? `${m}m ${s % 60}s` : `${s}s`
}

const originLabel = (call) => {
  if (call.kind === 'auto') return 'Automatic, after AI call-back'
  return call.origin === 'customer' ? 'Sent from Customer Management' : 'Sent from Appointment Bookings'
}

function ResponseValue({ response }) {
  const rating = ratingOf(response)
  if (!rating) return <span className="fbc-answer-text">{response.value}</span>
  if (rating.max === 10) return <span className="fbc-answer-score">{response.value}/10</span>
  return (
    <span className="fbc-answer-rating">
      <Rate disabled allowHalf value={rating.n} />
      <span className="fbc-answer-score">{response.value}/5</span>
    </span>
  )
}

export function FeedbackCallCard({ call }) {
  const when = call.endedAt || call.requestedAt || call.sortAt
  const responses = sortResponses(call.responses)
  const pending = isFeedbackPending(call)
  const duration = formatDuration(call.durationSec)
  return (
    <div className="fbc-card">
      <div className="fbc-card-head">
        <span className="fbc-card-title">
          <PhoneOutlined /> AI feedback call
        </span>
        <FeedbackStatusTag status={call.status} />
        {when && <span>{dayjs(when).format('DD MMM YYYY, hh:mm A')}</span>}
        {duration && <span>· {duration}</span>}
        {call.phone && <span>· {call.phone}</span>}
      </div>
      <div className="fbc-card-sub">
        {originLabel(call)}
        {call.requestedByName ? ` by ${call.requestedByName}` : ''}
        {call.attempts > 1 ? ` · ${call.attempts} attempts` : ''}
      </div>

      {pending && (
        <div className="fbc-pending">
          <Spin size="small" /> Call in progress — responses will appear here automatically.
        </div>
      )}
      {!pending && call.failureReason && (
        <div className="fbc-line">
          <strong>Reason:</strong> {call.failureReason}
        </div>
      )}

      {responses.length > 0 ? (
        <div className="fbc-answers">
          <div className="fbc-answers-title">Customer responses</div>
          <dl className="fbc-answers-grid">
            {responses.map((r) => (
              <div key={r.key} className="fbc-answer">
                <dt>{r.label}</dt>
                <dd>
                  <ResponseValue response={r} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        call.status === 'completed' && (
          <div className="fbc-line fbc-muted">
            Call answered — no responses were captured
            {call.questionsAsked ? ` (${call.questionsAsked} questions asked)` : ''}.
          </div>
        )
      )}

      {call.summary && (
        <div className="fbc-line">
          <strong>Summary:</strong> {call.summary}
        </div>
      )}
      {call.recordingUrl && (
        <audio key={call.recordingUrl} className="fbc-audio" controls preload="none">
          <source src={call.recordingUrl} />
        </audio>
      )}
    </div>
  )
}

export default function FeedbackCallList({ calls, loading, fetching, onRefresh, emptyText, title = 'AI feedback calls' }) {
  if (loading) {
    return (
      <div className="fbc-loading">
        <Spin />
      </div>
    )
  }
  const list = calls || []
  return (
    <div className="fbc-list">
      <div className="fbc-list-head">
        <span className="fbc-list-title">
          {title} ({list.length})
        </span>
        {onRefresh && (
          <Button size="small" icon={<SyncOutlined />} loading={fetching} onClick={onRefresh}>
            Refresh
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText || 'No feedback calls yet'} />
      ) : (
        list.map((call) => <FeedbackCallCard key={call.key} call={call} />)
      )}
    </div>
  )
}

/** Latest call's responses squeezed into one table cell (full list in the tooltip). */
export function FeedbackResponsesInline({ call, max = 3 }) {
  if (!call) return <span className="fbc-muted">—</span>
  const responses = sortResponses(call.responses)
  if (!responses.length) {
    const text = isFeedbackPending(call)
      ? 'Waiting for responses…'
      : call.status === 'completed'
        ? 'No responses captured'
        : call.failureReason || '—'
    return <span className="fbc-muted">{text}</span>
  }
  const short = (r) => {
    const rating = ratingOf(r)
    if (!rating) return r.value
    return rating.max === 5 ? `${r.value}★` : `${r.value}/10`
  }
  return (
    <Tooltip
      title={
        <div>
          {responses.map((r) => (
            <div key={r.key}>
              {r.label}: {r.value}
            </div>
          ))}
        </div>
      }
    >
      <span className="fbc-inline">
        {responses.slice(0, max).map((r) => (
          <span key={r.key} className="fbc-inline-item">
            <span className="fbc-inline-label">{r.label}:</span> {short(r)}
          </span>
        ))}
        {responses.length > max && <span className="fbc-inline-more">+{responses.length - max} more</span>}
      </span>
    </Tooltip>
  )
}
