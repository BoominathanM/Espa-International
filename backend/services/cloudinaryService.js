import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// WhatsApp only accepts JPEG/PNG up to 5 MB for image messages and MP4 for video,
// so other formats are delivered through a Cloudinary conversion URL instead.
const WHATSAPP_IMAGE_FORMATS = ['jpg', 'jpeg', 'png']
const WHATSAPP_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/**
 * Reads Cloudinary credentials from CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
 * CLOUDINARY_API_SECRET, or from a single CLOUDINARY_URL=cloudinary://key:secret@cloud.
 */
export function getCloudinaryConfig() {
  let cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim()
  let apiKey = (process.env.CLOUDINARY_API_KEY || '').trim()
  let apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim()

  const url = (process.env.CLOUDINARY_URL || '').trim()
  if (url) {
    const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/)
    if (match) {
      apiKey = apiKey || match[1]
      apiSecret = apiSecret || match[2]
      cloudName = cloudName || match[3]
    }
  }

  const folder = (process.env.CLOUDINARY_FOLDER || 'espa-crm/chat').trim().replace(/^\/+|\/+$/g, '')
  return { cloudName, apiKey, apiSecret, folder }
}

export function isCloudinaryConfigured() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig()
  return Boolean(cloudName && apiKey && apiSecret)
}

function resourceTypeForMime(mime) {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'raw'
}

function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex')
}

/** URL AskEVA/WhatsApp should fetch — converts formats WhatsApp rejects. */
function whatsappDeliveryUrl(result) {
  const url = result.secure_url
  const format = String(result.format || '').toLowerCase()

  if (result.resource_type === 'image') {
    const fits = WHATSAPP_IMAGE_FORMATS.includes(format) && result.bytes <= WHATSAPP_IMAGE_MAX_BYTES
    if (fits) return url
    return url
      .replace('/image/upload/', '/image/upload/c_limit,w_2048,q_auto/')
      .replace(/\.[a-z0-9]+$/i, '.jpg')
  }

  if (result.resource_type === 'video' && format && format !== 'mp4') {
    return url.replace(/\.[a-z0-9]+$/i, '.mp4')
  }

  return url
}

/**
 * Signed upload of a local file to Cloudinary (REST API, no SDK needed).
 * @param {{ filePath: string, mimeType?: string, originalName?: string }} opts
 * @returns {Promise<{ url: string, secureUrl: string, publicId: string, resourceType: string, format: string, bytes: number }>}
 */
export async function uploadChatFileToCloudinary({ filePath, mimeType = '', originalName = '' }) {
  const { cloudName, apiKey, apiSecret, folder } = getCloudinaryConfig()
  if (!cloudName || !apiKey || !apiSecret) {
    const err = new Error('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET)')
    err.code = 'CLOUDINARY_NOT_CONFIGURED'
    throw err
  }

  const resourceType = resourceTypeForMime(mimeType)
  const ext = path.extname(originalName || filePath).toLowerCase()
  const base = path
    .basename(originalName || filePath, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60) || 'file'
  // Raw files (PDF/Word) keep their extension so they are served with the right content type
  const publicId = `${Date.now()}-${base}${resourceType === 'raw' ? ext : ''}`

  const timestamp = Math.floor(Date.now() / 1000)
  const signed = { folder, public_id: publicId, timestamp }
  const signature = signParams(signed, apiSecret)

  const buffer = await fs.promises.readFile(filePath)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), originalName || base)
  form.append('api_key', apiKey)
  form.append('timestamp', String(timestamp))
  form.append('folder', folder)
  form.append('public_id', publicId)
  form.append('signature', signature)

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`
  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60000),
  })

  let data = null
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!res.ok || !data?.secure_url) {
    const err = new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`)
    err.code = 'CLOUDINARY_UPLOAD_FAILED'
    err.status = res.status
    throw err
  }

  return {
    url: whatsappDeliveryUrl(data),
    secureUrl: data.secure_url,
    publicId: data.public_id,
    resourceType: data.resource_type,
    format: data.format || ext.replace('.', ''),
    bytes: data.bytes,
  }
}
