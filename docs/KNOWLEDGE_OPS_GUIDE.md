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

## 3) API 管理能力

- `GET /api/knowledge/stats`：查看总量、按科目/状态分布
- `GET /api/knowledge?subject=tax&status=approved&q=进项&minQualityScore=85`：检索条目
- `GET /api/knowledge/:id`：查看单条详情
- `POST /api/knowledge/import`：通过 API 批量导入
- `POST /api/knowledge/review`：更新审核状态（draft/review/approved/deprecated）
- `POST /api/knowledge/suggest-fix`：生成低质量条目自动修复建议
- `POST /api/knowledge/apply-fix`：应用修复候选版本（自动进入review）
- `GET /api/automation/stats`：查看自动教研运行指标
- `GET/POST /api/automation/settings`：查看/更新自动教研配置

说明：以上接口需登录态（Bearer Token）。

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

## 5) 质量门槛建议

- `qualityScore >= 85` 才允许 `approved`
- 税法、经济法高风险条目必须双人复核
- 每周抽样复核生成题的答案一致性与术语准确率
- 生成链路仅使用 `approved + qualityScore>=85` 条目
