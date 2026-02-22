export type SubjectCode = 'accounting' | 'audit' | 'finance' | 'tax' | 'law' | 'strategy'

export type SubscriptionPlan = 'free' | 'pro' | 'ultra'

export interface CpaQuestion {
  id: string
  stem: string
  options: string[]
  answerIndex: number
  explanation: string
  difficulty: 1 | 2 | 3 | 4 | 5
}

export interface Lesson {
  id: string
  subject: SubjectCode
  title: string
  objective: string
  examPoints: string[]
  estimatedMinutes: number
  questions: CpaQuestion[]
}

export interface CourseUnit {
  id: string
  subject: SubjectCode
  title: string
  order: number
  lessons: Lesson[]
}

export interface UserProfile {
  id: string
  name: string
  email: string
  targetExamDate: string
  plan: SubscriptionPlan
  streakDays: number
  createdAt: string
}

export interface LessonProgress {
  lessonId: string
  completed: boolean
  score: number
  completedAt?: string
}

export interface UserProgress {
  userId: string
  xp: number
  completedLessons: string[]
  lessonProgressMap: Record<string, LessonProgress>
  weakPoints: string[]
  lastStudyAt?: string
}

export interface GeneratedLessonPackage {
  lessonScript: string[]
  generatedQuestions: CpaQuestion[]
  revisionTips: string[]
  sourceRefs?: Array<{ id: string; topic: string }>
  qualityWarnings?: string[]
  automationReport?: {
    runId: string
    modelVersion: string
    actions: string[]
    autoApproved: boolean
    qualityScore: number
  }
}

export interface KnowledgeEntry {
  id: string
  subject: SubjectCode
  chapter: string
  syllabusCode: string
  examYear: string
  topic: string
  keywords: string[]
  concept: string
  rules: string[]
  pitfalls: string[]
  miniCase: string
  status: 'draft' | 'review' | 'approved' | 'deprecated'
  version: number
  qualityScore: number
  qualityIssues?: string[]
  reviewedBy?: string
  reviewedAt?: string
}
