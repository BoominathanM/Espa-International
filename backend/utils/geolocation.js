/**
 * Utility function to get geolocation data from IP address
 * Uses ip-api.com free service (no API key required)
 * @param {string} ipAddress - The IP address to lookup
 * @returns {Promise<Object>} Geolocation data or null if failed
 */
export const getGeolocationFromIP = async (ipAddress) => {
  try {
    // Skip geolocation for localhost/private IPs
    if (
      !ipAddress ||
      ipAddress === 'Unknown' ||
      ipAddress === '::1' ||
      ipAddress === '127.0.0.1' ||
      ipAddress.startsWith('192.168.') ||
      ipAddress.startsWith('10.') ||
      ipAddress.startsWith('172.16.') ||
      ipAddress.startsWith('172.17.') ||
      ipAddress.startsWith('172.18.') ||
      ipAddress.startsWith('172.19.') ||
      ipAddress.startsWith('172.20.') ||
      ipAddress.startsWith('172.21.') ||
      ipAddress.startsWith('172.22.') ||
      ipAddress.startsWith('172.23.') ||
      ipAddress.startsWith('172.24.') ||
      ipAddress.startsWith('172.25.') ||
      ipAddress.startsWith('172.26.') ||
      ipAddress.startsWith('172.27.') ||
      ipAddress.startsWith('172.28.') ||
      ipAddress.startsWith('172.29.') ||
      ipAddress.startsWith('172.30.') ||
      ipAddress.startsWith('172.31.') ||
      ipAddress.startsWith('169.254.')
    ) {
      return {
        country: 'Local',
        region: 'Local Network',
        city: 'Local',
        postalCode: '',
        latitude: null,
        longitude: null,
      }
    }

    // Use ip-api.com free service (45 requests per minute limit)
    // Documentation: https://ip-api.com/docs/api:json
    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    try {
      const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,regionName,city,zip,lat,lon`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      // Check if the API returned an error
      if (data.status === 'fail') {
        console.warn(`Geolocation API error for IP ${ipAddress}:`, data.message)
        return null
      }

      // Return formatted geolocation data
      return {
        country: data.country || '',
        region: data.regionName || '',
        city: data.city || '',
        postalCode: data.zip || '',
        latitude: data.lat || null,
        longitude: data.lon || null,
      }
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('Geolocation request timeout')
      }
      throw fetchError
    }
  } catch (error) {
    // Log error but don't throw - geolocation failure shouldn't break login
    console.error(`Failed to get geolocation for IP ${ipAddress}:`, error.message)
    return null
  }
}
