# claudetovideo

Convert Claude Design HTML animations to MP4 video.

[Claude Design](https://www.anthropic.com/news) generates animated HTML
"micro-films" but has no built-in video export. This tool loads the HTML
in a headless browser, drives the internal timeline frame-by-frame, and
encodes the result as H.264 MP4.

## Install

```bash
git clone https://github.com/Lolarz20/claudetovideo.git
cd claudetovideo
npm install
```

`npm install` also installs Chromium via Playwright and bundles `ffmpeg`
(via `ffmpeg-static`), so nothing else is required on the system.

## Usage

```bash
node bin/cli.js path/to/film.html
# → path/to/film.mp4
```

Defaults are tuned for highest quality: 60 fps, 2× supersampling,
CRF 15, libx264 `slow` preset, BT.709 color metadata.

Options:

```
-o, --output <path>    Output MP4 path (default: <input>.mp4)
--fps <n>              Frame rate (default: 60)
--ss <n>               Supersample factor (default: 2, 1 to disable).
                       Renders at n× resolution and downsamples with
                       Lanczos — big quality boost on text/thin lines.
--crf <n>              libx264 CRF, 0=lossless, 15=near-lossless (default),
                       18=visually-lossless, 23=default.
--preset <name>        libx264 preset: ultrafast .. veryslow (default slow).
--fast                 Shortcut: --ss 1 --crf 20 --preset medium.
--headed               Show the browser window (debug)
--verbose              Stream ffmpeg logs
```

Examples:

```bash
# Highest quality (default)
node bin/cli.js film.html

# Quick preview (~3× faster, slightly lower quality)
node bin/cli.js film.html --fast

# Archival lossless master (big files!)
node bin/cli.js film.html --crf 0 --ss 2 --preset veryslow
```

## How it works

Claude Design bundles React + a custom `Stage` component that owns a
timeline in React state (`TimelineContext` with `{ time, duration, playing,
setTime, setPlaying }`). `setTime` is stable across renders but lives in
Stage's closure, so it isn't accessible from outside.

The exporter:

1. Loads the HTML in headless Chromium via Playwright at `deviceScaleFactor
= supersample` (default 2).
2. **Before** any page script runs, installs a getter/setter on
   `window.React` that intercepts `React.createElement` the moment the UMD
   factory populates it. Every element call is sniffed — when a props bag
   matches the `TimelineContext` value shape, `setTime`/`setPlaying` are
   stashed on `window.__stage`.
3. Reads Stage dimensions (`width`, `height`, `duration`) from the Stage
   component's own props the same way.
4. Resizes the viewport so Stage's auto-fit scale becomes exactly 1:1.
5. Freezes CSS animations (`animation-play-state: paused`) so non-timeline
   animations (caret blinks, etc.) stay deterministic.
6. For each frame: calls `setTime(i / fps)`, waits two `requestAnimationFrame`s
   for React to commit + paint, then takes a clipped screenshot.
7. With `--ss 2` the PNG comes back at 2× physical pixels; ffmpeg downsamples
   to the logical Stage size with Lanczos before encoding — supersample
   antialiasing for crisp fonts and edges.
8. Output: H.264, CRF 15, `slow` preset, `yuv420p`, BT.709 color flags,
   `+faststart` for web streaming.

No modification of the HTML bundle — all injection is browser-side.

## Performance

Quality defaults (1080p60, 2× supersample, CRF 15, slow preset) on a
typical laptop render a 15 s film in roughly 5–8 minutes. Use `--fast`
for quick iterations — roughly 3× faster at visibly similar quality.

## Limitations (v0.1)

- Only works with Claude Design's `__bundler/*` HTML format (as of
  2026-04).
- Only films that use the `Stage` / `TimelineContext` timeline component.
- No audio export (Claude Design doesn't produce audio today).
- Output is MP4 (H.264) only. WebM / GIF / PNG-sequence planned.

## License

MIT
