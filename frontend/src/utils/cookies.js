// Cookie utility functions

/**
 * Set a cookie
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {number} days - Days until expiration (default: 7)
 */
export const setCookie = (name, value, days = 7) => {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`
}

/**
 * Get a cookie value
 * @param {string} name - Cookie name
 * @returns {string|null} - Cookie value or null if not found
 */
export const getCookie = (name) => {
  const nameEQ = name + '='
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  return null
}

/**
 * Delete a cookie
 * @param {string} name - Cookie name
 */
export const deleteCookie = (name) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`
}

/**
 * Set user data in cookie
 * @param {object} userData - User data object
 */
export const setUserCookie = (userData) => {
  setCookie('crm_user', JSON.stringify(userData), 7)
}

/**
 * Get user data from cookie
 * @returns {object|null} - User data or null if not found
 */
export const getUserCookie = () => {
  try {
    const userStr = getCookie('crm_user')
    return userStr ? JSON.parse(userStr) : null
  } catch (error) {
    return null
  }
}

/**
 * Remove user cookie
 */
export const removeUserCookie = () => {
  deleteCookie('crm_user')
}
