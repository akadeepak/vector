const fs = require('fs');
const pdf = require('pdf-parse');
const axios = require('axios');
const { encode } = require('gpt-3-encoder');

// Path to your PDF
const dataBuffer = fs.readFileSync('/home/user/Documents/llm/pp.pdf');

pdf(dataBuffer).then(async function (data) {
  let text = data.text;

  // === CLEANING PROCESS ===
  const cleanedText = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[^\x00-\x7F]/g, '')  // Remove non-ASCII
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Log cleaned text
  console.log('\n--- Cleaned Text (Single Paragraph) ---\n');
  console.log(cleanedText);

  // === WORD COUNT ===
  const words = cleanedText.split(' ').filter(Boolean);
  console.log('\n--- Word Count ---\n');
  console.log(`Total words: ${words.length}`);

  // === TOKEN COUNT ===
  const tokens = encode(cleanedText);
  console.log('\n--- Token Count ---\n');
  console.log(`Total tokens: ${tokens.length}`);

  // === EMBEDDING USING OLLAMA ===
  console.log('\n--- Generating Vector Embedding with Ollama ---\n');
  try {
    const embeddingResponse = await axios.post('http://localhost:11434/api/embeddings', {
      model: 'nomic-embed-text',
      prompt: cleanedText
    });

    const vector = embeddingResponse.data.embedding;
    console.log(`✅ Successfully generated vector of dimension: ${vector.length}`);
    console.log('🔢 Sample of the vector:', vector.slice(0, 10), '...');

    // You can now save this vector for later use or similarity search
    // fs.writeFileSync('embedding.json', JSON.stringify(vector));

  } catch (error) {
    console.error('❌ Error generating embedding with Ollama:', error.response?.data || error.message);
  }

}).catch(function (error) {
  console.error('❌ Error parsing PDF:', error);
});
