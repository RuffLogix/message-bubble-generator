# Message Bubble Animation Generator — Design

Date: 2026-09-01
Status: Approved for implementation

## Purpose

A single-page browser tool that renders an animated chat conversation on a solid chroma-key background, so the author can drop the animation into a video. The animation plays live in the browser for screen recording, and can also be exported directly as a WebM file.

The primary user is the author of this repository, producing short-form video content. There is no server, no account, no persistence beyond the browser session.

## Success Criteria

1. Paste a list of messages, press Play, and see bubbles appear one at a time with a typing indicator before each.
2. The pacing responds to a "milliseconds per character" setting, so longer messages stay on screen longer.
3. Bubble colors, text colors, and the background color are all adjustable, with a chroma-key green background as the default.
4. Pressing Record produces a downloadable WebM file whose frames match the preview exactly.
5. Thai and English text both render and wrap correctly.

## Architecture

Three files, no build step and no dependencies. The tool is opened directly from the filesystem or from any static host.

```
index.html    markup: control panel and stage
styles.css    control panel styling and page chrome
app.js        parser, timeline, renderer, recorder
```

If `app.js` grows past roughly 400 lines it splits into `parse.js`, `timeline.js`, `renderer.js`, and `app.js` as ES modules, with `index.html` loading `app.js` as `type="module"`.

### Canvas-only rendering

Every visible part of the animation — bubbles, tails, wrapped text, the typing indicator, the background — is drawn on a single `<canvas>` element. No DOM elements represent bubbles.

This is the central decision. It means the preview and the export share one renderer, so the exported video is pixel-identical to what the author saw. Export becomes `canvas.captureStream()` piped into `MediaRecorder`, with no tab-picking dialog and no second rendering path to keep in sync.

The cost is that bubble text cannot be selected or inspected in the DOM, and text wrapping must be measured manually with `ctx.measureText`. Neither matters for this tool.

The canvas backing store is always the full output resolution (1080×1920 for 9:16). CSS scales it down to fit the stage area. All layout math is done in output pixels.

## Components

### Parser

Input: the raw textarea string.
Output: an array of `{ side: 'left' | 'right', text: string }`.

Rules:

- One message per line.
- A leading `L:` or `R:` (case-insensitive, optional space after the colon) sets the side.
- A line with no prefix inherits the side of the previous message.
- The first line with no prefix defaults to `left`.
- Blank lines and whitespace-only lines are dropped.
- A line consisting only of a prefix (`L:`) is dropped.

The parser is a pure function with no knowledge of timing or drawing.

### Timeline

Input: the parsed message array plus the timing settings (`msPerChar`, `typingMs`, `gapMs`, `typingEnabled`).
Output: a list of events with absolute millisecond timestamps, and a total duration.

For each message, in order:

1. If typing is enabled, a `typing` event on that message's side lasting `typingMs`.
2. A `bubble` event marking the moment the bubble appears.
3. A hold of `clamp(text.length * msPerChar, 400, 4000)` milliseconds.
4. A gap of `gapMs` milliseconds before the next message.

The timeline is data, not a scheduler. Nothing is queued with `setTimeout`. The renderer asks "what does the scene look like at time T", which makes replay, scrubbing, and recording all use the same code path and produce the same result.

### Renderer

Input: the timeline, the style settings, and an elapsed time in milliseconds.
Output: one drawn frame.

Responsibilities:

- Fill the background (solid color, or a checkerboard when transparent mode is on and we are not recording).
- Compute the layout of every bubble that has appeared at or before time T: wrap its text to a maximum bubble width, measure line heights, and stack the bubbles bottom-up with a fixed gutter.
- Draw each bubble with the active style's shape, then its text.
- Draw the typing indicator when a `typing` event is active, using three dots with a staggered bounce.
- Apply the appear animation to the newest bubble: a short scale-and-fade pop, roughly 220ms, eased.
- Apply camera offset so the newest bubble stays in frame.

Bubble width is capped at 72% of the stage width. Text wraps on spaces for Latin script; for text without spaces (common in Thai) it falls back to breaking at the last character that fits, so a long unbroken run does not overflow.

### Camera

The bubble column grows downward from the top. Once the total content height exceeds the usable stage height, the camera translates upward so the bottom of the newest bubble sits at a fixed distance from the bottom edge. The translation eases toward its target rather than snapping, so the scroll reads as motion rather than a jump.

### Recorder

`canvas.captureStream(60)` feeds a `MediaRecorder`. On Play-with-record, the clock starts at zero, frames render through the same renderer, and when the timeline's total duration elapses (plus a short tail) the recorder stops and the resulting blob is offered as a download.

Codec selection tries, in order: `video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/webm`. The first supported type wins.

Transparent export is best-effort: when the transparent checkbox is on, the canvas context is created with `alpha: true`, the background fill is skipped, and VP9 is requested. Browser support for alpha in WebM output is inconsistent, so the UI labels this as experimental and the green background remains the default.

## Controls

| Control | Type | Default |
| --- | --- | --- |
| Messages | textarea | a short sample conversation |
| Typing animation | checkbox | on |
| Typing duration | number, ms | 900 |
| Milliseconds per character | number | 60 |
| Gap between bubbles | number, ms | 300 |
| Style | select: iMessage / LINE / Minimal | iMessage |
| Sender name (LINE style) | text | empty |
| Aspect ratio | select: 9:16 / 1:1 / 16:9 | 9:16 |
| Left bubble background | color | `#FFFFFF` |
| Left bubble text | color | `#000000` |
| Right bubble background | color | `#FFFFFF` |
| Right bubble text | color | `#000000` |
| Stage background | color | `#00B140` |
| Transparent background | checkbox | off |
| Font size | number, px at output resolution | 44 |
| Font family | select | a Thai-safe system stack |
| Play / Reset / Record | buttons | — |

Changing any setting while stopped re-renders a static preview of the final frame, so the author can adjust colors without replaying.

### Styles

- **iMessage** — pill bubbles with a large corner radius and a curved tail on the outer edge, aligned left or right.
- **LINE** — softer rounded rectangles, no tail, with an optional sender name in small text above the first left bubble of each run.
- **Minimal** — plain rounded rectangles, no tail, no name, uniform radius.

Styles differ only in shape and decoration. Colors, timing, and layout are shared.

## Error Handling

- Empty or whitespace-only message input: Play is a no-op and a short inline note says the message list is empty.
- Non-numeric or out-of-range timing input: clamped to a sane range on read, with the clamped value written back into the field.
- `MediaRecorder` unavailable or no supported codec: the Record button is disabled with a tooltip explaining that the browser does not support WebM recording, and screen recording the preview is suggested instead.
- Recording while already recording: the button toggles to Stop and finalizes early.

## Testing

Manual verification, since this is a single-user visual tool with no build pipeline:

1. Parser cases — prefixed lines, unprefixed continuation, blank lines, prefix-only lines, mixed case prefixes.
2. Timing — a one-character message and a 200-character message both respect the clamp bounds.
3. Wrapping — a long English sentence and a long unspaced Thai sentence both stay inside the bubble.
4. Camera — a conversation long enough to overflow the stage keeps the newest bubble visible.
5. Export — record a short conversation, play the resulting file back, confirm the frames match the preview and the audio-free WebM opens in a video editor.

A small parser test harness may be added as a plain HTML page that runs assertions and prints results, if the parser rules prove fiddly.

## Out of Scope

- Avatars and profile images.
- Message reactions, replies, read receipts, timestamps.
- Images, stickers, or attachments inside bubbles.
- Saving or loading conversation presets.
- Audio.
- MP4 export.
