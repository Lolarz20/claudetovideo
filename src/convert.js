const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startCapture } = require('./capture.js');
const { openEncoder } = require('./encode.js');
const { DurationLimitError } = require('./errors.js');

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
  maxDuration = 60,
  maxFrames = 7200,
  frameTimeout = 15000,
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
  // --disable-dev-shm-usage avoids a crash in containers where /dev/shm
  // is too small for Chromium's IPC. --no-sandbox is harmless inside the
  // already-sandboxed Cloud Run container and required when the image
  // doesn't grant the binary the kernel capabilities it expects.
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let capture, encoder;
  try {
    capture = await startCapture({ inputPath: absIn, browser, log, supersample, frameTimeout });

    const { width, height, duration } = capture.dims;

    // Reject hostile / unintended long renders before we sink ffmpeg time.
    if (duration > maxDuration) {
      throw new DurationLimitError(
        `Stage duration ${duration.toFixed(1)}s exceeds --max-duration (${maxDuration}s). ` +
          `Pass --max-duration ${Math.ceil(duration) + 1} to allow.`,
        duration,
        maxDuration,
      );
    }

    const totalFrames = Math.round(duration * fps);
    if (totalFrames > maxFrames) {
      throw new DurationLimitError(
        `Total frames ${totalFrames} (duration ${duration}s × fps ${fps}) exceeds --max-frames (${maxFrames}). ` +
          `Pass --max-frames ${totalFrames + 1} to allow, or lower --fps.`,
        totalFrames,
        maxFrames,
      );
    }

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
      const buf = await capture.renderFrame(t, i);
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
