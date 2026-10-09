import { modules } from '../data/modules'
import { validateIntake, IntakeValidationError, isValidDate } from './validation'
export { IntakeValidationError } from './validation'
import type {
  Challenge, Goal, IntakeData, LearningPlan, Module, PersonalizationProvider, PlanGenerationOptions,
  Recommendation, TextSignal,
} from '../types'

export const timeMinutes: Record<Exclude<IntakeData['time'], ''>, number> = {
  '10-15': 12,
  '20-30': 25,
  '30-45': 37,
  '45-plus': 50,
}

export const sessionsPerWeek: Record<Exclude<IntakeData['schedule'], ''>, number> = {
  daily: 7,
  weekdays: 5,
  weekends: 2,
  flexible: 3,
}

const labels: Record<string, string> = {
  confidence: 'speaking confidence', everyday: 'everyday conversation', fluency: 'fluency', pronunciation: 'pronunciation and clarity',
  vocabulary: 'vocabulary in context', grammar: 'sentence formation', listening: 'listening comprehension', workplace: 'workplace communication',
  interviews: 'interview preparation', presentations: 'presentations', academic: 'academic communication', 'other-goal': 'a personal English goal',
  hesitation: 'hesitation', translate: 'translating before speaking', 'word-recall': 'finding words quickly', 'grammar-mistakes': 'grammar accuracy',
  'limited-practice': 'limited practice opportunities', application: 'applying lessons in real conversations', accents: 'different accents', nervous: 'nerves around mistakes',
  'generic-courses': 'generic course paths', 'starting-point': 'knowing where to start', routine: 'keeping a regular routine',
  'other-challenge': 'another difficulty',
}

const levelOrder = ['complete-beginner', 'basic', 'lower-intermediate', 'intermediate', 'upper-intermediate', 'advanced', 'not-sure'] as const

function overlap<T extends string>(left: T[], right: T[]) {
  return left.filter((item) => right.includes(item)).length
}

function levelScore(module: Module, intake: IntakeData) {
  if (!intake.level) return 0.5
  if (module.levels.includes(intake.level)) return 2
  const requested = levelOrder.indexOf(intake.level)
  const distances = module.levels.map((level) => Math.abs(levelOrder.indexOf(level) - requested)).filter((distance) => distance >= 0)
  const closest = distances.length ? Math.min(...distances) : 99
  return closest === 1 ? 0.5 : -1
}

interface PhraseDefinition {
  phrase: string
  label: string
  goal?: Goal
  challenge?: Challenge
}

/** Deliberately small, visible phrase rules. This is not semantic free-text understanding. */
const phraseDefinitions: readonly PhraseDefinition[] = [
  { phrase: 'job interview', label: 'an interview', goal: 'interviews' },
  { phrase: 'interview', label: 'an interview', goal: 'interviews' },
  { phrase: 'public speaking', label: 'public speaking', goal: 'presentations' },
  { phrase: 'presentation', label: 'a presentation', goal: 'presentations' },
  { phrase: 'meeting', label: 'a meeting', goal: 'workplace' },
  { phrase: 'workplace', label: 'the workplace', goal: 'workplace' },
  { phrase: 'everyday conversation', label: 'an everyday conversation', goal: 'everyday' },
  { phrase: 'translate', label: 'translating', challenge: 'translate' },
  { phrase: 'hesitate', label: 'hesitation', challenge: 'hesitation' },
  { phrase: 'freeze', label: 'freezing while speaking', challenge: 'hesitation' },
  { phrase: 'pronunciation', label: 'pronunciation', goal: 'pronunciation', challenge: 'pronunciation' },
  { phrase: 'accent', label: 'accents', challenge: 'accents' },
]

function textSignals(intake: IntakeData): TextSignal[] {
  const sources = [
    ['success', intake.success],
    ['challengeDetail', intake.challengeDetail],
    ['context', intake.context],
  ] as const
  const found: TextSignal[] = []
  for (const [source, text] of sources) {
    const lower = text.toLocaleLowerCase()
    for (const definition of phraseDefinitions) {
      const index = lower.indexOf(definition.phrase)
      if (index < 0) continue
      const phrase = text.slice(index, index + definition.phrase.length)
      if (found.some((signal) => signal.source === source && (signal.id === definition.phrase || signal.id.includes(definition.phrase) || definition.phrase.includes(signal.id)))) continue
      found.push({ id: definition.phrase, label: definition.label, source, phrase, goal: definition.goal, challenge: definition.challenge })
    }
  }
  return found
}

function reasonFor(module: Module, intake: IntakeData, signals: TextSignal[]) {
  const matches = [...intake.goals, ...intake.challenges]
    .filter((item) => module.goals.includes(item as Goal) || module.challenges.includes(item as Challenge))
    .slice(0, 2)
    .map((item) => labels[item] ?? item)
  const signalMatch = signals.find((signal) => (signal.goal && module.goals.includes(signal.goal)) || (signal.challenge && module.challenges.includes(signal.challenge)))
  if (matches.length && signalMatch) return `Recommended because you mentioned ${matches.join(' and ')}; “${signalMatch.phrase}” was also recognised as a matching phrase.`
  if (matches.length) return `Recommended because you mentioned ${matches.join(' and ')}.`
  if (signalMatch) return `Recommended because the phrase “${signalMatch.phrase}” matches this module's structured focus.`
  if (intake.level === 'complete-beginner' || intake.level === 'not-sure') return 'A supportive starting point that builds a foundation for your next steps.'
  if (intake.time === '10-15') return 'A focused practice block that fits a shorter study window.'
  return 'A balanced module to round out your personalised path.'
}

function domainScore(module: Module, intake: IntakeData) {
  let score = 0
  if (intake.goals.includes('interviews') && module.id === 'interview-stories') score += 9
  if (intake.goals.includes('presentations') && module.id === 'present-with-purpose') score += 9
  if (intake.goals.includes('workplace') && module.id === 'workplace-conversations') score += 7
  if (intake.goals.includes('everyday') && ['speaking-foundation', 'sentence-patterns', 'vocabulary-in-context', 'listening-signals'].includes(module.id)) score += 3
  if (intake.goals.includes('academic') && ['vocabulary-in-context', 'listening-signals', 'present-with-purpose'].includes(module.id)) score += 3
  if (intake.learnerType === 'job-seeker' && module.id === 'interview-stories') score += 5
  if (intake.learnerType === 'working-professional' && ['workplace-conversations', 'present-with-purpose'].includes(module.id)) score += 3
  return score
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function addUnique<T>(items: T[], item: T) {
  if (!items.includes(item)) items.push(item)
}

function orderedSelection(intake: IntakeData, signals: TextSignal[], scored: { module: Module; score: number; index: number }[]) {
  const chosen: Module[] = []
  const chosenIds = new Set<string>()
  const byId = new Map(modules.map((module) => [module.id, module]))
  const collect = (module: Module, result: Module[], visiting = new Set<string>()) => {
    if (visiting.has(module.id) || result.some((item) => item.id === module.id) || chosenIds.has(module.id)) return
    visiting.add(module.id)
    for (const prerequisiteId of module.prerequisiteIds ?? []) {
      const prerequisite = byId.get(prerequisiteId)
      if (prerequisite) collect(prerequisite, result, visiting)
    }
    visiting.delete(module.id)
    addUnique(result, module)
  }
  const tryAdd = (module: Module) => {
    const closure: Module[] = []
    collect(module, closure)
    if (closure.length && chosen.length + closure.length <= 5) {
      for (const item of closure) {
        chosen.push(item)
        chosenIds.add(item.id)
      }
      return true
    }
    return false
  }

  // Foundations are explicit for beginners, before any specialised match.
  if (intake.level === 'complete-beginner' || intake.level === 'not-sure') {
    for (const id of ['speaking-foundation', 'sentence-patterns']) {
      const module = byId.get(id)
      if (module) tryAdd(module)
    }
  }
  for (const item of scored) {
    if (chosen.length >= 5) break
    tryAdd(item.module)
  }
  // A full path is preferable, but never let a support module displace a domain path.
  if (chosen.length < 5) {
    const support = byId.get('weekly-recall')
    if (support) tryAdd(support)
  }
  if (chosen.length < 5) {
    for (const item of scored) {
      if (chosen.length >= 5) break
      if (!chosenIds.has(item.module.id)) {
        chosen.push(item.module)
        chosenIds.add(item.module.id)
      }
    }
  }
  return chosen
}

function targetDateAssumption(intake: IntakeData, now: Date): string | null {
  if (!intake.deadline || !isValidDate(intake.deadline)) return null
  const target = new Date(`${intake.deadline}T00:00:00.000Z`)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return `Your target date (${intake.deadline}) has passed, so it does not change this plan's workload estimate.`
  return `Your target date (${intake.deadline}) is about ${days} days away. It is used as context only; it does not promise a proficiency outcome.`
}

function practiceSuggestion(signals: TextSignal[], firstModule: Module | undefined): string {
  if (signals.length && firstModule) {
    const signal = signals[0]
    return `Use “${signal.phrase}” as the prompt for a ${firstModule.estimatedMinutes}-minute ${firstModule.title.toLocaleLowerCase()} practice, then write or say one example from your own situation.`
  }
  return 'Your written context is preserved below. Choose a module and adapt its practice to that context; this rules-based engine does not infer meaning from free text.'
}

export function generatePlan(intake: IntakeData, options: PlanGenerationOptions = {}): LearningPlan {
  const validation = validateIntake(intake)
  if (!validation.valid) throw new IntakeValidationError(validation)
  const now = options.now ?? new Date()
  const signals = textSignals(intake)
  const scored = modules.map((module, index) => {
    let score = 0
    score += overlap(module.goals, intake.goals) * 5
    score += overlap(module.challenges, intake.challenges) * 4
    score += overlap(module.formats, intake.formats) * 1.5
    score += levelScore(module, intake)
    score += domainScore(module, intake)
    score += signals.reduce((sum, signal) => sum + (signal.goal && module.goals.includes(signal.goal) ? 2 : 0) + (signal.challenge && module.challenges.includes(signal.challenge) ? 2 : 0), 0)
    if (intake.time === '10-15' && module.estimatedMinutes <= 20) score += 2
    if (intake.time === '45-plus' && module.estimatedMinutes >= 30) score += 1
    if (intake.pace === 'gradual' && module.estimatedMinutes <= 25) score += 1
    if (intake.pace === 'intensive' && module.estimatedMinutes >= 30) score += 1
    return { module, score, index }
  })
  scored.sort((left, right) => right.score - left.score || left.module.estimatedMinutes - right.module.estimatedMinutes || left.index - right.index)
  const chosen = orderedSelection(intake, signals, scored)
  const recommendations: Recommendation[] = chosen.slice(0, 5).map((module) => ({
    ...module,
    score: scored.find((entry) => entry.module.id === module.id)?.score ?? 0,
    reason: reasonFor(module, intake, signals),
  }))

  const priorities = intake.goals.slice(0, 3).map((goal) => labels[goal]).filter(Boolean)
  const challengeLabels = intake.challenges.slice(0, 2).map((challenge) => labels[challenge]).filter(Boolean)
  const focus = priorities.length ? priorities : ['clear, confident communication']
  const learnerName = intake.name.trim() || 'learner'
  if (!intake.time || !intake.schedule) throw new IntakeValidationError({ valid: false, errors: { form: 'Choose a daily time and schedule.' }, firstError: 'Choose a daily time and schedule.' })
  const sessionMinutes = timeMinutes[intake.time]
  const sessions = sessionsPerWeek[intake.schedule]
  const weeklyMinutes = sessionMinutes * sessions
  const totalEstimatedMinutes = recommendations.reduce((sum, module) => sum + module.estimatedMinutes, 0)
  const estimatedSessions = Math.ceil(totalEstimatedMinutes / sessionMinutes)
  const estimatedWeeks = Math.ceil(totalEstimatedMinutes / weeklyMinutes)
  const scheduleLabel = intake.schedule === 'daily' ? 'daily' : intake.schedule === 'weekdays' ? 'weekday' : intake.schedule === 'weekends' ? 'weekend' : 'flexible'
  const summary = challengeLabels.length
    ? `A practical English path for ${learnerName}, centred on ${focus.join(', ')} and designed around ${challengeLabels.join(' and ')}.`
    : `A practical English path for ${learnerName}, centred on ${focus.join(', ')} and paced for steady progress.`
  const assumptions = [
    `This path uses your self-described ${intake.level || 'starting'} level; the optional self-check is not a formal proficiency assessment.`,
    `The local Bloom It engine matches structured answers and a small set of recognised phrases. It does not use an LLM or pretend to understand free text semantically.`,
    `The ${intake.time}-minute daily estimate uses a ${sessionMinutes}-minute midpoint across ${sessions} ${scheduleLabel} sessions (${weeklyMinutes} minutes per week).`,
    `${totalEstimatedMinutes} minutes is the estimated time for the recommended modules (about ${estimatedSessions} sessions or ${estimatedWeeks} weeks at this rhythm); it is not a promise of an outcome.`,
    `Explanations and lessons are currently available in English only${intake.explanationLanguage && intake.explanationLanguage !== 'English' ? `; ${intake.explanationLanguage} was noted as a preference but is not available yet` : ''}.`,
  ]
  const deadlineAssumption = targetDateAssumption(intake, now)
  if (deadlineAssumption) assumptions.push(deadlineAssumption)
  return {
    id: `path-${stableHash(JSON.stringify({ ...intake, signals: signals.map((signal) => [signal.source, signal.id]) }))}`,
    createdAt: now.toISOString(),
    learnerName,
    summary,
    priorities: focus,
    weeklyMinutes,
    weeklyPlan: `${sessions} ${scheduleLabel} session${sessions === 1 ? '' : 's'} × ${sessionMinutes} minutes = ${weeklyMinutes} minutes per week; complete about ${estimatedSessions} sessions for this path's module time.`,
    assumptions,
    modules: recommendations,
    provider: { id: 'local-rules', version: '2' },
    startingLevel: intake.level || undefined,
    sessionMinutes,
    sessionsPerWeek: sessions,
    totalEstimatedMinutes,
    estimatedSessions,
    estimatedWeeks,
    matchedSignals: signals,
    learnerContext: {
      success: intake.success,
      challengeDetail: intake.challengeDetail,
      context: intake.context,
      practiceSuggestion: practiceSuggestion(signals, recommendations[0]),
    },
  }
}

export const localPersonalizationProvider: PersonalizationProvider = {
  id: 'local-rules',
  version: '2',
  generatePlan,
}

export const defaultPersonalizationProvider = localPersonalizationProvider
export const generateLocalPlan = generatePlan

export function blankIntake(): IntakeData {
  return {
    name: '', email: '', country: '', learnerType: '', explanationLanguage: 'English', goals: [], success: '', challenges: [], challengeDetail: '', level: '',
    selfAssessment: { introduction: 'sometimes', conversation: 'sometimes', explain: '', discussion: '' },
    time: '', schedule: '', formats: [], pace: '', deadline: '', context: '', consent: false, marketing: false,
  }
}
