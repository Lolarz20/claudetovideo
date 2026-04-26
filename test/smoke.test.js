import { test, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffprobe = require('ffprobe-static');
const { convert } = require('../src/convert.js');

const FIXTURE = path.resolve('test/fixtures/minimal-stage.html');

beforeAll(() => {
  if (!fs.existsSync(FIXTURE)) {
    throw new Error(`Missing fixture: ${FIXTURE}`);
  }
});

test(
  'converts minimal Stage HTML to a valid MP4',
  async () => {
    const out = path.join(os.tmpdir(), 'claudetovideo-smoke.mp4');
    fs.rmSync(out, { force: true });

    await convert({
      inputPath: FIXTURE,
      outputPath: out,
      fps: 5,
      supersample: 1,
      preset: 'ultrafast',
      crf: 30,
      silent: true,
      maxDuration: 5,
      maxFrames: 100,
      frameTimeout: 30000,
    });

    const stat = fs.statSync(out);
    expect(stat.size).toBeGreaterThan(1024);

    const meta = JSON.parse(
      execFileSync(
        ffprobe.path,
        [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_streams',
          '-count_frames',
          out,
        ],
        { encoding: 'utf8' },
      ),
    );
    const v = meta.streams.find((s) => s.codec_type === 'video');
    expect(v).toBeDefined();
    expect(v.codec_name).toBe('h264');
    expect(v.pix_fmt).toBe('yuv420p');
    // 2s × 5fps = 10 frames; allow ±1 for rounding at boundaries.
    const frames = parseInt(v.nb_read_frames || v.nb_frames, 10);
    expect(frames).toBeGreaterThanOrEqual(9);
    expect(frames).toBeLessThanOrEqual(11);

    fs.rmSync(out, { force: true });
  },
  // Cold Chromium boot + render + ffmpeg encode. CI machines vary widely.
  { timeout: 180_000 },
);
