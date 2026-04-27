const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');
const { MIN_DIM, MAX_DIM } = require('./sniff.js');
const { StageNotFoundError, StageDimensionsError, FrameTimeoutError } = require('./errors.js');

// Strategy B — virtual-time capture. For Claude Design HTML that doesn't use
// React/Stage (vanilla rAF + performance.now timeline). We override
// performance.now / Date.now / requestAnimationFrame so the page only
// advances time when we tell it to from Node, then take a screenshot per
// virtual frame. Fully deterministic; works on any rAF-driven animation.

// Init script — runs before any page script, freezes time at 0 until Node
// advances it. setTimeout/setInterval intentionally untouched so one-shot
// boot timeouts (overlay dismissal, font kickoff) can still fire during
// the warmup window.
const VTIME_INIT = `
(function () {
  if (window.__vtime) return;
  let virtualTimeMs = 0;

  performance.now = function () { return virtualTimeMs; };
  Date.now = function () { return virtualTimeMs; };

  const queue = [];
  let nextId = 1;
  window.requestAnimationFrame = function (cb) {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    const i = queue.findIndex(x => x.id === id);
    if (i >= 0) queue.splice(i, 1);
  };

  window.__vtime = {
    setTime(ms) { virtualTimeMs = ms; },
    getTime() { return virtualTimeMs; },
    queueLength() { return queue.length; },
    flush() {
      // Drain whatever is currently queued. Callbacks pushed during this
      // run land in the next batch — that's exactly what we want, since
      // most rAF loops re-schedule themselves at the end of every tick.
      const batch = queue.splice(0);
      for (const { cb } of batch) {
        try { cb(virtualTimeMs); } catch (e) { console.error('[rAF cb]', e); }
      }
      return batch.length;
    },
  };
})();
`;

// Pull static metadata out of the HTML so we don't have to rely on runtime
// exposure. Two sources: (a) Claude Design's bundler manifest with gzipped
// JS assets, (b) plain inline <script> bodies. Returns {duration, width,
// height} with any of them possibly null. Best-effort — if we can't find
// it the caller falls back to defaults or a CLI override.
function scanForMeta(src, acc) {
  if (acc.duration == null) {
    const dm = src.match(/\b(?:const|let|var)\s+DURATION\s*=\s*([\d.]+)/);
    if (dm) acc.duration = parseFloat(dm[1]);
  }
  if (acc.width == null) {
    const wm = src.match(/style\.width\s*=\s*['"](\d+)px['"]/);
    if (wm) acc.width = parseInt(wm[1], 10);
  }
  if (acc.height == null) {
    const hm = src.match(/style\.height\s*=\s*['"](\d+)px['"]/);
    if (hm) acc.height = parseInt(hm[1], 10);
  }
}

function sniffMetaFromHtml(htmlPath) {
  let html;
  try {
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch {
    return { duration: null, width: null, height: null };
  }
  const acc = { duration: null, width: null, height: null };

  // (a) Bundler manifest path: gunzip each JS asset and scan its source.
  const manifestMatch = html.match(/<script type="__bundler\/manifest"[^>]*>([\s\S]*?)<\/script>/);
  if (manifestMatch) {
    let manifest;
    try {
      manifest = JSON.parse(manifestMatch[1]);
    } catch {
      manifest = null;
    }
    if (manifest) {
      for (const entry of Object.values(manifest)) {
        if (!entry || !entry.mime || !entry.mime.includes('javascript')) continue;
        try {
          let buf = Buffer.from(entry.data, 'base64');
          if (entry.compressed) buf = zlib.gunzipSync(buf);
          scanForMeta(buf.toString('utf8'), acc);
        } catch {
          // skip unreadable entry
        }
      }
    }
  }

  // (b) Fallback: scan all plain inline <script> bodies (skip manifest /
  // template / external src=... entries the bundler runtime owns).
  if (acc.duration == null || acc.width == null || acc.height == null) {
    const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = scriptRe.exec(html)) !== null) {
      const attrs = m[1] || '';
      if (/type="__bundler\//.test(attrs)) continue;
      if (/\bsrc\s*=/.test(attrs)) continue;
      scanForMeta(m[2], acc);
      if (acc.duration != null && acc.width != null && acc.height != null) break;
    }
  }

  return acc;
}

async function startVtimeCapture({
  inputPath,
  browser,
  log,
  supersample = 2,
  frameTimeout = 15000,
  warmupMs = 1500,
  // CLI overrides — pass through from convert() if user wants to force values.
  durationOverride = null,
  widthOverride = null,
  heightOverride = null,
}) {
  const meta = sniffMetaFromHtml(inputPath);

  const duration = durationOverride ?? meta.duration ?? 30;
  const width = widthOverride ?? meta.width ?? 1920;
  const height = heightOverride ?? meta.height ?? 1080;

  if (meta.duration == null && durationOverride == null) {
    log.warn(`[vtime] DURATION not detected in bundle; defaulting to ${duration}s.`);
  }
  if (
    (meta.width == null || meta.height == null) &&
    widthOverride == null &&
    heightOverride == null
  ) {
    log.warn(`[vtime] dimensions not detected; defaulting to ${width}×${height}.`);
  }

  if (
    width < MIN_DIM ||
    width > MAX_DIM ||
    height < MIN_DIM ||
    height > MAX_DIM ||
    !(duration > 0)
  ) {
    throw new StageDimensionsError(
      `Resolved dimensions out of range (${width}×${height}, duration=${duration}s). ` +
        `Expected width/height in [${MIN_DIM}, ${MAX_DIM}] and duration > 0.`,
      { width, height, duration, fps: 60 },
    );
  }

  const context = await browser.newContext({
    deviceScaleFactor: supersample,
    viewport: { width, height },
  });
  await context.addInitScript({ content: VTIME_INIT });

  const page = await context.newPage();
  page.on('pageerror', (err) => log.warn(`[page] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') log.warn(`[console] ${msg.text()}`);
  });

  const fileUrl = pathToFileURL(path.resolve(inputPath)).href;
  log.info(`Loading ${fileUrl} (vtime mode)`);
  await page.goto(fileUrl, { waitUntil: 'load' });

  log.info(`vtime warmup ${warmupMs}ms (settling boot setTimeouts / fonts)…`);
  await page.waitForTimeout(warmupMs);
  try {
    await page.evaluate(() => document.fonts && document.fonts.ready);
  } catch {}

  // Sanity check: the page should have queued at least one rAF callback
  // (its render loop). If queue is empty, this isn't an rAF-driven file.
  const queued = await page.evaluate(() => window.__vtime.queueLength());
  if (queued === 0) {
    await context.close();
    throw new StageNotFoundError(
      [
        'Could not detect a render loop in this HTML.',
        '',
        "Tried both Claude Design's React/Stage component and a virtual-time",
        'capture for vanilla requestAnimationFrame animations — neither matched.',
        '',
        'Most common causes:',
        "  1. This isn't an HTML file from Claude Design.",
        "  2. Claude Design ships a new format we don't recognize yet.",
        '  3. An external resource (font/CDN) is blocking the page from loading.',
        '',
        'Debug:',
        '  claudetovideo input.html out.mp4 --headed --verbose',
        '',
        'Report bugs: https://github.com/Lolarz20/claudetovideo/issues',
      ].join('\n'),
      { strategy: 'vtime', queued: 0, meta },
    );
  }

  log.info(
    `vtime: ${width}×${height}, duration=${duration}s, supersample=${supersample}× (queued rAF: ${queued})`,
  );

  const dims = { width, height, duration, fps: 60 };

  function withTimeout(promise, ms, frame, t) {
    let timer;
    const timeoutP = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new FrameTimeoutError(
            `Frame ${frame} (t=${t.toFixed(3)}s) timed out after ${ms}ms (vtime).\n` +
              'Likely cause: a page rAF callback is hanging.\n' +
              `Try: --frame-timeout ${ms * 2} or --headed to debug.`,
            frame,
            t,
          ),
        );
      }, ms);
    });
    return Promise.race([promise, timeoutP]).finally(() => clearTimeout(timer));
  }

  const clip = { x: 0, y: 0, width, height };

  async function renderFrameAt(t, frameIndex) {
    const work = (async () => {
      await page.evaluate(
        ({ tMs }) => {
          window.__vtime.setTime(tMs);
          // Two flushes: first runs the loop callback that was queued last
          // tick, second catches whatever it just re-scheduled. Three is
          // overkill but cheap insurance for nested rAF chains.
          window.__vtime.flush();
          window.__vtime.flush();
          window.__vtime.flush();
        },
        { tMs: t * 1000 },
      );
      return page.screenshot({ type: 'png', clip, animations: 'disabled' });
    })();
    return withTimeout(work, frameTimeout, frameIndex, t);
  }

  async function renderFrame(t, frameIndex = 0) {
    return renderFrameAt(t, frameIndex);
  }

  async function close() {
    await context.close();
  }

  return { dims, renderFrame, close, strategy: 'vtime' };
}

module.exports = { startVtimeCapture, sniffMetaFromHtml };
