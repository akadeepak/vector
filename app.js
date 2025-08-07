const fs = require('fs');
const pdf = require('pdf-parse');
const axios = require('axios');
const { encode } = require('gpt-3-encoder');
const os = require('os');

// === CONFIG ===
const PDF_PATH = '/home/user/Documents/llm/pp.pdf';
const CHUNK_SIZE = 300; // approx. words per chunk
const MAX_PARALLEL_REQUESTS = os.cpus().length; // CPU cores

// === UTILITIES ===

// Clean text
function cleanText(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Chunk text into word-based segments
function chunkText(text, wordsPerChunk = 300) {
  const words = text.split(' ').filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunkWords = words.slice(i, i + wordsPerChunk);
    const chunkText = chunkWords.join(' ');
    chunks.push({
      chunkId: i / wordsPerChunk,
      text: chunkText,
      tokens: encode(chunkText).length
    });
  }
  return chunks;
}

// Embed a single chunk via Ollama
async function embedChunk(chunk) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.post('http://localhost:11434/api/embeddings', {
        model: 'nomic-embed-text',
        prompt: chunk.text
      });

      return {
        chunkId: chunk.chunkId,
        text: chunk.text,
        embedding: res.data.embedding,
        tokens: chunk.tokens
      };
    } catch (err) {
      if (attempt < 2) {
        console.warn(`Retrying chunk ${chunk.chunkId}...`);
        await new Promise((r) => setTimeout(r, 500));
      } else {
        console.error(`Failed embedding for chunk ${chunk.chunkId}:`, err.message);
        return null;
      }
    }
  }
}

// Embed all chunks in parallel
async function embedAllChunks(chunks) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < chunks.length) {
      const chunk = chunks[index++];
      const result = await embedChunk(chunk);
      if (result) results.push(result);
    }
  }

  const workers = Array(MAX_PARALLEL_REQUESTS).fill(0).map(worker);
  await Promise.all(workers);

  return results.sort((a, b) => a.chunkId - b.chunkId);
}

// === MAIN ===

(async () => {
  try {
    console.time("📦 Total Time");

    const dataBuffer = fs.readFileSync(PDF_PATH);
    const pdfData = await pdf(dataBuffer);

    const cleaned = cleanText(pdfData.text);
    console.log(`✅ Cleaned text. Word count: ${cleaned.split(' ').length}`);

    const chunks = chunkText(cleaned, CHUNK_SIZE);
    console.log(`📄 Split into ${chunks.length} chunks.`);

    const embeddedChunks = await embedAllChunks(chunks);
    console.log(`✅ Embedded ${embeddedChunks.length} chunks.`);

    // Save output
    const outputPath = './output/embedded_chunks.json';
    fs.mkdirSync('./output', { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(embeddedChunks, null, 2));

    console.log(`📝 Saved embeddings to ${outputPath}`);
    console.timeEnd("📦 Total Time");

  } catch (err) {
    console.error('❌ Fatal error:', err);
  }
})();
