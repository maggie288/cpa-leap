import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminOpsApi, auditApi, automationApi, knowledgeApi, materialsApi, policyScoutApi, securityApi, userAdminApi } from '../lib/api'
import type { KnowledgeEntry, MaterialAsset } from '../types'
import { useAppStore } from '../lib/useAppStore'

export function KnowledgeOpsPage() {
  const { currentUser } = useAppStore()
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number>; qualityBuckets: Record<string, number> } | null>(
    null,
  )
  const [coverage, setCoverage] = useState<{
    totalEntries: number
    bySubject: Record<
      string,
      {
        totalEntries: number
        approvedEntries: number
        uniqueChapters: number
        uniqueSyllabusChapters: number
        syllabusCoverageRate: number
      }
    >
    subjectSyllabusTarget: Record<string, number>
  } | null>(null)
  const [conflictEntries, setConflictEntries] = useState<KnowledgeEntry[]>([])
  const [revisionDrafts, setRevisionDrafts] = useState<
    Array<{
      id: string
      sourceEntryId: string
      sourceTopic: string
      targetEntryId: string
      targetTopic: string
      subject: string
      reasons: string[]
      confidence: number
      status: 'pending' | 'applied' | 'rejected'
      summary: string
      createdAt: string
    }>
  >([])
  const [message, setMessage] = useState('')
  const [processingMaterialId, setProcessingMaterialId] = useState<string | null>(null)
  const [batchProcessing, setBatchProcessing] = useState(false)
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
    byPrompt: Record<
      string,
      {
        runs: number
        avgQualityScore: number
        avgLearnerScore: number
        feedbackCount: number
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
    promptVersion: string
    promptExperimentEnabled: boolean
    promptCandidates: string[]
    promptTrafficSplit: Record<string, number>
    promptAutoPromoteEnabled: boolean
    promptMinFeedbackCount: number
    promptMinScoreLift: number
  } | null>(null)
  const [candidateText, setCandidateText] = useState('autopilot-v1,autopilot-v1.1')
  const [splitText, setSplitText] = useState('autopilot-v1:50,autopilot-v1.1:50')
  const [promptCandidateText, setPromptCandidateText] = useState('prompt-v1,prompt-v1.1')
  const [promptSplitText, setPromptSplitText] = useState('prompt-v1:50,prompt-v1.1:50')
  const [replayResult, setReplayResult] = useState<{ promptVersion: string; sampleCount: number; avgScore: number; passRate: number } | null>(null)
  const [materials, setMaterials] = useState<MaterialAsset[]>([])
  const [materialStats, setMaterialStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSubject, setUploadSubject] = useState('accounting')
  const [uploadChapter, setUploadChapter] = useState('')
  const [uploadYear, setUploadYear] = useState(String(new Date().getFullYear()))
  const [uploadSourceType, setUploadSourceType] = useState<'textbook' | 'syllabus' | 'exam' | 'notes'>('textbook')
  const [policyStats, setPolicyStats] = useState<{
    totalRuns: number
    totalItems: number
    latestRun: {
      runId: string
      fetchedCount: number
      newItemCount: number
      importedCount: number
      errors: string[]
    } | null
    bySource: Record<string, number>
    bySubject: Record<string, number>
    alerts: Array<{
      id: string
      at: string
      sourceId: string
      sourceName: string
      runId: string
      severity: 'medium' | 'high'
      status: 'sent' | 'failed'
      message: string
      detail: string
      sentAt: string
    }>
    sourceHealth: Array<{
      sourceId: string
      sourceName: string
      url: string
      successCount: number
      failureCount: number
      consecutiveFailures: number
      lastStatus: string
      lastSuccessAt: string
      lastFailureAt: string
      lastError: string
      avgFetchedPerRun: number
      successRate: number
    }>
  } | null>(null)
  const [policySettings, setPolicySettings] = useState<{
    enabled: boolean
    intervalMinutes: number
    maxItemsPerSource: number
    autoImportToKnowledge: boolean
    alertEnabled: boolean
    alertFailureThreshold: number
    alertCooldownMinutes: number
    alertWebhookUrl: string
    sources: Array<{
      id: string
      name: string
      publisher: string
      url: string
      format: 'rss' | 'html'
      subject: string
      topicHint: string
      region: string
      sourceTier: 1 | 2 | 3
    }>
  } | null>(null)
  const [policyRuns, setPolicyRuns] = useState<Array<{
    runId: string
    startedAt: string
    finishedAt: string | null
    fetchedCount: number
    newItemCount: number
    importedCount: number
    errors: string[]
  }>>([])
  const [users, setUsers] = useState<
    Array<{
      id: string
      name: string
      email: string
      role: 'student' | 'teacher' | 'admin'
      targetExamDate: string
      plan: 'free' | 'pro' | 'ultra'
      streakDays: number
      createdAt: string
    }>
  >([])
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; at: string; actorUserId: string; actorRole: string; action: string; resourceType: string; resourceId: string; result: string; detail: Record<string, unknown> }>>([])
  const [securityAlerts, setSecurityAlerts] = useState<Array<{ id: string; at: string; type?: string; severity?: string; message?: string }>>([])

  const load = useCallback(async () => {
    try {
      const [statsRes, coverageRes, conflictRes, revisionRes, autoStatsRes, autoSettingsRes, materialsRes, materialStatsRes, policyStatsRes, policySettingsRes, policyRunsRes, usersRes, auditRes, securityRes] =
        await Promise.all([
        knowledgeApi.stats(),
        knowledgeApi.coverage(),
        knowledgeApi.conflicts(50),
        knowledgeApi.revisionDrafts({ status: 'pending', limit: 50 }),
        automationApi.stats(),
        automationApi.getSettings(),
        materialsApi.list(),
        materialsApi.stats(),
        policyScoutApi.stats(),
        policyScoutApi.getSettings(),
        policyScoutApi.runs(30),
        currentUser?.role === 'admin' ? userAdminApi.listUsers() : Promise.resolve({ total: 0, users: [] }),
        currentUser?.role === 'admin' ? auditApi.logs({ limit: 100 }) : Promise.resolve({ total: 0, logs: [] }),
        currentUser?.role === 'admin' ? securityApi.alerts(100) : Promise.resolve({ total: 0, alerts: [] }),
        ])
      setStats(statsRes)
      setCoverage(coverageRes)
      setConflictEntries(conflictRes.entries || [])
      setRevisionDrafts(revisionRes.drafts || [])
      setAutomationStats(autoStatsRes)
      setAutomationSettings(autoSettingsRes.settings)
      setCandidateText((autoSettingsRes.settings.modelCandidates || []).join(','))
      setSplitText(
        Object.entries(autoSettingsRes.settings.trafficSplit || {})
          .map(([k, v]) => `${k}:${v}`)
          .join(','),
      )
      setPromptCandidateText((autoSettingsRes.settings.promptCandidates || []).join(','))
      setPromptSplitText(
        Object.entries(autoSettingsRes.settings.promptTrafficSplit || {})
          .map(([k, v]) => `${k}:${v}`)
          .join(','),
      )
      setMaterials(materialsRes.materials)
      setMaterialStats({
        total: materialStatsRes.total,
        byStatus: materialStatsRes.byStatus,
      })
      setPolicyStats(policyStatsRes)
      setPolicySettings(policySettingsRes.settings)
      setPolicyRuns(policyRunsRes.runs || [])
      setUsers(usersRes.users || [])
      setAuditLogs(auditRes?.logs || [])
      setSecurityAlerts(securityRes?.alerts || [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    }
  }, [currentUser?.role])

  useEffect(() => {
    void load()
  }, [load])

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
    const promptCandidates = promptCandidateText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const promptTrafficSplit = parseSplit(promptSplitText)

    try {
      const res = await automationApi.updateSettings({
        ...automationSettings,
        modelCandidates,
        trafficSplit,
        promptCandidates,
        promptTrafficSplit,
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
  const promptRows = useMemo(() => Object.entries(automationStats?.byPrompt || {}), [automationStats])

  const onReplayPrompt = async () => {
    if (!automationSettings?.promptVersion) return
    try {
      const res = await automationApi.replayPromptEval({ promptVersion: automationSettings.promptVersion, limit: 20 })
      setReplayResult({
        promptVersion: res.promptVersion,
        sampleCount: res.sampleCount,
        avgScore: res.avgScore,
        passRate: res.passRate,
      })
      setMessage(`回放评测完成：${res.promptVersion}，样本 ${res.sampleCount}，均分 ${res.avgScore}，通过率 ${res.passRate}%`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '回放评测失败')
    }
  }

  const onAutoPromotePrompt = async () => {
    try {
      const res = await automationApi.autoPromotePrompt()
      setMessage(`Prompt 已自动晋升：${res.previousPromptVersion} -> ${res.promotedTo}（提升 ${res.lift}）`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '自动晋升执行失败')
    }
  }

  const onUploadMaterial = async () => {
    if (!uploadFile) {
      setMessage('请先选择PDF文件')
      return
    }
    setUploading(true)
    try {
      const res = await materialsApi.upload({
        file: uploadFile,
        subject: uploadSubject,
        chapter: uploadChapter,
        year: uploadYear,
        sourceType: uploadSourceType,
      })
      setMessage(`${res.message}：${res.material.originalName}`)
      setUploadFile(null)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const onProcessMaterial = async (id: string) => {
    setProcessingMaterialId(id)
    setMessage('正在提交处理任务…')
    try {
      const res = await materialsApi.processAsync(id)
      setMessage(res.message + ' 请稍后点击「刷新列表」查看状态。')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '处理失败（若后端未部署，请先部署后端并配置 VITE_API_BASE）')
    } finally {
      setProcessingMaterialId(null)
    }
  }

  const onDeleteMaterial = async (id: string) => {
    const yes = window.confirm('确认删除该资料？将同时删除切片/向量库记录，且不可恢复。')
    if (!yes) return
    try {
      const res = await materialsApi.remove(id)
      setMessage(res.message)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败')
    }
  }

  const onPurgeAiKnowledge = async () => {
    const yes = window.confirm('确认清理所有 AI生成知识条目？（危险操作，不可恢复）')
    if (!yes) return
    try {
      const res = await adminOpsApi.purgeAiKnowledge()
      setMessage(`已清理 AI生成知识条目：${res.deletedCount} 条`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '清理失败')
    }
  }

  const onClearGenerationRuns = async () => {
    const yes = window.confirm('确认清空课程生成记录与反馈？（仅影响统计/实验，不影响资料与知识库）')
    if (!yes) return
    try {
      const res = await adminOpsApi.clearGenerationRuns()
      setMessage(`已清空生成记录：runs ${res.beforeRuns}，feedback ${res.beforeFeedback}`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '清空失败')
    }
  }

  const onRunPolicyScout = async () => {
    try {
      const res = await policyScoutApi.runOnce()
      setMessage(
        `政策抓取完成：抓取 ${res.run.fetchedCount} 条，新增 ${res.run.newItemCount} 条，入库 ${res.run.importedCount} 条${
          res.run.errors.length ? `，错误 ${res.run.errors.length} 条` : ''
        }`,
      )
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '政策抓取失败')
    }
  }

  const onSavePolicySettings = async () => {
    if (!policySettings) return
    try {
      const res = await policyScoutApi.updateSettings(policySettings)
      setPolicySettings(res.settings)
      setMessage('政策雷达定时配置已保存')
      const statsRes = await policyScoutApi.stats()
      setPolicyStats(statsRes)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '政策雷达配置保存失败')
    }
  }

  const onAddPolicySource = () => {
    setPolicySettings((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sources: [
          ...(prev.sources || []),
          {
            id: `custom-${Date.now()}`,
            name: '新来源',
            publisher: '',
            url: '',
            format: 'rss',
            subject: 'tax',
            topicHint: '',
            region: 'GLOBAL',
            sourceTier: 2,
          },
        ],
      }
    })
  }

  const onRemovePolicySource = (id: string) => {
    setPolicySettings((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sources: (prev.sources || []).filter((s) => s.id !== id),
      }
    })
  }

  const onChangePolicySource = (
    id: string,
    key: 'name' | 'publisher' | 'url' | 'format' | 'subject' | 'topicHint' | 'region' | 'sourceTier',
    value: string,
  ) => {
    setPolicySettings((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sources: (prev.sources || []).map((s) =>
          s.id === id
            ? { ...s, [key]: key === 'format' ? (value as 'rss' | 'html') : key === 'sourceTier' ? (Number(value) as 1 | 2 | 3) : value }
            : s,
        ),
      }
    })
  }

  const onChangeUserRole = async (userId: string, role: 'student' | 'teacher' | 'admin') => {
    try {
      const res = await userAdminApi.updateRole(userId, role)
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: res.user.role } : u)))
      setMessage(`用户 ${res.user.email} 角色已更新为 ${res.user.role}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新用户角色失败')
    }
  }

  const onApplyRevisionDraft = async (draftId: string) => {
    try {
      const res = await knowledgeApi.applyRevisionDraft(draftId)
      setMessage(`已应用修订草案 ${res.draft.id}，目标条目已更新为 review 状态`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '应用修订草案失败')
    }
  }

  const onRejectRevisionDraft = async (draftId: string) => {
    try {
      const res = await knowledgeApi.rejectRevisionDraft(draftId)
      setMessage(`已驳回修订草案 ${res.draft.id}`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '驳回修订草案失败')
    }
  }

  return (
    <div className="page">
      <section className="card">
        <h1>教研审核台</h1>
        <p>用于知识条目筛选、自动修复建议、审核状态流转。</p>
        {message && <p className="tip">{message}</p>}
        {stats && (
          <p>
            总条目 {stats.total} · 状态分布 {JSON.stringify(stats.byStatus)} · 质量分层 {JSON.stringify(stats.qualityBuckets)}
          </p>
        )}
        {coverage && (
          <div className="ops-list">
            {Object.entries(coverage.bySubject).map(([sub, row]) => (
              <small key={sub}>
                {sub}：条目 {row.totalEntries} / approved {row.approvedEntries} / syllabus覆盖 {row.uniqueSyllabusChapters}/
                {coverage.subjectSyllabusTarget[sub] || 0}（{row.syllabusCoverageRate}%）
              </small>
            ))}
          </div>
        )}
        <p>待处理修订草案 {revisionDrafts.length}</p>
        {conflictEntries.length > 0 && (
          <div className="ops-list" style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 8 }}>冲突条目 {conflictEntries.length}（同 syllabusCode 或高相似 topic）</h3>
            {conflictEntries.slice(0, 30).map((entry) => (
              <div className="material-item" key={entry.id} style={{ marginBottom: 12 }}>
                <strong>{entry.topic}</strong>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                  {entry.subject} · {entry.id}
                </span>
                {((entry.conflictRefs ?? []).length) > 0 && (
                  <small style={{ display: 'block', marginTop: 4 }}>
                    与 {(entry.conflictRefs ?? []).map((r) => `${r.withTopic}（${r.reasons?.join('、')}）`).join('；')}
                  </small>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      try {
                        const res = await knowledgeApi.suggestFix(entry.id)
                        setMessage(
                          res.ok
                            ? `建议修复：质量分 ${res.before?.score ?? '-'} → ${res.after?.score ?? '-'}，可通过生成 ${res.after?.passForGeneration ? '是' : '否'}，变更字段：${(res.changedFields || []).join('、') || '无'}`
                            : res.message || '建议修复失败',
                        )
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : '建议修复失败')
                      }
                    }}
                  >
                    建议修复
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await knowledgeApi.applyFix(entry.id)
                        setMessage('已应用修复，条目已更新为 review 状态')
                        await load()
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : '应用修复失败')
                      }
                    }}
                  >
                    应用修复
                  </button>
                </div>
              </div>
            ))}
            {conflictEntries.length > 30 && <p className="tip">仅展示前 30 条</p>}
          </div>
        )}
      </section>

      <section className="card">
        <h2>自动修订建议草案（diff）</h2>
        <p>当政策新条目命中既有知识点冲突时，系统自动生成草案，支持一键应用或驳回。</p>
        <div className="ops-list">
          {revisionDrafts.map((draft) => (
            <div className="material-item" key={draft.id}>
              <strong>
                {draft.subject} · {draft.targetTopic}
              </strong>
              <small>
                来源：{draft.sourceTopic} · 置信度 {draft.confidence} · {draft.createdAt}
              </small>
              <span>{draft.summary}</span>
              <small>触发原因：{draft.reasons.join('；')}</small>
              <div className="ops-actions">
                <button onClick={() => void onApplyRevisionDraft(draft.id)}>应用草案</button>
                <button className="ghost" onClick={() => void onRejectRevisionDraft(draft.id)}>
                  驳回草案
                </button>
              </div>
            </div>
          ))}
          {revisionDrafts.length === 0 && <p>暂无待处理修订草案</p>}
        </div>
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
        <h3>Prompt 实验看板</h3>
        <div className="model-table">
          {promptRows.map(([prompt, row]) => (
            <div className="model-row" key={prompt}>
              <strong>{prompt}</strong>
              <span>运行 {row.runs}</span>
              <span>均质分 {row.avgQualityScore}</span>
              <span>学员均分 {row.avgLearnerScore}</span>
              <span>反馈数 {row.feedbackCount}</span>
            </div>
          ))}
          {promptRows.length === 0 && <p>暂无 Prompt 实验数据</p>}
        </div>
        {replayResult && (
          <p>
            最近回放：{replayResult.promptVersion} · 样本 {replayResult.sampleCount} · 均分 {replayResult.avgScore} · 通过率{' '}
            {replayResult.passRate}%
          </p>
        )}
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
        <label>
          当前 Prompt 版本
          <input
            value={automationSettings?.promptVersion ?? 'prompt-v1'}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, promptVersion: e.target.value || 'prompt-v1' } : prev,
              )
            }
          />
        </label>
        <label>
          Prompt 分流
          <select
            value={automationSettings?.promptExperimentEnabled ? 'on' : 'off'}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, promptExperimentEnabled: e.target.value === 'on' } : prev,
              )
            }
          >
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
        </label>
        <label>
          Prompt 候选（逗号分隔）
          <input value={promptCandidateText} onChange={(e) => setPromptCandidateText(e.target.value)} />
        </label>
        <label>
          Prompt 流量（prompt:weight）
          <input value={promptSplitText} onChange={(e) => setPromptSplitText(e.target.value)} />
        </label>
        <label>
          自动晋升
          <select
            value={automationSettings?.promptAutoPromoteEnabled ? 'on' : 'off'}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, promptAutoPromoteEnabled: e.target.value === 'on' } : prev,
              )
            }
          >
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
        </label>
        <label>
          晋升最小反馈数
          <input
            type="number"
            value={automationSettings?.promptMinFeedbackCount ?? 20}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, promptMinFeedbackCount: Number(e.target.value || 20) } : prev,
              )
            }
          />
        </label>
        <label>
          晋升最小分差
          <input
            type="number"
            step="0.5"
            value={automationSettings?.promptMinScoreLift ?? 2}
            onChange={(e) =>
              setAutomationSettings((prev) =>
                prev ? { ...prev, promptMinScoreLift: Number(e.target.value || 2) } : prev,
              )
            }
          />
        </label>
        <button onClick={() => void onSaveAutomationSettings()}>保存自动实验配置</button>
        <button onClick={() => void onReplayPrompt()}>回放评测当前 Prompt</button>
        <button onClick={() => void onAutoPromotePrompt()}>执行 Prompt 自动晋升</button>
      </section>

      <section className="card">
        <h2>全球政策雷达（税收/财务准则）</h2>
        <p className="tip">
          开启「自动入知识库」后，每次抓取到的新政策会自动写入知识库；修改下方选项后需点击「保存政策雷达配置」生效。已抓取但未入库的条目可点击「立即抓取并入库」重新执行一次抓取并入库。
        </p>
        {policyStats && (
          <p>
            总运行 {policyStats.totalRuns} · 总抓取 {policyStats.totalItems} · 来源分布 {JSON.stringify(policyStats.bySource)} · 科目分布{' '}
            {JSON.stringify(policyStats.bySubject)}
          </p>
        )}
        {policyStats?.latestRun && (
          <p>
            最近一次：抓取 {policyStats.latestRun.fetchedCount}，新增 {policyStats.latestRun.newItemCount}，入库{' '}
            {policyStats.latestRun.importedCount}
            {policyStats.latestRun.errors.length ? `，错误 ${policyStats.latestRun.errors.length}` : ''}
          </p>
        )}
        {policyRuns.length > 0 && (
          <details style={{ marginTop: 8, marginBottom: 8 }}>
            <summary>最近运行记录（共 {policyRuns.length} 次）</summary>
            <ul className="ops-list" style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
              {policyRuns.slice(0, 15).map((run) => (
                <li key={run.runId} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>
                    {run.startedAt.slice(0, 19).replace('T', ' ')}
                  </span>
                  {' · '}
                  抓取 {run.fetchedCount}，新增 {run.newItemCount}，入库 {run.importedCount}
                  {run.errors?.length ? <span className="wrong"> · 错误 {run.errors.length}</span> : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="ops-filters">
          <label>
            定时任务
            <select
              value={policySettings?.enabled ? 'on' : 'off'}
              onChange={(e) =>
                setPolicySettings((prev) =>
                  prev ? { ...prev, enabled: e.target.value === 'on' } : prev,
                )
              }
            >
              <option value="on">开启</option>
              <option value="off">关闭</option>
            </select>
          </label>
          <label>
            抓取间隔（分钟）
            <input
              type="number"
              value={policySettings?.intervalMinutes ?? 360}
              onChange={(e) =>
                setPolicySettings((prev) =>
                  prev ? { ...prev, intervalMinutes: Number(e.target.value || 360) } : prev,
                )
              }
            />
          </label>
          <label>
            每来源抓取上限
            <input
              type="number"
              value={policySettings?.maxItemsPerSource ?? 8}
              onChange={(e) =>
                setPolicySettings((prev) =>
                  prev ? { ...prev, maxItemsPerSource: Number(e.target.value || 8) } : prev,
                )
              }
            />
          </label>
          <label title="开启后，政策抓取到的新条目会自动写入知识库">
            自动入知识库
            <select
              value={policySettings?.autoImportToKnowledge ? 'on' : 'off'}
              onChange={(e) =>
                setPolicySettings((prev) =>
                  prev ? { ...prev, autoImportToKnowledge: e.target.value === 'on' } : prev,
                )
              }
            >
              <option value="on">开启</option>
              <option value="off">关闭</option>
            </select>
          </label>
          <label>
            失败自动告警
            <select
              value={policySettings?.alertEnabled ? 'on' : 'off'}
              onChange={(e) =>
                setPolicySettings((prev) =>
                  prev ? { ...prev, alertEnabled: e.target.value === 'on' } : prev,
                )
              }
            >
              <option value="on">开启</option>
              <option value="off">关闭</option>
            </select>
          </label>
          <label>
            告警阈值（连续失败次数）
            <input
              type="number"
              value={policySettings?.alertFailureThreshold ?? 3}
              onChange={(e) =>
                setPolicySettings((prev) =>
                  prev ? { ...prev, alertFailureThreshold: Number(e.target.value || 3) } : prev,
                )
              }
            />
          </label>
          <label>
            告警冷却（分钟）
            <input
              type="number"
              value={policySettings?.alertCooldownMinutes ?? 180}
              onChange={(e) =>
                setPolicySettings((prev) =>
                  prev ? { ...prev, alertCooldownMinutes: Number(e.target.value || 180) } : prev,
                )
              }
            />
          </label>
          <label>
            Webhook URL
            <input
              value={policySettings?.alertWebhookUrl || ''}
              placeholder="https://your-webhook-url"
              onChange={(e) =>
                setPolicySettings((prev) =>
                  prev ? { ...prev, alertWebhookUrl: e.target.value } : prev,
                )
              }
            />
          </label>
          <button onClick={() => void onSavePolicySettings()}>保存政策雷达配置</button>
          <button onClick={() => void onRunPolicyScout()}>立即抓取并入库</button>
        </div>
        <h3>来源健康度监控</h3>
        <div className="ops-list">
          {(policyStats?.sourceHealth || []).map((row) => (
            <div className="material-item" key={row.sourceId}>
              <strong>
                {row.sourceName}（{row.sourceId}）
              </strong>
              <span className={row.consecutiveFailures >= (policySettings?.alertFailureThreshold ?? 3) ? 'wrong' : ''}>
                状态 {row.lastStatus} · 成功率 {row.successRate}% · 连续失败 {row.consecutiveFailures}
              </span>
              <small>
                成功 {row.successCount} / 失败 {row.failureCount} · 平均抓取 {row.avgFetchedPerRun} 条/次
              </small>
              <small>
                最近成功 {row.lastSuccessAt || '-'} · 最近失败 {row.lastFailureAt || '-'}
              </small>
              {row.lastError && <small className="wrong">最近错误：{row.lastError}</small>}
            </div>
          ))}
        </div>
        <h3>告警记录</h3>
        <div className="ops-list">
          {(policyStats?.alerts || []).slice(0, 20).map((alert) => (
            <div className="material-item" key={alert.id}>
              <strong className={alert.severity === 'high' ? 'wrong' : ''}>
                [{alert.severity}] {alert.sourceName} · {alert.status}
              </strong>
              <small>
                {alert.at} · run {alert.runId}
              </small>
              <span>{alert.message}</span>
              {alert.detail ? <small className="wrong">{alert.detail}</small> : null}
            </div>
          ))}
          {(policyStats?.alerts || []).length === 0 && <p>暂无告警记录</p>}
        </div>
        <h3>抓取来源管理</h3>
        <div className="ops-list">
          {(policySettings?.sources || []).map((src) => (
            <div className="material-item" key={src.id}>
              <strong>{src.id}</strong>
              <div className="ops-filters">
                <label>
                  名称
                  <input value={src.name} onChange={(e) => onChangePolicySource(src.id, 'name', e.target.value)} />
                </label>
                <label>
                  发布机构
                  <input value={src.publisher} onChange={(e) => onChangePolicySource(src.id, 'publisher', e.target.value)} />
                </label>
                <label>
                  URL
                  <input value={src.url} onChange={(e) => onChangePolicySource(src.id, 'url', e.target.value)} />
                </label>
                <label>
                  格式
                  <select value={src.format} onChange={(e) => onChangePolicySource(src.id, 'format', e.target.value)}>
                    <option value="rss">rss/atom</option>
                    <option value="html">html</option>
                  </select>
                </label>
                <label>
                  科目
                  <select value={src.subject} onChange={(e) => onChangePolicySource(src.id, 'subject', e.target.value)}>
                    <option value="accounting">会计</option>
                    <option value="audit">审计</option>
                    <option value="finance">财管</option>
                    <option value="tax">税法</option>
                    <option value="law">经济法</option>
                    <option value="strategy">战略</option>
                  </select>
                </label>
                <label>
                  主题提示
                  <input value={src.topicHint} onChange={(e) => onChangePolicySource(src.id, 'topicHint', e.target.value)} />
                </label>
                <label>
                  区域
                  <input value={src.region} onChange={(e) => onChangePolicySource(src.id, 'region', e.target.value)} />
                </label>
                <label>
                  来源等级
                  <select value={src.sourceTier} onChange={(e) => onChangePolicySource(src.id, 'sourceTier', e.target.value)}>
                    <option value={1}>Tier1 官方</option>
                    <option value={2}>Tier2 权威解读</option>
                    <option value={3}>Tier3 教辅/二手</option>
                  </select>
                </label>
              </div>
              <button className="ghost" onClick={() => onRemovePolicySource(src.id)}>
                删除来源
              </button>
            </div>
          ))}
        </div>
        <button onClick={onAddPolicySource}>新增抓取来源</button>
      </section>

      {currentUser?.role === 'admin' && (
        <section className="card">
          <h2>系统权限与角色管理</h2>
          <p>仅管理员可修改角色。建议：学员=student，教师=teacher，系统管理员=admin。</p>
          <div className="ops-list">
            {users.map((user) => (
              <div className="material-item" key={user.id}>
                <strong>
                  {user.name}（{user.email}）
                </strong>
                <small>
                  当前角色：{user.role} · 套餐：{user.plan} · 连续学习：{user.streakDays} 天
                </small>
                <label>
                  切换角色
                  <select value={user.role} onChange={(e) => void onChangeUserRole(user.id, e.target.value as 'student' | 'teacher' | 'admin')}>
                    <option value="student">student（学员）</option>
                    <option value="teacher">teacher（教师）</option>
                    <option value="admin">admin（管理员）</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>资料上传与入库</h2>
        {materialStats && (
          <p>
            总资料 {materialStats.total} · 状态分布 {JSON.stringify(materialStats.byStatus)}
          </p>
        )}
        {uploading && <p className="tip">正在上传资料，请稍候…</p>}
        <div className="ops-filters">
          <label>
            科目
            <select value={uploadSubject} onChange={(e) => setUploadSubject(e.target.value)}>
              <option value="accounting">会计</option>
              <option value="audit">审计</option>
              <option value="finance">财管</option>
              <option value="tax">税法</option>
              <option value="law">经济法</option>
              <option value="strategy">战略</option>
            </select>
          </label>
          <label>
            章节标签
            <input value={uploadChapter} onChange={(e) => setUploadChapter(e.target.value)} placeholder="例如：第3章 长期股权投资" />
          </label>
          <label>
            年份
            <input value={uploadYear} onChange={(e) => setUploadYear(e.target.value)} />
          </label>
          <label>
            资料类型
            <select value={uploadSourceType} onChange={(e) => setUploadSourceType(e.target.value as typeof uploadSourceType)}>
              <option value="textbook">教材</option>
              <option value="syllabus">考纲</option>
              <option value="exam">真题</option>
              <option value="notes">讲义</option>
            </select>
          </label>
          <label>
            选择PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            />
          </label>
          <button onClick={() => void onUploadMaterial()}>上传资料</button>
        </div>
        <div className="ops-list">
          {materials.map((item) => {
            const ingestLabel =
              item.status === 'ready'
                ? '已入库'
                : item.status === 'processing'
                  ? '处理中'
                  : item.status === 'uploading'
                    ? '上传中'
                    : '待入库'
            const ingestClass =
              item.status === 'ready' ? 'correct' : item.status === 'processing' || item.status === 'uploading' ? '' : 'wrong'
            return (
            <div className="material-item" key={item.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{item.originalName}</strong>
                <span
                  className={ingestClass}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: item.status === 'ready' ? 'var(--bg-2)' : 'transparent',
                    border: '1px solid var(--border)',
                  }}
                  title={item.status === 'ready' ? '已入知识库，可参与课程生成' : item.status === 'uploaded' || item.status === 'failed' ? '点击「处理入库」写入知识库' : ''}
                >
                  {ingestLabel}
                </span>
              </div>
              <span>
                {item.subject} · {item.sourceType} · {item.status} · 切片 {item.chunkCount} {item.ocrUsed ? '· OCR' : ''}
              </span>
              <small>
                {item.chapter || '未标记章节'} · {item.year}
              </small>
              {item.errorMessage ? <small className="wrong">错误：{item.errorMessage}</small> : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => void onProcessMaterial(item.id)}
                  disabled={item.status === 'uploading' || item.status === 'processing' || processingMaterialId !== null}
                >
                  {processingMaterialId === item.id
                    ? '提交中…'
                    : item.status === 'processing'
                      ? '处理中…'
                      : '处理入库'}
                </button>
                <button className="ghost" onClick={() => void onDeleteMaterial(item.id)}>
                  删除
                </button>
              </div>
            </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="ghost" onClick={() => void load()}>
            刷新列表
          </button>
          <button
            className="ghost"
            disabled={batchProcessing}
            onClick={async () => {
              setBatchProcessing(true)
              setMessage('正在提交批量任务…')
              try {
                const res = await materialsApi.processAllAsync()
                setMessage(res.message + ' 请稍后点击「刷新列表」查看状态。')
                await load()
              } catch (error) {
                setMessage(error instanceof Error ? error.message : '批量入库提交失败（若后端未部署，请先部署后端并配置 VITE_API_BASE）')
              } finally {
                setBatchProcessing(false)
              }
            }}
          >
            {batchProcessing ? '提交中…' : '批量处理待入库'}
          </button>
        </div>
      </section>

      {currentUser?.role === 'admin' && (
        <section className="card">
          <h2>内容清理与重建</h2>
          <p>用于删除错误的 AI 自动生成知识，并让课程生成回到“教材PDF + 政策来源优先”的口径。</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="ghost" onClick={() => void onPurgeAiKnowledge()}>
              清理 AI生成知识条目
            </button>
            <button className="ghost" onClick={() => void onClearGenerationRuns()}>
              清空生成记录/反馈
            </button>
          </div>
        </section>
      )}

      {currentUser?.role === 'admin' && (
        <section className="card">
          <h2>审计日志与安全告警</h2>
          <details style={{ marginBottom: 12 }}>
            <summary>审计日志（最近 {auditLogs.length} 条）</summary>
            <ul className="ops-list" style={{ listStyle: 'none', padding: 0, marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
              {auditLogs.slice(0, 50).map((log) => (
                <li key={log.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>{log.at.slice(0, 19).replace('T', ' ')}</span>
                  {' · '}
                  {log.actorUserId} ({log.actorRole}) · {log.action}
                  {log.resourceType && ` · ${log.resourceType}/${log.resourceId}`}
                  {log.result === 'failed' && <span className="wrong"> 失败</span>}
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>安全告警（最近 {securityAlerts.length} 条）</summary>
            <ul className="ops-list" style={{ listStyle: 'none', padding: 0, marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
              {securityAlerts.slice(0, 30).map((a) => (
                <li key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }} className={a.severity === 'high' ? 'wrong' : ''}>
                  <span style={{ color: 'var(--muted)' }}>{a.at.slice(0, 19).replace('T', ' ')}</span>
                  {' · '}
                  {a.type || 'alert'} {a.severity ? `[${a.severity}]` : ''} · {a.message || '-'}
                </li>
              ))}
              {securityAlerts.length === 0 && <li>暂无安全告警</li>}
            </ul>
          </details>
        </section>
      )}

      <p className="tip">
        查看知识库条目、上传资料与政策抓取结果请到「<Link to="/sources">资料总览</Link>」；课程内容由教材 PDF、政策来源与已审核知识条目实时生成。
      </p>
    </div>
  )
}
