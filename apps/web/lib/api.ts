const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: { message: string; code: string; statusCode: number }
  timestamp: string
}

export async function apiFetch<T = any>(
  path: string,
  options?: RequestInit & { token?: string },
): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = options ?? {}

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extraHeaders ?? {}),
    },
  })

  const json: ApiResponse<T> = await res.json()

  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? 'Request failed')
  }

  return json.data as T
}

export const API_BASE = BASE

// Backwards-compat shim for files that still use the old axios default import
// These pages use: api.get('/path').then(r => r.data)
// The shim wraps apiFetch to mimic that shape
const api = {
  get: (path: string, config?: { headers?: Record<string, string> }) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? undefined : undefined
    return apiFetch(path, { token, headers: config?.headers }).then(data => ({ data }))
  },
  post: (path: string, body?: any, config?: { headers?: Record<string, string> }) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? undefined : undefined
    return apiFetch(path, { method: 'POST', body: JSON.stringify(body), token, headers: config?.headers }).then(data => ({ data }))
  },
  patch: (path: string, body?: any, config?: { headers?: Record<string, string> }) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? undefined : undefined
    return apiFetch(path, { method: 'PATCH', body: JSON.stringify(body), token, headers: config?.headers }).then(data => ({ data }))
  },
  delete: (path: string, config?: { headers?: Record<string, string> }) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') ?? undefined : undefined
    return apiFetch(path, { method: 'DELETE', token, headers: config?.headers }).then(data => ({ data }))
  },
}

export default api
