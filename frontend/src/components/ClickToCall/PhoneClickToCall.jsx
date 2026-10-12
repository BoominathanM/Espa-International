import React, { useState } from 'react'
import { App, Button } from 'antd'
import { PhoneOutlined } from '@ant-design/icons'
import {
  usePreviewTeleCMINumberCallMutation,
  useMakeTeleCMINumberCallMutation,
} from '../../store/api/telecmiApi'
import './PhoneClickToCall.css'

/**
 * A phone number with the TeleCMI click-to-call icon — the same call Lead Management's Mobile
 * column places (a staff member's TeleCMI phone rings first, then TeleCMI dials the customer).
 * Used where a number is shown outside Lead Management: Call Records, Customer Management and
 * Appointment details. Pass leadId / customerId when known so the call rings that lead's
 * assigned staff member; with no lead it rings the logged-in user's own TeleCMI phone
 * (backend resolveNumberCallTarget, POST /api/telecmi/number-call).
 */
const PhoneClickToCall = ({ phone, leadId, customerId, name, empty = '-' }) => {
  const { modal, message } = App.useApp()
  const [previewCall, { isLoading: previewing }] = usePreviewTeleCMINumberCallMutation()
  const [makeCall] = useMakeTeleCMINumberCallMutation()
  const [calling, setCalling] = useState(false)

  const number = String(phone ?? '').trim()
  if (!number || number === '-') return <>{empty}</>

  const handleCall = async (e) => {
    e.stopPropagation()
    const body = {
      phone: number,
      ...(leadId ? { leadId: String(leadId) } : {}),
      ...(customerId ? { customerId: String(customerId) } : {}),
    }

    let target
    try {
      target = await previewCall(body).unwrap()
    } catch (error) {
      message.error(error?.data?.message || 'Call failed')
      return
    }

    const agentName = target?.agent?.name || 'Staff'
    const isAssigned = target?.agentSource === 'assigned'
    const ringing = isAssigned ? `${agentName}'s TeleCMI phone` : `Your TeleCMI phone (${agentName})`
    const who = target?.customerName || name || 'the customer'
    const dialled = target?.phone || number

    modal.confirm({
      title: 'Call via TeleCMI',
      content: `${ringing} will ring first — answer it and TeleCMI then dials ${who} (${dialled}). If the call is not answered, the AI assistant calls the customer back. Continue?`,
      okText: 'Call',
      onOk: async () => {
        setCalling(true)
        try {
          await makeCall(body).unwrap()
          message.success(
            `Ringing ${isAssigned ? `${agentName}'s` : 'your'} TeleCMI phone — answer it to be connected to ${who}.`
          )
        } catch (error) {
          message.error(error?.data?.message || 'Call failed')
        } finally {
          setCalling(false)
        }
      },
    })
  }

  return (
    <span className="ctc-phone-cell">
      {number}
      <Button
        type="text"
        size="small"
        icon={<PhoneOutlined />}
        title="Call via TeleCMI"
        aria-label={`Call ${number} via TeleCMI`}
        className="ctc-call-btn"
        loading={previewing || calling}
        onClick={handleCall}
      />
    </span>
  )
}

export default PhoneClickToCall
