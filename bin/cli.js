#!/usr/bin/env node
const { convert } = require('../src/convert.js');
const { parseArgs } = require('../src/parse-args.js');

function printUsage() {
  console.log(`
claudetovideo — convert Claude Design HTML animations to MP4

Usage:
  claudetovideo <input.html> [options]

Options:
  -o, --output <path>    Output MP4 path (default: <input>.mp4)
  --fps <n>              Frame rate (default: 60)
  --ss <n>               Supersample factor (default: 2, use 1 to disable).
                         Renders at n× resolution and downsamples with
                         Lanczos — big quality boost on text/thin lines.
  --crf <n>              libx264 CRF, 0=lossless, 15=near-lossless (default),
                         18=visually-lossless, 23=default.
  --preset <name>        libx264 preset: ultrafast, superfast, veryfast,
                         faster, fast, medium, slow (default), slower, veryslow.
  --max-duration <sec>   Reject Stage longer than N seconds (default: 60).
                         Safety limit; raise if you trust the input.
  --max-frames <n>       Reject if duration*fps would exceed N (default: 7200).
  --frame-timeout <ms>   Per-frame render timeout (default: 15000).
  --fast                 Shortcut: --ss 1 --crf 20 --preset medium.
                         About 3× faster, slightly lower quality.
  --headed               Show browser window (debug)
  --verbose              Show ffmpeg output and full diagnostics on error
  -h, --help             Show this help

Examples:
  claudetovideo film.html
  claudetovideo film.html -o out.mp4 --fps 30
  claudetovideo film.html --fast              # quick preview
  claudetovideo film.html --crf 0 --ss 2      # archival lossless
`);
}

(async () => {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  try {
    await convert({
      inputPath: args.input,
      outputPath: args.output,
      fps: args.fps,
      supersample: args.supersample,
      crf: args.crf,
      preset: args.preset,
      headed: args.headed,
      verbose: args.verbose,
      maxDuration: args.maxDuration,
      maxFrames: args.maxFrames,
      frameTimeout: args.frameTimeout,
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
})();
