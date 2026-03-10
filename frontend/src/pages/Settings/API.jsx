import React, { useEffect } from 'react'
import { Card, Form, Input, Button, message, Tabs, Switch, Spin, Alert } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { isSuperAdmin } from '../../utils/permissions'
import { useResponsive } from '../../hooks/useResponsive'
import {
  useGetWebsiteSettingsQuery,
  useUpdateWebsiteSettingsMutation,
} from '../../store/api/websiteSettingsApi'
import {
  useGetWhatsAppSettingsQuery,
  useUpdateWhatsAppSettingsMutation,
} from '../../store/api/whatsappSettingsApi'
import {
  useGetOzonetelSettingsQuery,
  useUpdateOzonetelSettingsMutation,
} from '../../store/api/ozonetelSettingsApi'

const API = () => {
  const { isMobile } = useResponsive()
  const [ozonetelForm] = Form.useForm()
  const [whatsappForm] = Form.useForm()
  const [facebookForm] = Form.useForm()
  const [websiteForm] = Form.useForm()

  // Website integration API hooks
  const { data: settingsData, isLoading: isLoadingSettings, error: settingsError, refetch: refetchSettings } = useGetWebsiteSettingsQuery()
  const [updateWebsiteSettings, { isLoading: isUpdatingWebsite }] = useUpdateWebsiteSettingsMutation()

  // WhatsApp integration API hooks
  const { data: whatsappSettingsData, isLoading: isLoadingWhatsApp, error: whatsappError, refetch: refetchWhatsApp } = useGetWhatsAppSettingsQuery()
  const [updateWhatsAppSettings, { isLoading: isUpdatingWhatsApp }] = useUpdateWhatsAppSettingsMutation()
  const websiteSettings = settingsData?.settings
  const whatsappSettings = whatsappSettingsData?.settings

  // Ozonetel integration API hooks (only Super Admin can load/save)
  const isSuperAdminUser = isSuperAdmin()
  const { data: ozonetelData, isLoading: isLoadingOzonetel, error: ozonetelError, refetch: refetchOzonetel } = useGetOzonetelSettingsQuery(undefined, { skip: !isSuperAdminUser })
  const [updateOzonetelSettings, { isLoading: isUpdatingOzonetel }] = useUpdateOzonetelSettingsMutation()
  const ozonetelSettings = ozonetelData?.settings

  // Load website settings into form when data is available
  useEffect(() => {
    if (websiteSettings) {
      websiteForm.setFieldsValue({
        websiteUrl: websiteSettings.websiteUrl || '',
        apiKey: websiteSettings.apiKey || '',
        isActive: websiteSettings.isActive !== undefined ? websiteSettings.isActive : true,
      })
    }
  }, [websiteSettings, websiteForm])

  // Load WhatsApp settings into form when data is available
  useEffect(() => {
    if (whatsappSettings) {
      whatsappForm.setFieldsValue({
        backendUrl: whatsappSettings.backendUrl || '',
        apiKey: whatsappSettings.apiKey || '',
      })
    }
  }, [whatsappSettings, whatsappForm])

  const handleOzonetelSave = (values) => {
    message.success('Ozonetel API configuration saved')
    // In production, this would save to backend
  }

  const handleWhatsAppSave = async (values) => {
    try {
      const result = await updateWhatsAppSettings({
        backendUrl: values.backendUrl.trim(),
        apiKey: values.apiKey.trim(),
      }).unwrap()

      if (result.success) {
        message.success('WhatsApp API settings saved successfully')
        refetchWhatsApp() // Refresh the data
      }
    } catch (error) {
      console.error('Save error:', error)
      message.error(error?.data?.message || 'Failed to save settings. Please try again.')
    }
  }

  const handleFacebookSave = (values) => {
    message.success('Facebook/Meta API configuration saved')
    // In production, this would save to backend
  }

  const handleWebsiteSave = async (values) => {
    try {
      const result = await updateWebsiteSettings({
        websiteUrl: values.websiteUrl.trim(),
        apiKey: values.apiKey.trim(),
        isActive: values.isActive,
      }).unwrap()

      if (result.success) {
        message.success('Website integration settings saved successfully')
        refetchSettings() // Refresh the data
      }
    } catch (error) {
      console.error('Save error:', error)
      message.error(error?.data?.message || 'Failed to save settings. Please try again.')
    }
  }

  const tabItems = [
    {
      key: 'ozonetel',
      label: 'Ozonetel Integration',
      children: (
        <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
          {isLoadingOzonetel ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
              <p style={{ color: '#fff', marginTop: 16 }}>Loading settings...</p>
            </div>
          ) : ozonetelError ? (
            <Alert
              message={ozonetelError?.status === 403 ? 'Access restricted' : 'Error Loading Settings'}
              description={ozonetelError?.status === 403 ? 'Only Super Admin can view and edit Ozonetel integration settings.' : (ozonetelError?.data?.message || 'Failed to load Ozonetel integration settings. Please try again.')}
              type="warning"
              showIcon
              style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 16 }}
            />
          ) : !isSuperAdminUser ? (
            <p style={{ color: '#888' }}>Only Super Admin can configure Ozonetel integration.</p>
          ) : (
            <>
              <Form
                form={ozonetelForm}
                layout="vertical"
                onFinish={handleOzonetelSave}
                initialValues={{
                  baseUrl: 'https://cloudagent.ozonetel.com',
                  apiKey: '',
                  isActive: true,
                  defaultCampaign: '',
                  campaignIdsText: '',
                }}
              >
                <Form.Item
                  name="baseUrl"
                  label="CloudAgent Base URL"
                  rules={[
                    { required: true, message: 'Please enter Base URL' },
                    { type: 'url', message: 'Please enter a valid URL' },
                  ]}
                  help="e.g. https://cloudagent.ozonetel.com"
                >
                  <Input placeholder="https://cloudagent.ozonetel.com" />
                </Form.Item>

                <Form.Item
                  name="apiKey"
                  label="API Key"
                  rules={[{ required: true, message: 'Please enter API Key' }]}
                  help="From CloudAgent Admin → Settings → Admin Settings"
                >
                  <Input.Password placeholder="Enter CloudAgent API Key" />
                </Form.Item>

                <Form.Item
                  name="isActive"
                  label="Integration Status"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                </Form.Item>

                <Form.Item
                  name="defaultCampaign"
                  label="Default Campaign"
                  help="Campaign name or ID used for Click-to-Call when not specified. Must match a campaign in CloudAgent."
                >
                  <Input placeholder="e.g. E-Spa International or Inb_918065480464" />
                </Form.Item>

                <Form.Item
                  name="campaignIdsText"
                  label="Campaign / Agent IDs (one per line)"
                  help="List all your campaign or agent identifiers. Used for reference; Default Campaign above is used for outbound calls."
                >
                  <Input.TextArea
                    rows={6}
                    placeholder={'Inb_918065480464\nInb_918065480465\nInb_918065480463\nInbound_918049251475\nInb_918065867654\nInb_918065867653'}
                  />
                </Form.Item>

                <Form.Item>
                  <div style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: 8,
                    width: '100%',
                  }}>
                    {isSuperAdmin() && (
                      <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        loading={isUpdatingOzonetel}
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

              <div style={{
                marginTop: 24,
                padding: 16,
                background: '#2a2a2a',
                borderRadius: 4,
                border: '1px solid #444',
              }}>
                <h4 style={{ color: '#D4AF37', marginBottom: 8 }}>Integration Information</h4>
                <p style={{ color: '#ccc', margin: '4px 0', fontSize: '14px' }}>
                  <strong>Click-to-Call:</strong> <code style={{ color: '#4CAF50' }}>POST /api/cloudagent/make-call</code> (body: phoneNumber, agentId, optional campaignName)
                </p>
                <p style={{ color: '#ccc', margin: '4px 0', fontSize: '14px' }}>
                  <strong>Webhook (URL to Push in CloudAgent):</strong> Set your backend URL + <code style={{ color: '#4CAF50' }}>/webhook/cloudagent-events</code>
                </p>
                <p style={{ color: '#ccc', margin: '8px 0 0 0', fontSize: '13px' }}>
                  In CloudAgent Campaign Settings, set &quot;URL to Push&quot; to receive call events. Users need CloudAgent Agent ID set in User Management to use Call from Leads.
                </p>
              </div>
            </>
          )}
        </Card>
      ),
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp API',
      children: (
        <Card style={{ background: '#1a1a1a', border: '1px solid #333' }}>
          {isLoadingWhatsApp ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
              <p style={{ color: '#fff', marginTop: 16 }}>Loading settings...</p>
            </div>
          ) : (
            <>
              {whatsappError && (
                <Alert
                  message="Error Loading Settings"
                  description={whatsappError?.data?.message || 'Failed to load WhatsApp API settings. You can still enter and save new settings.'}
                  type="warning"
                  showIcon
                  style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 16 }}
                />
              )}
              <Form
                form={whatsappForm}
                layout="vertical"
                onFinish={handleWhatsAppSave}
                initialValues={{
                  backendUrl: '',
                  apiKey: '',
                }}
              >
                <Form.Item
                  name="backendUrl"
                  label="Backend URL"
                  rules={[
                    { required: true, message: 'Please enter Backend URL' },
                    { type: 'url', message: 'Please enter a valid URL (e.g., https://api.example.com)' },
                  ]}
                >
                  <Input 
                    placeholder="Enter Backend URL (e.g., https://api.example.com)" 
                  />
                </Form.Item>

                <Form.Item
                  name="apiKey"
                  label="WhatsApp API Key"
                  rules={[{ required: true, message: 'Please enter WhatsApp API Key' }]}
                  help="This API key will be used to authenticate WhatsApp API requests."
                >
                  <Input.Password placeholder="Enter WhatsApp API Key" />
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
                        loading={isUpdatingWhatsApp}
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

              <div style={{ 
                marginTop: 24, 
                padding: 16, 
                background: '#2a2a2a', 
                borderRadius: 4,
                border: '1px solid #444'
              }}>
                <h4 style={{ color: '#D4AF37', marginBottom: 8 }}>Integration Information</h4>
                <p style={{ color: '#ccc', margin: '4px 0', fontSize: '14px' }}>
                  <strong>Backend URL:</strong> Used for WhatsApp API webhook configuration
                </p>
                <p style={{ color: '#ccc', margin: '4px 0', fontSize: '14px' }}>
                  <strong>API Key:</strong> Used to authenticate WhatsApp API requests
                </p>
                <p style={{ color: '#ccc', margin: '8px 0 0 0', fontSize: '13px' }}>
                  After saving, these settings will be used for WhatsApp API integration.
                </p>
              </div>
            </>
          )}
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
          {isLoadingSettings ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
              <p style={{ color: '#fff', marginTop: 16 }}>Loading settings...</p>
            </div>
          ) : settingsError ? (
            <Alert
              message="Error Loading Settings"
              description={settingsError?.data?.message || 'Failed to load website integration settings. Please try again.'}
              type="error"
              showIcon
              style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 16 }}
            />
          ) : (
            <>
              <Form
                form={websiteForm}
                layout="vertical"
                onFinish={handleWebsiteSave}
                initialValues={{
                  websiteUrl: 'https://www.espainternational.co.in',
                  apiKey: '',
                  isActive: true,
                }}
              >
                <Form.Item
                  name="websiteUrl"
                  label="Website URL"
                  rules={[
                    { required: true, message: 'Please enter Website URL' },
                    { type: 'url', message: 'Please enter a valid URL (e.g., https://www.espainternational.co.in)' },
                  ]}
                >
                  <Input 
                    placeholder="Enter Website URL (e.g., https://www.espainternational.co.in)" 
                  />
                </Form.Item>

                <Form.Item
                  name="apiKey"
                  label="API Key"
                  rules={[{ required: true, message: 'Please enter API Key' }]}
                  help="This API key will be used to authenticate requests from your website contact form."
                >
                  <Input.Password placeholder="Enter Website API Key" />
                </Form.Item>

                <Form.Item
                  name="isActive"
                  label="Integration Status"
                  valuePropName="checked"
                >
                  <Switch 
                    checkedChildren="Active" 
                    unCheckedChildren="Inactive"
                  />
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
                        loading={isUpdatingWebsite}
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

              <div style={{ 
                marginTop: 24, 
                padding: 16, 
                background: '#2a2a2a', 
                borderRadius: 4,
                border: '1px solid #444'
              }}>
                <h4 style={{ color: '#D4AF37', marginBottom: 8 }}>Integration Information</h4>
                <p style={{ color: '#ccc', margin: '4px 0', fontSize: '14px' }}>
                  <strong>Endpoint:</strong> <code style={{ color: '#4CAF50' }}>POST /api/leads/website</code>
                </p>
                <p style={{ color: '#ccc', margin: '4px 0', fontSize: '14px' }}>
                  <strong>Header Required:</strong> <code style={{ color: '#4CAF50' }}>X-API-Key: [Your API Key]</code>
                </p>
                <p style={{ color: '#ccc', margin: '8px 0 0 0', fontSize: '13px' }}>
                  After saving, your website contact form can send leads to this endpoint using the configured API key.
                </p>
              </div>
            </>
          )}
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
