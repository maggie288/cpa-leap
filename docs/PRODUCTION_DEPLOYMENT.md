# 生产环境部署指南

## 一、系统回顾（当前形态）

- 前端：React + Vite（H5）
- 后端：Node.js + Express
- 数据：Supabase Postgres（生产）/ lowdb（本地开发兜底）
- AI教研：自动生成 -> 自动质检 -> 自动修复 -> 自动审核 -> 学员学习
- 自动实验：A/B 分流 + 模型效果统计（通过率/质量分/学员得分）

## 二、生产部署推荐（单容器同域）

项目已支持同域部署：
- 后端接口：`/api/*`
- 前端静态资源：`dist/*`
- SPA 路由回退：由 `server/index.js` 处理

这意味着你只需要一个服务实例即可上线。

## 三、先创建 Supabase（必须）

### 1) 在 Supabase 创建项目

拿到两个值：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2) 在 SQL Editor 执行以下 SQL

```sql
create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
```

### 3) 可选：预写入主状态行

```sql
insert into public.app_state (id, payload)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
```

## 四、方式A：Docker部署（推荐）

### 1) 构建镜像

```bash
docker build -t cpa-leap:prod .
```

### 2) 运行容器

```bash
docker run -d \
  --name cpa-leap \
  -p 8787:8787 \
  -e NODE_ENV=production \
  -e PORT=8787 \
  -e JWT_SECRET=replace_with_strong_secret \
  -e CORS_ORIGIN=https://your-domain.com \
  -e SUPABASE_URL=https://xxxx.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  -e SUPABASE_STATE_TABLE=app_state \
  -e SUPABASE_STATE_ROW_ID=main \
  cpa-leap:prod
```

### 3) 健康检查

```bash
curl http://localhost:8787/api/health
```

## 五、方式B：非Docker（Node进程）

```bash
npm ci
npm run build
NODE_ENV=production \
PORT=8787 \
JWT_SECRET=replace_with_strong_secret \
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
npm start
```

建议配合 PM2/Systemd 托管进程。

## 六、上线前必做

1. 设置强随机 `JWT_SECRET`
2. 配置 `CORS_ORIGIN` 为真实域名
3. 配置 Supabase 连接变量（`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）
4. 接入 HTTPS（Nginx/Cloudflare/平台证书）
5. 配置日志与备份策略（建议备份 `app_state` 表）

## 七、后续升级建议（生产级）

- 数据层分表：users/progress/generation_runs/model_feedback（替代单 app_state）
- 对象存储：题库资源和生成版本快照
- 异步任务队列：AI教研流水线任务化
- 可观测性：Prometheus + Grafana + 错误告警
