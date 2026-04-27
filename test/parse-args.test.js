import { describe, expect, test } from 'vitest';
import { parseArgs, DEFAULTS } from '../src/parse-args.js';

describe('parseArgs', () => {
  test('rejects empty argv', () => {
    expect(() => parseArgs([])).toThrow(/Expected exactly one input file/);
  });

  test('rejects multiple positionals', () => {
    expect(() => parseArgs(['a.html', 'b.html'])).toThrow(/Expected exactly one input file/);
  });

  test('rejects non-numeric --fps', () => {
    expect(() => parseArgs(['a.html', '--fps', 'abc'])).toThrow(/--fps must be/);
  });

  test('rejects --ss out of range', () => {
    expect(() => parseArgs(['a.html', '--ss', '5'])).toThrow(/--ss must be/);
    expect(() => parseArgs(['a.html', '--ss', '0'])).toThrow(/--ss must be/);
  });

  test('rejects --crf out of range', () => {
    expect(() => parseArgs(['a.html', '--crf', '-1'])).toThrow(/--crf must be/);
    expect(() => parseArgs(['a.html', '--crf', '52'])).toThrow(/--crf must be/);
  });

  test('rejects unknown flag', () => {
    expect(() => parseArgs(['a.html', '--unknown'])).toThrow(/Unknown option/);
  });

  test('rejects invalid preset', () => {
    expect(() => parseArgs(['a.html', '--preset', 'turbo'])).toThrow(/--preset must be/);
  });

  test('--help short-circuits with no input', () => {
    const r = parseArgs(['--help']);
    expect(r.help).toBe(true);
    expect(r.input).toBeUndefined();
  });

  test('-h short flag works', () => {
    expect(parseArgs(['-h']).help).toBe(true);
  });

  test('populates defaults when only input given', () => {
    const r = parseArgs(['film.html']);
    expect(r.input).toBe('film.html');
    expect(r.fps).toBe(DEFAULTS.fps);
    expect(r.supersample).toBe(DEFAULTS.supersample);
    expect(r.crf).toBe(DEFAULTS.crf);
    expect(r.preset).toBe(DEFAULTS.preset);
    expect(r.maxDuration).toBe(DEFAULTS.maxDuration);
    expect(r.maxFrames).toBe(DEFAULTS.maxFrames);
    expect(r.frameTimeout).toBe(DEFAULTS.frameTimeout);
    // Default output derives from input.
    expect(r.output).toMatch(/film\.mp4$/);
  });

  test('--fast applies preset shortcut', () => {
    const r = parseArgs(['film.html', '--fast']);
    expect(r.supersample).toBe(1);
    expect(r.crf).toBe(20);
    expect(r.preset).toBe('medium');
  });

  test('explicit -o overrides derived output', () => {
    const r = parseArgs(['film.html', '-o', 'out.mp4']);
    expect(r.output).toBe('out.mp4');
  });

  test('parses --max-duration, --max-frames, --frame-timeout', () => {
    const r = parseArgs([
      'film.html',
      '--max-duration',
      '120',
      '--max-frames',
      '14400',
      '--frame-timeout',
      '30000',
    ]);
    expect(r.maxDuration).toBe(120);
    expect(r.maxFrames).toBe(14400);
    expect(r.frameTimeout).toBe(30000);
  });

  test('rejects --max-duration <= 0', () => {
    expect(() => parseArgs(['film.html', '--max-duration', '0'])).toThrow(/--max-duration must be/);
  });

  test('rejects --frame-timeout < 100', () => {
    expect(() => parseArgs(['film.html', '--frame-timeout', '50'])).toThrow(
      /--frame-timeout must be/,
    );
  });
});
