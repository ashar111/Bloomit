import { generatePlan } from '../../src/lib/personalization'
import { validateIntake } from '../../src/lib/validation'
import type { IntakeData } from '../../src/types'
import type { BloomEnv, PagesFunction } from '../types'
import {
  configured,
  createAccessToken,
  isRequestId,
  json,
  options,
  originAllowed,
  parseJson,
  rateLimited,
  sha256,
  supabaseRequest,
  turnstilePassed,
} from './_shared'

export const onRequestOptions: PagesFunction<BloomEnv> = ({ request, env }) => options(request, env)

export const onRequestPost: PagesFunction<BloomEnv> = async ({ request, env }) => {
  if (!originAllowed(request, env)) return json(request, env, { error: 'Origin is not allowed.' }, 403)
  if (rateLimited(request)) return json(request, env, { error: 'Please wait a moment before trying again.' }, 429)
  if (!configured(env)) return json(request, env, { error: 'The secure persistence service is not configured yet.' }, 503)

  const body = await parseJson(request)
  if (!body || !isRequestId(body.requestId)) return json(request, env, { error: 'A valid submission request id is required.' }, 400)
  if (typeof body.website === 'string' && body.website.trim()) return json(request, env, { error: 'Submission rejected.' }, 400)
  if (!(await turnstilePassed(request, env, body.turnstileToken))) return json(request, env, { error: 'Please complete the anti-spam check and try again.' }, 400)

  const intake = body.intake as IntakeData
  const validation = validateIntake(intake)
  if (!validation.valid) return json(request, env, { error: validation.firstError, fields: validation.errors }, 422)

  let plan
  try {
    plan = generatePlan(intake, { now: new Date() })
  } catch {
    return json(request, env, { error: 'We could not create a plan from those answers. Please review the form and try again.' }, 422)
  }

  const accessToken = createAccessToken()
  const { name, email, country, ...intakeWithoutProfile } = intake
  const { response, body: result } = await supabaseRequest(env, '/rest/v1/rpc/create_learning_submission', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      p_request_id: body.requestId,
      p_access_token_hash: await sha256(accessToken),
      p_profile: { full_name: name, email, country, learner_type: intake.learnerType, explanation_language: intake.explanationLanguage },
      p_intake: intakeWithoutProfile,
      p_plan: plan,
      p_consent_at: new Date().toISOString(),
      p_marketing_consent: intake.marketing,
    }),
  })

  if (!response.ok) {
    const duplicate = typeof result === 'object' && result !== null && JSON.stringify(result).toLowerCase().includes('duplicate_request_id')
    return json(request, env, { error: duplicate ? 'This submission was already received. Please start a new path if you want to revise it.' : 'Your plan could not be saved. Please try again.' }, duplicate ? 409 : 502)
  }

  const saved = Array.isArray(result) ? result[0] : result
  const planId = typeof saved === 'object' && saved !== null && 'plan_id' in saved ? saved.plan_id : undefined
  if (typeof planId !== 'string') return json(request, env, { error: 'The plan was generated but its saved id was not returned.' }, 502)

  return json(request, env, {
    plan,
    planId,
    accessToken,
    persistence: 'supabase',
    message: 'Your plan was created and saved securely for this browser session.',
  })
}
