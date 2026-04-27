const path = require('path');

// Pure CLI argv parser. Throws on invalid input; never calls process.exit.
// Tested in test/parse-args.test.js without spawning a subprocess.

const DEFAULTS = {
  fps: 60,
  supersample: 2,
  crf: 15,
  preset: 'slow',
  headed: false,
  verbose: false,
  maxDuration: 60,
  maxFrames: 7200,
  frameTimeout: 15000,
};

const VALID_PRESETS = new Set([
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
]);

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (a === '-o' || a === '--output') {
      args.output = argv[++i];
    } else if (a === '--fps') {
      args.fps = parseFloat(argv[++i]);
    } else if (a === '--ss' || a === '--supersample') {
      args.supersample = parseInt(argv[++i], 10);
    } else if (a === '--crf') {
      args.crf = parseInt(argv[++i], 10);
    } else if (a === '--preset') {
      args.preset = argv[++i];
    } else if (a === '--max-duration') {
      args.maxDuration = parseFloat(argv[++i]);
    } else if (a === '--max-frames') {
      args.maxFrames = parseInt(argv[++i], 10);
    } else if (a === '--frame-timeout') {
      args.frameTimeout = parseInt(argv[++i], 10);
    } else if (a === '--vtime-duration') {
      args.vtimeDuration = parseFloat(argv[++i]);
    } else if (a === '--vtime-width') {
      args.vtimeWidth = parseInt(argv[++i], 10);
    } else if (a === '--vtime-height') {
      args.vtimeHeight = parseInt(argv[++i], 10);
    } else if (a === '--fast') {
      args.supersample = 1;
      args.crf = 20;
      args.preset = 'medium';
    } else if (a === '--headed') {
      args.headed = true;
    } else if (a === '--verbose') {
      args.verbose = true;
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown option: ${a}`);
    } else {
      rest.push(a);
    }
  }

  if (args.help) return args;

  if (rest.length === 0) {
    throw new Error('Expected exactly one input file. Pass --help for usage.');
  }
  if (rest.length > 1) {
    throw new Error(`Expected exactly one input file, got ${rest.length}. Pass --help for usage.`);
  }
  args.input = rest[0];

  if (!Number.isFinite(args.fps) || args.fps <= 0) {
    throw new Error('--fps must be a positive number');
  }
  if (!Number.isFinite(args.supersample) || args.supersample < 1 || args.supersample > 4) {
    throw new Error('--ss must be 1, 2, 3, or 4');
  }
  if (!Number.isFinite(args.crf) || args.crf < 0 || args.crf > 51) {
    throw new Error('--crf must be between 0 and 51');
  }
  if (!VALID_PRESETS.has(args.preset)) {
    throw new Error(
      `--preset must be one of: ${[...VALID_PRESETS].join(', ')} (got "${args.preset}")`,
    );
  }
  if (!Number.isFinite(args.maxDuration) || args.maxDuration <= 0) {
    throw new Error('--max-duration must be a positive number');
  }
  if (!Number.isFinite(args.maxFrames) || args.maxFrames <= 0) {
    throw new Error('--max-frames must be a positive integer');
  }
  if (!Number.isFinite(args.frameTimeout) || args.frameTimeout < 100) {
    throw new Error('--frame-timeout must be at least 100 (ms)');
  }
  if (
    args.vtimeDuration != null &&
    (!Number.isFinite(args.vtimeDuration) || args.vtimeDuration <= 0)
  ) {
    throw new Error('--vtime-duration must be a positive number');
  }
  if (args.vtimeWidth != null && (!Number.isInteger(args.vtimeWidth) || args.vtimeWidth < 16)) {
    throw new Error('--vtime-width must be an integer ≥ 16');
  }
  if (args.vtimeHeight != null && (!Number.isInteger(args.vtimeHeight) || args.vtimeHeight < 16)) {
    throw new Error('--vtime-height must be an integer ≥ 16');
  }

  if (!args.output) {
    const p = path.parse(args.input);
    args.output = path.join(p.dir, p.name + '.mp4');
  }

  return args;
}

module.exports = { parseArgs, DEFAULTS, VALID_PRESETS };
