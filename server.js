/* Run: node server.js. Uses only Node.js built-in modules. */
"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_REQUEST = 3 * 1024 * 1024;
const MAX_BOARD_FILES = 50 * 1024 * 1024;
const MAX_POSTS = 200;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".md", ".csv", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg", ".webp"]);
const STATIC_FILES = {
  "/": ["index.html", "text/html"],
  "/index.html": ["index.html", "text/html"],
  "/board.html": ["board.html", "text/html"],
  "/style.css": ["style.css", "text/css"],
  "/script.js": ["script.js", "text/javascript"]
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function createApp({ dataDir = process.env.DATA_DIR || path.join(__dirname, "data"), periodMs = FIVE_DAYS, now = Date.now } = {}) {
  const uploadsDir = path.join(dataDir, "uploads");
  const statePath = path.join(dataDir, "board.json");
  await fs.mkdir(uploadsDir, { recursive: true });
  let state;
  let queue = Promise.resolve();
  let resetTimer;
  let closed = false;
  const rateLimits = new Map();

  // Serializing all storage operations prevents a reset from racing with an upload.
  function locked(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }

  async function save(next) {
    const temporary = `${statePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
    await fs.rename(temporary, statePath);
    state = next;
  }

  function newState(start) { return { nextResetAt: start + periodMs, posts: [] }; }
  try {
    state = JSON.parse(await fs.readFile(statePath, "utf8"));
    if (!Number.isFinite(state.nextResetAt) || !Array.isArray(state.posts)) throw new Error("Invalid board data. Restore a valid data/board.json before restarting.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error; // Never silently overwrite damaged saved posts.
    await save(newState(now()));
  }

  async function removeUnusedFiles() {
    const keep = new Set(state.posts.filter((post) => post.file).map((post) => post.id));
    for (const name of await fs.readdir(uploadsDir)) {
      if (!keep.has(name)) await fs.rm(path.join(uploadsDir, name), { force: true });
    }
  }

  async function ensureCurrentCycle() {
    if (now() >= state.nextResetAt) {
      const elapsedCycles = Math.floor((now() - state.nextResetAt) / periodMs) + 1;
      await save({ nextResetAt: state.nextResetAt + elapsedCycles * periodMs, posts: [] });
      // Once the index clears, old files cannot be downloaded, even if disk cleanup needs a retry.
      try { await removeUnusedFiles(); } catch (error) { console.error("File cleanup will retry:", error.message); }
    }
  }

  function scheduleReset() {
    clearTimeout(resetTimer);
    if (closed) return;
    resetTimer = setTimeout(async () => {
      try { await locked(ensureCurrentCycle); }
      catch (error) { console.error("Reset will retry:", error.message); }
      scheduleReset();
    }, Math.max(100, state.nextResetAt - now()));
    resetTimer.unref();
  }

  await ensureCurrentCycle();
  await removeUnusedFiles();
  scheduleReset();
  const housekeeping = setInterval(() => {
    locked(async () => { await ensureCurrentCycle(); await removeUnusedFiles(); }).catch((error) => console.error("Cleanup will retry:", error.message));
    for (const [key, item] of rateLimits) if (now() >= item.resetAt) rateLimits.delete(key);
  }, 60000);
  housekeeping.unref();

  function snapshot() { return { posts: state.posts, nextResetAt: state.nextResetAt, serverTime: now() }; }

  function securityHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader("Cache-Control", "no-store");
  }

  function json(res, status, payload) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  }

  function checkRateLimit(req) {
    const key = req.socket.remoteAddress || "unknown";
    const item = rateLimits.get(key);
    if (item && now() < item.resetAt) {
      if (item.count >= 20) throw new HttpError(429, "Please wait a few minutes before sharing another post.");
      item.count++;
    } else {
      if (rateLimits.size >= 10000) throw new HttpError(503, "The board is busy. Please try again shortly.");
      rateLimits.set(key, { count: 1, resetAt: now() + 10 * 60 * 1000 });
    }
  }

  async function readJson(req) {
    const contentType = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") throw new HttpError(415, "Send application/json.");
    // Cross-site forms cannot submit application/json; browsers receive no CORS permission.
    if (req.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Post from this website.");
    if (Number(req.headers["content-length"] || 0) > MAX_REQUEST) throw new HttpError(413, "The upload is too large.");
    let length = 0;
    const chunks = [];
    for await (const chunk of req) {
      length += chunk.length;
      if (length > MAX_REQUEST) throw new HttpError(413, "The upload is too large.");
      chunks.push(chunk);
    }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      return parsed;
    } catch { throw new HttpError(400, "The submitted data is invalid."); }
  }

  function text(value, max, label) {
    if (typeof value !== "string") throw new HttpError(400, `${label} must be text.`);
    const clean = value.trim();
    if (clean.length > max) throw new HttpError(400, `${label} is too long (maximum ${max} characters).`);
    return clean;
  }

  function validatePost(input) {
    const title = text(input.title, 100, "Title");
    const body = text(input.body ?? "", 5000, "Note");
    const author = text(input.author ?? "", 60, "Name") || "Anonymous";
    if (!title) throw new HttpError(400, "Please give your post a title.");
    let file = null;
    let bytes = null;
    if (input.file !== undefined) {
      if (!input.file || typeof input.file !== "object") throw new HttpError(400, "Invalid attachment.");
      const rawName = text(input.file.name, 160, "Filename");
      const name = rawName.replace(/[\x00-\x1f\x7f/\\]/g, "_");
      if (!ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())) throw new HttpError(400, "That file type is not supported. Use PDF, text, Office documents or images.");
      const base64 = input.file.data;
      if (typeof base64 !== "string" || !base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new HttpError(400, "Invalid file data.");
      bytes = Buffer.from(base64, "base64");
      if (!bytes.length || bytes.length > MAX_FILE) throw new HttpError(413, "Choose a non-empty file up to 2 MB.");
      file = { name, size: bytes.length };
    }
    if (!body && !file) throw new HttpError(400, "Write a note or attach a file first.");
    return { post: { id: randomUUID(), title, body, author, file, createdAt: now() }, bytes };
  }

  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/board") {
        const board = await locked(async () => { await ensureCurrentCycle(); return snapshot(); });
        return json(res, 200, board);
      }
      if (req.method === "POST" && url.pathname === "/api/posts") {
        checkRateLimit(req);
        const input = await readJson(req);
        const board = await locked(async () => {
          await ensureCurrentCycle();
          const { post, bytes } = validatePost(input);
          if (state.posts.length >= MAX_POSTS) throw new HttpError(409, "The board is full for this cycle. Please come back after the reset.");
          const total = state.posts.reduce((sum, item) => sum + (item.file?.size || 0), 0);
          if (total + (bytes?.length || 0) > MAX_BOARD_FILES) throw new HttpError(409, "Attachment storage is full until the reset. You can still share a text note.");
          const filePath = path.join(uploadsDir, post.id);
          if (bytes) await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
          try { await save({ ...state, posts: [post, ...state.posts] }); }
          catch (error) { if (bytes) await fs.rm(filePath, { force: true }); throw error; }
          // A slow disk write may cross the boundary. Never return an expired post.
          await ensureCurrentCycle();
          if (!state.posts.some((item) => item.id === post.id)) throw new HttpError(409, "The board reset while you were publishing. Please submit again.");
          return snapshot();
        });
        return json(res, 201, board);
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/files/")) {
        const id = url.pathname.slice("/api/files/".length);
        const download = await locked(async () => {
          await ensureCurrentCycle();
          const post = state.posts.find((item) => item.id === id && item.file);
          if (!post) throw new HttpError(404, "This file is unavailable or the board has reset.");
          const bytes = await fs.readFile(path.join(uploadsDir, post.id));
          await ensureCurrentCycle();
          if (!state.posts.some((item) => item.id === post.id)) throw new HttpError(404, "This file has expired.");
          return { bytes, name: post.file.name };
        });
        // Always force attachment download, including files disguised with another extension.
        const encodedName = encodeURIComponent(download.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodedName}`, "Content-Length": download.bytes.length, "Content-Security-Policy": "sandbox; default-src 'none'" });
        return res.end(download.bytes);
      }
      if (req.method === "GET" && STATIC_FILES[url.pathname]) {
        const [name, type] = STATIC_FILES[url.pathname];
        const bytes = await fs.readFile(path.join(__dirname, name));
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
        return res.end(bytes);
      }
      json(res, 404, { error: "Page not found." });
    } catch (error) {
      if (!error.status) console.error("Request failed:", error.message);
      if (!res.headersSent && !res.destroyed) json(res, error.status || 500, { error: error.status ? error.message : "The server could not complete the request. Please try again." });
      else if (!res.destroyed) res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  const stopTimers = () => { closed = true; clearTimeout(resetTimer); clearInterval(housekeeping); };
  server.on("close", stopTimers);
  return { server, stopTimers };
}

if (require.main === module) {
  createApp().then(({ server, stopTimers }) => {
    const port = Number(process.env.PORT || 3000);
    server.listen(port, "0.0.0.0", () => console.log(`Common Room is running at http://localhost:${port}`));
    server.on("error", (error) => { stopTimers(); console.error(error.message); process.exitCode = 1; });
  }).catch((error) => { console.error("Could not start:", error.message); process.exitCode = 1; });
}

module.exports = { createApp, FIVE_DAYS };
