const { StageNotFoundError } = require('./errors.js');
const { startStageCapture } = require('./capture-stage.js');
const { startVtimeCapture } = require('./capture-vtime.js');

// Dispatcher. Tries Strategy A (React/Stage) first with a short timeout —
// the success path for Claude Design's React-based bundles. If Stage doesn't
// mount in time, falls back to Strategy B (virtual-time capture) for
// vanilla-rAF animations.
//
// Each strategy returns the same { dims, renderFrame, close } shape so
// convert.js doesn't care which one we picked.
async function startCapture({
  inputPath,
  browser,
  log,
  supersample = 2,
  frameTimeout = 15000,
  // Stage path: how long to wait for a Stage component before falling
  // through to vtime. 8s comfortably covers a React mount + first render
  // on a slow CI box but doesn't make vanilla-rAF files feel sluggish.
  stageTimeout = 8000,
  // vtime path: real-time wait after page load to let one-shot setTimeouts
  // (overlay dismissal, font CSS warmup) settle before we start capturing.
  vtimeWarmupMs = 1500,
  // Optional CLI overrides for vtime when the bundle's metadata can't
  // be statically sniffed.
  vtimeDuration = null,
  vtimeWidth = null,
  vtimeHeight = null,
}) {
  try {
    return await startStageCapture({
      inputPath,
      browser,
      log,
      supersample,
      frameTimeout,
      stageTimeout,
    });
  } catch (err) {
    if (!(err instanceof StageNotFoundError)) throw err;
    log.info('Stage component not detected — falling back to virtual-time capture.');
    return await startVtimeCapture({
      inputPath,
      browser,
      log,
      supersample,
      frameTimeout,
      warmupMs: vtimeWarmupMs,
      durationOverride: vtimeDuration,
      widthOverride: vtimeWidth,
      heightOverride: vtimeHeight,
    });
  }
}

module.exports = { startCapture };
