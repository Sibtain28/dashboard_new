const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { initStore, queryRelevantDocuments } = require('./documentStore');
const { generateAnswer } = require('./groqClient');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3001;

function formatDateYYYYMMDD(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
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

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`Incoming ${req.method} request to ${req.path}`);
  next();
});

const csvFilePath = path.join(__dirname, '../../merged_dashboard_data.csv');

app.get('/api/ping', (req, res) => {
  return res.json({ status: 'ok', message: 'Backend is running', uptime: process.uptime() });
});

app.get('/api/data', (req, res) => {
  const results = [];

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      results.push({
        date: data.POSTING_DATE_KEY,
        movementType: data.MOVEMENT_TYPE,
        quantity: parseFloat(data.QUANTITY) || 0,
        plantName: data.SENDER_PLANT_NAME,
        city: data.SENDER_PLANT_CITY,
        material: data.MATERIAL_KEY
      });
    })
    .on('end', () => res.json(results))
    .on('error', (err) => res.status(500).json({ error: 'Failed to read data' }));
});

app.post('/api/chat', async (req, res) => {
  try {
    const { question, history = [] } = req.body;
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    const requestedDate = extractRequestedDate(question);
    const movementTypeFilter = extractMovementTypeFilter(question);
    const relevantDocs = await queryRelevantDocuments(question, 5, {
      date: requestedDate,
      movementTypes: movementTypeFilter,
    });

    if (requestedDate && relevantDocs.length === 0) {
      return res.json({
        answer: `No records were found for ${requestedDate}. The dataset does not contain any data for that date.`,
        citations: [],
        retrieved: [],
      });
    }

    const citationList = relevantDocs.map((item) => {
      const rowNumber = item.metadata?.rowNumber || item.metadata?.id || 'unknown';
      const plant = item.metadata?.plantName || item.metadata?.senderPlantName || 'unknown plant';
      return `row ${rowNumber} (${plant})`;
    });

    const retrievedContext = relevantDocs
      .map((item, index) => `Reference ${index + 1}:
${item.document}
Metadata: ${JSON.stringify(item.metadata)}`)
      .join('\n\n');

    const historyText = history
      .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
      .join('\n');

    const filterNotes = [];
    if (requestedDate) {
      filterNotes.push(`The user asked about ${requestedDate} (yesterday). Only use records from that date.`);
    }
    if (movementTypeFilter.length) {
      filterNotes.push(`Use movement types ${movementTypeFilter.join(', ')} for generation-related answers.`);
    }

    const prompt = `You are a factual assistant for a power plant dataset. Answer using only the provided context. Do not invent facts. If the answer cannot be found in the context, say that the data does not contain enough information.

${filterNotes.join(' ')}

Context:
${retrievedContext}

Conversation History:
${historyText}

Question: ${question}

Answer concisely. Include citations to the relevant records used from the dataset in the answer.`;

    const answer = await generateAnswer(prompt);
    const cleanAnswer = answer.trim();
    const answerWithCitations = `${cleanAnswer}\n\nSources: ${citationList.join(', ')}`;

    return res.json({ answer: answerWithCitations, citations: citationList, retrieved: relevantDocs });
  } catch (error) {
    console.error('Chat handler failure:', error);
    return res.status(500).json({ error: error.message || 'Failed to process chat request.' });
  }
});

initStore()
  .then(() => {
    console.log('Document store initialized.');app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});
    app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('Failed to initialize document store:', error);
    process.exit(1);
  });
