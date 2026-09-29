import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Spin, Empty, App, Popover, Input } from 'antd'
import {
  InfoCircleOutlined,
  ReloadOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PictureOutlined,
  ThunderboltOutlined,
  SendOutlined,
  FilePdfOutlined,
  DeleteOutlined,
  MessageOutlined,
  SearchOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import {
  useGetChatMessagesQuery,
  useSendChatMessageMutation,
} from '../../store/api/chatApi'
import { useGetQuickRepliesQuery, composeQuickReplyText } from '../../store/api/quickReplyApi'
import { isSuperAdmin } from '../../utils/permissions'
import './LiveChatPanel.css'

function formatMsgTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function detectAttachType(file) {
  if (!file) return 'text'
  if (file.type?.startsWith('image/')) return 'image'
  if (file.type?.startsWith('video/')) return 'video'
  return 'document'
}

/**
 * Reusable WhatsApp-style live chat panel. Renders a message thread + composer
 * for a given customer/lead phone number. Used by Customer Details, Lead
 * Follow-Up, and Appointment Details so all three share one implementation.
 *
 * Sending requires a `customerId`. If only `leadId` is supplied (no linked
 * customer yet), the backend resolves/creates the customer record from the
 * lead's phone number on send (see chatController.sendChatMessage).
 */
const LiveChatPanel = ({ name, phone, customerId, leadId, active = true }) => {
  const { message: messageApi } = App.useApp()
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickSearch, setQuickSearch] = useState('')
  const [quickSendingId, setQuickSendingId] = useState(null)
  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const displayName = name || 'Contact'
  const canIdentifyContact = Boolean(customerId || phone || leadId)

  const {
    data: chatData,
    isLoading: chatLoading,
    isFetching: chatFetching,
    refetch: refetchChat,
  } = useGetChatMessagesQuery(
    {
      customerId,
      phone,
      limit: 200,
    },
    {
      skip: !active || !canIdentifyContact,
      pollingInterval: active ? 5000 : 0,
      refetchOnMountOrArgChange: true,
    }
  )

  const [sendChatMessage, { isLoading: sending }] = useSendChatMessageMutation()

  // Quick replies (Settings → WhatsApp API → Quick Replies) — only the active ones come back
  const {
    data: quickData,
    isLoading: quickLoading,
    isFetching: quickFetching,
    refetch: refetchQuickReplies,
  } = useGetQuickRepliesQuery(undefined, { skip: !active })

  const quickReplies = useMemo(() => {
    const list = quickData?.quickReplies || []
    const q = quickSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) =>
      [r.title, r.message, r.link].some((v) => String(v || '').toLowerCase().includes(q))
    )
  }, [quickData?.quickReplies, quickSearch])

  const dbMessages = useMemo(() => {
    const list = chatData?.messages || []
    return list.map((m) => ({
      id: m._id,
      direction: m.direction,
      type: m.type,
      text: m.body || '',
      time: formatMsgTime(m.timestamp),
      sender: m.contactName || displayName,
      status: m.status,
      mediaUrl: m.mediaUrl || '',
      mediaFilename: m.mediaFilename || '',
      mediaMimeType: m.mediaMimeType || '',
    }))
  }, [chatData?.messages, displayName])

  const hasDbMessages = dbMessages.length > 0

  useEffect(() => {
    if (!attachment) {
      setPreviewUrl('')
      return undefined
    }
    if (attachment.type?.startsWith('image/')) {
      const url = URL.createObjectURL(attachment)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl('')
    return undefined
  }, [attachment])

  useEffect(() => {
    if (active && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [active, dbMessages.length, chatFetching])

  const clearAttachment = () => setAttachment(null)

  const handlePickImage = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      messageApi.warning('Please select an image file')
      return
    }
    setAttachment(file)
  }

  const handlePickFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ok =
      file.type === 'application/pdf' ||
      file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      file.type.includes('word') ||
      file.name.toLowerCase().endsWith('.pdf')
    if (!ok) {
      messageApi.warning('Please select a PDF, image, or document')
      return
    }
    setAttachment(file)
  }

  const showSendError = (err) => {
    const msg = err?.data?.message || err?.message || 'Failed to send message'
    const code = err?.data?.code
    if (code === 'SESSION_NOT_OPENED') {
      messageApi.warning({
        content: msg,
        duration: 8,
      })
    } else {
      messageApi.error(msg)
    }
  }

  const handleQuickOpenChange = (open) => {
    setQuickOpen(open)
    if (open) {
      setQuickSearch('')
      // Pick up replies added/edited in Settings since this chat was opened
      if (active) refetchQuickReplies()
    }
  }

  // Put the reply in the composer so it can be edited before sending
  const handleInsertQuickReply = (reply) => {
    const text = composeQuickReplyText(reply)
    if (!text) return
    setDraft((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n${text}` : text))
    setQuickOpen(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // Send the reply straight to the customer (draft / attachment in the composer are left alone)
  const handleSendQuickReply = async (reply) => {
    if (!customerId && !leadId) return
    const text = composeQuickReplyText(reply)
    if (!text) return
    setQuickSendingId(reply._id)
    try {
      await sendChatMessage({
        customerId: customerId || undefined,
        leadId: !customerId ? leadId : undefined,
        type: 'text',
        text,
      }).unwrap()
      setQuickOpen(false)
      messageApi.success('Quick reply sent')
      refetchChat()
    } catch (err) {
      showSendError(err)
      // Still refresh — failed outbound may be stored with status=failed
      refetchChat()
    } finally {
      setQuickSendingId(null)
    }
  }

  const handleSend = async () => {
    if (!customerId && !leadId) return
    const text = draft.trim()
    if (!text && !attachment) {
      messageApi.warning('Type a message or attach a file')
      return
    }

    const type = attachment ? detectAttachType(attachment) : 'text'

    try {
      await sendChatMessage({
        customerId: customerId || undefined,
        leadId: !customerId ? leadId : undefined,
        type,
        text,
        file: attachment || undefined,
        filename: attachment?.name,
      }).unwrap()
      setDraft('')
      clearAttachment()
      messageApi.success(type === 'text' ? 'Message sent' : 'Attachment sent')
      refetchChat()
    } catch (err) {
      showSendError(err)
      // Still refresh — failed outbound may be stored with status=failed
      refetchChat()
    }
  }

  const onComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sending) handleSend()
    }
  }

  const renderDbMessage = (msg) => {
    const isOut = msg.direction === 'outbound'
    const bubbleClass = isOut ? 'cd-msg cd-msg--package' : 'cd-msg cd-msg--incoming'

    return (
      <div key={msg.id} className={`${bubbleClass}${msg.status === 'failed' ? ' is-failed' : ''}`}>
        {!isOut && <div className="cd-msg__sender">{msg.sender}</div>}
        {msg.type === 'image' && msg.mediaUrl ? (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="cd-msg__media-link">
            <img src={msg.mediaUrl} alt={msg.text || 'Image'} className="cd-msg__media-img" />
          </a>
        ) : null}
        {(msg.type === 'document' || msg.type === 'video') && msg.mediaUrl ? (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="cd-msg__file-link">
            <FilePdfOutlined /> {msg.mediaFilename || msg.text || 'Open file'}
          </a>
        ) : null}
        {msg.text ? <p className="cd-msg__text">{msg.text}</p> : null}
        <div className={`cd-msg__meta-row${isOut ? '' : ' cd-msg__meta-row--end'}`}>
          <span className={isOut ? 'cd-msg__time' : 'cd-msg__time cd-msg__time--end'}>
            {msg.time}
            {msg.status === 'failed' ? ' · failed' : ''}
          </span>
        </div>
      </div>
    )
  }

  const canSendToContact = Boolean(customerId || leadId)
  const hasAnyQuickReplies = (quickData?.quickReplies || []).length > 0

  const quickReplyContent = (
    <div className="cd-quick">
      <div className="cd-quick__header">
        <span className="cd-quick__title">
          <ThunderboltOutlined /> Quick Replies
        </span>
        {quickFetching && !quickLoading ? <Spin size="small" /> : null}
      </div>
      {hasAnyQuickReplies ? (
        <Input
          size="small"
          allowClear
          autoFocus
          prefix={<SearchOutlined />}
          placeholder="Search quick replies"
          value={quickSearch}
          onChange={(e) => setQuickSearch(e.target.value)}
          className="cd-quick__search"
        />
      ) : null}
      <div className="cd-quick__list">
        {quickLoading ? (
          <div className="cd-quick__empty">
            <Spin size="small" />
          </div>
        ) : !hasAnyQuickReplies ? (
          <div className="cd-quick__empty">
            <p className="cd-quick__empty-title">No quick replies yet</p>
            <p className="cd-quick__empty-sub">
              {isSuperAdmin()
                ? 'Add them in Settings → API & Integrations → WhatsApp API → Quick Replies.'
                : 'Ask your Super Admin to add quick replies in Settings.'}
            </p>
          </div>
        ) : !quickReplies.length ? (
          <div className="cd-quick__empty">
            <p className="cd-quick__empty-sub">No quick replies match “{quickSearch.trim()}”</p>
          </div>
        ) : (
          quickReplies.map((reply) => (
            <div key={reply._id} className="cd-quick__item">
              <button
                type="button"
                className="cd-quick__item-body"
                onClick={() => handleInsertQuickReply(reply)}
                title="Insert into message box"
              >
                <span className="cd-quick__item-title">{reply.title}</span>
                {reply.message ? <span className="cd-quick__item-text">{reply.message}</span> : null}
                {reply.link ? (
                  <span className="cd-quick__item-link">
                    <LinkOutlined /> {reply.link}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="cd-quick__item-send"
                aria-label={`Send quick reply ${reply.title}`}
                title={canSendToContact ? 'Send now' : 'No contact to send to'}
                onClick={() => handleSendQuickReply(reply)}
                disabled={sending || !canSendToContact}
              >
                {quickSendingId === reply._id ? <Spin size="small" /> : <SendOutlined />}
              </button>
            </div>
          ))
        )}
      </div>
      {hasAnyQuickReplies ? (
        <div className="cd-quick__hint">Click a reply to edit it before sending, or ➤ to send now.</div>
      ) : null}
    </div>
  )

  return (
    <section className="cd-main cd-main--standalone">
      <div className="cd-chat__header">
        <div>
          <div className="cd-chat__name">{displayName}</div>
          <div className="cd-chat__status">
            <span className="cd-chat__online-dot" />
            Online via WhatsApp • {phone || '—'}
          </div>
        </div>
        <div className="cd-chat__actions">
          <button type="button" aria-label="Info">
            <InfoCircleOutlined />
          </button>
          <button
            type="button"
            aria-label="Refresh"
            onClick={() => refetchChat()}
            disabled={chatFetching}
          >
            <ReloadOutlined spin={chatFetching} />
          </button>
          <button type="button" aria-label="More">
            <MoreOutlined />
          </button>
        </div>
      </div>

      <div className="cd-chat__messages">
        {chatLoading ? (
          <div className="ds-loading-block" style={{ padding: 40 }}>
            <Spin />
          </div>
        ) : hasDbMessages ? (
          dbMessages.map(renderDbMessage)
        ) : (
          <div className="cd-chat__empty">
            <Empty
              image={<MessageOutlined className="cd-chat__empty-icon" />}
              description={
                <div className="cd-chat__empty-copy">
                  <p className="cd-chat__empty-title">
                    {canIdentifyContact ? 'No chat yet' : 'No contact number available'}
                  </p>
                  <p className="cd-chat__empty-sub">
                    {canIdentifyContact
                      ? "Let's chat — type a message below to start"
                      : 'Add a mobile/WhatsApp number to enable live chat'}
                  </p>
                </div>
              }
            />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {attachment ? (
        <div className="cd-chat__attach-preview">
          {previewUrl ? (
            <img src={previewUrl} alt="preview" className="cd-chat__attach-thumb" />
          ) : (
            <FilePdfOutlined className="cd-chat__attach-icon" />
          )}
          <span className="cd-chat__attach-name">{attachment.name}</span>
          <button type="button" onClick={clearAttachment} aria-label="Remove attachment">
            <DeleteOutlined />
          </button>
        </div>
      ) : null}

      <div className="cd-chat__composer">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,image/*,video/*"
          hidden
          onChange={handlePickFile}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handlePickImage}
        />
        <div className="cd-chat__composer-tools has-quick-reply">
          <button
            type="button"
            aria-label="Attach PDF or document"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || !canIdentifyContact}
          >
            <PaperClipOutlined />
          </button>
          <button
            type="button"
            aria-label="Attach image"
            onClick={() => imageInputRef.current?.click()}
            disabled={sending || !canIdentifyContact}
          >
            <PictureOutlined />
          </button>
          <Popover
            trigger="click"
            placement="topLeft"
            open={quickOpen && canIdentifyContact}
            onOpenChange={handleQuickOpenChange}
            content={quickReplyContent}
          >
            <button
              type="button"
              className={`cd-chat__quick-btn${quickOpen ? ' is-open' : ''}`}
              aria-label="Quick replies"
              title="Quick replies"
              disabled={!canIdentifyContact}
            >
              <ThunderboltOutlined />
            </button>
          </Popover>
        </div>
        <textarea
          ref={inputRef}
          className="cd-chat__input"
          rows={1}
          placeholder="Type a message... (Press Enter to send, Shift+Enter for new line)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKeyDown}
          disabled={sending || !canIdentifyContact}
        />
        <button
          type="button"
          className="cd-chat__send"
          aria-label="Send"
          onClick={handleSend}
          disabled={sending || !canIdentifyContact || (!draft.trim() && !attachment)}
        >
          {sending ? <Spin size="small" /> : <SendOutlined />}
        </button>
      </div>
    </section>
  )
}

export default LiveChatPanel
