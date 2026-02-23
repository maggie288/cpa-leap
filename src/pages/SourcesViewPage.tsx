import { useCallback, useEffect, useState } from 'react'
import { CPA_UNITS } from '../data/cpaCatalog'
import { knowledgeApi, materialsApi, policyScoutApi } from '../lib/api'
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
  const [tab, setTab] = useState<TabId>('knowledge')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
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
        const res = await materialsApi.list({ subject: subject || undefined, status: undefined })
        setMaterials(res)
      } else if (tab === 'policy') {
        const res = await policyScoutApi.items({ limit: 200, subject: subject || undefined })
        setPolicyItems(res)
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

  return (
    <div className="page">
      <section className="card">
        <h1>知识来源总览</h1>
        <p className="tip">
          用于对照生产课程内容：下方为已入库的知识条目、上传的 PDF 资料、政策抓取结果及课程结构，便于核对 AI 生成课程所引用的资料来源。
        </p>

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
                    <li key={entry.id} className="material-item" style={{ marginBottom: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
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
            {loading ? (
              <p>加载中…</p>
            ) : (
              <>
                <p>共 {materials.total} 个资料</p>
                <ul className="ops-list" style={{ listStyle: 'none', padding: 0 }}>
                  {materials.materials.map((m) => (
                    <li key={m.id} className="material-item" style={{ marginBottom: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                      <strong>{m.originalName}</strong>
                      <span style={{ marginLeft: 8, fontSize: 12 }}>
                        {m.subject} · {m.status} · 切片 {m.chunkCount} · {m.year}
                      </span>
                      {m.chapter && <small style={{ display: 'block', marginTop: 4 }}>章节标签：{m.chapter}</small>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {tab === 'policy' && (
          <div className="card" style={{ background: 'var(--bg-2)', padding: 16 }}>
            <h2>政策抓取结果（已导入知识库的会参与课程生成）</h2>
            {loading ? (
              <p>加载中…</p>
            ) : (
              <>
                <p>共 {policyItems.total} 条</p>
                <ul className="ops-list" style={{ listStyle: 'none', padding: 0 }}>
                  {policyItems.items.map((item) => (
                    <li key={item.id} style={{ marginBottom: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                      <strong>{item.title}</strong>
                      <span style={{ marginLeft: 8, fontSize: 12 }}>
                        {item.subject} · {item.sourceName}
                      </span>
                      {item.publishedAt && <small style={{ display: 'block', marginTop: 4 }}>发布时间：{item.publishedAt}</small>}
                      {item.summary && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>{item.summary.slice(0, 180)}…</div>}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, marginTop: 4, display: 'inline-block' }}>
                          原文链接
                        </a>
                      )}
                    </li>
                  ))}
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
