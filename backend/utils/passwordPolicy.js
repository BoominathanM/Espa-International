// Strong password policy applied whenever a password is SET (create user, admin reset on edit,
// self change-password). Login never applies it, so existing passwords keep working until changed.
// Mirrors frontend/src/utils/passwordPolicy.js — keep the two in sync.

export const PASSWORD_MIN_LENGTH = 8

const REQUIREMENTS = [
  { short: `${PASSWORD_MIN_LENGTH}+ characters`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { short: 'an uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { short: 'a lowercase letter', test: (v) => /[a-z]/.test(v) },
  { short: 'a number', test: (v) => /[0-9]/.test(v) },
  { short: 'a symbol', test: (v) => /[^A-Za-z0-9\s]/.test(v) },
  { short: 'no spaces', test: (v) => !/\s/.test(v), isSpaceRule: true },
]

/**
 * @returns {string|null} error message when the password is not strong enough, otherwise null
 */
export const getPasswordPolicyError = (password) => {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required'
  }
  const unmet = REQUIREMENTS.filter((req) => !req.test(password))
  if (unmet.length === 0) return null
  const needs = unmet.filter((req) => !req.isSpaceRule).map((req) => req.short)
  const parts = []
  if (needs.length) parts.push(`It needs ${needs.join(', ')}.`)
  if (unmet.some((req) => req.isSpaceRule)) parts.push('It must not contain spaces.')
  return `Password is not strong enough. ${parts.join(' ')}`
}
