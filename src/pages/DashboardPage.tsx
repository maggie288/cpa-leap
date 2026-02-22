import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { CPA_UNITS, SUBJECT_NAME } from '../data/cpaCatalog'
import { useAppStore } from '../lib/useAppStore'

export function DashboardPage() {
  const { currentUser, progress } = useAppStore()
  if (!currentUser || !progress) return null

  const totalLessons = CPA_UNITS.flatMap((unit) => unit.lessons).length
  const progressRatio = progress.completedLessons.length / totalLessons

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

      <section className="units">
        {CPA_UNITS.map((unit) => (
          <article className="card" key={unit.id}>
            <h3>
              {SUBJECT_NAME[unit.subject]} · {unit.title}
            </h3>
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
