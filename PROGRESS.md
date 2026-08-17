# AI Builders Digest — 进度文档

最后更新：2026-08-17

## 2026-08-17 — 72h 新鲜源 + 头像/进模质量

规划：`docs/pipeline-improvement-plan.md`。已推 `main`（`ffa93b4`）。不接数据库。

已落地：

- **头像**：`download-avatars.js` 只在文件真正保存后写 manifest；渲染时本地缺失则用 `fileUrl`，`<img onerror>` 回退首字母
- **博客 72h**：`BLOG_LOOKBACK_HOURS` / `blogMaxAgeHours` 168 → 72；无日期的过期条目不再写入 `seenArticles`
- **源**：去掉中文博客；加入 The Decoder、TechCrunch AI、TLDR AI、Latent Space、Interconnects（VentureBeat AI 分类 RSS 停在 2026-05，未采用）
- **RSS 正文**：不再写空 `description`；无 `content:encoded` 时抓 `og:description`；先解码实体再剥 HTML
- **进模**：`extractDenseSentences` 替换盲截断；`scoreText` 按类型加权并惩罚空推
- **软 eval**：无数字 / 子弹 >30 词 / 未知 `authorKey` 只警告，不挡出刊

本机检查（2026-08-17）：Decoder + TechCrunch + Simon 共 9 篇博客（8/16–8/17）；`npm run prepare-feed` 候选 20 → 短名单 12；`npm run eval` 33 期 current 0/1 fail。

下一步：见 `docs/applied-ai-next-plan.md`（README + faithfulness eval 优先）。

## 2026-08-16 — 新鲜源（X / YouTube）

规划：`docs/fresh-sources-plan.md`。不接 YouTube Data API，不接数据库。

已落地：

- **日期闸门**：scrape / RSS 无日期或早于窗口 → 丢弃，并写入 `seenArticles`（90 天）避免旧文 14 天复活
- **Lookback**：X / 播客 / 油管 72h（对齐 MWF）；博客 7 天
- **油管独立源**：`config/sources.json` 的 `youtube[]` → `data/feeds/feed-youtube.json`（公开 Atom）
- **X 名单**：Karpathy / sama / swyx / Andrew Ng / Peter Yang / Levie / Rauch / Elon（8 个）
- **短名单**：过期博客进不了 12 席；`kind: youtube` 与 tweet/podcast/blog 并列

本机检查（2026-08-16）：`node scripts/generate-feed.js` → 博客 6 条（8-10～8-12，无 4–6 月 Anthropic）、油管 6 条（8-13～8-15）、X 2 个账号（Nitter；Andrew Ng + Rauch）。`npm run prepare-feed` 短名单 12 条：5 youtube + 4 blog + 3 tweet。`npm run eval`：33 期，current 0/1 fail，legacy 0/32 fail。

## 2026-08-16 — 应用岗管线升级（无新数据库）

规划：`docs/llm-pipeline-upgrade-plan.md`。存储仍是 Git JSON，不接 Convex / 任何托管库。

已落地：

- **进模前处理**：`scripts/lib/prepare-feed.js` — 截断 + 规则短名单（12 条、无 URL 丢弃、同一来源最多 2 条）
- **账本**：出刊写入 `meta`（tokens / 估成本 / `sourceUrls`）；瘦目录 `data/archive-index.json`
- **校验 + 修 1 次**：`scripts/lib/validate-magazine.js`，失败则把错误打回模型，再失败则跳过本期
- **本机免费通路**：Ollama 已卸载。生成恢复为 DeepSeek key，否则走 `ANTHROPIC_*`（实际是 `api.deepseek.com/anthropic` 网关，和 8 月 14 日以前的 CI 一样）。
- **回归**：`npm run eval` → `data/eval/last-report.json`
- **CI 降级**：生成失败或当天无 JSON 时跳过渲染/Telegram，job 保持绿色，并打印 `estCostUsd`

2026-06-17 本地 feed 实测：进模字符 73,057 → 7,440（约 −90%），估 input tokens ~18,265 → 1,860。本轮未调用付费 API。

本机检查：`npm run prepare-feed`、`npm run eval`。CI 检查：Actions → AI Builders Digest (MWF) → Run workflow。

追上 origin 后本地现有 **32 期**（至 2026-08-14），`npm run eval` 全部 legacy 通过。

未做（可选）：本机 Ollama 实跑一期 dry-run；用 DeepSeek 出一期带 `meta` 的新刊（现有期都是 legacy）。不上数据库；首页按年分页等约 80 期再做。

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
- `data/issues/ai-builders-digest-2026-05-29.json`（6 张卡片，3 章节 — v2 新版 prompt 生成）
- `issues/ai-builders-digest-2026-05-25.html`（已渲染）
- `issues/ai-builders-digest-2026-05-29.html`（已渲染）

### 自动化管线
- `scripts/generate-feed.js`：Nitter RSS (X) + RSS + YouTube + 博客抓取，生成本地 feed JSON
- `scripts/generate-magazine-json.js`：Feed → AI API → Magazine JSON 全自动
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

### X/Twitter API v2 接入（2026-05-29）
- ✅ 双模式架构：免费 Nitter RSS（默认）+ 付费 X API v2（可选升级）
- ✅ 免费方案：`nitter.net` RSS → curl 抓取（绕过 TLS 指纹检测）→ 原创推文过滤
- ✅ RSS 解析器：提取推文文本、ID、日期，支持 `&apos;` 等 XML 实体
- ✅ 自动过滤 retweets（`RT by @`）和 replies（`R to @`），保持与 API 路径一致
- ✅ 多实例 fallback：`nitter.net` → `nitter.1d4.us` → `nitter.catsarch.com`
- ✅ 付费升级路径：设置 `X_BEARER_TOKEN` 自动切换 X API v2，含 metrics 数据
- ✅ `config/sources.json` 新增 `x` 数组：8 位 AI builder
- ✅ `.github/workflows/daily-digest.yml` 传递 `X_BEARER_TOKEN` secret
- ✅ `--x-only` CLI flag 支持单独抓取 X 内容

## 已完成的优化

### ✅ 12. Telegram 推送 + GitHub Actions 定时自动化 — 已完成
- `scripts/send-telegram.js`：将最新杂志格式化为 Telegram HTML 消息并推送
- 凭证优先级：env vars → `~/.claude/settings.json` → `.follow-builders/.env`
- 消息格式：标题 + 摘要 + 统计 + 5 条亮点 + 阅读链接
- `.github/workflows/daily-digest.yml`：周一/三/五 08:00 Zurich 自动运行 + `workflow_dispatch` 手动触发
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

### 信息源扩展（2026-05-29）
- ✅ 公司博客 RSS：Hugging Face, OpenAI, Together AI（3 个）
- ✅ 个人博客 RSS：Karpathy, Simon Willison, Chip Huyen（3 个）
- ✅ 中文博客 RSS：程序员鱼皮, 超级小华（2 个）
- ✅ 新播客 RSS：MLST, Cognitive Revolution, Last Week in AI, Practical AI（4 个）
- ✅ X/Twitter：新增 @elonmusk（现共 9 位 builder）
- ❌ 花叔v（X handle 未确认）、秋芝2046（飞书不可访问）、Lilian Weng / Eugene Yan（RSS 404）、Dwarkesh（空 feed）

### 排期与 Lookback 优化（2026-05-29）
- ✅ CI 排期：每日 → 周一/三/五 `0 6 * * 1,3,5`
- ✅ 播客 lookback：14 天（336h）→ 3 天（72h），减少重复
- ✅ Workflow 更名为 "AI Builders Digest (MWF)"

### API 双模式（2026-05-29）
- ✅ DeepSeek 原生 OpenAI 格式支持（`/v1/chat/completions`）
- ✅ Anthropic 格式保留作为 fallback，自动检测 `DEEPSEEK_API_KEY`
- ✅ 实际运行在 DeepSeek 兼容网关 `api.deepseek.com/anthropic`，零成本切换
- ✅ CI workflow 新增 `DEEPSEEK_API_KEY/BASE_URL/MODEL` secrets

### Prompt 质量打磨（2026-05-29）
- ✅ 播客卡片强制要求：第一颗 bullet 点名嘉宾 + 公司
- ✅ Section 主题：一个 section = 一个思想，禁止硬拼
- ✅ X/Twitter 质量门槛：必须有数据/发布/判断，显式跳过段子/meme
- ✅ Editor's Note：每句 ≤25 词，禁止 cram
- ✅ 卡片数：7-10 → 6-8，宁缺毋滥
- ✅ 测试验证：新版 6 卡片 3 章节 (vs 旧版 10 卡片 5 章节)，质量明显提升

### 工作流脚手架与基础设施（2026-05-30）
- ✅ Repo 跨盘移动：`C:\Users\Monica\ai-builders-digest` → `D:\Projects\ai-builders-digest`
- ✅ `scripts/publish.ps1` 路径无关化：`$RepoRoot` 由 `$PSScriptRoot` 派生，不再硬编码（commit `f2536e9`）
- ✅ 引入 `cursor-daily-workflow` scaffold（`1yiwang/cursor-daily-workflow`）：
  - `.cursor/rules/journal-workflow.mdc`（trigger phrases / 日循环 / EOD 流程）
  - `.cursor/rules/knowledge-capture.mdc`（新概念自动入库到 NCD 表）
  - `scripts/journal-archive.ps1`（月度归档脚本）
  - `Project-Journal-Obsidian.md`（与 Obsidian 单文件契约的日志）
- ✅ 与四个姊妹项目共享同一份工作流契约：`swiss-job-agent-web`（master）、`CV-site`、`permit-advisor`、本项目

## 待开发

- 出一期带新源 + `meta` 的刊（Stage D，需 DeepSeek）
- 确认 GitHub Secret `X_BEARER_TOKEN`（没有则 X 仍走不稳的 Nitter）
- 首页超过约 80 期时再做静态年分页（不要上数据库）
- 多领域分版（金融/政策/生物科技）——旧 backlog，非应用岗必需

## 关键文件

| 文件 | 用途 |
|------|------|
| `index.html` | 首页（封面 + Archive） |
| `src/render/render-ai-builders-digest.js` | 渲染引擎 |
| `src/archive/update-index-archive.js` | Archive 更新 |
| `config/prompt.md` | AI 生成 JSON 的 prompt（CI 可用） |
| `config/author-identities.json` | 作者信息（CI 可用） |
| `config/avatar-manifest.json` | 头像清单（CI 可用） |
| `config/sources.json` | 数据源（X / YouTube / Podcast / Blog） |
| `docs/fresh-sources-plan.md` | 新鲜源规划（日期闸门 + 油管 Atom） |
| `data/issues/*.json` | 杂志原始数据 |
| `data/feeds/*.json` | 本地 feed 缓存 |
| `data/state-feed.json` | Feed 状态（已见内容 + X 用户 ID 缓存） |
| `issues/*.html` | 渲染后的杂志页面 |
| `assets/avatars/*.jpg` | 作者头像文件 |
| `scripts/generate-feed.js` | Feed 生成 |
| `scripts/generate-magazine-json.js` | JSON 生成 |
| `scripts/render-ai-builders-digest.js` | HTML 渲染 |
| `scripts/update-index-archive.js` | Archive 更新 |
| `scripts/send-telegram.js` | Telegram 推送 |
| `scripts/lib/prepare-feed.js` | 截断 / 短名单 |
| `scripts/lib/validate-magazine.js` | 期刊 schema 校验 |
| `scripts/eval-magazine.js` | 硬指标回归 |
| `data/archive-index.json` | 瘦目录（给以后分页预留） |
| `docs/llm-pipeline-upgrade-plan.md` | 应用岗升级规划 |
| `.github/workflows/daily-digest.yml` | CI 自动化 |
