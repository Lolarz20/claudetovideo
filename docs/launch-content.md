# Launch content drafts

Three pieces of content that don't go into the repo as files — they go into
GitHub UI surfaces. Copy/paste from here when you're ready.

---

## 1. Release notes for `v0.1.0`

Paste into GitHub Releases UI when tagging `v0.1.0`. Replace `${PREVIOUS_TAG}`
in the changelog link if there isn't one yet (just remove that line).

````markdown
## v0.1.0 — Initial release

**The missing "Export to MP4" button for Claude Design.**

### What you can do

```bash
npx claudetovideo film.html
```
````

That's it. You get a 1080p60 MP4. Zero system dependencies — Chromium and ffmpeg are bundled via npm install.

### Highlights

- **Frame-accurate** — drives Claude Design's internal timeline directly, not wall-clock playback
- **High quality** — 2× supersampling + Lanczos downscale for SSAA, H.264 CRF 15, BT.709 colorspace, `+faststart` for instant web playback
- **Zero setup** — Chromium (via Playwright) and ffmpeg (via ffmpeg-static) are bundled
- **Safe by default** — bounded duration, frame timeout, validated dimensions, custom typed errors
- **Self-host the web UI** — Express server with rate limiting, magic-byte upload validation, SSE progress streaming, and graceful SIGTERM drain

### How it works

`claudetovideo` traps `window.React` _before_ Claude Design's UMD bundle runs, intercepts every `createElement` call, and sniffs for the `TimelineContext` shape to grab `setTime` out of the closed-over Stage state. From there, Playwright drives the timeline frame by frame and ffmpeg encodes.

Full write-up in [the README](https://github.com/Lolarz20/claudetovideo#how-it-works).

### Tested on

- macOS 14+
- Ubuntu 22.04 / 24.04
- Windows 11
- Node 20 and 22

### Roadmap

WebM, GIF output, audio mux, VS Code extension. [Vote on what's next →](https://github.com/Lolarz20/claudetovideo/issues)

### Thanks

Built alongside [codaro.dev](https://codaro.dev). Feedback and PRs welcome — see [CONTRIBUTING.md](https://github.com/Lolarz20/claudetovideo/blob/main/CONTRIBUTING.md).

---

**Full diff**: https://github.com/Lolarz20/claudetovideo/commits/v0.1.0

````

---

## 2. Pinned roadmap issue

Create as a new issue, then pin it. Title: `🗺️ v0.2 roadmap — vote with 👍`.
Tag with `roadmap` label (create if needed).

```markdown
This issue tracks what's on deck after v0.1. Drop a 👍 on what you want soonest — that's how we prioritize.

## Output formats
- [ ] WebM (VP9) output
- [ ] GIF output via palettegen
- [ ] PNG sequence output
- [ ] APNG output

## Features
- [ ] Audio track muxing (`--audio music.mp3`)
- [ ] `--start-time` / `--end-time` for partial render
- [ ] Watch mode (re-render on file change)
- [ ] Configuration file (`claudetovideo.config.js`)
- [ ] Multiple output formats in one run

## Performance
- [ ] CDP raw-frame capture (faster than `page.screenshot`)
- [ ] JPEG intermediate frames experiment
- [ ] Parallel frame rendering across multiple Chromium contexts

## Ecosystem
- [ ] VS Code extension ("right click HTML → Export to MP4")
- [ ] GitHub Action for PR previews
- [ ] Hosted playground (claudetovideo.com)
- [ ] Discord bot

## Compatibility
- [ ] Generic HTML fallback (wall-clock recording when Stage is not detected)
- [ ] Linux ARM CI
- [ ] Bun / Deno support investigation

---

**Have something not listed?** Comment below or open a [feature request](https://github.com/Lolarz20/claudetovideo/issues/new?template=feature_request.yml).
````

---

## 3. GitHub profile README (`Lolarz20/Lolarz20`)

**Decision required**: skip this for now if `github.com/Lolarz20/Lolarz20` doesn't exist yet — there's no rush. The point of a profile README is to redirect attention from your profile to your flagship repo. With one starred public project, your profile is already legible.

If you decide to create it: open a new repo named exactly `Lolarz20` (matches your username), add `README.md` with this content:

```markdown
# Hi 👋

I build open-source tools for AI workflows.

🎬 **[claudetovideo](https://github.com/Lolarz20/claudetovideo)** — the missing "Export to MP4" button for Claude Design

🛠️ Building [codaro.dev](https://codaro.dev) — my main project

---

📍 [soysal.pl](https://soysal.pl) · [X](https://x.com/radek_soysal) · [LinkedIn](https://www.linkedin.com/in/radoslaw-soysal-748065267)
```

Short. Highlights the flagship project. No 50 badges, no GitHub stats card (those start meaning something around 5+ public repos with consistent activity), no ASCII art, no snake animation.

**My recommendation**: create it the day you tag `v0.1.0` — having a profile that says "I built the thing on the front page of HN today" is worth ~10× more than the same content posted in a vacuum.
