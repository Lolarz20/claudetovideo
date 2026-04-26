const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startCapture } = require('./capture.js');
const { openEncoder } = require('./encode.js');

async function convert({
  inputPath,
  outputPath,
  fps = 60,
  supersample = 2,
  crf = 15,
  preset = 'slow',
  headed = false,
  verbose = false,
  onProgress = null,
  silent = false,
}) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  const absIn = path.resolve(inputPath);
  const absOut = path.resolve(outputPath);

  const log = silent
    ? {
        info: () => {},
        warn: () => {},
        debug: () => {},
      }
    : {
        info: (m) => console.log(m),
        warn: (m) => console.warn(m),
        debug: verbose ? (m) => console.log(m) : () => {},
      };

  log.info(`Launching Chromium (${headed ? 'headed' : 'headless'})…`);
  const browser = await chromium.launch({ headless: !headed });

  let capture, encoder;
  try {
    capture = await startCapture({ inputPath: absIn, browser, log, supersample });

    const { width, height, duration } = capture.dims;
    const totalFrames = Math.round(duration * fps);
    // With supersample>1 the PNG from Playwright comes back at physical
    // pixels (width × supersample). ffmpeg downsamples to the logical Stage
    // size with Lanczos for anti-aliased output. supersample=1 skips scale.
    const scaleTo = supersample > 1 ? { width, height } : null;

    log.info(
      `Rendering ${totalFrames} frames @ ${fps}fps, crf=${crf}, preset=${preset} → ${absOut}`,
    );
    encoder = openEncoder({ outPath: absOut, fps, crf, preset, scaleTo, verbose });

    const progressEvery = Math.max(1, Math.floor(totalFrames / 20));
    const t0 = Date.now();

    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      const buf = await capture.renderFrame(t);
      await encoder.write(buf);

      const elapsed = (Date.now() - t0) / 1000;
      const eta = (elapsed / (i + 1)) * (totalFrames - i - 1);
      if (onProgress) {
        try {
          onProgress({ frame: i + 1, total: totalFrames, elapsed, eta });
        } catch {}
      }
      if (i % progressEvery === 0 || i === totalFrames - 1) {
        const pct = (((i + 1) / totalFrames) * 100).toFixed(1);
        log.info(
          `  frame ${i + 1}/${totalFrames} (${pct}%) — ${elapsed.toFixed(1)}s elapsed, ~${eta.toFixed(1)}s remaining`,
        );
      }
    }

    log.info('Finalizing MP4 (ffmpeg may take a moment at slow preset)…');
    await encoder.end();

    const stat = fs.statSync(absOut);
    log.info(
      `Done → ${absOut} (${(stat.size / 1024 / 1024).toFixed(2)} MB, ${totalFrames} frames, ${duration}s @ ${fps}fps)`,
    );
  } catch (err) {
    if (encoder) {
      try {
        encoder.kill();
      } catch {}
    }
    throw err;
  } finally {
    if (capture) {
      try {
        await capture.close();
      } catch {}
    }
    try {
      await browser.close();
    } catch {}
  }
}

module.exports = { convert };
