import type { BloomEnv, PagesContext } from '../types'

const requestBuckets = new Map<string, { startedAt: number; count: number }>()
const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 8

export function originAllowed(request: Request, env: BloomEnv): boolean {
  const origin = request.headers.get('Origin')
  if (!origin || !env.ALLOWED_ORIGIN) return true
  return origin === env.ALLOWED_ORIGIN
}

export function corsHeaders(request: Request, env: BloomEnv): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  })
  const origin = request.headers.get('Origin')
  if (origin && (!env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }
  return headers
}

export function json(request: Request, env: BloomEnv, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request, env) })
}

export function options(request: Request, env: BloomEnv): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) })
}

export function clientAddress(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown'
}

/** Best-effort per-isolate guard. Cloudflare Turnstile is the stronger optional check. */
export function rateLimited(request: Request): boolean {
  const key = clientAddress(request)
  const now = Date.now()
  const previous = requestBuckets.get(key)
  if (!previous || now - previous.startedAt >= WINDOW_MS) {
    requestBuckets.set(key, { startedAt: now, count: 1 })
    return false
  }
  previous.count += 1
  return previous.count > MAX_REQUESTS_PER_WINDOW
}

export async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function isString(value: unknown, max = 256): value is string {
  return typeof value === 'string' && value.length <= max
}

export function isRequestId(value: unknown): value is string {
  return isString(value, 80) && /^[a-zA-Z0-9_-]{16,80}$/.test(value)
}

export function isUuid(value: unknown): value is string {
  return isString(value, 40) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function createAccessToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function supabaseRequest(env: BloomEnv, path: string, init: RequestInit = {}): Promise<{ response: Response; body: unknown }> {
  const headers = new Headers(init.headers)
  headers.set('apikey', env.SUPABASE_SERVICE_ROLE_KEY)
  headers.set('Authorization', `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`)
  headers.set('Content-Type', 'application/json')
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}${path}`, { ...init, headers })
  let body: unknown = null
  try { body = await response.json() } catch { /* response may have no JSON body */ }
  return { response, body }
}

export function configured(env: BloomEnv): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function turnstilePassed(request: Request, env: BloomEnv, token: unknown): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true
  if (!isString(token, 2048) || !token) return false
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token })
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  if (!result.ok) return false
  const body = await result.json() as { success?: boolean }
  return body.success === true
}

export function pathParam(context: PagesContext, key: string): string | undefined {
  return context.params[key]
}
