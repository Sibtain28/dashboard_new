const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const csv = require('csv-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const csvFilePath = resolveDataFilePath();
let dashboardRows = [];

function resolveDataFilePath() {
  const workspaceRoot = path.join(__dirname, '../..');
  const candidates = [];
  const mergedPath = path.join(workspaceRoot, 'merged_dashboard_data.csv');
  if (fs.existsSync(mergedPath)) {
    candidates.push(mergedPath);
  }

  const sourceFiles = fs.readdirSync(workspaceRoot)
    .filter((file) => file.startsWith('FACT_QUALITY_MATERIAL_MOVEMENT_') && file.endsWith('.csv'))
    .map((file) => path.join(workspaceRoot, file));

  candidates.push(...sourceFiles);

  if (!candidates.length) {
    return mergedPath;
  }

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}

function formatDateYYYYMMDD(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatReadableDate(dateString) {
  if (!dateString || !/^\d{8}$/.test(dateString)) {
    return dateString || '';
  }

  const year = parseInt(dateString.slice(0, 4), 10);
  const month = parseInt(dateString.slice(4, 6), 10) - 1;
  const day = parseInt(dateString.slice(6, 8), 10);
  const parsedDate = new Date(Date.UTC(year, month, day));

  return parsedDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractRequestedDate(question) {
  const lower = question.toLowerCase();
  const now = new Date();

  if (lower.includes('yesterday')) {
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return formatDateYYYYMMDD(yesterday);
  }

  if (lower.includes('today')) {
    return formatDateYYYYMMDD(now);
  }

  const monthMap = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  const patterns = [
    /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
    /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})/i,
    /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (!match) continue;

    let year;
    let month;
    let day;

    if (pattern.source.startsWith('(\\d{4})')) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10) - 1;
      day = parseInt(match[3], 10);
    } else if (pattern.source.startsWith('(\\d{1,2})(?:st|nd|rd|th)?')) {
      day = parseInt(match[1], 10);
      month = monthMap[match[2].toLowerCase()];
      year = parseInt(match[3], 10);
    } else if (pattern.source.startsWith('(january')) {
      month = monthMap[match[1].toLowerCase()];
      day = parseInt(match[2], 10);
      year = parseInt(match[3], 10);
    } else {
      year = parseInt(match[3], 10);
      month = parseInt(match[1], 10) - 1;
      day = parseInt(match[2], 10);
    }

    if (Number.isNaN(month) || Number.isNaN(day) || Number.isNaN(year)) {
      continue;
    }

    const parsedDate = new Date(Date.UTC(year, month, day));
    return formatDateYYYYMMDD(parsedDate);
  }

  return null;
}

function extractMovementTypeFilter(question) {
  const lower = question.toLowerCase();
  if (lower.includes('generation') || lower.includes('generated') || lower.includes('produced') || lower.includes('output')) {
    return ['101', '102'];
  }
  if (lower.includes('consumption') || lower.includes('consumed') || lower.includes('used')) {
    return ['261', '262'];
  }
  return [];
}

function loadDashboardRows() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        const date = (data.POSTING_DATE_KEY || '').trim();
        const movementType = (data.MOVEMENT_TYPE || '').trim();
        if (!date || !movementType) return;

        results.push({
          date,
          movementType,
          quantity: parseFloat(data.QUANTITY) || 0,
          plantName: data.SENDER_PLANT_NAME || '',
          city: data.SENDER_PLANT_CITY || '',
          material: data.MATERIAL_KEY || '',
          senderPlantKey: data.SENDER_PLANT_KEY || '',
        });
      })
      .on('end', () => {
        dashboardRows = results;
        resolve(results);
      })
      .on('error', reject);
  });
}

function getRelevantRows(question, rows) {
  const normalizedQuestion = question.toLowerCase();
  const requestedDate = extractRequestedDate(question);
  const movementTypes = extractMovementTypeFilter(question);
  const stopWords = new Set(['which', 'what', 'plant', 'plants', 'generated', 'generation', 'power', 'highest', 'lowest', 'top', 'most', 'least', 'on', 'the', 'for', 'at', 'with', 'and', 'was', 'were', 'did', 'from', 'to', 'of', 'a', 'an', 'or', 'in', 'is', 'are', 'show', 'give', 'tell', 'me', 'data', 'rows', 'row', 'trend']);
  const keywordTerms = normalizedQuestion
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  const filteredRows = rows.filter((row) => {
    if (requestedDate && row.date !== requestedDate) return false;
    if (movementTypes.length && !movementTypes.includes(row.movementType)) return false;

    if (!keywordTerms.length) return true;

    const rowText = normalizeText(`${row.plantName} ${row.city} ${row.material} ${row.movementType} ${row.senderPlantKey}`);
    const keywordHits = keywordTerms.reduce((sum, term) => sum + (rowText.includes(term) ? 1 : 0), 0);
    return keywordHits > 0 || requestedDate || movementTypes.length;
  });

  if (!filteredRows.length) {
    return [];
  }

  const isAscending = /lowest|minimum|smallest|least/i.test(normalizedQuestion);
  const isDescending = /highest|maximum|largest|top|most|peak/i.test(normalizedQuestion);

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (isAscending) return a.quantity - b.quantity;
    if (isDescending) return b.quantity - a.quantity;
    return b.date.localeCompare(a.date) || b.quantity - a.quantity;
  });

  return sortedRows.slice(0, 8);
}

// Note: direct-answer shortcut removed — all chat requests go through Ollama RAG now.

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`Incoming ${req.method} request to ${req.path}`);
  next();
});

app.get('/api/ping', (req, res) => {
  return res.json({ status: 'ok', message: 'Backend is running', uptime: process.uptime() });
});

app.get('/api/data', (req, res) => {
  return res.json(dashboardRows);
});

app.post('/api/chat', async (req, res) => {
  try {
    const message = req.body?.message ?? req.body?.question ?? '';
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    console.log(`\n📝 Chat Request: "${message}"`);
    console.log('🔄 Delegating to Ollama RAG for all requests');

    const relevantRows = getRelevantRows(message, dashboardRows);
    if (!relevantRows.length) {
      console.log('❌ No relevant rows found in CSV');
      return res.type('text/plain').send('The information is unavailable in the provided CSV data.');
    }

    console.log(`   Found ${relevantRows.length} relevant CSV rows for context`);

    const contextText = relevantRows.map((row, index) => {
      const readableDate = formatReadableDate(row.date);
      return `${index + 1}. Date: ${readableDate} | Movement type: ${row.movementType} | Quantity: ${row.quantity} | Plant: ${row.plantName || 'unknown'} | City: ${row.city || 'unknown'} | Material: ${row.material || 'unknown'}`;
    }).join('\n');

    const prompt = `You are a factual assistant. Answer ONLY using the CSV rows provided below. Do not use outside knowledge. If the requested information is not present in the provided rows, reply exactly: The information is unavailable in the provided CSV data.

CSV rows:
${contextText}

Question: ${message}
Answer in one short sentence.`;

    console.log('   🤖 Calling Ollama at http://localhost:11434...');
    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt,
        stream: false,
      }),
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error('❌ Ollama request failed:', ollamaResponse.status, errorText);
      return res.status(503).json({
        error: 'Ollama is not available. Please make sure Ollama is running and the llama3.2 model is installed.',
      });
    }

    const data = await ollamaResponse.json();
    const responseText = typeof data?.response === 'string' ? data.response.trim() : '';

    if (!responseText) {
      console.error('❌ Ollama returned empty response');
      return res.status(502).json({ error: 'Ollama returned an empty response.' });
    }

    console.log('✅ [OLLAMA RESPONSE] Received answer from Ollama model (llama3.2)');
    console.log(`   Response: ${responseText.substring(0, 80)}...`);
    return res.type('text/plain').send(responseText);
  } catch (error) {
    console.error('❌ Chat handler failure:', error.message);
    return res.status(503).json({ error: 'Ollama is not available. Please make sure Ollama is running.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

loadDashboardRows()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('Failed to load dashboard CSV:', error);
    process.exit(1);
  });
