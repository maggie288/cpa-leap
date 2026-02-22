import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CPA_UNITS } from '../data/cpaCatalog'
import { generateLessonPackage } from '../lib/llm'
import { useAppStore } from '../lib/useAppStore'
import type { CpaQuestion } from '../types'

export function LessonPage() {
  const { lessonId } = useParams()
  const { progress, completeLesson } = useAppStore()
  const lesson = useMemo(() => CPA_UNITS.flatMap((u) => u.lessons).find((item) => item.id === lessonId), [lessonId])
  const [script, setScript] = useState<string[]>([])
  const [questions, setQuestions] = useState<CpaQuestion[]>([])
  const [tips, setTips] = useState<string[]>([])
  const [sourceRefs, setSourceRefs] = useState<Array<{ id: string; topic: string; sourceUrl?: string; publisher?: string; effectiveAt?: string }>>(
    [],
  )
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([])
  const [automationText, setAutomationText] = useState('')
  const [automationRunId, setAutomationRunId] = useState('')
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!lesson || !progress) return
      const pkg = await generateLessonPackage(lesson, progress.weakPoints)
      setScript(pkg.lessonScript)
      setQuestions(pkg.generatedQuestions)
      setTips(pkg.revisionTips)
      setSourceRefs(pkg.sourceRefs || [])
      setQualityWarnings(pkg.qualityWarnings || [])
      setAutomationText(
        pkg.automationReport
          ? `AI自动教研流水线：${pkg.automationReport.modelVersion} · 分数${pkg.automationReport.qualityScore} · ${pkg.automationReport.actions.join(' -> ')}`
          : '',
      )
      setAutomationRunId(pkg.automationReport?.runId || '')
      setSubmitted(false)
      setAnswers({})
    }
    void load()
  }, [lesson, progress])

  if (!lesson) {
    return (
      <div className="page">
        <p>课程不存在</p>
        <Link to="/">返回首页</Link>
      </div>
    )
  }

  const score = questions.reduce((acc, q) => (answers[q.id] === q.answerIndex ? acc + 50 : acc), 0)

  const onSubmit = () => {
    const weakPoints = questions
      .filter((q) => answers[q.id] !== q.answerIndex)
      .map((q) => q.stem.slice(0, 10))
    void completeLesson(lesson.id, score, weakPoints, lesson.subject, automationRunId || undefined)
    setSubmitted(true)
  }

  return (
    <div className="page">
      <section className="card">
        <h1>{lesson.title}</h1>
        <p>{lesson.objective}</p>
        <ul>
          {script.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>练习题</h2>
        {questions.map((q) => (
          <div className="question" key={q.id}>
            <p>{q.stem}</p>
            {q.options.map((option, idx) => (
              <label key={option}>
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === idx}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                />
                {option}
              </label>
            ))}
            {submitted && (
              <p className={answers[q.id] === q.answerIndex ? 'correct' : 'wrong'}>
                {answers[q.id] === q.answerIndex ? '回答正确' : `正确答案：${q.options[q.answerIndex]} | ${q.explanation}`}
              </p>
            )}
          </div>
        ))}
        <button onClick={onSubmit}>提交并记录进度</button>
        {submitted && <p className="tip">本次得分：{score}，已更新到你的学习档案。</p>}
      </section>

      <section className="card">
        <h2>复习建议</h2>
        <ul>
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        {automationText && <p className="tip">{automationText}</p>}
        {qualityWarnings.length > 0 && (
          <p className="wrong">质量提醒：{qualityWarnings.join('；')}</p>
        )}
        {sourceRefs.length > 0 && (
          <>
            <h3>知识来源锚点</h3>
            <ul>
              {sourceRefs.map((ref) => (
                <li key={ref.id}>
                  {ref.topic}（{ref.id}）
                  {ref.publisher ? ` · ${ref.publisher}` : ''}
                  {ref.effectiveAt ? ` · 生效：${ref.effectiveAt}` : ''}
                  {ref.sourceUrl ? (
                    <>
                      {' '}
                      · <a href={ref.sourceUrl} target="_blank" rel="noreferrer">原文</a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
        <Link to="/">返回学习路径</Link>
      </section>
    </div>
  )
}
