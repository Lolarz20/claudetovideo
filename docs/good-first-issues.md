# Good first issue drafts

Five issues to seed the `good first issue` label after the repo is public.
Paste each block as a new issue, tag with the labels listed at the top, and
delete this file (or move it to a private gist) once they're posted.

---

## 1. [feat] Add `--start-time` and `--end-time` flags

**Labels**: `good first issue`, `enhancement`, `help wanted`

### Problem

Today `claudetovideo` always renders the full Stage duration. When you're iterating on a 30-second film and only the last 5 seconds need re-rendering, you wait through the first 25 every time.

### Proposed solution

Add two CLI flags that bound which frames get rendered:

- `--start-time <sec>` — start rendering from this timeline position (default `0`)
- `--end-time <sec>` — stop rendering at this position (default = Stage duration)

The output MP4 has duration `end - start`.

### Files to touch

- [`src/parse-args.js`](https://github.com/Lolarz20/claudetovideo/blob/main/src/parse-args.js) — add the two flags with the same validation pattern as `--max-duration`
- [`src/convert.js`](https://github.com/Lolarz20/claudetovideo/blob/main/src/convert.js#L85) — change the loop bounds: `for (let i = startFrame; i < endFrame; i++)`, where `startFrame = Math.round(startTime * fps)` and `endFrame = Math.min(totalFrames, Math.round(endTime * fps))`
- [`bin/cli.js`](https://github.com/Lolarz20/claudetovideo/blob/main/bin/cli.js) — pass the flags to `convert()`
- [`README.md`](https://github.com/Lolarz20/claudetovideo/blob/main/README.md) — add to the options table
- [`test/parse-args.test.js`](https://github.com/Lolarz20/claudetovideo/blob/main/test/parse-args.test.js) — happy path + rejection of `end-time < start-time`

### Acceptance

- [ ] `claudetovideo film.html --start-time 5 --end-time 10` renders only the 5–10s slice
- [ ] Output MP4 is 5 seconds long at the requested fps
- [ ] `--end-time` defaults to Stage duration when omitted
- [ ] `--start-time` defaults to 0 when omitted
- [ ] Rejecting `end-time <= start-time` with a clear error
- [ ] parse-args tests added
- [ ] README options table updated

### Hints

- Keep validation in `parse-args.js`, not in `convert.js`. Convert should only see valid numbers.
- Default for `endTime` can be `Infinity`; `convert.js` clamps to `totalFrames`.

**Estimated effort**: 1–2 hours.

---

## 2. [feat] `--format gif` output via ffmpeg palettegen

**Labels**: `good first issue`, `enhancement`, `help wanted`

### Problem

GIF is the de-facto format for embedding short animations in READMEs, GitHub Discussions, and Slack. Today users render MP4 and convert separately. We can do it inline.

### Proposed solution

Add `--format <mp4|gif>` (default `mp4`). When `gif`, use the standard ffmpeg two-pass palette dance to produce a quality GIF directly from the PNG stream.

### Files to touch

- [`src/parse-args.js`](https://github.com/Lolarz20/claudetovideo/blob/main/src/parse-args.js) — add `--format` flag with values `mp4` or `gif`
- [`src/encode.js`](https://github.com/Lolarz20/claudetovideo/blob/main/src/encode.js) — branch on format: for GIF, build the palettegen filtergraph instead of libx264 args
- [`README.md`](https://github.com/Lolarz20/claudetovideo/blob/main/README.md) — update Roadmap (mark GIF as done), add example
- [`CHANGELOG.md`](https://github.com/Lolarz20/claudetovideo/blob/main/CHANGELOG.md) — entry under `[Unreleased]`

### Acceptance

- [ ] `claudetovideo film.html --format gif` produces a valid animated GIF
- [ ] GIF size is reasonable (target: 6 MB for a 15s 720p film at 15 fps)
- [ ] Loops infinitely (`-loop 0`)
- [ ] Respects `--fps` (default 15 for GIF, configurable)
- [ ] `--crf` flag is silently ignored when format is GIF (it's H.264-specific)

### Hints

- The two-pass filtergraph: `[0]fps=$fps,scale=$w:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`
- We already use this exact recipe to generate `assets/hero.gif` — copy it.

**Estimated effort**: 2–3 hours.

---

## 3. [feat] Close active SSE streams during graceful server shutdown

**Labels**: `good first issue`, `bug`, `help wanted`, `area:server`

### Problem

When the server receives `SIGTERM` (Cloud Run / Docker stop), the [shutdown](https://github.com/Lolarz20/claudetovideo/blob/main/server.js#L256) handler waits for the active job to finish but does not close active SSE connections. Cloud Run logs show "ungraceful disconnect" for every connected client.

### Proposed solution

In [`shutdown()`](https://github.com/Lolarz20/claudetovideo/blob/main/server.js#L256), iterate `sseClients` and call `res.end()` on each one before `server.close()`. The keepalive `setInterval` is already cleared by the `req.on('close')` handler.

### Files to touch

- [`server.js:256`](https://github.com/Lolarz20/claudetovideo/blob/main/server.js#L256) — add the loop

### Acceptance

- [ ] In `shutdown()`, after marking pending jobs as errored but before `server.close()`, close all SSE streams
- [ ] Verify locally: open browser to `http://localhost:3000`, then `kill -TERM <pid>` — browser sees the connection close cleanly (no auto-reconnect storm)
- [ ] No regression in normal operation (browser auto-reconnects via EventSource if server is restarted)

### Hints

- Pattern:
  ```js
  for (const res of sseClients) {
    try {
      res.write('event: shutdown\ndata: bye\n\n');
      res.end();
    } catch {}
  }
  sseClients.clear();
  ```
- The client side ([`public/app.js`](https://github.com/Lolarz20/claudetovideo/blob/main/public/app.js)) already has `EventSource.onerror` handling.

**Estimated effort**: 30 minutes.

---

## 4. [chore] Add `examples/` directory with sample HTMLs

**Labels**: `good first issue`, `chore`, `help wanted`

### Problem

New users want to try the tool without finding a Claude Design HTML first. The repo doesn't ship any runnable examples — `codaro.html` is in the root but it's 1.6 MB and not labeled as a sample.

### Proposed solution

Create `examples/` with three small Claude-Design-shaped HTMLs:

- `examples/hello.html` — minimal Stage with a single moving square (similar to `test/fixtures/minimal-stage.html` but slightly more visually interesting)
- `examples/text-animation.html` — Stage with text fading in/out, demonstrating font handling
- `examples/multi-element.html` — Stage with several animated elements demonstrating the timeline interpolation

Each example self-contained — uses React UMD from a vendored `examples/vendor/` directory (no unpkg).

### Files to touch

- `examples/hello.html` (new)
- `examples/text-animation.html` (new)
- `examples/multi-element.html` (new)
- `examples/vendor/react.production.min.js` (new — copy from CDN)
- `examples/vendor/react-dom.production.min.js` (new — copy from CDN)
- [`README.md`](https://github.com/Lolarz20/claudetovideo/blob/main/README.md#L58) — replace the `<!-- TODO -->` block in Examples section with: "Try it without a Claude Design file: `claudetovideo examples/hello.html`"
- [`package.json`](https://github.com/Lolarz20/claudetovideo/blob/main/package.json) — add `examples` to `files` allowlist? **Discuss in PR** — pro: easy `npx claudetovideo examples/hello.html`; con: bloats the npm tarball

### Acceptance

- [ ] All three examples render to MP4 successfully via `claudetovideo examples/X.html`
- [ ] Total `examples/` directory < 200 KB
- [ ] No external network deps (vendored React)
- [ ] README references `examples/hello.html` as a try-it-without-anything path

### Hints

- Look at `test/fixtures/minimal-stage.html` for the basic shape — it's a working starting point.

**Estimated effort**: 2–3 hours.

---

## 5. [docs] Expand the troubleshooting section in README

**Labels**: `good first issue`, `documentation`, `help wanted`

### Problem

The current [Troubleshooting](https://github.com/Lolarz20/claudetovideo/blob/main/README.md#L146) section in README has 2 entries. Real users will hit at least 5–6 distinct failure modes. We need to preempt the issue queue.

### Proposed solution

Expand the section to cover (at minimum):

1. **"Could not detect Claude Design's Stage component"** — already there, but link to a known-good example file for comparison
2. **"Frame N timed out"** — already there
3. **"Stage dimensions out of range"** — explain that `width/height` must be 16–4096, suggest checking the source HTML
4. **"Stage duration N exceeds --max-duration"** — explain that this is intentional safety, show how to override
5. **"npx claudetovideo: command not found"** — Node version, PATH, npm cache
6. **"Output MP4 is black / blank"** — Stage didn't actually render, run with `--headed` to see the live page
7. **"ffmpeg exited code=1"** — disk full, permissions, or supersample × dimensions overflow
8. **Why is rendering slow?** — explain `--fast` + supersample tradeoff

Each entry: bold question, 2–3 bullets, optional "If that doesn't help: open an issue".

### Files to touch

- [`README.md:146`](https://github.com/Lolarz20/claudetovideo/blob/main/README.md#L146) — replace and expand the Troubleshooting section

### Acceptance

- [ ] At least 6 distinct entries
- [ ] Each entry has actionable next steps, not just "this happened"
- [ ] Link to issue tracker at the end
- [ ] Total section under 80 lines (concision matters)

### Hints

- Look at the `src/errors.js` file for the exact error strings users will see — match them in the README headers verbatim so users can search and find them.
- Check existing closed issues (none yet, but build the habit).

**Estimated effort**: 1 hour.
