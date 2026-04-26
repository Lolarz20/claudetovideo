// Custom error types so callers (CLI, server, tests) can branch on the
// failure mode without parsing strings.

class StageNotFoundError extends Error {
  constructor(message, diagnostics = null) {
    super(message);
    this.name = 'StageNotFoundError';
    this.diagnostics = diagnostics;
  }
}

class StageDimensionsError extends Error {
  constructor(message, dims) {
    super(message);
    this.name = 'StageDimensionsError';
    this.dims = dims;
  }
}

class FrameTimeoutError extends Error {
  constructor(message, frame, time) {
    super(message);
    this.name = 'FrameTimeoutError';
    this.frame = frame;
    this.time = time;
  }
}

class DurationLimitError extends Error {
  constructor(message, duration, limit) {
    super(message);
    this.name = 'DurationLimitError';
    this.duration = duration;
    this.limit = limit;
  }
}

module.exports = {
  StageNotFoundError,
  StageDimensionsError,
  FrameTimeoutError,
  DurationLimitError,
};
