function getGroqConfig() {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3b-instruct';
  const baseUrl = process.env.GROQ_API_URL || `https://api.groq.com/v1/models/${model}/outputs`;

  if (!apiKey) {
    console.warn('GROQ_API_KEY is not set. Chat generation will fail until the environment variable is configured.');
  }

  return { apiKey, model, baseUrl };
}

function getRequestPayload(prompt) {
  const { model, baseUrl } = getGroqConfig();
  const baseLower = baseUrl.toLowerCase();

  if (baseLower.includes('/openai/v1')) {
    return {
      model,
      messages: [
        { role: 'system', content: 'You are a factual assistant for a power plant dataset. Answer based only on provided context.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 512,
      top_p: 0.95,
    };
  }

  return {
    input: prompt,
    temperature: 0.1,
    max_output_tokens: 512,
    top_p: 0.95,
  };
}

function normalizeGroqUrl(url) {
  const normalized = url.replace(/\/+$/, '');
  if (normalized.toLowerCase().includes('/openai/v1')) {
    if (!normalized.toLowerCase().includes('/chat/completions')) {
      return `${normalized}/chat/completions`;
    }
  }
  return normalized;
}

async function requestGroq(modelInput) {
  const { apiKey, baseUrl, model } = getGroqConfig();
  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY in environment.');
  }

  const normalizedBase = normalizeGroqUrl(baseUrl);
  const urlCandidates = [normalizedBase, `https://api.groq.com/v1/models/${model}/generate`];

  for (const url of urlCandidates) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(modelInput),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
          continue;
        }
        throw new Error(`Groq API error ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (err) {
      if (url === urlCandidates[urlCandidates.length - 1]) {
        throw err;
      }
    }
  }

  throw new Error('Unable to reach Groq API using configured endpoints.');
}

function parseGroqResponse(payload) {
  if (!payload) return '';
  if (Array.isArray(payload.output) && payload.output.length > 0) {
    const first = payload.output[0];
    if (first?.content) {
      return first.content
        .map((item) => (typeof item === 'string' ? item : item.text || ''))
        .join('')
        .trim();
    }
    if (typeof first === 'string') {
      return first;
    }
    if (first?.text) {
      return first.text;
    }
  }

  if (Array.isArray(payload.choices) && payload.choices.length > 0) {
    const choice = payload.choices[0];
    if (choice.message?.content) {
      return choice.message.content;
    }
    if (typeof choice.text === 'string') {
      return choice.text;
    }
  }

  return typeof payload?.text === 'string' ? payload.text : '';
}

async function generateAnswer(prompt) {
  const { apiKey } = getGroqConfig();
  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY in environment.');
  }

  const requestPayload = getRequestPayload(prompt);
  const responsePayload = await requestGroq(requestPayload);
  const answer = parseGroqResponse(responsePayload);
  return answer || 'I was unable to generate a valid response from the language model.';
}

module.exports = {
  generateAnswer,
};
