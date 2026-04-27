# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-27

### Added

- Virtual-time capture fallback (`src/capture-vtime.js`) for Claude Design HTML that ships as vanilla `requestAnimationFrame` animations instead of React/Stage. Triggers automatically when no Stage component mounts within 8 s.
- Static metadata sniffer reads `DURATION` and stage dimensions from gzipped bundler manifests or plain inline scripts.
- CLI flags: `--vtime-duration`, `--vtime-width`, `--vtime-height` to override sniffed values.
- Smoke test (`test/smoke-vtime.test.js`) + fixture (`test/fixtures/minimal-vtime.html`) for the vtime path.

### Changed

- `src/capture.js` is now a dispatcher; the existing Stage capture moved to `src/capture-stage.js` with an 8 s mount timeout (was 60 s) so falling through to vtime feels responsive.
- README and landing page updated to document both strategies.

## [0.1.0] - 2026-04-26

### Added

- HTML → MP4 conversion via Playwright + ffmpeg pipeline.
- React UMD setter trap in `src/inject.js` for Claude Design Stage detection.
- 2× supersampling with Lanczos downscale (SSAA) for crisp fonts and lines.
- BT.709 color metadata and `+faststart` for streamable MP4.
- CLI flags: `--fps`, `--ss`, `--crf`, `--preset`, `--max-duration`, `--max-frames`, `--frame-timeout`, `--fast`, `--headed`, `--verbose`.
- Per-frame timeout watchdog with actionable error message on hung CDN/font fetches.
- Stage dimension validation (16–4096 px).
- Hardened Stage detection heuristic: requires positive width/height/duration in range, prefers components named `Stage`, falls back to last-observed.
- Express server with SSE progress streaming.
- Per-IP rate limiting on `POST /api/convert` (default 5/h, configurable via `RATE_LIMIT_PER_HOUR`).
- Magic-byte HTML validation post-upload (server-side, ignores spoofable client mimetype).
- Graceful `SIGTERM`/`SIGINT` drain with 30s timeout for current job.
- Server-side stricter limits than CLI (`maxDuration=30s`, `maxFrames=1800`, `frameTimeout=10s`).
- vitest unit tests for `parseArgs` (15) and Stage `sniff` heuristic (18).
- Smoke integration test rendering a minimal Stage fixture to MP4 + ffprobe assertions.
- GitHub Actions CI on Linux/macOS/Windows × Node 20/22.
- Dependabot (npm + github-actions, weekly).
- ESLint flat config, Prettier, `.gitattributes` enforcing LF.
- npm `files` allowlist — package tarball is ~12 kB (CLI only).
