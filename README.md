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
JWT_SECRET=replace_with_strong_secret
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ROW_ID=main
VITE_API_BASE=http://localhost:8787/api
VITE_LLM_API_BASE=https://your-llm-gateway.example.com
VITE_LLM_API_KEY=your_api_key
```

若未配置外部 LLM，系统默认使用本地生成 fallback。

## 知识库扩库

```bash
npm run kb:import -- --file path/to/knowledge.json --actor your_name
```

模板：`server/knowledge/templates/knowledge-entry.template.json`

## AI自动教研接口

- `POST /api/llm/generate-cpa-lesson`：触发自动教研流水线并返回课程
- `GET /api/automation/stats`：查看自动审核通过率等指标
- `GET/POST /api/automation/settings`：管理自动化参数

## 文档

- 产品功能设计：`docs/PRODUCT_FUNCTION_SPEC.md`
- 技术选型与架构：`docs/TECH_STACK_ARCHITECTURE.md`
- 功能开发清单：`docs/DEVELOPMENT_BACKLOG.md`
- 课程知识库设计：`docs/COURSE_KNOWLEDGE_BASE_DESIGN.md`
- 知识库运营指南：`docs/KNOWLEDGE_OPS_GUIDE.md`
- 生产部署指南：`docs/PRODUCTION_DEPLOYMENT.md`
