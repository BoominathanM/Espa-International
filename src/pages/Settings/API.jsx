import React from 'react'
import { Card, Form, Input, Button, message, Tabs } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'

const API = () => {
  const { isMobile } = useResponsive()
  const [ozonetelForm] = Form.useForm()
  const [whatsappForm] = Form.useForm()
  const [facebookForm] = Form.useForm()
  const [websiteForm] = Form.useForm()

  const handleOzonetelSave = (values) => {
    message.success('Ozonetel API configuration saved')
    // In production, this would save to backend
  }

  const handleWhatsAppSave = (values) => {
    message.success('WhatsApp API configuration saved')
    // In production, this would save to backend
  }

  const handleFacebookSave = (values) => {
    message.success('Facebook/Meta API configuration saved')
    // In production, this would save to backend
  }

  const handleWebsiteSave = (values) => {
    message.success('Website integration configuration saved')
    // In production, this would save to backend
  }

  const tabItems = [
    {
      key: 'ozonetel',
      label: 'Ozonetel API',
      children: (
        <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
          <Form
            form={ozonetelForm}
            layout="vertical"
            onFinish={handleOzonetelSave}
            initialValues={{
              apiKey: 'your_ozonetel_api_key',
              apiSecret: 'your_ozonetel_api_secret',
              baseUrl: 'https://api.ozonetel.com',
            }}
          >
            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: true, message: 'Please enter API key' }]}
            >
              <Input.Password placeholder="Enter Ozonetel API Key" />
            </Form.Item>

            <Form.Item
              name="apiSecret"
              label="API Secret"
              rules={[{ required: true, message: 'Please enter API secret' }]}
            >
              <Input.Password placeholder="Enter Ozonetel API Secret" />
            </Form.Item>

            <Form.Item
              name="baseUrl"
              label="Base URL"
              rules={[{ required: true, message: 'Please enter base URL' }]}
            >
              <Input placeholder="Enter Ozonetel Base URL" />
            </Form.Item>

            <Form.Item>
              <div style={{ 
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row',
                gap: 8,
                width: '100%'
              }}>
                {isSuperAdmin() && (
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    icon={<SaveOutlined />}
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    Save Configuration
                  </Button>
                )}
                {!isSuperAdmin() && (
                  <p style={{ color: '#ffffff', margin: 0 }}>
                    Only Super Admin can configure API settings.
                  </p>
                )}
              </div>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp API',
      children: (
        <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
          <Form
            form={whatsappForm}
            layout="vertical"
            onFinish={handleWhatsAppSave}
            initialValues={{
              apiKey: 'your_whatsapp_api_key',
              apiSecret: 'your_whatsapp_api_secret',
              phoneNumberId: 'your_phone_number_id',
            }}
          >
            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: true, message: 'Please enter API key' }]}
            >
              <Input.Password placeholder="Enter WhatsApp API Key" />
            </Form.Item>

            <Form.Item
              name="apiSecret"
              label="API Secret"
              rules={[{ required: true, message: 'Please enter API secret' }]}
            >
              <Input.Password placeholder="Enter WhatsApp API Secret" />
            </Form.Item>

            <Form.Item
              name="phoneNumberId"
              label="Phone Number ID"
              rules={[{ required: true, message: 'Please enter phone number ID' }]}
            >
              <Input placeholder="Enter Phone Number ID" />
            </Form.Item>

            <Form.Item>
              <div style={{ 
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row',
                gap: 8,
                width: '100%'
              }}>
                {isSuperAdmin() && (
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    icon={<SaveOutlined />}
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    Save Configuration
                  </Button>
                )}
                {!isSuperAdmin() && (
                  <p style={{ color: '#ffffff', margin: 0 }}>
                    Only Super Admin can configure API settings.
                  </p>
                )}
              </div>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'facebook',
      label: 'Facebook/Meta Integration',
      children: (
        <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
          <Form
            form={facebookForm}
            layout="vertical"
            onFinish={handleFacebookSave}
            initialValues={{
              appId: 'your_facebook_app_id',
              appSecret: 'your_facebook_app_secret',
              accessToken: 'your_facebook_access_token',
              pageId: 'your_facebook_page_id',
              webhookVerifyToken: 'your_webhook_verify_token',
            }}
          >
            <Form.Item
              name="appId"
              label="Facebook App ID"
              rules={[{ required: true, message: 'Please enter Facebook App ID' }]}
            >
              <Input placeholder="Enter Facebook App ID" />
            </Form.Item>

            <Form.Item
              name="appSecret"
              label="Facebook App Secret"
              rules={[{ required: true, message: 'Please enter Facebook App Secret' }]}
            >
              <Input.Password placeholder="Enter Facebook App Secret" />
            </Form.Item>

            <Form.Item
              name="accessToken"
              label="Access Token"
              rules={[{ required: true, message: 'Please enter Access Token' }]}
            >
              <Input.Password placeholder="Enter Facebook Access Token" />
            </Form.Item>

            <Form.Item
              name="pageId"
              label="Facebook Page ID"
              rules={[{ required: true, message: 'Please enter Facebook Page ID' }]}
            >
              <Input placeholder="Enter Facebook Page ID" />
            </Form.Item>

            <Form.Item
              name="webhookVerifyToken"
              label="Webhook Verify Token"
              rules={[{ required: true, message: 'Please enter Webhook Verify Token' }]}
            >
              <Input.Password placeholder="Enter Webhook Verify Token" />
            </Form.Item>

            <Form.Item>
              <div style={{ 
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row',
                gap: 8,
                width: '100%'
              }}>
                {isSuperAdmin() && (
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    icon={<SaveOutlined />}
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    Save Configuration
                  </Button>
                )}
                {!isSuperAdmin() && (
                  <p style={{ color: '#ffffff', margin: 0 }}>
                    Only Super Admin can configure API settings.
                  </p>
                )}
              </div>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'website',
      label: 'Website Integration',
      children: (
        <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
          <Form
            form={websiteForm}
            layout="vertical"
            onFinish={handleWebsiteSave}
            initialValues={{
              websiteUrl: 'https://your-website.com',
              apiKey: 'your_website_api_key',
              apiSecret: 'your_website_api_secret',
              webhookUrl: 'https://your-crm.com/api/webhooks/website',
              leadCaptureEndpoint: '/api/leads/capture',
            }}
          >
            <Form.Item
              name="websiteUrl"
              label="Website URL"
              rules={[
                { required: true, message: 'Please enter Website URL' },
                { type: 'url', message: 'Please enter a valid URL' },
              ]}
            >
              <Input placeholder="Enter Website URL (e.g., https://your-website.com)" />
            </Form.Item>

            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: true, message: 'Please enter API Key' }]}
            >
              <Input.Password placeholder="Enter Website API Key" />
            </Form.Item>

            <Form.Item
              name="apiSecret"
              label="API Secret"
              rules={[{ required: true, message: 'Please enter API Secret' }]}
            >
              <Input.Password placeholder="Enter Website API Secret" />
            </Form.Item>

            <Form.Item
              name="webhookUrl"
              label="Webhook URL"
              rules={[
                { required: true, message: 'Please enter Webhook URL' },
                { type: 'url', message: 'Please enter a valid URL' },
              ]}
            >
              <Input placeholder="Enter Webhook URL for receiving leads" />
            </Form.Item>

            <Form.Item
              name="leadCaptureEndpoint"
              label="Lead Capture Endpoint"
              rules={[{ required: true, message: 'Please enter Lead Capture Endpoint' }]}
            >
              <Input placeholder="Enter Lead Capture Endpoint (e.g., /api/leads/capture)" />
            </Form.Item>

            <Form.Item>
              <div style={{ 
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row',
                gap: 8,
                width: '100%'
              }}>
                {isSuperAdmin() && (
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    icon={<SaveOutlined />}
                    style={{ width: isMobile ? '100%' : 'auto' }}
                  >
                    Save Configuration
                  </Button>
                )}
                {!isSuperAdmin() && (
                  <p style={{ color: '#ffffff', margin: 0 }}>
                    Only Super Admin can configure API settings.
                  </p>
                )}
              </div>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
  ]

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', position: 'relative' }}>
      <h2 style={{ color: '#D4AF37', marginBottom: 16, fontSize: isMobile ? '18px' : '20px' }}>API & Integrations</h2>
      <Tabs 
        items={tabItems} 
        type={isMobile ? 'card' : 'line'}
        size={isMobile ? 'small' : 'middle'}
      />
    </div>
  )
}

export default API
