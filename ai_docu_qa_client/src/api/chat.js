// Uses VITE_API_URL if set (e.g. in .env.production), otherwise your local server
const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const uploadDocument = async (file, sessionId) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sessionId", sessionId);

  const res = await fetch(`${BASE}/document/upload`, {
    method: "POST",
    body: formData,
  });
  return res.json();
};

export const checkDocument = async (sessionId) => {
  const res = await fetch(`${BASE}/document/${sessionId}`);
  return res.json();
};

export const getChatHistory = async (sessionId) => {
  const res = await fetch(`${BASE}/chat/history/${sessionId}`);
  return res.json();
};

export const clearHistory = async (sessionId) => {
  await fetch(`${BASE}/chat/history/${sessionId}`, { method: "DELETE" });
};

export const uploadDocumentWithProgress = async (
  file,
  sessionId,
  onProgress,
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sessionId", sessionId);

  const response = await fetch(`${BASE}/document/upload`, {
    method: "POST",
    body: formData,
  });

  // Server returned a normal JSON error (400/500) instead of a stream
  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {
      // ignore, keep default message
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Events can be split across network chunks, so buffer until a full line
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep the incomplete last line for next round

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const json = JSON.parse(line.slice(6));
      onProgress(json); // send progress events to UI

      if (json.status === "error") throw new Error(json.error || "Upload failed");
      if (json.status === "done") return json;
    }
  }

  throw new Error("Upload ended before finishing");
};