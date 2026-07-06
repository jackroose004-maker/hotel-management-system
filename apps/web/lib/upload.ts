const CLOUD  = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!

/**
 * Upload a File or Blob directly to Cloudinary (unsigned preset).
 *
 * Folder structure:
 *   almanzil/logo/logo
 *   almanzil/menu/{item-id}
 *   almanzil/qr/table-{table-id}
 *
 * Returns the CDN secure_url.
 */
export async function uploadImage(
  file: File | Blob,
  folder: string,
  publicId?: string,
): Promise<string> {
  if (!CLOUD || !PRESET) throw new Error('Cloudinary env vars not set')

  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', PRESET)
  fd.append('folder', folder)
  if (publicId) fd.append('public_id', publicId)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? 'Cloudinary upload failed')
  }
  const json = await res.json()
  return json.secure_url as string
}

export async function uploadVideo(
  file: File | Blob,
  folder: string,
): Promise<string> {
  if (!CLOUD || !PRESET) throw new Error('Cloudinary env vars not set')

  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', PRESET)
  fd.append('folder', folder)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? 'Cloudinary video upload failed')
  }
  const json = await res.json()
  return json.secure_url as string
}
