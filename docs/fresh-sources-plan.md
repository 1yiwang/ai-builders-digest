# AI Builders Digest — 新鲜源规划（X / YouTube）

> 日期：2026-08-16  
> 状态：Stage A–C 已落地并本机验收（2026-08-16 feed）  
> 触发：2026-08-16 刊读起来像几个月前的旧闻  
> 约束：不接数据库；不新开付费账号；能复用现有抓取就复用；CI 仍走 Git JSON。

---

## 1. 先回答：是不是 X / YouTube 没抓到新东西？

**不完全是。播客和部分博客其实是新的；杂志看起来旧，主要是「无日期的旧博文」挤掉了新内容。**

2026-08-16 当天 feed 实测：

| 通道 | 抓到了什么 | 新鲜度 |
|---|---|---|
| 播客 | MLST 2026-08-14；Cognitive Revolution 2026-08-16 | 新 |
| 博客 RSS | Hugging Face *State of Open Models: Summer 2026*（2026-08-14） | 新 |
| 博客 scrape | Anthropic Engineering / Claude Blog 各 2–3 篇，`publishedAt` 为空或是 4–6 月 | **旧** |
| X | 仅 2/9 账号有推（Peter Yang、Madhu Guru，8-15）；模式是 Nitter RSS | 新但覆盖面窄 |
| YouTube | **不是独立源**，只给播客对标题找 `watch?v=` | 没有「某频道最新视频」 |

当天刊 6 张卡里，4 张是 Anthropic / Claude 旧文（含 April 23 postmortem、May 19 Managed Agents、Jun 18 artifacts），1 张当天播客，1 张昨天推文。Hugging Face 8-14 的新文进了 feed，没进刊。

所以要分两层做：

1. **先堵住旧文回流**（否则加再多 X / YouTube 也会被长博文压掉）。
2. **再把 X 和油管做成「指定账号的最新条目」**。

---

## 2. 为什么旧文会反复出现

三处叠在一起：

1. **Scrape 没有日期，72 小时窗口失效。**  
   `parseAnthropicEngineeringIndex` / `parseClaudeBlogIndex` 经常只能扫到 slug，`publishedAt: null`。  
   过滤写成 `if (article.publishedAt && date < cutoff) continue` —— 没日期就放行。

2. **`seenArticles` 14 天淘汰。**  
   `state-feed.json` 过两周就把 URL 忘掉。同一篇 April postmortem 会再当「新文」进 feed。

3. **规则短名单偏爱长文 + 公司名。**  
   Anthropic 工程博文几千字、满篇 Claude / GPU，分很高；短推文很难进 top 12。模型再从短名单里挑，旧长文继续赢。

X 自己也有两个缺口：

- 本机 / 这次跑没用 `X_BEARER_TOKEN`，走 Nitter。官方实例大多已死，9 个账号只活了 2 个。
- X lookback 是 **24 小时**，刊期是周一/三/五。周一跑会丢掉周五下午到周日的推。

YouTube 的缺口更简单：**`config/sources.json` 没有 `youtube` 数组。**  
`generate-feed.js` 里已经有 `getYouTubeFeedUrl` + `parseYouTubeFeed`，但只用来给播客对 URL，而且 **不解析 `<published>`**，没法按时间窗过滤。

---

## 3. 目标（这次要什么、不要什么）

要：

- 指定 **5–8 个 X 账号**、**5–8 个油管频道**，每次出刊只收 lookback 内的最新原创内容。
- 旧博文即使 scrape 不到日期，也不能再进短名单。
- 继续零数据库、零新 npm 依赖、CI 不装浏览器。

不要：

- YouTube Data API（要 key、配额、新 secret）。
- 再开一家抓取 SaaS / 托管库。
- 全站搜索、评论、个性化。
- 把 SignalDesk 的向量检索抄过来。
- 为了「更全」把源扩到 30 个账号（短名单会被噪声淹没）。

---

## 4. 油管：可以，而且几乎免费

YouTube 对每个频道公开 Atom 源，**不需要 API key**：

```
https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxx
https://www.youtube.com/feeds/videos.xml?playlist_id=PLxxxx
```

`@handle` 频道要先打开频道页拿 `channelId`（现有 `getYouTubeFeedUrl` 已经做了）。解析后每条有：

- `yt:videoId`
- `title`
- `published`（ISO 时间）
- `media:description`（短简介，够写卡）

建议新增 `data/feeds/feed-youtube.json`，形状跟播客类似：

```json
{
  "generatedAt": "...",
  "lookbackHours": 72,
  "videos": [
    {
      "source": "youtube",
      "name": "Andrej Karpathy",
      "handle": "@karpathy",
      "title": "...",
      "url": "https://www.youtube.com/watch?v=...",
      "publishedAt": "2026-08-14T18:00:00.000Z",
      "description": "..."
    }
  ]
}
```

`prepare-feed.js` 把 `videos` 当成第四类 candidate（和 tweet / podcast / blog 并列），规则分：有数字/产品名 +2，频道本身 +1。短名单「同一 `name` 最多 2 条」继续生效。

去重：`state.seenVideos[videoId]`，和播客共用同一本账，14 天淘汰即可（视频 ID 不会像无日期博文那样复活成「新」）。

**不接 YouTube Data API。** Atom 对「某几个频道的最新上传」足够；评论、播放量、Shorts 细分类都不是本刊需要的。

---

## 5. X：能收最新，但不能继续只赌 Nitter

现有双路径保持：

| 路径 | 何时用 | 新鲜度 | 成本 |
|---|---|---|---|
| X API v2（已写好） | 有 `X_BEARER_TOKEN` | 最好 | 若 GitHub Secret 已有，不再新开账单 |
| Nitter RSS | 无 token 时的免费兜底 | 2026 年实例大多挂 | 免费但不稳 |
| RSSHub 公共实例（新，可选） | Nitter 全挂时再试 1–2 个 | 中等 | 免费，实例同样会挂 |

落地顺序：

1. **Lookback 24h → 72h**，和播客/博客、MWF 排期对齐。周一才能看到周末的判断。
2. **本机和 CI 都确认 `X_BEARER_TOKEN`。** workflow 已经在传这个 secret。若 secret 空着，本地这次就是 Nitter，9 账号只活 2 个。有 token 则走现成 `fetchAPITweets`，`exclude=retweets,replies`，`max_results=10`。
3. **Nitter 实例表更新**（现表 `nitter.net` / `nitter.1d4.us` / `nitter.catsarch.com` 多半已死）。只当 API 不可用时的兜底，不作为主路径。
4. **账号名单收紧 + 换高信号。** 现在 9 个里有些发帖少或偏产品碎念（`zarazhangrui`、`realmadhuguru`）。宁可 6 个常发言的 builder，不要 15 个安静账号。

不建议：syndication 游客 token、非官方 scraper、付费 X 爬虫。ToS 灰、脆、简历上不好讲。

---

## 6. 建议关注名单（可改，先少后加）

写进 `config/sources.json`，改名单不必改代码。

### 6.1 YouTube（新数组 `youtube`）

| 频道 | 为什么 |
|---|---|
| [Andrej Karpathy](https://www.youtube.com/@karpathy) | 发布少但权重极高 |
| [Y Combinator](https://www.youtube.com/@ycombinator) | 访谈 / Startup School，常有 AI 公司 |
| [Two Minute Papers](https://www.youtube.com/@TwoMinutePapers) | 论文速读，节奏稳 |
| [Dwarkesh Patel](https://www.youtube.com/@DwarkeshPatel) | 长访谈；现有 Dwarkesh RSS 经常空 |
| [Latent Space](https://www.youtube.com/@LatentSpacePod) | 已有播客源，油管可补「只有视频、RSS 滞后」的期 |

先这 5 个。AI Explained / Lex / MLST 频道有对应播客就先不重复，避免同一期双卡。

每个条目建议写成：

```json
{ "name": "Andrej Karpathy", "url": "https://www.youtube.com/@karpathy" }
```

解析时把 `@handle` 解析出的 `channelId` 缓存在 `state-feed.json` 的 `youtubeChannelIds`，避免每次打频道首页。

### 6.2 X（改现有 `x` 数组）

保留并确认还能抓到的：

- `karpathy`（建议**新增**，比多数现有账号信号强）
- `elonmusk`（已有，但 Nitter 经常空；有 API 才稳）
- `rauchg`、`levie`、`petergyang`（已有，产品/投资判断）

建议新增（仍控制总数 ≤ 8）：

- `sama`
- `swyx`（Latent Space）
- `AndrewYNg` 或 `_akhaliq`（二选一，避免信息流变聚合站）

建议移出或降频：发帖少、和刊定位重复的个人号。最终名单你拍板，规划不锁死。

---

## 7. 必须先做的「旧文闸门」（否则新源没用）

改 `scripts/generate-feed.js` + `scripts/lib/prepare-feed.js`，不花钱：

1. **抽正文后再判日期。** scrape 索引没日期时，用文章页的 `datePublished` / `__NEXT_DATA__`。仍无日期 → **丢弃**，不要再放行。
2. **日期字符串要解析成 ISO。** Claude Blog 现在会留下 `"Jun 18, 2026"` 这种非 ISO；`new Date(...)` 能碰运气，短名单/eval 对不齐。统一 `toISOString()`，解析失败当无日期丢弃。
3. **短名单对博客加硬窗。** `publishedAt` 早于 lookback（默认 72h，博客可放宽到 7 天）的条目直接 drop。Anthropic 长文不再靠「公司名 +2」复活。
4. **X lookback = 72h。** 与 MWF 对齐。
5. **`seenArticles` 对「已确认过期」的 URL 不要 14 天复活。** 最简单：过期文章也写入 seen，或单独记 `expiredArticles` 90 天。否则闸门 1 失效时旧文会再进来。

这 5 条单独做完，下一期就会明显新一截，即使还没加油管。

---

## 8. 文件改动地图

新建：

| 文件 | 职责 |
|---|---|
| `docs/fresh-sources-plan.md` | 本文件 |
| `data/feeds/feed-youtube.json` | 油管最新视频（Git 可提交，跟现有 feed 一样只留最近一次） |

修改：

| 文件 | 改什么 |
|---|---|
| `config/sources.json` | 加 `youtube[]`；收紧/替换 `x[]` |
| `scripts/generate-feed.js` | 日期闸门；YouTube 独立抓取；X lookback 72h；缓存 channelId |
| `scripts/lib/prepare-feed.js` | flatten `videos`；博客过期 drop |
| `scripts/generate-magazine-json.js` | 读 `feed-youtube.json` 并入 `feedData` |
| `config/prompt.md` | 允许油管卡；第一颗 bullet 点名频道 + 视频主题；不要发明未在短名单的 `watch?v=` |
| `.github/workflows/daily-digest.yml` | 不用新 secret。若要用稳 X，确认已有 `X_BEARER_TOKEN` |

渲染脚本不用改：卡还是 `sourceUrl` + `authorKey`。油管卡 `authorKey` 建议 `youtube:@karpathy`。

---

## 9. 分阶段

每阶段可单独合并。Stage A 就能改善「几个月前」的观感。

### Stage A — 日期闸门 + X lookback（约 1–2 小时） ✅

- scrape / RSS 无日期或早于窗口 → 丢弃
- X / 博客 / 播客 lookback 统一 72h（博客需要的话单独 7 天）
- 本机 `npm run feed` 后目测 `feed-blogs.json` 不再出现 April/May 文

验收：`feed-blogs.json` 里每条都有 ISO `publishedAt`，且都在窗口内。

### Stage B — 油管独立源（约半天） ✅

- `sources.json` 加 5 个频道
- `parseYouTubeFeed` 补 `published` + description
- 写出 `feed-youtube.json`
- prepare / generate 吃进去
- prompt 加一条油管规则

验收：`node scripts/generate-feed.js` 能打出带日期的视频；`--prepare-only` 短名单里能看到 `kind: "youtube"`。不必为了验收强行出一期付费刊。

### Stage C — X 名单 + API 通路确认（约 1 小时 + 你这边看 Secret） ✅ 名单已改；API 取决于本机/CI 是否有 `X_BEARER_TOKEN`

- 改 `x[]`（你确认最终 handle）
- 本地若有 token：`X_BEARER_TOKEN=... npm run feed -- --x-only`，看是不是 >2 个账号
- GitHub → Settings → Secrets 确认 `X_BEARER_TOKEN` 在；没有就继续 Nitter，但要接受覆盖面不稳
- 不新开 X 付费档，除非你已经有 Basic

验收：有 token 时 `feed-x.json` 的 `_mode` 为 `X API v2`，builder 数明显多于 2。

### Stage D — 出一期带新源的刊（可选）

- `npm run full` 或 Actions 手动跑
- eval 必须过；`meta.sourceUrls` 里允许 youtube / x.com
- 简历可写：规则预筛 + 多源（X / YT Atom / RSS）+ 硬日期窗，而不是「我们接了油管 API」

---

## 10. 和上一份升级规划的边界

`docs/llm-pipeline-upgrade-plan.md` 管的是 **进模以后**（截断、短名单、校验、账本）。  
本文件管的是 **进模以前的源新不新**。

两边都继续：Git JSON、不接 Convex、DeepSeek 写稿、CI 失败跳过本期。

短名单规则要跟着改一条：过期博客分再高也不进 12 席。否则 Stage A 白做。

---

## 11. 完成定义

最少同时满足：

1. 无日期 / 过期 scrape 不再进入 `feed-blogs.json`。
2. 油管 5 个指定频道能出带 `publishedAt` 的最新视频 JSON。
3. X lookback 覆盖一个刊期间隔（72h）；有 token 时走 API。
4. 仍无新数据库、无 YouTube Data API、无新 npm 包。

做到这里，「指定几个知名账号的最新信息」就成立。再加频道是改 JSON，不是改架构。
