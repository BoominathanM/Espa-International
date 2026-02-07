import React, { useState } from 'react'
import { Form, Input, Button, Card, message, Modal } from 'antd'
import { MailOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getDefaultPermissions } from '../utils/permissions'

const Login = () => {
  const [loading, setLoading] = useState(false)
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false)
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [forgotPasswordForm] = Form.useForm()
  const navigate = useNavigate()
  const { login } = useAuth()

  const onFinish = (values) => {
    setLoading(true)
    
    // Validate password
    if (values.password !== '123456') {
      message.error('Invalid password!')
      setLoading(false)
      return
    }

    // Validate email domain
    if (!values.email.endsWith('@gmail.com')) {
      message.error('Please use a @gmail.com email address!')
      setLoading(false)
      return
    }

    // Mock authentication - replace with actual API call
    setTimeout(() => {
      // Extract email prefix (part before @gmail.com)
      const emailPrefix = values.email.split('@')[0].toLowerCase()
      
      // Dynamic role determination based on email prefix
      let role = 'staff'
      let name = 'Staff User'
      
      // Check for role keywords in email prefix
      if (emailPrefix.includes('superadmin') || emailPrefix === 'superadmin') {
        role = 'superadmin'
        name = 'Super Admin'
      } else if (emailPrefix.includes('admin') && !emailPrefix.includes('super')) {
        role = 'admin'
        name = 'Admin User'
      } else if (emailPrefix.includes('supervisor') || emailPrefix.includes('super')) {
        role = 'supervisor'
        name = 'Supervisor'
      } else if (emailPrefix.includes('staff') || emailPrefix.includes('agent')) {
        role = 'staff'
        name = 'Staff User'
      } else {
        // Default to staff for any other @gmail.com email
        role = 'staff'
        name = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) + ' User'
      }

      const userData = {
        id: 1,
        name: name,
        username: emailPrefix,
        role: role,
        email: values.email,
        branch: role === 'superadmin' ? 'All' : 'Branch 1',
        permissions: getDefaultPermissions(role),
        token: 'mock_token_' + Date.now(),
      }

      login(userData)
      message.success(`Login successful! Welcome ${name}`)
      navigate('/dashboard')
      setLoading(false)
    }, 500)
  }

  const handleForgotPassword = (values) => {
    setForgotPasswordLoading(true)
    
    // Mock forgot password - replace with actual API call
    setTimeout(() => {
      if (!values.email.endsWith('@gmail.com')) {
        message.error('Please use a @gmail.com email address!')
        setForgotPasswordLoading(false)
        return
      }
      
      // In production, this would send a password reset email
      message.success('Password reset link has been sent to your email!')
      setForgotPasswordVisible(false)
      forgotPasswordForm.resetFields()
      setForgotPasswordLoading(false)
    }, 1000)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 450,
          margin: '0 16px',
          background: '#1a1a1a',
          border: '1px solid #333',
          boxShadow: '0 4px 20px rgba(212, 175, 55, 0.1)',
        }}
        className="login-card"
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/espalogo.png"
            alt="ESPA International Logo"
            style={{
              maxWidth: '200px',
              maxHeight: '100px',
              transform: 'scale(1.2)',
              marginBottom: 16,
              objectFit: 'contain',
            }}
            onError={(e) => {
              // Fallback if logo not found
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'block'
            }}
          />
        </div>
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="Email"
              style={{ background: '#2a2a2a', borderColor: '#333', color: '#ffffff' }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              style={{ background: '#2a2a2a', borderColor: '#333', color: '#ffffff' }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <Button
                type="link"
                onClick={() => setForgotPasswordVisible(true)}
                style={{ color: '#D4AF37', padding: 0 }}
              >
                Forgot Password?
              </Button>
            </div>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 45,
                fontSize: 16,
                fontWeight: 'bold',
              }}
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        title="Forgot Password"
        open={forgotPasswordVisible}
        onCancel={() => {
          setForgotPasswordVisible(false)
          forgotPasswordForm.resetFields()
        }}
        footer={null}
        width={400}
      >
        <Form
          form={forgotPasswordForm}
          layout="vertical"
          onFinish={handleForgotPassword}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="Enter your email"
              style={{ background: '#2a2a2a', borderColor: '#333', color: '#ffffff' }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={forgotPasswordLoading}
              block
              style={{
                height: 40,
                fontSize: 14,
                fontWeight: 'bold',
              }}
            >
              Send Reset Link
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Login
