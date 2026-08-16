// Unified chat() for DeepSeek, Ollama (OpenAI-compatible), and Anthropic.

function loadCredentials() {
  const forced = String(process.env.DIGEST_PROVIDER || '').toLowerCase();
  if (forced === 'ollama') {
    return {
      provider: 'ollama',
      apiKey: process.env.OLLAMA_API_KEY || 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
    };
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    };
  }

  if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    };
  }

  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const env = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).env || {};
    if (env.DEEPSEEK_API_KEY) {
      return {
        provider: 'deepseek',
        apiKey: env.DEEPSEEK_API_KEY,
        baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        model: env.DEEPSEEK_MODEL || 'deepseek-chat',
      };
    }
    if (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY) {
      return {
        provider: 'anthropic',
        apiKey: env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY,
        baseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
        model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      };
    }
  }

  return null;
}

function usageFromOpenAI(json) {
  return {
    tokensIn: json.usage?.prompt_tokens || 0,
    tokensOut: json.usage?.completion_tokens || 0,
  };
}

async function chat({ credentials, systemPrompt, userMessage, maxTokens = 4000 }) {
  const { provider, apiKey, baseUrl, model } = credentials;
  const started = Date.now();
  const root = String(baseUrl || '').replace(/\/$/, '');

  let endpoint;
  let headers;
  let body;

  if (provider === 'anthropic') {
    endpoint = `${root}/v1/messages`;
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    body = {
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: [{ type: 'text', text: userMessage }] }],
    };
  } else {
    endpoint = `${root}/v1/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    body = {
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = await res.json();
  const latencyMs = Date.now() - started;

  if (provider === 'anthropic') {
    const text = (json.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    if (!text) throw new Error('Anthropic returned no text content.');
    return {
      text,
      usage: {
        tokensIn: json.usage?.input_tokens || 0,
        tokensOut: json.usage?.output_tokens || 0,
      },
      latencyMs,
    };
  }

  const text = json.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`${provider} returned no text content.`);
  return { text, usage: usageFromOpenAI(json), latencyMs };
}

module.exports = { loadCredentials, chat };
