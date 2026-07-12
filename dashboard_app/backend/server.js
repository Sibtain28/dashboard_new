const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

dotenv.config();

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


// PostgreSQL connection pool
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "power_dashboard",
  password: "sibtain@2006",
  port: 5433,
});

let cachedPlantNames = [];
let cachedCities = [];

async function initDbCache() {
  try {
    const result = await pool.query('SELECT DISTINCT name1, ort01 FROM plant_master');
    cachedPlantNames = [...new Set(result.rows.map(r => r.name1).filter(Boolean))];
    cachedCities = [...new Set(result.rows.map(r => r.ort01).filter(Boolean))];
    console.log(`Loaded ${cachedPlantNames.length} plants and ${cachedCities.length} cities from DB.`);
  } catch (err) {
    console.error('Failed to load DB cache:', err.message);
  }
}

// Session store for conversation state
const activeSessions = new Map();

function formatDateYYYYMMDD(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatReadableDate(dateString) {
  const normalizedDate = String(dateString || '');
  if (!normalizedDate || !/^\d{8}$/.test(normalizedDate)) {
    return normalizedDate || '';
  }

  const year = parseInt(normalizedDate.slice(0, 4), 10);
  const month = parseInt(normalizedDate.slice(4, 6), 10) - 1;
  const day = parseInt(normalizedDate.slice(6, 8), 10);
  const parsedDate = new Date(Date.UTC(year, month, day));

  return parsedDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function rowToDashboardRecord(row) {
  return {
    ...row,
    date: String(row.date || ''),
    movementType: String(row.movementType || ''),
    quantity: parseFloat(row.quantity || 0),
  };
}

function getDateRangeClause(dateRange, latestDate, values, paramCount) {
  if (!latestDate || !dateRange || dateRange === 'All') {
    return { clause: '', paramCount };
  }

  if (dateRange === 'Month') {
    values.push(`${String(latestDate).slice(0, 6)}%`);
    return { clause: ` AND f.posting_date_key::text LIKE $${paramCount++}`, paramCount };
  }

  if (dateRange === 'Year') {
    values.push(`${String(latestDate).slice(0, 4)}%`);
    return { clause: ` AND f.posting_date_key::text LIKE $${paramCount++}`, paramCount };
  }

  const latestDateObj = new Date(Date.UTC(
    parseInt(String(latestDate).slice(0, 4), 10),
    parseInt(String(latestDate).slice(4, 6), 10) - 1,
    parseInt(String(latestDate).slice(6, 8), 10),
  ));

  if (Number.isNaN(latestDateObj.getTime())) {
    return { clause: '', paramCount };
  }

  if (dateRange === '7D' || dateRange === '30D') {
    const start = new Date(latestDateObj);
    start.setUTCDate(start.getUTCDate() - (dateRange === '7D' ? 7 : 30));
    values.push(formatDateYYYYMMDD(start), String(latestDate));
    return {
      clause: ` AND f.posting_date_key::text BETWEEN $${paramCount++} AND $${paramCount++}`,
      paramCount,
    };
  }

  return { clause: '', paramCount };
}

async function getLatestPostingDate(baseWhere = '', baseValues = []) {
  const { rows } = await pool.query(`
    SELECT MAX(f.posting_date_key::text) as "latestDate"
    FROM fact_quality_material_movement f
    LEFT JOIN plant_master p ON f.sender_plant_key = p.werks
    WHERE f.movement_type::text IN ('101', '102', '261', '262')
    ${baseWhere}
  `, baseValues);

  return rows[0]?.latestDate ? String(rows[0].latestDate) : null;
}

function appendEntityFilters(query, values, paramCount, { plant, city }) {
  let nextQuery = query;
  let nextParamCount = paramCount;

  if (plant && plant !== 'All') {
    nextQuery += ` AND p.name1 = $${nextParamCount++}`;
    values.push(plant);
  }

  if (city && city !== 'All') {
    nextQuery += ` AND p.ort01 ILIKE $${nextParamCount++}`;
    values.push(`%${city}%`);
  }

  return { query: nextQuery, paramCount: nextParamCount };
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
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
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

    let year, month, day;

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
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  const monthMatch = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/i);
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (!monthMatch) return null;
  const month = monthMap[monthMatch[1].toLowerCase()];
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  return { month, year };
}

function findExplicitPlantMention(text, plantNames) {
  if (!text) return null;
  const lowerText = String(text).toLowerCase();
  // Sort longest-first so a specific name (e.g. "ANGUL POWER Plant Unit5(135MW)")
  // wins over a shorter generic name (e.g. "Power Plant").
  // Minimum length of 14 skips ultra-generic names ("Plant", "Power Plant").
  const sorted = [...plantNames].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (name.length < 14) continue;
    if (lowerText.includes(name.toLowerCase())) return name;
  }
  return null;
}

function referencesPreviousSubject(question) {
  return /\b(it|that|this|those|same\s+(plant|one|region|city))\b/i.test(String(question || ''));
}

function updateSessionState(sessionId, message, plantNames, cities, historyItems) {
  if (!sessionId) return null;

  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, { currentPlant: null, currentCity: null, currentDate: null });
  }

  const session = activeSessions.get(sessionId);

  let explicitPlant = findExplicitPlantMention(message, plantNames);

  if (!explicitPlant && historyItems) {
    for (let i = historyItems.length - 1; i >= 0; i -= 1) {
      const text = historyItems[i]?.content || historyItems[i]?.text || '';
      explicitPlant = findExplicitPlantMention(text, plantNames);
      if (explicitPlant) break;
    }
  }

  if (explicitPlant) {
    session.currentPlant = explicitPlant;
    session.currentCity = null;
  }

  let explicitCity = identityMatch(message, cities);
  if (!explicitCity && historyItems) {
    for (let i = historyItems.length - 1; i >= 0; i -= 1) {
      const text = historyItems[i]?.content || historyItems[i]?.text || '';
      explicitCity = identityMatch(text, cities);
      if (explicitCity) break;
    }
  }

  if (explicitCity && !explicitPlant) {
    session.currentCity = explicitCity;
    session.currentPlant = null;
  }

  const explicitDate = extractRequestedDate(message);
  if (explicitDate) {
    session.currentDate = explicitDate;
  }

  return session;
}

function resolveContextFromSession(message, session) {
  if (!session) return { plant: null, city: null, source: 'none' };

  const isReferencingPrevious = referencesPreviousSubject(message);

  if (isReferencingPrevious) {
    return {
      plant: session.currentPlant,
      city: session.currentCity,
      source: 'session_reference'
    };
  }

  return {
    plant: session.currentPlant,
    city: session.currentCity,
    source: session.currentPlant || session.currentCity ? 'current_state' : 'none'
  };
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function findClosestPlants(name, plantNames, limit = 3) {
  const target = normalizeText(name);
  return [...plantNames]
    .filter(Boolean)
    .map((candidate) => ({ candidate, distance: levenshtein(target, normalizeText(candidate)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((entry) => entry.candidate);
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
  return /\b(plant|plants|generation|generated|production|produced|consumption|consumed|use|used|region|location|city|power|quantity|kwh|material|movement|movement type|date|month|year|trend|compare|comparison|volume|metric|capacity|forecast|load|top|highest|lowest|most|least|it|that|this)\b/.test(lower);
}

function detectChartIntent(question) {
  const lower = String(question || '').toLowerCase();
  return /trend|history|compare|comparison|visual|chart|graph|plot|show.*trend|versus|\svs\s|bar|candlestick|ohlc|pareto|gauge|histogram|distribution|waterfall|pie|breakdown|share|percent/.test(lower);
}

function getRequestedChartType(question) {
  const lower = String(question || '').toLowerCase();
  if (/candlestick|ohlc/.test(lower)) return 'candlestick';
  if (/pareto/.test(lower)) return 'pareto';
  if (/gauge|meter|target|utili[sz]ation|ratio/.test(lower)) return 'gauge';
  if (/histogram|frequency|bucket/.test(lower)) return 'histogram';
  if (/waterfall|bridge|variance|walk/.test(lower)) return 'waterfall';
  if (/\bbar\b|bar chart/.test(lower)) return 'bar';
  if (/breakdown|distribution|share|pie|percent/.test(lower)) return 'pie';
  if (/trend|history|over time/.test(lower)) return 'line';
  return null;
}

function getSeriesTotals(rows) {
  return rows.reduce((acc, row) => {
    if (['101', '102'].includes(row.movementType)) acc.generation += row.quantity;
    if (['261', '262'].includes(row.movementType)) acc.consumption += row.quantity;
    return acc;
  }, { generation: 0, consumption: 0 });
}

function groupTotalsByDate(rows) {
  const grouped = rows.reduce((acc, row) => {
    if (!acc[row.date]) acc[row.date] = { generation: 0, consumption: 0, total: 0 };
    if (['101', '102'].includes(row.movementType)) acc[row.date].generation += row.quantity;
    if (['261', '262'].includes(row.movementType)) acc[row.date].consumption += row.quantity;
    acc[row.date].total += row.quantity;
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort();
  return { grouped, sortedDates };
}

function getTopGroupedTotals(rows, groupKey = 'plant', limit = 10) {
  const grouped = {};
  rows.forEach((row) => {
    const key = groupKey === 'city'
      ? (row.city || 'Unknown')
      : (row.plantName || row.city || row.senderPlantKey || 'Unknown');
    grouped[key] = (grouped[key] || 0) + row.quantity;
  });
  return Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function shortenLabel(value, max = 18) {
  const text = String(value || 'Unknown');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function buildChartResponse(question, resolvedPlant, resolvedCity) {
  const lower = question.toLowerCase();
  const exactDate = extractRequestedDate(question);
  const monthYear = parseMonthYear(question);
  const requestedChartType = getRequestedChartType(question);

  let query = `
    SELECT 
      f.posting_date_key::text as date, 
      f.movement_type::text as "movementType", 
      f.quantity, 
      p.name1 as "plantName", 
      p.ort01 as city, 
      f.sender_plant_key as "senderPlantKey"
    FROM fact_quality_material_movement f
    LEFT JOIN plant_master p ON f.sender_plant_key = p.werks
    WHERE 1=1
  `;
  const values = [];
  let paramCount = 1;

  if (resolvedPlant) {
    query += ` AND p.name1 = $${paramCount++}`;
    values.push(resolvedPlant);
  } else if (resolvedCity) {
    query += ` AND p.ort01 ILIKE $${paramCount++}`;
    values.push(`%${resolvedCity}%`);
  }

  if (exactDate) {
    query += ` AND f.posting_date_key::text = $${paramCount++}`;
    values.push(exactDate);
  }

  if (monthYear) {
    const yearStr = monthYear.year !== null ? String(monthYear.year) : '__';
    const monthStr = String(monthYear.month + 1).padStart(2, '0');
    const likePattern = monthYear.year !== null ? `${yearStr}${monthStr}%` : `____${monthStr}%`;
    query += ` AND f.posting_date_key::text LIKE $${paramCount++}`;
    values.push(likePattern);
  }

  const wantGen = /generation|generated|produced|output/i.test(lower);
  const wantCon = /consumption|consumed|used/i.test(lower);
  const wantBoth = /compare|comparison|vs|versus/i.test(lower) || /generation.*consumption|consumption.*generation/i.test(lower);

  // Gauge charts always need BOTH categories pulled from the DB so the max
  // can be sized against real generation/consumption totals. Without this,
  // a single-category query (e.g. "consumption gauge") only ever fetches
  // consumption rows, generation comes back as 0, and the gauge's max ends
  // up equal to its own value — pegging the needle at 100% every time.
  if (requestedChartType === 'gauge') {
    query += ` AND f.movement_type::text IN ('101', '102', '261', '262')`;
  } else if (wantBoth) {
    query += ` AND f.movement_type::text IN ('101', '102', '261', '262')`;
  } else if (wantGen && !wantCon) {
    query += ` AND f.movement_type::text IN ('101', '102')`;
  } else if (wantCon && !wantGen) {
    query += ` AND f.movement_type::text IN ('261', '262')`;
  }

  const { rows } = await pool.query(query, values);
  const filtered = rows.map(rowToDashboardRecord);

  if (!filtered.length) {
    return null;
  }

  const chart = {
    type: 'chart',
    title: '',
    subtitle: '',
    chartType: 'line',
    data: null,
    table: null,
    plant: resolvedPlant || null,
  };

  const { grouped: groupByDate, sortedDates } = groupTotalsByDate(filtered);
  const labels = sortedDates.map((date) => formatReadableDate(date));
  const generationSeries = sortedDates.map((date) => groupByDate[date].generation);
  const consumptionSeries = sortedDates.map((date) => groupByDate[date].consumption);

  const subjectLabel = resolvedPlant || resolvedCity || null;
  const groupLabel = resolvedCity ? 'plant' : 'plant';

  if (requestedChartType === 'candlestick') {
    let previousClose = sortedDates.length ? groupByDate[sortedDates[0]].total : 0;
    const candles = sortedDates.map((date, index) => {
      const close = groupByDate[date].total;
      const open = index === 0 ? 0 : previousClose;
      previousClose = close;
      const high = Math.max(open, close, groupByDate[date].generation, groupByDate[date].consumption);
      const low = Math.min(open, close, groupByDate[date].generation, groupByDate[date].consumption);
      return { open, high, low, close };
    });
    chart.chartType = 'candlestick';
    chart.title = `Candlestick Volume${subjectLabel ? ` for ${subjectLabel}` : ''}`;
    chart.subtitle = 'Daily open, high, low, close from grouped PostgreSQL totals';
    chart.data = { labels, datasets: [{ label: 'Volume', data: candles, color: '#2563eb' }] };
    chart.table = {
      headers: ['Date', 'Open', 'High', 'Low', 'Close'],
      rows: sortedDates.map((date, index) => [formatReadableDate(date), candles[index].open, candles[index].high, candles[index].low, candles[index].close]),
    };
    return chart;
  }

  if (requestedChartType === 'pareto') {
    const sorted = getTopGroupedTotals(filtered, groupLabel, 10);
    const total = sorted.reduce((sum, item) => sum + item[1], 0);
    let runningTotal = 0;
    const cumulative = sorted.map((item) => {
      runningTotal += item[1];
      return total ? Number(((runningTotal / total) * 100).toFixed(1)) : 0;
    });
    chart.chartType = 'pareto';
    chart.title = `Pareto Analysis${subjectLabel ? ` for ${subjectLabel}` : ''}`;
    chart.subtitle = 'Top contributors with cumulative percentage';
    chart.data = {
      labels: sorted.map((item) => shortenLabel(item[0], 14)),
      datasets: [
        { label: 'Volume', data: sorted.map((item) => item[1]), color: '#2563eb', fullLabels: sorted.map((item) => item[0]) },
        { label: 'Cumulative %', data: cumulative, color: '#f59e0b', valueType: 'percent' },
      ],
    };
    chart.table = { headers: ['Plant', 'Total', 'Cumulative %'], rows: sorted.map((item, index) => [item[0], item[1], cumulative[index]]) };
    return chart;
  }

  if (requestedChartType === 'gauge') {
    const totals = getSeriesTotals(filtered);
    const value = wantCon && !wantGen
      ? totals.consumption
      : wantBoth
        ? totals.generation - totals.consumption
        : totals.generation;

    // Reference max is the larger of the two real totals (now both are
    // populated since the query above always includes both categories for
    // gauge charts), with 15% headroom so the arc/needle has visual room to
    // move instead of always reading pegged at 100%.
    const referenceMax = Math.max(totals.generation, totals.consumption, Math.abs(value), 1);
    const max = referenceMax * 1.15;
    

    chart.chartType = 'gauge';
    chart.title = `Gauge${subjectLabel ? ` for ${subjectLabel}` : ''}`;
    chart.subtitle = wantBoth
      ? 'Net generation against highest category total'
      : 'Selected category against generation/consumption peak';
    chart.data = {
      labels: ['Value'],
      datasets: [{ label: wantBoth ? 'Net Difference' : (wantCon ? 'Consumption' : 'Generation'), data: [value], max, color: value >= 0 ? '#10b981' : '#f43f5e' }],
    };
    chart.table = { headers: ['Metric', 'Value'], rows: [['Generation', totals.generation], ['Consumption', totals.consumption], ['Net', totals.generation - totals.consumption]] };
    return chart;
  }
  

  if (requestedChartType === 'histogram') {
    const quantities = filtered.map((row) => row.quantity).filter((value) => Number.isFinite(value));
    if (!quantities.length) {
      return null;
    }
    const min = Math.min(...quantities);
    const max = Math.max(...quantities);
    const bucketCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(quantities.length))));
    const width = Math.max(1, (max - min) / bucketCount);
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const start = min + index * width;
      const end = index === bucketCount - 1 ? max : start + width;
      return { start, end, count: 0 };
    });
    quantities.forEach((value) => {
      const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
      buckets[index].count += 1;
    });
    chart.chartType = 'histogram';
    chart.title = `Quantity Histogram${subjectLabel ? ` for ${subjectLabel}` : ''}`;
    chart.subtitle = 'Frequency distribution of PostgreSQL quantity rows';
    chart.data = {
      labels: buckets.map((bucket) => `${Math.round(bucket.start).toLocaleString()}-${Math.round(bucket.end).toLocaleString()}`),
      datasets: [{ label: 'Rows', data: buckets.map((bucket) => bucket.count), color: '#7c3aed' }],
    };
    chart.table = { headers: ['Range', 'Rows'], rows: buckets.map((bucket) => [`${bucket.start.toFixed(0)}-${bucket.end.toFixed(0)}`, bucket.count]) };
    return chart;
  }

  if (requestedChartType === 'waterfall') {
    const movementTotals = { '101': 0, '102': 0, '261': 0, '262': 0 };
    filtered.forEach((row) => {
      if (Object.prototype.hasOwnProperty.call(movementTotals, row.movementType)) movementTotals[row.movementType] += row.quantity;
    });
    const steps = [
      ['101 Generation', movementTotals['101']],
      ['102 Generation', movementTotals['102']],
      ['261 Consumption', -movementTotals['261']],
      ['262 Consumption', -movementTotals['262']],
    ];
    chart.chartType = 'waterfall';
    chart.title = `Waterfall Bridge${subjectLabel ? ` for ${subjectLabel}` : ''}`;
    chart.subtitle = 'Movement type contribution to net volume';
    chart.data = {
      labels: [...steps.map((step) => step[0]), 'Net'],
      datasets: [{ label: 'kWh', data: [...steps.map((step) => step[1]), steps.reduce((sum, step) => sum + step[1], 0)], color: '#2563eb' }],
    };
    chart.table = { headers: ['Step', 'Delta'], rows: chart.data.labels.map((label, index) => [label, chart.data.datasets[0].data[index]]) };
    return chart;
  }

  if (requestedChartType === 'line' || /trend|history|over time/i.test(lower)) {
    chart.chartType = 'line';
    chart.title = subjectLabel ? `Generation Trend for ${subjectLabel}` : 'Generation vs Consumption Trend';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    chart.subtitle = monthYear ? `${monthYear.year || ''} ${monthYear.month !== undefined ? monthNames[monthYear.month] : ''}`.trim() : 'Trend over time';
    chart.data = { labels, datasets: [] };
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
      rows: sortedDates.map((date) => [formatReadableDate(date), groupByDate[date].generation, groupByDate[date].consumption]),
    };
    return chart;
  }

  if (requestedChartType === 'bar' || /compare|comparison|vs|versus/i.test(lower)) {
    if (subjectLabel) {
      const totals = { generation: 0, consumption: 0 };
      filtered.forEach((row) => {
        if (['101', '102'].includes(row.movementType)) totals.generation += row.quantity;
        if (['261', '262'].includes(row.movementType)) totals.consumption += row.quantity;
      });
      chart.chartType = 'bar';
      chart.title = `Generation vs Consumption for ${subjectLabel}`;
      chart.subtitle = 'Total volume comparison';
      chart.data = {
        labels: ['Generation', 'Consumption'],
        datasets: [{ label: 'kWh', data: [totals.generation, totals.consumption], color: '#3b82f6' }],
      };
      chart.table = {
        headers: ['Metric', 'Value'],
        rows: [['Generation', totals.generation], ['Consumption', totals.consumption]],
      };
      return chart;
    }
    const sorted = getTopGroupedTotals(filtered, groupLabel, 8);
    chart.chartType = 'bar';
    chart.title = 'Top volume comparison';
    chart.subtitle = 'Comparison by plant';
    chart.data = {
      labels: sorted.map((item) => (item[0].length > 16 ? item[0].slice(0, 16) + '...' : item[0])),
      datasets: [{ label: 'kWh', data: sorted.map((item) => item[1]), color: '#3b82f6' }],
    };
    chart.table = { headers: ['Plant', 'Total'], rows: sorted.map((item) => [item[0], item[1]]) };
    return chart;
  }

  if (requestedChartType === 'pie' || /breakdown|distribution|share|pie|percent/i.test(lower)) {
    const categoryTotals = getSeriesTotals(filtered);
    chart.chartType = 'pie';
    chart.title = `Volume Breakdown${subjectLabel ? ` for ${subjectLabel}` : ''}`;
    chart.subtitle = 'Generation vs Consumption share';
    chart.data = {
      labels: ['Generation', 'Consumption'],
      datasets: [{ label: 'Share', data: [categoryTotals.generation, categoryTotals.consumption], colors: ['#10b981', '#f43f5e'] }],
    };
    chart.table = { headers: ['Category', 'Value'], rows: [['Generation', categoryTotals.generation], ['Consumption', categoryTotals.consumption]] };
    return chart;
  }

  chart.chartType = 'line';
  chart.title = subjectLabel ? `Trend for ${subjectLabel}` : 'Generation vs Consumption Trend';
  chart.subtitle = 'Trend over time';
  chart.data = {
    labels,
    datasets: [
      { label: 'Generation', data: generationSeries, color: '#10b981' },
      { label: 'Consumption', data: consumptionSeries, color: '#f43f5e' },
    ],
  };
  chart.table = {
    headers: ['Date', 'Generation', 'Consumption'],
    rows: sortedDates.map((date) => [formatReadableDate(date), groupByDate[date].generation, groupByDate[date].consumption]),
  };
  return chart;
}

function extractMemoryNotes(historyItems = []) {
  const notes = [];
  const seen = new Set();
  (historyItems || [])
    .filter((item) => item && typeof item.content === 'string' && item.content.trim())
    .forEach((item) => {
      const content = item.content.trim();
      const nameMatch = content.match(/(?:my name is|i am|i'm|call me)\s+([a-z][a-z' -]{1,30})/i);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        const key = `name:${name.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          notes.push(`The user's name is ${name}.`);
        }
      }
    });
  return notes;
}

function extractNameFromText(text = '') {
  const match = String(text || '').match(/(?:my name is|i am|i'm|call me)\s+([a-z][a-z' -]{1,30})/i);
  return match ? match[1].trim() : null;
}

function extractStoredName(historyItems = []) {
  const memoryNotes = extractMemoryNotes(historyItems);
  const nameNote = memoryNotes.find((note) => note.startsWith("The user's name is "));
  if (!nameNote) return null;
  return nameNote.replace("The user's name is ", '').replace('.', '').trim();
}

function getDirectMemoryReply(message, historyItems = []) {
  const lower = String(message || '').trim().toLowerCase();
  const currentName = extractNameFromText(message);
  const storedName = currentName || extractStoredName(historyItems);
  if (!storedName) return null;

  if (/^what is my name\??$/i.test(lower) || /^who am i\??$/i.test(lower) || /^what's my name\??$/i.test(lower) || /^what is my name \??$/i.test(lower)) {
    return `Your name is ${storedName}.`;
  }
  if (/^my name is/i.test(lower) || /(?:^|\s)(?:i am|i'm|call me)\s+/i.test(lower)) {
    return `Nice to meet you, ${storedName}.`;
  }
  return null;
}

async function getRelevantRows(question) {
  const normalizedQuestion = question.toLowerCase();
  const requestedDate = extractRequestedDate(question);
  const movementTypes = extractMovementTypeFilter(question);
  const stopWords = new Set(['which', 'what', 'plant', 'plants', 'generated', 'generation', 'power', 'highest', 'lowest', 'top', 'most', 'least', 'on', 'the', 'for', 'at', 'with', 'and', 'was', 'were', 'did', 'from', 'to', 'of', 'a', 'an', 'or', 'in', 'is', 'are', 'show', 'give', 'tell', 'me', 'data', 'rows', 'row', 'trend']);
  const keywordTerms = normalizedQuestion
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  let query = `
    SELECT 
      f.posting_date_key::text as date, 
      f.movement_type::text as "movementType", 
      f.quantity, 
      p.name1 as "plantName", 
      p.ort01 as city, 
      f.material_key as material, 
      f.sender_plant_key as "senderPlantKey"
    FROM fact_quality_material_movement f
    LEFT JOIN plant_master p ON f.sender_plant_key = p.werks
    WHERE 1=1
  `;
  const values = [];
  let paramCount = 1;

  if (requestedDate) {
    query += ` AND f.posting_date_key::text = $${paramCount++}`;
    values.push(requestedDate);
  }

  if (movementTypes.length > 0) {
    query += ` AND f.movement_type::text = ANY($${paramCount++})`;
    values.push(movementTypes);
  }

  // Only apply keyword ILIKE filter when we have no date/movementType filters.
  // If a date or movement type is already specified, keyword matching can
  // accidentally produce zero results (e.g. "generated" is a keyword term that
  // doesn't exist in any text column, yet movement_type is already filtered).
  if (keywordTerms.length > 0 && !requestedDate && movementTypes.length === 0) {
    const conditions = [];
    for (const term of keywordTerms) {
      conditions.push(`
        (p.name1 ILIKE $${paramCount} OR 
         p.ort01 ILIKE $${paramCount} OR 
         f.material_key ILIKE $${paramCount} OR 
         f.sender_plant_key ILIKE $${paramCount})
      `);
      values.push(`%${term}%`);
      paramCount++;
    }
    query += ` AND (${conditions.join(' OR ')})`;
  }

  const isAscending = /lowest|minimum|smallest|least/i.test(normalizedQuestion);
  const isDescending = /highest|maximum|largest|top|most|peak/i.test(normalizedQuestion);

  if (isAscending) {
    query += ` ORDER BY f.quantity ASC`;
  } else if (isDescending) {
    query += ` ORDER BY f.quantity DESC`;
  } else {
    query += ` ORDER BY f.posting_date_key DESC, f.quantity DESC`;
  }

  query += ` LIMIT 8`;

  const { rows } = await pool.query(query, values);
  return rows.map(rowToDashboardRecord);
}

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`Incoming ${req.method} request to ${req.path}`);
  next();
});

app.get('/api/ping', (req, res) => {
  return res.json({ status: 'ok', message: 'Backend is running', uptime: process.uptime() });
});

app.get('/api/filter-options', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT name1 as "plantName", ort01 as city
      FROM plant_master
      WHERE name1 IS NOT NULL OR ort01 IS NOT NULL
      ORDER BY name1 ASC, ort01 ASC
    `);

    res.json({
      plants: [...new Set(rows.map((row) => row.plantName).filter(Boolean))].sort(),
      cities: [...new Set(rows.map((row) => row.city).filter(Boolean))].sort(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const values = [];
    let paramCount = 1;
    let query = `
      SELECT 
        f.posting_date_key::text as date, 
        f.movement_type::text as "movementType", 
        f.quantity, 
        p.name1 as "plantName", 
        p.ort01 as city, 
        f.material_key as material, 
        f.sender_plant_key as "senderPlantKey"
      FROM fact_quality_material_movement f
      LEFT JOIN plant_master p ON f.sender_plant_key = p.werks
      WHERE f.movement_type::text IN ('101', '102', '261', '262')
    `;

    const entityFilterStart = query;
    ({ query, paramCount } = appendEntityFilters(query, values, paramCount, {
      plant: req.query.plant,
      city: req.query.city,
    }));

    let entityWhere = query.replace(entityFilterStart, '');
    const latestDate = await getLatestPostingDate(entityWhere, values);
    const dateRange = req.query.dateRange || 'All';
    const dateFilter = getDateRangeClause(dateRange, latestDate, values, paramCount);
    query += dateFilter.clause;
    paramCount = dateFilter.paramCount;

    query += `
      ORDER BY f.posting_date_key DESC
    `;

    const { rows } = await pool.query(query, values);
    res.json(rows.map(rowToDashboardRecord));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trend', async (req, res) => {
  try {
    const values = [];
    let paramCount = 1;
    let query = `
      SELECT
        f.posting_date_key::text as date,
        SUM(CASE WHEN f.movement_type::text IN ('101', '102') THEN f.quantity ELSE 0 END) as generation,
        SUM(CASE WHEN f.movement_type::text IN ('261', '262') THEN f.quantity ELSE 0 END) as consumption
      FROM fact_quality_material_movement f
      LEFT JOIN plant_master p ON f.sender_plant_key = p.werks
      WHERE f.movement_type::text IN ('101', '102', '261', '262')
    `;

    const entityFilterStart = query;
    ({ query, paramCount } = appendEntityFilters(query, values, paramCount, {
      plant: req.query.plant,
      city: req.query.city,
    }));

    const entityWhere = query.replace(entityFilterStart, '');
    const latestDate = await getLatestPostingDate(entityWhere, values);
    const dateFilter = getDateRangeClause(req.query.dateRange || 'All', latestDate, values, paramCount);
    query += dateFilter.clause;
    paramCount = dateFilter.paramCount;

    query += `
      GROUP BY f.posting_date_key::text
      ORDER BY f.posting_date_key::text ASC
    `;

    const { rows } = await pool.query(query, values);
    const trendRows = rows.map((row) => ({
      date: String(row.date || ''),
      generation: parseFloat(row.generation || 0),
      consumption: parseFloat(row.consumption || 0),
    }));

    res.json(trendRows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const message = req.body?.message ?? req.body?.question ?? '';
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const sessionId = req.body?.sessionId;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    console.log(`\n📝 Chat Request: "${message}"`);

    const generateTitleAsync = async (sessionId, userMessage) => {
      try {
        if (/^(hi|hello|hey|thanks|can you help me\??)$/i.test(userMessage.trim())) {
          return; // Ignore generic greetings
        }
        
        // Ensure message is somewhat meaningful
        if (userMessage.length < 5) return;

        console.log(`🧠 Generating chat title for session: ${sessionId}`);
        const response = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3.2',
            messages: [{
              role: 'user', 
              content: `Generate a concise, 3 to 6 word title summarizing this message. Use sentence case. Do not use quotes or trailing punctuation. Respond ONLY with the title. Message: "${userMessage}"`
            }],
            stream: false,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          let title = data?.message?.content?.trim();
          if (title) {
            // Remove any surrounding quotes just in case
            title = title.replace(/^["']|["']$/g, '');
            // Sentence case
            title = title.charAt(0).toUpperCase() + title.slice(1);
            
            await pool.query('UPDATE chat_sessions SET title = $1 WHERE id = $2', [title, sessionId]);
            console.log(`✅ Title updated to: "${title}"`);
          }
        }
      } catch (e) {
        console.error('❌ Failed to generate chat title:', e.message);
      }
    };

    const saveMessage = async (role, content) => {
      try {
        if (sessionId && req.user && req.user.userId) {
          // Verify session belongs to user
          const sessionCheck = await pool.query('SELECT id, title FROM chat_sessions WHERE id = $1 AND user_id = $2', [sessionId, req.user.userId]);
          if (sessionCheck.rows.length > 0) {
            const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
            await pool.query('INSERT INTO chat_messages (session_id, role, content, created_at) VALUES ($1, $2, $3, NOW())', [sessionId, role, contentStr]);
            await pool.query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);
            
            // If it's a user message and the session title is still the default "New Chat"
            if (role === 'user' && sessionCheck.rows[0].title === 'New Chat') {
              generateTitleAsync(sessionId, typeof content === 'string' ? content : (content.text || ''));
            }
          }
        }
      } catch (e) {
        console.error('Error saving chat message to DB', e);
      }
    };

    // Save the user's incoming message asynchronously
    saveMessage('user', message);

    // Intercept response to save the assistant's reply
    const originalJson = res.json;
    res.json = function (body) {
      if (res.statusCode === 200 && !body.error) {
        saveMessage('assistant', body);
      }
      return originalJson.call(this, body);
    };

    const originalSend = res.send;
    res.send = function (body) {
      if (res.statusCode === 200 && res.get('Content-Type')?.includes('text/plain')) {
        saveMessage('assistant', body);
      }
      return originalSend.call(this, body);
    };

    const normalizeHistoryItems = (historyItems = []) => {
      return (historyItems || [])
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          if (item.role && ['system', 'user', 'assistant'].includes(item.role)) {
            return { role: item.role, content: String(item.content || '').trim() };
          }
          if (item.sender === 'user') {
            return { role: 'user', content: String(item.text || item.content || '').trim() };
          }
          if (item.sender === 'bot' || item.role === 'assistant') {
            return { role: 'assistant', content: String(item.text || item.content || '').trim() };
          }
          return null;
        })
        .filter((item) => item && item.content);
    };

    const isDashboardQuery = detectDashboardQuery(message);
    const wantsChart = detectChartIntent(message);

    if (wantsChart) {
      const normalizedHistory = normalizeHistoryItems(rawMessages.length ? rawMessages : history);

      const session = updateSessionState(sessionId, message, cachedPlantNames, cachedCities, normalizedHistory);
      const { plant: resolvedPlant, city: resolvedCity, source } = resolveContextFromSession(message, session);

      const pronounRef = referencesPreviousSubject(message);
      const explicitInMessage = findExplicitPlantMention(message, cachedPlantNames);

      console.log(`[chart] message="${message}" sessionId="${sessionId}"`);
      console.log(`[chart] resolvedPlant=${resolvedPlant || 'none'} resolvedCity=${resolvedCity || 'none'} source=${source} pronounRef=${pronounRef}`);

      if (pronounRef && !resolvedPlant && !resolvedCity) {
        return res.json({
          type: 'text',
          message: 'Could you please specify which plant or region you are referring to?',
        });
      }

      const mentionsUnknownPlant = !explicitInMessage
        && !pronounRef
        && !resolvedPlant
        && /\b(for|about|named|called)\s+(the\s+)?plant\b|\bplant\s+["']?[a-z0-9]/i.test(message)
        && !/\b(by|per|top|all)\s+plants?\b/i.test(message);
      if (mentionsUnknownPlant) {
        const suggestions = findClosestPlants(message, cachedPlantNames, 3);
        console.log(`[chart] Plant not found. Suggestions: ${suggestions.join(', ')}`);
        return res.json({
          type: 'text',
          message: `Plant not found. Did you mean: ${suggestions.join(', ')}?`,
        });
      }

      const chartResponse = await buildChartResponse(message, resolvedPlant, resolvedCity);
      if (chartResponse) {
        console.log(`✅ Chart generated for plant="${chartResponse.plant || 'ALL PLANTS'}" city="${resolvedCity || 'ALL CITIES'}"`);
        return res.json(chartResponse);
      }

      if (resolvedPlant || resolvedCity) {
        const entity = resolvedPlant || resolvedCity;
        console.log(`⚠️ No chart data available for resolved entity="${entity}"`);
        return res.json({
          type: 'text',
          message: `No chart data available for ${entity} with the current filters.`,
        });
      }
    }

    const buildConversationMessages = (historyItems = [], currentMessage, systemPrompt = '') => {
      const normalizedHistory = normalizeHistoryItems(historyItems).slice(-18);
      const memoryNotes = extractMemoryNotes(normalizedHistory);
      const effectiveSystemPrompt = [systemPrompt, memoryNotes.length ? `Memory notes:\n- ${memoryNotes.join('\n- ')}` : ''].filter(Boolean).join('\n\n');
      const messages = [];
      if (effectiveSystemPrompt) {
        messages.push({ role: 'system', content: effectiveSystemPrompt });
      }

      messages.push(...normalizedHistory);
      if (typeof currentMessage === 'string' && currentMessage.trim()) {
        const latest = normalizedHistory[normalizedHistory.length - 1];
        const currentText = currentMessage.trim();
        const isDuplicate = latest && latest.role === 'user' && latest.content === currentText;
        if (!isDuplicate) {
          messages.push({ role: 'user', content: currentText });
        }
      }

      return messages;
    };

    const callGeneralOllama = async (messages) => {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Ollama request failed:', response.status, errorText);
        throw new Error('Ollama unavailable');
      }

      const data = await response.json();
      const text = typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
      if (!text) {
        console.error('❌ Ollama returned empty response');
        throw new Error('Empty Ollama response');
      }
      return text;
    };

    const directMemoryReply = getDirectMemoryReply(message, rawMessages.length ? rawMessages : history);
    if (directMemoryReply) {
      console.log('🧠 Direct memory reply triggered');
      return res.type('text/plain').send(directMemoryReply);
    }

    if (isDashboardQuery) {
      console.log('🔄 Dashboard query detected; searching PostgreSQL for relevant rows');
      const relevantRows = await getRelevantRows(message);
      if (relevantRows.length) {
        console.log(`   Found ${relevantRows.length} relevant PostgreSQL rows for context`);
        const contextText = relevantRows.map((row, index) => {
          const readableDate = formatReadableDate(row.date);
          return `${index + 1}. Date: ${readableDate} | Movement type: ${row.movementType} | Quantity: ${row.quantity} | Plant: ${row.plantName || 'unknown'} | City: ${row.city || 'unknown'} | Material: ${row.material || 'unknown'}`;
        }).join('\n');

        const systemPrompt = `You are a factual assistant. The conversation messages below are your memory. Treat them as the complete conversation history and use them to answer follow-up questions accurately. Never say you cannot remember previous messages when they are present in the provided history. Keep replies brief, natural, and directly focused on the user's request. Answer ONLY using the PostgreSQL rows provided below. Do not use outside knowledge. If the requested information is not present in the provided rows, reply with the best possible answer based on the data provided.\n\nDatabase rows:\n${contextText}\n\nAnswer in one short sentence.`;
        const conversationMessages = buildConversationMessages(rawMessages.length ? rawMessages : history, message, systemPrompt);

        console.log('   🤖 Calling Ollama for dashboard answer with SQL context');
        const responseText = await callGeneralOllama(conversationMessages);
        console.log('✅ [OLLAMA RESPONSE] Received dashboard answer from Ollama');
        return res.type('text/plain').send(responseText);
      }

      console.log('🔁 No relevant PostgreSQL data found for dashboard query; falling back to general Ollama knowledge');
    }

    console.log('🔄 Delegating to Ollama for general knowledge response');
    const generalSystemPrompt = 'You are a helpful assistant. The conversation messages below are your memory. Treat them as the complete conversation history and use them to answer follow-up questions accurately and concisely. Never say you cannot remember previous messages when they are present in the provided history. Keep replies brief, natural, and directly focused on the user ask.';
    const generalMessages = buildConversationMessages(rawMessages.length ? rawMessages : history, message, generalSystemPrompt);
    const generalText = await callGeneralOllama(generalMessages);
    console.log('✅ [OLLAMA RESPONSE] Received general answer from Ollama');
    return res.type('text/plain').send(generalText);
  } catch (error) {
    console.error('❌ Chat handler failure:', error.message);
    return res.status(503).json({ error: 'Ollama is not available. Please make sure Ollama is running.' });
  }
});

// --- Authentication Middleware ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied, token missing' });

  jwt.verify(token, process.env.JWT_SECRET || 'secret123', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user; // Has userId
    next();
  });
}

// --- Chat Session Routes ---

// Get all sessions for the authenticated user
app.get('/api/chat/sessions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({ error: 'Server error fetching chat sessions' });
  }
});

// Create a new session
app.post('/api/chat/sessions', authenticateToken, async (req, res) => {
  try {
    const { title } = req.body;
    const result = await pool.query(
      'INSERT INTO chat_sessions (user_id, title, updated_at) VALUES ($1, $2, NOW()) RETURNING *',
      [req.user.userId, title || 'New Chat']
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({ error: 'Server error creating chat session' });
  }
});

// Get messages for a session
app.get('/api/chat/sessions/:id', authenticateToken, async (req, res) => {
  try {
    // First, verify the session belongs to the user
    const sessionCheck = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await pool.query(
      'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: 'Server error fetching chat messages' });
  }
});

// Delete a session (and its messages)
app.delete('/api/chat/sessions/:id', authenticateToken, async (req, res) => {
  try {
    // Verify the session belongs to the user before deleting anything
    const sessionCheck = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete messages first (in case there's no ON DELETE CASCADE on the FK)
    await pool.query('DELETE FROM chat_messages WHERE session_id = $1', [req.params.id]);

    // Then delete the session itself
    await pool.query('DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.userId,
    ]);

    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    res.status(500).json({ error: 'Server error deleting chat session' });
  }
});

// --- Authentication Routes ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const newUser = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, provider) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, hashedPassword, 'local']
    );
    const user = newUser.rows[0];

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.full_name, email: user.email } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const user = userResult.rows[0];

    if (!user.password_hash) {
      return res.status(400).json({ error: 'Please login using Google' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.full_name, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    // For local testing without a real client ID, we can optionally bypass verification
    // if the token is a dummy token. But ideally we verify it.
    let payload;
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== '908493608865-86vpn3vdr2ap3puh948vuch10sn9mkuo') {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else {
      // Mock payload for testing without setting up Google Client ID
      payload = {
        sub: '1234567890',
        email: 'mockuser@example.com',
        name: 'Mock Google User'
      };
    }

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [payload.email]);
    let user;
    if (userResult.rows.length === 0) {
      const newUser = await pool.query(
        'INSERT INTO users (full_name, email, google_id, provider) VALUES ($1, $2, $3, $4) RETURNING *',
        [payload.name, payload.email, payload.sub, 'google']
      );
      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
      if (!user.google_id) {
        const updatedUser = await pool.query(
          'UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *',
          [payload.sub, user.id]
        );
        user = updatedUser.rows[0];
      }
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.full_name, email: user.email } });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

initDbCache().then(() => {
  app.listen(PORT, () => console.log(`Backend running on port ${PORT} connected to PostgreSQL`));
}).catch(console.error);