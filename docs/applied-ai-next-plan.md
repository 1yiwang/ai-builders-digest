# Applied AI Engineer — 下一轮升级

> 日期：2026-08-17  
> 状态：README ✅、faithfulness eval ✅、gold 短名单 ✅、72h 全窗口 ✅；源健康账本未做  
> 约束：不接数据库、不上向量库、不微调、不加 multi-agent。SignalDesk 已经覆盖检索；这边只加深 **生成系统**。

---

## 面试官实际在听什么

Applied AI Engineer 不是「会调 API」。他们听的是：

1. 进模型前你怎么减噪、控成本  
2. 模型胡说时你怎么测出来、拦住  
3. 线上挂了怎么降级，数字能不能讲出来  

本项目已经有一半故事：规则短名单、token 账本、schema 校验 + 修 1 次、CI 失败仍绿、72h 日期闸门。缺的是 **生成质量的硬证据** 和 **能给陌生人看的 README**。

不要做的（和 SignalDesk 撞车，或看起来像玩具）：向量库、agent 编排、换 UI、堆 20 个信息源。

---

## 现在的管线（已上线）

```
RSS / Nitter / Atom
    → generate-feed（72h 全窗口；只跳过上一期已用过的 URL）
    → prepare-feed（密度抽取 + 打分 + 12 条短名单）
    → DeepSeek 一次写成 JSON
    → schema 校验，失败修 1 次
    → 渲染 HTML + Git 发布
```

本期可讲的数字（2026-08-17 重出）：进模约 741 tokens（原始 41k 字符砍掉 93%），7 张卡片，估成本 $0.0034。

Eval 现在覆盖 schema、faithfulness（警告）、以及冻结短名单 gold。还缺的是源健康账本和卡片上的 `publishedAt`。

---

## 建议做的（按面试回报）

### P0 — README 把生成系统讲清楚 ✅

仓库根目录 [`README.md`](../README.md)（2026-08-17）：问题 → 管线 → 硬约束 → 2026-08-17 成本数字 → 明确不做向量库。

### P0 — Faithfulness eval ✅

`scripts/lib/faithfulness.js`，由 `npm run eval` 调用。对照当前 `data/feeds` 原文：

- 卡片 `en.rewrite` 里的数字 / 百分比是否出现在对应 `sourceUrl` 的文本中  
- `en.original` 是否能在源文本中找到（`[Paraphrase]` 标记的不算引语）  
- 源不在磁盘上的卡片跳过（旧刊 feed 已被覆盖）  
- **只警告，不挡出刊**；legacy 刊不跑

2026-08-17 实测：15 张有源文本的卡片，0 number miss，0 quote miss。合成用例能抓住「99.9%」这种编造数字。

### P1 — 冻结短名单回归集 ✅

`data/eval/gold/` + `scripts/eval-shortlist.js`，由 `npm run eval` 调用。重放 `prepareFeedForModel`，不断模型：

- `2026-08-17.json`：冻结当天 feed，断言短名单 URL 集合
- `stale-blog.json`：>72h 博客必须丢掉
- `source-cap.json`：同源 ≤2
- 另测 `loadPublishedUrls`：当天刊 URL 可重跑，上一期刊 URL 排除

改 `prepare-feed.js` 打分或截断若让短名单漂移，gold 会红。

### P1 — 采集窗口 = 最近 72h，去重只防跨期 ✅

`seenArticles` / `seenVideos` 不再挡住窗口内条目。`scripts/lib/published-urls.js` 从 `data/issues/` 收集 `publishDate < today` 的卡片 URL；同一天重跑仍写出完整 72h feed，周三才丢掉周一已用过的 URL。

### P1 — 源健康账本

每次 `generate-feed` 追加一行到 `data/eval/source-health.jsonl`：每源成功/失败、72h 条数、Nitter 实例。周报一眼能说「X 成功率 30%，博客 RSS 90%」。这解释了为什么加 Decoder / TechCrunch / Latent Space / Interconnects，而不是再加 10 个 X 账号。

### P2 — 卡片带 `publishedAt` + 源摘录

生成 JSON 时把短名单里的日期和 1–2 句原文写进 card。eval 不用再反查 feed；渲染页可显示「8/16」。Faithfulness 也更好做。

### P2 — prompt 指纹写进 `meta`

`meta.promptSha256` + `meta.prepareVersion`。改 `config/prompt.md` 或 `prepare-feed.js` 能在账本里对上。面试官问「你怎么做实验」时有日志。

---

## 明确不做

| 想法 | 为什么不做 |
|---|---|
| 每条源单独调 LLM | 12 条短名单一次调用更便宜，也保留跨源选题 |
| The Verge 等消费新闻 | 72h 内 7+ 条会挤掉 builder 源 |
| 再加一批 X 账号 | 瓶颈是 Nitter，不是名单长度 |
| Ollama / 微调 / agent | 已从 CI 拿掉；和「能周更的生成系统」无关 |
| 数据库 | Git JSON 已够；检索故事留给 SignalDesk |

---

## 落地顺序（约 1 周，穿插投简历）

1. README ✅  
2. Faithfulness eval ✅  
3. 72h 窗口语义 ✅  
4. Gold 短名单回归 ✅  
5. 源健康日志 / card 日期 / prompt hash — 还没做  

做完 1–4，简历上 Digest 可以讲「带 groundedness 检查和短名单回归的低成本生成管线」。
