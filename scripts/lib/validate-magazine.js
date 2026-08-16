function collectCards(data) {
  const cards = [];
  for (const section of data.sections || []) {
    for (const card of section.cards || []) cards.push(card);
  }
  return cards;
}

function collectCardUrls(data) {
  return [...new Set(collectCards(data).map((card) => card.sourceUrl).filter(Boolean))];
}

function countCards(data) {
  return collectCards(data).length;
}

function validateMagazineJSON(data, opts = {}) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['root is not an object'], warnings };
  }
  if (data.empty === true) {
    return { ok: false, errors: [`model returned empty issue: ${data.reason || 'no reason'}`], warnings };
  }
  if (!data.title) errors.push('missing title');
  if (!data.publishDate) errors.push('missing publishDate');
  if (!Array.isArray(data.sections) || data.sections.length === 0) {
    errors.push('sections must be a non-empty array');
    return { ok: errors.length === 0, errors, warnings };
  }

  const cards = collectCards(data);
  if (cards.length === 0) errors.push('no cards');
  if (cards.length > 10) errors.push(`too many cards: ${cards.length} (max 10)`);

  const sourceCounts = {};
  cards.forEach((card, index) => {
    const loc = `card[${index}]`;
    if (!card.sourceUrl) errors.push(`${loc} missing sourceUrl`);
    else if (!/^https?:\/\//i.test(card.sourceUrl)) errors.push(`${loc} sourceUrl is not http(s)`);
    if (!card.authorKey) errors.push(`${loc} missing authorKey`);
    if (![1, 2, 3].includes(card.priority)) errors.push(`${loc} invalid priority`);
    if (!Array.isArray(card.en?.rewrite) || card.en.rewrite.length === 0) {
      errors.push(`${loc} missing en.rewrite`);
    }
    if (!Array.isArray(card.de?.rewrite) || card.de.rewrite.length === 0) {
      errors.push(`${loc} missing de.rewrite`);
    }

    const sourceName = card.sourceName || card.authorKey || loc;
    sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;

    for (const bullet of [...(card.en?.rewrite || []), ...(card.de?.rewrite || [])]) {
      const words = String(bullet).trim().split(/\s+/).filter(Boolean);
      if (words.length > 40) warnings.push(`${loc} bullet has ${words.length} words`);
    }
  });

  for (const [name, count] of Object.entries(sourceCounts)) {
    if (count > 2) errors.push(`source "${name}" has ${count} cards (max 2)`);
  }

  const allowed = opts.allowedUrls;
  if (Array.isArray(allowed) && allowed.length > 0) {
    const allowedSet = new Set(allowed);
    cards.forEach((card, index) => {
      if (card.sourceUrl && !allowedSet.has(card.sourceUrl)) {
        errors.push(`card[${index}] sourceUrl not in shortlist: ${card.sourceUrl}`);
      }
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateLegacyIssue(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return { ok: false, errors: ['root is not an object'], warnings: [] };
  if (!data.title) errors.push('missing title');
  if (!Array.isArray(data.sections) || data.sections.length === 0) errors.push('missing sections');
  const cards = collectCards(data);
  if (cards.length === 0) errors.push('no cards');
  cards.forEach((card, index) => {
    if (card.sourceUrl && !/^https?:\/\//i.test(card.sourceUrl)) {
      errors.push(`card[${index}] sourceUrl is not http(s)`);
    }
  });
  return { ok: errors.length === 0, errors, warnings: [] };
}

module.exports = {
  collectCards,
  collectCardUrls,
  countCards,
  validateMagazineJSON,
  validateLegacyIssue,
};
