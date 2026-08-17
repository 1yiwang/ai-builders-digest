# AI Builders Digest — 对外介绍

> 改 CV-site / 简历时用这一页。数字对照代码核实于 2026-08-17。  
> Live: [ainews.yiwang.dev](https://ainews.yiwang.dev/) · [repo](https://github.com/1yiwang/ai-builders-digest)

---

## 那张流程图大概是哪个网站

画风是粉彩分区、圆角卡片、标题旁线稿图标，和 **[Napkin.ai](https://www.napkin.ai)** 最像。其次才是 [Whimsical](https://whimsical.com) 或 [Excalidraw](https://excalidraw.com)。

Napkin 的典型用法：把一段流程贴进去生成图，之后点文字就能改。如果你当时是用旧版 `project-description.md` 里那六段（Trigger / Data Collection / Clean / AI / Store / Publish）生成的，登录 Napkin 看最近项目即可。

## 流程图文字（按原图逐格替换）

结构不用动，六个色块、从左到右。每格仍是标题 + 两三行关键词，不要写成句子。

### Trigger（黄）


| 原文字                 | 改成                  |
| ------------------- | ------------------- |
| GitHub Actions Cron | GitHub Actions Cron |
| Mon - Wed - Fri     | Mon · Wed · Fri     |
| 08:00 UTC           | 06:00 UTC           |


原图写成 08:00 UTC 是错的（那是苏黎世时间）。代码是 `0 6 * * 1,3,5`。

### Data Collection（蓝）→ 三个子卡片不要按「X / 播客 / 博客」拆

**11 feeds 和 13 sources 不重合。**  
11 = 播客节目；13 = 博客站点。两套名单，没有同一个源数两遍。

**RSS 用在哪**

| 源 | 数量 | 怎么取 |
|---|---|---|
| 播客 | 11 | 全是 RSS |
| 博客 | 13 | **11 个 RSS**，2 个页面抓取（Anthropic、Claude） |
| YouTube | 5 | Atom（和 RSS 同类） |
| X | 8 | Nitter 也是 RSS；有 token 才走 API |

所以 RSS 还在，而且覆盖大多数源。只有 Anthropic / Claude 两家博客没有可用 RSS。

原图三个并列盒（X、Podcasts、Blogs）会让 11 和 13 看起来像同一类数字。改成：前两格写真正的信息源和取法，第三格做总结。

| 子卡片 | 原角色 | 改成（关键词） |
|---|---|---|
| 左 | X / Twitter Feed | **Sources** |
| | | X 8 · YouTube 5 |
| | | podcasts 11 · blogs 13 |
| 中 | Podcasts Discovery | **Intake** |
| | | RSS / Atom for most |
| | | 2 blogs scraped |
| 右 | Blogs RSS Aggregator | **Window** |
| | | last 72h |
| | | Nitter or X API |

不要在三张卡上同时再写一遍 `11 feeds` 和 `13 sources`。数字只出现在左边 Sources 里，并标上 podcasts / blogs，就不会混。


### Clean & Prepare（紫）→ 标题可改成 Transform


| 原文字                  | 改成                      |
| -------------------- | ----------------------- |
| Deduplicate & Filter | 72h date gate           |
| Time-Window Filter   | prior-issue URL skip    |
| (Persistent State)   | （删掉 Persistent State）   |
| Merge & Normalize    | density extract · score |
| → Prepare AI Input   | max 2 / source          |
| (Feed JSON)          | 12-item shortlist       |


### AI Processing（粉）


| 原文字                    | 改成                       |
| ---------------------- | ------------------------ |
| LLM Core Engine        | one DeepSeek call        |
| DeepSeek (Primary)     | URLs locked to shortlist |
| Claude (Fallback)      | （删掉 Claude）              |
| Structured JSON Output | DE/EN JSON               |
| Title • Cards • Tags   | schema · 1 repair        |
| Bilingual (EN / CN)    | skip if still invalid    |


原图 EN/CN 是错的，杂志是 **EN/DE**。

### Store & Render / Publish & Display（绿 + 红）

后面这些格子不用改，原文已经够清楚。重点只改前面的数据准备和 AI Processing。


### 改完后每格应看到的字（复制用，对原图格子）

**Trigger**（1 格）  
GitHub Actions Cron  
Mon · Wed · Fri  
06:00 UTC

**Data Collection**（原 3 格，不要按 X/播客/博客切）

左 · 原 X / Twitter Feed  
X, YouTube, podcasts, blogs  
8 · 5 · 11 · 13

中 · 原 Podcasts Discovery  
mostly RSS and Atom  
Anthropic and Claude: scrape

右 · 原 Blogs RSS Aggregator  
last 72 hours  
Nitter, or X API if we have a key

**Clean & Prepare**（原 2 格。不要再写 72h，窗口已在收集阶段说过。）

左 · 原 Deduplicate & Filter  
Dedup + source cleanup  
prior-issue URL filter  
drop stale / undated items

右 · 原 Merge & Normalize  
Merge & Normalize  
→ Prepare AI Input  
(Feed JSON)

**AI Processing**（原 2 格）

左 · 原 LLM Core Engine  
LLM Core Engine  
DeepSeek API  
shortlist context

右 · 原 Structured JSON Output  
Structured JSON Output  
Title · Cards · Tags  
Bilingual EN / DE

**Store & Render / Publish & Display**  
Keep original text.


---

## CV 卡片（可粘贴）

### 介绍段

I follow a small set of AI builders to learn how they ship. Checking their X, blogs, and videos every day was eating the morning. AI Builders Digest is the bilingual (DE/EN) magazine that does it for me: three times a week it pulls the last 72 hours and publishes an issue by itself.

I follow a handful of AI builders to learn how they ship, but checking their sites every day was a job. AI Builders Digest is a timed pipeline that fetches the last 72 hours of their posts, three times a week, and publishes a bilingual (DE/EN) magazine by itself. I read the issue, not twenty tabs.

### Extract

Last 72h from 8 X, 5 YouTube, 11 podcasts, 13 blogs. Drop stale items and URLs already used in a prior issue.

### Transform

Evidence-aware preprocessing: keep sentences with numbers, model names, and launch signals; score, dedupe, cap sources, then send a compact shortlist to one DeepSeek JSON call.

### Load

GitHub Actions Mon/Wed/Fri. Git is the datastore. Source-health and run ledgers track failures, token cost, prompt hash, and repair attempts. Vercel + Telegram publish only valid issues.

### 芯片

`GitHub Actions` · `Node.js` · `DeepSeek` · `Vercel` · `Telegram Bot`  
去掉 `Claude`。日期改成 May 2026 – present。

### 简历一行

Scheduled LLM ETL: extract 72h AI-builder feeds, select evidence before generation, validate DeepSeek JSON, and publish a DE/EN magazine with source-health and cost telemetry.

### 中文（介绍段）

我想跟着少数 AI builder 学他们怎么做东西，但每天去翻他们的网站太耗时间。AI Builders Digest 是一套定时管线：每周三次抓过去 72 小时的更新，自动出一本德英双语电子杂志。我看杂志，不用刷二十个标签页。