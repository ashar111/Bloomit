import type { BloomEnv, PagesFunction } from '../../types'
import {
  configured,
  isString,
  isUuid,
  json,
  options,
  originAllowed,
  pathParam,
  sha256,
  supabaseRequest,
} from '../_shared'

export const onRequestOptions: PagesFunction<BloomEnv> = ({ request, env }) => options(request, env)

export const onRequestGet: PagesFunction<BloomEnv> = async (context) => {
  const { request, env } = context
  if (!originAllowed(request, env)) return json(request, env, { error: 'Origin is not allowed.' }, 403)
  if (!configured(env)) return json(request, env, { error: 'The secure persistence service is not configured yet.' }, 503)

  const planId = pathParam(context, 'id')
  const token = new URL(request.url).searchParams.get('token')
  if (!isUuid(planId) || !isString(token, 256) || token.length < 30) return json(request, env, { error: 'A valid plan id and access token are required.' }, 400)

  const tokenHash = await sha256(token)
  const query = new URLSearchParams({ select: 'id,plan,created_at', id: `eq.${planId}`, access_token_hash: `eq.${tokenHash}`, limit: '1' })
  const saved = await supabaseRequest(env, `/rest/v1/learning_plans?${query.toString()}`)
  if (!saved.response.ok || !Array.isArray(saved.body) || !saved.body[0]) return json(request, env, { error: 'That plan could not be found.' }, 404)

  const row = saved.body[0] as { id: string; plan: unknown; created_at: string }
  const progressQuery = new URLSearchParams({ select: 'lesson_id,completed_at', plan_id: `eq.${row.id}` })
  const progress = await supabaseRequest(env, `/rest/v1/lesson_progress?${progressQuery.toString()}`)
  const completedLessons = progress.response.ok && Array.isArray(progress.body)
    ? progress.body.map((item) => (typeof item === 'object' && item !== null && 'lesson_id' in item ? item.lesson_id : null)).filter((item): item is string => typeof item === 'string')
    : []

  return json(request, env, { plan: row.plan, planId: row.id, completedLessons, persistence: 'supabase' })
}
