import fs from "fs";
import { PDFParse } from "pdf-parse";
import asyncHandler from "express-async-handler";
import { Document } from "../models/document.model.js";
import { Chunk } from "../models/chunk.model.js";
import { chunker } from "../services/chunker.js";
import { embedderService } from "../services/embedder.js";

// upload document
export const uploadDocument = asyncHandler(async (req, res) => {
  console.log("upload hit", req.file?.originalname, req.body?.sessionId);

  const { sessionId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required" });
  }

  // 1. parse file content
  let content = "";
  const filePath = req.file.path;

  try {
    if (req.file.mimetype === "application/pdf") {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: buffer });

      try {
        const parsed = await parser.getText();
        content = parsed.text;
      } finally {
        await parser.destroy();
      }
    } else {
      content = fs.readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    console.error("Parsing failed:", err);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).json({ error: "Failed to read the document" });
  }

  console.log("parsed file, characters:", content.length);

  // clean up the text - remove excessive whitespace
  content = content.replace(/\s+/g, " ").trim();

  if (!content) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res
      .status(400)
      .json({ error: "Failed to extract content from the document" });
  }

  fs.unlinkSync(filePath);

  // 2. Delete old document + chunks for this session
  await Document.findOneAndDelete({ sessionId });
  await Chunk.deleteMany({ sessionId });

  // 3. Save document
  const doc = await Document.create({
    sessionId,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    content,
    characters: content.length,
    size: req.file.size,
  });
  console.log("document saved");

  // 4. split into chunks
  const chunks = chunker.splitIntoChunks(content);
  console.log(`Split into ${chunks.length} chunks`);

  // 5. embed all chunks (streamed progress to the frontend)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(
    `data: ${JSON.stringify({ status: "chunking", total: chunks.length })}\n\n`,
  );

  const chunkDocs = [];

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`embedding chunk ${i + 1}/${chunks.length}`);

      const embedding = await embedderService.embed(chunk.text);

      chunkDocs.push({
        sessionId,
        documentId: doc._id,
        text: chunk.text,
        embedding,
        chunkIndex: i,
        wordCount: chunk.wordCount,
      });

      // Send progress to frontend
      res.write(
        `data: ${JSON.stringify({
          status: "embedding",
          progress: i + 1,
          total: chunks.length,
        })}\n\n`,
      );
    }

    // 6. Bulk insert all chunks
    await Chunk.insertMany(chunkDocs);
    console.log("chunks saved");

    res.write(
      `data: ${JSON.stringify({
        status: "done",
        documentId: doc._id,
        originalName: doc.originalName,
        totalChunks: chunks.length,
        characters: content.length,
      })}\n\n`,
    );
  } catch (err) {
    console.error("Embedding failed:", err);
    res.write(
      `data: ${JSON.stringify({ status: "error", error: err.message })}\n\n`,
    );
  }

  res.end();
});

// get document with session id
export const checkDocument = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const doc = await Document.findOne(
    { sessionId },
    "originalName characters createdAt",
  );

  doc
    ? res.json({ hasDocument: true, document: doc })
    : res.json({ hasDocument: false });
});