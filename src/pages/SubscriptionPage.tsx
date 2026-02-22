import { useAppStore } from '../lib/useAppStore'
import type { SubscriptionPlan } from '../types'

const PLANS: Array<{ id: SubscriptionPlan; name: string; price: string; features: string[] }> = [
  { id: 'free', name: 'Free', price: '¥0/月', features: ['基础课程路径', '每日学习记录', '章节基础题'] },
  { id: 'pro', name: 'Pro', price: '¥49/月', features: ['LLM个性化课程', '智能错题诊断', '周学习报告'] },
  { id: 'ultra', name: 'Ultra', price: '¥99/月', features: ['全科强化计划', '模考与排名', '高频考点冲刺包'] },
]

export function SubscriptionPage() {
  const { currentUser, updatePlan } = useAppStore()
  if (!currentUser) return null

  return (
    <div className="page">
      <section className="card">
        <h1>订阅中心</h1>
        <p>当前套餐：{currentUser.plan.toUpperCase()}</p>
      </section>
      <section className="plans">
        {PLANS.map((plan) => (
          <article className={`card ${currentUser.plan === plan.id ? 'active' : ''}`} key={plan.id}>
            <h3>{plan.name}</h3>
            <p className="price">{plan.price}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button onClick={() => void updatePlan(plan.id)}>{currentUser.plan === plan.id ? '当前方案' : '切换到此方案'}</button>
          </article>
        ))}
      </section>
    </div>
  )
}
