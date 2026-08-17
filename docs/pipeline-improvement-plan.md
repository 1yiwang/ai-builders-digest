# Pipeline Improvement Plan
> Created: 2026-08-17 | Status: shipped (`ffa93b4`); regenerating 2026-08-17 issue with new pipeline

---

## 0. 已发现的 Bug（先修）

### Bug A：大量头像文件缺失 — 15+ files in manifest but not on disk

运行 `ls assets/avatars/` 发现只有 24 个文件，而 `avatar-manifest.json` 记录了 39 条：

| 缺失文件 | 来源 manifest key |
|---|---|
| `x-rauchg.jpg` | `x:rauchg` |
| `x-petergyang.jpg` | `x:petergyang` |
| `x-nikunj.jpg` | `x:nikunj` |
| `x-levie.jpg` | `x:levie` |
| `x-realmadhuguru.jpg` | `x:realmadhuguru` |
| `x-trq212.jpg` | `x:trq212` |
| `x-zarazhangrui.jpg` | `x:zarazhangrui` |
| `x-mattturck.jpg` | `x:mattturck` |
| `blog-anthropic-engineering.jpg` | `blog:Anthropic Engineering` |
| `podcast-latent-space.jpg` | `podcast:Latent Space` |
| `podcast-no-priors.jpg` | `podcast:No Priors` |
| `podcast-unsupervised-learning.jpg` | `podcast:Unsupervised Learning` |
| `podcast-the-mad-podcast-with-matt-turck.jpg` | 同名 podcast key |
| `podcast-ai-i-by-every.jpg` | `podcast:AI & I by Every` |
| `blog-.jpg` (共用) | `blog:程序员鱼皮` + `blog:超级小华` 路径冲突 |

**根本原因**：`download-avatars.js` 执行时 `unavatar.io` 对多个 handle 返回错误或超时，但 manifest 已被更新为预期路径；渲染时本地文件不存在、`<img>` 404 显示破图。

**修复方案**：
1. `download-avatars.js` 下载前先校验：只写 manifest 当文件真正保存成功
2. 渲染端 `resolveAuthorMeta` 加 `fs.existsSync` 检查：local file 不存在时退回 `fileUrl` 远端链接
3. 移除中文博客（`程序员鱼皮`/`超级小华`）——内容与英文 AI Digest 目标读者不符，也造成路径冲突

### Bug B：Blog RSS 条目 description 恒为空

`fetchBlogRSSContent` 第 675 行写死了 `description: ''`，导致进入 LLM 的 blog-rss 条目只有标题，没有正文摘要。

```js
// 现在（错的）
results.push({ ..., description: '', content: article.content });

// 应该
results.push({ ..., description: article.content.slice(0, 400), content: article.content });
```

---

## 1. 核心问题：信息源不足以保证每 72h 都有内容

### 现有信息源及其可靠性评估

| 信息源类型 | 来源数 | 实际可靠性 |
|---|---|---|
| X/Nitter | 8 handles | ⚠️ Nitter 不稳定，每次只有 2-3 个成功 |
| YouTube Atom | 5 channels | ✅ Atom feed 稳定，但发布频率低（周级别） |
| Podcast RSS | 11 shows | ✅ RSS 稳定，但 72h 窗口内有时 0 新集 |
| Blog RSS | 8 feeds | ⚠️ 发布频率差异大；content 字段为空（Bug B） |
| Blog Scrape | 2 (Anthropic) | ⚠️ 需 HTTP 抓取，日期解析脆弱 |

**关键问题**：多个信息源 72h 内无新内容。若 X 全部失败 + Podcast 0 集，当次 magazine 只剩博客，内容极薄。

### 需要添加的高频 AI 新闻源

以下来源**每天**（甚至多次/天）发布 AI 内容，RSS 稳定，且日期字段可靠：

| 来源 | RSS URL | 发布频率 | 备注 |
|---|---|---|---|
| The Decoder | `https://the-decoder.com/feed/` | 每天 3-5 篇 | 已接入，72h 内可抓到 |
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` | 每天多篇 | 已接入；VentureBeat AI 分类 RSS 停在 2026-05，已换掉 |
| TLDR AI | `https://tldr.tech/api/rss/ai` | 每天 1 期 | 已接入；周五 00:00 的期在周一早晨可能刚好超出 72h |
| The Rundown AI | `https://www.therundown.ai/rss` | 每天 1 期 | 订阅量大，选题精 |
| Import AI (Jack Clark) | `https://jack-clark.net/feed/` | 每周 | 研究 + 政策，深度 |
| Interconnects (Nathan Lambert) | `https://www.interconnects.ai/feed` | 每周 2-3 次 | RLHF/policy 深度分析 |

**目标**：每次 generate-feed 在 72h 内保证 ≥ 15 条候选（目前有时只有 6-8 条）。

---

## 2. 信息密度提取（核心质量改进）

### 现状

`prepare-feed.js` 对 blog/podcast 内容做字符截断：

```js
// 当前：盲截断
const truncated = content.slice(0, BLOG_CHARS);
```

**问题**：截断取的是文章开头，而很多博客开头是导语/SEO 水词，核心数据点（数字、实验结果、模型名）在中后段。

### 改进方案：信息密度提取

```js
// 新增 extractDenseSentences(text, charBudget)
// 打分规则：
//   +3 每个数字/百分比/版本号
//   +2 每个大写专有名词（GPT、Claude、RLHF 等）
//   +1 每个动词短语（improves、outperforms、achieves 等）
// 选取得分最高的句子直到 charBudget 用完
```

**预期效果**：同样的 token 预算，LLM 收到的是"GPT-4 achieves 91.3% on MMLU"而不是"In this post, we will explore the exciting developments..."

---

## 3. 打分函数优化

### 现状（prepare-feed.js `scoreText`）

```js
// 当前：digit 数量 + company 关键词命中
let score = (text.match(/\d/g) || []).length * 0.5;
```

### 改进方案

```js
function scoreText(item) {
  const text = item.text || item.description || item.content || '';
  let score = 0;
  
  // 基础分（按内容类型）
  const baseScore = { 'podcast': 1.5, 'youtube': 1.2, 'blog-rss': 1.0, 'x': 0.8 }[item.source] || 1.0;
  score += baseScore;
  
  // 信号词加分
  score += (text.match(/\d+(\.\d+)?[%xB]?/g) || []).length * 0.5; // 数字
  score += (text.match(/\b(GPT|Claude|Gemini|Llama|RLHF|RAG|fine-?tun|benchmark|SWE|SOTA|outperforms)\b/gi) || []).length * 0.3;
  
  // 低信号惩罚
  if (item.source === 'x' && text.length < 80) score -= 1.0;  // 太短的推文
  if (text.match(/^(Just|Finally|Super|Wow|Amazing|Interesting)/i)) score -= 0.5; // 感叹词开头
  
  return score;
}
```

---

## 4. Soft Eval 指标补充

在 `scripts/eval-magazine.js` 添加软指标（不阻断出刊，记录到日志）：

```
✓ Each card contains at least one number or percentage
✓ Bullet points ≤ 30 words each
✓ authorKey resolves to known identity (warns on unknown)
✓ No card has publishedAt > 7 days ago
```

---

## 5. 实施优先级

| 优先级 | 任务 | 改动文件 | 预计工时 |
|---|---|---|---|
| P0 | Bug A：修 download-avatars + 渲染侧 fallback | `scripts/download-avatars.js`, `src/render/render-ai-builders-digest.js` | 30min |
| P0 | Bug B：blog-rss description 改为 content | `scripts/generate-feed.js` | 5min |
| P1 | 移除中文博客，添加 The Decoder + TechCrunch AI + TLDR AI | `config/sources.json` | 10min |
| P1 | blog-rss lookback 从 168h 改为 72h | `scripts/generate-feed.js` | 2min |
| P2 | extractDenseSentences 替换盲截断 | `scripts/lib/prepare-feed.js` | 45min |
| P2 | scoreText 优化 | `scripts/lib/prepare-feed.js` | 20min |
| P3 | soft eval 补充指标 | `scripts/eval-magazine.js` | 20min |

---

## 6. 修复后预期状态

- **头像覆盖率**：≥ 95%（修复下载 + fallback 到远端 URL）
- **72h 候选内容**：本机 2026-08-17 实测 blogs 9 条（Simon + Decoder + TechCrunch，全部 8/16–8/17）+ 既有 X/YouTube，prepare-feed 候选 20 → 短名单 12
- **Blog 内容质量**：description 填充真实摘要，LLM 上下文翻倍有效
- **信息时效**：所有条目 publishedAt ≤ 72h（不再出现 4-6 天前的文章）
