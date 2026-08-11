import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Spin, Empty, App } from 'antd'
import {
  InfoCircleOutlined,
  ReloadOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PictureOutlined,
  SmileOutlined,
  SendOutlined,
  FilePdfOutlined,
  DeleteOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import {
  useGetChatMessagesQuery,
  useSendChatMessageMutation,
} from '../../store/api/chatApi'
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
  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

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
        <div className="cd-chat__composer-tools">
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
          <button type="button" aria-label="Emoji" disabled title="Coming soon">
            <SmileOutlined />
          </button>
        </div>
        <textarea
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
