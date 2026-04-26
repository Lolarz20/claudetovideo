<p align="center">
  <img src="assets/hero.gif" alt="claudetovideo demo: a Claude Design HTML film exporting to MP4" width="720">
</p>

<h1 align="center">claudetovideo</h1>

<p align="center">
  <strong>The missing "Export to MP4" button for Claude Design.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/claudetovideo"><img src="https://img.shields.io/npm/v/claudetovideo.svg" alt="npm"></a>
  <a href="https://github.com/Lolarz20/claudetovideo/actions"><img src="https://github.com/Lolarz20/claudetovideo/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Lolarz20/claudetovideo/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/claudetovideo.svg" alt="MIT"></a>
  <img src="https://img.shields.io/node/v/claudetovideo.svg" alt="node">
</p>

---

```bash
npx claudetovideo film.html
```

You get a 1080p60 MP4. Zero system dependencies — Chromium and ffmpeg are bundled.

## Why this exists

[Claude Design](https://www.anthropic.com/) generates polished animated HTML "micro-films" — the kind of thing you'd want to drop into a tweet, a landing page, or a product demo. They live in your browser. There's no Save As Video button.

You could screen-record. But:

- **Screen recording loses fidelity** — subpixel anti-aliasing, your monitor's color profile, and frame timing all drift.
- **It's not deterministic** — slow machine = janky video, fast machine = different video, every run.
- **You can't put it in CI** — there's no headless way to capture.

`claudetovideo` talks directly to Claude Design's internal timeline. It seeks frame-by-frame, screenshots through Playwright, and pipes the frames through ffmpeg. The output is bit-identical regardless of how slow your machine is.

I built this while exporting demos for [codaro.dev](https://codaro.dev). The MP4 above was rendered with this tool.

## Quick start

Install nothing. Run:

```bash
npx claudetovideo path/to/film.html
# → path/to/film.mp4
```

That's it. The first run downloads Chromium (~150 MB) via Playwright; subsequent runs are instant.

If you want to install globally:

```bash
npm install -g claudetovideo
claudetovideo film.html -o out.mp4 --fps 30
```

## Examples

<!-- TODO: replace these with three side-by-side comparison GIFs:        -->
<!--   1. Default (1080p60, CRF 15, 2× supersample)                       -->
<!--   2. --fast (≈3× faster, slightly lower quality)                     -->
<!--   3. --crf 0 --preset veryslow (archival lossless)                   -->

```bash
# Default — highest quality
claudetovideo film.html

# Quick preview, ~3× faster
claudetovideo film.html --fast

# Archival lossless master
claudetovideo film.html --crf 0 --ss 2 --preset veryslow
```

## How it works

The hard part: Claude Design's timeline lives inside React state that you can't reach from outside. `setTime()` is closed over by the `Stage` component — there's no API.

`claudetovideo` solves this by trapping `window.React` _before_ the page's React UMD bundle runs:

```js
// src/inject.js — runs via page.addInitScript, before any page <script>
Object.defineProperty(window, 'React', {
  set(value) {
    // Wrap createElement the moment the UMD factory assigns it.
    trapMethod(value, 'createElement', sniffStageProps);
    // Same for the jsx-runtime variants.
  },
});
```

Every `createElement(type, props)` call gets sniffed. When `props` matches the shape of Claude Design's `TimelineContext` (`{ time, duration, playing, setTime, setPlaying }`), `setTime` and `setPlaying` get stashed on `window.__stage`. From there, Playwright drives the timeline frame by frame:

```text
for each frame i in 0..duration*fps:
  setTime(i / fps)
  await two requestAnimationFrames
  await document.fonts.ready
  page.screenshot()  →  PNG  →  ffmpeg stdin
```

Output is rendered at 2× supersampling, then downscaled with Lanczos in ffmpeg — cheaper SSAA than asking Chromium to render at `devicePixelRatio = 2` everywhere. H.264 at CRF 15, BT.709 colorspace, `+faststart` for instant web playback.

No modification of the input HTML. All injection is browser-side.

## Options

| Flag                   | Default       | Description                                     |
| ---------------------- | ------------- | ----------------------------------------------- |
| `--fps <n>`            | `60`          | Output frame rate                               |
| `--ss <1-4>`           | `2`           | Supersampling factor (1 disables)               |
| `--crf <0-51>`         | `15`          | H.264 quality (lower = better; `0` is lossless) |
| `--preset <name>`      | `slow`        | x264 preset (`ultrafast` … `veryslow`)          |
| `--fast`               | —             | Shortcut for `--ss 1 --crf 20 --preset medium`  |
| `--max-duration <sec>` | `60`          | Refuse renders longer than this                 |
| `--max-frames <n>`     | `7200`        | Refuse renders with more frames than this       |
| `--frame-timeout <ms>` | `15000`       | Per-frame watchdog                              |
| `-o, --output <path>`  | `<input>.mp4` | Output MP4 path                                 |
| `--headed`             | —             | Show the Chromium window (debug)                |
| `--verbose`            | —             | Detailed diagnostics                            |

## Self-host the web UI

The repo also ships an Express server with drag-and-drop upload, a job queue, and SSE progress streaming.

```bash
git clone https://github.com/Lolarz20/claudetovideo
cd claudetovideo
npm install
npm start
# → http://localhost:3000
```

Hardened defaults for public hosting: per-IP rate limit (configurable via `RATE_LIMIT_PER_HOUR`), HTML magic-byte validation, 5 MB upload cap, stricter render limits (30 s / 1800 frames / 10 s frame timeout), graceful `SIGTERM` drain.

For Firebase Hosting + Cloud Run deployment see [DEPLOY.md](./DEPLOY.md).

## Limitations

- Only works with HTML files generated by **Claude Design**. Generic HTML animations are not detected.
- No audio track yet — Claude Design doesn't generate audio. See the [roadmap](#roadmap).
- Long animations (> 60 s) require an explicit `--max-duration` override.
- Output is MP4 (H.264) only. WebM, GIF, and PNG sequence are on the roadmap.

## Troubleshooting

**"Could not detect Claude Design's Stage component within 60s"**

- Confirm the HTML actually came from Claude Design (we look for a specific React structure).
- Run with `--headed --verbose` to see what's loading.
- Check whether external resources (CDN fonts, remote images) are blocking the page.

**"Frame N timed out after 15000ms"**

- An external resource is hanging. Try `--frame-timeout 30000`.
- If the HTML uses external fonts, consider inlining them.

More: [open an issue](https://github.com/Lolarz20/claudetovideo/issues/new/choose).

## Roadmap

- [x] MP4 (H.264) export — `v0.1`
- [ ] WebM (VP9) output
- [ ] GIF output via palettegen
- [ ] Audio track muxing
- [ ] CDP raw-frame capture (faster than `page.screenshot`)
- [ ] Generic HTML fallback (wall-clock recording when Stage is not detected)
- [ ] VS Code extension
- [ ] Hosted playground

Vote with 👍 on the [pinned roadmap issue](https://github.com/Lolarz20/claudetovideo/issues).

## Contributing

Young project — your input matters. See [CONTRIBUTING.md](./CONTRIBUTING.md) and the [`good first issue`](https://github.com/Lolarz20/claudetovideo/labels/good%20first%20issue) label.

## Acknowledgements

- [Playwright](https://playwright.dev) — the most reliable headless-browser API on Windows + macOS + Linux.
- [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static) — making "ffmpeg not in PATH" a non-problem.
- Anthropic, for shipping Claude Design without a built-in export button so this project had a reason to exist 🙃

## License

MIT © [Radek Soysal](https://soysal.pl) ([X](https://x.com/radek_soysal) · [LinkedIn](https://www.linkedin.com/in/radoslaw-soysal-748065267) · [GitHub](https://github.com/Lolarz20))

Built alongside [codaro.dev](https://codaro.dev).
