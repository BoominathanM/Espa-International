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
import './Login.css'

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
      }

      login(userData)
      message.success(`Login successful! Welcome ${userData.name || 'User'}`)
      navigate('/dashboard')
    } catch (error) {
      let errorMessage = 'Login failed. Please check your credentials.'

      if (error?.status === 'FETCH_ERROR' || error?.status === 'PARSING_ERROR') {
        const apiUrl = getApiBaseUrl()
        const isLocalhost =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname === ''

        errorMessage = `Cannot connect to server at ${apiUrl}. Please check if backend is running and accessible.`

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
    <div className="login-page">
      <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
        <motion.button
          type="button"
          onClick={toggleTheme}
          className="login-page__theme-toggle"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          aria-label="Toggle theme"
        >
          {isDark ? <SunOutlined /> : <MoonOutlined />}
        </motion.button>
      </Tooltip>
      <Card className="login-card">
        <div className="login-page__logo-wrap">
          <img
            src="/espalogo.png"
            alt="ESPA International Logo"
            className="login-page__logo"
            onError={(e) => {
              e.target.style.display = 'none'
              if (e.target.nextSibling) e.target.nextSibling.style.display = 'block'
            }}
          />
        </div>
        <Form name="login" onFinish={onFinish} autoComplete="off" size="large">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="Email" className="login-page__input" />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: 'Please input your password!' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" className="login-page__input" />
          </Form.Item>

          <Form.Item>
            <div className="login-page__forgot-wrap">
              <Tooltip title="Contact admin">
                <Button type="link" className="login-page__forgot-link">
                  Forgot Password?
                </Button>
              </Tooltip>
            </div>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loginLoading} block className="login-page__submit">
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default Login
