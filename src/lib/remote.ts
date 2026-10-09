import type { IntakeData, LearningPlan } from '../types'

export interface RemotePlanRef {
  planId: string
  accessToken: string
}

interface CreatePlanResponse {
  plan?: LearningPlan
  planId?: string
  accessToken?: string
  error?: string
}

interface GetPlanResponse {
  plan?: LearningPlan
  planId?: string
  completedLessons?: string[]
  error?: string
}

const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''
export const API_BASE_URL = configuredBase.replace(/\/$/, '')

export function remotePersistenceConfigured(): boolean {
  return API_BASE_URL.length > 0
}

function endpoint(path: string): string {
  return `${API_BASE_URL}${path}`
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'The secure persistence service could not complete that request.')
  return body
}

function requestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function createRemotePlan(intake: IntakeData): Promise<{ plan: LearningPlan; ref: RemotePlanRef }> {
  const response = await fetch(endpoint('/create-plan'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Bloom-It' },
    body: JSON.stringify({ requestId: requestId(), intake, website: '' }),
  })
  const body = await responseBody<CreatePlanResponse>(response)
  if (!body.plan || !body.planId || !body.accessToken) throw new Error('The secure service returned an incomplete plan response.')
  return { plan: body.plan, ref: { planId: body.planId, accessToken: body.accessToken } }
}

export async function getRemotePlan(ref: RemotePlanRef): Promise<{ plan: LearningPlan; completedLessons: string[] }> {
  const query = new URLSearchParams({ token: ref.accessToken })
  const response = await fetch(endpoint(`/plan/${encodeURIComponent(ref.planId)}?${query.toString()}`), { headers: { 'X-Requested-With': 'Bloom-It' } })
  const body = await responseBody<GetPlanResponse>(response)
  if (!body.plan) throw new Error('The saved plan was not returned.')
  return { plan: body.plan, completedLessons: body.completedLessons ?? [] }
}

export async function markRemoteLessonComplete(ref: RemotePlanRef, lessonId: string): Promise<void> {
  const response = await fetch(endpoint(`/plan/${encodeURIComponent(ref.planId)}/progress`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Bloom-It' },
    body: JSON.stringify({ accessToken: ref.accessToken, lessonId }),
  })
  await responseBody<{ saved?: boolean; error?: string }>(response)
}

export function readRemotePlanRef(): RemotePlanRef | null {
  try {
    const raw = window.localStorage.getItem('bloom-it-remote-plan')
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<RemotePlanRef>
    return typeof value.planId === 'string' && typeof value.accessToken === 'string' ? { planId: value.planId, accessToken: value.accessToken } : null
  } catch {
    return null
  }
}

export function writeRemotePlanRef(ref: RemotePlanRef | null): void {
  try {
    if (ref) window.localStorage.setItem('bloom-it-remote-plan', JSON.stringify(ref))
    else window.localStorage.removeItem('bloom-it-remote-plan')
  } catch {
    // The browser persistence layer may be unavailable; the current page still works.
  }
}
