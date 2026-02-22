export type SubjectCode = 'accounting' | 'audit' | 'finance' | 'tax' | 'law' | 'strategy'

export type SubscriptionPlan = 'free' | 'pro' | 'ultra'
export type UserRole = 'student' | 'teacher' | 'admin'

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
  chapterId?: string
  knowledgePointId?: string
  title: string
  objective: string
  examPoints: string[]
  estimatedMinutes: number
  questions: CpaQuestion[]
}

export interface KnowledgePoint {
  id: string
  subject: SubjectCode
  chapterId: string
  title: string
  syllabusCode: string
  difficulty: 1 | 2 | 3 | 4 | 5
  examFrequency: 'high' | 'medium' | 'low'
  prerequisites?: string[]
}

export interface Chapter {
  id: string
  subject: SubjectCode
  title: string
  syllabusCode: string
  order: number
  estimatedHours: number
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
  tenantId?: string
  name: string
  email: string
  role: UserRole
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
  tenantId?: string
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
  sourceRefs?: Array<{ id: string; topic: string; sourceUrl?: string; publisher?: string; effectiveAt?: string }>
  qualityWarnings?: string[]
  automationReport?: {
    runId: string
    modelVersion: string
    promptVersion?: string
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
  sourceTier?: 1 | 2 | 3
  effectiveAt?: string
  expiresAt?: string
  lifecycle?: 'active' | 'scheduled' | 'expired'
  conflictRefs?: Array<{
    withId: string
    withTopic: string
    reasons: string[]
  }>
  policyMeta?: {
    sourceName?: string
    publisher?: string
    sourceUrl?: string
    publishedAt?: string
    effectiveAt?: string
    applicableScope?: string
    region?: string
  }
}

export interface MaterialAsset {
  id: string
  filename: string
  originalName: string
  subject: SubjectCode
  chapter: string
  year: string
  sourceType: 'textbook' | 'syllabus' | 'exam' | 'notes'
  size: number
  mimetype: string
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  chunkCount: number
  ocrUsed?: boolean
  uploadedAt: string
  processedAt?: string
  errorMessage?: string
}
