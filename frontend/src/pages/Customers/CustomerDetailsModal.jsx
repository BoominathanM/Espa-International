import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Tag, Spin, Empty, App } from 'antd'
import {
  UserOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PictureOutlined,
  SmileOutlined,
  SendOutlined,
  CloseOutlined,
  FilePdfOutlined,
  DeleteOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import {
  useGetChatMessagesQuery,
  useSendChatMessageMutation,
} from '../../store/api/chatApi'

const WhatsAppIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
)

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

const CustomerDetailsModal = ({ open, customer, onClose, isMobile }) => {
  const { message: messageApi } = App.useApp()
  const [activeTab, setActiveTab] = useState('chat')
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const name = customer?.name || 'Customer'
  const phone = customer?.whatsapp || customer?.mobile || '—'
  const branch = customer?.branch || '—'
  const tags = customer?.tags || []
  const primaryTag = tags.includes('Repeat Customer')
    ? 'Repeat Customer'
    : tags[0] || 'New Customer'

  const phoneForQuery = customer?.whatsapp || customer?.mobile || ''
  const {
    data: chatData,
    isLoading: chatLoading,
    isFetching: chatFetching,
    refetch: refetchChat,
  } = useGetChatMessagesQuery(
    {
      customerId: customer?._id,
      phone: phoneForQuery,
      limit: 200,
    },
    {
      skip: !open || !customer?._id,
      pollingInterval: open ? 5000 : 0,
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
      sender: m.contactName || name,
      status: m.status,
      mediaUrl: m.mediaUrl || '',
      mediaFilename: m.mediaFilename || '',
      mediaMimeType: m.mediaMimeType || '',
    }))
  }, [chatData?.messages, name])

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
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, dbMessages.length, chatFetching])

  const clearAttachment = () => setAttachment(null)

  const handleClose = () => {
    setActiveTab('chat')
    setDraft('')
    clearAttachment()
    onClose?.()
  }

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
    if (!customer?._id) return
    const text = draft.trim()
    if (!text && !attachment) {
      messageApi.warning('Type a message or attach a file')
      return
    }

    const type = attachment ? detectAttachType(attachment) : 'text'

    try {
      await sendChatMessage({
        customerId: customer._id,
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
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      closable={false}
      width={isMobile ? '96%' : 980}
      centered
      destroyOnClose
      className="customer-details-modal"
      styles={{
        body: { padding: 0 },
        content: { padding: 0, overflow: 'hidden', borderRadius: 14 },
      }}
    >
      <div className="cd-modal">
        <header className="cd-modal__header">
          <div className="cd-modal__header-left">
            <span className="cd-modal__header-icon">
              <UserOutlined />
            </span>
            <span className="cd-modal__header-title">
              Customer Details – <em>{name}</em>
            </span>
            <Tag className="cd-modal__tag">{primaryTag}</Tag>
          </div>
          <div className="cd-modal__header-right">
            <span className="cd-modal__branch">
              Company / Branch: <strong>{branch}</strong>
            </span>
            <button type="button" className="cd-modal__close" onClick={handleClose} aria-label="Close">
              <CloseOutlined />
            </button>
          </div>
        </header>

        <div className="cd-modal__body">
          <aside className="cd-sidebar">
            <button
              type="button"
              className={`cd-sidebar__item${activeTab === 'chat' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <span className="cd-sidebar__wa">
                <WhatsAppIcon size={18} />
              </span>
              Live Chat
            </button>
            <button
              type="button"
              className={`cd-sidebar__item${activeTab === 'profile' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <UserOutlined className="cd-sidebar__profile-icon" />
              Customer Profile
            </button>
          </aside>

          <section className="cd-main">
            {activeTab === 'chat' ? (
              <>
                <div className="cd-chat__header">
                  <div>
                    <div className="cd-chat__name">{name}</div>
                    <div className="cd-chat__status">
                      <span className="cd-chat__online-dot" />
                      Online via WhatsApp • {phone}
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
                            <p className="cd-chat__empty-title">This customer has no chat</p>
                            <p className="cd-chat__empty-sub">Let&apos;s chat — type a message below to start</p>
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
                      disabled={sending}
                    >
                      <PaperClipOutlined />
                    </button>
                    <button
                      type="button"
                      aria-label="Attach image"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={sending}
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
                    disabled={sending}
                  />
                  <button
                    type="button"
                    className="cd-chat__send"
                    aria-label="Send"
                    onClick={handleSend}
                    disabled={sending || (!draft.trim() && !attachment)}
                  >
                    {sending ? <Spin size="small" /> : <SendOutlined />}
                  </button>
                </div>
              </>
            ) : (
              <div className="cd-profile">
                <h3 className="cd-profile__title">Customer Profile</h3>
                <dl className="cd-profile__grid">
                  <div>
                    <dt>Name</dt>
                    <dd>{name}</dd>
                  </div>
                  <div>
                    <dt>Mobile</dt>
                    <dd>{customer?.mobile || '—'}</dd>
                  </div>
                  <div>
                    <dt>WhatsApp</dt>
                    <dd>{customer?.whatsapp || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{customer?.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Branch</dt>
                    <dd>{branch}</dd>
                  </div>
                  <div>
                    <dt>Tags</dt>
                    <dd>
                      {(tags.length ? tags : ['—']).map((t) => (
                        <Tag key={t} className="cd-modal__tag" style={{ marginInlineEnd: 4 }}>
                          {t}
                        </Tag>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>Total Leads</dt>
                    <dd>{customer?.totalLeads ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Last Interaction</dt>
                    <dd>{customer?.lastInteraction || '—'}</dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        </div>
      </div>
    </Modal>
  )
}

export default CustomerDetailsModal
