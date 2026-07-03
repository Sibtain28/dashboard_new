const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { generateEmbedding, DEFAULT_DIMENSION } = require('./embeddings');

const DATA_PATH = path.join(__dirname, '../../merged_dashboard_data.csv');
const COLLECTION_NAME = 'power-plant-data';

const inMemoryStore = {
  ids: [],
  documents: [],
  metadatas: [],
  embeddings: [],
};

let chromaCollection = null;
let chromaEnabled = false;

function buildDocumentText(row) {
  const fields = [
    `Date: ${row.POSTING_DATE_KEY || 'unknown'}`,
    `Movement type: ${row.MOVEMENT_TYPE || 'unknown'}`,
    `Quantity: ${row.QUANTITY || 'unknown'}`,
    `Material: ${row.MATERIAL_KEY || 'unknown'}`,
    `Sender plant: ${row.SENDER_PLANT_NAME || 'unknown'}`,
    `Sender city: ${row.SENDER_PLANT_CITY || 'unknown'}`,
  ];

  if (row.RECEIVING_PLANT_KEY || row.RECEIVER_PLANT_NAME || row.RECEIVER_PLANT_CITY) {
    fields.push(`Receiver plant: ${row.RECEIVER_PLANT_NAME || row.RECEIVING_PLANT_KEY || 'unknown'}`);
    if (row.RECEIVER_PLANT_CITY) fields.push(`Receiver city: ${row.RECEIVER_PLANT_CITY}`);
  }

  const extras = ['UNIT_OF_ENTRY', 'AMOUNT_IN_LC', 'USERNAME', 'SENDER_PLANT_KEY', 'RECEIVING_PLANT_KEY'];
  extras.forEach((key) => {
    if (row[key]) {
      fields.push(`${key}: ${row[key]}`);
    }
  });

  return fields.join('. ');
}

function makeMetadata(row, rowNumber) {
  return {
    rowNumber,
    plantName: row.SENDER_PLANT_NAME || 'unknown',
    senderCity: row.SENDER_PLANT_CITY || 'unknown',
    material: row.MATERIAL_KEY || 'unknown',
    movementType: row.MOVEMENT_TYPE || 'unknown',
    quantity: row.QUANTITY || 'unknown',
    date: row.POSTING_DATE_KEY || 'unknown',
  };
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

async function connectChroma() {
  try {
    const { ChromaClient } = await import('chromadb');
    const chroma = new ChromaClient();

    if (typeof chroma.listCollections === 'function') {
      const collections = await chroma.listCollections();
      const existing = collections.find((item) => item.name === COLLECTION_NAME);
      if (existing && typeof chroma.deleteCollection === 'function') {
        await chroma.deleteCollection({ name: COLLECTION_NAME }).catch(() => null);
      }
    }

    chromaCollection = await chroma.createCollection({ name: COLLECTION_NAME });
    chromaEnabled = true;
    console.log('Connected to ChromaDB collection:', COLLECTION_NAME);
  } catch (error) {
    chromaEnabled = false;
    chromaCollection = null;
    console.warn('ChromaDB connection failed. Falling back to in-memory retrieval.', error.message || error);
  }
}

async function loadDocuments() {
  return new Promise((resolve, reject) => {
    let rowNumber = 0;
    fs.createReadStream(DATA_PATH)
      .pipe(csv())
      .on('data', (row) => {
        rowNumber += 1;
        const documentText = buildDocumentText(row);
        const metadata = makeMetadata(row, rowNumber);
        const id = `row-${rowNumber}`;
        const embedding = generateEmbedding(documentText, DEFAULT_DIMENSION);

        inMemoryStore.ids.push(id);
        inMemoryStore.documents.push(documentText);
        inMemoryStore.metadatas.push(metadata);
        inMemoryStore.embeddings.push(embedding);
      })
      .on('end', resolve)
      .on('error', reject);
  });
}

async function populateChroma() {
  if (!chromaEnabled || !chromaCollection) return;
  try {
    await chromaCollection.add({
      ids: inMemoryStore.ids,
      embeddings: inMemoryStore.embeddings,
      metadatas: inMemoryStore.metadatas,
      documents: inMemoryStore.documents,
    });
    console.log('Stored documents in ChromaDB.');
  } catch (error) {
    chromaEnabled = false;
    chromaCollection = null;
    console.warn('ChromaDB store failed, using in-memory retrieval instead.', error.message || error);
  }
}

async function initStore() {
  await loadDocuments();
  await connectChroma();
  await populateChroma();
  return true;
}

async function queryRelevantDocuments(query, nResults = 3, options = {}) {
  const { date, movementTypes } = options;
  const queryEmbedding = generateEmbedding(query, DEFAULT_DIMENSION);

  if (chromaEnabled && chromaCollection) {
    try {
      const queryOptions = {
        queryEmbeddings: [queryEmbedding],
        nResults,
        queryTexts: [query],
      };

      if (date || (movementTypes && movementTypes.length)) {
        queryOptions.where = {};
        if (date) queryOptions.where.date = date;
        if (movementTypes && movementTypes.length) queryOptions.where.movementType = movementTypes;
      }

      const response = await chromaCollection.query(queryOptions);

      const documents = response.documents?.[0] || [];
      const metadatas = response.metadatas?.[0] || [];
      const distances = response.distances?.[0] || [];

      return documents.map((document, index) => ({
        document,
        metadata: metadatas[index] || {},
        score: distances[index] ?? null,
      }));
    } catch (error) {
      console.warn('Chroma query failed, falling back to in-memory search.', error.message || error);
    }
  }

  let scored = inMemoryStore.embeddings.map((embedding, index) => ({
    score: cosineSimilarity(queryEmbedding, embedding),
    document: inMemoryStore.documents[index],
    metadata: inMemoryStore.metadatas[index],
  }));

  if (date) {
    scored = scored.filter((item) => item.metadata?.date === date);
  }

  if (movementTypes && movementTypes.length) {
    scored = scored.filter((item) => movementTypes.includes(item.metadata?.movementType));
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, nResults);
}

module.exports = {
  initStore,
  queryRelevantDocuments,
};
