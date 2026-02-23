# 后端有接口、前端缺功能清单

对照 `server/index.js` 与 `src/lib/api.ts` + 各页面调用情况整理。✅ = 前端已对接并展示；❌ = 后端有接口、前端未用或未完整使用。

---

## 一、已对接（✅）

| 后端接口 | 前端 API / 页面 |
|----------|-----------------|
| POST /api/auth/register, login | authApi, LoginPage |
| GET /api/me, /progress | authApi.me, progressApi.get, store |
| POST /api/progress/lesson | progressApi.completeLesson, LessonPage |
| POST /api/subscription | subscriptionApi, SubscriptionPage |
| GET /api/course/outline | courseApi.outline, DashboardPage |
| POST /api/llm/generate-cpa-lesson | llm.ts → generateLessonPackage |
| GET/POST /api/automation/* | automationApi, KnowledgeOpsPage |
| GET /api/knowledge/stats, coverage, list, getById, delete | knowledgeApi, SourcesViewPage / LessonPage / KnowledgeOpsPage |
| GET /api/knowledge/conflicts, revision-drafts, apply, reject | knowledgeApi, KnowledgeOpsPage（修订草案） |
| POST /api/knowledge/suggest-fix, apply-fix | knowledgeApi 有方法，**教研页未对冲突条目挂接** → 见下方 |
| POST /api/knowledge/review | knowledgeApi.review 有方法，**无入口对单条做「通过/驳回」** → 见下方 |
| GET/POST /api/materials/*, process, process-async, process-all-async, delete | materialsApi, KnowledgeOpsPage |
| GET /api/policy-scout/stats, settings, items, run | policyScoutApi, KnowledgeOpsPage / SourcesViewPage |
| GET /api/users, POST /api/users/:id/role | userAdminApi, KnowledgeOpsPage（管理员用户列表与改角色） |
| POST /api/admin/purge-ai-knowledge, clear-generation-runs | adminOpsApi, KnowledgeOpsPage |

---

## 二、后端有、前端缺或未完整使用（❌ → 待补）

| 序号 | 后端接口 | 缺失/不足说明 | 优先级 |
|------|----------|----------------|--------|
| 1 | **POST /api/knowledge/review** | 单条知识条目状态流转（draft/review → approved/deprecated）。api 有 `knowledgeApi.review(id, status)`，但**没有入口**：教研/资料总览均无「通过」「驳回」按钮。 | 高 |
| 2 | **GET /api/policy-scout/runs** | 政策抓取运行记录列表。前端无 `policyScoutApi.runs()`，教研页政策雷达只显示 stats 和 latestRun，**无历史 runs 列表**。 | 中 |
| 3 | **GET /api/knowledge/conflicts** + **suggest-fix / apply-fix** | 教研页只展示「冲突条目 N」，**没有冲突列表**，也没有对单条「建议修复」「应用修复」按钮（api 已有 suggestFix/applyFix）。 | 中高 |
| 4 | **GET /api/audit/logs** | 管理员查看操作审计日志。前端无 auditApi，**无审计日志页或区块**。 | 中 |
| 5 | **GET /api/security/alerts** | 管理员查看安全告警。前端无 securityApi，**无安全告警页或区块**。 | 中 |
| 6 | **GET/POST /api/rbac/policy** | 管理员查看/编辑 RBAC 策略。前端无 rbacApi，**无 RBAC 配置入口**。 | 低 |
| 7 | **POST /api/knowledge/import** | 批量导入知识条目（JSON）。多为脚本使用，**前端无导入页**（可选）。 | 低 |

---

## 三、迭代计划（建议顺序）与完成情况

| 序号 | 项 | 状态 |
|------|----|------|
| 1 | **知识条目标签审核**：资料总览「知识库条目」对单条增加「通过」「废弃」，调用 `knowledgeApi.review(id, status)` | ✅ 已实现 |
| 2 | **政策抓取运行记录**：`policyScoutApi.runs(limit)`，教研页政策雷达下「最近运行记录」折叠列表 | ✅ 已实现 |
| 3 | **冲突条目 + 建议/应用修复**：教研页展示冲突条目列表，每条「建议修复」「应用修复」按钮 | ✅ 已实现 |
| 4 | **管理员：审计日志 + 安全告警**：`auditApi.logs`、`securityApi.alerts`，教研页管理员区块「审计日志与安全告警」 | ✅ 已实现 |
| 5 | **RBAC 策略**（可选）：rbacApi + 管理员配置 | 未做（低优先级） |
| 6 | **知识库批量导入**（可选）：教研页导入 JSON | 未做（低优先级） |

---

文档更新时间：按实现进度维护。
