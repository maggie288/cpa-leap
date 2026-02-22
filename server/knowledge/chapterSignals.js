const CHAPTER_SIGNAL_MAP = {
  'accounting-ch-1': { syllabusPrefixes: ['ACC-BAS'], chapterKeywords: ['会计基础', '概念框架', '会计政策'] },
  'accounting-ch-2': { syllabusPrefixes: ['ACC-FIN', 'ACC-REV'], chapterKeywords: ['金融资产', '收入', '合同成本'] },
  'accounting-ch-3': { syllabusPrefixes: ['ACC-FA', 'ACC-INT', 'ACC-IMP'], chapterKeywords: ['长期资产', '固定资产', '无形资产', '减值'] },
  'accounting-ch-4': { syllabusPrefixes: ['ACC-LIA', 'ACC-EQ'], chapterKeywords: ['负债', '借款费用', '所有者权益'] },
  'accounting-ch-5': { syllabusPrefixes: ['ACC-RPT', 'ACC-CFS'], chapterKeywords: ['财务报告', '现金流量表', '合并'] },
  'tax-ch-1': { syllabusPrefixes: ['TAX-VAT'], chapterKeywords: ['增值税'] },
  'tax-ch-2': { syllabusPrefixes: ['TAX-CT', 'TAX-SUR'], chapterKeywords: ['消费税', '附加税', '资源税'] },
  'tax-ch-3': { syllabusPrefixes: ['TAX-CIT'], chapterKeywords: ['企业所得税', '纳税调整', '税收优惠'] },
  'tax-ch-4': { syllabusPrefixes: ['TAX-IIT', 'TAX-STP'], chapterKeywords: ['个人所得税', '印花税'] },
  'tax-ch-5': { syllabusPrefixes: ['TAX-ADM'], chapterKeywords: ['税收征管', '发票管理', '税务检查'] },
}

export const resolveChapterSignals = ({ subject, chapterId }) => {
  if (!chapterId) return { syllabusPrefixes: [], chapterKeywords: [] }
  const direct = CHAPTER_SIGNAL_MAP[String(chapterId)]
  if (direct) return direct
  const bySubject = Object.entries(CHAPTER_SIGNAL_MAP).find(([id]) => id.startsWith(`${subject}-`) && id === chapterId)
  return bySubject?.[1] || { syllabusPrefixes: [], chapterKeywords: [] }
}

