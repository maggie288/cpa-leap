import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { knowledgeApi } from '../lib/api'
import type { KnowledgeEntry } from '../types'

const SUBJECT_NAMES: Record<string, string> = {
  accounting: '会计',
  audit: '审计',
  finance: '财管',
  tax: '税法',
  law: '经济法',
  strategy: '战略',
}

function sourceLabel(entry: KnowledgeEntry): string {
  if (entry.id.startsWith('mat_')) return '教材（PDF 处理入库）'
  if (entry.policyMeta?.sourceUrl || (entry.topic || '').includes('政策')) return '政策抓取'
  if ((entry.topic || '').includes('AI生成')) return 'AI生成'
  return '知识库'
}

export function KnowledgeEntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    knowledgeApi
      .getById(id)
      .then((res) => {
        if (!cancelled) setEntry(res.entry)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="page">
        <p className="tip">加载中…</p>
        <Link to="/sources">返回资料总览</Link>
      </div>
    )
  }

  if (error || !entry) {
    return (
      <div className="page">
        <p className="wrong">{error || '条目不存在'}</p>
        <Link to="/sources">返回资料总览</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>知识条目详情</h1>
          <Link to="/sources" className="button ghost">返回资料总览</Link>
        </div>

        <dl className="detail-dl" style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
          <div>
            <dt style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>ID</dt>
            <dd style={{ margin: 0, fontFamily: 'monospace', fontSize: 13 }}>{entry.id}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>来源</dt>
            <dd style={{ margin: 0 }}>{sourceLabel(entry)}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>科目</dt>
            <dd style={{ margin: 0 }}>{SUBJECT_NAMES[entry.subject] || entry.subject}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>状态</dt>
            <dd style={{ margin: 0 }}>{entry.status}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>章节</dt>
            <dd style={{ margin: 0 }}>{entry.chapter || '—'}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>考纲代码</dt>
            <dd style={{ margin: 0 }}>{entry.syllabusCode || '—'}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>标题（topic）</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{entry.topic || '—'}</dd>
          </div>
        </dl>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>概念与要点（concept）</h2>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 12, background: 'var(--bg-2)', borderRadius: 8 }}>
            {entry.concept || '—'}
          </div>
        </section>

        {(entry.keywords?.length ?? 0) > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>关键词</h2>
            <p style={{ margin: 0 }}>{(entry.keywords || []).join('、')}</p>
          </section>
        )}

        {(entry.rules?.length ?? 0) > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>规则与口径（rules）</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(entry.rules || []).map((r, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        {(entry.pitfalls?.length ?? 0) > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>易错点（pitfalls）</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(entry.pitfalls || []).map((p, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{p}</li>
              ))}
            </ul>
          </section>
        )}

        {entry.miniCase && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>小案例（miniCase）</h2>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: 12, background: 'var(--bg-2)', borderRadius: 8 }}>
              {entry.miniCase}
            </div>
          </section>
        )}

        {entry.policyMeta && (
          <section style={{ marginBottom: 24, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>政策来源信息</h2>
            <dl style={{ display: 'grid', gap: 6, margin: 0, fontSize: 13 }}>
              {entry.policyMeta.sourceName && <><dt style={{ color: 'var(--muted)' }}>来源名称</dt><dd style={{ margin: 0 }}>{entry.policyMeta.sourceName}</dd></>}
              {entry.policyMeta.publisher && <><dt style={{ color: 'var(--muted)' }}>发布方</dt><dd style={{ margin: 0 }}>{entry.policyMeta.publisher}</dd></>}
              {entry.policyMeta.publishedAt && <><dt style={{ color: 'var(--muted)' }}>发布日期</dt><dd style={{ margin: 0 }}>{entry.policyMeta.publishedAt}</dd></>}
              {entry.policyMeta.effectiveAt && <><dt style={{ color: 'var(--muted)' }}>生效时间</dt><dd style={{ margin: 0 }}>{entry.policyMeta.effectiveAt}</dd></>}
              {entry.policyMeta.applicableScope && <><dt style={{ color: 'var(--muted)' }}>适用范围</dt><dd style={{ margin: 0 }}>{entry.policyMeta.applicableScope}</dd></>}
              {entry.policyMeta.sourceUrl && (
                <>
                  <dt style={{ color: 'var(--muted)' }}>原文链接</dt>
                  <dd style={{ margin: 0 }}>
                    <a href={entry.policyMeta.sourceUrl} target="_blank" rel="noreferrer">打开原文</a>
                  </dd>
                </>
              )}
            </dl>
          </section>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/sources">返回资料总览</Link>
        </div>
      </section>
    </div>
  )
}
