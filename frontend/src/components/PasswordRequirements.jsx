import { CheckCircleFilled, CloseCircleOutlined } from '@ant-design/icons'
import { PASSWORD_REQUIREMENTS } from '../utils/passwordPolicy'

/** Live checklist of the strong-password rules for the value being typed. */
export default function PasswordRequirements({ password, style }) {
  const value = typeof password === 'string' ? password : ''
  return (
    <ul
      className="password-requirements"
      aria-label="Password requirements"
      style={{
        listStyle: 'none',
        margin: '6px 0 2px',
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: '2px 12px',
        fontSize: 12,
        lineHeight: '20px',
        ...style,
      }}
    >
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = value.length > 0 && req.test(value)
        return (
          <li
            key={req.key}
            data-met={met ? 'true' : 'false'}
            style={{ color: met ? 'var(--color-success)' : 'var(--text-muted)' }}
          >
            {met ? <CheckCircleFilled /> : <CloseCircleOutlined />} {req.label}
          </li>
        )
      })}
    </ul>
  )
}
