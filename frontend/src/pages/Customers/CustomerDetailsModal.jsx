import React, { useState } from 'react'
import { Modal, Tag } from 'antd'
import { UserOutlined, CloseOutlined } from '@ant-design/icons'
import WhatsAppIcon from '../../components/LiveChat/WhatsAppIcon'
import LiveChatPanel from '../../components/LiveChat/LiveChatPanel'

const CustomerDetailsModal = ({ open, customer, onClose, isMobile }) => {
  const [activeTab, setActiveTab] = useState('chat')

  const name = customer?.name || 'Customer'
  const branch = customer?.branch || '—'
  const tags = customer?.tags || []
  const primaryTag = tags.includes('Repeat Customer')
    ? 'Repeat Customer'
    : tags[0] || 'New Customer'

  const phoneForQuery = customer?.whatsapp || customer?.mobile || ''

  const handleClose = () => {
    setActiveTab('chat')
    onClose?.()
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

          {activeTab === 'chat' ? (
            <LiveChatPanel
              name={name}
              phone={phoneForQuery}
              customerId={customer?._id}
              active={open}
            />
          ) : (
            <section className="cd-main">
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
            </section>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default CustomerDetailsModal
