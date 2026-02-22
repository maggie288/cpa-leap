const hasUniqueOptions = (options) => new Set(options).size === options.length

export const validateAndRepairQuestions = (questions) => {
  return (questions || [])
    .filter((q) => q && typeof q.stem === 'string')
    .map((q, idx) => {
      const safeOptions = Array.isArray(q.options) ? q.options.slice(0, 4) : []
      const repairedOptions =
        safeOptions.length === 4 && hasUniqueOptions(safeOptions)
          ? safeOptions
          : ['选项A', '选项B', '选项C', '选项D']

      let answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : 0
      if (answerIndex < 0 || answerIndex > 3) answerIndex = 0

      return {
        id: q.id || `kb-q-${idx + 1}`,
        stem: String(q.stem).trim(),
        options: repairedOptions,
        answerIndex,
        explanation: String(q.explanation || '根据知识点规则判断正确选项。'),
        difficulty: [1, 2, 3, 4, 5].includes(q.difficulty) ? q.difficulty : 2,
      }
    })
}
