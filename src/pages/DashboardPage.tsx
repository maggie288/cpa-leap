import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CPA_UNITS, SUBJECT_NAME } from '../data/cpaCatalog'
import { courseApi, type CourseOutlineUnit } from '../lib/api'
import { useAppStore } from '../lib/useAppStore'

export function DashboardPage() {
  const { currentUser, progress } = useAppStore()
  const [outlineUnits, setOutlineUnits] = useState<CourseOutlineUnit[] | null>(null)
  const [outlineLoading, setOutlineLoading] = useState(true)

  const loadOutline = useCallback(async () => {
    setOutlineLoading(true)
    try {
      const res = await courseApi.outline()
      if (res.units?.length) {
        setOutlineUnits(res.units)
      } else {
        setOutlineUnits(null)
      }
    } catch {
      setOutlineUnits(null)
    } finally {
      setOutlineLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOutline()
  }, [loadOutline])

  if (!currentUser || !progress) return null

  const useKnowledgeOutline = !outlineLoading && outlineUnits && outlineUnits.length > 0
  const totalLessons = useKnowledgeOutline
    ? outlineUnits!.flatMap((u) => u.chapters.flatMap((c) => c.entries)).length
    : CPA_UNITS.flatMap((u) => u.lessons).length
  const progressRatio = totalLessons ? progress.completedLessons.length / totalLessons : 0

  return (
    <div className="page">
      <header className="top-banner">
        <div>
          <h1>Hi, {currentUser.name}</h1>
          <p>
            连续学习 {currentUser.streakDays} 天 · 当前 XP {progress.xp} · 套餐 {currentUser.plan.toUpperCase()}
          </p>
        </div>
        <div className="badge">距离考试 {Math.max(dayjs(currentUser.targetExamDate).diff(dayjs(), 'day'), 0)} 天</div>
      </header>

      <section className="card">
        <h2>学习进度</h2>
        <div className="progress-bar">
          <span style={{ width: `${Math.round(progressRatio * 100)}%` }} />
        </div>
        <p>
          已完成 {progress.completedLessons.length}/{totalLessons} 课时（{Math.round(progressRatio * 100)}%）
        </p>
      </section>

      {outlineLoading && (
        <section className="card">
          <p className="tip">正在加载知识框架…</p>
        </section>
      )}

      {useKnowledgeOutline && (
        <section className="card" style={{ marginBottom: 8 }}>
          <p className="tip">
            以下目录由已入库的<strong>教材（PDF）</strong>与<strong>政策抓取</strong>对应的知识切片生成，与资料总览一致。
          </p>
        </section>
      )}

      <section className="units">
        {useKnowledgeOutline
          ? outlineUnits!.map((unit) => (
              <article className="card" key={unit.subject}>
                <h3>{unit.subjectName}</h3>
                {unit.chapters.map((ch) => (
                  <div key={ch.chapterId} style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>{ch.chapterTitle}</h4>
                    <div className="lesson-grid">
                      {ch.entries.map((entry) => {
                        const done = progress.completedLessons.includes(entry.id)
                        return (
                          <Link
                            className={`lesson-pill ${done ? 'done' : ''}`}
                            to={`/lesson/${entry.id}`}
                            key={entry.id}
                            title={entry.source === 'material' ? '教材' : entry.source === 'policy' ? '政策' : '知识库'}
                          >
                            <span>{done ? '✅' : '🎯'}</span>
                            <span>{entry.topic}</span>
                            <small>{entry.source === 'material' ? '教材' : entry.source === 'policy' ? '政策' : ''}</small>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </article>
            ))
          : !outlineLoading &&
            CPA_UNITS.map((unit) => (
              <article className="card" key={unit.id}>
                <h3>
                  {SUBJECT_NAME[unit.subject]} · {unit.title}
                </h3>
                <p className="tip" style={{ marginBottom: 12 }}>
                  暂无教材/政策知识库时显示默认框架，上传 PDF 并处理入库后将按知识切片生成目录。
                </p>
                <div className="lesson-grid">
                  {unit.lessons.map((lesson) => {
                    const done = progress.completedLessons.includes(lesson.id)
                    return (
                      <Link className={`lesson-pill ${done ? 'done' : ''}`} to={`/lesson/${lesson.id}`} key={lesson.id}>
                        <span>{done ? '✅' : '🎯'}</span>
                        <span>{lesson.title}</span>
                        <small>{lesson.estimatedMinutes} min</small>
                      </Link>
                    )
                  })}
                </div>
              </article>
            ))}
      </section>
    </div>
  )
}
