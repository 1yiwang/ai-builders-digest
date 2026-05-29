#!/usr/bin/env node
// ============================================================================
// AI Builders Digest — Local Feed Generator
// ============================================================================
// Fetches podcast RSS + YouTube URLs and blog content (free, no API keys).
// Outputs feed JSON files to data/feeds/ for use by generate-magazine-json.js.
//
// Usage:
//   node scripts/generate-feed.js
//   node scripts/generate-feed.js --x-only
//   node scripts/generate-feed.js --podcasts-only
//   node scripts/generate-feed.js --blogs-only
// ============================================================================

const fs = require('fs');
const path = require('path');

// -- Constants ---------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '..');
const FEEDS_DIR = path.join(REPO_ROOT, 'data', 'feeds');
const SOURCES_PATH = path.join(REPO_ROOT, 'config', 'sources.json');
const STATE_PATH = path.join(REPO_ROOT, 'data', 'state-feed.json');

const PODCAST_LOOKBACK_HOURS = 336; // 14 days
const BLOG_LOOKBACK_HOURS = 72;
const X_LOOKBACK_HOURS = 24;

const X_API_BASE = 'https://api.x.com/2';

const RSS_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// -- State Management --------------------------------------------------------
function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { seenVideos: {}, seenArticles: {}, xUserIds: {} };
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    if (!state.seenArticles) state.seenArticles = {};
    if (!state.xUserIds) state.xUserIds = {};
    return state;
  } catch {
    return { seenVideos: {}, seenArticles: {}, xUserIds: {} };
  }
}

function saveState(state) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const [id, ts] of Object.entries(state.seenVideos || {})) {
    if (ts < cutoff) delete state.seenVideos[id];
  }
  for (const [id, ts] of Object.entries(state.seenArticles || {})) {
    if (ts < cutoff) delete state.seenArticles[id];
  }
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// -- Sources -----------------------------------------------------------------
function loadSources() {
  return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf-8'));
}

// -- Podcast: RSS Parser -----------------------------------------------------
function parseRssFeed(xml) {
  const episodes = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    const guidMatch =
      block.match(/<guid[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/guid>/) ||
      block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
    const guid = guidMatch ? guidMatch[1].trim() : null;

    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const publishedAt = pubDateMatch ? new Date(pubDateMatch[1].trim()).toISOString() : null;

    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const link = linkMatch ? linkMatch[1].trim() : null;

    // Extract description/show notes (between CDATA tags)
    const descMatch =
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
      block.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? descMatch[1].trim() : '';

    if (guid) episodes.push({ title, guid, publishedAt, link, description });
  }
  return episodes;
}

// -- Podcast: YouTube Matching -----------------------------------------------
function normalizeTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getYouTubeFeedUrl(channelUrl) {
  if (!channelUrl || !channelUrl.includes('youtube.com')) return null;

  const playlistMatch = channelUrl.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (playlistMatch) return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistMatch[1]}`;

  const channelIdMatch = channelUrl.match(/\/channel\/(UC[A-Za-z0-9_-]+)/);
  if (channelIdMatch) return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;

  if (channelUrl.match(/\/@[A-Za-z0-9_.-]+/)) {
    try {
      const res = await fetch(channelUrl, {
        headers: { 'User-Agent': RSS_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const idMatch =
        html.match(/"channelId":"(UC[A-Za-z0-9_-]{20,})"/) ||
        html.match(/<meta\s+itemprop="(?:identifier|channelId)"\s+content="(UC[A-Za-z0-9_-]{20,})"/);
      if (idMatch) return `https://www.youtube.com/feeds/videos.xml?channel_id=${idMatch[1]}`;
    } catch { return null; }
  }
  return null;
}

function parseYouTubeFeed(xml) {
  const videos = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRegex.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const videoIdMatch = block.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
    if (titleMatch && videoIdMatch) {
      videos.push({ title: titleMatch[1].trim(), url: `https://www.youtube.com/watch?v=${videoIdMatch[1].trim()}` });
    }
  }
  return videos;
}

function parseYouTubePageData(html) {
  const videos = [];
  const m = html.match(/var\s+ytInitialData\s*=\s*({[\s\S]*?});\s*<\/script>/);
  if (!m) return videos;
  let data;
  try { data = JSON.parse(m[1]); } catch { return videos; }

  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const gridItems = tab?.tabRenderer?.content?.richGridRenderer?.contents || [];
    for (const it of gridItems) {
      const v = it?.richItemRenderer?.content?.videoRenderer;
      if (v?.videoId) {
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || '';
        if (title) videos.push({ title, url: `https://www.youtube.com/watch?v=${v.videoId}` });
      }
      if (videos.length > 0) return videos;
    }
    // Also check playlist renderer format
    const playlistItems = tab?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
      ?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents || [];
    for (const it of playlistItems) {
      const v = it?.playlistVideoRenderer;
      if (v?.videoId) {
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || '';
        if (title) videos.push({ title, url: `https://www.youtube.com/watch?v=${v.videoId}` });
      }
    }
  }
  return videos;
}

async function fetchYouTubeVideos(channelUrl) {
  const feedUrl = await getYouTubeFeedUrl(channelUrl);
  if (feedUrl) {
    try {
      const res = await fetch(feedUrl, { headers: { 'User-Agent': RSS_USER_AGENT }, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const videos = parseYouTubeFeed(await res.text());
        if (videos.length > 0) return videos;
      }
    } catch { /* fall through */ }
  }
  if (!channelUrl || !channelUrl.includes('youtube.com')) return [];
  const videosPageUrl = channelUrl.includes('/playlist?')
    ? channelUrl : channelUrl.replace(/\/$/, '') + '/videos';
  try {
    const res = await fetch(videosPageUrl, {
      headers: { 'User-Agent': RSS_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    return parseYouTubePageData(await res.text());
  } catch { return []; }
}

async function findYouTubeEpisodeUrl(channelUrl, episodeTitle) {
  const videos = await fetchYouTubeVideos(channelUrl);
  if (videos.length === 0) return null;
  const needle = normalizeTitle(episodeTitle);
  const needleTokens = new Set(needle.split(' ').filter(w => w.length > 2));
  if (needleTokens.size === 0) return null;

  let bestUrl = null, bestScore = 0;
  for (const v of videos) {
    const hay = normalizeTitle(v.title);
    if (hay && (hay.includes(needle) || needle.includes(hay))) return v.url;
    const hayTokens = new Set(hay.split(' ').filter(w => w.length > 2));
    let overlap = 0;
    for (const tok of needleTokens) if (hayTokens.has(tok)) overlap++;
    const score = overlap / needleTokens.size;
    if (score > bestScore) { bestScore = score; bestUrl = v.url; }
  }
  return bestScore >= 0.5 ? bestUrl : null;
}

// -- Podcast: Main Fetch -----------------------------------------------------
async function fetchPodcastContent(sources, state, errors) {
  const cutoff = new Date(Date.now() - PODCAST_LOOKBACK_HOURS * 60 * 60 * 1000);
  const results = [];

  for (const podcast of sources.podcasts || []) {
    if (!podcast.rssUrl) continue;
    console.error(`  RSS: ${podcast.name}...`);

    try {
      const rssRes = await fetch(podcast.rssUrl, {
        headers: { 'User-Agent': RSS_USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
        signal: AbortSignal.timeout(30000),
      });
      if (!rssRes.ok) { errors.push(`RSS ${podcast.name}: HTTP ${rssRes.status}`); continue; }

      const episodes = parseRssFeed(await rssRes.text());
      console.error(`    ${episodes.length} episodes in feed`);

      // Check 3 most recent, skip seen ones
      for (const ep of episodes.slice(0, 3)) {
        if (state.seenVideos[ep.guid]) continue;
        const epDate = ep.publishedAt ? new Date(ep.publishedAt) : null;
        if (epDate && epDate < cutoff) continue;

        console.error(`    New: "${ep.title}"`);
        state.seenVideos[ep.guid] = Date.now();

        // Try to match YouTube URL
        let youtubeUrl = null;
        if (podcast.url) {
          youtubeUrl = await findYouTubeEpisodeUrl(podcast.url, ep.title);
          if (youtubeUrl) console.error(`      YT match: ${youtubeUrl}`);
        }

        // Use RSS description as content — contains show notes, topics, links
        // Strip HTML tags from description for clean text
        const cleanDesc = ep.description
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        results.push({
          source: 'podcast',
          name: podcast.name,
          title: ep.title,
          guid: ep.guid,
          url: youtubeUrl || ep.link || podcast.url,
          publishedAt: ep.publishedAt,
          description: cleanDesc,
        });
        break; // One new episode per podcast per run
      }
    } catch (err) {
      errors.push(`Podcast ${podcast.name}: ${err.message}`);
    }
  }
  return results;
}

// -- Blog: Main Fetch --------------------------------------------------------
function parseAnthropicEngineeringIndex(html) {
  const articles = [];
  // Try Next.js __NEXT_DATA__
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const posts = data?.props?.pageProps?.posts || data?.props?.pageProps?.articles || [];
      for (const post of posts) {
        const slug = post.slug?.current || post.slug || '';
        articles.push({
          title: post.title || 'Untitled',
          url: `https://www.anthropic.com/engineering/${slug}`,
          publishedAt: post.publishedOn || post.publishedAt || post.date || null,
          description: post.summary || post.description || '',
        });
      }
      if (articles.length > 0) return articles;
    } catch { /* fall through */ }
  }

  const linkRegex = /href="\/engineering\/([a-z0-9-]+)"/gi;
  const seenSlugs = new Set();
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const slug = m[1];
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    articles.push({ title: '', url: `https://www.anthropic.com/engineering/${slug}`, publishedAt: null, description: '' });
  }
  return articles;
}

function parseClaudeBlogIndex(html) {
  const articles = [];
  const seenSlugs = new Set();
  const linkRegex = /href="\/blog\/([a-z0-9-]+)"/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const slug = m[1];
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    articles.push({ title: '', url: `https://claude.com/blog/${slug}`, publishedAt: null, description: '' });
  }
  return articles;
}

function extractAnthropicArticleContent(html) {
  let title = '', author = '', publishedAt = null, content = '';
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const post = data?.props?.pageProps?.post || data?.props?.pageProps?.article || data?.props?.pageProps;
      title = post?.title || '';
      author = post?.author?.name || post?.authors?.[0]?.name || '';
      publishedAt = post?.publishedOn || post?.publishedAt || post?.date || null;
      const body = post?.body || post?.content || [];
      if (Array.isArray(body)) {
        const textParts = [];
        for (const block of body) {
          if (block._type === 'block' && block.children) {
            const text = block.children.map(c => c.text || '').join('');
            if (text.trim()) textParts.push(text.trim());
          }
        }
        content = textParts.join('\n\n');
      }
      if (content) return { title, author, publishedAt, content };
    } catch { /* fall through */ }
  }

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) title = h1Match[1].replace(/<[^>]+>/g, '').trim();
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  content = (articleMatch ? articleMatch[1] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return { title, author, publishedAt, content };
}

function extractClaudeBlogArticleContent(html) {
  let title = '', author = '', publishedAt = null, content = '';
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const ld = JSON.parse(m[1]);
      if (ld['@type'] === 'BlogPosting' || ld['@type'] === 'Article') {
        title = ld.headline || ld.name || '';
        author = ld.author?.name || '';
        publishedAt = ld.datePublished || null;
        break;
      }
    } catch { /* skip */ }
  }

  const richTextMatch =
    html.match(/<div[^>]*class="[^"]*u-rich-text-blog[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
    html.match(/<div[^>]*class="[^"]*w-richtext[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (richTextMatch) {
    content = richTextMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  if (!content) {
    if (!title) { const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); if (h1Match) title = h1Match[1].replace(/<[^>]+>/g, '').trim(); }
    content = html
      .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '').replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '').replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  return { title, author, publishedAt, content };
}

async function fetchBlogContent(sources, state, errors) {
  const cutoff = new Date(Date.now() - BLOG_LOOKBACK_HOURS * 60 * 60 * 1000);
  const results = [];
  const MAX_ARTICLES_PER_BLOG = 3;

  for (const blog of sources.blogs || []) {
    console.error(`  Blog: ${blog.name}...`);
    let candidates = [];

    try {
      const indexRes = await fetch(blog.indexUrl, {
        headers: { 'User-Agent': 'FollowBuilders/1.0 (feed aggregator)' },
      });
      if (!indexRes.ok) { errors.push(`Blog ${blog.name}: HTTP ${indexRes.status}`); continue; }
      const indexHtml = await indexRes.text();

      if (blog.indexUrl.includes('anthropic.com')) candidates = parseAnthropicEngineeringIndex(indexHtml);
      else if (blog.indexUrl.includes('claude.com')) candidates = parseClaudeBlogIndex(indexHtml);

      const newArticles = [];
      for (const article of candidates.slice(0, MAX_ARTICLES_PER_BLOG)) {
        if (state.seenArticles[article.url]) continue;
        if (article.publishedAt && new Date(article.publishedAt) < cutoff) continue;
        newArticles.push(article);
        if (newArticles.length >= MAX_ARTICLES_PER_BLOG) break;
      }

      if (newArticles.length === 0) { console.error('    No new articles'); continue; }
      console.error(`    ${newArticles.length} new article(s)`);

      for (const article of newArticles) {
        try {
          const articleRes = await fetch(article.url, {
            headers: { 'User-Agent': 'FollowBuilders/1.0 (feed aggregator)' },
          });
          if (!articleRes.ok) { errors.push(`Blog article ${article.url}: HTTP ${articleRes.status}`); continue; }
          const articleHtml = await articleRes.text();

          let extracted;
          if (article.url.includes('anthropic.com/engineering')) extracted = extractAnthropicArticleContent(articleHtml);
          else if (article.url.includes('claude.com/blog')) extracted = extractClaudeBlogArticleContent(articleHtml);

          if (!extracted || !extracted.content) { errors.push(`Blog: No content from ${article.url}`); continue; }

          results.push({
            source: 'blog',
            name: blog.name,
            title: extracted.title || article.title || 'Untitled',
            url: article.url,
            publishedAt: extracted.publishedAt || article.publishedAt || null,
            author: extracted.author || '',
            description: article.description || '',
            content: extracted.content,
          });

          state.seenArticles[article.url] = Date.now();
          await new Promise(r => setTimeout(r, 500));
        } catch (err) { errors.push(`Blog article ${article.url}: ${err.message}`); }
      }
    } catch (err) { errors.push(`Blog ${blog.name}: ${err.message}`); }
  }
  return results;
}

// -- X/Twitter: API v2 Fetch --------------------------------------------------

async function fetchXContent(sources, state, errors) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    console.error('  X: No X_BEARER_TOKEN set — skipping X/Twitter fetch');
    return [];
  }

  if (!sources.x || sources.x.length === 0) {
    console.error('  X: No builders in sources.json — skipping');
    return [];
  }

  const cutoff = new Date(Date.now() - X_LOOKBACK_HOURS * 60 * 60 * 1000);
  const results = [];

  // Cache user IDs in state to avoid repeated lookups
  if (!state.xUserIds) state.xUserIds = {};

  for (const builder of sources.x) {
    console.error(`  X: @${builder.handle}...`);

    try {
      // 1. Resolve user ID (cached or API lookup)
      let userId = state.xUserIds[builder.handle];
      if (!userId) {
        const userRes = await fetch(
          `${X_API_BASE}/users/by/username/${builder.handle}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
          }
        );
        if (!userRes.ok) {
          const errText = await userRes.text().catch(() => '');
          errors.push(`X user lookup @${builder.handle}: HTTP ${userRes.status}${errText ? ' — ' + errText.slice(0, 200) : ''}`);
          continue;
        }
        const userData = await userRes.json();
        userId = userData.data?.id;
        if (!userId) {
          errors.push(`X user lookup @${builder.handle}: no user ID in response`);
          continue;
        }
        state.xUserIds[builder.handle] = userId;
        console.error(`    user ID cached: ${userId}`);
      }

      // 2. Fetch recent tweets (exclude retweets & replies)
      const tweetsParams = new URLSearchParams({
        max_results: '10',
        'tweet.fields': 'created_at,public_metrics',
        exclude: 'retweets,replies',
      });
      const tweetsRes = await fetch(
        `${X_API_BASE}/users/${userId}/tweets?${tweetsParams}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!tweetsRes.ok) {
        const errText = await tweetsRes.text().catch(() => '');
        errors.push(`X tweets @${builder.handle}: HTTP ${tweetsRes.status}${errText ? ' — ' + errText.slice(0, 200) : ''}`);
        continue;
      }

      const tweetsData = await tweetsRes.json();
      const tweets = (tweetsData.data || [])
        .filter(t => new Date(t.created_at) >= cutoff)
        .map(t => ({
          id: t.id,
          text: t.text,
          createdAt: t.created_at,
          metrics: {
            likes: t.public_metrics?.like_count || 0,
            retweets: t.public_metrics?.retweet_count || 0,
            replies: t.public_metrics?.reply_count || 0,
            views: t.public_metrics?.impression_count || 0,
          },
        }));

      if (tweets.length > 0) {
        console.error(`    ${tweets.length} recent tweets`);
        results.push({
          handle: `@${builder.handle}`,
          name: builder.name,
          tweets,
        });
      } else {
        console.error('    no recent tweets');
      }
    } catch (err) {
      errors.push(`X @${builder.handle}: ${err.message}`);
    }

    // Respect rate limits: small delay between users
    if (sources.x.indexOf(builder) < sources.x.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

// -- Main --------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const xOnly = args.includes('--x-only');
  const podcastsOnly = args.includes('--podcasts-only');
  const blogsOnly = args.includes('--blogs-only');
  const runAll = !xOnly && !podcastsOnly && !blogsOnly;
  const runX = xOnly || runAll;
  const runPodcasts = podcastsOnly || runAll;
  const runBlogs = blogsOnly || runAll;

  // Load sources
  if (!fs.existsSync(SOURCES_PATH)) {
    console.error(`ERROR: Sources file not found: ${SOURCES_PATH}`);
    console.error('Create config/sources.json first (see follow-builders config/default-sources.json for reference).');
    process.exit(1);
  }
  const sources = loadSources();
  const state = loadState();
  const errors = [];

  // Ensure output directory
  if (!fs.existsSync(FEEDS_DIR)) fs.mkdirSync(FEEDS_DIR, { recursive: true });

  console.error('=== AI Builders Digest — Local Feed Generator ===\n');

  // Podcasts
  if (runPodcasts && sources.podcasts?.length > 0) {
    console.error('[Podcasts] Fetching RSS + YouTube...');
    const podcasts = await fetchPodcastContent(sources, state, errors);
    console.error(`  → ${podcasts.length} new episode(s)\n`);

    const podcastFeed = {
      generatedAt: new Date().toISOString(),
      lookbackHours: PODCAST_LOOKBACK_HOURS,
      podcasts,
      stats: { podcastEpisodes: podcasts.length },
    };
    fs.writeFileSync(path.join(FEEDS_DIR, 'feed-podcasts.json'), JSON.stringify(podcastFeed, null, 2));
  }

  // Blogs
  if (runBlogs && sources.blogs?.length > 0) {
    console.error('[Blogs] Fetching articles...');
    const blogs = await fetchBlogContent(sources, state, errors);
    console.error(`  → ${blogs.length} new article(s)\n`);

    const blogFeed = {
      generatedAt: new Date().toISOString(),
      lookbackHours: BLOG_LOOKBACK_HOURS,
      blogs,
      stats: { blogPosts: blogs.length },
    };
    fs.writeFileSync(path.join(FEEDS_DIR, 'feed-blogs.json'), JSON.stringify(blogFeed, null, 2));
  }

  // X/Twitter
  let xResults = [];
  if (runX && sources.x?.length > 0) {
    console.error('[X/Twitter] Fetching tweets via API v2...');
    xResults = await fetchXContent(sources, state, errors);
    console.error(`  → ${xResults.length} builder(s) with recent tweets\n`);
  }

  const xFeed = {
    generatedAt: new Date().toISOString(),
    lookbackHours: X_LOOKBACK_HOURS,
    x: xResults,
    stats: {
      xBuilders: xResults.length,
      totalTweets: xResults.reduce((sum, a) => sum + (a.tweets?.length || 0), 0),
    },
  };
  if (!process.env.X_BEARER_TOKEN) {
    xFeed.note = 'X/Twitter feed not available (requires paid API). Set X_BEARER_TOKEN to enable.';
  }
  fs.writeFileSync(path.join(FEEDS_DIR, 'feed-x.json'), JSON.stringify(xFeed, null, 2));

  // Save state
  saveState(state);

  if (errors.length > 0) {
    console.error(`⚠ ${errors.length} non-fatal error(s):`);
    for (const e of errors.slice(0, 10)) console.error(`  - ${e}`);
  }

  console.error('\nDone! Feeds saved to data/feeds/');
  console.error('  feed-x.json');
  console.error('  feed-podcasts.json');
  console.error('  feed-blogs.json');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
