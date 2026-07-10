const API = process.env.NEXT_PUBLIC_API_URL ?? ''

async function post(endpoint: string, file: File | Blob, folder: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)

  const token = typeof window !== 'undefined'
    ? localStorage.getItem('token') ?? sessionStorage.getItem('token')
    : null

  const res = await fetch(`${API}/${endpoint}?folder=${encodeURIComponent(folder)}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.message ?? `Upload failed (${res.status})`)
  }

  const json = await res.json()
  return json.data.url as string
}

export async function uploadImage(file: File | Blob, folder: string): Promise<string> {
  return post('upload/image', file, folder)
}

export async function uploadVideo(file: File | Blob, folder: string): Promise<string> {
  return post('upload/video', file, folder)
}
