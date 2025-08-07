console.time('⏱️ Total Processing Time');

// Start of the main script...
const fs = require('fs');
const pdf = require('pdf-parse');
const axios = require('axios');
const { encode } = require('gpt-3-encoder');
const { v4: uuidv4 } = require('uuid');

const COLLECTION_NAME = 'pdf_chunks';
const PDF_PATH = '/home/user/Documents/llm/pp.pdf';
const QDRANT_URL = 'http://localhost:6333';

(async () => {
  const start = Date.now(); // optional, for more precision
  const dataBuffer = fs.readFileSync(PDF_PATH);
  const data = await pdf(dataBuffer);

  let text = data.text;

  // === CLEANING ===
  const cleanedText = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // === SPLITTING ===
  const words = cleanedText.split(' ').filter(Boolean);
  const chunkSize = 1000;
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }

  console.log(`🔹 Total chunks: ${chunks.length}`);

  // === CREATE COLLECTION ===
  await axios.put(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
    vectors: {
      size: 768,
      distance: 'Cosine',
    }
  }).catch(e => {
    if (e.response?.status !== 409) {
      console.error('❌ Error creating collection:', e.response?.data || e.message);
      process.exit(1);
    }
  });

  // === PROCESS EACH CHUNK ===
  for (let i = 0; i < chunks.length; i++) {
    const chunkStart = Date.now();
    const chunk = chunks[i];
    console.log(`📦 Embedding chunk ${i + 1}/${chunks.length}`);

    try {
      const response = await axios.post('http://localhost:11434/api/embeddings', {
        model: 'nomic-embed-text',
        prompt: chunk,
      });

      const vector = response.data.embedding;

      await axios.put(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
        points: [
          {
            id: uuidv4(),
            vector,
            payload: {
              chunk_index: i,
              text: chunk,
            },
          },
        ],
      });

      const chunkEnd = Date.now();
      console.log(`✅ Stored chunk ${i + 1} | Time: ${(chunkEnd - chunkStart) / 1000}s`);

    } catch (err) {
      console.error(`❌ Error processing chunk ${i + 1}:`, err.response?.data || err.message);
    }
  }

  const end = Date.now();
  console.timeEnd('⏱️ Total Processing Time');
  console.log(`🕒 Total elapsed: ${(end - start) / 1000}s`);
})();
