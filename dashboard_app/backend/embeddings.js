const DEFAULT_DIMENSION = 256;

function hashToken(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => value / norm);
}

function textToTokens(text) {
  return text
    .toLowerCase()
    .replace(/[“”‘’`"'«»…]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function generateEmbedding(text, dimension = DEFAULT_DIMENSION) {
  const tokens = textToTokens(text);
  const vector = new Array(dimension).fill(0);

  tokens.forEach((token) => {
    const hash = hashToken(token);
    const primary = Math.abs(hash % dimension);
    const secondary = Math.abs((hash >> 8) % dimension);
    vector[primary] += 1;
    vector[secondary] += token.length * 0.1;
  });

  return normalize(vector);
}

module.exports = {
  generateEmbedding,
  DEFAULT_DIMENSION,
};
