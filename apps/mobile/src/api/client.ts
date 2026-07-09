import Constants from 'expo-constants'

const BASE = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3001/api/v1'

export const API_BASE = BASE

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: { message: string; code: string; statusCode: number }
  timestamp: string
}

let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const { headers: extraHeaders, ...rest } = options ?? {}

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(extraHeaders ?? {}),
    },
  })

  if (res.status === 401) {
    onUnauthorized?.()
  }

  const json: ApiResponse<T> = await res.json()

  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? (json as any).message ?? 'Request failed')
  }

  return json.data as T
}

export const apiGet = <T = any>(path: string) => apiFetch<T>(path)
export const apiPost = <T = any>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined })
export const apiPatch = <T = any>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined })
export const apiDelete = <T = any>(path: string) => apiFetch<T>(path, { method: 'DELETE' })
