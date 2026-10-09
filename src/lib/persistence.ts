import { blankIntake } from './personalization'
import { validateIntakeDraft, isRecord } from './validation'
import type { IntakeData, LearningPlan } from '../types'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export interface StorageError {
  operation: 'read' | 'write' | 'remove' | 'validate'
  key: string
  message: string
  cause?: unknown
}

export interface ValidatedStore<T> {
  readonly key: string
  readonly version: number
  read(): T
  write(value: T): boolean
  remove(): boolean
  getLastError(): StorageError | null
  getErrors(): readonly StorageError[]
  clearErrors(): void
}

export interface ValidatedStoreOptions<T> {
  key: string
  version?: number
  fallback: T | (() => T)
  storage?: StorageLike | null
  validate?: (value: unknown) => value is T
  migrate?: (value: unknown, version: number) => T | undefined
}

function fallbackValue<T>(fallback: T | (() => T)): T {
  return typeof fallback === 'function' ? (fallback as () => T)() : fallback
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Storage operation failed.'
}

/**
 * A small storage boundary: all payloads are versioned, validated, and recoverable.
 * The storage implementation is injectable so browser failures can be tested without
 * touching global localStorage.
 */
export function createValidatedStore<T>(options: ValidatedStoreOptions<T>): ValidatedStore<T> {
  const version = options.version ?? 1
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const errors: StorageError[] = []
  const report = (operation: StorageError['operation'], message: string, cause?: unknown) => {
    errors.push({ operation, key: options.key, message, cause })
  }
  const validate = options.validate ?? (() => true)
  const read = (): T => {
    const fallback = () => fallbackValue(options.fallback)
    if (!storage) {
      report('read', 'Browser storage is unavailable; using the safe default.')
      return fallback()
    }
    let raw: string | null
    try {
      raw = storage.getItem(options.key)
    } catch (error) {
      report('read', `Could not read saved data: ${messageFor(error)}`, error)
      return fallback()
    }
    if (!raw) return fallback()
    try {
      const parsed: unknown = JSON.parse(raw)
      const envelope = isRecord(parsed) && 'version' in parsed && 'data' in parsed
        ? { version: parsed.version, data: parsed.data }
        : { version: 0, data: parsed }
      const candidate: unknown = envelope.version === version
        ? envelope.data
        : options.migrate?.(envelope.data, typeof envelope.version === 'number' ? envelope.version : 0)
      if (!validate(candidate)) {
        report('validate', 'Saved data was invalid or from an unsupported version; using the safe default.')
        return fallback()
      }
      return candidate as unknown as T
    } catch (error) {
      report('read', `Saved data could not be read: ${messageFor(error)}`, error)
      return fallback()
    }
  }
  const write = (value: T): boolean => {
    if (!validate(value)) {
      report('validate', 'Refused to save invalid data.')
      return false
    }
    if (!storage) {
      report('write', 'Browser storage is unavailable; data was not saved.')
      return false
    }
    try {
      storage.setItem(options.key, JSON.stringify({ version, data: value }))
      return true
    } catch (error) {
      report('write', `Could not save data: ${messageFor(error)}`, error)
      return false
    }
  }
  const remove = (): boolean => {
    if (!storage?.removeItem) {
      report('remove', 'Browser storage does not support removing saved data.')
      return false
    }
    try {
      storage.removeItem(options.key)
      return true
    } catch (error) {
      report('remove', `Could not remove saved data: ${messageFor(error)}`, error)
      return false
    }
  }
  return {
    key: options.key,
    version,
    read,
    write,
    remove,
    getLastError: () => errors[errors.length - 1] ?? null,
    getErrors: () => errors.slice(),
    clearErrors: () => { errors.length = 0 },
  }
}

export const createLocalPersistence = createValidatedStore
export const createValidatedStorage = createValidatedStore

function isIntake(value: unknown): value is IntakeData {
  return validateIntakeDraft(value).valid
}

function isPlan(value: unknown): value is LearningPlan {
  if (!isRecord(value)) return false
  const modules = value.modules
  const number = (item: unknown) => typeof item === 'number' && Number.isFinite(item) && item >= 0
  const validModule = (module: unknown) => isRecord(module)
    && typeof module.id === 'string' && typeof module.title === 'string' && typeof module.description === 'string'
    && number(module.estimatedMinutes) && typeof module.lessonId === 'string'
    && typeof module.score === 'number' && Number.isFinite(module.score) && typeof module.reason === 'string'
  return typeof value.id === 'string' && typeof value.createdAt === 'string' && typeof value.learnerName === 'string'
    && typeof value.summary === 'string' && Array.isArray(value.priorities) && value.priorities.every((item) => typeof item === 'string')
    && number(value.weeklyMinutes) && typeof value.weeklyPlan === 'string' && Array.isArray(value.assumptions)
    && value.assumptions.every((item) => typeof item === 'string') && Array.isArray(modules) && modules.length <= 5
    && modules.every(validModule)
}

export interface BloomPersistence {
  intake: ValidatedStore<IntakeData>
  plan: ValidatedStore<LearningPlan | null>
}

export interface BloomPersistenceOptions {
  storage?: StorageLike | null
  intakeKey?: string
  planKey?: string
  version?: number
}

/** Ready-to-use stores for the two persisted domain objects used by the app. */
export function createBloomPersistence(options: BloomPersistenceOptions = {}): BloomPersistence {
  const shared = { storage: options.storage, version: options.version ?? 1 }
  return {
    intake: createValidatedStore<IntakeData>({
      ...shared,
      key: options.intakeKey ?? 'bloom-it-intake',
      fallback: blankIntake,
      validate: isIntake,
      migrate: (value, version) => version === 0 && isIntake(value) ? value : undefined,
    }),
    plan: createValidatedStore<LearningPlan | null>({
      ...shared,
      key: options.planKey ?? 'bloom-it-plan',
      fallback: null,
      validate: (value): value is LearningPlan | null => value === null || isPlan(value),
      migrate: (value, version) => version === 0 && (value === null || isPlan(value)) ? value : undefined,
    }),
  }
}
