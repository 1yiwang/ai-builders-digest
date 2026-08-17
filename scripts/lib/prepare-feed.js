// Truncate + token budget + optional rule shortlist. No model calls, no extra deps.

const DEFAULTS = {
  blogChars: 600,
  podcastChars: 800,
  videoChars: 600,
  budgetTokens: 12000,
  maxPodcasts: 8,
  maxBlogs: 8,
  maxTweets: 20,
  maxVideos: 8,
  shortlistLimit: 12,
  blogMaxAgeHours: 72,
  defaultMaxAgeHours: 72,
};

const NAME_HINTS =
  /anthropic|openai|google|nvidia|gpu|launch|ipo|benchmark|claude|gpt|gemini|deepseek|cursor|agent|spacex|meta|apple|huggingface/i;

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function truncateText(text, maxChars) {
  const value = String(text || '');
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}…`;
}

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function scoreSentence(sentence) {
  return scoreSentenceDetailed(sentence).score;
}

function scoreSentenceDetailed(sentence) {
  const s = String(sentence || '');
  let score = 0;
  const reasons = [];
  const numbers = (s.match(/\d+(\.\d+)?\s?(%|x|B|M|K|ms|tokens?)?/gi) || []).length;
  const modelNames = (s.match(/\b(GPT|Claude|Gemini|Llama|Grok|Qwen|RLHF|RAG|SWE-bench|SOTA|MMLU|DeepSeek|Anthropic|OpenAI|NVIDIA)\b/gi) || []).length;
  if (numbers > 0) {
    score += numbers * 3;
    reasons.push(`number:${numbers}`);
  }
  if (modelNames > 0) {
    score += modelNames * 2;
    reasons.push(`model:${modelNames}`);
  }
  if (/\b(improv|outperform|achiev|launch|releas|announc|beat|surpass|reduc|increas|rais|ship|open.?sourc|fine-?tun)\w*/i.test(s)) {
    score += 1;
    reasons.push('change-signal');
  }
  return { score, reasons };
}

function extractEvidenceChunks(text, charBudget) {
  const value = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return { text: '', selectedSentences: [], scoreReasons: [] };
  if (value.length <= charBudget) {
    return { text: value, selectedSentences: [value], scoreReasons: ['within-budget'] };
  }

  const sentences = splitSentences(value);
  if (sentences.length === 0) {
    const fallback = truncateText(value, charBudget);
    return { text: fallback, selectedSentences: [fallback], scoreReasons: ['fallback-truncate'] };
  }

  const ranked = sentences.map((sentence, index) => {
    const detail = scoreSentenceDetailed(sentence);
    return {
      sentence,
      index,
      score: detail.score + (index === 0 ? 1 : 0),
      reasons: index === 0 ? ['lead-sentence', ...detail.reasons] : detail.reasons,
    };
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);

  const picked = [];
  let used = 0;
  for (const item of ranked) {
    if (item.score <= 0 && picked.some((row) => row.score > 0)) continue;
    const extra = used === 0 ? item.sentence.length : item.sentence.length + 1;
    if (used + extra > charBudget) continue;
    picked.push(item);
    used += extra;
    if (used >= charBudget * 0.9) break;
  }
  if (picked.length === 0) {
    const fallback = truncateText(value, charBudget);
    return { text: fallback, selectedSentences: [fallback], scoreReasons: ['fallback-truncate'] };
  }
  picked.sort((a, b) => a.index - b.index);
  return {
    text: picked.map((item) => item.sentence).join(' '),
    selectedSentences: picked.map((item) => item.sentence),
    scoreReasons: [...new Set(picked.flatMap((item) => item.reasons))],
  };
}

function extractDenseSentences(text, charBudget) {
  return extractEvidenceChunks(text, charBudget).text;
}

function tweetUrl(handle, id) {
  const h = String(handle || '').replace(/^@/, '');
  if (!h || !id) return '';
  return `https://x.com/${h}/status/${id}`;
}

function isJunkTweet(text) {
  const t = String(text || '').trim();
  return /^RT\s/i.test(t) || /^RT by @/i.test(t) || /^R to @/i.test(t);
}

function scoreText(text, kind) {
  const t = String(text || '');
  let score = { podcast: 1.5, youtube: 1.2, blog: 1.0, tweet: 0.8 }[kind] || 1;
  if (/\d/.test(t) || /[$€%]/.test(t) || /20\d{2}/.test(t)) score += 2;
  if (NAME_HINTS.test(t)) score += 2;
  score += (t.match(/\d+(\.\d+)?\s?%/g) || []).length * 0.5;
  if (kind === 'tweet' && t.length < 80) score -= 1;
  if (kind === 'tweet' && t.length < 40 && !/\d/.test(t)) score -= 3;
  if (/^(Just|Finally|Super|Wow|Amazing|Interesting)\b/i.test(t)) score -= 0.5;
  return score;
}

function parseItemDate(item) {
  const raw = item.publishedAt || item.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nowMs(value) {
  if (value == null) return Date.now();
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

function isFreshEnough(item, now = Date.now()) {
  const date = parseItemDate(item);
  const clock = nowMs(now);
  const maxHours = item.kind === 'blog' ? DEFAULTS.blogMaxAgeHours : DEFAULTS.defaultMaxAgeHours;
  if (item.kind === 'blog') {
    if (!date) return false;
    return clock - date.getTime() <= maxHours * 3600 * 1000;
  }
  if (!date) return true;
  return clock - date.getTime() <= maxHours * 3600 * 1000;
}

function flattenCandidates(feedData, now = Date.now()) {
  const items = [];

  for (const builder of feedData.x || []) {
    for (const tweet of builder.tweets || []) {
      if (isJunkTweet(tweet.text)) continue;
      const text = tweet.text || '';
      const score = scoreText(text, 'tweet');
      const url = tweetUrl(builder.handle, tweet.id);
      if (!url) continue;
      items.push({
        kind: 'tweet',
        score,
        handle: builder.handle,
        name: builder.name,
        id: tweet.id,
        text,
        createdAt: tweet.createdAt || '',
        url,
      });
    }
  }

  for (const episode of feedData.podcasts || []) {
    if (!episode.url) continue;
    const description = episode.description || '';
    items.push({
      kind: 'podcast',
      score: scoreText(`${episode.title || ''} ${description}`, 'podcast'),
      name: episode.name,
      title: episode.title,
      url: episode.url,
      publishedAt: episode.publishedAt || '',
      description,
    });
  }

  for (const post of feedData.blogs || []) {
    if (!post.url) continue;
    const body = post.content || post.description || '';
    items.push({
      kind: 'blog',
      score: scoreText(`${post.title || ''} ${body}`, 'blog'),
      name: post.name,
      title: post.title,
      url: post.url,
      publishedAt: post.publishedAt || '',
      description: body,
    });
  }

  for (const video of feedData.videos || []) {
    if (!video.url) continue;
    const description = video.description || '';
    items.push({
      kind: 'youtube',
      score: scoreText(`${video.title || ''} ${description}`, 'youtube'),
      name: video.name,
      handle: video.handle,
      title: video.title,
      url: video.url,
      publishedAt: video.publishedAt || '',
      description,
    });
  }

  return items.filter((item) => isFreshEnough(item, now));
}

function normalizeUrlKey(url) {
  try {
    const parsed = new URL(String(url || ''));
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$/i.test(key)) parsed.searchParams.delete(key);
    }
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`.toLowerCase();
  } catch {
    return String(url || '').trim().toLowerCase().replace(/\/+$/, '');
  }
}

function tokenSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
  );
}

function similarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.min(left.size, right.size);
}

function itemText(item) {
  return [item.title, item.text, item.description].filter(Boolean).join(' ');
}

function sourceKey(item) {
  return item.name || item.handle || item.kind;
}

function dedupeItems(items) {
  const kept = [];
  const dropped = [];
  const ranked = items
    .slice()
    .sort((a, b) => b.score - a.score || String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt)));

  for (const item of ranked) {
    const urlKey = normalizeUrlKey(item.url);
    const title = item.title || item.text || '';
    const text = itemText(item);
    const duplicate = kept.find((row) => (
      normalizeUrlKey(row.url) === urlKey ||
      similarity(row.title || row.text || '', title) >= 0.9 ||
      similarity(itemText(row), text) >= 0.92
    ));
    if (duplicate) {
      dropped.push({
        url: item.url,
        title: title.slice(0, 120),
        duplicateOf: duplicate.url,
        reason: 'url/title/text-overlap',
      });
    } else {
      kept.push(item);
    }
  }

  return { items: kept, dropped };
}

function truncateItem(item, charBudget) {
  if (item.kind === 'podcast') {
    const maxChars = charBudget || DEFAULTS.podcastChars;
    const evidence = extractEvidenceChunks(item.description, maxChars);
    return { ...item, description: evidence.text, evidence };
  }
  if (item.kind === 'blog' || item.kind === 'youtube') {
    const maxChars = charBudget || (item.kind === 'youtube' ? DEFAULTS.videoChars : DEFAULTS.blogChars);
    const evidence = extractEvidenceChunks(item.description, maxChars);
    return { ...item, description: evidence.text, evidence };
  }
  return {
    ...item,
    evidence: {
      text: item.text || '',
      selectedSentences: item.text ? [item.text] : [],
      scoreReasons: item.text ? ['tweet-text'] : [],
    },
  };
}

function rebuildFeed(items, generatedAt) {
  const xMap = new Map();
  const podcasts = [];
  const blogs = [];
  const videos = [];

  for (const item of items) {
    if (item.kind === 'tweet') {
      if (!xMap.has(item.handle)) {
        xMap.set(item.handle, { handle: item.handle, name: item.name, tweets: [] });
      }
      xMap.get(item.handle).tweets.push({
        id: item.id,
        text: item.text,
        createdAt: item.createdAt,
        url: item.url,
      });
    } else if (item.kind === 'podcast') {
      podcasts.push({
        source: 'podcast',
        name: item.name,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        description: item.description,
      });
    } else if (item.kind === 'blog') {
      blogs.push({
        source: 'blog',
        name: item.name,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        description: item.description,
      });
    } else if (item.kind === 'youtube') {
      videos.push({
        source: 'youtube',
        name: item.name,
        handle: item.handle,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        description: item.description,
      });
    }
  }

  return {
    generatedAt: generatedAt || new Date().toISOString(),
    x: Array.from(xMap.values()),
    podcasts,
    blogs,
    videos,
    stats: {
      xBuilders: xMap.size,
      totalTweets: Array.from(xMap.values()).reduce((sum, builder) => sum + builder.tweets.length, 0),
      podcastEpisodes: podcasts.length,
      blogPosts: blogs.length,
      youtubeVideos: videos.length,
    },
  };
}

function applySourceCaps(items) {
  const tweets = items.filter((item) => item.kind === 'tweet').slice(0, DEFAULTS.maxTweets);
  const podcasts = items.filter((item) => item.kind === 'podcast').slice(0, DEFAULTS.maxPodcasts);
  const blogs = items.filter((item) => item.kind === 'blog').slice(0, DEFAULTS.maxBlogs);
  const videos = items.filter((item) => item.kind === 'youtube').slice(0, DEFAULTS.maxVideos);
  return [...podcasts, ...blogs, ...videos, ...tweets];
}

function tokensFor(items, generatedAt) {
  return estimateTokens(JSON.stringify(rebuildFeed(items, generatedAt)));
}

function prepareFeedForModel(feedData, opts = {}) {
  const budgetTokens = opts.budgetTokens ?? DEFAULTS.budgetTokens;
  const applyShortlist = opts.applyShortlist !== false;
  const shortlistLimit = opts.shortlistLimit ?? DEFAULTS.shortlistLimit;
  const generatedAt = feedData.generatedAt || new Date().toISOString();
  const now = nowMs(opts.now ?? Date.now());

  const rawChars = JSON.stringify(feedData, null, 2).length;
  let items = flattenCandidates(feedData, now);
  const candidatesIn = items.length;
  const deduped = dedupeItems(items);
  items = deduped.items.map(truncateItem);

  if (tokensFor(items, generatedAt) > budgetTokens) {
    items = applySourceCaps(items);
  }

  if (tokensFor(items, generatedAt) > budgetTokens) {
    items = items.map((item) => {
      if (item.kind === 'podcast') return truncateItem(item, 400);
      if (item.kind === 'blog' || item.kind === 'youtube') return truncateItem(item, 300);
      return item;
    });
  }

  if (applyShortlist) {
    const counts = {};
    items = items
      .slice()
      .sort((a, b) => b.score - a.score || String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt)))
      .filter((item) => item.score > -10)
      .filter((item) => {
        const key = sourceKey(item);
        if ((counts[key] || 0) >= 2) return false;
        counts[key] = (counts[key] || 0) + 1;
        return true;
      })
      .slice(0, shortlistLimit);
  }

  const prepared = rebuildFeed(items, generatedAt);
  const preparedJson = JSON.stringify(prepared);

  return {
    prepared,
    preparedJson,
    stats: {
      rawChars,
      preparedChars: preparedJson.length,
      estimatedTokens: estimateTokens(preparedJson),
      budgetTokens,
      candidatesIn,
      duplicatesDropped: deduped.dropped.length,
      shortlistSize: items.length,
      dropped: candidatesIn - items.length,
    },
    shortlist: items,
    prepareReport: {
      generatedAt,
      stats: {
        rawChars,
        preparedChars: preparedJson.length,
        estimatedTokens: estimateTokens(preparedJson),
        budgetTokens,
        candidatesIn,
        duplicatesDropped: deduped.dropped.length,
        shortlistSize: items.length,
        dropped: candidatesIn - items.length,
      },
      duplicateDrops: deduped.dropped,
      selected: items.map((item) => ({
        kind: item.kind,
        source: sourceKey(item),
        title: item.title || item.text?.slice(0, 100) || '',
        url: item.url,
        score: item.score,
        evidence: item.evidence,
      })),
    },
  };
}

function shortlistUrls(shortlist) {
  return [...new Set((shortlist || []).map((item) => item.url).filter(Boolean))];
}

module.exports = {
  DEFAULTS,
  estimateTokens,
  truncateText,
  extractDenseSentences,
  extractEvidenceChunks,
  scoreText,
  flattenCandidates,
  isFreshEnough,
  prepareFeedForModel,
  shortlistUrls,
};

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const repoRoot = path.resolve(__dirname, '..', '..');

  function loadOptional(rel) {
    const filePath = path.join(repoRoot, rel);
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  const feedX = loadOptional('data/feeds/feed-x.json');
  const feedPodcasts = loadOptional('data/feeds/feed-podcasts.json');
  const feedBlogs = loadOptional('data/feeds/feed-blogs.json');
  const feedYoutube = loadOptional('data/feeds/feed-youtube.json');
  const feedData = {
    generatedAt: new Date().toISOString(),
    x: feedX.x || [],
    podcasts: feedPodcasts.podcasts || [],
    blogs: feedBlogs.blogs || [],
    videos: feedYoutube.videos || [],
    stats: {
      xBuilders: (feedX.x || []).length,
      totalTweets: (feedX.x || []).reduce((sum, builder) => sum + (builder.tweets || []).length, 0),
      podcastEpisodes: (feedPodcasts.podcasts || []).length,
      blogPosts: (feedBlogs.blogs || []).length,
      youtubeVideos: (feedYoutube.videos || []).length,
    },
  };

  const truncated = prepareFeedForModel(feedData, { applyShortlist: false });
  const shortlisted = prepareFeedForModel(feedData, { applyShortlist: true });

  const report = {
    input: feedData.stats,
    truncateOnly: truncated.stats,
    withShortlist: shortlisted.stats,
    shortlist: shortlisted.shortlist.map((item) => ({
      kind: item.kind,
      score: item.score,
      title: item.title || item.text?.slice(0, 80),
      url: item.url,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
}
