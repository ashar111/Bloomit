export type LearnerType =
  | 'school-student'
  | 'university-student'
  | 'job-seeker'
  | 'working-professional'
  | 'parent-guardian'
  | 'other'

export type Level =
  | 'complete-beginner'
  | 'basic'
  | 'lower-intermediate'
  | 'intermediate'
  | 'upper-intermediate'
  | 'advanced'
  | 'not-sure'

export type Goal =
  | 'confidence'
  | 'everyday'
  | 'fluency'
  | 'pronunciation'
  | 'vocabulary'
  | 'grammar'
  | 'listening'
  | 'workplace'
  | 'interviews'
  | 'presentations'
  | 'academic'
  | 'other-goal'

export type Challenge =
  | 'hesitation'
  | 'translate'
  | 'word-recall'
  | 'pronunciation'
  | 'grammar-mistakes'
  | 'limited-practice'
  | 'application'
  | 'accents'
  | 'nervous'
  | 'generic-courses'
  | 'starting-point'
  | 'routine'
  | 'other-challenge'

export type LearningFormat = 'short-lessons' | 'guided-practice' | 'examples' | 'reading' | 'quizzes' | 'scenarios'

/** An empty answer means the optional self-check has not been answered. */
export type SelfAssessmentAnswer = 'yes' | 'sometimes' | 'not-yet' | ''

export interface SelfAssessment {
  introduction: SelfAssessmentAnswer
  conversation: SelfAssessmentAnswer
  explain: SelfAssessmentAnswer
  discussion: SelfAssessmentAnswer
}

export interface IntakeData {
  name: string
  email: string
  country: string
  learnerType: LearnerType | ''
  explanationLanguage: string
  goals: Goal[]
  success: string
  challenges: Challenge[]
  challengeDetail: string
  level: Level | ''
  selfAssessment: SelfAssessment
  time: '10-15' | '20-30' | '30-45' | '45-plus' | ''
  schedule: 'daily' | 'weekdays' | 'weekends' | 'flexible' | ''
  formats: LearningFormat[]
  pace: 'gradual' | 'balanced' | 'intensive' | ''
  deadline: string
  context: string
  consent: boolean
  marketing: boolean
}

export interface Module {
  id: string
  title: string
  eyebrow: string
  description: string
  category: string
  objectives: string[]
  levels: Level[]
  goals: Goal[]
  challenges: Challenge[]
  formats: LearningFormat[]
  estimatedMinutes: number
  practice: string
  lessonId: string
  prerequisiteIds?: string[]
  tags: string[]
}

export interface Recommendation extends Module {
  score: number
  reason: string
}

export interface LearningPlan {
  id: string
  createdAt: string
  learnerName: string
  summary: string
  priorities: string[]
  weeklyMinutes: number
  weeklyPlan: string
  assumptions: string[]
  modules: Recommendation[]
  // Optional additions preserve compatibility with earlier saved plans and UI callers.
  provider?: { id: string; version: string }
  startingLevel?: Level
  sessionMinutes?: number
  sessionsPerWeek?: number
  totalEstimatedMinutes?: number
  estimatedSessions?: number
  estimatedWeeks?: number
  matchedSignals?: TextSignal[]
  learnerContext?: LearnerContext
}

export interface TextSignal {
  id: string
  label: string
  source: 'success' | 'challengeDetail' | 'context'
  phrase: string
  goal?: Goal
  challenge?: Challenge
}

export interface LearnerContext {
  success: string
  challengeDetail: string
  context: string
  practiceSuggestion: string
}

export interface PlanGenerationOptions {
  /** Inject a clock for repeatable previews/tests; no date changes module rankings. */
  now?: Date
}

/** A future remote provider can be asynchronous; the current provider is entirely local. */
export interface PersonalizationProvider {
  readonly id: string
  readonly version: string
  generatePlan(intake: IntakeData, options?: PlanGenerationOptions): LearningPlan | Promise<LearningPlan>
}

export interface Exercise {
  prompt: string
  options: string[]
  answer: string
  explanation: string
}

export interface Lesson {
  id: string
  moduleId: string
  label: string
  title: string
  duration: string
  objectives: string[]
  explanation: string
  examples: string[]
  exercises: Exercise[]
}
