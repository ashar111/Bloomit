import type { BloomEnv, PagesFunction } from '../../../types'
import {
  configured,
  isString,
  isUuid,
  json,
  options,
  originAllowed,
  parseJson,
  sha256,
  supabaseRequest,
} from '../../_shared'

export const onRequestOptions: PagesFunction<BloomEnv> = ({ request, env }) => options(request, env)

export const onRequestPost: PagesFunction<BloomEnv> = async (context) => {
  const { request, env } = context
  if (!originAllowed(request, env)) return json(request, env, { error: 'Origin is not allowed.' }, 403)
  if (!configured(env)) return json(request, env, { error: 'The secure persistence service is not configured yet.' }, 503)

  const planId = context.params.id
  const body = await parseJson(request)
  const token = body?.accessToken
  const lessonId = body?.lessonId
  if (!isUuid(planId) || !isString(token, 256) || token.length < 30 || !isString(lessonId, 100) || !/^[a-z0-9-]+$/.test(lessonId)) {
    return json(request, env, { error: 'A valid plan, access token and lesson are required.' }, 400)
  }

  const tokenHash = await sha256(token)
  const query = new URLSearchParams({ select: 'id', id: `eq.${planId}`, access_token_hash: `eq.${tokenHash}`, limit: '1' })
  const authorized = await supabaseRequest(env, `/rest/v1/learning_plans?${query.toString()}`)
  if (!authorized.response.ok || !Array.isArray(authorized.body) || !authorized.body[0]) return json(request, env, { error: 'That plan could not be found.' }, 404)

  const progress = await supabaseRequest(env, '/rest/v1/lesson_progress?on_conflict=plan_id,lesson_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ plan_id: planId, lesson_id: lessonId, completed_at: new Date().toISOString() }),
  })
  if (!progress.response.ok) return json(request, env, { error: 'Progress could not be saved.' }, 502)
  return json(request, env, { saved: true, lessonId })
}
