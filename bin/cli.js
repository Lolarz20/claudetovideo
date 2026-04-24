#!/usr/bin/env node
const path = require('path');
const { convert } = require('../src/convert.js');

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
  --fast                 Shortcut: --ss 1 --crf 20 --preset medium.
                         About 3× faster, slightly lower quality.
  --headed               Show browser window (debug)
  --verbose              Show ffmpeg output
  -h, --help             Show this help

Examples:
  claudetovideo film.html
  claudetovideo film.html -o out.mp4 --fps 30
  claudetovideo film.html --fast              # quick preview
  claudetovideo film.html --crf 0 --ss 2      # archival lossless
`);
}

function parseArgs(argv) {
  const args = {
    fps: 60,
    supersample: 2,
    crf: 15,
    preset: 'slow',
    headed: false,
    verbose: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { args.help = true; }
    else if (a === '-o' || a === '--output') { args.output = argv[++i]; }
    else if (a === '--fps') { args.fps = parseInt(argv[++i], 10); }
    else if (a === '--ss' || a === '--supersample') { args.supersample = parseInt(argv[++i], 10); }
    else if (a === '--crf') { args.crf = parseInt(argv[++i], 10); }
    else if (a === '--preset') { args.preset = argv[++i]; }
    else if (a === '--fast') { args.supersample = 1; args.crf = 20; args.preset = 'medium'; }
    else if (a === '--headed') { args.headed = true; }
    else if (a === '--verbose') { args.verbose = true; }
    else if (a.startsWith('-')) { throw new Error(`Unknown option: ${a}`); }
    else { rest.push(a); }
  }
  if (args.help) return args;
  if (rest.length !== 1) throw new Error('Expected exactly one input file. Pass --help for usage.');
  args.input = rest[0];
  if (!Number.isFinite(args.fps) || args.fps <= 0) throw new Error('--fps must be a positive number');
  if (!Number.isFinite(args.supersample) || args.supersample < 1 || args.supersample > 4) {
    throw new Error('--ss must be 1, 2, 3, or 4');
  }
  if (!Number.isFinite(args.crf) || args.crf < 0 || args.crf > 51) {
    throw new Error('--crf must be between 0 and 51');
  }
  if (!args.output) {
    const p = path.parse(args.input);
    args.output = path.join(p.dir, p.name + '.mp4');
  }
  return args;
}

(async () => {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  if (args.help) { printUsage(); process.exit(0); }

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
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
})();
