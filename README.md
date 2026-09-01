# Message Bubble Generator

Animates a chat conversation on a chroma-key background for use in video, and
exports it as a WebM file.

## Running

ES modules are blocked over `file://`, so serve the folder:

    python3 -m http.server 8000

Then open <http://localhost:8000/index.html>.

## Tests

Open <http://localhost:8000/tests/tests.html>. The page runs the unit tests for
the parser, the timeline, and text measurement, and prints a pass/fail summary.

Rendering, camera movement, and WebM export are verified by hand; the checklist
lives in the design spec under "Testing".
