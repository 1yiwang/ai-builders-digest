# AI Builders Digest — 应用岗升级规划

> 日期：2026-08-16  
> 状态：待执行（先规划，未改代码）  
> 修订：同日补了「一直出刊会不会放不下 / 要不要数据库」和「还有哪些先想清楚再动手」  
> 目标读者：自己执行，或下一会话按阶段落地  
> 约束：**不接 Convex / 不接任何托管数据库**；模型优先免费或本地；云端只保留已经在用的便宜路径。容量策略见第 12 节——**现在不上库，先会满的是首页列表不是磁盘**。

---

## 1. 先回答：Convex 炸了，这个项目受不受影响？

**不受影响。这个项目从来没有、也不需要 Convex。**

当前存储已经是「Git 当数据库」：

| 数据 | 路径 | 谁写 |
|---|---|---|
| 原始 feed | `data/feeds/feed-*.json` | `scripts/generate-feed.js` |
| 去重状态 | `data/state-feed.json` | 同上 |
| 期刊（唯一真相源） | `data/issues/*.json` | `scripts/generate-magazine-json.js` |
| 渲染页 | `issues/*.html` + `index.html` | render / archive 脚本 |
| 发布 | GitHub Actions `git commit` + Vercel 静态托管 | `.github/workflows/daily-digest.yml` |

没有 Postgres、没有 Supabase、没有 Convex、没有长驻后端。CI 跑完把 JSON/HTML 推进 Git，站点从静态文件读。

因此：

- SignalDesk / 其他项目的 Convex 额度爆掉，**不会让 Digest 停更**。
- 这次升级**禁止**为了「更像后端」去接 Convex、Supabase、Neon、Firebase。
- 新东西（短名单、token 账本、eval 报告）全部落在现有 JSON / 新的 `data/` 文件里，继续用 Git 版本化。

若以后真要查询「跨期检索」，那是另一条产品线，且会和 SignalDesk 的 pgvector 故事撞车——本规划明确不做。

---

## 2. 这次升级要解决什么

简历上 Digest 是第二项 AI 项目，第一项 SignalDesk 已经覆盖 hybrid search + 本地 embedding。这边要补的是 **生成管线的可靠性与成本控制**，不是再做一套检索。

三件事：

1. **少花钱**：进模型前先砍上下文；能用规则就不用模型；能用本地就不用云。
2. **更稳**：JSON 坏了能修一次；主模型挂了能降级或跳过，而不是整次 CI 红。
3. **能讲数字**：每期记下 tokens / 延迟 / 估成本 / 入选条数，面试时指得出来。

不做：新 UI、多领域分版、微调、多 agent、向量库、Python 重写。

---

## 3. 目标架构（仍是零数据库）

```
GitHub Actions cron (MWF) 或本机 npm run full
        │
        ▼
  generate-feed.js          采集 + 去重
        │                   写入 data/feeds/*.json
        │                   更新 data/state-feed.json
        ▼
  prepare-ai-input          【新】截断 / 紧凑化 / token 预算
        │                   可选：规则短名单（零模型成本）
        ▼
  Stage A（默认规则，零成本）
        │                   不够再可选：本机 Ollama
        │                   写出 data/debug/shortlist-YYYY-MM-DD.json
        ▼
  Stage B 写期刊 JSON       默认：DeepSeek（已有、极便宜）
        │                   本机可切：Ollama
        │                   失败：修 JSON 重试 1 次 → 再失败则跳过本期
        ▼
  validate + 写入           data/issues/ai-builders-digest-DATE.json
        │                   附 meta（tokens / 模型 / 成本）
        ▼
  render → archive → Telegram → git commit
```

**CI（GitHub Actions）不跑本地大模型。** `ubuntu-latest` 没 GPU、workflow 超时 15 分钟，Ollama 7B 在 CI 里不现实。CI 路径 = 规则短名单 + DeepSeek 写稿。Ollama 只用于本机开发、eval 重放、以及「完全不想花 API 钱时的手动出刊」。

---

## 4. 存储方案（替代 Convex 的明确答案）

所有新状态都是文件，跟现有约定一致。

| 新产物 | 建议路径 | 是否进 Git |
|---|---|---|
| 每期 `meta`（模型、tokens、成本） | 写进该期 `data/issues/*.json` 的 `meta` 字段 | 是（简历/面试素材） |
| Stage A 短名单 | `data/debug/shortlist-YYYY-MM-DD.json` | 否（加入 `.gitignore` 的 `data/debug/`） |
| 模型原始烂输出 | 已有 `data/debug/invalid-json-*.json` | 否 |
| Eval 报告 | `data/eval/last-report.json` | 是（一份最新报告即可，证明有回归） |
| 瘦目录（date/title/desc/href） | `data/archive-index.json` | 是（首页/将来分页只读这一份，不必打开全部期刊正文） |
| 去重 | 继续 `data/state-feed.json` | 是（已有 14 天淘汰，不会无限涨） |

`.gitignore` 增补：

```
data/debug/
```

`data/issues/*.json` 的 `meta` 形状（渲染脚本必须忽略未知字段，避免 HTML 坏掉）：

```json
"meta": {
  "generatedAt": "2026-08-16T06:12:00.000Z",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "fallbackUsed": false,
  "repairAttempts": 0,
  "latencyMs": 41200,
  "tokensIn": 9800,
  "tokensOut": 2100,
  "estCostUsd": 0.012,
  "candidatesIn": 47,
  "shortlistSize": 12,
  "cardsPublished": 7,
  "truncation": {
    "rawChars": 180000,
    "preparedChars": 42000,
    "budgetTokens": 12000
  },
  "sourceUrls": [
    "https://www.anthropic.com/engineering/how-we-contain-claude"
  ]
}
```

成本估算用静态单价表（写在 `scripts/lib/model-pricing.js`），不调用计费 API。DeepSeek-chat 按官方价：input $0.14 / 1M、output $0.28 / 1M。Ollama 记 `estCostUsd: 0`。

---

## 5. 模型策略：尽量免费 / 本地

原则：**先规则，再本地，最后才花 API 钱。** 不新开付费账号，不绑第二个会爆额度的 BaaS。

### 5.1 角色分工

| 角色 | 默认 | 本机可选 | 禁止 |
|---|---|---|---|
| Stage A 筛选 | **规则打分（免费）** | Ollama `llama3.2:3b` | 为筛选去调 Claude / 大模型 |
| Stage B 写稿 | **DeepSeek-chat（已有 secret，单期约分币级）** | Ollama `qwen2.5:7b` | 默认上 Sonnet / 换更大模型 |
| JSON 修复重试 | 与 Stage B 同一模型 | 同左 | 再开一个「修复专用」付费模型 |
| Eval 硬指标 | Node 脚本，无模型 | — | — |
| Eval 软指标（可选） | 跳过 | 本机 Ollama | 用付费模型当 judge |

### 5.2 为什么 CI 仍留 DeepSeek，而不是「全面本地」

- 本机 Ollama 适合你自己跑 `npm run generate`，不适合 GitHub-hosted runner。
- DeepSeek 已经接好（`DEEPSEEK_API_KEY` 等 secrets），单价极低。单期在截断之后，粗算 **$0.01–0.03**；一周三期大约 **不到 $0.10**。
- 这不是新的后端账单，也不会和 Convex 额度耦合。

若某个月连 DeepSeek 也不想花：在本机设置

```
DIGEST_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b
```

然后手动 `npm run full`，再 commit。CI 那期若没有 key，应 **跳过生成并 exit 0**（不要红），沿用已有「当天 JSON 已有 >3 cards 则跳过」的精神。

### 5.3 本机 Ollama（Windows）

只在你的电脑上装，不写进 CI。

```powershell
# 安装 Ollama 后
ollama pull llama3.2:3b      # Stage A，CPU 可接受
ollama pull qwen2.5:7b       # Stage B 本机实验；16GB 内存勉强，不要进 CI
```

调用走 OpenAI 兼容接口 `POST {OLLAMA_BASE_URL}/v1/chat/completions`，复用现有 DeepSeek 分支，避免再写一套 Anthropic 格式。

### 5.4 明确不引入的「免费云」

Gemini Flash / Groq / GitHub Models 都可以零费用，但每个都要新申请、新 secret、新失败模式。本规划 **不加第三家云厂商**。现有两条就够：

1. DeepSeek（CI 默认）
2. Ollama（本机）
3. Anthropic 仅作为「key 已在 repo secrets 里」的运行时兜底，不主动当主路径

### 5.5 省钱的第一刀不是换模型，是少送字

当前 `generate-magazine-json.js` 把整包 feed `JSON.stringify(..., null, 2)` 塞进 user 消息。播客 `description` 经常是整期 show notes（例如 Last Week in AI 能到数千词）。钱和时间都耗在模型还没开始写卡片上。

截断规则（先写死，数字可在 eval 后微调）：

| 字段 | 上限 |
|---|---|
| 推文文本 | 原文（本来就短） |
| 博客摘要 / 正文 | 600 字符 |
| 播客 description | 800 字符 |
| 整包 user 消息 | 约 12_000 tokens（按 `chars/4` 估，不引 tiktoken，避免新依赖） |
| 超预算时 | 按来源配额砍：播客最多 8、博客最多 8、X 最多 20；仍超则截断 description |

另外：停止 pretty-print；卡片输出侧继续 `max_tokens` 从 16000 降到 **4000**（6–8 卡双语够用，省输出费和等待）。

---

## 6. 文件改动地图

新建：

| 文件 | 职责 |
|---|---|
| `scripts/lib/prepare-feed.js` | 截断、紧凑化、token 预算、规则短名单 |
| `scripts/lib/validate-magazine.js` | 加深 schema；返回 `{ ok, errors[] }` |
| `scripts/lib/model-pricing.js` | 单价表 + `estimateCostUsd()` |
| `scripts/lib/providers.js` | DeepSeek / Ollama / Anthropic 统一 `chat()` |
| `scripts/eval-magazine.js` | 对历史 `data/issues` + 对应 feed 做硬指标回归 |
| `docs/llm-pipeline-upgrade-plan.md` | 本文件 |

修改：

| 文件 | 改什么 |
|---|---|
| `scripts/generate-magazine-json.js` | 调用 prepare → Stage A → Stage B → 校验/修复 → 写 `meta` |
| `.github/workflows/daily-digest.yml` | 增加 `DIGEST_PROVIDER` / `OLLAMA_*` 可选 env（CI 不设 Ollama）；生成失败改为 warn + 跳过，避免整 job 红 |
| `.gitignore` | 忽略 `data/debug/` |
| `package.json` | 增加 `"eval": "node scripts/eval-magazine.js"` |
| `config/prompt.md` | 写明「你只看短名单，不要发明不在列表里的 URL」 |
| `project-description.md` | 升级完成后再改对外描述（本阶段不动） |

渲染脚本（`src/render/render-ai-builders-digest.js`）按约定应忽略 `meta`。落地 Task 1 时先确认；若它遍历全部顶层 key，再加白名单。

---

## 7. 分阶段任务

每阶段独立可合并、可演示。做完 Stage 1 就可以先更新简历数字；后面可停。

### Stage 0 — 约束冻结（不写代码，5 分钟）

确认并遵守：

- [x] 不新增 npm 依赖（不装 tiktoken、不装 LangChain、不装向量库）
- [x] 不新增托管后端 / 数据库
- [x] CI 不安装 Ollama
- [x] 不把 SignalDesk 的 embedding 抄过来

### Stage 1 — 截断 + 账本（约半天，省钱最多） ✅ 已落地

**目的：** 同一期 feed，进模字符数下降，并留下可引用的前后对比。

1. 抽出 `prepareFeedForModel(feedData, opts)`：
   - 去掉 `null, 2`
   - 按第 5.5 节截断
   - 返回 `{ prepared, stats }`，`stats` 含 `rawChars` / `preparedChars` / `estimatedTokens`
2. `callAPI` 只发送 `prepared`，不再发送原始 feed。
3. 成功写出的 issue 带上 `meta`（此时还没有 shortlist，`shortlistSize` 可等于 `candidatesIn`）。`meta.sourceUrls` 从写成的卡片收集，供以后 eval 用——**不要为了 eval 去快照整份 feed**（播客 description 很大，且 `data/feeds/` 每次会被覆盖）。
4. 每次成功出刊后重写 `data/archive-index.json`（只含 `date / title / desc / href / issue`）。`update-index-archive.js` 可以继续从期刊 JSON 生成首页；瘦目录是给「以后按年分页」预留的，这次不改首页交互。
5. 用一期已有 feed（例如 `2026-06-17`）本地 dry-run，把前后字符数记进本文件第 9 节的实测表。

验收：`node scripts/generate-magazine-json.js --date 2026-06-17 --dry-run` 能跑；`preparedChars` 明显小于 `rawChars`；issue 结构其余字段不变，渲染仍正常。

### Stage 2 — Schema 加深 + 修复 1 次（约一晚） ✅ 代码已接（未做付费 API 实修）

**目的：** 模型吐脏 JSON 时不再整次失败。

`validateMagazineJSON` 改为返回错误列表，至少检查：

- `title` / `publishDate` / `sections[]`
- 每卡：`sourceUrl`、`authorKey`、`priority ∈ {1,2,3}`、`en.rewrite[]`、`de.rewrite[]`
- 总卡数 1–10
- 同一 `sourceName` 不超过 2 张
- 每条 rewrite 用空格分词 ≤ 40（德文复合词放宽，只作软警告也可）
- 若 feed 短名单存在：每张卡的 `sourceUrl` 必须落在短名单里（防幻觉链接）

失败则第二次调用，user 消息只含：错误列表 + 上一版 JSON，**不再重传整包 feed**。`meta.repairAttempts` 记 0 或 1。两次都失败：写 `data/debug/`，进程 **exit 0 并跳过本期**（CI 不红）。

验收：人为把一次响应改成缺 `de` 的 JSON，能看到一次 repair 请求（可用 `--dry-run` + mock，或对本机 Ollama 测）。

### Stage 3 — 规则短名单（约一晚，零模型成本） ✅ 已落地（与 Stage 1 一并）

**目的：** Stage A 默认不花一分钱。

规则分（可叠加，高分优先，取 top 12）：

- 标题/正文含数字、`$`、`%`、年份 → +2
- 含产品/公司专名（小词表即可：Anthropic、OpenAI、GPU、launch…）→ +2
- 来源是播客或工程博客 → +1
- 推文长度 < 40 且无数字 → −3
- 已是 RT / reply（feed 侧若漏网）→ 丢弃

输出 `shortlist`（最多 12 条）给 Stage B。`config/prompt.md` 加一句：只许使用短名单里的条目和 URL。

验收：对 `2026-06-17` 的 feed 跑短名单，打印分数；人工看是否丢掉明显段子、留住有数字的条。

### Stage 4 — 本机 Ollama 通路（约半天） ✅ 代码已接（需本机已装 Ollama 才能实跑）

**目的：** 开发 / 重放 / 省钱出刊不依赖云。

`scripts/lib/providers.js`：

- `DIGEST_PROVIDER=deepseek|ollama|anthropic`（默认 deepseek）
- Ollama 走 `/v1/chat/completions`，与 DeepSeek 同请求体
- 未设置 key 且 provider=deepseek → 清晰报错，提示可改 `DIGEST_PROVIDER=ollama`

CI **不**设置 `DIGEST_PROVIDER=ollama`。本机验证：

```powershell
$env:DIGEST_PROVIDER="ollama"
$env:OLLAMA_MODEL="qwen2.5:7b"
node scripts/generate-magazine-json.js --date 2026-06-17 --dry-run
```

验收：能出合法 JSON；`meta.provider === "ollama"` 且 `estCostUsd === 0`。CPU 上 7B 可能要几分钟，属预期，不因此加长 CI timeout。

### Stage 5 — Eval 脚本（约一晚） ✅ 已落地（现有 10 期均标 legacy 且通过浅校验）

**目的：** 面试能说「质量可回归」。

`npm run eval` 读取 `data/issues/ai-builders-digest-*.json`（至少 3 期），对每期检查 Stage 2 的硬指标，另加：

- `sourceUrl` 是 `http` 开头
- 新格式期：每张卡的 `sourceUrl` 必须出现在该期 `meta.sourceUrls`（或生成时的短名单）里。旧期没有 `meta` 则标 `legacy`，不判失败
- **不要**依赖 `data/feeds/` 做历史对照——那三份文件只代表最近一次抓取
- 写出 `data/eval/last-report.json`：`passed` / `failed` / 每期错误

不做付费 LLM-as-judge。若以后要软指标，只允许本机 Ollama，另开任务，不在本阶段。

验收：对现有 8+ 期跑一遍；允许旧期因当时 prompt 松而失败，报告里分开 `legacy` / `current`。新生成的期必须 pass。

### Stage 6 — CI 降级行为（约 1 小时）

`.github/workflows/daily-digest.yml`：

- 生成脚本非 0 且不是「无内容」时，不让后续 render 读空文件；已有 skip-if-cards>3 逻辑保持
- 不新增付费 secret
- 可选：把 `meta.estCostUsd` 打到 Actions log，方便你扫账单

---

## 8. 和 SignalDesk 的边界（写进简历前再看一眼）

| 不要在 Digest 做 | 原因 |
|---|---|
| pgvector / MiniLM / hybrid search | 第一项已经写过 |
| Convex / 托管 DB | 额度已爆；本项目也不需要 |
| 「换了个更大的模型所以更好」 | 没数字、还更贵 |
| 多 agent 主编/记者 | 贵、脆、像包装 |

Digest 简历只讲：规则预筛 + 约束生成 + schema 修复 + 每期成本账本 + Git 作为数据存储。

---

## 9. 实测对照表（Stage 1 做完后填）

用同一期 `2026-06-17`（或当时最新的本地 feed）填，禁止编造。

| 指标 | 改前 | 改后 |
|---|---|---|
| 进模字符数 `rawChars` → `preparedChars` | 73,057（pretty-print 整包 feed） | 7,440（截断 + 规则短名单 12 条） |
| 估 tokens in | ~18,265（chars/4） | 1,860 |
| 估成本 USD（DeepSeek，仅 input） | $0.002557 | $0.000260 |
| 延迟 ms | 未测（本轮未调模型） | 未测（本轮未调模型） |
| 产出卡数 | — | —（`--prepare-only`，未出新刊） |
| 是否需要 repair | — | — |

实测命令：`node scripts/lib/prepare-feed.js`，feed 日期 2026-06-17。字符数下降约 **90%**。短名单另做了「无 URL 丢弃」和「同一 `name` 最多 2 条」，避免 Anthropic 工程博客占满 12 席、以及把没有 `url` 的播客送给模型。

填完后，简历里的「cut prompt tokens ~X%」才能写。

---

## 10. 完成定义（做到这里就可以上简历）

最少同时满足：

1. 仍是 Git JSON，没有任何新后端。
2. Stage 1 + 2 + 3 已合并；第 9 节有真实前后数字。
3. `npm run eval` 对「新格式期」通过。
4. CI 在 DeepSeek 失败时跳过本期，而不是红掉整个 workflow。
5. 本机可用 Ollama 出一期 dry-run（Stage 4），作为「可零成本运行」的证据，不必让 CI 依赖它。

到此对「应用 AI 工程师第二项」足够。Stage 4 本机通路强烈建议做（证明你能脱离付费 API）；Stage 5 建议做（证明有回归）。再往后就是边际收益。

---

## 11. 建议执行顺序

```
Stage 0 约束
  → Stage 1 截断+meta     ← 先做，立刻省钱、立刻有数字
  → Stage 3 规则短名单     ← 零成本，可和 Stage 2 对调
  → Stage 2 schema+修复
  → Stage 5 eval
  → Stage 4 本机 Ollama
  → Stage 6 CI 降级
```

Stage 1 和 3 都不调用新模型、不花钱、不碰 Convex。即使云账号全部不可用，这两步也能在本机用已有 feed 做完。

**这次不要做**按年分页、抽公共 CSS、停写 HTML、上 SQLite/对象存储。触发条件见第 12 节。

---

## 12. 万一一直出刊，会不会放不下？要不要数据库？

**结论：现在不要加数据库。按每周三期一直收，磁盘和 GitHub 都能撑很多年。先满的是首页把所有期数平铺出来，用静态分页就能解，仍然不用库。**

### 12.1 现在有多少、涨多快

- 已有 **10 期**（2026-05-25 → 2026-06-17），JSON + 配套 HTML 成对存放。
- 排期是周一/三/五，满勤约 **156 期/年**。
- 单期大约：期刊 JSON ~15–25 KB，渲染 HTML ~30–50 KB（CSS 内联在每个 HTML 里，所以 HTML 比正文肥）。工作区合计大约 **60 KB/期**。
- `data/feeds/` 只有最新一次抓取，**不会**随期数线性膨胀。
- `data/state-feed.json` 已按 14 天淘汰 `seenVideos` / `seenArticles`，去重状态有上限。
- 头像、封面是固定资产，不随出刊增长。

粗算（只计期刊 JSON+HTML，不含 git 历史放大）：

| 时间 | 期数 | 工作区大约 |
|---|---|---|
| 现在 | 10 | ~0.6 MB |
| 1 年满勤 | ~166 | ~10 MB |
| 5 年 | ~790 | ~50 MB |
| 10 年 | ~1570 | ~95 MB |
| 极端 10001 期 | （按三期/周 ≈ 64 年） | ~600 MB 工作区；git 历史会更大 |

GitHub 建议仓库 < 1 GB、单文件 < 100 MB。5–10 年满勤仍然远低于「必须迁库」的线。Vercel / GitHub Pages 托管这种体量的静态文件没有问题。

即使真收到 10001 期：麻烦的是 **clone 变慢** 和 **首页列表有一万行**，不是「JSON 塞不进 Git」。那时候的解法仍是「按年拆目录 + 首页只列最近 N 期」，不是上 Convex。

### 12.2 什么会先坏（按时间排序）

1. **首页 Archive 一页铺完**（最先，产品问题）。`update-index-archive.js` 每次把 `data/issues/*` 全部写进 `index.html`。几十期还像杂志目录；一两百期开始像长清单；上千期首页本身会到数百 KB。这和数据库无关。
2. **历史 feed 被覆盖**（已经在发生）。`data/feeds/feed-*.json` 每次抓取重写，旧期无法再和「当天原始 feed」对齐。所以 eval 必须靠期刊自己记下的 `meta.sourceUrls`，而不是指望 feed 档案。
3. **每期 HTML 重复内联一份 CSS**（浪费，但不致命）。一年多几 MB。抽公共 CSS 能瘦身，但改渲染、缓存和旧链接，不值得为了容量现在做。
4. **Git 历史变肥**（几年后的软问题）。每次 digest commit 都加 JSON+HTML。工作区 50 MB 时，历史可能是两三倍。`git clone` 变慢再考虑：停止把 HTML 当真相源（只提交 JSON，部署时再渲染），或按年打 archive bundle。
5. **磁盘 / 托管配额**（很晚）。见上表。

CI 每次读完全部期刊 JSON 重建首页：1000 个小文件对 Node 仍是秒级，不是瓶颈。

### 12.3 什么时候才需要「额外数据库」

只有产品变了才需要，例如：

- 跨期全文检索、个性化、评论、登录、多用户
- 高频写入（不是一周三次的 append-only）
- 要和 SignalDesk 一样做向量召回

那是另一条产品，会和第一项简历故事撞车，也必然碰到你刚炸过的托管后端账单。**收集电子杂志 + 静态阅读，用文件就对了。**

备选但本规划否决：

| 方案 | 为何现在不做 |
|---|---|
| Convex / Supabase / Neon | 账单和故障面；本项目没有查询需求 |
| 仓库里放 SQLite | 二进制难 merge，CI 冲突比 JSON 更烦 |
| S3 / R2 对象存储 | 为了几十 MB 引入密钥和失效链接 |
| Git LFS | 文件都是小文本，LFS 帮不上 |

### 12.4 容量触发（到了再做，不提前做）

| 触发 | 做法 | 还要不要数据库 |
|---|---|---|
| 首页超过 **24 期** 仍好读 → 先忍 | 什么都不做 | 否 |
| 首页超过 **~80 期**（约半年满勤）或你觉得列表太长 | 首页只列最近 12–24 期；更早的按年生成 `archive/2026.html`，数据来自 `data/archive-index.json` | 否 |
| 工作区期刊文件超过 **~80 MB** 或 clone 明显慢 | 旧年 JSON/HTML 挪到 `data/issues/archive/YYYY/`（或独立 archive 分支）；首页只保留近年 | 否 |
| 真要做跨期搜索 | 另开项目，且应复用 SignalDesk 的检索栈，而不是给 Digest 再接一个库 | 那时才谈 |

Stage 1 只预埋 `data/archive-index.json` + `meta.sourceUrls`。**不在这次做按年分页。**

---

## 13. 还想过、决定不和这次绑在一起的事

动手前过了一遍，避免「顺便」把范围撑爆：

| 想法 | 决定 |
|---|---|
| 为每期快照完整 feed | 不做。播客 notes 很大；`meta.sourceUrls` 足够做引用校验 |
| 把 CSS 从每期 HTML 抽出来 | 不做。省的是每年几 MB，却要改渲染和旧期页面 |
| 只提交 JSON、部署时再渲染 HTML | 以后 clone 变慢再考虑。现在双写换来的是「每期页面可离线打开」 |
| 关掉 Vercel 或 GitHub Pages 其中一个 | 和容量无关，单独决定 |
| 清掉未跟踪的 `UI2.png` / `UI3.png` | 仓库卫生，不是本升级 |
| 多领域分版（金融/政策/生物） | `PROGRESS.md` 旧 backlog，会让源和 prompt 变复杂，简历不加分 |
| 给旧期补 `meta` | 不回溯。eval 把它们标成 `legacy` |
| 用 SQLite「以后好查」 | 现在没有查询；加了只多一个会坏的部件 |

和这次升级**一起做**的，只保留真正挡路或几乎零成本的：

1. `meta` 账本 + 截断（省钱、有数字）
2. `meta.sourceUrls`（feed 会被覆盖，不记就无法回归）
3. `data/archive-index.json`（给以后静态分页预留，现在几乎不花钱）
4. 规则短名单 / schema 修复 / eval / 本机 Ollama / CI 降级（原计划）
