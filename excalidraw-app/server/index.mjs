#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile, writeFile, readdir, mkdir, rename, rm, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { join, extname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOSTNAME || "0.0.0.0";
const STATIC_ROOT = resolve(process.env.STATIC_ROOT || join(__dirname, "..", "build"));
const DATA_DIR = resolve(process.env.DATA_DIR || "/data");
const BOARDS_DIR = join(DATA_DIR, "boards");
const SHARES_DIR = join(DATA_DIR, "shares");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const CARL_PRESETS = [
  {
    id: "homeport-fleet-topology",
    name: "Homeport Fleet Topology (home-01)",
    subtitle: "Tailscale Ingress, App Containers & Encrypted Backups",
    description: "Live architecture topology of Anthony's home-01 Lenovo server managed through Homeport.",
    ast: {
      nodes: [
        { id: "tailscale", label: "Tailscale Serve Ingress\n(home-01.tail7ac14c.ts.net)", type: "gateway", role: "ingress", group: "1. Tailnet Ingress & Fleet Control" },
        { id: "homeport", label: "Homeport Control Plane\n(:3210 · HTTPS :8443)", type: "service", role: "control", group: "1. Tailnet Ingress & Fleet Control" },
        { id: "anchor", label: "Anchor\n(:3005 · HTTPS :443)", type: "service", role: "compute", group: "2. Workspace Applications (127.0.0.1)" },
        { id: "item_catalog", label: "Item Catalog\n(:3111 · HTTPS :8447)", type: "service", role: "compute", group: "2. Workspace Applications (127.0.0.1)" },
        { id: "investor_ai", label: "Investor AI\n(:3102 · HTTPS :8446)", type: "service", role: "compute", group: "2. Workspace Applications (127.0.0.1)" },
        { id: "excalidraw", label: "Excalidraw Studio\n(:3115 · HTTPS :8452)", type: "service", role: "compute", group: "2. Workspace Applications (127.0.0.1)" },
        { id: "anchor_db", label: "Anchor PostgreSQL 16\n(Private Bridge :5432)", type: "database", role: "datastore", group: "3. Isolated Data & Volume Layer" },
        { id: "catalog_db", label: "Catalog pgvector PG18\n(Private Bridge :5432)", type: "database", role: "datastore", group: "3. Isolated Data & Volume Layer" },
        { id: "investor_db", label: "Investor PostgreSQL 16\n(Private Bridge :5432)", type: "database", role: "datastore", group: "3. Isolated Data & Volume Layer" },
        { id: "studio_vol", label: "Studio Board Storage\n(/data/boards/*.json)", type: "storage", role: "datastore", group: "3. Isolated Data & Volume Layer" },
        { id: "backups", label: "AES-256-GCM Vault\n(/home/anthony/backups)", type: "storage", role: "storage", group: "4. Encrypted Recovery & Off-Device Sync" },
        { id: "spaceship", label: "Off-Device Replication\n(SPACESHIP Stage + Verify)", type: "storage", role: "control", group: "4. Encrypted Recovery & Off-Device Sync" },
      ],
      edges: [
        { from: "tailscale", to: "homeport", label: "HTTPS :8443" },
        { from: "tailscale", to: "anchor" },
        { from: "tailscale", to: "item_catalog" },
        { from: "tailscale", to: "investor_ai" },
        { from: "tailscale", to: "excalidraw" },
        { from: "anchor", to: "anchor_db", label: "Drizzle SQL" },
        { from: "item_catalog", to: "catalog_db", label: "pgvector SQL" },
        { from: "investor_ai", to: "investor_db", label: "Drizzle SQL" },
        { from: "excalidraw", to: "studio_vol", label: "REST /api/boards" },
        { from: "anchor_db", to: "backups" },
        { from: "catalog_db", to: "backups" },
        { from: "investor_db", to: "backups" },
        { from: "studio_vol", to: "backups" },
        { from: "backups", to: "spaceship", label: "SHA-256 + Restore Check" },
      ],
    },
  },
  {
    id: "example-auth-flow",
    name: "Auth Flow Diagram (Technical Illustration)",
    subtitle: "User Authorization Pipeline",
    description: "Customized user authentication pipeline showcasing verification gates and token generation from Technical-Illustration.",
    ast: {
      nodes: [
        { id: "client_req", label: "Client Session Request\n(Browser / Mobile)", type: "client", role: "edge", group: "1. Client Edge" },
        { id: "oauth_gw", label: "OAuth API Gateway\n(Rate Limit + CSRF)", type: "gateway", role: "ingress", group: "2. Gateway & Verification" },
        { id: "auth_db", label: "Auth Identity Store\n(Argon2id + Sessions)", type: "database", role: "datastore", group: "2. Gateway & Verification" },
        { id: "jwt_issued", label: "Signed Session Token\n(HTTP-Only Cookie + Audit)", type: "service", role: "compute", group: "3. Authorized Session" },
      ],
      edges: [
        { from: "client_req", to: "oauth_gw", label: "TLS 1.3 POST /login" },
        { from: "oauth_gw", to: "auth_db", label: "Verify Hash" },
        { from: "oauth_gw", to: "jwt_issued", label: "Mint JWT" },
      ],
    },
  },
  {
    id: "ego-lab-podcast-pipeline",
    name: "Ego Lab Castopod + Cloudflare R2",
    subtitle: "Podcast RSS, IAB v2.1 Analytics & R2 Media Delivery",
    description: "Two-hop podcast delivery architecture with Castopod on home-01 and MP3 byte-range serving from Cloudflare R2.",
    ast: {
      nodes: [
        { id: "listener", label: "Podcast Apps\n(Apple / Spotify / Overcast)", type: "client", role: "edge", group: "1. Listener & Edge CDN" },
        { id: "cf_tunnel", label: "Cloudflare Edge\npodcast.egolab.us", type: "gateway", role: "ingress", group: "1. Listener & Edge CDN" },
        { id: "castopod", label: "Castopod 1.15.5\n(home-01:3113)", type: "service", role: "compute", group: "2. Home Host Application & Analytics" },
        { id: "mariadb", label: "MariaDB 11.4\n(IAB v2.1 Analytics DB)", type: "database", role: "datastore", group: "2. Home Host Application & Analytics" },
        { id: "r2_media", label: "Cloudflare R2 Bucket\nmedia.egolab.us (206 MP3)", type: "storage", role: "storage", group: "3. Object Media & Encrypted Backups" },
        { id: "cp_backup", label: "Encrypted SQL + Media\n(.sql.enc + .bundle.enc)", type: "storage", role: "control", group: "3. Object Media & Encrypted Backups" },
      ],
      edges: [
        { from: "listener", to: "cf_tunnel", label: "RSS & Audio GET" },
        { from: "cf_tunnel", to: "castopod", label: "Tunnel Proxy" },
        { from: "castopod", to: "mariadb", label: "Log Download" },
        { from: "castopod", to: "r2_media", label: "302 Redirect MP3" },
        { from: "mariadb", to: "cp_backup", label: "Daily Backup" },
      ],
    },
  },
];

function safeId(raw) {
  const cleaned = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || `board-${randomBytes(4).toString("hex")}`;
}

async function ensureStorage() {
  await mkdir(BOARDS_DIR, { recursive: true, mode: 0o700 });
  await mkdir(SHARES_DIR, { recursive: true, mode: 0o700 });
  const existing = (await readdir(BOARDS_DIR)).filter((f) => f.endsWith(".json"));
  if (existing.length === 0) {
    const now = new Date().toISOString();
    const starterBoard = {
      id: "home-01-architecture",
      title: "home-01 Fleet Architecture",
      tags: ["homeport", "architecture", "carl"],
      createdAt: now,
      updatedAt: now,
      elements: [],
      appState: {
        viewBackgroundColor: "#ffffff",
        currentItemFontFamily: 1,
      },
      files: {},
    };
    await writeJsonAtomic(join(BOARDS_DIR, "home-01-architecture.json"), starterBoard);
  }
}

async function writeJsonAtomic(targetPath, data) {
  const tmpPath = `${targetPath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await rename(tmpPath, targetPath);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    ...extraHeaders,
  });
  res.end(body);
}

async function readBodyBuffer(req, maxBytes = 25 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw Object.assign(new Error("Payload exceeds maximum allowed size"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function buildFallbackMermaidFromPrompt(promptText) {
  const text = String(promptText || "").trim();
  const lines = text
    .split(/[\r\n,;]+|\s*(?:->|=>|then|to)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

  if (lines.length >= 2) {
    const nodes = lines.map((label, idx) => ({
      id: `N${idx + 1}`,
      label: label.replace(/["[\]()]/g, "").slice(0, 48),
    }));
    const mermaidLines = ["flowchart TD"];
    for (let i = 0; i < nodes.length; i++) {
      const curr = nodes[i];
      if (i < nodes.length - 1) {
        const next = nodes[i + 1];
        mermaidLines.push(`  ${curr.id}["${curr.label}"] --> ${next.id}["${next.label}"]`);
      } else {
        mermaidLines.push(`  ${curr.id}["${curr.label}"]`);
      }
    }
    return mermaidLines.join("\n");
  }

  const title = text.replace(/["[\]()]/g, "").slice(0, 40) || "System Architecture";
  return [
    "flowchart LR",
    `  Client["Client / Browser"] --> Gateway["${title} Gateway"]`,
    `  Gateway --> Service["Core Service"]`,
    `  Service --> DB[("Primary Database")]`,
    `  Service --> Cache["Cache / Queue"]`,
  ].join("\n");
}

async function generateMermaidWithAI(messages) {
  const lastUserMsg = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((m) => m && m.role === "user")?.content || "";

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const sysPrompt =
        "You are an expert software architect. Convert the user's request into a valid Mermaid flowchart (`flowchart TD` or `flowchart LR`) or sequenceDiagram. Return ONLY a single ```mermaid ... ``` fenced code block and a brief 1-sentence explanation.";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysPrompt }] },
            contents: [{ role: "user", parts: [{ text: String(lastUserMsg) }] }],
            generationConfig: { temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const candidate = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
        if (candidate.trim()) return candidate.trim();
      }
    } catch {
      // Fall through to local deterministic generator
    }
  }

  const mermaid = buildFallbackMermaidFromPrompt(lastUserMsg);
  return `Here is the generated diagram for your prompt:\n\n\`\`\`mermaid\n${mermaid}\n\`\`\``;
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if ((req.method === "GET" || req.method === "HEAD") && (pathname === "/healthz" || pathname === "/api/health")) {
    const files = (await readdir(BOARDS_DIR).catch(() => [])).filter((f) => f.endsWith(".json"));
    return sendJson(res, 200, {
      status: "ok",
      app: "excalidraw",
      edition: "homeport-studio",
      boardsCount: files.length,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.OLLAMA_BASE_URL),
      timestamp: new Date().toISOString(),
    });
  }

  // 1. Server-side Boards API (/api/boards)
  if (pathname === "/api/boards" && req.method === "GET") {
    const files = (await readdir(BOARDS_DIR)).filter((f) => f.endsWith(".json"));
    const summaries = [];
    for (const file of files) {
      try {
        const raw = JSON.parse(await readFile(join(BOARDS_DIR, file), "utf8"));
        const elements = Array.isArray(raw.elements) ? raw.elements.filter((el) => !el?.isDeleted) : [];
        summaries.push({
          id: raw.id || file.replace(/\.json$/, ""),
          title: raw.title || "Untitled Board",
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          elementCount: elements.length,
          createdAt: raw.createdAt || null,
          updatedAt: raw.updatedAt || null,
        });
      } catch {
        // Ignore malformed file
      }
    }
    summaries.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return sendJson(res, 200, { boards: summaries });
  }

  if (pathname === "/api/boards" && req.method === "POST") {
    const body = JSON.parse((await readBodyBuffer(req)).toString("utf8") || "{}");
    const now = new Date().toISOString();
    const id = safeId(body.id || body.title || `board-${Date.now()}`);
    const boardPath = join(BOARDS_DIR, `${id}.json`);
    let existing = null;
    try {
      existing = JSON.parse(await readFile(boardPath, "utf8"));
    } catch {
      existing = null;
    }
    const record = {
      id,
      title: String(body.title || existing?.title || "Untitled Board").slice(0, 140),
      tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).slice(0, 40)).slice(0, 12) : (existing?.tags || []),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      elements: Array.isArray(body.elements) ? body.elements : (existing?.elements || []),
      appState: body.appState && typeof body.appState === "object" ? body.appState : (existing?.appState || {}),
      files: body.files && typeof body.files === "object" ? body.files : (existing?.files || {}),
    };
    await writeJsonAtomic(boardPath, record);
    return sendJson(res, 200, { ok: true, board: record });
  }

  const boardMatch = pathname.match(/^\/api\/boards\/([a-zA-Z0-9_-]{1,64})$/);
  if (boardMatch) {
    const id = safeId(boardMatch[1]);
    const boardPath = join(BOARDS_DIR, `${id}.json`);
    if (req.method === "GET") {
      try {
        const board = JSON.parse(await readFile(boardPath, "utf8"));
        return sendJson(res, 200, { board });
      } catch {
        return sendJson(res, 404, { error: "Board not found" });
      }
    }
    if (req.method === "PUT") {
      const body = JSON.parse((await readBodyBuffer(req)).toString("utf8") || "{}");
      const now = new Date().toISOString();
      let existing = null;
      try {
        existing = JSON.parse(await readFile(boardPath, "utf8"));
      } catch {
        existing = null;
      }
      const record = {
        id,
        title: String(body.title ?? existing?.title ?? "Untitled Board").slice(0, 140),
        tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).slice(0, 40)).slice(0, 12) : (existing?.tags || []),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        elements: Array.isArray(body.elements) ? body.elements : (existing?.elements || []),
        appState: body.appState && typeof body.appState === "object" ? body.appState : (existing?.appState || {}),
        files: body.files && typeof body.files === "object" ? body.files : (existing?.files || {}),
      };
      await writeJsonAtomic(boardPath, record);
      return sendJson(res, 200, { ok: true, board: record });
    }
    if (req.method === "DELETE") {
      await rm(boardPath, { force: true });
      return sendJson(res, 200, { ok: true, deletedId: id });
    }
  }

  // 2. Self-hosted Excalidraw V2 Shareable Snapshot Backend (/api/v2/post/ & /api/v2/:id)
  if ((pathname === "/api/v2/post/" || pathname === "/api/v2/post") && req.method === "POST") {
    const buf = await readBodyBuffer(req, 25 * 1024 * 1024);
    const id = createHash("sha256").update(buf).digest("hex").slice(0, 20);
    const sharePath = join(SHARES_DIR, `${id}.bin`);
    await writeFile(sharePath, buf, { mode: 0o600 });
    return sendJson(res, 200, { id });
  }

  const shareMatch = pathname.match(/^\/api\/v2\/([a-f0-9]{8,64})\/?$/);
  if (shareMatch && req.method === "GET") {
    const sharePath = join(SHARES_DIR, `${shareMatch[1]}.bin`);
    try {
      const buf = await readFile(sharePath);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=31536000",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(buf);
      return;
    } catch {
      return sendJson(res, 404, { error: "Shared scene not found" });
    }
  }

  // 3. Technical Illustration (Carl) Bridge (/api/carl/presets)
  if (pathname === "/api/carl/presets" && req.method === "GET") {
    return sendJson(res, 200, { presets: CARL_PRESETS });
  }

  // 4. Self-Hosted AI Text-to-Diagram SSE Streaming (/v1/ai/text-to-diagram/chat-streaming)
  if (pathname === "/v1/ai/text-to-diagram/chat-streaming" && req.method === "POST") {
    const body = JSON.parse((await readBodyBuffer(req, 2 * 1024 * 1024)).toString("utf8") || "{}");
    const generatedText = await generateMermaidWithAI(body.messages || []);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-RateLimit-Limit": "1000",
      "X-RateLimit-Remaining": "999",
    });
    const chunkSize = 64;
    for (let i = 0; i < generatedText.length; i += chunkSize) {
      const slice = generatedText.slice(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ type: "content", delta: slice })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  // 5. Self-Hosted AI Diagram-to-Code SSE Streaming (/v1/ai/diagram-to-code/generate-streaming)
  if (pathname === "/v1/ai/diagram-to-code/generate-streaming" && req.method === "POST") {
    const body = JSON.parse((await readBodyBuffer(req, 10 * 1024 * 1024)).toString("utf8") || "{}");
    const texts = Array.isArray(body.texts) ? body.texts : String(body.texts || "").split("\n").filter(Boolean);
    const title = texts[0] || "Generated UI Component";
    const itemsHtml = (texts.length ? texts : ["Header", "Content Panel", "Action Button"])
      .map(
        (t) =>
          `<div class="card"><div class="card-title">${String(t)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</div><div class="card-meta">Interactive block</div></div>`,
      )
      .join("\n      ");
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${String(title).replace(/</g, "&lt;")}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; }
    .container { max-width: 840px; margin: 0 auto; }
    h1 { font-size: 1.4rem; margin-bottom: 16px; color: #38bdf8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 16px; }
    .card-title { font-weight: 600; margin-bottom: 6px; }
    .card-meta { font-size: 0.8rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${String(title).replace(/</g, "&lt;")}</h1>
    <div class="grid">
      ${itemsHtml}
    </div>
  </div>
</body>
</html>`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "content", delta: html })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  return sendJson(res, 404, { error: "API route not found" });
}

async function serveStatic(req, res, url) {
  let reqPath = decodeURIComponent(url.pathname);
  if (reqPath === "/") reqPath = "/index.html";
  const normalized = normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = resolve(STATIC_ROOT, `.${normalized}`);
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) {
    // SPA fallback for non-asset routes
    if (!extname(reqPath)) {
      filePath = join(STATIC_ROOT, "index.html");
      fileStat = await stat(filePath).catch(() => null);
    }
    if (!fileStat || !fileStat.isFile()) {
      res.writeHead(404, { "X-Content-Type-Options": "nosniff" });
      res.end("Not Found");
      return;
    }
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": String(fileStat.size),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    ...(ext === ".html" ? { "Cache-Control": "no-cache" } : { "Cache-Control": "public, max-age=31536000, immutable" }),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

await ensureStorage();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (
      url.pathname === "/healthz" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/v1/ai/")
    ) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (err) {
    const status = err?.statusCode || 500;
    sendJson(res, status, { error: err?.message || "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Excalidraw Homeport Studio listening on http://${HOST}:${PORT} (data: ${DATA_DIR})`);
});
