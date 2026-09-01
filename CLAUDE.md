# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build step, no package manager, and no dependencies. `node` is **not available in this shell** — nvm is broken here and running `node` floods the terminal with `_load_nvm: command not found`. Do not reach for node, npm, or npx.

Serve the folder (ES modules are blocked over `file://`):

```bash
/usr/bin/python3 -m http.server 8000 --bind 127.0.0.1
```

- App: <http://localhost:8000/index.html>
- Tests: <http://localhost:8000/tests/tests.html> — prints `N passed, M failed` plus one `PASS`/`FAIL` line per test.

**The server sends no cache headers and the browser will serve a stale page.** Append a unique cache-busting query string to every navigation (`?v=something-unique`). If a change you just made does not appear, assume staleness before assuming a bug.

Drive both pages with the Playwright MCP browser tools. Since this is a canvas app, a DOM snapshot proves almost nothing — take screenshots and actually look at them.

**Running one test:** there is no filter mechanism. `tests/tests.html` imports each `*.test.js` module in sequence; comment out the other imports to isolate a file, or just read the named `PASS`/`FAIL` line for the test you care about. `tests/assert.js` provides `test(name, fn)`, `eq(actual, expected)`, `ok(value)`, and `report(el)`; `eq` compares by `JSON.stringify`, so it is a deep compare.

Only pure logic is unit-tested — parsing, timing, layout/wrapping, live item building. Rendering, camera, recording, and the UI have **no automated coverage by design**; they are covered by the 15-point manual checklist in `README.md`, which should be worked through before shipping a visual change.

## What this is

A single-page tool that animates a chat conversation on a chroma-key background so the author can key it into a video, and exports it as WebM. Two modes share one renderer:

- **Script** — paste `L:`/`R:` prefixed lines, press Play, animate a precomputed timeline.
- **Live** — type in a box, press Enter, the bubble drops onto the stack immediately.

Design history lives in `docs/superpowers/specs/` and `docs/superpowers/plans/`. The spec has **two addenda; addendum 2 supersedes conflicting text in the original body** (it replaced a three-dot typing indicator with a per-grapheme typewriter, replaced top-anchoring with bottom-anchoring, and deleted a hold clamp). Read the addenda before treating the original body as current.

## Architecture

```
parse.js  ─┐
           ├─→  {index, side, text, typeStart, typeEnd}  ─→  renderer.js  ─→  canvas
timeline.js┤                                                      ↑
live.js   ─┘                                                   app.js  ─→  recorder.js
```

`app.js` is the only module that touches the DOM. Everything under it is pure or canvas-only.

### The invariants that hold this together

**One item shape, two producers.** `buildTimeline` (script) and `appendLive` (live) both emit `{index, side, text, typeStart, typeEnd}`, and `renderer.js` reads only those fields. That is why live mode reuses the renderer with zero changes — the renderer genuinely cannot tell a precomputed timeline from one grown a message at a time. `tests/live.test.js` pins this with a key-set comparison; if you change one producer's shape, change both.

**The renderer is a pure function of elapsed time.** Nothing is scheduled with `setTimeout`. `renderFrame(ctx, timeline, elapsed, settings)` answers "what does the scene look like at time T", which is exactly why a recording is pixel-identical to the preview — both run the same code path off the same clock. Do not introduce timers into the animation path.

**Canvas-only, in output pixels.** No DOM element represents a bubble. All layout math is in output pixels (1080 wide at the 9:16 default); the canvas backing store is the output resolution and CSS only scales it for display. `#canvas` carries `min-width: 0; min-height: 0` — without it, CSS Grid's `auto` minimum floors the canvas at intrinsic size and it gets clipped instead of scaled.

**Text is always handled by grapheme cluster, never by code point.** `graphemes()` in `layout.js` is the single implementation (`Intl.Segmenter`, falling back to `Array.from`). Both wrapping (`breakLongWord`) and the typewriter reveal (`visibleText`) call it. Thai combining vowels and tone marks are separate code points; slicing with `String.prototype.slice` or `[...text]` would flash a base consonant without its mark. There are tests guarding this — do not "simplify" them away.

**The camera formula is deliberately unbranched.** `cameraTargetY` returns `height - bottomPad - contentHeight` — positive while the stack is short (hanging it off the bottom), negative once it outgrows the frame (scrolling the top away). Adding a `Math.max(0, ...)` or an overflow branch breaks bottom anchoring. `renderFrame` translates by `cameraY` alone; re-adding a `bottomPad +` prefix double-counts the padding.

**Timing model.** Type for `graphemeCount * msPerChar`, hold `holdMs`, wait `gapMs`. There is no clamp on duration — length already drives it, and clamping on top made pacing unpredictable. Do not reintroduce one.

## Landmines in `src/app.js`

This file accreted across many tasks and several review rounds. The following look like cruft and are not — each fixes a real, reproducible bug. Do not "clean up" any of them without reading why:

- **`num()` must never write back to the DOM.** It runs on every keystroke via the render path. Writing the clamped value back mid-edit fights the caret and makes fields literally un-typeable (34 → type `5` → snaps to `12` → `120`). Write-back lives in `normalizeNumberInput`, bound to `change`/`blur` only. An empty string returns the fallback rather than being coerced to `0`.
- **`'mode'` is deliberately absent** from the shared settings-input listener id list. A `<select>` fires `input` before `change`, so including it would let the generic handler run against the new mode before `applyMode()` tears down the old one.
- **The `if (activeRecorder)` branch in that listener** pins `settings.width/height` to the canvas's actual dimensions. A `MediaRecorder` is bound to the capture stream of a specific canvas size; resizing mid-recording corrupts the capture, and letting `settings` drift ahead of the canvas renders the stack for a stage that isn't there.
- **`play()` and `startLive()` both guard re-entrancy.** Without them, two `requestAnimationFrame` loops stack up and `playback-ended` double-fires — which the recorder listens for.
- **`finishRecording()` nulls `activeRecorder` before its first `await`.** That synchronous ordering is what makes a double-finish unreachable.
- **`applyMode()` clears the note *before* awaiting `finishRecording()`**, so the "Saved X MB." confirmation survives instead of being wiped by its own mode switch.
- **`applyMode()` is called at the very end of the file.** Moving it earlier throws a temporal-dead-zone `ReferenceError`, because it references `activeRecorder`, declared below it.
- **Play and Reset are hidden individually,** not via `#transport` — that wrapper also contains Record, which must stay reachable in live mode.
- **`play()` repaints the background on the empty-list path** before returning, so the stage keeps showing the chroma-key colour instead of going transparent.

Two `requestAnimationFrame` loops exist — `frame()` (script) and `liveFrame()` (live). They share `camera` and `lastFrame`, and only one runs at a time; `stopLive()` and the `playing` flag are what enforce that.
