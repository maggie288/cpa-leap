import dayjs from 'dayjs'
import { useAppStore } from '../lib/useAppStore'

export function ProfilePage() {
  const { currentUser, progress, logout } = useAppStore()
  if (!currentUser || !progress) return null

  return (
    <div className="page">
      <section className="card">
        <h1>{currentUser.name} 的学习档案</h1>
        <p>邮箱：{currentUser.email}</p>
        <p>角色：{currentUser.role}</p>
        <p>注册时间：{dayjs(currentUser.createdAt).format('YYYY-MM-DD')}</p>
        <p>累计XP：{progress.xp}</p>
        <p>最近学习：{progress.lastStudyAt ? dayjs(progress.lastStudyAt).format('YYYY-MM-DD HH:mm') : '暂无'}</p>
        <p>薄弱点：{progress.weakPoints.length ? progress.weakPoints.join(' / ') : '暂无'}</p>
        <button onClick={logout}>退出登录</button>
      </section>
    </div>
  )
}
