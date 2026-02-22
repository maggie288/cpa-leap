# 知识库运营与扩库指南

## 1) 条目模板

模板文件：`server/knowledge/templates/knowledge-entry.template.json`

核心字段：
- `subject`：`accounting/audit/finance/tax/law/strategy`
- `chapter`：章节
- `syllabusCode`：考纲编码
- `topic`：知识点标题
- `keywords[]`：检索词
- `concept`：核心定义
- `rules[]`：规则结论（至少1条）
- `pitfalls[]`：常见误区
- `miniCase`：微案例
- `status`：`draft/review/approved/deprecated`
- `qualityScore`：0-100（教研评分）

## 2) 批量导入

准备 JSON 文件（数组或 `{ "entries": [] }`），执行：

```bash
npm run kb:import -- --file path/to/knowledge.json --actor reviewer_name
```

导入逻辑：
- 同 `id` 条目会做 `upsert` 并自动 `version + 1`
- 缺关键字段（subject/topic/concept/rules）会拒绝入库
- 成功导入会写入 `server/knowledge/kb.json`

### Phase2 快速扩库（会计+税法）

已内置批量扩库脚本，可直接生成并入库一批高频条目：

```bash
npm run kb:seed:phase2
```

建议用于 MVP Phase2 首批扩库（会计与税法），再由教研在后台做抽样复核。

## 3) API 管理能力

- `GET /api/knowledge/stats`：查看总量、按科目/状态分布
- `GET /api/knowledge/coverage`：查看各科 `syllabusCode` 覆盖率（目标章节覆盖进度）
- `GET /api/knowledge/conflicts`：查看冲突条目（同 syllabusCode 或高相似 topic）
- `GET /api/knowledge/revision-drafts`：查看自动修订建议草案
- `POST /api/knowledge/revision-drafts/:id/apply`：应用修订草案（目标条目自动更新为 review）
- `POST /api/knowledge/revision-drafts/:id/reject`：驳回修订草案
- `GET /api/knowledge?subject=tax&status=approved&q=进项&minQualityScore=85`：检索条目
- `GET /api/knowledge/:id`：查看单条详情
- `POST /api/knowledge/import`：通过 API 批量导入
- `POST /api/knowledge/review`：更新审核状态（draft/review/approved/deprecated）
- `POST /api/knowledge/suggest-fix`：生成低质量条目自动修复建议
- `POST /api/knowledge/apply-fix`：应用修复候选版本（自动进入review）
- `GET /api/automation/stats`：查看自动教研运行指标
- `GET/POST /api/automation/settings`：查看/更新自动教研配置
- `POST /api/automation/prompts/replay-eval`：按指定 Prompt 版本执行历史样本回放评测
- `POST /api/automation/prompts/auto-promote`：按阈值执行 Prompt 自动晋升

说明：以上接口需登录态（Bearer Token）。

### Prompt 进化（Phase 3 最小可用）

已支持：
- Prompt 版本化（`promptVersion` + `promptCandidates` + `promptTrafficSplit`）
- Prompt A/B 分流（与模型分流独立配置）
- 回放评测（历史生成请求样本）
- 自动晋升（按 learner score 提升阈值）

CLI 脚本：

```bash
npm run eval:prompt:replay -- --prompt=prompt-v1.1 --limit=30
npm run eval:prompt:auto-promote
```

注意：
- 自动晋升需先开启 `automationSettings.promptAutoPromoteEnabled=true`。
- 若返回“暂无满足阈值的候选提示词版本”，通常是反馈样本不足或分差未达到阈值。

## 4) 建议运营流程

1. 教研编写条目（`draft`）
2. 对低质量条目调用 `suggest-fix` 查看建议（含评分变化）
3. 调用 `apply-fix` 一键应用候选版本（状态自动为 `review`）
4. 复核人评审并打分（`review` -> `approved`）
5. 小流量验证生成效果
6. 扩大覆盖并持续修订（版本化）

## 6) 全自动模式说明

- 当前已支持“无老师干预”自动流水线：
  1. AI 生成知识草稿
  2. 自动质检评分
  3. 低分自动修复迭代
  4. 达标自动审核通过
  5. 生成学习内容并直接提供给学员
- 学员学习表现（弱项/分数）会回流到 `modelFeedback`，用于下一轮自动生成优化。

## 7) 首批教材验收SOP（推荐）

### 步骤A：上传并处理一份教材PDF

在教研页 ` /knowledge ` 的“资料上传与入库”模块：
1. 选择科目、章节、年份、资料类型
2. 上传 PDF
3. 点击“处理入库”

预期结果：
- 资料状态变成 `ready`
- `chunkCount > 0`
- 扫描版 PDF 成功时，资料列表会显示 `OCR` 标记

### 步骤B：接口侧确认入库成功

1) 查询资料统计：

```bash
curl -H "Authorization: Bearer <TOKEN>" https://<your-api-domain>/api/materials/stats
```

确认 `byStatus.ready` 有数量。

2) 查看资料列表：

```bash
curl -H "Authorization: Bearer <TOKEN>" https://<your-api-domain>/api/materials
```

确认目标资料 `status=ready` 且 `chunkCount` 已写入。

### 步骤C：生成课程并确认“教材参与”

调用课程生成接口：

```bash
curl -X POST https://<your-api-domain>/api/llm/generate-cpa-lesson \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "subject":"accounting",
    "lessonId":"acc-l1-1",
    "lessonTitle":"会计要素与确认",
    "objective":"掌握会计要素边界与确认条件",
    "examPoints":["会计要素","确认条件"],
    "weakPoints":[]
  }'
```

预期结果：
- `automationReport.actions` 中出现 `material_context_attached`
- `qualityWarnings` 为空或显著减少
- 课程脚本中出现更具体的教材口径

### 步骤D：学员反馈回流验证

提交一次学习结果：

```bash
curl -X POST https://<your-api-domain>/api/progress/lesson \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "lessonId":"acc-l1-1",
    "subject":"accounting",
    "runId":"<automationReport.runId>",
    "score":72,
    "weakPoints":["确认条件"]
  }'
```

然后查看自动化统计：

```bash
curl -H "Authorization: Bearer <TOKEN>" https://<your-api-domain>/api/automation/stats
```

确认：
- `byModel.<model>.feedbackCount` 增加
- `avgLearnerScore` 更新

### 常见失败点

- `material_context_attached` 未出现：通常是资料未处理完成或科目不匹配
- `chunkCount=0`：PDF 可能是扫描版但未配置 OCR，请设置 `OCR_SPACE_API_KEY` 后重试
- 生成内容仍泛化：请提高章节标签质量（例如“第3章 长投”而不是“教材1”）

## 8) 扫描版 PDF OCR 配置

为支持扫描版教材入库，在服务端配置以下环境变量：

```bash
OCR_SPACE_API_KEY=<your_ocr_space_api_key>
OCR_SPACE_LANGUAGE=chs
```

说明：
- 当常规 PDF 文本抽取结果过少时，系统会自动触发 OCR 兜底。
- 成功触发后，资料会保留 `ocrUsed=true`，前端显示 `OCR` 标签。
- 若未配置 `OCR_SPACE_API_KEY`，扫描版 PDF 会在“处理入库”阶段报错并提示配置。

## 9) 全球政策雷达（免费定时任务）

用于自动抓取税收政策与财务准则更新，并自动写入知识库（默认 `review` 状态）。

后台入口：`/knowledge` -> `全球政策雷达（税收/财务准则）`

可配置项：
- 定时任务开关（开启/关闭）
- 抓取间隔（分钟）
- 每来源抓取上限
- 自动入知识库开关
- 抓取来源管理（可新增/编辑/删除来源，支持 `rss/atom/html`）
- 来源健康度监控（成功率、连续失败、最近成功/失败时间、最后错误）
- 自动告警（Webhook、失败阈值、冷却时间）

结构化抽取（自动）：
- `publishedAt`：发布日期
- `effectiveAt`：生效时间（若可识别）
- `applicableScope`：适用对象/适用范围（若可识别）
- `sourceUrl / publisher / region`：来源追溯信息

说明：上述结构化字段会进入知识条目 `policyMeta`，并在课程“知识来源锚点”中优先展示来源与生效时间。

健康度使用建议：
- `consecutiveFailures >= 3`：优先排查 URL 是否失效、站点是否反爬、格式是否变化
- `successRate < 60%`：建议切换为官方 RSS/Atom 源或降低抓取频率
- `avgFetchedPerRun` 持续为 0：通常表示解析规则与页面结构不匹配

告警建议：
- 告警开启后，当来源连续失败达到阈值会自动触发 Webhook
- 通过“冷却分钟数”避免同一来源重复刷屏告警
- 建议将 Webhook 对接到飞书群机器人/Slack/邮件网关

## 10) 角色与权限（RBAC）

系统角色：
- `student`：学员，仅可学习、做题、查看个人进度与订阅
- `teacher`：教师，可访问教研后台与知识库/资料/政策雷达能力
- `admin`：管理员，拥有教师能力，并可管理用户角色

权限边界（已生效）：
- `knowledge/materials/policy-scout/automation`：仅 `teacher/admin`
- `users` 角色管理接口：仅 `admin`
- 前端 `/knowledge` 页面：仅 `teacher/admin` 可见并可访问

相关接口：
- `GET /api/policy-scout/stats`
- `GET /api/policy-scout/settings`
- `POST /api/policy-scout/settings`
- `POST /api/policy-scout/run`

可选环境变量：

```bash
POLICY_SCOUT_ENABLED=true
POLICY_SCOUT_INTERVAL_MINUTES=360
POLICY_SCOUT_MAX_ITEMS_PER_SOURCE=8
```

## 11) Phase 4 治理能力（最小可用）

已支持：
- `sourceTier` 来源分级（1=官方，2=权威解读，3=教辅）
- 入库冲突检测（`syllabusCode` 重复、topic 高相似）
- 生命周期字段（`effectiveAt` / `expiresAt`）与状态（`active/scheduled/expired`）
- 生成门禁：未生效或已过期条目不参与生成召回
- 自动修订建议草案（diff）：政策新条目命中冲突后，自动生成“建议 patch + 触发原因 + 置信度”
- 自动去重（AI 生成条目）：同科目同 topic 的 `AI生成知识条目` 仅保留最新一条，旧条目自动 `deprecated`

实践建议：
- 课程生成建议优先使用 `sourceTier=1/2` 条目
- 冲突条目进入 `review` 后再人工确认是否保留/合并
- 对政策类条目尽量补齐 `effectiveAt`，避免新旧口径混用

## 5) 质量门槛建议

- `qualityScore >= 85` 才允许 `approved`
- 税法、经济法高风险条目必须双人复核
- 每周抽样复核生成题的答案一致性与术语准确率
- 生成链路仅使用 `approved + qualityScore>=85` 条目
