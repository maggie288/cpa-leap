# CPA课程知识库设计（核心能力）

## 1. 目标

把“课程生成”从纯模型自由发挥，升级为“知识库约束 + 检索增强 + 质检修复”的可控流程，保证财会内容专业性与稳定性。

## 2. 知识库分层

### 2.1 学科层（Subject）
- 会计 `accounting`
- 审计 `audit`
- 财务成本管理 `finance`
- 税法 `tax`
- 经济法 `law`
- 公司战略与风险管理 `strategy`

### 2.2 知识条目层（Knowledge Entry）
每个条目包含：
- `id`：唯一标识（可追溯）
- `subject`：所属科目
- `topic`：主题名
- `keywords`：检索关键词
- `concept`：核心概念
- `rules`：规则/结论
- `pitfalls`：易错点
- `miniCase`：微案例

当前知识库文件：`server/knowledge/kb.json`  
初始化种子：`server/knowledge/kb.seed.json`

## 3. 生成流程（已落地）

1. 输入：课时 `subject/title/objective/examPoints` + 用户 `weakPoints`
2. 检索：按术语命中与薄弱点加权召回 Top-K（默认4）
3. 生成：
   - 课程脚本（学习目标、步骤、知识锚点）
   - 练习题（由规则和易错点模板化生成）
   - 复习建议（聚焦易错点）
4. 质检：
   - 题目结构完整
   - 选项数量/唯一性校验
   - 答案索引合法
   - 缺失字段自动修复
   - 知识条目质量评分（`qualityScore`）
   - 审核门禁（仅 `approved + qualityScore>=85` 进入生成链路）
5. 输出：附带 `sourceRefs`（知识来源引用）

对应代码：
- 检索：`server/knowledge/retrieval.js`
- 生成：`server/knowledge/generator.js`
- 质检：`server/knowledge/quality.js`

## 4. API契约（已接入）

接口：
- `POST /api/llm/generate-cpa-lesson`
- `GET /api/knowledge/stats`
- `GET /api/knowledge`
- `POST /api/knowledge/import`
- `POST /api/knowledge/review`
- `POST /api/knowledge/suggest-fix`
- `POST /api/knowledge/apply-fix`

输入：
- `subject`
- `lessonTitle`
- `objective`
- `examPoints[]`
- `weakPoints[]`

输出：
- `lessonScript[]`
- `generatedQuestions[]`
- `revisionTips[]`
- `sourceRefs[]`

## 5. 专业性保障策略

1. **知识先行**：先召回知识条目，再生成，避免“无依据发挥”。
2. **易错点注入**：将 `pitfalls` 明确注入题目干扰项。
3. **可追溯**：每次返回 `sourceRefs`，支持教学审查与错误追责。
4. **可修复**：题目结构异常时自动修复，确保前端渲染稳定。

## 6. 下一步迭代（建议）

### P1：扩库与标准化
- 每科扩展到 200+ 条知识条目
- 引入考纲映射字段：`syllabusCode / examYear / chapter`
- 增加条文版本字段（尤其税法、经济法）

### P2：检索升级
- 从关键词检索升级为“关键词 + 向量检索（embedding）”
- 引入重排（rerank）提高命中质量
- 支持按用户能力层级筛选知识条目

### P3：质检升级
- 增加“答案-解析一致性”语义校验
- 增加“术语词典硬约束”（税率、法条时间点）
- 增加人工抽检后台与回流标注

### P4：教研协作
- 知识条目管理后台（增删改、审核、发布）
- A/B 试验：同主题不同讲解风格与题型组合
- 版本化回滚（错误条目快速下线）
