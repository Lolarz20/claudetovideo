# Contributing to claudetovideo

Thanks for thinking about contributing! This is a young project — your input matters.

## TL;DR

1. Fork, branch, hack, test, PR.
2. Conventional commits (`feat:`, `fix:`, `docs:`, etc.).
3. `npm test` and `npm run lint` must pass.
4. Be kind in reviews. We assume good faith.

## Getting started

```bash
git clone https://github.com/YOUR-FORK/claudetovideo
cd claudetovideo
npm install              # also installs Chromium via Playwright (~150 MB)
npm test                 # unit + smoke (~5s after first run)
node bin/cli.js test/fixtures/minimal-stage.html /tmp/out.mp4 --fps 5 --ss 1
```

You should see an MP4 at `/tmp/out.mp4` after a few seconds.

## Project structure

```
bin/cli.js           — CLI entrypoint, calls src/parse-args + src/convert
src/parse-args.js    — pure argv parser, fully unit-tested
src/convert.js       — orchestrator: launch Chromium → capture frames → encode
src/capture.js       — Playwright page setup, Stage detection, per-frame screenshot
src/inject.js        — runs INSIDE the page, traps React.createElement
src/sniff.js         — pure logic for picking the Stage candidate (testable)
src/encode.js        — spawns ffmpeg, pipes PNG buffers in via stdin
src/errors.js        — typed error classes
server.js            — optional Express server with web UI
public/              — drag-and-drop client (vanilla JS + SSE)
test/                — vitest specs + minimal-stage.html fixture
```

The most interesting file is `src/inject.js` — that's where the React UMD setter trap lives. Read the comments in `src/sniff.js` and `src/inject.js` before changing the Stage detection logic; the two are intentionally kept in sync (one is in-page, the other is unit-tested).

## Running tests

```bash
npm test                 # vitest run (unit + smoke)
npm run test:watch       # TDD mode
npm run lint             # eslint
npm run format           # prettier --write
npm run format:check     # prettier --check (CI runs this)
```

## Picking an issue

Look for the [`good first issue`](https://github.com/Lolarz20/claudetovideo/labels/good%20first%20issue) label. Each one comes with:

- A specific file/line to touch
- A measurable acceptance criterion
- Either no design questions, or design questions answered in the issue

For larger work, comment on the issue first — let's align on the approach before you build.

## Pull requests

- One logical change per PR
- Conventional commit message in PR title (e.g. `feat: add WebM output`)
- Link the issue (`Closes #42`)
- If your PR changes user-facing behavior, update README and CHANGELOG
- Add a test if you can

## Reporting bugs

Use the bug report template. Include:

- OS and Node version
- Exact command (with all flags)
- Expected vs actual output
- The HTML file if you can share it (often you can't — say so and we'll help debug remotely)

## Code style

- ESLint + Prettier enforce formatting (`npm run format` before pushing)
- Comments explain _why_, not _what_ (the code says what)
- Prefer obvious code over clever code
- New flag? Update README options table + `--help` text + a parse-args test

## Commit messages

Conventional commits keep the changelog generation possible:

| Prefix      | When                                 |
| ----------- | ------------------------------------ |
| `feat:`     | new user-facing feature              |
| `fix:`      | bug fix                              |
| `docs:`     | documentation only                   |
| `test:`     | test changes only                    |
| `refactor:` | code restructure, no behavior change |
| `chore:`    | tooling, deps, CI                    |
| `ci:`       | CI config changes                    |

## License

By contributing you agree that your contributions are licensed under MIT.

## Code of conduct

Be decent. We don't have a 5-page CoC because we don't need one yet — but harassment, hostility, or bad-faith arguments get you removed from the project. No second chances on those.
