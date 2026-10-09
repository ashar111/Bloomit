import type { Challenge, Goal, IntakeData, LearningFormat, LearnerType, Level, SelfAssessment } from '../types'

export const learnerTypes: readonly LearnerType[] = ['school-student', 'university-student', 'job-seeker', 'working-professional', 'parent-guardian', 'other']
export const levels: readonly Level[] = ['complete-beginner', 'basic', 'lower-intermediate', 'intermediate', 'upper-intermediate', 'advanced', 'not-sure']
export const goals: readonly Goal[] = ['confidence', 'everyday', 'fluency', 'pronunciation', 'vocabulary', 'grammar', 'listening', 'workplace', 'interviews', 'presentations', 'academic', 'other-goal']
export const challenges: readonly Challenge[] = ['hesitation', 'translate', 'word-recall', 'pronunciation', 'grammar-mistakes', 'limited-practice', 'application', 'accents', 'nervous', 'generic-courses', 'starting-point', 'routine', 'other-challenge']
export const learningFormats: readonly LearningFormat[] = ['short-lessons', 'guided-practice', 'examples', 'reading', 'quizzes', 'scenarios']
export const timeOptions = ['10-15', '20-30', '30-45', '45-plus'] as const
export const scheduleOptions = ['daily', 'weekdays', 'weekends', 'flexible'] as const
export const paceOptions = ['gradual', 'balanced', 'intensive'] as const
export const assessmentKeys: readonly (keyof SelfAssessment)[] = ['introduction', 'conversation', 'explain', 'discussion']

export interface ValidationResult<T = IntakeData> {
  valid: boolean
  errors: Partial<Record<keyof IntakeData | 'form', string>>
  firstError: string
  data?: T
}

const stepFields: Record<number, readonly (keyof IntakeData)[]> = {
  1: ['name', 'email', 'country', 'learnerType', 'explanationLanguage'],
  2: ['goals', 'success'],
  3: ['challenges', 'challengeDetail'],
  4: ['level', 'selfAssessment'],
  5: ['time', 'schedule', 'formats', 'pace', 'deadline', 'context'],
  6: ['consent', 'marketing'],
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isChoice(value: unknown, choices: readonly string[], allowEmpty = true): boolean {
  return typeof value === 'string' && ((allowEmpty && value === '') || choices.includes(value))
}

export function isStringArray(value: unknown, maxLength = 100): value is string[] {
  return Array.isArray(value) && value.length <= maxLength && value.every((item) => typeof item === 'string')
}

function isChoiceArray(value: unknown, choices: readonly string[]): boolean {
  return isStringArray(value, choices.length) && value.every((item) => choices.includes(item)) && new Set(value).size === value.length
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function inspect(value: unknown, required: boolean, selectedFields?: readonly (keyof IntakeData)[]): ValidationResult {
  const errors: ValidationResult['errors'] = {}
  const result = (): ValidationResult => ({ valid: Object.keys(errors).length === 0, errors, firstError: Object.values(errors)[0] ?? '' })
  if (!isRecord(value)) {
    errors.form = 'Your answers could not be read. Please start again.'
    return result()
  }
  const includes = (key: keyof IntakeData) => !selectedFields || selectedFields.includes(key)
  const error = (key: keyof IntakeData, message: string) => { if (includes(key)) errors[key] = message }
  const strings: Partial<Record<keyof IntakeData, number>> = {
    name: 100, email: 254, country: 100, explanationLanguage: 100,
    success: 4000, challengeDetail: 4000, context: 4000, deadline: 10,
  }
  for (const [key, limit] of Object.entries(strings)) {
    if (typeof value[key] !== 'string' || (value[key] as string).length > limit) {
      error(key as keyof IntakeData, `Use text of ${limit} characters or fewer for ${key}.`)
    }
  }
  const choices: Partial<Record<keyof IntakeData, readonly string[]>> = {
    learnerType: learnerTypes, level: levels, time: timeOptions, schedule: scheduleOptions, pace: paceOptions,
  }
  for (const [key, options] of Object.entries(choices)) {
    if (!isChoice(value[key], options)) error(key as keyof IntakeData, `Choose a valid ${key === 'learnerType' ? 'learner type' : key}.`)
  }
  for (const [key, options] of [['goals', goals], ['challenges', challenges], ['formats', learningFormats]] as const) {
    if (!isChoiceArray(value[key], options)) error(key, `Choose valid ${key} without duplicates.`)
    else if (required && (value[key] as string[]).length === 0) error(key, `Choose at least one ${key === 'formats' ? 'learning format' : key === 'goals' ? 'goal' : 'difficulty'}.`)
  }
  if (!isRecord(value.selfAssessment) || assessmentKeys.some((key) => !isChoice((value.selfAssessment as Record<string, unknown>)[key], ['yes', 'sometimes', 'not-yet']))) {
    error('selfAssessment', 'Choose Yes, Sometimes, Not yet, or leave each optional self-check unanswered.')
  }
  for (const key of ['consent', 'marketing'] as const) {
    if (typeof value[key] !== 'boolean') error(key, 'Use a checked or unchecked consent option.')
  }
  if (typeof value.email === 'string' && value.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
    error('email', 'Enter a valid email address.')
  }
  if (typeof value.deadline === 'string' && value.deadline && !isValidDate(value.deadline)) error('deadline', 'Enter a real target date in YYYY-MM-DD format, or leave it blank.')
  if (required) {
    for (const [key, message] of [
      ['name', 'Add the name you would like us to use.'], ['email', 'Enter a valid email address.'],
      ['country', 'Choose your country or region.'], ['learnerType', 'Choose your learner type.'],
      ['success', 'Describe what success would look like for you.'], ['level', 'Choose your level; “Not sure” is fine.'],
      ['time', 'Choose your available daily study time.'], ['schedule', 'Choose your preferred schedule.'],
      ['pace', 'Choose your preferred pace.'],
    ] as const) {
      if (typeof value[key] !== 'string' || !(value[key] as string).trim()) error(key, message)
    }
    if (value.consent !== true) error('consent', 'Please agree to use your answers to prepare a learning plan.')
  }
  const checked = result()
  if (checked.valid && !selectedFields) {
    // Pick known fields only. Free text is preserved verbatim, not interpreted or rewritten.
    checked.data = Object.fromEntries(Object.values(stepFields).flat().map((key) => [key, value[key]])) as unknown as IntakeData
  }
  return checked
}

/** Validates draft shape without requiring completed answers or consent. */
export function validateIntakeDraft(value: unknown): ValidationResult {
  // Half-typed email/date values are valid draft text and can be resumed safely.
  if (!isRecord(value)) return inspect(value, false)
  const result = inspect({ ...value, email: '', deadline: '' }, false)
  for (const [key, limit] of [['email', 254], ['deadline', 10]] as const) {
    if (typeof value[key] !== 'string' || value[key].length > limit) result.errors[key] = `Use text of ${limit} characters or fewer for ${key}.`
  }
  result.valid = Object.keys(result.errors).length === 0
  result.firstError = Object.values(result.errors)[0] ?? ''
  if (result.valid && result.data) {
    result.data.email = value.email as string
    result.data.deadline = value.deadline as string
  } else delete result.data
  return result
}

/** Validates the entire intake at generation time, regardless of which step is visible. */
export function validateIntake(value: unknown): ValidationResult {
  return inspect(value, true)
}

/** Steps are 1-based; review (step 6) validates the full intake, not only consent. */
export function validateIntakeStep(value: unknown, step: number): ValidationResult {
  if (!Number.isInteger(step) || !stepFields[step]) return { valid: false, errors: { form: 'Choose a valid intake step.' }, firstError: 'Choose a valid intake step.' }
  return step === 6 ? validateIntake(value) : inspect(value, true, stepFields[step])
}

export const validateStep = validateIntakeStep

export class IntakeValidationError extends Error {
  readonly errors: ValidationResult['errors']
  constructor(result: ValidationResult) {
    super(result.firstError || 'Please check your intake answers.')
    this.name = 'IntakeValidationError'
    this.errors = result.errors
  }
}
