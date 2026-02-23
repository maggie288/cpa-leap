import dayjs from 'dayjs'
import { db } from '../db.js'
import { createRevisionDraftsFromEntryId, upsertKnowledgeEntries } from '../knowledge/repository.js'

const SUBJECT_CODE = {
  accounting: 'ACC',
  audit: 'AUD',
  finance: 'FIN',
  tax: 'TAX',
  law: 'LAW',
  strategy: 'STR',
}
const VALID_SUBJECTS = new Set(['accounting', 'audit', 'finance', 'tax', 'law', 'strategy'])

const DEFAULT_SOURCES = [
  {
    id: 'cn-mof',
    name: '中国财政部',
    publisher: '财政部',
    url: 'https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/',
    format: 'html',
    subject: 'accounting',
    topicHint: '财务准则变更',
    region: 'CN',
    sourceTier: 1,
  },
  {
    id: 'cn-chinatax',
    name: '国家税务总局',
    publisher: '国家税务总局',
    url: 'https://www.chinatax.gov.cn/chinatax/n810341/n810825/index.html',
    format: 'html',
    subject: 'tax',
    topicHint: '税收政策更新',
    region: 'CN',
    sourceTier: 1,
  },
  {
    id: 'uk-hmrc',
    name: 'HM Revenue & Customs',
    publisher: 'HMRC',
    url: 'https://www.gov.uk/government/organisations/hm-revenue-customs.atom',
    format: 'rss',
    subject: 'tax',
    topicHint: 'global tax policy',
    region: 'UK',
    sourceTier: 1,
  },
  {
    id: 'ifrs-news',
    name: 'IFRS Foundation Updates',
    publisher: 'IFRS Foundation',
    url: 'https://www.ifrs.org/news-and-events/updates/?feed=rss',
    format: 'rss',
    subject: 'accounting',
    topicHint: 'financial reporting standards',
    region: 'GLOBAL',
    sourceTier: 1,
  },
]

const stripTags = (input) =>
  String(input || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const decodeHtml = (input) =>
  String(input || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

const hashString = (input) => {
  const text = String(input || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const pickTag = (xml, tagName) => {
  const hit = String(xml || '').match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return decodeHtml(stripTags(hit?.[1] || ''))
}

const pickAtomLink = (xml) => {
  const hit = String(xml || '').match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)
  return decodeHtml((hit?.[1] || '').trim())
}

const parseRssLike = (raw, source) => {
  const text = String(raw || '')
  const blocks = [...text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0])
  const rows = []
  for (const block of blocks) {
    const title = pickTag(block, 'title')
    const link = pickTag(block, 'link') || pickAtomLink(block)
    const publishedAtRaw = pickTag(block, 'pubDate') || pickTag(block, 'updated') || pickTag(block, 'published')
    const publishedAt = dayjs(publishedAtRaw)
    const summary = pickTag(block, 'description') || pickTag(block, 'summary') || pickTag(block, 'content')
    if (!title || !link) continue
    rows.push({
      sourceId: source.id,
      sourceName: source.name,
      publisher: source.publisher || source.name,
      subject: source.subject || 'tax',
      topicHint: source.topicHint || '',
      region: normalizeRegion(source),
      title: title.slice(0, 180),
      url: link,
      publishedAt: publishedAt.isValid() ? publishedAt.toISOString() : dayjs().toISOString(),
      summary: summary.slice(0, 600),
    })
  }
  return rows
}

const parseSimpleHtml = (raw, source) => {
  const html = String(raw || '')
  const rows = []
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  for (const [, hrefRaw, labelRaw] of links) {
    const title = decodeHtml(stripTags(labelRaw))
    if (title.length < 8) continue
    const href = decodeHtml(hrefRaw)
    const absolute = href.startsWith('http') ? href : new URL(href, source.url).toString()
    if (!/^https?:\/\//.test(absolute)) continue
    rows.push({
      sourceId: source.id,
      sourceName: source.name,
      publisher: source.publisher || source.name,
      subject: source.subject || 'tax',
      topicHint: source.topicHint || '',
      region: normalizeRegion(source),
      title: title.slice(0, 180),
      url: absolute,
      publishedAt: dayjs().toISOString(),
      summary: '',
    })
  }
  return rows
}

const normalizeItems = (items, maxItems) => {
  const unique = new Map()
  for (const item of items) {
    const dedupeKey = item.url || `${item.sourceId}:${item.title}`
    if (!unique.has(dedupeKey)) unique.set(dedupeKey, item)
  }
  return Array.from(unique.values()).slice(0, maxItems)
}

const detectEffectiveAt = (text, fallback) => {
  const content = String(text || '')
  const cnDate = content.match(/(20\d{2}年\d{1,2}月\d{1,2}日)/)
  const isoDate = content.match(/(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/)
  const cnEffective = content.match(/(?:自|于|从)?(20\d{2}年\d{1,2}月\d{1,2}日).{0,8}(?:起)?(?:施行|实施|生效)/)
  const isoEffective = content.match(/(?:effective(?:\s+from)?|valid(?:\s+from)?)\s*(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/i)
  const hit = cnEffective?.[1] || isoEffective?.[1] || cnDate?.[1] || isoDate?.[1] || ''
  if (!hit) return fallback
  return hit.replace(/\//g, '-')
}

const detectApplicableScope = (text) => {
  const content = String(text || '')
  const cn = content.match(/(?:适用于|适用范围|适用对象)[:：]?\s*([^。；;\n]{4,80})/)
  if (cn?.[1]) return cn[1].trim()
  const en = content.match(/(?:applies to|applicable to)\s+([^.;\n]{4,80})/i)
  if (en?.[1]) return en[1].trim()
  return ''
}

const detectExpiresAt = (text) => {
  const content = String(text || '')
  const cn = content.match(/(?:至|到)(20\d{2}年\d{1,2}月\d{1,2}日)(?:止|结束)/)
  if (cn?.[1]) return cn[1].replace(/\//g, '-')
  const en = content.match(/(?:until|expire(?:s|d)?\s+on)\s*(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/i)
  if (en?.[1]) return en[1].replace(/\//g, '-')
  return ''
}

const normalizeRegion = (source) => {
  const raw = String(source.region || '').trim().toUpperCase()
  if (raw) return raw
  if (String(source.id || '').startsWith('cn-')) return 'CN'
  if (String(source.id || '').startsWith('uk-')) return 'UK'
  return 'GLOBAL'
}

const buildPolicyKnowledgeEntry = (item) => {
  const dateCode = dayjs(item.publishedAt || dayjs().toISOString()).format('YYYYMMDD')
  const base = `${item.sourceId}|${item.url}|${item.title}`
  const hash = hashString(base).slice(0, 6)
  const subjectCode = SUBJECT_CODE[item.subject] || 'GEN'
  const topic = item.title.slice(0, 100)
  const summary = item.summary || `${topic}（来源：${item.publisher}）`
  const tags = Array.from(
    new Set(
      `${topic} ${item.topicHint || ''} ${item.publisher || ''}`
        .split(/[，。、；;,.!！?？:\s]+/g)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2),
    ),
  ).slice(0, 8)
  const mergedText = `${topic} ${summary}`
  const effectiveAt = detectEffectiveAt(mergedText, '')
  const expiresAt = detectExpiresAt(mergedText)
  const applicableScope = detectApplicableScope(mergedText)
  const publishedAt = dayjs(item.publishedAt).isValid() ? dayjs(item.publishedAt).toISOString() : dayjs().toISOString()

  return {
    id: `policy_${item.sourceId}_${hash}`,
    subject: item.subject,
    chapter: `政策跟踪/${item.publisher || item.sourceName}`,
    syllabusCode: `${subjectCode}-POL-${dateCode}-${hash}`,
    examYear: dayjs(publishedAt).format('YYYY'),
    topic,
    keywords: tags,
    concept:
      summary.length >= 20
        ? summary
        : `${topic}已发布，建议结合原文识别适用范围、时间口径与执行边界。来源：${item.url}`,
    rules: [
      `政策/准则解读应以官方原文为准：${item.url}`,
      '生成课程时需标注“发布日期、生效时间、适用对象”三要素。',
    ],
    pitfalls: ['仅看二手解读而忽略官方口径', '忽略生效日期与过渡期安排'],
    miniCase: `案例：企业遇到“${topic}”相关业务时，先核对官方原文后再确定处理方案。`,
    status: 'review',
    sourceTier: Number(item.sourceTier || 1),
    effectiveAt: effectiveAt ? dayjs(effectiveAt).toISOString() : '',
    expiresAt: expiresAt ? dayjs(expiresAt).toISOString() : '',
    policyMeta: {
      sourceName: item.sourceName,
      publisher: item.publisher,
      sourceUrl: item.url,
      publishedAt,
      effectiveAt,
      applicableScope,
      region: item.region || 'GLOBAL',
    },
  }
}

const parseSourcesFromSettings = (settings) => {
  const safeSettings = settings && typeof settings === 'object' ? settings : db.data.policyScoutSettings || {}
  const candidates = Array.isArray(safeSettings.sources) && safeSettings.sources.length ? safeSettings.sources : DEFAULT_SOURCES
  return candidates
    .map((src) => ({
      ...src,
      id: String(src.id || '').trim(),
      name: String(src.name || '').trim(),
      url: String(src.url || '').trim(),
      format: String(src.format || 'html').trim().toLowerCase() === 'rss' ? 'rss' : 'html',
      subject: VALID_SUBJECTS.has(String(src.subject || '').trim()) ? String(src.subject).trim() : 'tax',
      publisher: String(src.publisher || '').trim(),
      topicHint: String(src.topicHint || '').trim(),
      region: String(src.region || '').trim().toUpperCase(),
      sourceTier: [1, 2, 3].includes(Number(src.sourceTier || 0)) ? Number(src.sourceTier) : 1,
    }))
    .filter((src) => src.id && src.name && src.url)
}

export const getPolicyScoutSettings = () => {
  const base = db.data.policyScoutSettings || {}
  return {
    enabled: base.enabled !== false,
    intervalMinutes: Number(base.intervalMinutes || 360),
    maxItemsPerSource: Number(base.maxItemsPerSource || 8),
    autoImportToKnowledge: base.autoImportToKnowledge !== false,
    alertEnabled: base.alertEnabled === true,
    alertFailureThreshold: Math.max(1, Number(base.alertFailureThreshold || 3)),
    alertCooldownMinutes: Math.max(5, Number(base.alertCooldownMinutes || 180)),
    alertWebhookUrl: String(base.alertWebhookUrl || '').trim(),
    sources: parseSourcesFromSettings(base),
  }
}

export const updatePolicyScoutSettings = async (patch = {}) => {
  const current = getPolicyScoutSettings()
  const next = {
    ...current,
    ...(typeof patch === 'object' ? patch : {}),
  }
  next.enabled = next.enabled !== false
  next.intervalMinutes = Math.min(24 * 60, Math.max(15, Number(next.intervalMinutes || 360)))
  next.maxItemsPerSource = Math.min(20, Math.max(1, Number(next.maxItemsPerSource || 8)))
  next.autoImportToKnowledge = next.autoImportToKnowledge !== false
  next.alertEnabled = next.alertEnabled === true
  next.alertFailureThreshold = Math.min(10, Math.max(1, Number(next.alertFailureThreshold || 3)))
  next.alertCooldownMinutes = Math.min(7 * 24 * 60, Math.max(5, Number(next.alertCooldownMinutes || 180)))
  next.alertWebhookUrl = String(next.alertWebhookUrl || '').trim()
  next.sources = parseSourcesFromSettings(next)
  db.data.policyScoutSettings = next
  await db.write()
  return next
}

const buildSourceHealth = (runs, sources) => {
  const sourceHealthMap = new Map(
    sources.map((src) => [
      src.id,
      {
        sourceId: src.id,
        sourceName: src.name,
        url: src.url,
        successCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        lastStatus: 'never',
        lastSuccessAt: '',
        lastFailureAt: '',
        lastError: '',
        avgFetchedPerRun: 0,
        totalFetched: 0,
        runCount: 0,
      },
    ]),
  )

  const orderedRuns = [...runs].sort((a, b) => dayjs(a.startedAt).valueOf() - dayjs(b.startedAt).valueOf())
  for (const run of orderedRuns) {
    for (const report of run.sourceReports || []) {
      if (!sourceHealthMap.has(report.sourceId)) {
        sourceHealthMap.set(report.sourceId, {
          sourceId: report.sourceId,
          sourceName: report.sourceName || report.sourceId,
          url: report.sourceUrl || '',
          successCount: 0,
          failureCount: 0,
          consecutiveFailures: 0,
          lastStatus: 'never',
          lastSuccessAt: '',
          lastFailureAt: '',
          lastError: '',
          avgFetchedPerRun: 0,
          totalFetched: 0,
          runCount: 0,
        })
      }
      const row = sourceHealthMap.get(report.sourceId)
      row.runCount += 1
      row.totalFetched += Number(report.fetchedCount || 0)
      if (report.ok) {
        row.successCount += 1
        row.lastStatus = 'ok'
        row.lastSuccessAt = run.finishedAt || run.startedAt
        row.consecutiveFailures = 0
      } else {
        row.failureCount += 1
        row.lastStatus = 'failed'
        row.lastFailureAt = run.finishedAt || run.startedAt
        row.lastError = report.error || ''
        row.consecutiveFailures += 1
      }
    }
  }
  return Array.from(sourceHealthMap.values())
    .map((row) => ({
      ...row,
      avgFetchedPerRun: row.runCount ? Number((row.totalFetched / row.runCount).toFixed(2)) : 0,
      successRate: row.runCount ? Number(((row.successCount / row.runCount) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.consecutiveFailures - a.consecutiveFailures || a.sourceId.localeCompare(b.sourceId))
}

export const getPolicyScoutStats = () => {
  const settings = getPolicyScoutSettings()
  const runs = db.data.policyScoutRuns || []
  const items = db.data.policyScoutItems || []
  const bySource = {}
  const bySubject = {}
  for (const row of items) {
    bySource[row.sourceId] = (bySource[row.sourceId] || 0) + 1
    bySubject[row.subject] = (bySubject[row.subject] || 0) + 1
  }
  const sourceHealth = buildSourceHealth(runs, settings.sources)
  const alerts = (db.data.policyScoutAlerts || []).slice(-50).reverse()

  return {
    totalRuns: runs.length,
    totalItems: items.length,
    latestRun: runs[runs.length - 1] || null,
    bySource,
    bySubject,
    sourceHealth,
    alerts,
  }
}

export const listPolicyScoutRuns = (limit = 20) => (db.data.policyScoutRuns || []).slice(-limit).reverse()

export const listPolicyScoutItems = ({ limit = 100, subject } = {}) => {
  let list = (db.data.policyScoutItems || []).slice().reverse()
  if (subject && String(subject).trim()) {
    list = list.filter((row) => String(row.subject || '').toLowerCase() === String(subject).toLowerCase().trim())
  }
  const cap = Math.max(1, Math.min(500, Number(limit) || 100))
  return list.slice(0, cap)
}

const sendAlertWebhook = async ({ webhookUrl, payload }) => {
  if (!webhookUrl) return { ok: false, reason: 'missing_webhook_url' }
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'webhook_failed' }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const acquireSchedulerLock = async ({ key, holder, ttlSeconds = 300 }) => {
  db.data.schedulerLocks ||= {}
  const now = dayjs().valueOf()
  const current = db.data.schedulerLocks[key]
  if (current && Number(current.expiresAtMs || 0) > now && current.holder !== holder) return { ok: false, lock: current }
  const next = {
    key,
    holder,
    acquiredAt: dayjs().toISOString(),
    expiresAtMs: now + ttlSeconds * 1000,
  }
  db.data.schedulerLocks[key] = next
  await db.write()
  return { ok: true, lock: next }
}

const releaseSchedulerLock = async ({ key, holder }) => {
  db.data.schedulerLocks ||= {}
  const current = db.data.schedulerLocks[key]
  if (current?.holder === holder) {
    delete db.data.schedulerLocks[key]
    await db.write()
  }
}

const fetchWithRetry = async ({ url, maxAttempts = 3 }) => {
  let lastError = null
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'CPA-Leap-PolicyScout/1.0 (+knowledge-ingest)' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      return { ok: true, text, attempts: i + 1 }
    } catch (error) {
      lastError = error
      if (i < maxAttempts - 1) await sleep(300 * (i + 1))
    }
  }
  return { ok: false, error: lastError instanceof Error ? lastError.message : 'fetch failed', attempts: maxAttempts }
}

export const runPolicyScoutOnce = async ({ actor = 'system', reason = 'manual' } = {}) => {
  const lockHolder = `policy-scout:${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const lockRes = await acquireSchedulerLock({ key: 'policy-scout', holder: lockHolder, ttlSeconds: 600 })
  if (!lockRes.ok) {
    return {
      runId: `policy_skipped_${Date.now()}`,
      skipped: true,
      reason: 'lock_not_acquired',
      holder: lockRes.lock?.holder || '',
      fetchedCount: 0,
      newItemCount: 0,
      importedCount: 0,
      errors: ['lock_not_acquired'],
    }
  }
  try {
  const settings = getPolicyScoutSettings()
  const startedAt = dayjs().toISOString()
  const runId = `policy_run_${Date.now()}`
  const run = {
    runId,
    actor,
    reason,
    startedAt,
    finishedAt: null,
    sourceCount: 0,
    fetchedCount: 0,
    newItemCount: 0,
    importedCount: 0,
    errors: [],
    sourceReports: [],
  }
  db.data.policyScoutRuns ||= []
  db.data.policyScoutItems ||= []
  db.data.policyScoutAlerts ||= []
  db.data.policySourceSnapshots ||= []
  db.data.policyScoutDeadLetters ||= []

  const knownMap = new Map((db.data.policyScoutItems || []).map((x) => [x.url || x.id, x]))
  const newItems = []

  for (const source of settings.sources) {
    run.sourceCount += 1
    const sourceStartedAt = Date.now()
    const sourceReport = {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      ok: false,
      fetchedCount: 0,
      newItemCount: 0,
      durationMs: 0,
      error: '',
    }
    try {
      const fetched = await fetchWithRetry({ url: source.url, maxAttempts: 3 })
      if (!fetched.ok) throw new Error(fetched.error || 'fetch failed')
      const raw = fetched.text
      const parsed = source.format === 'rss' ? parseRssLike(raw, source) : parseSimpleHtml(raw, source)
      const normalized = normalizeItems(parsed, settings.maxItemsPerSource)
      run.fetchedCount += normalized.length
      sourceReport.fetchedCount = normalized.length
      for (const item of normalized) {
        const key = item.url || `${item.sourceId}:${item.title}`
        if (knownMap.has(key)) continue
        const id = `pol_item_${hashString(`${item.sourceId}|${item.url}|${item.title}`)}`
        const row = {
          id,
          ...item,
          sourceTier: [1, 2, 3].includes(Number(source.sourceTier || 0)) ? Number(source.sourceTier) : 1,
          capturedAt: dayjs().toISOString(),
          runId,
        }
        knownMap.set(key, row)
        newItems.push(row)
        db.data.policySourceSnapshots.push({
          id: `snapshot_${id}`,
          sourceId: source.id,
          sourceName: source.name,
          url: item.url,
          title: item.title,
          summary: String(item.summary || '').slice(0, 1200),
          publishedAt: item.publishedAt || '',
          capturedAt: dayjs().toISOString(),
          contentHash: hashString(`${item.title}|${item.summary || ''}|${item.url}`),
          runId,
        })
        sourceReport.newItemCount += 1
      }
      sourceReport.ok = true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'fetch failed'
      run.errors.push(`${source.name}: ${message}`)
      sourceReport.error = message
      db.data.policyScoutDeadLetters.push({
        id: `dead_${Date.now()}_${source.id}`,
        runId,
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: source.url,
        error: message,
        at: dayjs().toISOString(),
      })
    } finally {
      sourceReport.durationMs = Date.now() - sourceStartedAt
      run.sourceReports.push(sourceReport)
    }
  }

  run.newItemCount = newItems.length
  db.data.policyScoutItems.push(...newItems)

  if (settings.autoImportToKnowledge && newItems.length > 0) {
    const entries = newItems.map(buildPolicyKnowledgeEntry)
    const importRes = upsertKnowledgeEntries({ entries, actor: `policy-scout:${actor}` })
    run.importedCount = importRes.acceptedCount || 0
    db.data.knowledgeRevisionDrafts ||= []
    const drafts = (importRes.acceptedIds || []).flatMap((entryId) => createRevisionDraftsFromEntryId({ entryId, limit: 3 }))
    const existing = new Set(
      (db.data.knowledgeRevisionDrafts || [])
        .filter((item) => item.status === 'pending')
        .map((item) => `${item.sourceEntryId}|${item.targetEntryId}`),
    )
    for (const draft of drafts) {
      const key = `${draft.sourceEntryId}|${draft.targetEntryId}`
      if (existing.has(key)) continue
      existing.add(key)
      db.data.knowledgeRevisionDrafts.push(draft)
    }
    db.data.knowledgeRevisionDrafts = db.data.knowledgeRevisionDrafts.slice(-2000)
  }

  run.finishedAt = dayjs().toISOString()
  db.data.policyScoutRuns.push(run)
  db.data.policyScoutRuns = db.data.policyScoutRuns.slice(-200)
  db.data.policyScoutItems = db.data.policyScoutItems.slice(-3000)
  db.data.policySourceSnapshots = db.data.policySourceSnapshots.slice(-6000)
  db.data.policyScoutDeadLetters = db.data.policyScoutDeadLetters.slice(-2000)

  const sourceHealth = buildSourceHealth(db.data.policyScoutRuns, settings.sources)
  const failedSources = sourceHealth.filter((row) => row.consecutiveFailures >= settings.alertFailureThreshold)
  if (settings.alertEnabled && failedSources.length > 0) {
    for (const row of failedSources) {
      const recentAlert = [...db.data.policyScoutAlerts]
        .reverse()
        .find((item) => item.sourceId === row.sourceId && item.status === 'sent')
      const lastSentAt = recentAlert?.sentAt ? dayjs(recentAlert.sentAt) : null
      const cooling = lastSentAt ? dayjs().diff(lastSentAt, 'minute') < settings.alertCooldownMinutes : false
      if (cooling) continue

      const alertId = `pol_alert_${Date.now()}_${row.sourceId}`
      const payload = {
        type: 'policy_source_unhealthy',
        at: dayjs().toISOString(),
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        consecutiveFailures: row.consecutiveFailures,
        successRate: row.successRate,
        lastError: row.lastError,
        runId: run.runId,
      }
      const sent = await sendAlertWebhook({
        webhookUrl: settings.alertWebhookUrl,
        payload,
      })
      db.data.policyScoutAlerts.push({
        id: alertId,
        at: dayjs().toISOString(),
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        runId: run.runId,
        severity: row.consecutiveFailures >= settings.alertFailureThreshold + 2 ? 'high' : 'medium',
        status: sent.ok ? 'sent' : 'failed',
        message: `来源 ${row.sourceName} 连续失败 ${row.consecutiveFailures} 次`,
        detail: row.lastError || '',
        webhookResult: sent,
        sentAt: sent.ok ? dayjs().toISOString() : '',
      })
    }
  }
  db.data.policyScoutAlerts = db.data.policyScoutAlerts.slice(-500)
  await db.write()
  return run
  } finally {
    await releaseSchedulerLock({ key: 'policy-scout', holder: lockHolder })
  }
}

let policyTimer = null

export const startPolicyScoutScheduler = () => {
  if (policyTimer) clearInterval(policyTimer)
  const settings = getPolicyScoutSettings()
  if (!settings.enabled) return
  const intervalMs = settings.intervalMinutes * 60 * 1000
  policyTimer = setInterval(() => {
    void runPolicyScoutOnce({ actor: 'scheduler', reason: 'timer' })
  }, intervalMs)
}

