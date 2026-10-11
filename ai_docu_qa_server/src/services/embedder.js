import { pipeline } from "@xenova/transformers";

// Cache the loading promise so the model only loads once,
// and concurrent calls share the same load
let embedderPromise = null;

const getEmbedder = () => {
  if (!embedderPromise) {
    console.log("Loading embedding model... (first time downloads ~90 MB)");

    embedderPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")
      .then((model) => {
        console.log("Embedding model loaded");
        return model;
      })
      .catch((err) => {
        console.error("Model load failed:", err);
        embedderPromise = null; // allow a retry on the next call
        throw err;
      });
  }

  return embedderPromise;
};

export const embedderService = {
  // convert a single string to a vector (array of numbers)
  async embed(text) {
    const model = await getEmbedder();
    const output = await model(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  },

  // Embed multiple texts at once
  async embedBatch(texts) {
    const model = await getEmbedder();
    const results = [];

    // process one by one (batching can cause memory issues with large docs)
    for (const text of texts) {
      const output = await model(text, { pooling: "mean", normalize: true });
      results.push(Array.from(output.data));
    }

    return results;
  },
};