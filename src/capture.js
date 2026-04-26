const path = require('path');
const { pathToFileURL } = require('url');

// Boots the bundle in headless Chromium, waits for Stage to mount, and
// returns a frame iterator. We do the mount/probe before the encoder is
// spawned so that failures here don't leave orphan ffmpeg processes.
async function startCapture({ inputPath, browser, log, supersample = 2 }) {
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
    throw new Error(`Stage did not mount within 60s. Diagnostics: ${JSON.stringify(diag)}`);
  }

  const dims = await page.evaluate(() => window.__stageProps);
  log.info(
    `Stage: ${dims.width}×${dims.height}, duration=${dims.duration}s, supersample=${supersample}×`,
  );

  const BAR_H = 44;
  await page.setViewportSize({ width: dims.width, height: dims.height + BAR_H });

  await page.addStyleTag({
    content: `*, *::before, *::after { animation-play-state: paused !important; }`,
  });

  await page.evaluate(() => window.__stage.setPlaying(false));

  const clip = { x: 0, y: 0, width: dims.width, height: dims.height };

  async function renderFrame(t) {
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
  }

  async function close() {
    await context.close();
  }

  return { dims, renderFrame, close };
}

module.exports = { startCapture };
