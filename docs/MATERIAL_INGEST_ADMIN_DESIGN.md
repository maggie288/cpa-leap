# 教材资料上传与入库后台（MVP设计）

## 目标

为 CPA 6 科建立可运营的资料入口，让你可以持续上传教材 PDF/考纲/真题，并将其转化为 AI 课程生成可用的知识输入。

## 当前已落地（MVP）

### 前端教研后台
- 页面：`/knowledge`（教研审核台）
- 新增模块：资料上传与入库
  - 上传 PDF（按科目、章节、年份、资料类型）
  - 列表查看资料状态
  - 一键触发“处理入库”

### 后端接口
- `GET /api/materials`：资料列表（支持 subject/status 过滤）
- `GET /api/materials/stats`：资料统计
- `POST /api/materials/upload`：上传资料（multipart/form-data）
- `POST /api/materials/:id/process`：触发处理入库

### 数据结构（db state）
- `materials[]`
  - `id`
  - `originalName / filename`
  - `subject / chapter / year / sourceType`
  - `status`：`uploaded | processing | ready | failed`
  - `chunkCount`
  - `ocrUsed`
  - `uploadedAt / processedAt / errorMessage`

## 入库流水线（当前与下一步）

### 当前版本（已可用）
1. 上传文件到 `server/data/uploads`
2. 保存资料元数据
3. 点击“处理入库”后执行 PDF 文本解析；若文本密度过低自动触发 OCR
4. 按页切片并生成 embedding（有 OpenAI Key 用真实 embedding，否则用本地向量兜底）
5. 写入 `materialChunks[]`，并同步到 Supabase `material_chunks`（pgvector）
6. 生成知识条目草稿进入知识库流程
6. 更新资料状态与切片数量

### 下一步（正式版本）
1. 使用 Supabase pgvector 做向量检索（已接入，需先执行初始化 SQL）
2. 章节目录自动识别与结构化对齐
3. 入库质量报告（页级解析率、噪声比例、术语命中率）
4. 与课程生成链路做强绑定（引用页码与原文片段）

## 权限建议（后续）
- 管理员：上传、处理、删除、重跑
- 教研：查看、标注章节
- 学员：仅使用生成内容，不可访问原始资料管理接口

## 生产注意事项
- 上传目录应挂载对象存储或持久卷
- 限制单文件大小（当前50MB）
- 只允许 PDF（生产建议加 MIME 与扩展名双校验）
- 建议开启病毒扫描与版权审计流程
