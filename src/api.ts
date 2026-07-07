/** Thin client over the Gwanggo public /v1 API. */
import { API_URL, getKey } from './config.js'

export class GwanggoError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) }
  if (init?.auth !== false) {
    const key = getKey()
    if (!key) {
      throw new GwanggoError(
        401,
        'No API key. Run `gwanggo-mcp login`, or set GWANGGO_API_KEY. Keys: https://gwanggo.jocoding.io/dashboard/api-keys'
      )
    }
    headers['Authorization'] = `Bearer ${key}`
  }
  if (init?.body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers })
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new GwanggoError(res.status, text.slice(0, 200) || `HTTP ${res.status}`)
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } }).error
    throw new GwanggoError(res.status, err?.message || `HTTP ${res.status}`, err?.code)
  }
  return json as T
}

// ---------- types ----------
export interface Model {
  slug: string
  name: string
  type: 'image' | 'video'
  creator?: string
  credit_config?: Record<string, unknown>
  form_config?: { fields?: Array<Record<string, unknown>> }
  is_coming_soon?: boolean
}

export interface Task {
  id: string
  type: string
  model: string
  status: 'PENDING' | 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  result_url?: string
  thumbnail_url?: string
  error?: string
  credits_used: number
}

// ---------- endpoints ----------
export const listModels = () => request<{ models: Model[] }>('/models', { auth: false })
export const me = () => request<{ id: string; email: string; credits: number }>('/me')
export const getTask = (id: string) => request<Task>(`/tasks/${id}`)

export const generate = (kind: 'image' | 'video', body: Record<string, unknown>) =>
  request<{ id: string; task_id: string; credits_used: number }>(`/generate/${kind}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export async function pollTask(id: string, timeoutMs: number, onTick?: (t: Task) => void): Promise<Task> {
  const start = Date.now()
  let delay = 2000
  for (;;) {
    const task = await getTask(id)
    onTick?.(task)
    if (task.status === 'COMPLETED' || task.status === 'FAILED') return task
    if (Date.now() - start > timeoutMs) return task
    await new Promise((r) => setTimeout(r, delay))
    delay = Math.min(delay * 1.3, 8000)
  }
}

// ---------- device flow ----------
export interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

export const startDeviceFlow = () =>
  request<DeviceCode>('/auth/device', { method: 'POST', body: JSON.stringify({}), auth: false })

export async function pollDeviceToken(deviceCode: string, intervalSec: number, expiresInSec: number): Promise<string> {
  const deadline = Date.now() + expiresInSec * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, Math.max(intervalSec, 3) * 1000))
    try {
      const res = await request<{ access_token?: string }>('/auth/token', {
        method: 'POST',
        body: JSON.stringify({ device_code: deviceCode }),
        auth: false,
      })
      if (res.access_token) return res.access_token
    } catch (e) {
      const err = e as GwanggoError
      if (err.code === 'authorization_pending') continue
      throw e // access_denied / expired_token / 그 외
    }
  }
  throw new GwanggoError(408, 'Device authorization timed out — run login again.')
}
