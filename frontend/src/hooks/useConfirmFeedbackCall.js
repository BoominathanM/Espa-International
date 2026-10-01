import { App } from 'antd'

/**
 * "Send feedback call" — asks before ringing a real customer, then runs `send` (an RTK mutation
 * call that returns `.unwrap()`-able results) and reports the outcome. The modal closes either
 * way; errors show the backend's message (e.g. "not configured", "already placed just now").
 *
 * Usage: const confirmFeedbackCall = useConfirmFeedbackCall()
 *        confirmFeedbackCall({ name, phone, send: () => sendCall(id).unwrap() })
 */
export const useConfirmFeedbackCall = () => {
  const { modal, message } = App.useApp()
  return ({ name, phone, send }) =>
    modal.confirm({
      title: 'Send AI feedback call?',
      content: `The ZenXAI feedback assistant will call ${name || 'this customer'}${
        phone ? ` on ${phone}` : ''
      } now.`,
      okText: 'Call now',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await send()
          message.success(res?.message || 'Feedback call placed')
        } catch (e) {
          message.error(e?.data?.message || e?.message || 'Failed to place feedback call')
        }
      },
    })
}
