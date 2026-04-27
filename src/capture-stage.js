const path = require('path');
const { pathToFileURL } = require('url');
const { MIN_DIM, MAX_DIM } = require('./sniff.js');
const { StageNotFoundError, StageDimensionsError, FrameTimeoutError } = require('./errors.js');

// Strategy A — React/Stage capture. Boots the bundle, waits for the Stage
// component to mount via the inject.js hook, then drives setTime/setPlaying
// from Node for deterministic frames.
//
// Throws StageNotFoundError if Stage doesn't appear within `stageTimeout`
// (default 8s — short enough that the dispatcher in capture.js can fall
// through to virtual-time capture without a long perceived stall).
async function startStageCapture({
  inputPath,
  browser,
  log,
  supersample = 2,
  frameTimeout = 15000,
  stageTimeout = 8000,
}) {
  const context = await browser.newContext({
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

  log.info(`Waiting for Stage to mount (${stageTimeout}ms)…`);
  try {
    await page.waitForFunction(() => window.__stage && window.__stageProps, null, {
      timeout: stageTimeout,
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
      `Stage not detected within ${stageTimeout}ms — falling back if vtime path is available.`,
      diag,
    );
  }

  const dims = await page.evaluate(() => window.__stageProps);
  log.info(
    `Stage: ${dims.width}×${dims.height}, duration=${dims.duration}s, supersample=${supersample}×`,
  );

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

  async function renderFrame(t, frameIndex = 0) {
    return renderFrameAt(t, frameIndex);
  }

  async function close() {
    await context.close();
  }

  return { dims, renderFrame, close, strategy: 'stage' };
}

module.exports = { startStageCapture };
