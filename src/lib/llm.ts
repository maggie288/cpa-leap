import type { GeneratedLessonPackage, Lesson } from '../types'

const LLM_API_BASE = import.meta.env.VITE_LLM_API_BASE
const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY
const APP_API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:8787/api' : '/api')

export const generateLessonPackage = async (
  lesson: Lesson,
  weakPoints: string[],
): Promise<GeneratedLessonPackage> => {
  if (LLM_API_BASE && LLM_API_KEY) {
    const response = await fetch(`${LLM_API_BASE}/generate-cpa-lesson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        subject: lesson.subject,
        chapterId: lesson.chapterId,
        knowledgePointId: lesson.knowledgePointId,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        objective: lesson.objective,
        examPoints: lesson.examPoints,
        weakPoints,
      }),
    })

    if (!response.ok) {
      throw new Error('LLM服务返回异常')
    }
    return (await response.json()) as GeneratedLessonPackage
  }

  const token = localStorage.getItem('cpa_leap_token')
  if (token) {
    const response = await fetch(`${APP_API_BASE}/llm/generate-cpa-lesson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subject: lesson.subject,
        chapterId: lesson.chapterId,
        knowledgePointId: lesson.knowledgePointId,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        objective: lesson.objective,
        examPoints: lesson.examPoints,
        weakPoints,
      }),
    })
    if (response.ok) {
      const payload = (await response.json()) as GeneratedLessonPackage
      return {
        ...payload,
        generatedQuestions: payload.generatedQuestions?.length ? payload.generatedQuestions : lesson.questions,
      }
    }
  }

  const focus = weakPoints.slice(-2)
  return {
    lessonScript: [
      `本节目标：${lesson.objective}`,
      `先理解核心考点：${lesson.examPoints.join('、')}`,
      '用 1 道基础题建立概念，再用 1 道综合题建立迁移能力。',
      focus.length ? `结合你的薄弱点强化：${focus.join('、')}` : '本节暂无明显薄弱点，保持节奏。',
    ],
    generatedQuestions: lesson.questions.map((q) => ({
      ...q,
      id: `gen-${q.id}`,
    })),
    revisionTips: [
      '错题用“概念-条件-结论”三段法重述一遍。',
      '每次学习后 24 小时做 5 分钟回顾题。',
      '把易混淆点写成对比卡片，下一次复习先看卡片再刷题。',
    ],
  }
}
