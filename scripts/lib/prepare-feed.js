// Truncate + token budget + optional rule shortlist. No model calls, no extra deps.

const DEFAULTS = {
  blogChars: 600,
  podcastChars: 800,
  budgetTokens: 12000,
  maxPodcasts: 8,
  maxBlogs: 8,
  maxTweets: 20,
  shortlistLimit: 12,
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

function tweetUrl(handle, id) {
  const h = String(handle || '').replace(/^@/, '');
  if (!h || !id) return '';
  return `https://x.com/${h}/status/${id}`;
}

function isJunkTweet(text) {
  const t = String(text || '').trim();
  return /^RT\s/i.test(t) || /^RT by @/i.test(t) || /^R to @/i.test(t);
}

function scoreText(text) {
  let score = 0;
  const t = String(text || '');
  if (/\d/.test(t) || /[$€%]/.test(t) || /20\d{2}/.test(t)) score += 2;
  if (NAME_HINTS.test(t)) score += 2;
  return score;
}

function flattenCandidates(feedData) {
  const items = [];

  for (const builder of feedData.x || []) {
    for (const tweet of builder.tweets || []) {
      if (isJunkTweet(tweet.text)) continue;
      const text = tweet.text || '';
      let score = scoreText(text);
      if (text.length < 40 && !/\d/.test(text)) score -= 3;
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
      score: scoreText(`${episode.title || ''} ${description}`) + 1,
      name: episode.name,
      title: episode.title,
      url: episode.url,
      publishedAt: episode.publishedAt || '',
      description,
    });
  }

  for (const post of feedData.blogs || []) {
    if (!post.url) continue;
    const body = post.description || post.content || '';
    items.push({
      kind: 'blog',
      score: scoreText(`${post.title || ''} ${body}`) + 1,
      name: post.name,
      title: post.title,
      url: post.url,
      publishedAt: post.publishedAt || '',
      description: body,
    });
  }

  return items;
}

function truncateItem(item) {
  if (item.kind === 'podcast') {
    return { ...item, description: truncateText(item.description, DEFAULTS.podcastChars) };
  }
  if (item.kind === 'blog') {
    return { ...item, description: truncateText(item.description, DEFAULTS.blogChars) };
  }
  return item;
}

function rebuildFeed(items, generatedAt) {
  const xMap = new Map();
  const podcasts = [];
  const blogs = [];

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
    }
  }

  return {
    generatedAt: generatedAt || new Date().toISOString(),
    x: Array.from(xMap.values()),
    podcasts,
    blogs,
    stats: {
      xBuilders: xMap.size,
      totalTweets: Array.from(xMap.values()).reduce((sum, builder) => sum + builder.tweets.length, 0),
      podcastEpisodes: podcasts.length,
      blogPosts: blogs.length,
    },
  };
}

function applySourceCaps(items) {
  const tweets = items.filter((item) => item.kind === 'tweet').slice(0, DEFAULTS.maxTweets);
  const podcasts = items.filter((item) => item.kind === 'podcast').slice(0, DEFAULTS.maxPodcasts);
  const blogs = items.filter((item) => item.kind === 'blog').slice(0, DEFAULTS.maxBlogs);
  return [...podcasts, ...blogs, ...tweets];
}

function tokensFor(items, generatedAt) {
  return estimateTokens(JSON.stringify(rebuildFeed(items, generatedAt)));
}

function prepareFeedForModel(feedData, opts = {}) {
  const budgetTokens = opts.budgetTokens ?? DEFAULTS.budgetTokens;
  const applyShortlist = opts.applyShortlist !== false;
  const shortlistLimit = opts.shortlistLimit ?? DEFAULTS.shortlistLimit;
  const generatedAt = feedData.generatedAt || new Date().toISOString();

  const rawChars = JSON.stringify(feedData, null, 2).length;
  let items = flattenCandidates(feedData).map(truncateItem);
  const candidatesIn = items.length;

  if (tokensFor(items, generatedAt) > budgetTokens) {
    items = applySourceCaps(items);
  }

  if (tokensFor(items, generatedAt) > budgetTokens) {
    items = items.map((item) => {
      if (item.kind === 'podcast') return { ...item, description: truncateText(item.description, 400) };
      if (item.kind === 'blog') return { ...item, description: truncateText(item.description, 300) };
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
        const key = item.name || item.handle || item.kind;
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
      shortlistSize: items.length,
      dropped: candidatesIn - items.length,
    },
    shortlist: items,
  };
}

function shortlistUrls(shortlist) {
  return [...new Set((shortlist || []).map((item) => item.url).filter(Boolean))];
}

module.exports = {
  DEFAULTS,
  estimateTokens,
  truncateText,
  flattenCandidates,
  prepareFeedForModel,
  shortlistUrls,
};

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const repoRoot = path.resolve(__dirname, '..', '..');

  function load(rel) {
    const filePath = path.join(repoRoot, rel);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  const feedX = load('data/feeds/feed-x.json');
  const feedPodcasts = load('data/feeds/feed-podcasts.json');
  const feedBlogs = load('data/feeds/feed-blogs.json');
  const feedData = {
    generatedAt: new Date().toISOString(),
    x: feedX.x || [],
    podcasts: feedPodcasts.podcasts || [],
    blogs: feedBlogs.blogs || [],
    stats: {
      xBuilders: (feedX.x || []).length,
      totalTweets: (feedX.x || []).reduce((sum, builder) => sum + (builder.tweets || []).length, 0),
      podcastEpisodes: (feedPodcasts.podcasts || []).length,
      blogPosts: (feedBlogs.blogs || []).length,
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
