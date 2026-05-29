# AI Builders Digest — 进度文档

最后更新：2026-05-29

## 已完成

### 封面 (index.html)
- 灵感灯泡 SVG + 发光背板呼吸动画
- 6 个玻璃拟态圆形头像节点（56px），六象限环绕布局
- 浮动动画（错开 delay）+ Hover 放大 1.15x + Tooltip
- 深空背景 #090d16，标题 Thin 300 字重渐变，底部 system-ui 13px 留白
- 主题切换按钮（明/暗），localStorage 持久化
- Archive 列表完全自动生成，零手动维护

### Issue 页面渲染 (render-ai-builders-digest.js)
- 蓝紫暗黑/明亮双模式 CSS 变量系统
- DE/EN 语言 Tab 切换
- 优先级排序 + 低优先级内容折叠
- 作者信息嵌入 + 头像加载

### 数据
- `data/issues/ai-builders-digest-2026-05-25.json`（8 张卡片，含 priority）
- `data/issues/ai-builders-digest-2026-05-29.json`（9 张卡片，5 章节 — 已恢复高质量版本）
- `issues/ai-builders-digest-2026-05-25.html`（已渲染）
- `issues/ai-builders-digest-2026-05-29.html`（已渲染）

### 自动化管线
- `scripts/generate-feed.js`：RSS + YouTube + 博客抓取，生成本地 feed JSON
- `scripts/generate-magazine-json.js`：Feed → DeepSeek API → Magazine JSON 全自动
- `scripts/render-ai-builders-digest.js`：渲染包装器
- `scripts/update-index-archive.js`：Archive 更新包装器
- `scripts/send-telegram.js`：Telegram HTML 推送
- `package.json`：`npm run full` = feed → generate → render → archive → telegram

### Bug 修复
- ✅ Bug 1：Archive 链接 `-rerun.html` → `.html`（`update-index-archive.js:67`）
- ✅ Bug 2：`package.json` 已创建
- ✅ Bug 3：Windows CRLF 正则匹配 → `\r?\n`
- ✅ Bug 4：Anthropic favicon ICO 格式识别
- ✅ Bug 5：头像节点居中对齐（`margin-left: -28px; margin-top: -28px`）

### CI 修复（2026-05-29）
- ✅ `permissions: contents: write` — 解决 git push exit 128
- ✅ `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` — 消除 Node 20 deprecation warning
- ✅ 防覆盖逻辑：当天 JSON 已有 >3 cards 时跳过生成，保留高质量版本
- ✅ `callAPI()` 修正 `publishDate` 参数传递，消除日期漂移
- ✅ 关键配置文件纳入 repo：`config/prompt.md`、`config/author-identities.json`、`config/avatar-manifest.json`
- ✅ 脚本改用 repo 路径优先（`config/`），`~/.follow-builders/` 作为 fallback
- ✅ `toLocalPath()` 支持 repo-relative 路径解析
- ✅ `download-avatars.js` 同步写入 repo `config/` 和 `assets/avatars/`

### 移动端响应式（2026-05-29）
- ✅ `index.html`：~80 条 480px 断点规则（星座节点、封面间距、tooltip、archive、触摸目标）
- ✅ `render-ai-builders-digest.js`：~45 条 480px 断点规则（字体、触摸目标、布局、间距）
- ✅ 两页面均添加 `overflow-x: hidden` + `img { max-width: 100% }` 防护
- ✅ `data-col` 属性替代脆弱 `:nth-child()` 选择器
- ✅ WCAG AA 44px 触摸目标（语言标签、主题切换、折叠按钮）

## 已完成的优化

### ✅ 12. Telegram 推送 + GitHub Actions 定时自动化 — 已完成
- `scripts/send-telegram.js`：将最新杂志格式化为 Telegram HTML 消息并推送
- 凭证优先级：env vars → `~/.claude/settings.json` → `.follow-builders/.env`
- 消息格式：标题 + 摘要 + 统计 + 5 条亮点 + 阅读链接
- `.github/workflows/daily-digest.yml`：每天 08:00 Zurich 自动运行 + `workflow_dispatch` 手动触发
- `npm run telegram` 手动推送；`npm run full` 管线已包含 Telegram

### ✅ 6+8. Archive 自动渲染 + 封面动态摘要 — 已完成
- `index.html` cover 区域移除所有硬编码
- `update-index-archive.js` 增强：自动从 `data/issues/*.json` 提取最新期号
- 封面日期 (`.cover-date`) 动态更新为最新 Issue 日期
- Archive 列表完全由脚本生成，无需手动维护

### ✅ 4. Author 头像文件 — 已完成
- 16 个作者 avatar 已下载（8 X/Twitter + 6 Podcast + 2 Blog）
- `config/avatar-manifest.json` + `config/author-identities.json` 纳入 repo
- `scripts/download-avatars.js`：自动下载 + 同步到 repo

### ✅ 5. 摘要质量迭代 — 已完成
- Prompt 全面重写（~6KB，位于 `config/prompt.md`）
- 新增内容类型指南、bullet 质量规则（≤30 词）、好/坏示例
- 来源多样性规则：同一来源最多 2 卡、至少 3 个不同来源
- Priority 评分标准 + 编辑导语写作模式 + 最终检查清单

## 待开发

- X/Twitter API 接入
- Blog RSS 替代方案
- 扩展信息源（更多播客/博客/中文媒体）
- 多领域分版（金融/政策/生物科技）

## 关键文件

| 文件 | 用途 |
|------|------|
| `index.html` | 首页（封面 + Archive） |
| `src/render/render-ai-builders-digest.js` | 渲染引擎 |
| `src/archive/update-index-archive.js` | Archive 更新 |
| `config/prompt.md` | AI 生成 JSON 的 prompt（CI 可用） |
| `config/author-identities.json` | 作者信息（CI 可用） |
| `config/avatar-manifest.json` | 头像清单（CI 可用） |
| `config/sources.json` | Podcast/Blog 数据源 |
| `data/issues/*.json` | 杂志原始数据 |
| `data/feeds/*.json` | 本地 feed 缓存 |
| `issues/*.html` | 渲染后的杂志页面 |
| `assets/avatars/*.jpg` | 作者头像文件 |
| `scripts/generate-feed.js` | Feed 生成 |
| `scripts/generate-magazine-json.js` | JSON 生成 |
| `scripts/render-ai-builders-digest.js` | HTML 渲染 |
| `scripts/update-index-archive.js` | Archive 更新 |
| `scripts/send-telegram.js` | Telegram 推送 |
| `.github/workflows/daily-digest.yml` | CI 自动化 |
