# AI Builders Digest — 进度文档

最后更新：2026-05-29

## 已完成

### 封面 (index.html)
- 灵感灯泡 SVG + 发光背板呼吸动画
- 6 个玻璃拟态圆形头像节点（48px），六象限环绕布局
- 浮动动画（错开 delay）+ Hover 放大 1.15x + Tooltip
- 深空背景 #090d16，标题 Thin 300 字重渐变，底部 system-ui 13px 留白
- 主题切换按钮（明/暗），localStorage 持久化
- Archive 列表有一期硬编码条目（2026-05-25）

### Issue 页面渲染 (render-ai-builders-digest.js)
- 蓝紫暗黑/明亮双模式 CSS 变量系统
- DE/EN 语言 Tab 切换
- 优先级排序 + 低优先级内容折叠
- 作者信息嵌入 + 头像加载

### 数据
- `data/issues/ai-builders-digest-2026-05-25.json`（8 张卡片，含 priority）
- `data/issues/ai-builders-digest-2026-05-29.json`（10 张卡片，4 章节 — 自动生成）
- `issues/ai-builders-digest-2026-05-25.html`（已渲染）

### 自动化管线
- `scripts/publish.ps1`：JSON→HTML→Archive更新→Git Push
- `scripts/render-ai-builders-digest.js`（渲染包装器）
- `scripts/update-index-archive.js`（Archive 更新包装器）
- `src/archive/update-index-archive.js`（Archive 更新核心）
- **🆕 `scripts/generate-magazine-json.js`**：Feed → AI → Magazine JSON 全自动
- `package.json`：`npm run generate` / `npm run render` / `npm run full`

### Bug 修复
- ✅ Bug 1：Archive 链接 `-rerun.html` → `.html`（`update-index-archive.js:67`）
- ✅ Bug 2：`package.json` 已创建

## 待开发

### 下一步优化方向
- 移动端响应式优化
- X/Twitter API 接入
- Blog RSS 替代方案
- 扩展信息源（更多播客/博客/中文媒体）
- 多领域分版（金融/政策/生物科技）

## 已完成的优化

### ✅ 12. Telegram 推送 + GitHub Actions 定时自动化 — 已完成
- `scripts/send-telegram.js`：将最新杂志格式化为 Telegram HTML 消息并推送
- 自动读取凭证：env vars → `~/.claude/settings.json` → `.follow-builders/.env`
- 消息格式：标题 + 摘要 + 统计 + 5 条亮点 + 阅读链接
- `.github/workflows/daily-digest.yml`：每天 08:00 Zurich 自动运行
- `npm run telegram` 手动推送；`npm run full` 管线已包含 Telegram
- 已测试发送到 @Yis_AI_Digest_Bot（message_id=9）✅

### ✅ 6+8. Archive 自动渲染 + 封面动态摘要 — 已完成
- `index.html` cover 区域移除所有硬编码
- `update-index-archive.js` 增强：自动从 `data/issues/*.json` 提取最新期号
- 封面日期 (`.cover-date`) 动态更新为最新 Issue 日期
- 新增封面 `Latest Issue` teaser — 显示 `archive.title` + 直达链接
- Archive 列表完全由脚本生成，无需手动维护
- 修复 Windows CRLF 正则匹配 + 字体（Noto Serif SC → IBM Plex Sans）

### ✅ 4. Author 头像文件 — 已完成
- 16 个作者 avatar 已下载（8 X/Twitter + 6 Podcast + 2 Blog）
- `avatar-manifest.json` 已填充所有条目
- `author-identities.json` 已添加 podcast/blog 作者条目
- `scripts/download-avatars.js`：自动从 unavatar.io / RSS / favicon 下载
- `assets/avatars/` 包含所有 .jpg 文件，渲染已确认正常工作

### ✅ 5. 摘要质量迭代 — 已完成
- Prompt 全面重写（~4KB → ~6KB）
- 新增内容类型指南（podcast/blog/X 各自不同的处理方式）
- 新增 Rewrite bullet 质量规则：≤30 词、至少一个具体数字、好/坏示例
- 新增来源多样性规则：同一来源最多 2 卡、至少 3 个不同来源
- 新增 priority 评分标准 + 编辑导语写作模式 + 最终检查清单
- 验证结果：2026-05-29 期 — 5 个不同来源、每卡含具体数据、bullet 长度显著缩短

## 常用命令

```powershell
# 渲染一期新杂志
node src/render/render-ai-builders-digest.js data/issues/ai-builders-digest-YYYY-MM-DD.json

# 更新 index.html 的 archive 列表
node src/archive/update-index-archive.js

# 一键发布（渲染 + archive + push）
powershell -File scripts/publish.ps1 -Date YYYY-MM-DD
```

## 关键文件

| 文件 | 用途 |
|------|------|
| `index.html` | 首页（封面 + Archive） |
| `src/render/render-ai-builders-digest.js` | 渲染引擎（863 行） |
| `src/archive/update-index-archive.js` | Archive 更新（129 行） |
| `scripts/publish.ps1` | 一键发布脚本 |
| `data/issues/*.json` | 原始数据 |
| `issues/*.html` | 渲染后的杂志页面 |
| `.follow-builders/prompts/build-magazine-json.md` | AI 生成 JSON 的 prompt |
| `.follow-builders/assets/author-identities.json` | 作者信息 |
