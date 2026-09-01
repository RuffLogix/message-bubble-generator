# Message Bubble Generator

Animates a chat conversation on a chroma-key background so you can key it into
a video, and exports the result as a WebM file. Each message types itself in
one grapheme at a time, its bubble growing to fit as it goes, while the
conversation stack hangs off the bottom of the frame and eases upward as new
bubbles arrive.

No build step, no package manager, no dependencies — it is plain ES modules,
HTML, and a `<canvas>`.

![The app: controls on the left, the chroma-key stage on the right](docs/images/app.png)

## What comes out

The stage is the export. Every bubble is drawn on the canvas at the output
resolution — nothing is a DOM element — so a recording is pixel-identical to
the preview.

![A rendered stage: Thai bubbles alternating left and right on chroma-key green](docs/images/stage.png)

## Two modes

- **Script** — paste a list of `L:`/`R:` prefixed lines into the textarea and
  press Play to animate the whole conversation on a timeline you can record.
  An unprefixed line continues the previous message.
- **Live** — type into the message box and press Enter to drop a bubble onto
  the stack immediately, one message at a time; useful for narrating a
  conversation while recording. Tab inside the input flips the side.

Both modes feed the same renderer, so they look identical.

## Settings

| Setting | What it does |
| --- | --- |
| Typewriter animation | Off makes each bubble appear complete, with no reveal |
| Typing speed | Milliseconds per grapheme; total type time is `graphemes × this`, uncapped |
| Hold after typing | Pause once a message is fully typed |
| Gap between bubbles | Pause before the next message starts typing |
| Style | `iMessage` (pill + tail), `LINE` (rounded, optional sender name), `Flat` |
| Aspect ratio | 9:16 (1080×1920), 1:1 (1080×1080), or 16:9 (1920×1080) |
| Colours | Per-side bubble and text colour, plus the background key colour |
| Transparent | Skips the background fill so the WebM carries alpha instead of a key colour |
| Font | Size in output pixels, and the family |

## Running

ES modules are blocked over `file://`, so serve the folder:

    python3 -m http.server 8000

Then open <http://localhost:8000/index.html>.

The server sends no cache headers, so append a unique query string
(`?v=anything`) when reloading after a change — otherwise the browser will hand
you the stale page.

## Recording

Press Record. In Script mode the recording stops itself when playback ends; in
Live mode it runs until you press Stop. The file downloads as WebM at the
selected resolution.

## Tests

Open <http://localhost:8000/tests/tests.html>. The page runs the unit tests for
the parser, the timeline, live-mode item building, and text
measurement/wrapping, then prints `N passed, M failed` plus one line per test.

Rendering, camera movement, and WebM export have no automated coverage by
design; they are verified by hand against the checklist below.

## Manual checks before shipping a change

1. Unit tests pass at `/tests/tests.html`.
2. Parser: prefixed lines, unprefixed continuation, blank lines, prefix-only
   lines, and mixed-case prefixes all behave.
3. Timing: typing duration is `graphemes × msPerChar` with no clamp — a
   5-character message at 100ms/char takes about half a second, and a
   200-character message at the same rate takes proportionally longer, not a
   capped amount.
4. Wrapping: a long English sentence and a long unspaced Thai sentence both
   stay inside their bubbles, with no broken glyph flashing mid-type.
5. Camera: a twelve-message conversation keeps the newest bubble in frame,
   with the oldest scrolling off the top.
6. Export: a recorded WebM opens (or decodes, e.g. via a `<video>` element)
   at the selected resolution and its frames match the preview.
7. Live mode: typing a message and pressing Enter drops the bubble onto the
   stack; a second Enter stacks the next bubble below it without disturbing
   the first.
8. Live mode: the side toggle flips by click and by pressing Tab inside the
   input, and the chosen side persists across several messages.
9. Turning typing animation off makes bubbles appear immediately (script and
   live), with no indicator.
10. Enough live messages to overflow the stage keep the newest bubble in
    frame; Clear empties the stack and resets the camera.
11. Record in Live mode runs until Stop is pressed; Record in Script mode
    stops itself when playback ends.
12. Switching modes back and forth leaves neither mode's animation running in
    the background.
13. No three-dot "typing indicator" appears anywhere, in either mode — text
    types in one character at a time and the bubble grows to fit as it does.
14. The first bubble sits at the bottom of the stage on the very first frame,
    with nothing sliding up into place on load; each new bubble afterward
    eases the stack upward.
15. At a narrow or short browser window, the canvas scales down to fit the
    stage instead of being clipped.
16. Bubble text is optically centred in its bubble — equal space above and
    below a single line — and Thai vowels and tone marks are not clipped by
    the bubble's top edge.
17. In iMessage style, the tail stays welded to the bubble at every message
    length, including a one-character bubble and a bubble wide enough to
    reach the wrap width.

## Architecture

![Architecture: input becomes messages, messages become timed items, timed items become pixels](docs/architecture.svg)

`app.js` is the only module that touches the DOM; everything below it is pure
or canvas-only. Design history lives in `docs/superpowers/`. Notes for anyone
(human or agent) changing this code are in `CLAUDE.md`.
