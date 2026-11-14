// Photo + location for a Field Sales visit. The attachment is MANDATORY and carries its own proof: the device's position is read when the photo is chosen,
// and the time (IST) and the coordinates are burned into the bottom of the image, which is also resized (longest side 1600 px) and re-encoded as JPEG, so a
// phone photo of several MB uploads as a few hundred kB. The same coordinates travel with the visit (geo_lat / geo_lng / geo_accuracy_m) and the server adds its
// own stamp (stamped_at). If the browser cannot decode the image (an exotic format) the ORIGINAL is uploaded unstamped, when it is an ordinary JPEG / PNG / WebP.
export const MAX_EDGE = 1600
export const MAX_BYTES = 10 * 1024 * 1024 // the bucket's limit
const ORDINARY = /^image\/(jpeg|png|webp)$/

export class PhotoError extends Error {}

// → { lat, lng, accuracy } (accuracy in metres). Rejects with a PhotoError whose message says what to do.
export function getPosition({ timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new PhotoError("This device can't share its location, so a visit can't be recorded from it."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => {
        const msg =
          err.code === 1
            ? 'Location is switched off for this site. Allow it in the browser settings, then tap Retry.'
            : err.code === 3
              ? 'Getting your location took too long. Move to an open area if you can, then tap Retry.'
              : "Your location isn't available right now. Check that location is on, then tap Retry."
        reject(new PhotoError(msg))
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

// "14 Nov 2026, 3:42 pm IST · 19.07612, 72.87771 (±12 m)"
export function stampText(at, pos) {
  const when = new Date(at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const acc = Number.isFinite(pos.accuracy) ? ` (±${Math.round(pos.accuracy)} m)` : ''
  return `${when} IST · ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}${acc}`
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fall through to an <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

// → { blob, stamped }. `at` is the moment of capture.
export async function stampPhoto(file, pos, at = new Date()) {
  if (!file || !String(file.type).startsWith('image/')) throw new PhotoError('Choose a photo (an image file).')
  let bitmap
  try {
    bitmap = await decode(file)
  } catch {
    if (ORDINARY.test(file.type) && file.size <= MAX_BYTES) return { blob: file, stamped: false }
    throw new PhotoError("This image can't be read. Take a photo with the camera, or choose a JPEG or PNG.")
  }
  const w0 = bitmap.width
  const h0 = bitmap.height
  const k = Math.min(1, MAX_EDGE / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * k))
  const h = Math.max(1, Math.round(h0 * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const size = Math.max(13, Math.round(w / 38))
  const pad = Math.round(size * 0.6)
  const bar = size + pad * 2
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, h - bar, w, bar)
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 ${size}px sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(stampText(at, pos), pad, h - bar / 2, w - pad * 2)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  if (!blob) throw new PhotoError("This image couldn't be prepared. Try another photo.")
  if (blob.size > MAX_BYTES) throw new PhotoError('The photo is too large (10 MB at most).')
  return { blob, stamped: true }
}
