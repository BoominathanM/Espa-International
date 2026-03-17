import React, { useState, useEffect, useRef } from 'react'
import {
  Layout,
  Input,
  Button,
  Avatar,
  Badge,
  Select,
  Space,
  Tag,
  Card,
  message,
  Popconfirm,
} from 'antd'
import {
  SendOutlined,
  PaperClipOutlined,
  CloseOutlined,
  DeleteOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { canDelete } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import dayjs from 'dayjs'

const { Sider, Content } = Layout
const { TextArea } = Input
const { Option } = Select

const Chats = () => {
  const { isMobile, isTablet, isSmallLaptop } = useResponsive()
  const [selectedChat, setSelectedChat] = useState(null)
  const [messageText, setMessageText] = useState('')
  const [chats, setChats] = useState([
    {
      id: '1',
      name: 'John Doe',
      phone: '+91 9876543210',
      status: 'Open',
      assignedTo: 'Agent A',
      lastMessage: 'Hello, I am interested in spa services',
      lastMessageTime: '10:30 AM',
      unread: 2,
      isAI: false,
    },
    {
      id: '2',
      name: 'Jane Smith',
      phone: '+91 9876543211',
      status: 'Open',
      assignedTo: 'Me',
      lastMessage: 'Thank you for your response',
      lastMessageTime: '11:15 AM',
      unread: 0,
      isAI: true,
    },
    {
      id: '3',
      name: 'Mike Johnson',
      phone: '+91 9876543212',
      status: 'Closed',
      assignedTo: 'Agent B',
      lastMessage: 'See you tomorrow',
      lastMessageTime: 'Yesterday',
      unread: 0,
      isAI: false,
    },
  ])

  const [messages, setMessages] = useState({
    '1': [
      {
        id: '1',
        text: 'Hello, I am interested in spa services',
        sender: 'customer',
        time: '10:25 AM',
        isAI: false,
      },
      {
        id: '2',
        text: 'Hello! Thank you for contacting ESPA International. How can I assist you today?',
        sender: 'agent',
        time: '10:26 AM',
        isAI: false,
      },
      {
        id: '3',
        text: 'I would like to know about your massage packages',
        sender: 'customer',
        time: '10:28 AM',
        isAI: false,
      },
      {
        id: '4',
        text: 'We have several packages available. Let me send you our brochure.',
        sender: 'agent',
        time: '10:30 AM',
        isAI: false,
      },
    ],
    '2': [
      {
        id: '1',
        text: 'Hello, I need information about your services',
        sender: 'customer',
        time: '11:10 AM',
        isAI: false,
      },
      {
        id: '2',
        text: 'Hello! I am an AI assistant. How can I help you?',
        sender: 'agent',
        time: '11:11 AM',
        isAI: true,
      },
    ],
    '3': [
      {
        id: '1',
        text: 'What are your operating hours?',
        sender: 'customer',
        time: '09:00 AM',
        isAI: false,
      },
      {
        id: '2',
        text: 'We are open from 9 AM to 9 PM daily.',
        sender: 'agent',
        time: '09:01 AM',
        isAI: false,
      },
    ],
  })

  const [filter, setFilter] = useState('all')
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [selectedChat, messages])

  const filteredChats = chats.filter((chat) => {
    if (filter === 'open') return chat.status === 'Open'
    if (filter === 'closed') return chat.status === 'Closed'
    if (filter === 'assigned') return chat.assignedTo === 'Me'
    return true
  })

  const currentMessages = selectedChat ? messages[selectedChat] || [] : []

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedChat) return

    const newMessage = {
      id: Date.now().toString(),
      text: messageText,
      sender: 'agent',
      time: dayjs().format('h:mm A'),
      isAI: false,
    }

    setMessages({
      ...messages,
      [selectedChat]: [...currentMessages, newMessage],
    })

    setMessageText('')
  }

  const handleCloseChat = () => {
    if (selectedChat) {
      setChats(
        chats.map((chat) =>
          chat.id === selectedChat ? { ...chat, status: 'Closed' } : chat
        )
      )
      message.success('Chat closed')
    }
  }

  const handleDeleteChat = (chatId) => {
    setChats(chats.filter((chat) => chat.id !== chatId))
    if (selectedChat === chatId) {
      setSelectedChat(null)
    }
    message.success('Chat deleted')
  }

  const templateMessages = [
    'Hello! Thank you for contacting ESPA International.',
    'How can I assist you today?',
    'We have several spa packages available.',
    'Let me send you our brochure.',
    'Thank you for your interest!',
  ]

  const isAfter8PM = dayjs().hour() >= 20

  const sidebarWidth = isMobile ? 0 : (isTablet || isSmallLaptop ? 250 : 300)

  return (
    <Layout style={{ 
      height: isMobile ? 'calc(100vh - 150px)' : 'calc(100vh - 200px)', 
      background: '#0a0a0a',
      minHeight: isMobile ? '400px' : '500px',
    }}>
      <Sider
        width={sidebarWidth}
        style={{
          background: '#1a1a1a',
          borderRight: '1px solid #333',
          padding: isMobile ? 0 : 16,
          display: isMobile && !selectedChat ? 'none' : 'block',
        }}
        breakpoint="md"
        collapsedWidth={0}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#D4AF37', marginBottom: 8 }}>Chats</h3>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: '100%' }}
          >
            <Option value="all">All Chats</Option>
            <Option value="open">Open</Option>
            <Option value="closed">Closed</Option>
            <Option value="assigned">Assigned to Me</Option>
          </Select>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
          {filteredChats.map((chat) => (
            <Card
              key={chat.id}
              hoverable
              onClick={() => setSelectedChat(chat.id)}
              style={{
                marginBottom: 8,
                background: selectedChat === chat.id ? '#2a2a2a' : '#1a1a1a',
                border: `1px solid ${selectedChat === chat.id ? '#D4AF37' : '#333'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <strong style={{ color: '#ffffff' }}>{chat.name}</strong>
                    {chat.isAI && (
                      <Tag color="blue" icon={<RobotOutlined />}>
                        AI
                      </Tag>
                    )}
                    {isAfter8PM && !chat.isAI && (
                      <Tag color="purple">Auto-Bot</Tag>
                    )}
                  </div>
                  <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>
                    {chat.phone}
                  </div>
                  <div style={{ color: '#aaa', fontSize: 12 }}>{chat.lastMessage}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#888', fontSize: 11 }}>{chat.lastMessageTime}</div>
                  {chat.unread > 0 && (
                    <Badge count={chat.unread} style={{ marginTop: 4 }} />
                  )}
                  <Tag
                    color={chat.status === 'Open' ? 'green' : 'default'}
                    style={{ marginTop: 4, display: 'block' }}
                  >
                    {chat.status}
                  </Tag>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Sider>

      <Content style={{ background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>
        {selectedChat ? (
          <>
            <div
              style={{
                padding: 16,
                borderBottom: '1px solid #333',
                background: '#1a1a1a',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ color: '#ffffff', margin: 0 }}>
                  {chats.find((c) => c.id === selectedChat)?.name}
                </h3>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {chats.find((c) => c.id === selectedChat)?.phone}
                </div>
              </div>
              <Space>
                <Button
                  icon={<CloseOutlined />}
                  onClick={handleCloseChat}
                  disabled={chats.find((c) => c.id === selectedChat)?.status === 'Closed'}
                >
                  Close Chat
                </Button>
                {canDelete('chats') && (
                  <Popconfirm
                    title="Delete this chat?"
                    onConfirm={() => handleDeleteChat(selectedChat)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 16,
                background: '#0a0a0a',
              }}
            >
              {currentMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.sender === 'agent' ? 'flex-end' : 'flex-start',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '70%',
                      padding: '12px 16px',
                      borderRadius: 12,
                      background:
                        msg.sender === 'agent'
                          ? msg.isAI
                            ? '#4A90E2'
                            : '#D4AF37'
                          : '#2a2a2a',
                      color: msg.sender === 'agent' ? '#000000' : '#ffffff',
                    }}
                  >
                    {msg.isAI && (
                      <div style={{ fontSize: 11, marginBottom: 4, opacity: 0.8 }}>
                        <RobotOutlined /> AI Agent
                      </div>
                    )}
                    <div>{msg.text}</div>
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 4,
                        opacity: 0.7,
                        textAlign: 'right',
                      }}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div
              style={{
                padding: 16,
                borderTop: '1px solid #333',
                background: '#1a1a1a',
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <Select
                  placeholder="Quick Reply Templates"
                  style={{ width: '100%' }}
                  onSelect={(value) => setMessageText(value)}
                >
                  {templateMessages.map((template, index) => (
                    <Option key={index} value={template}>
                      {template}
                    </Option>
                  ))}
                </Select>
              </div>
              <Space.Compact style={{ width: '100%' }}>
                <Button icon={<PaperClipOutlined />} />
                <TextArea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  style={{ background: '#2a2a2a', borderColor: '#333', color: '#ffffff' }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSendMessage}
                  disabled={!messageText.trim()}
                >
                  Send
                </Button>
              </Space.Compact>
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              color: '#888',
            }}
          >
            Select a chat to start messaging
          </div>
        )}
      </Content>
    </Layout>
  )
}

export default Chats
