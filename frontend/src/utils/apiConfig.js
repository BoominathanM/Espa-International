/**
 * Get the API base URL based on environment variables and current window location
 * This ensures consistent API URL usage across the application
 */
export const getApiBaseUrl = () => {
  // First, check for environment variable (Vite uses import.meta.env)
  const envApiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL
  
  if (envApiUrl) {
    // Ensure it ends with /api if not already
    return envApiUrl.endsWith('/api') ? envApiUrl : `${envApiUrl}/api`
  }
  
  // Check if we're running on localhost
  const isLocalhost = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === ''

  if (isLocalhost) {
    return 'http://localhost:3001/api'
  } else {
    // Production: use the same domain with /api path, or fallback to configured URL
    // If frontend is on e-spa.askeva.net, backend should be on same domain or configured separately
    const hostname = window.location.hostname
    const protocol = window.location.protocol
    
    // Try same domain first (backend might be on same domain)
    // Otherwise use the configured production URL
    return import.meta.env.VITE_PRODUCTION_API_URL || 
           `${protocol}//${hostname}/api` || 
           'http://espacrm.in/api'
  }
}

// Log API URL for debugging (only in development)
if (import.meta.env.DEV) {
  console.log('🔌 API Base URL:', getApiBaseUrl())
}

