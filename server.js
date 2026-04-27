// Local web server for claudetovideo.
//
// Architecture is intentionally thin so swapping the filesystem for
// Firebase Storage and the in-memory job map for Firestore is a small
// diff later (phase 2). No persistence across restarts — fine for local.

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { convert } = require('./src/convert.js');

const PORT = Number(process.env.PORT) || 3000;
// DATA_DIR is overridable so the Docker image can point it at /tmp (Cloud
// Run's only writable location). Defaults to a local ./.jobs folder.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '.jobs');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Quality preset for hosted/local UI use. Max-quality defaults would take
// ~19 minutes per 15s film — unacceptable for a web flow. These defaults
// render a 15s film in ~60–90 seconds while still looking sharp.
const SERVER_QUALITY = {
  fps: 30,
  supersample: 1,
  crf: 20,
  preset: 'medium',
};

// Stricter limits than the CLI default — public hosting must reject hostile
// or accidental long renders aggressively.
const SERVER_LIMITS = {
  maxDuration: Number(process.env.MAX_DURATION) || 30,
  maxFrames: Number(process.env.MAX_FRAMES) || 1800,
  frameTimeout: Number(process.env.FRAME_TIMEOUT) || 10000,
};

const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR) || 5;
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024;

// ── Job model ────────────────────────────────────────────────────────────
const jobs = new Map();
const pending = [];
let activeJobId = null;
let shuttingDown = false;

function publicJob(j) {
  return {
    id: j.id,
    filename: j.filename,
    status: j.status,
    progress: j.progress,
    error: j.error || null,
    createdAt: j.createdAt,
    finishedAt: j.finishedAt || null,
    hasOutput: !!j.output,
  };
}

// ── SSE broadcast ────────────────────────────────────────────────────────
const sseClients = new Set();
function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch {}
  }
}
function emitJob(job) {
  broadcast({ type: 'job', job: publicJob(job) });
}

// ── Queue worker ─────────────────────────────────────────────────────────
async function processQueue() {
  if (shuttingDown || activeJobId || pending.length === 0) return;
  const job = pending.shift();
  activeJobId = job.id;
  job.status = 'processing';
  job.progress = 0;
  emitJob(job);

  const outPath = path.join(DATA_DIR, `${job.id}.mp4`);
  let lastEmitAt = 0;

  try {
    await convert({
      inputPath: job.inputPath,
      outputPath: outPath,
      ...SERVER_QUALITY,
      ...SERVER_LIMITS,
      silent: true,
      onProgress: ({ frame, total }) => {
        job.progress = frame / total;
        // Throttle broadcasts to ~5Hz to keep the wire quiet.
        const now = Date.now();
        if (now - lastEmitAt > 200 || frame === total) {
          lastEmitAt = now;
          emitJob(job);
        }
      },
    });
    job.output = outPath;
    job.status = 'done';
    job.progress = 1;
    job.finishedAt = Date.now();
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
    job.finishedAt = Date.now();
    console.error(`[job ${job.id}] ${err.stack || err.message}`);
  } finally {
    // Remove the uploaded source; keep the output so the user can download.
    try {
      fs.unlinkSync(job.inputPath);
    } catch {}
    activeJobId = null;
    emitJob(job);
    processQueue();
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────
const app = express();
// Behind Firebase Hosting / Cloud Run the real client IP lives in
// X-Forwarded-For. Trusting the first hop is safe because these are
// Google-managed front ends.
app.set('trust proxy', 1);
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.use(express.static(path.join(__dirname, 'public')));

// Per-IP rate limit on the upload endpoint. SSE/download endpoints are
// unguarded since they're cheap and a client only reaches them after a
// successful upload.
const convertLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: RATE_LIMIT_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: `Rate limit: ${RATE_LIMIT_PER_HOUR} renders per hour per IP.` },
});

// multer's default diskStorage writes files without an extension. Playwright
// then loads them via file:// and Chromium treats extensionless files as
// text/plain, so the bundle's inline <script> never runs. Force a `.html`
// suffix so the browser parses it as HTML.
const storage = multer.diskStorage({
  destination: DATA_DIR,
  filename: (_req, _file, cb) => {
    cb(null, `${randomUUID()}.html`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_, file, cb) => {
    const ok = /\.html?$/i.test(file.originalname) || /html/.test(file.mimetype);
    cb(ok ? null : new Error('Only .html files are accepted'), ok);
  },
});

// Magic-byte check on disk: client-supplied mimetype/ext are spoofable, so
// peek at the file header before we hand it to Playwright. Anything that
// doesn't look like HTML gets removed and rejected at the API layer.
function looksLikeHtml(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString('utf8');
    return /<!doctype\s+html|<html[\s>]/i.test(head);
  } catch {
    return false;
  }
}

app.post('/api/convert', convertLimiter, upload.single('file'), (req, res) => {
  if (shuttingDown) return res.status(503).json({ error: 'Server is shutting down' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (!looksLikeHtml(req.file.path)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(400).json({ error: 'File does not appear to be HTML' });
  }

  const id = randomUUID();
  const job = {
    id,
    filename: req.file.originalname,
    status: 'queued',
    progress: 0,
    inputPath: req.file.path,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  pending.push(job);
  emitJob(job);
  processQueue();
  res.json({ id });
});

app.get('/api/jobs', (_req, res) => {
  res.json([...jobs.values()].map(publicJob));
});

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(
    `data: ${JSON.stringify({ type: 'snapshot', jobs: [...jobs.values()].map(publicJob) })}\n\n`,
  );
  sseClients.add(res);
  // Keepalive ping every 15s — proxies often kill idle connections.
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {}
  }, 15000);
  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

app.get('/api/download/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !job.output || !fs.existsSync(job.output)) {
    return res.status(404).end();
  }
  const niceName = (job.filename.replace(/\.html?$/i, '') || 'export') + '.mp4';
  res.download(job.output, niceName);
});

// multer error handler (e.g. file size or type)
app.use((err, _req, res, _next) => {
  if (err) return res.status(400).json({ error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`claudetovideo server → http://localhost:${PORT}`);
  console.log(`  quality preset: ${JSON.stringify(SERVER_QUALITY)}`);
  console.log(`  limits: ${JSON.stringify(SERVER_LIMITS)}, rate: ${RATE_LIMIT_PER_HOUR}/h`);
});

// Graceful shutdown for Cloud Run / docker stop. Mark pending jobs as
// errored, stop accepting new ones, give the active job up to 30s to
// finish, then exit.
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, draining...`);

  for (const job of pending) {
    job.status = 'error';
    job.error = 'Server shutting down, please retry';
    job.finishedAt = Date.now();
    emitJob(job);
  }
  pending.length = 0;

  server.close(() => {
    console.log('HTTP server closed.');
  });

  const start = Date.now();
  const interval = setInterval(() => {
    if (!activeJobId) {
      clearInterval(interval);
      console.log('Drain complete.');
      process.exit(0);
    }
    if (Date.now() - start > 30_000) {
      clearInterval(interval);
      console.warn('Drain timeout (30s); exiting with active job still running.');
      process.exit(0);
    }
  }, 500);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
