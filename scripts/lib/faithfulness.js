// Groundedness checks against on-disk feed text. No model calls.
// Cards whose sourceUrl is not in the current feeds are skipped (older issues).

function normalizeUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    const host = parsed.hostname.replace(/^www\./, '').replace(/^twitter\.com$/, 'x.com');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}${parsed.search}`.toLowerCase();
  } catch {
    return String(url || '').trim().toLowerCase().replace(/\/+$/, '');
  }
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function haystack(text) {
  return stripHtml(text)
    .toLowerCase()
    .replace(/billion/g, 'b')
    .replace(/million/g, 'm')
    .replace(/,/g, '');
}

function tweetUrl(handle, id) {
  const h = String(handle || '').replace(/^@/, '');
  if (!h || !id) return '';
  return `https://x.com/${h}/status/${id}`;
}

function indexFeeds(feedData) {
  const map = new Map();

  function add(url, parts) {
    const key = normalizeUrl(url);
    if (!key) return;
    const body = haystack(parts.filter(Boolean).join(' '));
    if (!body) return;
    const prev = map.get(key) || '';
    map.set(key, prev ? `${prev} ${body}` : body);
  }

  for (const builder of feedData.x || []) {
    for (const tweet of builder.tweets || []) {
      add(tweet.url || tweetUrl(builder.handle, tweet.id), [
        builder.name,
        builder.handle,
        tweet.text,
      ]);
    }
  }

  for (const episode of feedData.podcasts || []) {
    add(episode.url, [episode.title, episode.description, episode.content]);
  }

  for (const post of feedData.blogs || []) {
    add(post.url, [post.title, post.description, post.content]);
  }

  for (const video of feedData.videos || []) {
    add(video.url, [video.title, video.description]);
  }

  for (const item of feedData.shortlist || []) {
    add(item.url, [item.title, item.text, item.description]);
  }

  return map;
}

function extractNumbers(text) {
  const found = [];
  const re = /\$?\d+(?:[.,]\d+)?(?:\s?(?:%|b|m|k|x|×|billion|million))?/gi;
  for (const match of String(text || '').matchAll(re)) {
    const raw = match[0].trim();
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) continue;
    if (/^20\d{2}$/.test(digits) || /^19\d{2}$/.test(digits)) continue;
    if (digits.length === 1 && !/[.$%bmkx×]/i.test(raw)) continue;
    found.push(raw);
  }
  return [...new Set(found)];
}

function numberInSource(raw, sourceHay) {
  const compact = raw
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace('billion', 'b')
    .replace('million', 'm')
    .replace('×', 'x');
  if (sourceHay.includes(compact)) return true;
  const digits = compact.replace(/[^\d.]/g, '');
  if (!digits || digits.length < 2) {
    if (digits.length === 1 && /[.$%bmkx]/.test(compact)) {
      return new RegExp(`(?<!\\d)${digits}(?!\\d)`).test(sourceHay);
    }
    return false;
  }
  const escaped = digits.replace(/\./g, '\\.');
  return new RegExp(`(?<!\\d)${escaped}(?!\\d)`).test(sourceHay);
}

function normalizeQuote(text) {
  return stripHtml(text)
    .replace(/^\[paraphrase\]\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function quoteGrounded(quote, sourceHay) {
  const labelledParaphrase = /^\[paraphrase\]/i.test(String(quote || '').trim());
  if (labelledParaphrase) return { ok: true, paraphrase: true };
  const q = normalizeQuote(quote);
  if (q.length < 20) return { ok: true, paraphrase: false };
  if (sourceHay.includes(q.slice(0, Math.min(48, q.length)))) return { ok: true, paraphrase: false };
  const words = q.split(' ').filter((w) => w.length > 3);
  if (words.length === 0) return { ok: true, paraphrase: false };
  const sourceWords = new Set(sourceHay.split(/[^a-z0-9]+/).filter(Boolean));
  const hits = words.filter((w) => sourceWords.has(w)).length;
  return { ok: hits / words.length >= 0.45, paraphrase: false };
}

function collectCards(data) {
  const cards = [];
  for (const section of data.sections || []) {
    for (const card of section.cards || []) cards.push(card);
  }
  return cards;
}

function evaluateFaithfulness(data, sourceIndex) {
  const warnings = [];
  let checked = 0;
  let skippedNoSource = 0;
  let numberMisses = 0;
  let quoteMisses = 0;

  collectCards(data).forEach((card, index) => {
    const loc = `card[${index}]`;
    const sourceHay = sourceIndex.get(normalizeUrl(card.sourceUrl));
    if (!sourceHay) {
      skippedNoSource += 1;
      return;
    }
    checked += 1;

    const rewrite = (card.en?.rewrite || []).join(' ');
    for (const num of extractNumbers(rewrite)) {
      if (!numberInSource(num, sourceHay)) {
        numberMisses += 1;
        warnings.push(`${loc} number "${num}" not found in source text`);
      }
    }

    for (const quote of card.en?.original || []) {
      const result = quoteGrounded(quote, sourceHay);
      if (!result.ok) {
        quoteMisses += 1;
        warnings.push(`${loc} original quote not grounded in source text`);
      }
    }
  });

  return {
    warnings,
    stats: {
      checked,
      skippedNoSource,
      numberMisses,
      quoteMisses,
    },
  };
}

module.exports = {
  normalizeUrl,
  indexFeeds,
  extractNumbers,
  evaluateFaithfulness,
};
