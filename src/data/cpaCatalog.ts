import type { Chapter, CourseUnit, KnowledgePoint } from '../types'

const makeQuestions = (topic: string, examPoints: string[]) => [
  {
    id: `${topic}-q1`,
    stem: `关于${examPoints[0] || topic}，下列说法正确的是？`,
    options: ['高估资产和收益', '低估负债和费用', '不高估资产、不低估负债', '仅按历史成本入账'],
    answerIndex: 2,
    explanation: '考试常见表述是“不高估资产或收益，不低估负债或费用”。',
    difficulty: 2 as const,
  },
  {
    id: `${topic}-q2`,
    stem: `在${examPoints[1] || topic}场景下，哪项处理更符合权责发生制？`,
    options: ['收到现金才确认收入', '发生经济业务时确认', '开票即确认全部收入', '期末统一冲减'],
    answerIndex: 1,
    explanation: '权责发生制强调业务发生与权利义务形成时点。',
    difficulty: 3 as const,
  },
]

const lesson = (
  id: string,
  subject: CourseUnit['subject'],
  chapterId: string,
  knowledgePointId: string,
  title: string,
  objective: string,
  examPoints: string[],
  estimatedMinutes: number,
) => ({
  id,
  subject,
  chapterId,
  knowledgePointId,
  title,
  objective,
  examPoints,
  estimatedMinutes,
  questions: makeQuestions(id, examPoints),
})

const UNIT_BLUEPRINT: Record<
  CourseUnit['subject'],
  Array<{ title: string; lessons: Array<{ title: string; objective: string; examPoints: string[] }> }>
> = {
  accounting: [
    { title: '会计基础与概念框架', lessons: [{ title: '会计要素与确认', objective: '掌握会计要素边界与确认条件', examPoints: ['会计要素', '确认条件'] }, { title: '会计信息质量要求', objective: '理解可靠性、相关性、可比性', examPoints: ['信息质量', '谨慎性'] }, { title: '会计政策与估计', objective: '区分政策变更与估计变更', examPoints: ['会计政策', '估计变更'] }] },
    { title: '金融资产与收入', lessons: [{ title: '金融资产分类', objective: '掌握摊余成本和公允价值分类', examPoints: ['金融资产分类', '后续计量'] }, { title: '收入确认五步法', objective: '会用五步法处理收入确认', examPoints: ['收入五步法', '履约义务'] }, { title: '合同成本与披露', objective: '掌握合同成本资本化与披露', examPoints: ['合同成本', '附注披露'] }] },
    { title: '长期资产与减值', lessons: [{ title: '固定资产与折旧', objective: '会做折旧与后续支出判断', examPoints: ['固定资产', '折旧'] }, { title: '无形资产与研发支出', objective: '区分研究阶段和开发阶段', examPoints: ['无形资产', '研发资本化'] }, { title: '资产减值测试', objective: '掌握可收回金额及减值计提', examPoints: ['资产减值', '可收回金额'] }] },
    { title: '负债与所有者权益', lessons: [{ title: '流动负债处理', objective: '掌握应付项目与预计负债处理', examPoints: ['流动负债', '预计负债'] }, { title: '借款费用资本化', objective: '判断资本化条件与期间', examPoints: ['借款费用', '资本化'] }, { title: '权益工具与利润分配', objective: '掌握权益变动及分配约束', examPoints: ['权益工具', '利润分配'] }] },
    { title: '财务报告与合并', lessons: [{ title: '财务报表列报', objective: '掌握三大报表勾稽关系', examPoints: ['报表列报', '勾稽关系'] }, { title: '现金流量表编制', objective: '识别经营投资筹资现金流', examPoints: ['现金流量表', '现金流分类'] }, { title: '合并报表基础', objective: '理解控制与合并抵销逻辑', examPoints: ['控制', '合并抵销'] }] },
  ],
  audit: [
    { title: '审计计划与风险评估', lessons: [{ title: '审计目标与认定', objective: '建立认定与目标映射关系', examPoints: ['审计目标', '管理层认定'] }, { title: '重大错报风险识别', objective: '识别财务报表层和认定层风险', examPoints: ['重大错报风险', '风险评估'] }, { title: '重要性水平', objective: '掌握计划重要性与执行重要性', examPoints: ['重要性', '错报汇总'] }] },
    { title: '内部控制与测试', lessons: [{ title: '内部控制评价', objective: '判断控制设计与执行有效性', examPoints: ['内部控制', '控制缺陷'] }, { title: '控制测试程序', objective: '掌握穿行测试和抽样', examPoints: ['控制测试', '穿行测试'] }, { title: '实质性程序设计', objective: '结合风险设计实质性程序', examPoints: ['实质性程序', '程序组合'] }] },
    { title: '审计证据', lessons: [{ title: '证据充分适当性', objective: '区分证据数量与质量', examPoints: ['审计证据', '证据可靠性'] }, { title: '函证与监盘', objective: '掌握函证异常与存货监盘要点', examPoints: ['函证', '监盘'] }, { title: '分析程序', objective: '会用趋势和比率识别异常', examPoints: ['分析程序', '异常识别'] }] },
    { title: '特殊项目审计', lessons: [{ title: '收入舞弊风险', objective: '识别收入确认舞弊迹象', examPoints: ['舞弊风险', '收入确认'] }, { title: '关联方与持续经营', objective: '掌握关联交易和持续经营判断', examPoints: ['关联方', '持续经营'] }, { title: '集团审计', objective: '理解组成部分审计安排', examPoints: ['集团审计', '组成部分'] }] },
    { title: '审计完成与报告', lessons: [{ title: '期后事项与书面声明', objective: '掌握期后事项处理', examPoints: ['期后事项', '书面声明'] }, { title: '审计意见类型', objective: '准确区分非无保留意见', examPoints: ['审计意见', '关键审计事项'] }, { title: '审计报告出具', objective: '掌握报告结构与披露要求', examPoints: ['报告结构', '披露'] }] },
  ],
  finance: [
    { title: '财务管理基础', lessons: [{ title: '资金时间价值', objective: '掌握现值终值与年金', examPoints: ['现值终值', '年金'] }, { title: '风险与报酬', objective: '理解风险补偿与必要报酬率', examPoints: ['风险报酬', '必要报酬率'] }, { title: '资本资产定价', objective: '会用CAPM估算资本成本', examPoints: ['CAPM', 'β系数'] }] },
    { title: '筹资管理', lessons: [{ title: '资本结构决策', objective: '掌握杠杆与资本结构平衡', examPoints: ['资本结构', '财务杠杆'] }, { title: '长期筹资工具', objective: '比较债券、普通股、优先股', examPoints: ['长期筹资', '筹资成本'] }, { title: '股利政策', objective: '理解股利分配影响因素', examPoints: ['股利政策', '股东价值'] }] },
    { title: '投资管理', lessons: [{ title: '项目现金流估计', objective: '准确识别相关现金流', examPoints: ['相关现金流', '增量现金流'] }, { title: 'NPV与IRR', objective: '掌握主要投资评价指标', examPoints: ['净现值', '内含报酬率'] }, { title: '互斥项目决策', objective: '解决项目冲突的排序问题', examPoints: ['互斥项目', '决策排序'] }] },
    { title: '营运资本管理', lessons: [{ title: '现金管理', objective: '掌握现金持有与短期投资策略', examPoints: ['现金管理', '流动性'] }, { title: '应收账款管理', objective: '掌握信用政策与收款管理', examPoints: ['信用政策', '应收账款'] }, { title: '存货管理', objective: '理解经济订货量与周转效率', examPoints: ['存货管理', 'EOQ'] }] },
    { title: '全面预算与绩效', lessons: [{ title: '全面预算编制', objective: '串联销售生产采购预算', examPoints: ['全面预算', '预算体系'] }, { title: '标准成本差异', objective: '分解量差与价差', examPoints: ['标准成本', '差异分析'] }, { title: '责任中心绩效', objective: '评价成本利润投资中心', examPoints: ['责任中心', '绩效评价'] }] },
  ],
  tax: [
    { title: '增值税体系', lessons: [{ title: '增值税计税基础', objective: '掌握销项税与进项税', examPoints: ['销项税额', '进项税额'] }, { title: '进项税抵扣规则', objective: '掌握不得抵扣与转出处理', examPoints: ['进项抵扣', '进项转出'] }, { title: '增值税申报', objective: '理解一般与简易计税申报', examPoints: ['纳税申报', '计税方法'] }] },
    { title: '消费税与附加税', lessons: [{ title: '消费税计税', objective: '掌握从价从量复合计税', examPoints: ['消费税', '计税方法'] }, { title: '资源税与城建税', objective: '掌握税基与税率匹配', examPoints: ['资源税', '城建税'] }, { title: '附加税费处理', objective: '理解教育费附加等计提', examPoints: ['附加税费', '计提'] }] },
    { title: '企业所得税', lessons: [{ title: '应纳税所得额调整', objective: '会计利润到税法利润桥接', examPoints: ['纳税调整', '税会差异'] }, { title: '资产税务处理', objective: '掌握折旧摊销与资产损失扣除', examPoints: ['税前扣除', '资产损失'] }, { title: '税收优惠政策', objective: '识别高频优惠适用条件', examPoints: ['税收优惠', '适用条件'] }] },
    { title: '个人所得税与印花税', lessons: [{ title: '综合所得计税', objective: '掌握预扣预缴与汇算清缴', examPoints: ['综合所得', '汇算清缴'] }, { title: '分类所得计税', objective: '区分经营所得与财产所得', examPoints: ['分类所得', '适用税率'] }, { title: '印花税处理', objective: '掌握应税凭证与税目税率', examPoints: ['印花税', '应税凭证'] }] },
    { title: '税收征管', lessons: [{ title: '征管程序', objective: '理解登记申报缴纳流程', examPoints: ['税收征管', '流程'] }, { title: '发票管理', objective: '掌握发票开具与风险控制', examPoints: ['发票管理', '风险控制'] }, { title: '税务检查与救济', objective: '了解税务稽查与复议诉讼', examPoints: ['税务稽查', '法律救济'] }] },
  ],
  law: [
    { title: '合同法律制度', lessons: [{ title: '合同订立', objective: '掌握要约与承诺规则', examPoints: ['合同订立', '要约承诺'] }, { title: '合同效力', objective: '区分有效无效可撤销合同', examPoints: ['合同效力', '可撤销'] }, { title: '合同履行与担保', objective: '掌握履行规则与担保方式', examPoints: ['合同履行', '担保'] }] },
    { title: '公司法律制度', lessons: [{ title: '公司设立', objective: '掌握有限责任公司设立要件', examPoints: ['公司设立', '出资'] }, { title: '公司治理结构', objective: '理解股东会董事会监事会权责', examPoints: ['公司治理', '权责分配'] }, { title: '股权转让与减资', objective: '掌握程序与债权人保护', examPoints: ['股权转让', '减资'] }] },
    { title: '证券法律制度', lessons: [{ title: '证券发行', objective: '掌握发行条件与信息披露', examPoints: ['证券发行', '信息披露'] }, { title: '上市公司收购', objective: '掌握要约收购核心规则', examPoints: ['上市公司收购', '要约'] }, { title: '内幕交易责任', objective: '识别内幕交易构成要件', examPoints: ['内幕交易', '法律责任'] }] },
    { title: '票据与支付结算', lessons: [{ title: '票据行为', objective: '掌握出票背书承兑规则', examPoints: ['票据行为', '背书'] }, { title: '票据抗辩与追索', objective: '理解票据权利保护机制', examPoints: ['票据抗辩', '追索权'] }, { title: '支付结算法律', objective: '识别常见结算违法风险', examPoints: ['支付结算', '违法风险'] }] },
    { title: '企业破产与竞争法', lessons: [{ title: '破产申请与受理', objective: '掌握破产程序起点', examPoints: ['破产申请', '受理'] }, { title: '破产财产分配', objective: '理解清偿顺序与债权申报', examPoints: ['破产财产', '清偿顺序'] }, { title: '反垄断与反不正当竞争', objective: '掌握经营者集中和商业贿赂规则', examPoints: ['反垄断', '不正当竞争'] }] },
  ],
  strategy: [
    { title: '战略分析工具', lessons: [{ title: 'PEST分析', objective: '掌握宏观环境拆解', examPoints: ['PEST', '宏观环境'] }, { title: '五力模型', objective: '评估行业吸引力', examPoints: ['五力模型', '行业竞争'] }, { title: '价值链分析', objective: '定位企业竞争优势', examPoints: ['价值链', '竞争优势'] }] },
    { title: '战略选择', lessons: [{ title: '公司层战略', objective: '掌握一体化多元化选择', examPoints: ['公司层战略', '多元化'] }, { title: '业务层战略', objective: '理解成本领先与差异化', examPoints: ['竞争战略', '差异化'] }, { title: '国际化战略', objective: '掌握进入模式与风险', examPoints: ['国际化', '进入模式'] }] },
    { title: '战略实施', lessons: [{ title: '组织结构与战略匹配', objective: '掌握结构调整路径', examPoints: ['组织结构', '战略匹配'] }, { title: '战略资源配置', objective: '理解预算与资源倾斜', examPoints: ['资源配置', '预算'] }, { title: '变革管理', objective: '掌握变革阻力与推进策略', examPoints: ['变革管理', '组织行为'] }] },
    { title: '风险管理', lessons: [{ title: '风险识别与评估', objective: '建立风险清单与分级机制', examPoints: ['风险识别', '风险评估'] }, { title: '风险应对策略', objective: '掌握规避转移缓释接受', examPoints: ['风险应对', '控制措施'] }, { title: '内部控制框架', objective: '理解控制环境与监督', examPoints: ['内部控制', '监督'] }] },
    { title: '战略控制与评价', lessons: [{ title: '平衡计分卡', objective: '掌握四维度指标设计', examPoints: ['平衡计分卡', '指标体系'] }, { title: '战略绩效评价', objective: '评价战略执行偏差', examPoints: ['绩效评价', '偏差分析'] }, { title: '战略纠偏机制', objective: '建立滚动复盘与纠偏闭环', examPoints: ['战略纠偏', '复盘机制'] }] },
  ],
}

const codeMap: Record<CourseUnit['subject'], string> = {
  accounting: 'acc',
  audit: 'audit',
  finance: 'fin',
  tax: 'tax',
  law: 'law',
  strategy: 'str',
}

export const CPA_UNITS: CourseUnit[] = (Object.keys(UNIT_BLUEPRINT) as CourseUnit['subject'][]).flatMap((subject) =>
  UNIT_BLUEPRINT[subject].map((unit, unitIdx) => ({
    id: `${codeMap[subject]}-unit-${unitIdx + 1}`,
    subject,
    title: unit.title,
    order: unitIdx + 1,
    lessons: unit.lessons.map((item, lessonIdx) =>
      lesson(
        `${codeMap[subject]}-l${unitIdx + 1}-${lessonIdx + 1}`,
        subject,
        `${subject}-ch-${unitIdx + 1}`,
        `${subject}-kp-${unitIdx + 1}-${lessonIdx + 1}`,
        item.title,
        item.objective,
        item.examPoints,
        12 + ((unitIdx + lessonIdx) % 5),
      ),
    ),
  })),
)

export const CPA_CHAPTERS: Chapter[] = (Object.keys(UNIT_BLUEPRINT) as CourseUnit['subject'][]).flatMap((subject) =>
  UNIT_BLUEPRINT[subject].map((unit, unitIdx) => ({
    id: `${subject}-ch-${unitIdx + 1}`,
    subject,
    title: unit.title,
    syllabusCode: `${subject.toUpperCase()}-CH-${String(unitIdx + 1).padStart(2, '0')}`,
    order: unitIdx + 1,
    estimatedHours: 3,
  })),
)

export const CPA_KNOWLEDGE_POINTS: KnowledgePoint[] = (Object.keys(UNIT_BLUEPRINT) as CourseUnit['subject'][]).flatMap((subject) =>
  UNIT_BLUEPRINT[subject].flatMap((unit, unitIdx) =>
    unit.lessons.map((item, lessonIdx) => ({
      id: `${subject}-kp-${unitIdx + 1}-${lessonIdx + 1}`,
      subject,
      chapterId: `${subject}-ch-${unitIdx + 1}`,
      title: item.title,
      syllabusCode: `${subject.toUpperCase()}-KP-${String(unitIdx + 1).padStart(2, '0')}-${String(lessonIdx + 1).padStart(2, '0')}`,
      difficulty: (2 + ((unitIdx + lessonIdx) % 3)) as 1 | 2 | 3 | 4 | 5,
      examFrequency: lessonIdx === 0 ? 'high' : lessonIdx === 1 ? 'medium' : 'low',
      prerequisites: lessonIdx > 0 ? [`${subject}-kp-${unitIdx + 1}-${lessonIdx}`] : [],
    })),
  ),
)

export const SUBJECT_NAME: Record<CourseUnit['subject'], string> = {
  accounting: '会计',
  audit: '审计',
  finance: '财务成本管理',
  tax: '税法',
  law: '经济法',
  strategy: '公司战略与风险管理',
}
