import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppStore } from '../lib/useAppStore'

export function LoginPage() {
  const { currentUser, login, register } = useAppStore()
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [targetExamDate, setTargetExamDate] = useState('')
  const [message, setMessage] = useState('')

  if (currentUser) return <Navigate to="/" replace />

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = isRegister
      ? register(name.trim(), email.trim(), password, targetExamDate)
      : login(email.trim(), password)
    const resolved = await result
    setMessage(resolved.message)
  }

  return (
    <div className="page auth-page">
      <div className="mascot-box">
        <div className="mascot">🦉</div>
        <h1>CPA Leap</h1>
        <p>像打游戏一样学 CPA，每天 15 分钟，稳步提分。</p>
      </div>

      <form className="card" onSubmit={onSubmit}>
        <h2>{isRegister ? '创建学习账号' : '欢迎回来'}</h2>
        {isRegister && (
          <label>
            昵称
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          邮箱
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {isRegister && (
          <label>
            目标考试日期
            <input type="date" value={targetExamDate} onChange={(e) => setTargetExamDate(e.target.value)} required />
          </label>
        )}
        <button type="submit">{isRegister ? '注册并开始' : '登录'}</button>
        <button className="ghost" type="button" onClick={() => setIsRegister((v) => !v)}>
          {isRegister ? '已有账号，去登录' : '没有账号，去注册'}
        </button>
        {message && <p className="tip">{message}</p>}
      </form>
    </div>
  )
}
