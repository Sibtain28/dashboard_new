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
    .replace(/(\d)\s*[x×]\s*(\d)/g, '$1 $2')
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

function parseMonthYear(question) {
  const lower = question.toLowerCase();
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

  const monthMatch = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/i);
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (!monthMatch) return null;
  const month = monthMap[monthMatch[1].toLowerCase()];
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  return { month, year };
}

function identityMatch(normalizedQuestion, candidates) {
  const lower = normalizeText(normalizedQuestion);
  return candidates.find((candidate) => {
    const normalized = normalizeText(candidate);
    if (!normalized) return false;
    if (lower.includes(normalized)) return true;

    const candidateTokens = normalized.split(' ').filter(Boolean);
    if (!candidateTokens.length) return false;

    const matches = candidateTokens.reduce((count, token) => count + (lower.includes(token) ? 1 : 0), 0);
    return matches >= Math.max(2, Math.floor(candidateTokens.length * 0.6));
  });
}

function isGeneralKnowledgeQuestion(question) {
  const lower = String(question || '').toLowerCase();
  return /\b(hi|hello|hey|greetings|good morning|good afternoon|good evening|how are you|who are you|what are you|tell me about yourself|your name|where are you from|what is ai|what is artificial intelligence|define ai|define artificial intelligence|what is machine learning|help me|thanks|thank you|bye|goodbye)\b/.test(lower);
}

function detectDashboardQuery(question) {
  const lower = String(question || '').toLowerCase();
  if (isGeneralKnowledgeQuestion(question)) {
    return false;
  }
  return /\b(plant|plants|generation|generated|production|produced|consumption|consumed|use|used|region|location|city|power|quantity|kwh|material|movement|movement type|date|month|year|trend|compare|comparison|volume|metric|capacity|forecast|load|top|highest|lowest|most|least)\b/.test(lower);
}

function detectChartIntent(question) {
  const lower = String(question || '').toLowerCase();
  return /trend|history|compare|comparison|visual|chart|graph|plot|show.*trend|versus|\svs\s/.test(lower);
}

function buildChartResponse(question, rows) {
  const lower = question.toLowerCase();
  const plantNames = [...new Set(rows.map((row) => row.plantName).filter(Boolean))];
  const cities = [...new Set(rows.map((row) => row.city).filter(Boolean))];
  const plant = identityMatch(question, plantNames);
  const city = identityMatch(question, cities);
  const exactDate = extractRequestedDate(question);
  const monthYear = parseMonthYear(question);

  let filtered = rows;
  if (plant) {
    filtered = filtered.filter((row) => normalizeText(row.plantName).includes(normalizeText(plant)));
  }
  if (city) {
    filtered = filtered.filter((row) => normalizeText(row.city).includes(normalizeText(city)));
  }
  if (exactDate) {
    filtered = filtered.filter((row) => row.date === exactDate);
  }
  if (monthYear) {
    filtered = filtered.filter((row) => {
      const year = parseInt(row.date.slice(0, 4), 10);
      const month = parseInt(row.date.slice(4, 6), 10) - 1;
      return month === monthYear.month && (monthYear.year === null || year === monthYear.year);
    });
  }

  const wantGen = /generation|generated|produced|output/i.test(lower);
  const wantCon = /consumption|consumed|used/i.test(lower);
  const wantBoth = /compare|comparison|vs|versus/i.test(lower) || /generation.*consumption|consumption.*generation/i.test(lower);

  if (wantBoth) {
    filtered = filtered.filter((row) => ['101', '102', '261', '262'].includes(row.movementType));
  } else if (wantGen && !wantCon) {
    filtered = filtered.filter((row) => ['101', '102'].includes(row.movementType));
  } else if (wantCon && !wantGen) {
    filtered = filtered.filter((row) => ['261', '262'].includes(row.movementType));
  }

  if (!filtered.length) {
    return null;
  }

  const chart = { type: 'chart', title: '', subtitle: '', chartType: 'line', data: null, table: null };

  const groupByDate = filtered.reduce((acc, row) => {
    if (!acc[row.date]) acc[row.date] = { generation: 0, consumption: 0 };
    if (['101', '102'].includes(row.movementType)) acc[row.date].generation += row.quantity;
    if (['261', '262'].includes(row.movementType)) acc[row.date].consumption += row.quantity;
    return acc;
  }, {});

  const sortedDates = Object.keys(groupByDate).sort();
  const labels = sortedDates.map((date) => formatReadableDate(date));
  const generationSeries = sortedDates.map((date) => groupByDate[date].generation);
  const consumptionSeries = sortedDates.map((date) => groupByDate[date].consumption);

  if (/trend|history|over time/i.test(lower)) {
    chart.chartType = 'line';
    chart.title = plant ? `Generation Trend for ${plant}` : city ? `Trend for ${city}` : 'Generation vs Consumption Trend';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    chart.subtitle = monthYear ? `${monthYear.year || ''} ${monthYear.month !== undefined ? monthNames[monthYear.month] : ''}`.trim() : 'Trend over time';
    chart.data = {
      labels,
      datasets: [],
    };
    if (wantBoth) {
      chart.data.datasets.push({ label: 'Generation', data: generationSeries, color: '#10b981' });
      chart.data.datasets.push({ label: 'Consumption', data: consumptionSeries, color: '#f43f5e' });
    } else if (wantCon) {
      chart.data.datasets.push({ label: 'Consumption', data: consumptionSeries, color: '#f43f5e' });
    } else {
      chart.data.datasets.push({ label: 'Generation', data: generationSeries, color: '#10b981' });
    }
    chart.table = {
      headers: ['Date', 'Generation', 'Consumption'],
      rows: sortedDates.map((date) => [formatReadableDate(date), generationSeries[sortedDates.indexOf(date)], consumptionSeries[sortedDates.indexOf(date)]])
    };
    return chart;
  }

  if (/compare|comparison|vs|versus/i.test(lower)) {
    if (plant || city) {
      const totals = { generation: 0, consumption: 0 };
      filtered.forEach((row) => {
        if (['101', '102'].includes(row.movementType)) totals.generation += row.quantity;
        if (['261', '262'].includes(row.movementType)) totals.consumption += row.quantity;
      });
      chart.chartType = 'bar';
      chart.title = `Generation vs Consumption for ${plant || city}`;
      chart.subtitle = 'Total volume comparison';
      chart.data = {
        labels: ['Generation', 'Consumption'],
        datasets: [{ label: 'kWh', data: [totals.generation, totals.consumption], color: '#3b82f6' }]
      };
      chart.table = {
        headers: ['Metric', 'Value'],
        rows: [['Generation', totals.generation], ['Consumption', totals.consumption]]
      };
      return chart;
    }
    const groupedByPlant = {};
    filtered.forEach((row) => {
      const key = row.plantName || row.city || row.senderPlantKey || 'Unknown';
      groupedByPlant[key] = (groupedByPlant[key] || 0) + row.quantity;
    });
    const sorted = Object.entries(groupedByPlant).sort((a, b) => b[1] - a[1]).slice(0, 8);
    chart.chartType = 'bar';
    chart.title = 'Top volume comparison';
    chart.subtitle = 'Comparison by plant';
    chart.data = { labels: sorted.map((item) => item[0].length > 16 ? item[0].slice(0, 16) + '...' : item[0]), datasets: [{ label: 'kWh', data: sorted.map((item) => item[1]), color: '#3b82f6' }] };
    chart.table = { headers: ['Plant', 'Total'], rows: sorted.map((item) => [item[0], item[1]]) };
    return chart;
  }

  if (/breakdown|distribution|share|pie|percent/i.test(lower)) {
    const categoryTotals = { generation: 0, consumption: 0 };
    filtered.forEach((row) => {
      if (['101', '102'].includes(row.movementType)) categoryTotals.generation += row.quantity;
      if (['261', '262'].includes(row.movementType)) categoryTotals.consumption += row.quantity;
    });
    chart.chartType = 'pie';
    chart.title = `Volume Breakdown${plant ? ` for ${plant}` : city ? ` for ${city}` : ''}`;
    chart.subtitle = 'Generation vs Consumption share';
    chart.data = {
      labels: ['Generation', 'Consumption'],
      datasets: [{ label: 'Share', data: [categoryTotals.generation, categoryTotals.consumption], colors: ['#10b981', '#f43f5e'] }]
    };
    chart.table = { headers: ['Category', 'Value'], rows: [['Generation', categoryTotals.generation], ['Consumption', categoryTotals.consumption]] };
    return chart;
  }

  return null;
}

function createNumberFormatter(value) {
  if (value === null || value === undefined) return '0';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString();
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

    const isDashboardQuery = detectDashboardQuery(message);
    const chartResponse = isDashboardQuery && detectChartIntent(message) ? buildChartResponse(message, dashboardRows) : null;
    if (chartResponse) {
      console.log('✅ Detected dashboard chart intent; returning structured chart payload');
      return res.json(chartResponse);
    }

    const callGeneralOllama = async (promptText) => {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          prompt: promptText,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Ollama request failed:', response.status, errorText);
        throw new Error('Ollama unavailable');
      }

      const data = await response.json();
      const text = typeof data?.response === 'string' ? data.response.trim() : '';
      if (!text) {
        console.error('❌ Ollama returned empty response');
        throw new Error('Empty Ollama response');
      }
      return text;
    };

    if (isDashboardQuery) {
      console.log('🔄 Dashboard query detected; searching CSV for relevant rows');
      const relevantRows = getRelevantRows(message, dashboardRows);
      if (relevantRows.length) {
        console.log(`   Found ${relevantRows.length} relevant CSV rows for context`);
        const contextText = relevantRows.map((row, index) => {
          const readableDate = formatReadableDate(row.date);
          return `${index + 1}. Date: ${readableDate} | Movement type: ${row.movementType} | Quantity: ${row.quantity} | Plant: ${row.plantName || 'unknown'} | City: ${row.city || 'unknown'} | Material: ${row.material || 'unknown'}`;
        }).join('\n');

        const prompt = `You are a factual assistant. Answer ONLY using the CSV rows provided below. Do not use outside knowledge. If the requested information is not present in the provided rows, reply with the best possible answer based on the data provided.\n\nCSV rows:\n${contextText}\n\nQuestion: ${message}\nAnswer in one short sentence.`;

        console.log('   🤖 Calling Ollama for dashboard answer with CSV context');
        const responseText = await callGeneralOllama(prompt);
        console.log('✅ [OLLAMA RESPONSE] Received dashboard answer from Ollama');
        return res.type('text/plain').send(responseText);
      }

      console.log('🔁 No relevant CSV data found for dashboard query; falling back to general Ollama knowledge');
    }

    console.log('🔄 Delegating to Ollama for general knowledge response');
    const generalText = await callGeneralOllama(message);
    console.log('✅ [OLLAMA RESPONSE] Received general answer from Ollama');
    return res.type('text/plain').send(generalText);
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
