import dayjs from 'dayjs'
import { upsertKnowledgeEntries } from '../knowledge/repository.js'

const year = String(dayjs().year())

const accountingBlueprint = [
  { chapter: '会计基础与概念框架', prefix: 'ACC-BAS', topics: ['会计要素确认边界', '会计信息质量可比性', '会计政策变更判断', '会计估计变更处理', '前期差错更正'] },
  { chapter: '金融资产与收入', prefix: 'ACC-REV', topics: ['履约义务识别', '交易价格分摊', '期间法与时点法', '合同成本资本化', '可变对价估计'] },
  { chapter: '长期资产与减值', prefix: 'ACC-IMP', topics: ['固定资产后续支出', '无形资产研发阶段', '资产组减值测试', '可收回金额判定', '减值损失确认'] },
  { chapter: '负债与所有者权益', prefix: 'ACC-LIA', topics: ['预计负债确认', '借款费用资本化', '可转换债券拆分', '权益工具分类', '利润分配限制'] },
  { chapter: '财务报告与合并', prefix: 'ACC-CFS', topics: ['合并范围判断', '内部交易抵销', '现金流量分类', '合并报表调整', '附注披露重点'] },
  { chapter: '所得税与特殊业务', prefix: 'ACC-TAX', topics: ['递延所得税资产', '递延所得税负债', '政府补助核算', '债务重组收益', '租赁会计处理'] },
]

const taxBlueprint = [
  { chapter: '增值税体系', prefix: 'TAX-VAT', topics: ['增值税计税方法', '进项税额抵扣条件', '进项税额转出情形', '销售额口径判定', '简易计税适用'] },
  { chapter: '消费税与附加税', prefix: 'TAX-CT', topics: ['消费税计税依据', '从价从量复合计税', '委托加工应税处理', '附加税费计提', '资源税征收范围'] },
  { chapter: '企业所得税', prefix: 'TAX-CIT', topics: ['纳税调整调增项目', '纳税调整调减项目', '税前扣除限额', '资产折旧摊销扣除', '税收优惠适用条件'] },
  { chapter: '个人所得税与印花税', prefix: 'TAX-IIT', topics: ['综合所得汇算清缴', '经营所得计税', '分类所得税率适用', '印花税应税凭证', '印花税减免情形'] },
  { chapter: '税收征管', prefix: 'TAX-ADM', topics: ['税务登记流程', '发票管理要求', '税务检查程序', '税务行政复议', '税收强制执行'] },
  { chapter: '国际税收与反避税', prefix: 'TAX-INT', topics: ['特别纳税调整', '受控外国企业规则', '转让定价基础', '协定待遇申请', '反避税一般规则'] },
]

const accountingSupplement = [
  {
    chapter: '会计基础与概念框架',
    prefix: 'ACC-P2A',
    topics: ['会计主体界定', '持续经营判断', '权责发生制边界', '实质重于形式应用', '谨慎性应用', '重要性判断', '会计信息可理解性', '会计确认与计量关系', '财务报表目标'],
  },
  {
    chapter: '财务报告与合并',
    prefix: 'ACC-P2B',
    topics: ['母子公司控制判定', '少数股东权益列示', '内部未实现损益抵销', '合并现金流处理', '同一控制下合并', '非同一控制下合并', '合并范围变化处理', '报表附注一致性', '合并报表常见错因'],
  },
]

const taxSupplement = [
  {
    chapter: '企业所得税',
    prefix: 'TAX-P2A',
    topics: ['收入总额确认', '成本费用归集', '亏损弥补规则', '资产损失税前扣除', '研发费用加计扣除', '高新技术企业优惠', '境外所得抵免', '特别重组税务处理', '汇算清缴风险点'],
  },
  {
    chapter: '税收征管',
    prefix: 'TAX-P2B',
    topics: ['纳税信用等级', '发票风险预警', '税务稽查应对', '电子发票管理', '税务违法责任', '欠税管理', '税收保全措施', '税务行政诉讼', '征管数字化趋势'],
  },
]

const auditBlueprint = [
  { chapter: '审计计划与风险评估', prefix: 'AUD-PLN', topics: ['审计目标映射', '重大错报风险识别', '计划重要性设定', '执行重要性应用', '风险应对总体策略'] },
  { chapter: '内部控制与测试', prefix: 'AUD-CTL', topics: ['控制设计有效性', '控制执行有效性', '穿行测试步骤', '控制测试抽样', '实质性程序衔接'] },
  { chapter: '审计证据', prefix: 'AUD-EVD', topics: ['充分性与适当性', '函证回函异常处理', '存货监盘关键点', '分析程序运用', '替代程序选择'] },
  { chapter: '特殊项目审计', prefix: 'AUD-SPC', topics: ['收入舞弊迹象', '关联方交易识别', '持续经营判断', '集团审计协调', '关键审计事项提炼'] },
  { chapter: '审计完成与报告', prefix: 'AUD-RPT', topics: ['期后事项审计', '书面声明获取', '审计意见判断', '非无保留意见条件', '报告结构披露'] },
  { chapter: '质量管理与职业道德', prefix: 'AUD-ETH', topics: ['独立性威胁识别', '质量管理体系', '项目复核机制', '职业怀疑保持', '职业判断偏差控制'] },
]

const financeBlueprint = [
  { chapter: '财务管理基础', prefix: 'FIN-BAS', topics: ['现值终值换算', '年金模型应用', '风险报酬估计', '必要报酬率', 'CAPM参数判断'] },
  { chapter: '筹资管理', prefix: 'FIN-FIN', topics: ['资本结构权衡', '财务杠杆效应', '债务融资成本', '权益融资成本', '股利政策影响'] },
  { chapter: '投资管理', prefix: 'FIN-INV', topics: ['增量现金流识别', '净现值判定', '内含报酬率限制', '互斥项目排序', '项目敏感性分析'] },
  { chapter: '营运资本管理', prefix: 'FIN-WC', topics: ['现金持有策略', '信用政策设定', '应收账款周转', '存货订货模型', '短期融资匹配'] },
  { chapter: '预算与绩效', prefix: 'FIN-BUD', topics: ['预算编制起点', '预算勾稽关系', '标准成本差异', '责任中心评价', '业绩考核修正'] },
  { chapter: '价值评估与专题', prefix: 'FIN-VAL', topics: ['企业价值驱动', '股权价值评估', '债券价值评估', '期权基础判断', '估值假设敏感性'] },
]

const lawBlueprint = [
  { chapter: '合同法律制度', prefix: 'LAW-CON', topics: ['要约承诺成立', '合同效力判断', '可撤销情形', '违约责任承担', '担保方式适用'] },
  { chapter: '公司法律制度', prefix: 'LAW-COR', topics: ['公司设立条件', '出资义务履行', '治理结构权责', '股权转让程序', '减资债权保护'] },
  { chapter: '证券法律制度', prefix: 'LAW-SEC', topics: ['证券发行条件', '信息披露义务', '要约收购规则', '内幕交易构成', '证券违法责任'] },
  { chapter: '票据与结算法律', prefix: 'LAW-BIL', topics: ['出票背书规则', '票据抗辩范围', '追索权行使', '支付结算合规', '票据风险防控'] },
  { chapter: '破产与竞争法', prefix: 'LAW-BNK', topics: ['破产申请受理', '债权申报程序', '破产财产分配', '反垄断规则', '不正当竞争认定'] },
  { chapter: '涉外与国资法律', prefix: 'LAW-INT', topics: ['涉外合同准据法', '跨境争议解决', '国资监管要求', '涉外投资合规', '涉外担保限制'] },
]

const strategyBlueprint = [
  { chapter: '战略分析', prefix: 'STR-ANA', topics: ['PEST拆解', '五力模型应用', '价值链识别', '资源能力评估', '竞争优势来源'] },
  { chapter: '战略选择', prefix: 'STR-SEL', topics: ['公司层战略选择', '业务层战略定位', '国际化进入模式', '多元化协同效应', '战略风险匹配'] },
  { chapter: '战略实施', prefix: 'STR-IMP', topics: ['组织结构匹配', '战略资源配置', '变革阻力管理', '流程重塑抓手', '战略沟通机制'] },
  { chapter: '风险管理', prefix: 'STR-RSK', topics: ['风险识别方法', '风险评估矩阵', '风险应对策略', '风险监控指标', '风险偏好设定'] },
  { chapter: '内部控制', prefix: 'STR-IC', topics: ['控制环境要素', '控制活动设计', '信息沟通机制', '监督评价流程', '内控缺陷整改'] },
  { chapter: '战略控制与评价', prefix: 'STR-CTL', topics: ['平衡计分卡设计', '战略KPI联动', '偏差分析闭环', '滚动复盘机制', '战略纠偏决策'] },
]

const buildEntry = ({ subject, chapter, prefix, topic, idx }) => {
  const id = `${subject}-${prefix.toLowerCase()}-${String(idx + 1).padStart(3, '0')}`
  return {
    id,
    subject,
    chapter,
    syllabusCode: `${prefix}-${String(idx + 1).padStart(3, '0')}`,
    examYear: year,
    topic,
    keywords: [topic, chapter, prefix, subject, 'CPA'].filter(Boolean),
    concept: `${topic}是${chapter}中的高频考点，需要先明确适用条件，再结合业务事实做规范判断与会计/税务处理。`,
    rules: [
      `处理${topic}时，先核对适用前提与口径，再进行结论判断。`,
      `${topic}答题应遵循“规则-条件-结论”链路，不可只记结论。`,
    ],
    pitfalls: [`忽略${topic}的前提条件`, `将${topic}与相近考点混淆`],
    miniCase: `案例：企业在${chapter}相关业务中涉及“${topic}”，需按规定确认、计量并完成申报/披露。`,
    status: 'approved',
  }
}

const buildEntries = (subject, blueprint) =>
  blueprint.flatMap((row, i) =>
    row.topics.map((topic, j) =>
      buildEntry({
        subject,
        chapter: row.chapter,
        prefix: row.prefix,
        topic,
        idx: i * row.topics.length + j,
      }),
    ),
  )

const main = () => {
  const accountingEntries = buildEntries('accounting', accountingBlueprint)
  const taxEntries = buildEntries('tax', taxBlueprint)
  const accountingExtra = buildEntries('accounting', accountingSupplement)
  const taxExtra = buildEntries('tax', taxSupplement)
  const auditEntries = buildEntries('audit', auditBlueprint)
  const financeEntries = buildEntries('finance', financeBlueprint)
  const lawEntries = buildEntries('law', lawBlueprint)
  const strategyEntries = buildEntries('strategy', strategyBlueprint)
  const entries = [
    ...accountingEntries,
    ...taxEntries,
    ...accountingExtra,
    ...taxExtra,
    ...auditEntries,
    ...financeEntries,
    ...lawEntries,
    ...strategyEntries,
  ]
  const result = upsertKnowledgeEntries({
    entries,
    actor: 'phase2-seed-script',
  })
  console.log(
    JSON.stringify(
      {
        generated: entries.length,
        acceptedCount: result.acceptedCount,
        rejectedCount: result.rejectedCount,
        total: result.total,
      },
      null,
      2,
    ),
  )
}

main()

