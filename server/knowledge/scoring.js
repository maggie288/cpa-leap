const clamp = (num, min, max) => Math.min(max, Math.max(min, num))

const hasEnough = (arr, min) => Array.isArray(arr) && arr.filter(Boolean).length >= min
const parseTime = (value) => {
  if (!value) return null
  const t = new Date(String(value)).getTime()
  return Number.isFinite(t) ? t : null
}

export const evaluateKnowledgeQuality = (entry) => {
  let score = 40
  const issues = []

  if (entry.topic && String(entry.topic).trim().length >= 4) score += 8
  else issues.push('topic过短或缺失')

  if (entry.concept && String(entry.concept).trim().length >= 20) score += 12
  else issues.push('concept信息不足')

  if (hasEnough(entry.rules, 2)) score += 14
  else if (hasEnough(entry.rules, 1)) {
    score += 6
    issues.push('rules建议至少2条')
  } else {
    issues.push('rules缺失')
  }

  if (hasEnough(entry.pitfalls, 2)) score += 10
  else if (hasEnough(entry.pitfalls, 1)) {
    score += 5
    issues.push('pitfalls建议至少2条')
  } else {
    issues.push('pitfalls缺失')
  }

  if (hasEnough(entry.keywords, 4)) score += 8
  else issues.push('keywords覆盖不足')

  if (entry.miniCase && String(entry.miniCase).trim().length >= 16) score += 8
  else issues.push('miniCase信息不足')

  if (entry.chapter) score += 4
  else issues.push('chapter缺失')

  if (entry.syllabusCode) score += 4
  else issues.push('syllabusCode缺失')

  if (entry.examYear) score += 2
  else issues.push('examYear缺失')

  const sourceTier = Number(entry.sourceTier || 2)
  if ([1, 2, 3].includes(sourceTier)) score += sourceTier === 1 ? 4 : sourceTier === 2 ? 2 : 0
  else issues.push('sourceTier非法')

  const now = Date.now()
  const effectiveAt = parseTime(entry.effectiveAt || entry.policyMeta?.effectiveAt)
  const expiresAt = parseTime(entry.expiresAt)
  const notYetEffective = effectiveAt && effectiveAt > now
  const expired = expiresAt && expiresAt <= now
  if (notYetEffective) issues.push('条目尚未生效')
  if (expired) issues.push('条目已过期')

  return {
    score: clamp(score, 0, 100),
    issues,
    passForGeneration: score >= 85 && !notYetEffective && !expired,
  }
}
