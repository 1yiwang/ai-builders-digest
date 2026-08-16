// Static per-1M-token prices. No billing API. Ollama is always $0.

const PRICING = {
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  ollama: { input: 0, output: 0 },
};

function priceFor(model, provider) {
  if (provider === 'ollama') return PRICING.ollama;
  if (PRICING[model]) return PRICING[model];
  if (String(model || '').includes('claude')) return { input: 3, output: 15 };
  return PRICING['deepseek-chat'];
}

function estimateCostUsd(model, tokensIn, tokensOut, provider) {
  const price = priceFor(model, provider);
  const usd = ((Number(tokensIn) || 0) * price.input + (Number(tokensOut) || 0) * price.output) / 1e6;
  return Number(usd.toFixed(6));
}

module.exports = { PRICING, priceFor, estimateCostUsd };
