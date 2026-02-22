# CPA 核心功能 V2：分阶段 MVP 实施路线与验收指标

本文档对应《CPA核心功能与课程设计V2》规划，给出可执行的分阶段任务、验收指标与关键文件改造清单。

---

## 1. 总体验收指标（必须量化）

| 指标 | 目标 | 测量方式 |
|------|------|----------|
| 课程覆盖率 | 六科高频考纲覆盖 ≥ 80% | 章节/知识点与考纲映射表 + 已上线课时占比 |
| 生成稳定性 | 课程生成成功率 ≥ 99% | `/api/llm/generate-cpa-lesson` 成功次数 / 总请求 |
| 质量门禁 | 自动通过内容人工抽检合格率 ≥ 95% | 抽检通过数 / 抽检总数（教师后台标记） |
| 进化收益 | 新模型相对基线在学习得分/完课率上显著提升 | A/B 对比 byModel 的 avgLearnerScore、完课率 |
| 知识时效 | 政策变更后 48 小时内完成入库并进入课程引用链 | 政策条目 capturedAt → 首次被生成引用的时间差 |

---

## 2. Phase 1：课程结构升级（2–3 周）

**目标**：引入章节/知识点实体，重构目录与检索入参，为完整课程与知识库映射打基础。

### 2.1 任务清单

1. **类型与数据结构**
   - 在 `src/types.ts` 中新增：`Chapter`、`KnowledgePoint`、扩展 `Lesson` 的 `chapterId` / `knowledgePointId`。
   - 可选：新增 `QuestionType` 枚举（single/multiple/calculation/comprehensive/case）。
2. **课程目录重构**
   - 在 `src/data/` 下新增或重构：章节定义（如 `cpaChapters.ts`）、知识点定义（如 `cpaKnowledgePoints.ts`），或扩展现有 `cpaCatalog.ts` 为「科目 → 章节 → 知识点 → 课时」。
   - 保证现有 `CPA_UNITS` 或等价结构仍可被 Dashboard/Lesson 使用，避免破坏现有学习路径。
3. **检索与生成入参**
   - `server/knowledge/retrieval.js`：`retrieveKnowledge` 增加可选参数 `chapterId`、`knowledgePointId`，在存在时优先按章节/知识点过滤再关键词打分。
   - `server/knowledge/generator.js`：入参透传 `chapterId`/`knowledgePointId`，用于脚本与题目标题/来源展示。
   - `server/ai/autonomousCourseEngine.js`：调用生成时传入当前课时的 `chapterId`/`knowledgePointId`（若前端/目录提供）。

### 2.2 关键文件改造清单

| 文件 | 改造内容 |
|------|----------|
| [src/types.ts](src/types.ts) | 新增 `Chapter`、`KnowledgePoint`；`Lesson` 增加 `chapterId?`、`knowledgePointId?`；可选 `QuestionType` |
| [src/data/cpaCatalog.ts](src/data/cpaCatalog.ts) | 重构为章节→知识点→课时，或拆分为 cpaChapters + cpaKnowledgePoints + 课时生成 |
| [server/knowledge/retrieval.js](server/knowledge/retrieval.js) | `retrieveKnowledge` 增加 chapterId/knowledgePointId 过滤与权重 |
| [server/knowledge/generator.js](server/knowledge/generator.js) | 入参增加 chapterId/knowledgePointId，透传到脚本/题目标题 |
| [server/ai/autonomousCourseEngine.js](server/ai/autonomousCourseEngine.js) | 接收并传递 chapterId/knowledgePointId 到生成链路 |

### 2.3 Phase 1 验收标准

- [ ] 类型定义合并后 `npm run build` 通过。
- [ ] 前端学习路径仍可正常进入课时并生成内容。
- [ ] 至少一门科目具备「章节 → 知识点 → 课时」三级数据，且检索 API 支持按 chapterId/knowledgePointId 过滤。

---

## 3. Phase 2：知识库扩容与映射（3–5 周）

**目标**：每科先做高频章节，建立考纲编码与知识库条目的稳定映射，支撑 80% 考纲覆盖目标。

### 3.1 任务清单

1. **考纲编码与章节对齐**
   - 按 [CPA_COURSE_ARCHITECTURE_V2.md](CPA_COURSE_ARCHITECTURE_V2.md) 六科章节蓝图，为每个章节分配稳定 `syllabusCode`（如 ACC-REV）。
   - 知识库条目 `chapter`、`syllabusCode` 与目录章节一一对应或可追溯。
2. **知识库扩库**
   - 优先会计、税法、经济法高频章，每科先达到 50+ 条 `approved` 且 `qualityScore >= 85`。
   - 使用现有 `kb:import`、批量生成脚本或半自动生成+人工校审。
3. **映射表与检索增强**
   - 可选：维护 `chapterId → [knowledgeEntryId]` 或 `knowledgePointId → knowledgeEntryId` 的映射表（可在 repository 或独立 JSON/DB 表）。
   - 检索时若有 `knowledgePointId`，优先召回其绑定条目，再补充关键词/薄弱点召回。

### 3.2 关键文件改造清单

| 文件 | 改造内容 |
|------|----------|
| [server/knowledge/kb.json](server/knowledge/kb.json) / 种子 | 扩充分科条目，统一 chapter/syllabusCode 与课程蓝图 |
| [server/knowledge/repository.js](server/knowledge/repository.js) | 可选：按 syllabusCode/chapter 列表查询；支持映射表读写 |
| [server/knowledge/retrieval.js](server/knowledge/retrieval.js) | 按 chapter/syllabusCode 优先召回，再关键词排序 |
| [docs/CPA_COURSE_ARCHITECTURE_V2.md](CPA_COURSE_ARCHITECTURE_V2.md) | 作为章节与考纲编码权威参考，实现时对齐 |

### 3.3 Phase 2 验收标准

- [ ] 至少两科（建议会计+税法）高频章节能覆盖 80% 以上考纲要点（按章节清单核对）。
- [ ] 生成课时时，sourceRefs 中至少有一条与当前章节/知识点 syllabusCode 一致或强相关。
- [ ] 知识库 stats 中每科 approved 条目数 ≥ 50（可先达成两科）。

---

## 4. Phase 3：模型进化闭环（2–4 周）

**目标**：Prompt 版本化、离线回放评测、自动晋升/降级策略，使模型可自动进化。

### 4.1 任务清单

1. **Prompt 版本化**
   - 新增存储：`promptTemplates` 或合入 `automationSettings`，字段含 `promptVersion`、`changelog`、`createdAt`。
   - 生成链路（autonomousCourseEngine / 调用 LLM 处）读取当前版本或按 A/B 选择版本。
2. **离线回放评测**
   - 维护固定「金标」题目集或历史请求集（lessonTitle + examPoints + weakPoints）。
   - 提供脚本或接口：用指定 promptVersion/modelVersion 批量回放，产出质量分与一致率报告。
   - 门禁：回放通过率/质量分不低于阈值才允许新版本参与灰度。
3. **自动晋升/降级**
   - 在 `automationSettings` 或独立配置中增加：晋升阈值（如学习得分提升 X%、完课率提升 Y%）、降级阈值（质量分或完课率连续 N 次不达标）、冷却时间。
   - 定时任务或管理触发：根据 `generationRuns` + `modelFeedback` 统计结果，自动将候选模型设为主模型或回退。

### 4.2 关键文件改造清单

| 文件 | 改造内容 |
|------|----------|
| [server/ai/autonomousCourseEngine.js](server/ai/autonomousCourseEngine.js) | 读取 promptVersion；支持传入 prompt 模板或版本 ID |
| [server/db.js](server/db.js) / 状态 schema | 新增 promptTemplates 或 automationSettings.promptVersion、evolutionRules |
| [server/index.js](server/index.js) | 可选：GET/POST /api/automation/prompt-version；GET /api/automation/evolution-status |
| 新增脚本 | 如 server/scripts/replayEval.js：回放评测 + 输出报告 |
| [docs/CORE_FUNCTION_DESIGN_V2.md](CORE_FUNCTION_DESIGN_V2.md) | 自动进化机制参考 |

### 4.3 Phase 3 验收标准

- [x] 至少两个 Prompt 版本可配置并参与 A/B 分流，且生成结果带版本标识。
- [x] 回放脚本可对固定请求集跑通并输出质量分/一致率。
- [x] 自动晋升/降级规则配置化，并在仿真或小流量下验证一次自动切换或回退。

---

## 5. Phase 4：知识自动更新治理（2–3 周）

**目标**：来源分级、冲突检测、时效治理、自动修订建议，保证知识库可持续更新且可追溯。

### 5.1 任务清单

1. **来源分级**
   - 在政策抓取来源与知识条目上增加 `sourceTier`（如 1=官方 2=权威解读 3=教辅）；入库时写入 `policyMeta` 或条目扩展字段。
   - 检索或生成时可选「仅用高等级来源」策略。
2. **冲突检测**
   - 新条目入库（policy 或 import）时：按 subject + 相似 topic/keywords 检索现有条目，做主题冲突检测；按 effectiveAt/expiresAt 或 policyMeta 做时间冲突检测。
   - 输出冲突对列表，写入待办或通知教师复核。
3. **时效与生命周期**
   - 知识条目支持 `effectiveAt`、`expiresAt`；过期条目自动标记 deprecated 或排除出生成召回。
   - 定时任务或入库时检查并更新状态。
4. **自动修订建议**
   - 当政策/新条目命中既有知识点（同 syllabusCode 或高相似）时，生成修订建议草案（diff），写入待审队列或通知教师。

### 5.2 关键文件改造清单

| 文件 | 改造内容 |
|------|----------|
| [server/knowledge/repository.js](server/knowledge/repository.js) | 冲突检测函数；effectiveAt/expiresAt 读写；修订建议生成入口 |
| [server/policy/policyScout.js](server/policy/policyScout.js) | 入库前调用冲突检测；写入 sourceTier；可选触发修订建议 |
| [server/knowledge/scoring.js](server/knowledge/scoring.js) | 时效校验：过期条目不参与 passForGeneration |
| [server/ingest/pdfPipeline.js](server/ingest/pdfPipeline.js) / 材料入库 | 可选：材料来源分级 |
| [docs/CORE_FUNCTION_DESIGN_V2.md](CORE_FUNCTION_DESIGN_V2.md) | 知识自动更新机制参考 |

### 5.4 Phase 4 验收标准

- [x] 新政策条目入库时能检测到与现有同主题条目的冲突并落库或通知。
- [x] 至少一条条目具备 effectiveAt/expiresAt，且过期后不再被检索用于生成。
- [x] 一次「政策命中既有知识点」的流程能产生修订建议草案（可人工审核后合并）。

---

## 6. Phase 5：生产优化（持续）

**目标**：可观测性、回滚、审计、成本控制，支撑生产级稳定运行。

### 6.1 任务建议（不设硬性验收）

- **可观测性**：生成成功率、延迟、质量分分布、模型/Prompt 版本分布；可选 Prometheus + Grafana 或现有 /api/automation/stats 扩展。
- **回滚**：知识库条目版本历史与一键回滚；Prompt/模型版本一键回退。
- **审计**：角色变更、知识审核、策略变更的操作日志与查询接口。
- **成本控制**：LLM 调用量统计、按版本/科目聚合；大额调用告警。

### 6.2 关键文件（参考）

- [server/index.js](server/index.js)：审计中间件、统计接口扩展。
- [server/knowledge/repository.js](server/knowledge/repository.js)：版本历史存储与回滚 API。
- [server/ai/autonomousCourseEngine.js](server/ai/autonomousCourseEngine.js)：调用计数与成本统计。

---

## 7. 文档与回溯

- 核心功能设计：[CORE_FUNCTION_DESIGN_V2.md](CORE_FUNCTION_DESIGN_V2.md)
- 课程体系蓝图：[CPA_COURSE_ARCHITECTURE_V2.md](CPA_COURSE_ARCHITECTURE_V2.md)
- 本实施路线：[MVP_IMPLEMENTATION_ROADMAP_V2.md](MVP_IMPLEMENTATION_ROADMAP_V2.md)
- 现有知识库设计：[COURSE_KNOWLEDGE_BASE_DESIGN.md](COURSE_KNOWLEDGE_BASE_DESIGN.md)
- 现有功能清单：[DEVELOPMENT_BACKLOG.md](DEVELOPMENT_BACKLOG.md)
