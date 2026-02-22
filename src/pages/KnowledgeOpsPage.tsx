import { useCallback, useEffect, useMemo, useState } from 'react'
import { automationApi, knowledgeApi } from '../lib/api'
import type { KnowledgeEntry } from '../types'

const STATUS_OPTIONS: KnowledgeEntry['status'][] = ['draft', 'review', 'approved', 'deprecated']

export function KnowledgeOpsPage() {
  const [subject, setSubject] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number>; qualityBuckets: Record<string, number> } | null>(
    null,
  )
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [automationStats, setAutomationStats] = useState<{
    totalRuns: number
    autoApprovedRuns: number
    autoApproveRate: number
    byModel: Record<
      string,
      {
        runs: number
        autoApprovedRuns: number
        avgQualityScore: number
        avgLearnerScore: number
        feedbackCount: number
        autoApproveRate: number
      }
    >
  } | null>(null)
  const [automationSettings, setAutomationSettings] = useState<{
    autopilotEnabled: boolean
    minQualityScore: number
    maxAutoFixRounds: number
    modelVersion: string
    experimentEnabled: boolean
    modelCandidates: string[]
    trafficSplit: Record<string, number>
  } | null>(null)
  const [candidateText, setCandidateText] = useState('autopilot-v1,autopilot-v1.1')
  const [splitText, setSplitText] = useState('autopilot-v1:50,autopilot-v1.1:50')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statsRes, autoStatsRes, autoSettingsRes] = await Promise.all([
        knowledgeApi.list({ subject: subject || undefined, status: status || undefined, q: q || undefined }),
        knowledgeApi.stats(),
        automationApi.stats(),
        automationApi.getSettings(),
      ])
      setEntries(listRes.entries)
      setStats(statsRes)
      setAutomationStats(autoStatsRes)
      setAutomationSettings(autoSettingsRes.settings)
      setCandidateText((autoSettingsRes.settings.modelCandidates || []).join(','))
      setSplitText(
        Object.entries(autoSettingsRes.settings.trafficSplit || {})
          .map(([k, v]) => `${k}:${v}`)
          .join(','),
      )
      if (selectedId) {
        const found = listRes.entries.find((item) => item.id === selectedId)
        setSelected(found || null)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [q, selectedId, status, subject])

  useEffect(() => {
    void load()
  }, [load])

  const selectedIssues = useMemo(() => selected?.qualityIssues || [], [selected])

  const onSelect = async (id: string) => {
    setSelectedId(id)
    try {
      const detail = await knowledgeApi.getById(id)
      setSelected(detail.entry)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载详情失败')
    }
  }

  const onSuggestFix = async () => {
    if (!selectedId) return
    try {
      const res = await knowledgeApi.suggestFix(selectedId)
      setMessage(`建议修复：${res.before.score} -> ${res.after.score}，变更字段：${res.changedFields.join('、')}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '生成建议失败')
    }
  }

  const onApplyFix = async () => {
    if (!selectedId) return
    try {
      const res = await knowledgeApi.applyFix(selectedId)
      setSelected(res.entry)
      setMessage(`已应用修复，当前分数 ${res.entry.qualityScore}，状态 ${res.entry.status}`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '应用修复失败')
    }
  }

  const onReview = async (nextStatus: KnowledgeEntry['status']) => {
    if (!selectedId) return
    try {
      const res = await knowledgeApi.review(selectedId, nextStatus)
      setSelected(res.entry)
      setMessage(`状态已更新为 ${res.entry.status}`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '状态更新失败')
    }
  }

  const parseSplit = (raw: string) => {
    const map: Record<string, number> = {}
    for (const part of raw.split(',')) {
      const [k, v] = part.split(':').map((item) => item.trim())
      if (!k) continue
      const weight = Number(v || 0)
      if (Number.isFinite(weight) && weight >= 0) map[k] = weight
    }
    return map
  }

  const onSaveAutomationSettings = async () => {
    if (!automationSettings) return
    const modelCandidates = candidateText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const trafficSplit = parseSplit(splitText)

    try {
      const res = await automationApi.updateSettings({
        ...automationSettings,
        modelCandidates,
        trafficSplit,
      })
      setAutomationSettings(res.settings)
      setMessage('自动实验配置已保存')
      const autoStats = await automationApi.stats()
      setAutomationStats(autoStats)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存配置失败')
    }
  }

  const onPromoteModel = async (modelVersion: string) => {
    if (!automationSettings) return
    try {
      const res = await automationApi.updateSettings({
        ...automationSettings,
        modelVersion,
      })
      setAutomationSettings(res.settings)
      setMessage(`已将主模型切换为 ${modelVersion}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '切换主模型失败')
    }
  }

  const modelRows = useMemo(() => Object.entries(automationStats?.byModel || {}), [automationStats])

  return (
    <div className="page">
      <section className="card">
        <h1>教研审核台</h1>
        <p>用于知识条目筛选、自动修复建议、审核状态流转。</p>
        {stats && (
          <p>
            总条目 {stats.total} · 状态分布 {JSON.stringify(stats.byStatus)} · 质量分层 {JSON.stringify(stats.qualityBuckets)}
          </p>
        )}
      </section>

      <section className="card">
        <h2>自动实验看板</h2>
        {automationStats && (
          <p>
            总运行 {automationStats.totalRuns} · 自动通过 {automationStats.autoApprovedRuns} · 通过率 {automationStats.autoApproveRate}%
          </p>
        )}
        <div className="model-table">
          {modelRows.map(([model, row]) => (
            <div className="model-row" key={model}>
              <strong>{model}</strong>
              <span>运行 {row.runs}</span>
              <span>通过率 {row.autoApproveRate}%</span>
              <span>均质分 {row.avgQualityScore}</span>
              <span>学员均分 {row.avgLearnerScore}</span>
              <button onClick={() => void onPromoteModel(model)}>设为主模型</button>
            </div>
          ))}
          {modelRows.length === 0 && <p>暂无模型实验数据</p>}
        </div>
      </section>

      <section className="card ops-filters">
        <label>
          自动流水线
          <select
            value={automationSettings?.autopilotEnabled ? 'on' : 'off'}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, autopilotEnabled: e.target.value === 'on' } : prev,
              )
            }
          >
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
        </label>
        <label>
          实验分流
          <select
            value={automationSettings?.experimentEnabled ? 'on' : 'off'}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, experimentEnabled: e.target.value === 'on' } : prev,
              )
            }
          >
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
        </label>
        <label>
          最低质量分
          <input
            type="number"
            value={automationSettings?.minQualityScore ?? 85}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, minQualityScore: Number(e.target.value || 85) } : prev,
              )
            }
          />
        </label>
        <label>
          自动修复轮次
          <input
            type="number"
            value={automationSettings?.maxAutoFixRounds ?? 2}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, maxAutoFixRounds: Number(e.target.value || 2) } : prev,
              )
            }
          />
        </label>
        <label>
          模型候选（逗号分隔）
          <input value={candidateText} onChange={(e) => setCandidateText(e.target.value)} />
        </label>
        <label>
          流量分配（model:weight）
          <input value={splitText} onChange={(e) => setSplitText(e.target.value)} />
        </label>
        <button onClick={() => void onSaveAutomationSettings()}>保存自动实验配置</button>
      </section>

      <section className="card ops-filters">
        <label>
          科目
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">全部</option>
            <option value="accounting">会计</option>
            <option value="audit">审计</option>
            <option value="finance">财管</option>
            <option value="tax">税法</option>
            <option value="law">经济法</option>
            <option value="strategy">战略</option>
          </select>
        </label>
        <label>
          状态
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部</option>
            {STATUS_OPTIONS.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          搜索
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="topic/keyword" />
        </label>
        <button onClick={() => void load()}>{loading ? '加载中...' : '查询'}</button>
      </section>

      <section className="ops-layout">
        <article className="card">
          <h2>条目列表</h2>
          <div className="ops-list">
            {entries.map((entry) => (
              <button className="ops-item" key={entry.id} onClick={() => void onSelect(entry.id)}>
                <strong>{entry.topic}</strong>
                <span>
                  {entry.subject} · {entry.status} · 分数 {entry.qualityScore}
                </span>
                <small>{entry.id}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>条目详情</h2>
          {!selected && <p>请选择左侧条目</p>}
          {selected && (
            <div className="ops-detail">
              <p>
                <strong>{selected.topic}</strong>（{selected.id}）
              </p>
              <p>
                {selected.subject} · {selected.chapter} · {selected.syllabusCode} · {selected.examYear}
              </p>
              <p>质量分：{selected.qualityScore}</p>
              <p>当前状态：{selected.status}</p>
              {selectedIssues.length > 0 ? (
                <ul>
                  {selectedIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="correct">无质量问题</p>
              )}
              <div className="ops-actions">
                <button onClick={() => void onSuggestFix()}>生成修复建议</button>
                <button onClick={() => void onApplyFix()}>一键应用修复</button>
                <button onClick={() => void onReview('review')}>送审(review)</button>
                <button onClick={() => void onReview('approved')}>审核通过</button>
                <button className="ghost" onClick={() => void onReview('deprecated')}>
                  下线(deprecated)
                </button>
              </div>
            </div>
          )}
          {message && <p className="tip">{message}</p>}
        </article>
      </section>
    </div>
  )
}
