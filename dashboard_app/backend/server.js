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
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "power_dashboard",
  password: process.env.DB_PASSWORD || "sibtain@2006",
  port: process.env.DB_PORT || 5433,
});
console.log({
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME,
});

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

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

// Parses a date mention from the user's message. Supports:
//   - "today" / "yesterday"
//   - Full formats: "17 June 2026", "June 17, 2026", "2026-06-17"
//   - Year-omitted formats: "17th June", "17 June", "June 17"
//     → when the year is missing, returns a special object { day, month }
//     so the caller can look up the actual available year in the DB.
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

  // Patterns that include an explicit year — handled first so they take priority.
  const fullPatterns = [
    { re: /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/, parse: (m) => ({ year: +m[1], month: +m[2] - 1, day: +m[3] }) },
    {
      re: /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
      parse: (m) => ({ day: +m[1], month: monthMap[m[2].toLowerCase()], year: +m[3] })
    },
    {
      re: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})/i,
      parse: (m) => ({ month: monthMap[m[1].toLowerCase()], day: +m[2], year: +m[3] })
    },
    { re: /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/, parse: (m) => ({ month: +m[1] - 1, day: +m[2], year: +m[3] }) },
  ];

  for (const { re, parse } of fullPatterns) {
    const m = question.match(re);
    if (!m) continue;
    const { year, month, day } = parse(m);
    if ([year, month, day].some(Number.isNaN)) continue;
    return formatDateYYYYMMDD(new Date(Date.UTC(year, month, day)));
  }

  // Year-omitted patterns — return a sentinel object so the caller can
  // infer the year from the DB (the year that actually has data for that day).
  const partialPatterns = [
    {
      re: /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,
      parse: (m) => ({ day: +m[1], month: monthMap[m[2].toLowerCase()] })
    },
    {
      re: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i,
      parse: (m) => ({ month: monthMap[m[1].toLowerCase()], day: +m[2] })
    },
  ];

  for (const { re, parse } of partialPatterns) {
    const m = question.match(re);
    if (!m) continue;
    const { month, day } = parse(m);
    if ([month, day].some((v) => v === undefined || Number.isNaN(v))) continue;
    // Return sentinel so the caller resolves the year asynchronously.
    return { partialMonth: month, partialDay: day };
  }

  return null;
}

// Resolves a partial date (month + day, no year) to a full YYYYMMDD string
// by querying the DB for the most recent year that actually has data for
// that month/day combination. Falls back to the current year if nothing found.
async function resolvePartialDate(partialMonth, partialDay) {
  const monthStr = String(partialMonth + 1).padStart(2, '0');
  const dayStr = String(partialDay).padStart(2, '0');
  const pattern = `____${monthStr}${dayStr}`;
  try {
    const { rows } = await pool.query(
      `SELECT MAX(posting_date_key::text) AS d FROM fact_quality_material_movement WHERE posting_date_key::text LIKE $1`,
      [pattern]
    );
    if (rows[0]?.d) return String(rows[0].d);
  } catch (_) { /* fall through */ }
  // If nothing in DB, use current calendar year as best guess.
  const year = new Date().getFullYear();
  return `${year}${monthStr}${dayStr}`;
}

function extractMovementTypeFilter(question) {
  const lower = question.toLowerCase();
  const wantGen = /generation|generated|produced|output/i.test(lower);
  const wantCon = /consumption|consumed|used/i.test(lower);

  const abstractNet = (!wantGen && !wantCon) && /efficient|efficiency|perform|performing|best|worst/i.test(lower);
  const wantBoth = /compare|comparison|vs|versus|net|both/i.test(lower) || (wantGen && wantCon) || abstractNet;

  if (wantBoth) return ['101', '102', '261', '262'];
  if (wantGen) return ['101', '102'];
  if (wantCon) return ['261', '262'];
  return [];
}

// Parses a month (+ optional year) mention. When the year is omitted,
// returns year=null — callers should query all years matching that month
// unless they can infer the year from context (e.g. the latest available).
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
  return { month, year, yearInferred: !yearMatch };
}

function findExplicitPlantMention(text, plantNames) {
  if (!text) return null;
  const lowerText = String(text).toLowerCase();
  const sorted = [...plantNames].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const core = coreMatchTokens(name);
    if (!core || core.length < 2) continue; // Skip generic names that have no unique tokens
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
    activeSessions.set(sessionId, {
      currentPlant: null,
      currentCity: null,
      currentDate: null,
      lastAggregateMetric: null, // 'generation' | 'consumption' | 'both'
    });
  }

  const session = activeSessions.get(sessionId);

  let explicitPlant = findExplicitPlantMention(message, plantNames);

  const isFollowUp = referencesPreviousSubject(message);

  if (!explicitPlant && historyItems && isFollowUp) {
    for (let i = historyItems.length - 1; i >= 0; i -= 1) {
      const text = historyItems[i]?.content || historyItems[i]?.text || '';
      explicitPlant = findExplicitPlantMention(text, plantNames);
      if (explicitPlant) break;
    }
  }

  if (explicitPlant) {
    session.currentPlant = explicitPlant;
    session.currentCity = null;
  } else if (!isFollowUp) {
    // User didn't specify a plant and didn't use a pronoun, so clear context.
    session.currentPlant = null;
  }

  let explicitCity = identityMatch(message, cities);
  if (!explicitCity && historyItems && isFollowUp) {
    for (let i = historyItems.length - 1; i >= 0; i -= 1) {
      const text = historyItems[i]?.content || historyItems[i]?.text || '';
      explicitCity = identityMatch(text, cities);
      if (explicitCity) break;
    }
  }

  if (explicitCity && !explicitPlant) {
    session.currentCity = explicitCity;
    session.currentPlant = null;
  } else if (!explicitCity && !explicitPlant && !isFollowUp) {
    session.currentCity = null;
  }

  const explicitDate = extractRequestedDate(message);
  if (explicitDate) {
    session.currentDate = explicitDate;
  } else if (!isFollowUp) {
    session.currentDate = null;
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

// Returns true for genuine small-talk / greetings that should NEVER touch the DB.
function isGreeting(question) {
  const lower = String(question || '').toLowerCase().trim();
  return /^(hi|hello|hey|greetings|good morning|good afternoon|good evening|how are you|who are you|what are you|tell me about yourself|your name|where are you from|what is ai|what is artificial intelligence|define ai|define artificial intelligence|what is machine learning|help me|thanks|thank you|bye|goodbye)[.!?]?$/.test(lower);
}

function detectDashboardQuery(question) {
  const lower = String(question || '').toLowerCase();
  if (isGreeting(question)) return false;
  return /\b(plant|plants|generation|generated|production|produced|consumption|consumed|use|used|region|location|city|power|quantity|kwh|material|movement|movement type|date|month|year|trend|compare|comparison|volume|metric|capacity|forecast|load|top|highest|lowest|most|least|best|worst|efficient|efficiency|perform|performing|it|that|this|dashboard|data|database|report|analysis|analytics|how much|what is the|tell me about|show me|give me|list|summary|net)\b/.test(lower);
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
    const signedQuantity = getSignedQuantity(row);
    if (['101', '102'].includes(row.movementType)) acc.generation += signedQuantity;
    if (['261', '262'].includes(row.movementType)) acc.consumption += signedQuantity;
    return acc;
  }, { generation: 0, consumption: 0 });
}

function groupTotalsByDate(rows) {
  const grouped = rows.reduce((acc, row) => {
    if (!acc[row.date]) acc[row.date] = { generation: 0, consumption: 0, total: 0 };
    const signedQuantity = getSignedQuantity(row);
    if (['101', '102'].includes(row.movementType)) acc[row.date].generation += signedQuantity;
    if (['261', '262'].includes(row.movementType)) acc[row.date].consumption += signedQuantity;
    acc[row.date].total += signedQuantity;
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
    grouped[key] = (grouped[key] || 0) + getSignedQuantity(row);
  });
  return Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

// Movement-type sign convention used across every dashboard calculation:
//   - codes ending in "1" (101, 261, ...) ADD to their respective total
//   - codes ending in "2" (102, 262, ...) SUBTRACT from their respective total
function getMovementSign(movementType) {
  const code = String(movementType || '');
  if (code.endsWith('1')) return 1;
  if (code.endsWith('2')) return -1;
  return 0;
}

function getSignedQuantity(row) {
  return getMovementSign(row.movementType) * (Number(row.quantity) || 0);
}

// Words to ignore when comparing a user's question against DB plant names —
// applied to BOTH sides so only the distinguishing tokens (capacity figures,
// unit identifiers like "SBPP-2") are compared. Without this, a question
// like "total generation of 2 X 525 MW Power Plant" fails to match because
// the raw question text (with "total generation of" etc.) is never a
// substring of the DB name and vice versa.
const PLANT_MATCH_STOPWORDS = new Set([
  'total', 'sum', 'overall', 'cumulative', 'aggregate', 'net',
  'generation', 'generated', 'production', 'produced',
  'consumption', 'consumed', 'quantity', 'volume', 'output', 'kwh',
  'of', 'for', 'the', 'a', 'an', 'is', 'was', 'were', 'what',
  'show', 'give', 'tell', 'me', 'please', 'and', 'in', 'on', 'at', 'to',
  'plant', 'plants', 'power', 'mw',
]);

function coreMatchTokens(text) {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token && !PLANT_MATCH_STOPWORDS.has(token))
    .join(' ');
}

function findMatchingPlantNames(text, plantNames, { minLength = 3, maxMatches = 8 } = {}) {
  const queryCore = coreMatchTokens(text);
  if (!queryCore || queryCore.length < minLength) return [];

  return plantNames.filter(Boolean).filter((name) => {
    const nameCore = coreMatchTokens(name);
    if (!nameCore) return false;
    // Bidirectional: covers both "user typed the full specific unit name"
    // (queryCore contains nameCore) and "user typed a generic capacity
    // label that matches one or more specific units" (nameCore contains
    // queryCore, e.g. "2 X 525 MW Power Plant" matching both SBPP-1 and
    // SBPP-2 units that share that rated capacity).
    return queryCore.includes(nameCore) || nameCore.includes(queryCore);
  }).slice(0, maxMatches + 1); // +1 lets the caller detect "too many matches"
}

function detectAggregateQuery(question) {
  const lower = String(question || '').toLowerCase();
  const hasAggregateWord = /\b(total|sum|overall|cumulative|aggregate|grand total|net)\b/.test(lower);
  const hasMetricWord = /\b(generation|generated|production|produced|consumption|consumed|quantity|volume|output|kwh)\b/.test(lower);
  const isRanking = /highest|maximum|largest|top|most|peak|lowest|minimum|smallest|least|best|worst/i.test(lower);
  return hasAggregateWord && hasMetricWord && !isRanking;
}

// A global ranking query is one that asks to rank/compare plants or regions
// without specifying a particular plant. These must always search all records.
function detectRankingQuery(question) {
  const lower = String(question || '').toLowerCase();
  const hasRankingWord = /\b(highest|maximum|largest|top|most|peak|lowest|minimum|smallest|least|best|worst|rank|ranking|ranked)\b/i.test(lower);
  const hasEntityWord = /\b(plant|plants|region|regions|city|cities|location|locations|facility|facilities|who|which)\b/i.test(lower);
  const hasMetric = /\b(generation|generated|production|produced|consumption|consumed|power|quantity|volume|output|kwh|net|perform|efficient)\b/i.test(lower);
  const hasExplicitRankCount = /\btop\s+\d+\b/i.test(lower);
  return hasRankingWord && (hasEntityWord || hasExplicitRankCount) && hasMetric;
}

// Computes a total/sum answer directly from PostgreSQL — no LLM arithmetic
// involved. LLMs are unreliable at summing many large numbers, and the
// chatbot's general dashboard-query path only samples a handful of rows,
// so "total generation of X" questions must never be answered by asking
// Ollama to add numbers itself.
async function buildAggregateAnswer(question, resolvedPlant, resolvedCity, matchedPlantNames, session) {
  const lower = question.toLowerCase();
  // Resolve partial dates (e.g. "17th June" with no year) via DB lookup.
  const rawDate = extractRequestedDate(question);
  let exactDate = null;
  if (rawDate && typeof rawDate === 'string') {
    exactDate = rawDate;
  } else if (rawDate && typeof rawDate === 'object' && rawDate.partialMonth !== undefined) {
    exactDate = await resolvePartialDate(rawDate.partialMonth, rawDate.partialDay);
  }
  const monthYear = parseMonthYear(question);

  let query = `
    SELECT
      f.posting_date_key::text as date,
      f.movement_type::text as "movementType",
      f.quantity,
      p.name1 as "plantName",
      p.ort01 as city
    FROM fact_quality_material_movement f
    LEFT JOIN plant_master p ON f.sender_plant_key = p.werks
    WHERE 1=1
  `;
  const values = [];
  let paramCount = 1;

  if (matchedPlantNames && matchedPlantNames.length > 1) {
    query += ` AND p.name1 = ANY($${paramCount++})`;
    values.push(matchedPlantNames);
  } else if (resolvedPlant) {
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

  const wantGenExplicit = /generation|generated|produced|output/i.test(lower);
  const wantConExplicit = /consumption|consumed|used/i.test(lower);
  const abstractNet = (!wantGenExplicit && !wantConExplicit) && /efficient|efficiency|perform|performing|best|worst/i.test(lower);
  const wantBothExplicit = /compare|comparison|vs|versus|net|both/i.test(lower) || (wantGenExplicit && wantConExplicit) || abstractNet;

  let wantGen = wantGenExplicit;
  let wantCon = wantConExplicit;
  let wantBoth = wantBothExplicit;

  // Follow-up message me metric word missing hai (e.g. "and of this Plant X?")
  // — pichli turn ka metric session se reuse karo
  if (!wantGenExplicit && !wantConExplicit && session?.lastAggregateMetric) {
    wantGen = session.lastAggregateMetric === 'generation';
    wantCon = session.lastAggregateMetric === 'consumption';
    wantBoth = session.lastAggregateMetric === 'both';
  }

  if (wantBoth) {
    query += ` AND f.movement_type::text IN ('101', '102', '261', '262')`;
  } else if (wantCon && !wantGen) {
    query += ` AND f.movement_type::text IN ('261', '262')`;
  } else {
    // Default to generation when metric isn't explicit or resolvable
    query += ` AND f.movement_type::text IN ('101', '102')`;
  }

  const { rows } = await pool.query(query, values);
  const filtered = rows.map(rowToDashboardRecord);

  if (!filtered.length) {
    return null;
  }

  const totals = getSeriesTotals(filtered);
  const subjectLabel = (matchedPlantNames && matchedPlantNames.length > 1)
    ? `the ${matchedPlantNames.length} matching plants (${matchedPlantNames.join(', ')})`
    : (resolvedPlant || resolvedCity || 'all plants');

  const formatNumber = (value) => Math.round(value).toLocaleString();

  // Is turn ka resolved metric agli follow-up ke liye session me save karo
  if (session) {
    session.lastAggregateMetric = wantBoth ? 'both' : (wantCon && !wantGen ? 'consumption' : 'generation');
  }

  if (wantBoth) {
    return `For ${subjectLabel}, total generation is ${formatNumber(totals.generation)} kWh, total consumption is ${formatNumber(totals.consumption)} kWh, and the net difference is ${formatNumber(totals.generation - totals.consumption)} kWh.`;
  }
  if (wantCon && !wantGen) {
    return `The total consumption for ${subjectLabel} is ${formatNumber(totals.consumption)} kWh.`;
  }
  return `The total generation for ${subjectLabel} is ${formatNumber(totals.generation)} kWh.`;
}

function shortenLabel(value, max = 18) {
  const text = String(value || 'Unknown');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function buildChartResponse(question, resolvedPlant, resolvedCity) {
  const lower = question.toLowerCase();
  // Resolve partial dates (e.g. "17th June" with no year) via DB lookup.
  const rawDate = extractRequestedDate(question);
  let exactDate = null;
  if (rawDate && typeof rawDate === 'string') {
    exactDate = rawDate;
  } else if (rawDate && typeof rawDate === 'object' && rawDate.partialMonth !== undefined) {
    exactDate = await resolvePartialDate(rawDate.partialMonth, rawDate.partialDay);
  }
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
  const abstractNet = (!wantGen && !wantCon) && /efficient|efficiency|perform|performing|best|worst/i.test(lower);
  const wantBoth = /compare|comparison|vs|versus|net|both/i.test(lower) || (wantGen && wantCon) || abstractNet;

  // Gauge charts always need BOTH categories pulled from the DB so the max
  // can be sized against real generation/consumption totals. Without this,
  // a single-category query (e.g. "consumption gauge") only ever fetches
  // consumption rows, generation comes back as 0, and the gauge's max ends
  // up equal to its own value — pegging the needle at 100% every time.
  if (requestedChartType === 'gauge' || wantBoth) {
    query += ` AND f.movement_type::text IN ('101', '102', '261', '262')`;
  } else if (wantGen) {
    query += ` AND f.movement_type::text IN ('101', '102')`;
  } else if (wantCon) {
    query += ` AND f.movement_type::text IN ('261', '262')`;
  } else {
    // Default to generation when metric isn't explicit or resolvable
    query += ` AND f.movement_type::text IN ('101', '102')`;
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
    const referenceMax = Math.max(Math.abs(totals.generation), Math.abs(totals.consumption), Math.abs(value), 1);
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
    // 101/261 add to their respective total, 102/262 subtract — the bridge
    // steps below are signed accordingly so they sum to the correct Net.
    const steps = [
      ['101 Generation', movementTotals['101']],
      ['102 Generation (Reversal)', -movementTotals['102']],
      ['261 Consumption', -movementTotals['261']],
      ['262 Consumption (Reversal)', movementTotals['262']],
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
        const signedQuantity = getSignedQuantity(row);
        if (['101', '102'].includes(row.movementType)) totals.generation += signedQuantity;
        if (['261', '262'].includes(row.movementType)) totals.consumption += signedQuantity;
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

const NAME_REGEX = /(?:my name is|i am|i'm|call me)\s+([A-Za-z][A-Za-z'-]{1,15}(?:\s+[A-Za-z][A-Za-z'-]{1,15})?)(?:\b|$|[.!?])/i;
const INVALID_NAME_WORDS = ['asking', 'looking', 'wondering', 'trying', 'going', 'wanting', 'a', 'the', 'some', 'any', 'which', 'what', 'how', 'why', 'who', 'where', 'when', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around', 'among'];

function isValidName(name) {
  const lowerName = name.toLowerCase();
  return !INVALID_NAME_WORDS.some(w => lowerName.startsWith(w + ' ') || lowerName === w);
}

function extractMemoryNotes(historyItems = []) {
  const notes = [];
  const seen = new Set();
  (historyItems || [])
    .filter((item) => item && typeof item.content === 'string' && item.content.trim())
    .forEach((item) => {
      const content = item.content.trim();
      const nameMatch = content.match(NAME_REGEX);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        if (isValidName(name)) {
          const key = `name:${name.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            notes.push(`The user's name is ${name}.`);
          }
        }
      }
    });
  return notes;
}

function extractNameFromText(text = '') {
  const match = String(text || '').match(NAME_REGEX);
  if (!match) return null;
  const name = match[1].trim();
  return isValidName(name) ? name : null;
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

// Returns a small set of representative rows for Ollama context.
// For "highest / lowest" questions, aggregates by plant first so
// rankings are consistent and never based on a single raw transaction row.
async function getRelevantRows(question, resolvedPlant, resolvedCity) {
  const normalizedQuestion = question.toLowerCase();
  const movementTypes = extractMovementTypeFilter(question);

  // Resolve the date (including year-inferred partial dates)
  let rawDate = extractRequestedDate(question);
  let requestedDate = null;
  if (rawDate && typeof rawDate === 'string') {
    requestedDate = rawDate;
  } else if (rawDate && typeof rawDate === 'object' && rawDate.partialMonth !== undefined) {
    requestedDate = await resolvePartialDate(rawDate.partialMonth, rawDate.partialDay);
  }

  const isRankingQuery = /highest|maximum|largest|top|most|peak|lowest|minimum|smallest|least|best|worst/i.test(normalizedQuestion);

  // For ranking queries, aggregate totals by plant and sort — this guarantees
  // consistent rankings (the same query always returns the same plant on top)
  // because it sums ALL matching rows per plant, not just a single raw row.
  if (isRankingQuery) {
    const isAscending = /lowest|minimum|smallest|least|worst/i.test(normalizedQuestion);
    let aggQuery = `
      SELECT
        p.name1 AS "plantName",
        p.ort01 AS city,
        SUM(CASE WHEN f.movement_type::text = '101' THEN f.quantity
                 WHEN f.movement_type::text = '102' THEN -f.quantity ELSE 0 END) AS generation,
        SUM(CASE WHEN f.movement_type::text = '261' THEN f.quantity
                 WHEN f.movement_type::text = '262' THEN -f.quantity ELSE 0 END) AS consumption
      FROM fact_quality_material_movement f
      LEFT JOIN plant_master p ON f.sender_plant_key = p.werks
      WHERE f.movement_type::text IN ('101', '102', '261', '262')
    `;
    const aggValues = [];
    let aggParam = 1;

    if (requestedDate) {
      aggQuery += ` AND f.posting_date_key::text = $${aggParam++}`;
      aggValues.push(requestedDate);
    }
    if (movementTypes.length > 0) {
      aggQuery += ` AND f.movement_type::text = ANY($${aggParam++})`;
      aggValues.push(movementTypes);
    }
    if (resolvedPlant) {
      aggQuery += ` AND p.name1 = $${aggParam++}`;
      aggValues.push(resolvedPlant);
    } else if (resolvedCity) {
      aggQuery += ` AND p.ort01 ILIKE $${aggParam++}`;
      aggValues.push(`%${resolvedCity}%`);
    }

    const wantGen = /generation|generated|produced|output/i.test(normalizedQuestion);
    const wantCon = /consumption|consumed|used/i.test(normalizedQuestion);
    const abstractNet = (!wantGen && !wantCon) && /efficient|efficiency|perform|performing|best|worst/i.test(normalizedQuestion);
    const wantBoth = /compare|comparison|vs|versus|net|both/i.test(normalizedQuestion) || (wantGen && wantCon) || abstractNet;

    let sortCol = '3'; // Default to generation (3rd column)
    if (wantBoth) {
      sortCol = '(3 - 4)'; // generation - consumption
    } else if (wantCon) {
      sortCol = '4';       // consumption
    }

    aggQuery += ` GROUP BY p.name1, p.ort01 HAVING (SUM(f.quantity) > 0) ORDER BY ${sortCol} ${isAscending ? 'ASC' : 'DESC'} LIMIT 8`;

    const { rows } = await pool.query(aggQuery, aggValues);
    // Shape results so downstream Ollama prompt can read them naturally.
    return rows.map((r, i) => ({
      date: requestedDate || 'all dates',
      movementType: wantBoth ? 'net' : (wantCon ? '261' : '101'),
      quantity: wantBoth ? (parseFloat(r.generation || 0) - parseFloat(r.consumption || 0)) : (wantCon ? parseFloat(r.consumption || 0) : parseFloat(r.generation || 0)),
      plantName: r.plantName || 'unknown',
      city: r.city || 'unknown',
      material: '',
      senderPlantKey: '',
      rank: i + 1,
    }));
  }

  // Non-ranking query — fetch recent representative rows.
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

  if (resolvedPlant) {
    query += ` AND p.name1 = $${paramCount++}`;
    values.push(resolvedPlant);
  } else if (resolvedCity) {
    query += ` AND p.ort01 ILIKE $${paramCount++}`;
    values.push(`%${resolvedCity}%`);
  }

  query += ` ORDER BY f.posting_date_key DESC, f.quantity DESC LIMIT 8`;

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
        SUM(CASE
          WHEN f.movement_type::text = '101' THEN f.quantity
          WHEN f.movement_type::text = '102' THEN -f.quantity
          ELSE 0
        END) as generation,
        SUM(CASE
          WHEN f.movement_type::text = '261' THEN f.quantity
          WHEN f.movement_type::text = '262' THEN -f.quantity
          ELSE 0
        END) as consumption
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
    const sessionId = req.body?.sessionId;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    console.log(`\n📝 Chat Request: "${message}"`);

    const generateTitleAsync = async (sessionId, userMessage) => {
      try {
        if (/^(hi|hello|hey|thanks|can you help me\??)$/i.test(userMessage.trim())) return;
        if (userMessage.length < 5) return;
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3.2',
            messages: [{ role: 'user', content: `Generate a concise, 3 to 6 word title summarizing this message. Use sentence case. Do not use quotes or trailing punctuation. Respond ONLY with the title. Message: "${userMessage}"` }],
            stream: false,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          let title = data?.message?.content?.trim();
          if (title) {
            title = title.replace(/^["']|["']$/g, '');
            title = title.charAt(0).toUpperCase() + title.slice(1);
            await pool.query('UPDATE chat_sessions SET title = $1 WHERE id = $2', [title, sessionId]);
          }
        }
      } catch (e) {
        console.error('❌ Failed to generate chat title:', e.message);
      }
    };

    const saveMessage = async (role, content) => {
      try {
        if (sessionId && req.user && req.user.userId) {
          const sessionCheck = await pool.query('SELECT id, title FROM chat_sessions WHERE id = $1 AND user_id = $2', [sessionId, req.user.userId]);
          if (sessionCheck.rows.length > 0) {
            const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
            await pool.query('INSERT INTO chat_messages (session_id, role, content, created_at) VALUES ($1, $2, $3, NOW())', [sessionId, role, contentStr]);
            await pool.query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);
            if (role === 'user' && sessionCheck.rows[0].title === 'New Chat') {
              generateTitleAsync(sessionId, typeof content === 'string' ? content : (content.text || ''));
            }
          }
        }
      } catch (e) { }
    };

    saveMessage('user', message);

    const originalJson = res.json;
    res.json = function (body) {
      if (res.statusCode === 200 && !body.error) saveMessage('assistant', body);
      return originalJson.call(this, body);
    };

    const originalSend = res.send;
    res.send = function (body) {
      if (res.statusCode === 200 && res.get('Content-Type')?.includes('text/plain')) saveMessage('assistant', body);
      return originalSend.call(this, body);
    };

    const orchestratorPrompt = `You are an orchestrator for the Power Plant Dashboard AI.
Analyze the user's message and determine the intent. Return ONLY a valid JSON object.
Schema:
Table fact_quality_material_movement (f)
  posting_date_key (text YYYYMMDD)
  movement_type (text '101'/'102'=generation, '261'/'262'=consumption)
  quantity (numeric)
  sender_plant_key (text)
Table plant_master (p)
  werks (text, matches sender_plant_key)
  name1 (text, Plant Name)
  ort01 (text, City)

Intents:
1. "dashboard_component": User wants to see a chart, graph, table, or dashboard view.
   Valid components: "kpi", "table", "trend", "top_plants", "regional", "movement", "all".
2. "data_question": User asks a specific data question requiring querying the DB (e.g. "What was the total generation for SBPP-1?").
3. "general": Greetings, small talk, or non-data questions.

Output JSON format:
{
  "intent": "dashboard_component" | "data_question" | "general",
  "components": ["..."], // if dashboard_component, array of components, else null
  "filters": {
    "plant": "All" | "<Plant Name>",
    "city": "All" | "<City Name>",
    "dateRange": "All" | "7D" | "30D" | "Month" | "Year"
  },
  "sql": "..." // if data_question, provide a valid PostgreSQL query. limit results to 20. use SUM() and GROUP BY if aggregating. 
}

User Message: "${message}"
JSON:`;

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        messages: [{ role: 'user', content: orchestratorPrompt }],
        stream: false,
        options: { temperature: 0.1 },
        format: 'json'
      }),
    });

    if (!response.ok) throw new Error('Ollama unavailable');
    const data = await response.json();
    const resultText = data.message.content.trim();
    const result = JSON.parse(resultText);

    if (result.intent === 'dashboard_component') {
      return res.json({
        type: 'dashboard_component',
        components: result.components || ['all'],
        filters: result.filters || { plant: 'All', city: 'All', dateRange: 'All' }
      });
    } else if (result.intent === 'data_question' && result.sql) {
      try {
        const { rows } = await pool.query(result.sql);
        const dataContext = JSON.stringify(rows);

        const finalPrompt = `You are SteelAI, a data assistant.
The user asked: "${message}"
Database results: ${dataContext}
Answer the user's question clearly and concisely using only the database results provided. Do not invent any numbers. Do not output SQL.`;

        const finalResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3.2',
            messages: [{ role: 'user', content: finalPrompt }],
            stream: false,
            options: { temperature: 0.1 }
          }),
        });
        const finalData = await finalResponse.json();
        return res.type('text/plain').send(finalData.message.content.trim());
      } catch (err) {
        console.error('SQL Error:', err);
        return res.type('text/plain').send('Sorry, I encountered an error running the database query.');
      }
    } else {
      // general chat
      const genResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          messages: [{ role: 'system', content: 'You are SteelAI, a friendly AI assistant for a Power Plant Dashboard. Keep responses short and helpful.' }, { role: 'user', content: message }],
          stream: false,
        }),
      });
      const genData = await genResponse.json();
      return res.type('text/plain').send(genData.message.content.trim());
    }
  } catch (error) {
    console.error('❌ Chat handler failure:', error.message, error.stack);
    return res.status(503).json({ error: `Ollama is not available. Please make sure Ollama is running. (Internal error: ${error.message})` });
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