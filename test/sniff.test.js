import { describe, expect, test } from 'vitest';
import {
  isStageProps,
  isTimelineValue,
  typeNameContainsStage,
  createSniffState,
} from '../src/sniff.js';

describe('isStageProps', () => {
  test('accepts plausible Stage props', () => {
    expect(isStageProps({ width: 1920, height: 1080, duration: 15 })).toBe(true);
    expect(isStageProps({ width: 16, height: 16, duration: 0.001 })).toBe(true);
  });

  test('rejects missing fields', () => {
    expect(isStageProps({ width: 1920, height: 1080 })).toBe(false);
    expect(isStageProps({ width: 1920, duration: 5 })).toBe(false);
    expect(isStageProps({})).toBe(false);
    expect(isStageProps(null)).toBe(false);
  });

  test('rejects non-numeric values', () => {
    expect(isStageProps({ width: '1920', height: 1080, duration: 5 })).toBe(false);
  });

  test('rejects out-of-range dimensions', () => {
    expect(isStageProps({ width: 5, height: 1080, duration: 5 })).toBe(false);
    expect(isStageProps({ width: 100000, height: 1080, duration: 5 })).toBe(false);
    expect(isStageProps({ width: 1920, height: 1080, duration: 0 })).toBe(false);
    expect(isStageProps({ width: 1920, height: 1080, duration: -1 })).toBe(false);
  });
});

describe('isTimelineValue', () => {
  test('accepts a TimelineContext-shaped value', () => {
    const v = {
      time: 0,
      duration: 5,
      playing: false,
      setTime: () => {},
      setPlaying: () => {},
    };
    expect(isTimelineValue(v)).toBe(true);
  });

  test('rejects values missing setters or fields', () => {
    expect(isTimelineValue({ time: 0, duration: 5, playing: false, setTime: () => {} })).toBe(
      false,
    );
    expect(isTimelineValue({})).toBe(false);
    expect(isTimelineValue(null)).toBe(false);
    expect(isTimelineValue('not an object')).toBe(false);
  });
});

describe('typeNameContainsStage', () => {
  test('matches displayName', () => {
    expect(typeNameContainsStage({ displayName: 'Stage' })).toBe(true);
    expect(typeNameContainsStage({ displayName: 'StageWrapper' })).toBe(true);
  });

  test('matches function name as fallback', () => {
    function Stage() {}
    expect(typeNameContainsStage(Stage)).toBe(true);
  });

  test('case insensitive', () => {
    expect(typeNameContainsStage({ displayName: 'stage' })).toBe(true);
  });

  test('rejects non-Stage names', () => {
    expect(typeNameContainsStage({ displayName: 'Button' })).toBe(false);
    expect(typeNameContainsStage(null)).toBe(false);
    expect(typeNameContainsStage('div')).toBe(false);
  });
});

describe('SniffState', () => {
  test('returns null until a Stage is observed', () => {
    const s = createSniffState();
    expect(s.getStageProps()).toBeNull();
    s.observe({ name: 'Button' }, { width: 100, height: 30, label: 'OK' });
    expect(s.getStageProps()).toBeNull();
  });

  test('captures Stage on first valid observation', () => {
    const s = createSniffState();
    s.observe({ displayName: 'Stage' }, { width: 1920, height: 1080, duration: 15 });
    expect(s.getStageProps()).toEqual({ width: 1920, height: 1080, duration: 15, fps: 60 });
  });

  test('prefers candidate with displayName=Stage over no-name', () => {
    const s = createSniffState();
    // First a no-name candidate that LOOKS like Stage.
    s.observe({ name: 'Anonymous' }, { width: 800, height: 600, duration: 10 });
    expect(s.getStageProps().width).toBe(800);
    // Then a real Stage with a different size: should replace.
    s.observe({ displayName: 'Stage' }, { width: 1920, height: 1080, duration: 15 });
    expect(s.getStageProps().width).toBe(1920);
  });

  test('does not regress from named to unnamed candidate', () => {
    const s = createSniffState();
    s.observe({ displayName: 'Stage' }, { width: 1920, height: 1080, duration: 15 });
    // A no-name candidate later should NOT overwrite.
    s.observe({ name: 'Other' }, { width: 800, height: 600, duration: 5 });
    expect(s.getStageProps().width).toBe(1920);
  });

  test('without displayName, last-observed wins', () => {
    const s = createSniffState();
    s.observe({ name: 'A' }, { width: 800, height: 600, duration: 5 });
    s.observe({ name: 'B' }, { width: 1024, height: 768, duration: 8 });
    // No name → last wins.
    expect(s.getStageProps().width).toBe(1024);
  });

  test('captures TimelineContext value', () => {
    const s = createSniffState();
    const tl = {
      time: 0,
      duration: 5,
      playing: false,
      setTime: () => {},
      setPlaying: () => {},
    };
    s.observe('Provider', { value: tl });
    const got = s.getTimelineValue();
    expect(got).not.toBeNull();
    expect(got.setTime).toBe(tl.setTime);
    expect(got.setPlaying).toBe(tl.setPlaying);
    expect(got.duration).toBe(5);
  });

  test('uses default fps=60 when not provided in props', () => {
    const s = createSniffState();
    s.observe({ displayName: 'Stage' }, { width: 1920, height: 1080, duration: 15 });
    expect(s.getStageProps().fps).toBe(60);
  });

  test('honors custom fps prop', () => {
    const s = createSniffState();
    s.observe({ displayName: 'Stage' }, { width: 1920, height: 1080, duration: 15, fps: 30 });
    expect(s.getStageProps().fps).toBe(30);
  });
});
