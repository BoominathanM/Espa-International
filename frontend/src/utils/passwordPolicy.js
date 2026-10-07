// Strong password policy for any password a user or admin sets (Add User, Edit User reset,
// Profile → Change Password). Mirrors backend/utils/passwordPolicy.js — keep the two in sync.
// Login does NOT apply it, so existing passwords keep working until they are changed.

export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_REQUIREMENTS = [
  {
    key: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    short: `${PASSWORD_MIN_LENGTH}+ characters`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  { key: 'upper', label: 'One uppercase letter (A-Z)', short: 'an uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'One lowercase letter (a-z)', short: 'a lowercase letter', test: (v) => /[a-z]/.test(v) },
  { key: 'number', label: 'One number (0-9)', short: 'a number', test: (v) => /[0-9]/.test(v) },
  {
    key: 'symbol',
    label: 'One symbol (e.g. ! @ # $ % & *)',
    short: 'a symbol',
    test: (v) => /[^A-Za-z0-9\s]/.test(v),
  },
  { key: 'noSpace', label: 'No spaces', short: 'no spaces', test: (v) => !/\s/.test(v), isSpaceRule: true },
]

/** Requirements the given password does not meet yet (empty array = strong). */
export const getUnmetPasswordRequirements = (password) => {
  const value = typeof password === 'string' ? password : ''
  return PASSWORD_REQUIREMENTS.filter((req) => !req.test(value))
}

export const isStrongPassword = (password) => getUnmetPasswordRequirements(password).length === 0

/** antd Form rule; empty values pass so `required` (where used) reports them instead. */
export const strongPasswordRule = {
  validator: (_, value) => {
    if (!value) return Promise.resolve()
    const unmet = getUnmetPasswordRequirements(value)
    if (unmet.length === 0) return Promise.resolve()
    const needs = unmet.filter((req) => !req.isSpaceRule).map((req) => req.short)
    const parts = []
    if (needs.length) parts.push(`Password needs ${needs.join(', ')}`)
    if (unmet.some((req) => req.isSpaceRule)) parts.push(needs.length ? 'no spaces' : 'Password must not contain spaces')
    return Promise.reject(new Error(parts.join(', and ')))
  },
}
