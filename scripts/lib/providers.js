// DeepSeek native key first; otherwise ANTHROPIC_* (often DeepSeek's Anthropic-compatible gateway).

function loadDeepSeek(apiKey, baseUrl, model) {
  return {
    provider: 'deepseek',
    apiKey,
    baseUrl: baseUrl || 'https://api.deepseek.com',
    model: model || 'deepseek-chat',
  };
}

function loadAnthropic(apiKey, baseUrl, model) {
  return {
    provider: 'anthropic',
    apiKey,
    baseUrl: baseUrl || 'https://api.anthropic.com',
    model: model || 'claude-sonnet-4-20250514',
  };
}

function loadCredentials() {
  const forced = String(process.env.DIGEST_PROVIDER || '').toLowerCase();
  if (forced === 'ollama') {
    throw new Error('Ollama support was removed. Unset DIGEST_PROVIDER.');
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return loadDeepSeek(
      process.env.DEEPSEEK_API_KEY,
      process.env.DEEPSEEK_BASE_URL,
      process.env.DEEPSEEK_MODEL
    );
  }

  if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY) {
    return loadAnthropic(
      process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
      process.env.ANTHROPIC_BASE_URL,
      process.env.ANTHROPIC_MODEL
    );
  }

  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const env = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).env || {};
    if (env.DEEPSEEK_API_KEY) {
      return loadDeepSeek(env.DEEPSEEK_API_KEY, env.DEEPSEEK_BASE_URL, env.DEEPSEEK_MODEL);
    }
    if (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY) {
      return loadAnthropic(
        env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY,
        env.ANTHROPIC_BASE_URL,
        env.ANTHROPIC_MODEL
      );
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

function extractAnthropicText(json) {
  if (typeof json.content === 'string' && json.content.trim()) return json.content;
  if (Array.isArray(json.content)) {
    const text = json.content
      .filter((block) => block && (block.type === 'text' || block.text))
      .map((block) => block.text || '')
      .join('\n');
    if (text.trim()) return text;
  }
  return json.choices?.[0]?.message?.content || '';
}

async function chat({ credentials, systemPrompt, userMessage, maxTokens = 16000 }) {
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
    const text = extractAnthropicText(json);
    if (!text) {
      throw new Error('Anthropic returned no text content. Keys: ' + Object.keys(json).join(','));
    }
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
