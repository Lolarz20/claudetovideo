// Pure logic for picking the Stage component out of React.createElement
// observations. Lives outside inject.js so it can be unit-tested without
// a browser.
//
// inject.js feeds every (type, props) call into a SniffState; at any point
// SniffState can report whether it has found a Stage candidate and what
// the TimelineContext value (setTime/setPlaying) was.
//
// Heuristic, in priority order:
//   1. Reject props that don't have width/height/duration as positive numbers
//      with width >= 16 and height >= 16 (filters out random numeric props
//      from unrelated components).
//   2. Prefer candidates whose `type.displayName` or `type.name` contains
//      'Stage' over those that don't — Claude Design's component is named
//      Stage so when bundle metadata is preserved this is a strong signal.
//   3. If multiple non-displayName candidates exist, pick the LAST one
//      observed. Stage is typically the root, mounted last in the
//      createElement call sequence. This is a heuristic, not a guarantee.
//
// This module is intentionally pure (no globals, no DOM access) so the
// inject.js IIFE can use it via simple inlining and tests can drive it
// directly.

const MIN_DIM = 16;
const MAX_DIM = 4096;

function isStageProps(props) {
  if (!props || typeof props !== 'object') return false;
  return (
    typeof props.width === 'number' &&
    typeof props.height === 'number' &&
    typeof props.duration === 'number' &&
    props.width >= MIN_DIM &&
    props.height >= MIN_DIM &&
    props.width <= MAX_DIM &&
    props.height <= MAX_DIM &&
    props.duration > 0
  );
}

function isTimelineValue(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    typeof value.setTime === 'function' &&
    typeof value.setPlaying === 'function' &&
    'time' in value &&
    'duration' in value &&
    'playing' in value
  );
}

function typeNameContainsStage(type) {
  if (!type) return false;
  if (typeof type === 'string') return /stage/i.test(type);
  if (typeof type === 'function' || typeof type === 'object') {
    const name = type.displayName || type.name;
    return typeof name === 'string' && /stage/i.test(name);
  }
  return false;
}

function createSniffState() {
  // Stage props candidate: keep best-so-far. "Best" = displayName=Stage
  // beats no-displayName; otherwise last-seen wins.
  let stagePropsCandidate = null;
  let stagePropsHasName = false;

  // TimelineContext value: we keep the last-seen because the provider
  // value object is replaced every render (new {time}); inject.js expects
  // the latest setTime closure.
  let timelineValue = null;

  return {
    observe(type, props) {
      if (!props || typeof props !== 'object') return;

      if (isStageProps(props)) {
        const hasName = typeNameContainsStage(type);
        // Replace candidate if (a) we have nothing yet, (b) new candidate
        // has a Stage-y name and current doesn't, or (c) neither has a
        // name but new is observed later (last-wins).
        if (!stagePropsCandidate || (hasName && !stagePropsHasName) || !stagePropsHasName) {
          stagePropsCandidate = {
            width: props.width,
            height: props.height,
            duration: props.duration,
            fps: typeof props.fps === 'number' ? props.fps : 60,
          };
          stagePropsHasName = hasName;
        }
      }

      if (isTimelineValue(props.value)) {
        timelineValue = {
          setTime: props.value.setTime,
          setPlaying: props.value.setPlaying,
          duration: props.value.duration,
        };
      }
    },
    getStageProps() {
      return stagePropsCandidate;
    },
    getTimelineValue() {
      return timelineValue;
    },
  };
}

module.exports = {
  isStageProps,
  isTimelineValue,
  typeNameContainsStage,
  createSniffState,
  MIN_DIM,
  MAX_DIM,
};
