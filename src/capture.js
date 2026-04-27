const path = require('path');
const { pathToFileURL } = require('url');
const { MIN_DIM, MAX_DIM } = require('./sniff.js');
const { StageNotFoundError, StageDimensionsError, FrameTimeoutError } = require('./errors.js');

// Boots the bundle in headless Chromium, waits for Stage to mount, and
// returns a frame iterator. We do the mount/probe before the encoder is
// spawned so that failures here don't leave orphan ffmpeg processes.
async function startCapture({ inputPath, browser, log, supersample = 2, frameTimeout = 15000 }) {
  const context = await browser.newContext({
    // Render at supersample× the logical resolution; ffmpeg downsamples
    // with Lanczos later for high-quality antialiasing of fonts/thin lines.
    deviceScaleFactor: supersample,
    viewport: { width: 1280, height: 720 },
  });

  const injectSrc = require('./inject.js');
  await context.addInitScript({ content: injectSrc });

  const page = await context.newPage();
  page.on('pageerror', (err) => log.warn(`[page] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') log.warn(`[console] ${msg.text()}`);
  });

  const fileUrl = pathToFileURL(path.resolve(inputPath)).href;
  log.info(`Loading ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: 'load' });

  log.info('Waiting for Stage to mount…');
  try {
    await page.waitForFunction(() => window.__stage && window.__stageProps, null, {
      timeout: 60000,
    });
  } catch (_err) {
    const diag = await page
      .evaluate(() => ({
        hasReact: !!window.React,
        reactVersion: window.React && window.React.version,
        hasStage: !!window.__stage,
        hasStageProps: !!window.__stageProps,
        hooked: !!window.__stageHooked,
        debug: window.__stageDebug,
        rootHtmlLen: (document.getElementById('root') || { innerHTML: '' }).innerHTML.length,
        hasReactDOM: !!window.ReactDOM,
        hasBabel: !!window.Babel,
        bodyChildren: document.body ? document.body.children.length : -1,
        errElem: !!document.getElementById('__bundler_err'),
      }))
      .catch((e) => ({ evalErr: e.message }));
    await context.close();
    throw new StageNotFoundError(
      [
        "Could not detect Claude Design's Stage component within 60s.",
        '',
        'Most common causes:',
        "  1. This isn't an HTML file from Claude Design (we look for a specific React structure)",
        "  2. The Stage component is wrapped in a way we don't recognize yet",
        '  3. An external resource (font/CDN) is blocking the page from loading',
        '',
        'Debug:',
        '  claudetovideo input.html out.mp4 --headed --verbose',
        '',
        'Report bugs: https://github.com/Lolarz20/claudetovideo/issues',
      ].join('\n'),
      diag,
    );
  }

  const dims = await page.evaluate(() => window.__stageProps);
  log.info(
    `Stage: ${dims.width}×${dims.height}, duration=${dims.duration}s, supersample=${supersample}×`,
  );

  // Sanity-check dimensions before we sink time into rendering. The inject
  // heuristic already filters obvious garbage but a hostile HTML could
  // still slip a 100000×100000 stage past us.
  if (
    dims.width < MIN_DIM ||
    dims.width > MAX_DIM ||
    dims.height < MIN_DIM ||
    dims.height > MAX_DIM ||
    !(dims.duration > 0)
  ) {
    await context.close();
    throw new StageDimensionsError(
      `Stage dimensions out of range (${dims.width}×${dims.height}, duration=${dims.duration}s). ` +
        `Expected width/height in [${MIN_DIM}, ${MAX_DIM}] and duration > 0.`,
      dims,
    );
  }

  const BAR_H = 44;
  await page.setViewportSize({ width: dims.width, height: dims.height + BAR_H });

  await page.addStyleTag({
    content: `*, *::before, *::after { animation-play-state: paused !important; }`,
  });

  await page.evaluate(() => window.__stage.setPlaying(false));

  const clip = { x: 0, y: 0, width: dims.width, height: dims.height };

  // Wraps a promise in a per-frame timeout so a hung font/CDN or stuck
  // requestAnimationFrame doesn't freeze the whole render.
  function withTimeout(promise, ms, frame, t) {
    let timer;
    const timeoutP = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new FrameTimeoutError(
            `Frame ${frame} (t=${t.toFixed(3)}s) timed out after ${ms}ms.\n` +
              'Likely cause: an external resource (font/CDN) is hanging.\n' +
              `Try: --frame-timeout ${ms * 2} or --headed to debug.`,
            frame,
            t,
          ),
        );
      }, ms);
    });
    return Promise.race([promise, timeoutP]).finally(() => clearTimeout(timer));
  }

  async function renderFrameAt(t, frameIndex) {
    const work = (async () => {
      await page.evaluate((t) => {
        window.__stage.setPlaying(false);
        window.__stage.setTime(t);
      }, t);
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                if (document.fonts && document.fonts.ready) {
                  document.fonts.ready.then(resolve, resolve);
                } else resolve();
              }),
            );
          }),
      );
      return page.screenshot({ type: 'png', clip, animations: 'disabled' });
    })();
    return withTimeout(work, frameTimeout, frameIndex, t);
  }

  // Backwards-compat alias for callers that pass only t.
  async function renderFrame(t, frameIndex = 0) {
    return renderFrameAt(t, frameIndex);
  }

  async function close() {
    await context.close();
  }

  return { dims, renderFrame, close };
}

module.exports = { startCapture };
