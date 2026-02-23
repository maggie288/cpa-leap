# CPA Leap（类多邻国 CPA 学习 H5）

CPA Leap 是一个卡通风格、移动端优先的 CPA 学习 Web 应用。  
核心思路：借鉴多邻国的短时高频、路径解锁、即时反馈和个性化生成机制。

## 已实现（V1.5）

- 前后端分离：H5 前端 + 本地 API 服务
- JWT 账号注册/登录（后端持久化）
- 学习进度追踪（后端持久化：XP、完成状态、薄弱点）
- 订阅方案页（Free/Pro/Ultra）并写入后端
- CPA 六科多单元课程路径与课时学习
- 知识库驱动课程生成（检索 + 模板生成 + 题目质检）
- 质量门禁：仅使用 `approved + qualityScore>=85` 知识条目生成
- 题目练习、即时判分与解析
- LLM 课程生成接口封装（含 fallback）
- 知识库管理接口与批量导入脚本
- 低质量条目自动修复建议与一键应用
- AI自动教研模式（自动生成、自动审核、自动发布）
- 模型A/B实验分流与效果归因统计
- 免费定时任务：自动抓取全球税收政策与财务准则更新并入知识库
- 政策来源可在后台管理（增删改 URL/格式/科目），并自动抽取发布日期/生效日/适用范围
- 政策来源健康度监控（成功率、连续失败、最近错误）用于巡检失效站点
- RBAC 角色权限（student/teacher/admin）与管理员角色管理接口

## 本地运行

```bash
npm install
npm run dev
```

运行后：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`
- 教研审核台入口：前端导航中的 `教研`（`/knowledge`）

数据库文件：`server/data/db.json`（自动生成）

## 环境变量（可选）

在根目录创建 `.env`：

```bash
PORT=8787
JWT_SECRETS=replace_with_strong_secret_v2,replace_with_old_secret_v1
DEFAULT_TENANT_ID=default
LOGIN_RATE_LIMIT_WINDOW_MINUTES=15
LOGIN_RATE_LIMIT_ACCOUNT_IP_MAX=8
LOGIN_RATE_LIMIT_IP_MAX=30
LOGIN_RATE_LIMIT_LOCK_MINUTES=15
SECURITY_ALERT_WEBHOOK=
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=materials
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ROW_ID=main
OPENAI_API_KEY=optional_for_real_embeddings
OPENAI_EMBED_MODEL=text-embedding-3-small
SUPABASE_VECTOR_TABLE=material_chunks
SUPABASE_VECTOR_MATCH_RPC=match_material_chunks
OCR_SPACE_API_KEY=optional_for_scanned_pdf_ocr
OCR_SPACE_LANGUAGE=chs
POLICY_SCOUT_ENABLED=true
POLICY_SCOUT_INTERVAL_MINUTES=360
POLICY_SCOUT_MAX_ITEMS_PER_SOURCE=8
POLICY_SCOUT_ALERT_WEBHOOK=
VITE_API_BASE=http://localhost:8787/api
VITE_LLM_API_BASE=https://your-llm-gateway.example.com
VITE_LLM_API_KEY=your_api_key
```

若未配置外部 LLM，系统默认使用本地生成 fallback。

## 知识库扩库

```bash
npm run kb:import -- --file path/to/knowledge.json --actor your_name
```

## 角色初始化脚本（管理员/教师）

```bash
npm run user:set-role -- --email=your_account@example.com --role=admin
npm run user:set-role -- --email=your_teacher@example.com --role=teacher
```

可选参数：
- `--tenant=default`（多租户场景下指定租户）

模板：`server/knowledge/templates/knowledge-entry.template.json`

## AI自动教研接口

- `POST /api/llm/generate-cpa-lesson`：触发自动教研流水线并返回课程
- `GET /api/automation/stats`：查看自动审核通过率等指标
- `GET/POST /api/automation/settings`：管理自动化参数
- `POST /api/policy-scout/run`：手动触发政策抓取并入库
- `GET/POST /api/policy-scout/settings`：管理政策雷达定时任务
- `GET /api/policy-scout/stats`：查看抓取与入库统计
- 支持连续失败自动告警（Webhook）
- `GET /api/users`、`POST /api/users/:id/role`：管理员角色管理
- `GET /api/audit/logs`：管理员查看关键操作审计日志
- `GET /api/security/alerts`：管理员查看敏感操作告警

## 文档

- 产品功能设计：`docs/PRODUCT_FUNCTION_SPEC.md`
- 技术选型与架构：`docs/TECH_STACK_ARCHITECTURE.md`
- 功能开发清单：`docs/DEVELOPMENT_BACKLOG.md`
- 课程知识库设计：`docs/COURSE_KNOWLEDGE_BASE_DESIGN.md`
- 知识库运营指南：`docs/KNOWLEDGE_OPS_GUIDE.md`
- 生产部署指南：`docs/PRODUCTION_DEPLOYMENT.md`
- 资料上传后台设计：`docs/MATERIAL_INGEST_ADMIN_DESIGN.md`
- Supabase 向量检索 SQL：`docs/SUPABASE_VECTOR_SETUP.sql`
- **V2 核心功能设计**（四层引擎 + 自动进化 + 知识更新闭环）：`docs/CORE_FUNCTION_DESIGN_V2.md`
- **V2 课程体系**（六科章节-知识点-课时-题型蓝图）：`docs/CPA_COURSE_ARCHITECTURE_V2.md`
- **V2 MVP 实施路线**（分阶段任务与验收指标）：`docs/MVP_IMPLEMENTATION_ROADMAP_V2.md`
