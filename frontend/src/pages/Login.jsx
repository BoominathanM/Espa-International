import React from 'react'
import { Form, Input, Button, Card, App, Tooltip } from 'antd'
import { MailOutlined, LockOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons'
import { motion } from 'framer-motion'
import { useThemeMode } from '../hooks/useThemeMode'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLoginMutation } from '../store/api/authApi'
import { getDefaultPermissions } from '../utils/permissions'
import { getApiBaseUrl } from '../utils/apiConfig'

const Login = () => {
  const { message } = App.useApp()
  const { isDark, toggleTheme } = useThemeMode()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [loginMutation, { isLoading: loginLoading }] = useLoginMutation()

  const onFinish = async (values) => {
    try {
      const result = await loginMutation(values).unwrap()
      
      if (!result || !result.success || !result.user) {
        message.error('Invalid response from server. Please try again.')
        return
      }
      
      const userData = {
        _id: result.user._id || result.user.id,
        id: result.user._id || result.user.id,
        name: result.user.name || '',
        email: result.user.email || '',
        role: result.user.role || 'staff',
        branch: result.user.branch || null,
        status: result.user.status || 'active',
        phone: result.user.phone || '',
        permissions: result.user.permissions || getDefaultPermissions(result.user.role || 'staff'),
        // Token is now stored in HTTP-only cookie, not in response
      }
      
      login(userData)
      message.success(`Login successful! Welcome ${userData.name || 'User'}`)
      navigate('/dashboard')
      
    } catch (error) {
      let errorMessage = 'Login failed. Please check your credentials.'
      
      if (error?.status === 'FETCH_ERROR' || error?.status === 'PARSING_ERROR') {
        // Get the API URL being used
        const apiUrl = getApiBaseUrl()
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname === ''
        
        errorMessage = `Cannot connect to server at ${apiUrl}. Please check if backend is running and accessible.`
        
        // Add more helpful message for localhost
        if (isLocalhost) {
          errorMessage += ' Make sure the backend server is running on port 3001.'
        } else {
          errorMessage += ' Check your server domain configuration and ensure CORS is properly configured.'
        }
      } else if (error?.status === 404) {
        errorMessage = 'API endpoint not found. Please check backend server configuration.'
      } else if (error?.data?.message) {
        errorMessage = error.data.message
      }
      
      message.error(errorMessage)
    }
  }


  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, var(--bg-color) 0%, var(--card-bg) 100%)`,
        position: 'relative',
      }}
    >
      <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
        <motion.button
          type="button"
          onClick={toggleTheme}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          aria-label="Toggle theme"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            width: 44,
            height: 44,
            borderRadius: 10,
            border: '1px solid var(--border-color)',
            background: 'var(--card-bg)',
            color: 'var(--primary-color)',
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          {isDark ? <SunOutlined /> : <MoonOutlined />}
        </motion.button>
      </Tooltip>
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
              <Tooltip title="Contact admin">
                <Button
                  type="link"
                  style={{ color: '#D4AF37', padding: 0 }}
                >
                  Forgot Password?
                </Button>
              </Tooltip>
            </div>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loginLoading}
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
    </div>
  )
}

export default Login
