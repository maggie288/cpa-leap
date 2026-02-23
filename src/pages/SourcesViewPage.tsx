import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CPA_UNITS } from '../data/cpaCatalog'
import { knowledgeApi, materialsApi, policyScoutApi } from '../lib/api'
import { useAppStore } from '../lib/useAppStore'
import type { KnowledgeEntry } from '../types'

const SUBJECTS = [
  { value: '', label: '全部科目' },
  { value: 'accounting', label: '会计' },
  { value: 'audit', label: '审计' },
  { value: 'finance', label: '财管' },
  { value: 'tax', label: '税法' },
  { value: 'law', label: '经济法' },
  { value: 'strategy', label: '战略' },
] as const

type TabId = 'knowledge' | 'materials' | 'policy' | 'courses'

export function SourcesViewPage() {
  const { currentUser } = useAppStore()
  const canEdit = currentUser?.role === 'teacher' || currentUser?.role === 'admin'
  const [tab, setTab] = useState<TabId>('knowledge')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [knowledge, setKnowledge] = useState<{ total: number; entries: KnowledgeEntry[] }>({ total: 0, entries: [] })
  const [materials, setMaterials] = useState<{ total: number; materials: Array<{ id: string; originalName: string; subject: string; chapter: string; year: string; status: string; chunkCount: number; uploadedAt: string }> }>({ total: 0, materials: [] })
  const [policyItems, setPolicyItems] = useState<{ total: number; items: Array<{ id: string; title: string; url: string; subject: string; sourceName: string; publishedAt?: string; summary?: string; capturedAt?: string }> }>({ total: 0, items: [] })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'knowledge') {
        const res = await knowledgeApi.list({ subject: subject || undefined, status: '', minQualityScore: 0 })
        setKnowledge(res)
      } else if (tab === 'materials') {
        const [matRes, kbRes] = await Promise.all([
          materialsApi.list({ subject: subject || undefined, status: undefined }),
          knowledgeApi.list({ subject: subject || undefined, status: '', minQualityScore: 0 }),
        ])
        setMaterials(matRes)
        setKnowledge(kbRes)
      } else if (tab === 'policy') {
        const [policyRes, kbRes] = await Promise.all([
          policyScoutApi.items({ limit: 200, subject: subject || undefined }),
          knowledgeApi.list({ subject: subject || undefined, status: '', minQualityScore: 0 }),
        ])
        setPolicyItems(policyRes)
        setKnowledge(kbRes)
      }
    } catch {
      setKnowledge({ total: 0, entries: [] })
      setMaterials({ total: 0, materials: [] })
      setPolicyItems({ total: 0, items: [] })
    } finally {
      setLoading(false)
    }
  }, [tab, subject])

  useEffect(() => {
    if (tab !== 'courses') void load()
  }, [tab, subject, load])

  const sourceLabel = (entry: KnowledgeEntry) => {
    if (entry.id.startsWith('mat_')) return '教材'
    if (entry.policyMeta?.sourceUrl || entry.topic?.includes('政策')) return '政策'
    if (entry.topic?.includes('AI生成')) return 'AI生成'
    return '知识库'
  }

  const onDeleteEntry = useCallback(
    async (id: string) => {
      if (!canEdit) return
      if (!window.confirm('确认删除该知识条目？删除后生成课程将不再引用此条。')) return
      try {
        await knowledgeApi.delete(id)
        setMessage('已删除')
        void load()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : '删除失败')
      }
    },
    [canEdit, load],
  )

  const onReviewEntry = useCallback(
    async (id: string, status: 'approved' | 'deprecated') => {
      if (!canEdit) return
      const action = status === 'approved' ? '通过' : '废弃'
      if (!window.confirm(`确认${action}该知识条目？`)) return
      try {
        await knowledgeApi.review(id, status)
        setMessage(status === 'approved' ? '已通过，将参与课程生成' : '已废弃')
        void load()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : `审核失败：${action}`)
      }
    },
    [canEdit, load],
  )

  return (
    <div className="page">
      <section className="card">
        <h1>知识来源总览</h1>
        <p className="tip">
          用于对照生产课程内容：下方为已入库的知识条目、上传的 PDF 资料、政策抓取结果及课程结构，便于核对 AI 生成课程所引用的资料来源。
        </p>
        <details style={{ marginBottom: 12, fontSize: 13 }}>
          <summary>知识条目来源说明</summary>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li><strong>教材</strong>：上传 PDF 后点击「处理入库」时自动生成，每条资料对应一条（id 以 mat_ 开头）。</li>
            <li><strong>政策</strong>：政策雷达抓取并开启「自动导入知识库」时生成，带官方链接。</li>
            <li><strong>AI生成</strong>：学习页打开某课时，自动教研流水线生成的草稿（topic 含「AI生成知识条目」）；教研里「清理 AI生成知识条目」可批量删。</li>
            <li><strong>知识库</strong>：种子脚本（kb:seed:phase2）或手动导入的条目；可在本页单条删除。</li>
          </ul>
        </details>
        {message && <p className="tip">{message}</p>}

        <div className="ops-filters" style={{ marginBottom: 16 }}>
          <label>
            科目
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => (
                <option key={s.value || 'all'} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { id: 'knowledge' as TabId, label: '知识库条目' },
            { id: 'materials' as TabId, label: '上传资料' },
            { id: 'policy' as TabId, label: '政策抓取' },
            { id: 'courses' as TabId, label: '课程结构对照' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? '' : 'ghost'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'knowledge' && (
          <div className="card" style={{ background: 'var(--bg-2)', padding: 16 }}>
            <h2>知识库条目（用于生成课程题干与解析）</h2>
            {loading ? (
              <p>加载中…</p>
            ) : (
              <>
                <p>共 {knowledge.total} 条（当前筛选：{subject || '全部'}）</p>
                <ul className="ops-list" style={{ listStyle: 'none', padding: 0 }}>
                  {knowledge.entries.slice(0, 150).map((entry) => (
                    <li key={entry.id} className="material-item" style={{ marginBottom: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{entry.topic}</strong>
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                          {entry.subject} · {entry.status} · {sourceLabel(entry)}
                        </span>
                        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>
                          {entry.concept?.slice(0, 200)}
                          {(entry.concept?.length ?? 0) > 200 ? '…' : ''}
                        </div>
                        {(entry.chapter || entry.syllabusCode) && (
                          <small style={{ display: 'block', marginTop: 4 }}>
                            章节/考纲：{entry.chapter || ''} {entry.syllabusCode || ''}
                          </small>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Link to={`/sources/entry/${entry.id}`} className="button ghost">查看详情</Link>
                        {canEdit && (
                          <>
                            {(entry.status === 'draft' || entry.status === 'review') && (
                              <button type="button" className="button" onClick={() => void onReviewEntry(entry.id, 'approved')}>
                                通过
                              </button>
                            )}
                            {entry.status !== 'deprecated' && (
                              <button type="button" className="ghost" onClick={() => void onReviewEntry(entry.id, 'deprecated')}>
                                废弃
                              </button>
                            )}
                            <button type="button" className="ghost" onClick={() => void onDeleteEntry(entry.id)}>
                              删除
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {knowledge.entries.length > 150 && <p className="tip">仅展示前 150 条，可通过教研页按科目/状态筛选查看全部。</p>}
              </>
            )}
          </div>
        )}

        {tab === 'materials' && (
          <div className="card" style={{ background: 'var(--bg-2)', padding: 16 }}>
            <h2>上传资料（PDF 教材/考纲/真题）</h2>
            <p className="tip">每个资料处理入库后对应一条知识切片，可点「查看详情」核对条目内容是否正确。</p>
            {loading ? (
              <p>加载中…</p>
            ) : (
              <>
                <p>共 {materials.total} 个资料</p>
                <ul className="ops-list" style={{ listStyle: 'none', padding: 0 }}>
                  {materials.materials.map((m) => {
                    const entryId = `mat_${m.id}_core`
                    const entry = knowledge.entries.find((e) => e.id === entryId)
                    return (
                      <li key={m.id} className="material-item" style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                          <div>
                            <strong>{m.originalName}</strong>
                            <span style={{ marginLeft: 8, fontSize: 12 }}>
                              {m.subject} · {m.status} · 切片 {m.chunkCount} · {m.year}
                            </span>
                            {m.chapter && <small style={{ display: 'block', marginTop: 4 }}>章节标签：{m.chapter}</small>}
                          </div>
                          {entry && (
                            <Link to={`/sources/entry/${entry.id}`} className="button" style={{ flexShrink: 0 }}>
                              查看详情
                            </Link>
                          )}
                        </div>
                        {entry ? (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>对应知识切片</div>
                            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{entry.topic} · {entry.status}</div>
                            <div style={{ color: 'var(--text)' }}>
                              {(entry.concept || '').slice(0, 280)}
                              {(entry.concept?.length ?? 0) > 280 ? '…' : ''}
                            </div>
                            {(entry.chapter || entry.syllabusCode) && (
                              <small style={{ display: 'block', marginTop: 4 }}>章节/考纲：{entry.chapter || ''} {entry.syllabusCode || ''}</small>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--muted)' }}>
                            未处理入库或暂无对应知识条目，请在教研页对该资料执行「处理入库」。
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {tab === 'policy' && (
          <div className="card" style={{ background: 'var(--bg-2)', padding: 16 }}>
            <h2>政策抓取结果（已导入知识库的会参与课程生成）</h2>
            <p className="tip">每条政策若已自动/手动导入知识库，会显示对应知识切片，可点「查看详情」核对条目。</p>
            {loading ? (
              <p>加载中…</p>
            ) : (
              <>
                <p>共 {policyItems.total} 条</p>
                <ul className="ops-list" style={{ listStyle: 'none', padding: 0 }}>
                  {policyItems.items.map((item) => {
                    const entry = knowledge.entries.find((e) => e.policyMeta?.sourceUrl === item.url)
                    return (
                      <li key={item.id} style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                          <div>
                            <strong>{item.title}</strong>
                            <span style={{ marginLeft: 8, fontSize: 12 }}>
                              {item.subject} · {item.sourceName}
                            </span>
                            {item.publishedAt && <small style={{ display: 'block', marginTop: 4 }}>发布时间：{item.publishedAt}</small>}
                            {item.summary && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>{item.summary.slice(0, 180)}{item.summary.length > 180 ? '…' : ''}</div>}
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, marginTop: 4, display: 'inline-block' }}>
                                原文链接
                              </a>
                            )}
                          </div>
                          {entry && (
                            <Link to={`/sources/entry/${entry.id}`} className="button" style={{ flexShrink: 0 }}>
                              查看详情
                            </Link>
                          )}
                        </div>
                        {entry ? (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>对应知识切片</div>
                            <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{entry.topic} · {entry.status}</div>
                            <div style={{ color: 'var(--text)' }}>
                              {(entry.concept || '').slice(0, 280)}
                              {(entry.concept?.length ?? 0) > 280 ? '…' : ''}
                            </div>
                            {(entry.chapter || entry.syllabusCode) && (
                              <small style={{ display: 'block', marginTop: 4 }}>章节/考纲：{entry.chapter || ''} {entry.syllabusCode || ''}</small>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--muted)' }}>
                            尚未导入知识库；开启「自动导入知识库」后新抓取的政策会自动生成条目。
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        {tab === 'courses' && (
          <div className="card" style={{ background: 'var(--bg-2)', padding: 16 }}>
            <h2>课程结构对照</h2>
            <p className="tip">生成课程时按「科目 → 章节 → 知识点 → 课时」匹配知识库与教材片段，可与上方来源对照。</p>
            {CPA_UNITS.map((unit) => (
              <details key={unit.id} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <summary style={{ fontWeight: 600, cursor: 'pointer' }}>
                  {unit.title}（{unit.subject}）
                </summary>
                <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                  {unit.lessons?.map((l) => (
                    <li key={l.id}>
                      <strong>{l.title}</strong> — {l.objective?.slice(0, 50)}
                      {(l.objective?.length ?? 0) > 50 ? '…' : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
