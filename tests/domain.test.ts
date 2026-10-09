import assert from 'node:assert/strict'
import test from 'node:test'
import { blankIntake, generatePlan, IntakeValidationError } from '../src/lib/personalization'
import { createBloomPersistence, createValidatedStore, type StorageLike } from '../src/lib/persistence'
import { validateIntake, validateIntakeStep } from '../src/lib/validation'
import type { IntakeData } from '../src/types'

function completeIntake(overrides: Partial<IntakeData> = {}): IntakeData {
  return {
    ...blankIntake(),
    name: 'Sam', email: 'sam@example.com', country: 'US', learnerType: 'other',
    goals: ['everyday'], success: 'I want everyday conversations to feel easier.',
    challenges: ['hesitation'], level: 'intermediate', time: '20-30', schedule: 'weekdays',
    formats: ['guided-practice', 'scenarios'], pace: 'balanced', consent: true,
    ...overrides,
  }
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

test('profile matching is deterministic and materially diverges by purpose', () => {
  const base = completeIntake({ level: 'intermediate', challenges: ['nervous'] })
  const career = generatePlan({ ...base, learnerType: 'job-seeker', goals: ['interviews'] }, { now: new Date('2025-01-01T00:00:00Z') })
  const presenter = generatePlan({ ...base, learnerType: 'working-professional', goals: ['presentations'] }, { now: new Date('2025-01-01T00:00:00Z') })
  const everyday = generatePlan({ ...base, learnerType: 'other', goals: ['everyday'], challenges: ['word-recall'] }, { now: new Date('2025-01-01T00:00:00Z') })
  assert.ok(career.modules.some((module) => module.id === 'interview-stories'))
  assert.ok(presenter.modules.some((module) => module.id === 'present-with-purpose'))
  assert.ok(!everyday.modules.some((module) => module.id === 'interview-stories' || module.id === 'present-with-purpose'))
  assert.notDeepEqual(career.modules.map((module) => module.id), presenter.modules.map((module) => module.id))
  const later = generatePlan({ ...base, learnerType: 'job-seeker', goals: ['interviews'] }, { now: new Date('2026-04-01T00:00:00Z') })
  assert.equal(career.id, later.id)
  assert.deepEqual(career.modules.map((module) => module.id), later.modules.map((module) => module.id))
})

test('beginner plans place foundations before dependent modules', () => {
  const plan = generatePlan(completeIntake({ level: 'complete-beginner', goals: ['workplace'], learnerType: 'working-professional' }), { now: new Date('2025-01-01T00:00:00Z') })
  const sentence = plan.modules.findIndex((module) => module.id === 'sentence-patterns')
  const workplace = plan.modules.findIndex((module) => module.id === 'workplace-conversations')
  assert.ok(sentence >= 0)
  if (workplace >= 0) assert.ok(sentence < workplace)
  assert.equal(new Set(plan.modules.map((module) => module.id)).size, plan.modules.length)
})

test('workload uses the selected daily midpoint and schedule frequency', () => {
  const plan = generatePlan(completeIntake({ time: '10-15', schedule: 'weekends' }), { now: new Date('2025-01-01T00:00:00Z') })
  assert.equal(plan.sessionMinutes, 12)
  assert.equal(plan.sessionsPerWeek, 2)
  assert.equal(plan.weeklyMinutes, 24)
  assert.match(plan.weeklyPlan, /2 weekend sessions × 12 minutes = 24 minutes/)
  assert.equal(plan.estimatedSessions, Math.ceil((plan.totalEstimatedMinutes ?? 0) / 12))
})

test('full and step validation reject incomplete or malformed answers', () => {
  const draft = blankIntake()
  assert.equal(validateIntake(draft).valid, false)
  assert.equal(validateIntakeStep(draft, 1).valid, false)
  assert.equal(validateIntakeStep({ ...draft, name: 'Sam', email: 'bad', country: 'US', learnerType: 'other' }, 1).valid, false)
  assert.throws(() => generatePlan(draft), IntakeValidationError)
  assert.equal(validateIntakeStep(completeIntake(), 6).valid, true)
})

test('free text is preserved and only selected phrases become transparent signals', () => {
  const success = 'I need to speak in a job interview; please keep this exact punctuation!'
  const detail = 'I sometimes freeze, and I have tried apps before.'
  const context = 'My own context: Monday meeting with my team.'
  const plan = generatePlan(completeIntake({ success, challengeDetail: detail, context }), { now: new Date('2025-01-01T00:00:00Z') })
  assert.equal(plan.learnerContext?.success, success)
  assert.equal(plan.learnerContext?.challengeDetail, detail)
  assert.equal(plan.learnerContext?.context, context)
  assert.deepEqual(plan.matchedSignals?.map((signal) => signal.id), ['job interview', 'freeze', 'meeting'])
  assert.match(plan.learnerContext?.practiceSuggestion ?? '', /job interview/)
  assert.ok(plan.assumptions.some((assumption) => assumption.includes('does not use an LLM')))
})

test('validated persistence recovers from corrupt payloads and reports errors', () => {
  const storage = new MemoryStorage()
  const fallback = { ok: true }
  const store = createValidatedStore({
    key: 'example', version: 2, storage, fallback,
    validate: (value: unknown): value is { ok: boolean } => typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean',
  })
  storage.setItem('example', '{not-json')
  assert.deepEqual(store.read(), fallback)
  assert.equal(store.getLastError()?.operation, 'read')
  assert.equal(store.write({ ok: false }), true)
  assert.deepEqual(store.read(), { ok: false })
  storage.setItem('example', JSON.stringify({ version: 99, data: { ok: true } }))
  assert.deepEqual(store.read(), fallback)
  assert.equal(store.getLastError()?.operation, 'validate')
})

test('Bloom persistence validates intake and gives safe defaults', () => {
  const storage = new MemoryStorage()
  const persistence = createBloomPersistence({ storage })
  storage.setItem('bloom-it-intake', JSON.stringify({ version: 1, data: { nope: true } }))
  assert.deepEqual(persistence.intake.read(), blankIntake())
  assert.ok(persistence.intake.getErrors().length > 0)
  const intake = completeIntake()
  assert.equal(persistence.intake.write(intake), true)
  assert.deepEqual(persistence.intake.read(), intake)
})
