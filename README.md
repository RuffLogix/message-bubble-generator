# Message Bubble Generator

Animates a chat conversation on a chroma-key background for use in video, and
exports it as a WebM file. Each message types itself in one character
(grapheme) at a time, growing its bubble to fit as it goes, and the
conversation stack hangs off the bottom of the frame, easing upward as new
bubbles arrive.

There are two modes:

- **Script** — paste a list of `L:`/`R:` prefixed lines into the textarea and
  press Play to animate the whole conversation on a timeline you can record.
- **Live** — type into the message box and press Enter to drop a bubble onto
  the stack immediately, one message at a time; useful for narrating a
  conversation live while recording.

## Running

ES modules are blocked over `file://`, so serve the folder:

    python3 -m http.server 8000

Then open <http://localhost:8000/index.html>.

## Tests

Open <http://localhost:8000/tests/tests.html>. The page runs the unit tests
for the parser, the timeline, live-mode item building, and text
measurement/wrapping, and prints a pass/fail summary.

Rendering, camera movement, and WebM export are verified by hand; see the
checklist below.

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
