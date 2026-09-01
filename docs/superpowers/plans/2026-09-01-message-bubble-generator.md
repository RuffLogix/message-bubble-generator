# Message Bubble Animation Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free browser page that animates a chat conversation on a chroma-key background and exports it as WebM.

**Architecture:** Everything is drawn on one `<canvas>` at full output resolution. Pure-logic modules (parsing, timeline, text measurement) are covered by browser-run unit tests; drawing and recording are verified manually. The renderer is a pure function of elapsed time, so preview, replay, and recording all share one code path.

**Tech Stack:** Plain HTML, CSS, and ES modules. Canvas 2D API. `MediaRecorder` with `canvas.captureStream`. No build step, no package manager, no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-message-bubble-generator-design.md`

## Global Constraints

- No dependencies, no build step, no package manager. Only plain `.html`, `.css`, and `.js` files.
- All JavaScript is ES modules (`<script type="module">`). Because modules are blocked over `file://`, the page and the tests are served with `python3 -m http.server 8000` from the repository root.
- All layout arithmetic is in output pixels (1080 wide for the 9:16 default), never CSS pixels. The canvas backing store is the output resolution; CSS only scales it for display.
- Default stage background is `#00B140`. Default bubble background is `#FFFFFF` on both sides, default bubble text is `#000000`.
- Hold duration is always `clamp(text.length * msPerChar, 400, 4000)` milliseconds.
- Message side prefixes are `L:` and `R:`, case-insensitive, with an optional single space after the colon.
- Text must wrap correctly for both space-separated Latin script and unspaced Thai script.
- Commit after every task with a conventional-commit message.

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/app.js`
- Create: `tests/assert.js`
- Create: `tests/tests.html`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `tests/assert.js` exporting `test(name, fn)`, `eq(actual, expected, message)`, `ok(value, message)`, and `report(rootElement)`. Every later task's tests import these.

- [ ] **Step 1: Write the test harness**

Create `tests/assert.js`:

```js
const results = [];

export function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true, err: null });
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
  }
}

export function eq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${message || 'not equal'}: expected ${b}, got ${a}`);
  }
}

export function ok(value, message) {
  if (!value) {
    throw new Error(message || 'expected truthy value');
  }
}

export function report(root) {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const head = document.createElement('h2');
  head.textContent = `${passed} passed, ${failed} failed`;
  head.style.color = failed === 0 ? '#137a3f' : '#b3261e';
  root.appendChild(head);
  for (const r of results) {
    const line = document.createElement('div');
    line.textContent = `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : ' — ' + r.err}`;
    line.style.color = r.ok ? '#137a3f' : '#b3261e';
    line.style.fontFamily = 'monospace';
    root.appendChild(line);
  }
}
```

- [ ] **Step 2: Write the test page**

Create `tests/tests.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tests — message bubble generator</title>
  </head>
  <body>
    <h1>Tests</h1>
    <div id="results"></div>
    <script type="module">
      import { report } from './assert.js';
      await import('./harness.test.js');
      report(document.getElementById('results'));
    </script>
  </body>
</html>
```

- [ ] **Step 3: Write a failing harness self-test**

Create `tests/harness.test.js`:

```js
import { test, eq, ok } from './assert.js';

test('eq compares deep values', () => {
  eq([1, { a: 2 }], [1, { a: 2 }]);
});

test('ok accepts truthy', () => {
  ok(1 === 1);
});
```

- [ ] **Step 4: Serve and run the tests**

Run: `python3 -m http.server 8000` from the repository root, then open `http://localhost:8000/tests/tests.html`.
Expected: heading reads `2 passed, 0 failed`.

- [ ] **Step 5: Create the application shell**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Message Bubble Generator</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="app">
      <aside class="panel" id="panel"></aside>
      <section class="stage" id="stage">
        <canvas id="canvas"></canvas>
      </section>
    </main>
    <script type="module" src="src/app.js"></script>
  </body>
</html>
```

Create `styles.css`:

```css
:root {
  color-scheme: light dark;
  --panel-bg: #f4f4f5;
  --panel-fg: #18181b;
  --stage-bg: #27272a;
  --border: #d4d4d8;
}

@media (prefers-color-scheme: dark) {
  :root {
    --panel-bg: #18181b;
    --panel-fg: #f4f4f5;
    --stage-bg: #09090b;
    --border: #3f3f46;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--panel-fg);
}

.app {
  display: grid;
  grid-template-columns: 340px 1fr;
  height: 100vh;
}

.panel {
  background: var(--panel-bg);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 16px;
}

.stage {
  background: var(--stage-bg);
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
}

#canvas {
  max-width: 100%;
  max-height: 100%;
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.4);
}

@media (max-width: 800px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: auto;
  }
  .panel {
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
}
```

Create `src/app.js`:

```js
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = 1080;
canvas.height = 1920;
ctx.fillStyle = '#00B140';
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

- [ ] **Step 6: Verify the shell renders**

Open `http://localhost:8000/index.html`.
Expected: a green portrait rectangle fills the stage area next to an empty panel column, with no console errors.

- [ ] **Step 7: Write the README**

Create `README.md`:

```markdown
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
```

- [ ] **Step 8: Commit**

```bash
git add index.html styles.css src/app.js tests/ README.md
git commit -m "feat: scaffold page shell and browser test harness"
```

---

### Task 2: Message parser

**Files:**
- Create: `src/parse.js`
- Create: `tests/parse.test.js`
- Modify: `tests/tests.html` (import the new test module)

**Interfaces:**
- Consumes: `test`, `eq` from `tests/assert.js`.
- Produces: `parseMessages(raw: string) => Array<{ side: 'left' | 'right', text: string }>`. Task 3 consumes this array shape.

- [ ] **Step 1: Write the failing tests**

Create `tests/parse.test.js`:

```js
import { test, eq } from './assert.js';
import { parseMessages } from '../src/parse.js';

test('parses L and R prefixes', () => {
  eq(parseMessages('L: hello\nR: hi'), [
    { side: 'left', text: 'hello' },
    { side: 'right', text: 'hi' },
  ]);
});

test('prefix is case-insensitive and space after colon is optional', () => {
  eq(parseMessages('l:hello\nr:  hi'), [
    { side: 'left', text: 'hello' },
    { side: 'right', text: 'hi' },
  ]);
});

test('unprefixed line inherits the previous side', () => {
  eq(parseMessages('R: hi\nagain'), [
    { side: 'right', text: 'hi' },
    { side: 'right', text: 'again' },
  ]);
});

test('leading unprefixed line defaults to left', () => {
  eq(parseMessages('hello'), [{ side: 'left', text: 'hello' }]);
});

test('blank and whitespace-only lines are dropped', () => {
  eq(parseMessages('L: a\n\n   \nL: b'), [
    { side: 'left', text: 'a' },
    { side: 'left', text: 'b' },
  ]);
});

test('a prefix with no text is dropped and does not change side', () => {
  eq(parseMessages('R: hi\nL:\nagain'), [
    { side: 'right', text: 'hi' },
    { side: 'right', text: 'again' },
  ]);
});

test('a colon inside the message body is preserved', () => {
  eq(parseMessages('L: time: 9:30'), [{ side: 'left', text: 'time: 9:30' }]);
});

test('empty input yields an empty list', () => {
  eq(parseMessages('   \n  '), []);
});
```

Add the import to `tests/tests.html`, directly after the harness import:

```js
      await import('./parse.test.js');
```

- [ ] **Step 2: Run the tests to verify they fail**

Open `http://localhost:8000/tests/tests.html`.
Expected: the page shows an error in the console, `Failed to resolve module specifier` or a 404 for `../src/parse.js`.

- [ ] **Step 3: Write the parser**

Create `src/parse.js`:

```js
const PREFIX = /^([LR]):[ ]?(.*)$/i;

export function parseMessages(raw) {
  const messages = [];
  let side = 'left';

  for (const line of String(raw).split('\n')) {
    const match = line.match(PREFIX);
    let text;

    if (match) {
      side = match[1].toUpperCase() === 'L' ? 'left' : 'right';
      text = match[2].trim();
    } else {
      text = line.trim();
    }

    if (text === '') continue;
    messages.push({ side, text });
  }

  return messages;
}
```

Note on `a prefix with no text is dropped and does not change side`: the code above does update `side` before dropping the empty text, which fails that test. Correct it by capturing the side locally and only committing it when text survives:

```js
const PREFIX = /^([LR]):[ ]?(.*)$/i;

export function parseMessages(raw) {
  const messages = [];
  let side = 'left';

  for (const line of String(raw).split('\n')) {
    const match = line.match(PREFIX);
    const lineSide = match
      ? (match[1].toUpperCase() === 'L' ? 'left' : 'right')
      : side;
    const text = (match ? match[2] : line).trim();

    if (text === '') continue;

    side = lineSide;
    messages.push({ side, text });
  }

  return messages;
}
```

Use the second version.

- [ ] **Step 4: Run the tests to verify they pass**

Open `http://localhost:8000/tests/tests.html`.
Expected: `10 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/parse.js tests/parse.test.js tests/tests.html
git commit -m "feat: parse prefixed message lines into sided messages"
```

---

### Task 3: Timeline builder

**Files:**
- Create: `src/timeline.js`
- Create: `tests/timeline.test.js`
- Modify: `tests/tests.html` (import the new test module)

**Interfaces:**
- Consumes: the message array from `parseMessages`.
- Produces:
  - `HOLD_MIN_MS = 400`, `HOLD_MAX_MS = 4000`
  - `clampHold(ms: number) => number`
  - `buildTimeline(messages, opts) => { items: TimelineItem[], duration: number }` where `opts` is `{ msPerChar, typingMs, gapMs, typingEnabled }` and `TimelineItem` is `{ index, side, text, typingStart: number | null, typingEnd: number | null, appearAt: number }`. Tasks 5, 6, and 7 read `items` and `duration`.

- [ ] **Step 1: Write the failing tests**

Create `tests/timeline.test.js`:

```js
import { test, eq } from './assert.js';
import { buildTimeline, clampHold, HOLD_MIN_MS, HOLD_MAX_MS } from '../src/timeline.js';

const OPTS = { msPerChar: 100, typingMs: 900, gapMs: 300, typingEnabled: true };

test('clampHold enforces the minimum', () => {
  eq(clampHold(10), HOLD_MIN_MS);
});

test('clampHold enforces the maximum', () => {
  eq(clampHold(99999), HOLD_MAX_MS);
});

test('clampHold passes through in-range values', () => {
  eq(clampHold(1000), 1000);
});

test('first message types then appears', () => {
  const { items } = buildTimeline([{ side: 'left', text: 'abcdefghij' }], OPTS);
  eq(items[0].typingStart, 0);
  eq(items[0].typingEnd, 900);
  eq(items[0].appearAt, 900);
});

test('typing disabled removes the typing window', () => {
  const { items } = buildTimeline(
    [{ side: 'left', text: 'abcdefghij' }],
    { ...OPTS, typingEnabled: false },
  );
  eq(items[0].typingStart, null);
  eq(items[0].typingEnd, null);
  eq(items[0].appearAt, 0);
});

test('second message starts after hold plus gap', () => {
  // 10 chars * 100ms = 1000ms hold, in range. appear 900, hold to 1900, gap to 2200.
  const { items } = buildTimeline(
    [
      { side: 'left', text: 'abcdefghij' },
      { side: 'right', text: 'abcdefghij' },
    ],
    OPTS,
  );
  eq(items[1].typingStart, 2200);
  eq(items[1].typingEnd, 3100);
  eq(items[1].appearAt, 3100);
});

test('short message hold is clamped up to the minimum', () => {
  // 1 char * 100ms = 100ms, clamped to 400ms.
  const { items } = buildTimeline(
    [{ side: 'left', text: 'a' }, { side: 'left', text: 'b' }],
    { ...OPTS, typingEnabled: false },
  );
  eq(items[1].appearAt, HOLD_MIN_MS + 300);
});

test('items carry index, side, and text', () => {
  const { items } = buildTimeline([{ side: 'right', text: 'hi' }], OPTS);
  eq(items[0].index, 0);
  eq(items[0].side, 'right');
  eq(items[0].text, 'hi');
});

test('duration covers the last hold and trailing gap', () => {
  const { duration } = buildTimeline(
    [{ side: 'left', text: 'abcdefghij' }],
    { ...OPTS, typingEnabled: false },
  );
  eq(duration, 1000 + 300);
});

test('empty message list yields no items and zero duration', () => {
  eq(buildTimeline([], OPTS), { items: [], duration: 0 });
});
```

Add to `tests/tests.html`:

```js
      await import('./timeline.test.js');
```

- [ ] **Step 2: Run the tests to verify they fail**

Open `http://localhost:8000/tests/tests.html`.
Expected: console shows a 404 for `../src/timeline.js`.

- [ ] **Step 3: Write the timeline builder**

Create `src/timeline.js`:

```js
export const HOLD_MIN_MS = 400;
export const HOLD_MAX_MS = 4000;

export function clampHold(ms) {
  return Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, ms));
}

export function buildTimeline(messages, opts) {
  const { msPerChar, typingMs, gapMs, typingEnabled } = opts;
  const items = [];
  let cursor = 0;

  messages.forEach((message, index) => {
    let typingStart = null;
    let typingEnd = null;

    if (typingEnabled) {
      typingStart = cursor;
      typingEnd = cursor + typingMs;
      cursor = typingEnd;
    }

    const appearAt = cursor;
    items.push({ index, side: message.side, text: message.text, typingStart, typingEnd, appearAt });

    cursor = appearAt + clampHold(message.text.length * msPerChar) + gapMs;
  });

  return { items, duration: cursor };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Open `http://localhost:8000/tests/tests.html`.
Expected: `20 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/timeline.js tests/timeline.test.js tests/tests.html
git commit -m "feat: build an absolute-time event timeline from messages"
```

---

### Task 4: Text wrapping and bubble measurement

**Files:**
- Create: `src/layout.js`
- Create: `tests/layout.test.js`
- Modify: `tests/tests.html` (import the new test module)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => string[]`
  - `measureBubble(ctx, text, metrics) => { lines: string[], width: number, height: number }` where `metrics` is `{ maxTextWidth, padX, padY, lineHeight }`. Task 5 consumes both.

- [ ] **Step 1: Write the failing tests**

The tests use a real canvas context with a fixed monospace font so widths are predictable. `20px monospace` gives a 12px advance per ASCII character in Chrome; the tests assert on line counts and relative widths rather than exact pixel values, so they stay stable across platforms.

Create `tests/layout.test.js`:

```js
import { test, eq, ok } from './assert.js';
import { wrapText, measureBubble } from '../src/layout.js';

function makeCtx() {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.font = '20px monospace';
  return ctx;
}

test('short text stays on one line', () => {
  const ctx = makeCtx();
  eq(wrapText(ctx, 'hello', 500), ['hello']);
});

test('long spaced text wraps onto multiple lines', () => {
  const ctx = makeCtx();
  const lines = wrapText(ctx, 'the quick brown fox jumps over the lazy dog', 200);
  ok(lines.length > 1, 'expected more than one line');
  for (const line of lines) {
    ok(ctx.measureText(line).width <= 200, `line too wide: ${line}`);
  }
});

test('wrapping does not lose or duplicate words', () => {
  const ctx = makeCtx();
  const text = 'the quick brown fox jumps over the lazy dog';
  const lines = wrapText(ctx, text, 200);
  eq(lines.join(' '), text);
});

test('an unspaced run longer than maxWidth breaks by character', () => {
  const ctx = makeCtx();
  const text = 'สวัสดีครับวันนี้อากาศดีมากเลยนะครับผมสบายดีขอบคุณ';
  const lines = wrapText(ctx, text, 200);
  ok(lines.length > 1, 'expected the unspaced run to break');
  for (const line of lines) {
    ok(ctx.measureText(line).width <= 200, `line too wide: ${line}`);
  }
  eq(lines.join(''), text);
});

test('a single character wider than maxWidth still emits one line', () => {
  const ctx = makeCtx();
  const lines = wrapText(ctx, 'W', 2);
  eq(lines, ['W']);
});

test('measureBubble sizes to the widest line plus padding', () => {
  const ctx = makeCtx();
  const metrics = { maxTextWidth: 500, padX: 24, padY: 16, lineHeight: 28 };
  const result = measureBubble(ctx, 'hello', metrics);
  eq(result.lines, ['hello']);
  eq(result.height, 28 + 32);
  ok(result.width > 48, 'width should exceed horizontal padding alone');
  ok(result.width < 500 + 48, 'width should not exceed the cap plus padding');
});

test('measureBubble height grows one lineHeight per line', () => {
  const ctx = makeCtx();
  const metrics = { maxTextWidth: 200, padX: 24, padY: 16, lineHeight: 28 };
  const one = measureBubble(ctx, 'hi', metrics);
  const many = measureBubble(ctx, 'the quick brown fox jumps over the lazy dog', metrics);
  eq(many.height, 28 * many.lines.length + 32);
  ok(many.height > one.height, 'multi-line bubble should be taller');
});
```

Add to `tests/tests.html`:

```js
      await import('./layout.test.js');
```

- [ ] **Step 2: Run the tests to verify they fail**

Open `http://localhost:8000/tests/tests.html`.
Expected: console shows a 404 for `../src/layout.js`.

- [ ] **Step 3: Write the layout module**

Create `src/layout.js`:

```js
function breakLongWord(ctx, word, maxWidth) {
  const parts = [];
  let current = '';

  for (const char of word) {
    const candidate = current + char;
    if (current !== '' && ctx.measureText(candidate).width > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current !== '') parts.push(current);
  return parts;
}

export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let current = '';

  for (const word of String(text).split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;

    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current !== '') {
      lines.push(current);
      current = '';
    }

    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }

    const parts = breakLongWord(ctx, word, maxWidth);
    lines.push(...parts.slice(0, -1));
    current = parts[parts.length - 1] ?? '';
  }

  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export function measureBubble(ctx, text, metrics) {
  const { maxTextWidth, padX, padY, lineHeight } = metrics;
  const lines = wrapText(ctx, text, maxTextWidth);
  let widest = 0;

  for (const line of lines) {
    widest = Math.max(widest, ctx.measureText(line).width);
  }

  return {
    lines,
    width: Math.ceil(widest) + padX * 2,
    height: lines.length * lineHeight + padY * 2,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Open `http://localhost:8000/tests/tests.html`.
Expected: `27 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/layout.js tests/layout.test.js tests/tests.html
git commit -m "feat: wrap text and measure bubble boxes on canvas"
```

---

### Task 5: Renderer — background, bubble shapes, and text

**Files:**
- Create: `src/renderer.js`
- Modify: `src/app.js` (drive the renderer with a hardcoded scene)

**Interfaces:**
- Consumes: `measureBubble` from `src/layout.js`; timeline `items` from `src/timeline.js`.
- Produces: `renderFrame(ctx, timeline, elapsed, settings)` where `settings` is
  `{ width, height, style, bgColor, transparent, leftBg, leftFg, rightBg, rightFg, fontSize, fontFamily, senderName }`.
  `style` is one of `'imessage' | 'line' | 'minimal'`. Tasks 6, 7, and 8 call this one function.

- [ ] **Step 1: Write the renderer**

Create `src/renderer.js`:

```js
import { measureBubble } from './layout.js';

const APPEAR_MS = 220;
const SIDE_MARGIN_RATIO = 0.06;
const MAX_BUBBLE_RATIO = 0.72;
const GUTTER_RATIO = 0.55;
const BOTTOM_PAD_RATIO = 0.06;

function metricsFor(settings) {
  const { width, fontSize } = settings;
  return {
    padX: Math.round(fontSize * 0.62),
    padY: Math.round(fontSize * 0.42),
    lineHeight: Math.round(fontSize * 1.32),
    maxTextWidth: Math.round(width * MAX_BUBBLE_RATIO) - Math.round(fontSize * 0.62) * 2,
    sideMargin: Math.round(width * SIDE_MARGIN_RATIO),
    gutter: Math.round(fontSize * GUTTER_RATIO),
    bottomPad: Math.round(settings.height * BOTTOM_PAD_RATIO),
    radius: Math.round(fontSize * 0.6),
  };
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawTail(ctx, x, y, w, h, side, size) {
  ctx.beginPath();
  if (side === 'right') {
    ctx.moveTo(x + w - size, y + h);
    ctx.quadraticCurveTo(x + w + size * 0.4, y + h, x + w + size * 0.9, y + h - size * 0.1);
    ctx.quadraticCurveTo(x + w + size * 0.1, y + h - size * 0.2, x + w, y + h - size);
  } else {
    ctx.moveTo(x + size, y + h);
    ctx.quadraticCurveTo(x - size * 0.4, y + h, x - size * 0.9, y + h - size * 0.1);
    ctx.quadraticCurveTo(x - size * 0.1, y + h - size * 0.2, x, y + h - size);
  }
  ctx.closePath();
  ctx.fill();
}

function drawBubbleShape(ctx, style, x, y, w, h, side, m) {
  if (style === 'imessage') {
    roundedRect(ctx, x, y, w, h, Math.round(h / 2 < m.radius * 2 ? h / 2 : m.radius * 2));
    ctx.fill();
    drawTail(ctx, x, y, w, h, side, m.radius);
  } else if (style === 'line') {
    roundedRect(ctx, x, y, w, h, m.radius);
    ctx.fill();
  } else {
    roundedRect(ctx, x, y, w, h, Math.round(m.radius * 0.5));
    ctx.fill();
  }
}

function colorsFor(side, settings) {
  return side === 'left'
    ? { bg: settings.leftBg, fg: settings.leftFg }
    : { bg: settings.rightBg, fg: settings.rightFg };
}

// Returns the stacked boxes for every item visible at `elapsed`, in draw order.
// `y` is relative to the top of the content column, before any camera offset.
export function layoutScene(ctx, timeline, elapsed, settings) {
  const m = metricsFor(settings);
  ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;

  const boxes = [];
  let y = 0;

  for (const item of timeline.items) {
    const typing =
      item.typingStart !== null && elapsed >= item.typingStart && elapsed < item.typingEnd;
    const appeared = elapsed >= item.appearAt;
    if (!typing && !appeared) break;

    if (typing) {
      const w = Math.round(settings.fontSize * 3.4);
      const h = Math.round(settings.fontSize * 1.9);
      boxes.push({ kind: 'typing', side: item.side, x: 0, y, width: w, height: h, progress: 1, item });
      y += h + m.gutter;
      break;
    }

    const measured = measureBubble(ctx, item.text, m);
    const progress = Math.min(1, (elapsed - item.appearAt) / APPEAR_MS);
    boxes.push({
      kind: 'bubble',
      side: item.side,
      x: 0,
      y,
      width: measured.width,
      height: measured.height,
      lines: measured.lines,
      progress,
      item,
    });
    y += measured.height + m.gutter;
  }

  for (const box of boxes) {
    box.x = box.side === 'left'
      ? m.sideMargin
      : settings.width - m.sideMargin - box.width;
  }

  return { boxes, contentHeight: y, metrics: m };
}

function drawTypingDots(ctx, box, settings, elapsed) {
  const { fg } = colorsFor(box.side, settings);
  const r = Math.round(settings.fontSize * 0.16);
  const spacing = r * 3.2;
  const cx = box.x + box.width / 2 - spacing;
  const cy = box.y + box.height / 2;

  ctx.fillStyle = fg;
  for (let i = 0; i < 3; i += 1) {
    const phase = (elapsed / 500 + i * 0.22) % 1;
    const lift = Math.sin(phase * Math.PI * 2) * r * 0.9;
    ctx.globalAlpha = 0.45 + 0.55 * ((Math.sin(phase * Math.PI * 2) + 1) / 2);
    ctx.beginPath();
    ctx.arc(cx + i * spacing, cy - lift, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSenderName(ctx, box, settings, m) {
  if (settings.style !== 'line' || box.side !== 'left' || !settings.senderName) return 0;
  const size = Math.round(settings.fontSize * 0.6);
  ctx.font = `${size}px ${settings.fontFamily}`;
  ctx.fillStyle = settings.leftFg;
  ctx.globalAlpha = 0.75;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(settings.senderName, box.x + m.padX * 0.2, box.y - Math.round(size * 0.4));
  ctx.globalAlpha = 1;
  ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;
  return size;
}

export function renderFrame(ctx, timeline, elapsed, settings) {
  const { width, height } = settings;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!settings.transparent) {
    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  const scene = layoutScene(ctx, timeline, elapsed, settings);
  const m = scene.metrics;

  ctx.save();
  ctx.translate(0, settings.cameraY ?? 0);

  for (const box of scene.boxes) {
    const { bg, fg } = colorsFor(box.side, settings);
    const scale = box.progress >= 1 ? 1 : 0.7 + 0.3 * easeOutBack(box.progress);
    const alpha = Math.min(1, box.progress * 1.6);

    ctx.save();
    ctx.globalAlpha = alpha;
    const originX = box.side === 'left' ? box.x : box.x + box.width;
    ctx.translate(originX, box.y + box.height);
    ctx.scale(scale, scale);
    ctx.translate(-originX, -(box.y + box.height));

    ctx.fillStyle = bg;
    drawBubbleShape(ctx, settings.style, box.x, box.y, box.width, box.height, box.side, m);

    if (box.kind === 'typing') {
      drawTypingDots(ctx, box, settings, elapsed);
    } else {
      drawSenderName(ctx, box, settings, m);
      ctx.fillStyle = fg;
      ctx.textBaseline = 'top';
      ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;
      box.lines.forEach((line, i) => {
        ctx.fillText(line, box.x + m.padX, box.y + m.padY + i * m.lineHeight);
      });
    }

    ctx.restore();
  }

  ctx.restore();
  return scene;
}
```

- [ ] **Step 2: Drive the renderer from a hardcoded scene**

Replace `src/app.js` with:

```js
import { parseMessages } from './parse.js';
import { buildTimeline } from './timeline.js';
import { renderFrame } from './renderer.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 1080;
canvas.height = 1920;

const settings = {
  width: 1080,
  height: 1920,
  style: 'imessage',
  bgColor: '#00B140',
  transparent: false,
  leftBg: '#FFFFFF',
  leftFg: '#000000',
  rightBg: '#FFFFFF',
  rightFg: '#000000',
  fontSize: 44,
  fontFamily: 'system-ui, sans-serif',
  senderName: '',
  cameraY: 0,
};

const messages = parseMessages('L: สวัสดีครับ\nR: ว่าไง\nL: วันนี้ว่างมั้ย\nR: ว่าง');
const timeline = buildTimeline(messages, {
  msPerChar: 60,
  typingMs: 900,
  gapMs: 300,
  typingEnabled: true,
});

const start = performance.now();
function loop(now) {
  const elapsed = (now - start) % timeline.duration;
  renderFrame(ctx, timeline, elapsed, settings);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

- [ ] **Step 3: Verify visually**

Open `http://localhost:8000/index.html`.
Expected, on a loop: a typing bubble with three bouncing dots on the left, then a white left bubble with Thai text and a tail pointing left, then a typing bubble on the right, then a white right bubble with a tail pointing right, and so on. Text stays inside every bubble. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer.js src/app.js
git commit -m "feat: render bubbles, tails, typing dots, and appear animation"
```

---

### Task 6: Camera follow

**Files:**
- Modify: `src/renderer.js` (export a camera target helper)
- Modify: `src/app.js` (ease the camera toward its target each frame)

**Interfaces:**
- Consumes: `layoutScene`'s `contentHeight` and `metrics`.
- Produces: `cameraTargetY(contentHeight, settings) => number`, a non-positive translation. Task 7 reuses it.

- [ ] **Step 1: Add the camera target helper**

Append to `src/renderer.js`:

```js
export function cameraTargetY(contentHeight, settings) {
  const m = metricsFor(settings);
  const usable = settings.height - m.bottomPad * 2;
  if (contentHeight <= usable) return 0;
  return -(contentHeight - usable);
}
```

Also change `renderFrame` so the content column starts below the top padding: replace

```js
  ctx.translate(0, settings.cameraY ?? 0);
```

with

```js
  ctx.translate(0, m.bottomPad + (settings.cameraY ?? 0));
```

- [ ] **Step 2: Ease the camera in the loop**

In `src/app.js`, replace the animation loop with:

```js
import { renderFrame, cameraTargetY } from './renderer.js';

let camera = 0;
let last = performance.now();
const start = performance.now();

function loop(now) {
  const dt = Math.min(64, now - last);
  last = now;
  const elapsed = (now - start) % timeline.duration;

  const probe = renderFrame(ctx, timeline, elapsed, { ...settings, cameraY: camera });
  const target = cameraTargetY(probe.contentHeight, settings);
  camera += (target - camera) * (1 - Math.exp(-dt / 120));

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

Keep the existing `import { parseMessages }` and `import { buildTimeline }` lines; merge the renderer import rather than duplicating it.

- [ ] **Step 3: Verify visually with a long conversation**

Temporarily change the sample text in `src/app.js` to twelve lines alternating `L:` and `R:`, then open `http://localhost:8000/index.html`.
Expected: once the column fills the frame, it eases upward so the newest bubble stays visible near the bottom, with no snapping. Restore the four-line sample afterward.

- [ ] **Step 4: Commit**

```bash
git add src/renderer.js src/app.js
git commit -m "feat: ease the camera to keep the newest bubble in frame"
```

---

### Task 7: Control panel and playback

**Files:**
- Modify: `index.html` (panel markup)
- Modify: `styles.css` (control styling)
- Modify: `src/app.js` (read controls, wire Play/Reset)

**Interfaces:**
- Consumes: `parseMessages`, `buildTimeline`, `renderFrame`, `cameraTargetY`.
- Produces: `readSettings()` and `readTiming()` inside `src/app.js`, plus a `#record` button element that Task 8 wires up.

- [ ] **Step 1: Write the panel markup**

Replace the `<aside class="panel" id="panel"></aside>` line in `index.html` with:

```html
      <aside class="panel">
        <label class="field">
          <span>Messages</span>
          <textarea id="messages" rows="10" spellcheck="false">L: สวัสดีครับ
R: ว่าไง
L: วันนี้ว่างมั้ย
R: ว่าง</textarea>
        </label>

        <label class="field checkbox">
          <input type="checkbox" id="typingEnabled" checked />
          <span>Typing animation</span>
        </label>

        <label class="field"><span>Typing duration (ms)</span>
          <input type="number" id="typingMs" value="900" min="0" max="10000" step="50" /></label>
        <label class="field"><span>Milliseconds per character</span>
          <input type="number" id="msPerChar" value="60" min="0" max="1000" step="5" /></label>
        <label class="field"><span>Gap between bubbles (ms)</span>
          <input type="number" id="gapMs" value="300" min="0" max="10000" step="50" /></label>

        <label class="field"><span>Style</span>
          <select id="style">
            <option value="imessage" selected>iMessage</option>
            <option value="line">LINE</option>
            <option value="minimal">Minimal</option>
          </select></label>
        <label class="field"><span>Sender name (LINE style)</span>
          <input type="text" id="senderName" value="" /></label>
        <label class="field"><span>Aspect ratio</span>
          <select id="aspect">
            <option value="9:16" selected>9:16 — 1080×1920</option>
            <option value="1:1">1:1 — 1080×1080</option>
            <option value="16:9">16:9 — 1920×1080</option>
          </select></label>

        <label class="field"><span>Left bubble background</span>
          <input type="color" id="leftBg" value="#FFFFFF" /></label>
        <label class="field"><span>Left bubble text</span>
          <input type="color" id="leftFg" value="#000000" /></label>
        <label class="field"><span>Right bubble background</span>
          <input type="color" id="rightBg" value="#FFFFFF" /></label>
        <label class="field"><span>Right bubble text</span>
          <input type="color" id="rightFg" value="#000000" /></label>
        <label class="field"><span>Stage background</span>
          <input type="color" id="bgColor" value="#00B140" /></label>
        <label class="field checkbox">
          <input type="checkbox" id="transparent" />
          <span>Transparent background (experimental)</span>
        </label>

        <label class="field"><span>Font size (px)</span>
          <input type="number" id="fontSize" value="44" min="12" max="200" step="1" /></label>
        <label class="field"><span>Font</span>
          <select id="fontFamily">
            <option value='system-ui, "IBM Plex Sans Thai", "Noto Sans Thai", sans-serif' selected>System</option>
            <option value='"IBM Plex Sans Thai", "Noto Sans Thai", system-ui, sans-serif'>Plex Sans Thai</option>
            <option value='"Noto Sans Thai", system-ui, sans-serif'>Noto Sans Thai</option>
            <option value='ui-monospace, "JetBrains Mono", monospace'>Monospace</option>
          </select></label>

        <div class="buttons">
          <button id="play" type="button">Play</button>
          <button id="reset" type="button">Reset</button>
          <button id="record" type="button">Record</button>
        </div>
        <p class="note" id="note"></p>
      </aside>
```

- [ ] **Step 2: Style the panel**

Append to `styles.css`:

```css
.field {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
}

.field > span {
  display: block;
  margin-bottom: 4px;
  opacity: 0.8;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: canvas;
  color: inherit;
}

.field textarea {
  resize: vertical;
  line-height: 1.5;
}

.field input[type='color'] {
  height: 32px;
  padding: 2px;
}

.field.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field.checkbox input {
  width: auto;
}

.field.checkbox > span {
  margin: 0;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  position: sticky;
  bottom: 0;
  background: var(--panel-bg);
  padding: 8px 0;
}

.buttons button {
  flex: 1;
  padding: 10px;
  font: inherit;
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: canvas;
  color: inherit;
  cursor: pointer;
}

.buttons button:hover:not(:disabled) {
  background: color-mix(in srgb, canvas 85%, var(--panel-fg));
}

.buttons button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.note {
  font-size: 12px;
  min-height: 1.4em;
  opacity: 0.8;
}
```

- [ ] **Step 3: Wire the controls**

Replace `src/app.js` with:

```js
import { parseMessages } from './parse.js';
import { buildTimeline } from './timeline.js';
import { renderFrame, cameraTargetY } from './renderer.js';

const el = (id) => document.getElementById(id);
const canvas = el('canvas');
const ctx = canvas.getContext('2d', { alpha: true });
const note = el('note');

const ASPECTS = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
};

function num(id, min, max, fallback) {
  const input = el(id);
  let value = Number(input.value);
  if (!Number.isFinite(value)) value = fallback;
  value = Math.min(max, Math.max(min, value));
  if (String(value) !== input.value) input.value = String(value);
  return value;
}

function readTiming() {
  return {
    msPerChar: num('msPerChar', 0, 1000, 60),
    typingMs: num('typingMs', 0, 10000, 900),
    gapMs: num('gapMs', 0, 10000, 300),
    typingEnabled: el('typingEnabled').checked,
  };
}

function readSettings() {
  const [width, height] = ASPECTS[el('aspect').value];
  return {
    width,
    height,
    style: el('style').value,
    bgColor: el('bgColor').value,
    transparent: el('transparent').checked,
    leftBg: el('leftBg').value,
    leftFg: el('leftFg').value,
    rightBg: el('rightBg').value,
    rightFg: el('rightFg').value,
    fontSize: num('fontSize', 12, 200, 44),
    fontFamily: el('fontFamily').value,
    senderName: el('senderName').value,
    cameraY: 0,
  };
}

let timeline = { items: [], duration: 0 };
let settings = readSettings();
let playing = false;
let startedAt = 0;
let camera = 0;
let lastFrame = 0;

function rebuild() {
  settings = readSettings();
  canvas.width = settings.width;
  canvas.height = settings.height;
  timeline = buildTimeline(parseMessages(el('messages').value), readTiming());
}

function drawStatic() {
  rebuild();
  camera = 0;
  const probe = renderFrame(ctx, timeline, timeline.duration, { ...settings, cameraY: 0 });
  camera = cameraTargetY(probe.contentHeight, settings);
  renderFrame(ctx, timeline, timeline.duration, { ...settings, cameraY: camera });
}

function frame(now) {
  if (!playing) return;
  const dt = Math.min(64, now - lastFrame);
  lastFrame = now;

  const elapsed = now - startedAt;
  const probe = renderFrame(ctx, timeline, elapsed, { ...settings, cameraY: camera });
  const target = cameraTargetY(probe.contentHeight, settings);
  camera += (target - camera) * (1 - Math.exp(-dt / 120));

  if (elapsed >= timeline.duration) {
    playing = false;
    el('play').textContent = 'Play';
    document.dispatchEvent(new CustomEvent('playback-ended'));
    return;
  }
  requestAnimationFrame(frame);
}

export function play() {
  rebuild();
  if (timeline.items.length === 0) {
    note.textContent = 'Message list is empty.';
    return false;
  }
  note.textContent = '';
  camera = 0;
  playing = true;
  startedAt = performance.now();
  lastFrame = startedAt;
  el('play').textContent = 'Playing…';
  requestAnimationFrame(frame);
  return true;
}

export function stop() {
  playing = false;
  el('play').textContent = 'Play';
}

export function getCanvas() {
  return canvas;
}

export function getDuration() {
  return timeline.duration;
}

el('play').addEventListener('click', play);
el('reset').addEventListener('click', () => {
  stop();
  drawStatic();
});

for (const id of [
  'messages', 'typingEnabled', 'typingMs', 'msPerChar', 'gapMs', 'style',
  'senderName', 'aspect', 'leftBg', 'leftFg', 'rightBg', 'rightFg',
  'bgColor', 'transparent', 'fontSize', 'fontFamily',
]) {
  el(id).addEventListener('input', () => {
    if (!playing) drawStatic();
  });
}

drawStatic();
```

- [ ] **Step 4: Verify the controls**

Open `http://localhost:8000/index.html`.
Expected:
1. On load, the final frame of the sample conversation is shown on green.
2. Press Play — the conversation animates once and stops on the final frame.
3. Change the stage background color while stopped — the preview updates immediately.
4. Switch Style to LINE, type a sender name — the name appears above left bubbles, and the tails disappear.
5. Switch Aspect to 16:9 — the canvas becomes landscape and bubbles re-lay-out.
6. Clear the textarea and press Play — the note reads `Message list is empty.` and nothing animates.
7. Type `abc` into the milliseconds-per-character field — it clamps to a number on the next render.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css src/app.js
git commit -m "feat: add control panel with playback, styles, colors, and aspect"
```

---

### Task 8: WebM recording

**Files:**
- Create: `src/recorder.js`
- Modify: `src/app.js` (wire the Record button)

**Interfaces:**
- Consumes: `getCanvas()`, `getDuration()`, `play()`, and the `playback-ended` event from `src/app.js`.
- Produces:
  - `pickMimeType() => string | null`
  - `createRecorder(canvas, mimeType, fps) => { start(): void, stop(): Promise<Blob> }`
  - `downloadBlob(blob, filename) => void`

- [ ] **Step 1: Write the recorder module**

Create `src/recorder.js`:

```js
const CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export function createRecorder(canvas, mimeType, fps = 60) {
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  return {
    start() {
      recorder.start();
    },
    stop() {
      return new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.stop();
        for (const track of stream.getTracks()) track.stop();
      });
    },
  };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 2: Wire the Record button**

Append to `src/app.js`:

```js
import { pickMimeType, createRecorder, downloadBlob } from './recorder.js';

const recordButton = el('record');
const mimeType = pickMimeType();
let activeRecorder = null;

if (!mimeType) {
  recordButton.disabled = true;
  recordButton.title = 'This browser cannot record WebM. Screen record the preview instead.';
}

async function finishRecording() {
  if (!activeRecorder) return;
  const recorder = activeRecorder;
  activeRecorder = null;
  recordButton.textContent = 'Record';
  const blob = await recorder.stop();
  downloadBlob(blob, 'message-bubbles.webm');
  note.textContent = `Saved ${(blob.size / 1_000_000).toFixed(1)} MB.`;
}

recordButton.addEventListener('click', async () => {
  if (activeRecorder) {
    stop();
    await finishRecording();
    return;
  }

  rebuild();
  if (timeline.items.length === 0) {
    note.textContent = 'Message list is empty.';
    return;
  }

  activeRecorder = createRecorder(canvas, mimeType, 60);
  activeRecorder.start();
  recordButton.textContent = 'Stop';
  note.textContent = 'Recording…';
  play();
});

document.addEventListener('playback-ended', () => {
  if (!activeRecorder) return;
  setTimeout(finishRecording, 400);
});
```

Move the `import` line to the top of the file with the other imports; the rest of the block stays at the bottom.

Also make the transparent checkbox take effect on the canvas context. In `src/app.js`, inside `rebuild()`, after setting `canvas.height`, add:

```js
  canvas.style.background = settings.transparent
    ? 'repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 0 0 / 40px 40px'
    : 'none';
```

- [ ] **Step 3: Verify recording**

Open `http://localhost:8000/index.html`.
Expected:
1. Press Record — the button reads Stop, the note reads `Recording…`, and the animation plays.
2. When playback ends, a `message-bubbles.webm` download starts and the note reports the file size.
3. Open the downloaded file in a video player: the frames match the preview, the background is the chosen green, and the resolution is 1080×1920.
4. Press Record then Stop mid-animation — a shorter file downloads without error.
5. Tick Transparent background — the preview shows a checkerboard behind the bubbles, and recording still produces a playable file.

- [ ] **Step 4: Commit**

```bash
git add src/recorder.js src/app.js
git commit -m "feat: export the animation as a WebM file"
```

---

### Task 9: Manual verification pass and README checklist

**Files:**
- Modify: `README.md`
- Modify: `src/app.js` or `src/renderer.js` only if the pass finds defects

**Interfaces:**
- Consumes: everything.
- Produces: nothing new.

**Run this task LAST**, after Task 14, so the checklist covers live mode and the typewriter too.

- [ ] **Step 1: Run the unit tests**

Open `http://localhost:8000/tests/tests.html?v=<unique>` — the server sends no cache headers, so always cache-bust.
Expected: `34 passed, 0 failed` (2 harness + 8 parse + 8 timeline + 10 layout + 6 live).

- [ ] **Step 2: Add a .gitignore**

The repository has none, and an untracked `.DS_Store` has been sitting in the working tree. Create `.gitignore` containing `.DS_Store`, and remove the stray file.

- [ ] **Step 3: Run the manual checklist from the spec**

Work through the core items:
1. Parser cases through the real textarea — prefixed, unprefixed continuation, blank lines, prefix-only lines, mixed case.
2. Typing pace: a 5-character message at 100ms per character takes about half a second to type; a 200-character message is not clamped and simply takes proportionally longer.
3. A long English sentence and a long unspaced Thai sentence both stay inside their bubbles, and neither flashes a broken Thai glyph while typing.
4. A twelve-message conversation keeps the newest bubble visible, with the oldest scrolling off the top.
5. A recorded file opens in a video editor and its frames match the preview.

Then the live-mode items from the spec addendum:

6. In Live mode, typing a message and pressing Enter shows the typing indicator, then drops the bubble; a second Enter stacks the next bubble below it without disturbing the first.
7. The side toggle flips by click and by pressing Tab inside the input, and the chosen side persists across several messages.
8. Turning typing animation off makes bubbles appear immediately on Enter, with no indicator.
9. Enough live messages to overflow the stage keep the newest bubble in frame.
10. Clear empties the stack and resets the camera.
11. Record in Live mode runs until Stop is pressed and downloads a playable WebM; Record in Script mode still stops itself when playback ends.
12. Switching modes back and forth leaves neither mode's animation running in the background.

Then the typewriter and anchoring items from spec addendum 2:

13. No three-dot indicator appears anywhere, in either mode.
14. Text types in one character at a time and the bubble grows to fit as it does.
15. The first bubble sits at the bottom of the stage on the very first frame, with nothing sliding up into place on load.
16. Each new bubble eases the stack upward.
17. Turning the typewriter off makes bubbles appear complete, in both modes.

Fix any defect found before continuing. Note each fix in the commit message.

- [ ] **Step 3: Record the checklist in the README**

Append to `README.md`:

```markdown
## Manual checks before shipping a change

1. Unit tests pass at `/tests/tests.html`.
2. Parser: prefixed lines, unprefixed continuation, blank lines, prefix-only
   lines, and mixed-case prefixes all behave.
3. Timing: a 1-character message holds 400ms; a 200-character message at 60ms
   per character holds 4000ms, not 12000ms.
4. Wrapping: a long English sentence and a long unspaced Thai sentence both stay
   inside their bubbles.
5. Camera: a twelve-message conversation keeps the newest bubble in frame.
6. Export: a recorded WebM opens in a video editor at the selected resolution.
```

- [ ] **Step 4: Commit**

```bash
git add README.md src/
git commit -m "docs: record the manual verification checklist"
```

---

### Task 10: Live session item list

**Run this task after Task 8 and before Task 9.**

**Files:**
- Create: `src/live.js`
- Create: `tests/live.test.js`
- Modify: `tests/tests.html` (import the new test module)

**Interfaces:**
- Consumes: nothing from earlier tasks. Produces items in exactly the shape `src/timeline.js` produces, so `src/renderer.js` consumes them unchanged.
- Produces: `appendLive(items, message, now, opts) => Array<TimelineItem>` where `message` is `{ side, text }`, `now` is milliseconds since the live session started, `opts` is `{ typingMs, typingEnabled }`, and `TimelineItem` is `{ index, side, text, typingStart, typingEnd, appearAt }`. Task 11 consumes it.

- [ ] **Step 1: Write the failing tests**

Create `tests/live.test.js`:

```js
import { test, eq } from './assert.js';
import { appendLive } from '../src/live.js';

const OPTS = { typingMs: 900, typingEnabled: true };

test('appends one item carrying the side and text', () => {
  const items = appendLive([], { side: 'right', text: 'hi' }, 1000, OPTS);
  eq(items.length, 1);
  eq(items[0].side, 'right');
  eq(items[0].text, 'hi');
});

test('typing enabled stamps the typing window from now', () => {
  const items = appendLive([], { side: 'left', text: 'hi' }, 1000, OPTS);
  eq(items[0].typingStart, 1000);
  eq(items[0].typingEnd, 1900);
  eq(items[0].appearAt, 1900);
});

test('typing disabled appears immediately with no typing window', () => {
  const items = appendLive([], { side: 'left', text: 'hi' }, 1000, { ...OPTS, typingEnabled: false });
  eq(items[0].typingStart, null);
  eq(items[0].typingEnd, null);
  eq(items[0].appearAt, 1000);
});

test('index counts from zero and increments', () => {
  const first = appendLive([], { side: 'left', text: 'a' }, 0, OPTS);
  const second = appendLive(first, { side: 'right', text: 'b' }, 5000, OPTS);
  eq(second[0].index, 0);
  eq(second[1].index, 1);
});

test('appending keeps earlier items unchanged and in order', () => {
  const first = appendLive([], { side: 'left', text: 'a' }, 0, OPTS);
  const second = appendLive(first, { side: 'right', text: 'b' }, 5000, OPTS);
  eq(second.length, 2);
  eq(second[0].text, 'a');
  eq(second[1].text, 'b');
  eq(second[1].appearAt, 5900);
});

test('does not mutate the array it was given', () => {
  const first = appendLive([], { side: 'left', text: 'a' }, 0, OPTS);
  appendLive(first, { side: 'right', text: 'b' }, 5000, OPTS);
  eq(first.length, 1);
});
```

Add to `tests/tests.html`:

```js
      await import('./live.test.js');
```

- [ ] **Step 2: Run the tests to verify they fail**

Open `http://localhost:8000/tests/tests.html`.
Expected: console shows a 404 for `../src/live.js`.

- [ ] **Step 3: Write the live module**

Create `src/live.js`:

```js
// Appends one live-typed message to a session's item list, stamping its
// times from the session clock. Returns a new array; the input is untouched.
// The item shape matches src/timeline.js so src/renderer.js draws both the
// same way.
export function appendLive(items, message, now, opts) {
  const { typingMs, typingEnabled } = opts;
  const typingStart = typingEnabled ? now : null;
  const typingEnd = typingEnabled ? now + typingMs : null;

  return [
    ...items,
    {
      index: items.length,
      side: message.side,
      text: message.text,
      typingStart,
      typingEnd,
      appearAt: typingEnabled ? typingEnd : now,
    },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Open `http://localhost:8000/tests/tests.html`.
Expected: `34 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/live.js tests/live.test.js tests/tests.html
git commit -m "feat: stamp live-typed messages onto a growing item list"
```

---

### Task 11: Live mode UI, loop, and manual recording

**Run this task after Task 10 and before Task 9.**

**Files:**
- Modify: `index.html` (mode toggle and live controls)
- Modify: `styles.css` (mode toggle and live row styling)
- Modify: `src/app.js` (mode switching, live loop, Enter handling, manual record stop)

**Interfaces:**
- Consumes: `appendLive` from `src/live.js`; `renderFrame` and `cameraTargetY` from `src/renderer.js`; `readTiming()`, `readSettings()`, `rebuild()`, `play()`, `stop()`, and the module-scope `canvas`, `ctx`, `note`, `el`, `camera`, `settings`, `timeline` from `src/app.js`.
- Produces: nothing consumed by a later task. Task 9 verifies it manually.

- [ ] **Step 1: Add the mode toggle and live controls to the panel**

In `index.html`, insert this block as the FIRST child of `<aside class="panel">`, immediately before the existing Messages field:

```html
        <label class="field"><span>Mode</span>
          <select id="mode">
            <option value="script" selected>Script — paste a list, press Play</option>
            <option value="live">Live — type and press Enter</option>
          </select></label>

        <div id="liveControls" hidden>
          <label class="field"><span>Type a message, press Enter</span>
            <input type="text" id="liveInput" autocomplete="off" spellcheck="false" /></label>
          <div class="live-row">
            <button id="liveSide" type="button">Side: Left</button>
            <button id="liveClear" type="button">Clear</button>
          </div>
          <p class="note">Tab inside the box flips the side.</p>
        </div>
```

Then wrap the existing Messages field and the Play/Reset buttons so they can be hidden in live mode. Give the existing `<label class="field">` that contains `<textarea id="messages">` the id `scriptControls`:

```html
        <label class="field" id="scriptControls">
          <span>Messages</span>
```

and give the existing `<div class="buttons">` the id `transport`:

```html
        <div class="buttons" id="transport">
```

Leave every other control (timing, style, colors, font, aspect) as it is — those apply to both modes.

- [ ] **Step 2: Style the live row**

Append to `styles.css`:

```css
.live-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.live-row button {
  flex: 1;
  padding: 8px;
  font: inherit;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: canvas;
  color: inherit;
  cursor: pointer;
}

.live-row button:hover {
  background: color-mix(in srgb, canvas 85%, var(--panel-fg));
}
```

- [ ] **Step 3: Wire live mode in `src/app.js`**

Add `appendLive` to the imports at the top of the file:

```js
import { appendLive } from './live.js';
```

Add this live-mode state and its loop after the existing script-mode state declarations (the block containing `let playing = false;`):

```js
let liveItems = [];
let liveStart = 0;
let liveRunning = false;
let liveSide = 'left';

function liveFrame(now) {
  if (!liveRunning) return;
  const dt = Math.min(64, now - lastFrame);
  lastFrame = now;

  const elapsed = now - liveStart;
  const probe = renderFrame(ctx, { items: liveItems }, elapsed, { ...settings, cameraY: camera });
  const target = cameraTargetY(probe.contentHeight, settings);
  camera += (target - camera) * (1 - Math.exp(-dt / 120));

  requestAnimationFrame(liveFrame);
}

function startLive() {
  stop();
  settings = readSettings();
  canvas.width = settings.width;
  canvas.height = settings.height;
  liveStart = performance.now();
  lastFrame = liveStart;
  liveRunning = true;
  requestAnimationFrame(liveFrame);
}

function stopLive() {
  liveRunning = false;
}

function isLive() {
  return el('mode').value === 'live';
}
```

Add the mode switching and the live event handlers after the existing `el('reset')` listener:

```js
function applyMode() {
  const live = isLive();
  el('liveControls').hidden = !live;
  el('scriptControls').hidden = live;
  el('transport').hidden = live;
  note.textContent = '';

  if (live) {
    liveItems = [];
    camera = 0;
    startLive();
    el('liveInput').focus();
  } else {
    stopLive();
    liveItems = [];
    drawStatic();
  }
}

el('mode').addEventListener('change', applyMode);

el('liveSide').addEventListener('click', () => {
  liveSide = liveSide === 'left' ? 'right' : 'left';
  el('liveSide').textContent = liveSide === 'left' ? 'Side: Left' : 'Side: Right';
});

el('liveClear').addEventListener('click', () => {
  liveItems = [];
  camera = 0;
  liveStart = performance.now();
});

el('liveInput').addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    el('liveSide').click();
    return;
  }
  if (event.key !== 'Enter') return;

  event.preventDefault();
  const text = event.target.value.trim();
  if (text === '') return;

  liveItems = appendLive(
    liveItems,
    { side: liveSide, text },
    performance.now() - liveStart,
    readTiming(),
  );
  event.target.value = '';
});
```

Change the settings-input listener loop so it does not fight the live loop, and so a live session picks up canvas-size changes. Replace its body with:

```js
  el(id).addEventListener('input', () => {
    if (isLive()) {
      settings = readSettings();
      canvas.width = settings.width;
      canvas.height = settings.height;
      return;
    }
    if (!playing) drawStatic();
  });
```

Add `'mode'` to that same id list so switching aspect or colors mid-session still applies.

Finally, replace the bottom `drawStatic();` bootstrap call with:

```js
applyMode();
```

- [ ] **Step 4: Make recording manual in live mode**

In the Record button's click handler in `src/app.js`, replace the `rebuild()` / empty-check / `play()` sequence so script mode behaves as before and live mode simply records the running loop:

```js
  if (isLive()) {
    activeRecorder = createRecorder(canvas, mimeType, 60);
    activeRecorder.start();
    recordButton.textContent = 'Stop';
    note.textContent = 'Recording… press Stop when finished.';
    el('liveInput').focus();
    return;
  }

  rebuild();
  if (timeline.items.length === 0) {
    note.textContent = 'Message list is empty.';
    return;
  }

  activeRecorder = createRecorder(canvas, mimeType, 60);
  activeRecorder.start();
  recordButton.textContent = 'Stop';
  note.textContent = 'Recording…';
  play();
```

Guard the auto-stop so it only fires in script mode:

```js
document.addEventListener('playback-ended', () => {
  if (!activeRecorder || isLive()) return;
  setTimeout(finishRecording, 400);
});
```

- [ ] **Step 5: Verify live mode**

Open `http://localhost:8000/index.html`.
Expected:
1. Mode starts on Script and behaves exactly as before — the message list, Play, and Reset all still work.
2. Switching to Live hides the message list and the Play/Reset buttons, shows the input and the side toggle, and clears the stage.
3. Typing `สวัสดี` and pressing Enter shows typing dots on the left, then the bubble.
4. A second message stacks below the first without moving it.
5. Clicking the side toggle switches it to `Side: Right`; the next Enter puts the bubble on the right.
6. Pressing Tab inside the input flips the side without moving focus out of the box.
7. Turning off typing animation makes the next Enter show the bubble immediately.
8. Enough messages to fill the stage make the camera ease upward, keeping the newest bubble visible.
9. Clear empties the stage.
10. Record starts recording and keeps going while you type; Stop downloads a playable WebM.
11. Switching back to Script and pressing Play animates the list normally, and the live loop is no longer running.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css src/app.js
git commit -m "feat: add live typing mode with side toggle and manual recording"
```

---

### Task 12: Typewriter timing model

**Run this task after Task 11 and before Task 13.** It supersedes Task 3's timing rules and Task 10's item shape.

**Files:**
- Modify: `src/layout.js` (export the grapheme splitter)
- Modify: `src/timeline.js` (typewriter timing, remove the hold clamp)
- Modify: `src/live.js` (same item shape as the new timeline)
- Modify: `tests/layout.test.js`, `tests/timeline.test.js`, `tests/live.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `graphemes(text) => string[]` from `src/layout.js` — splits by grapheme cluster via `Intl.Segmenter`, falling back to `Array.from`. `breakLongWord` already has this logic privately; expose it and have `breakLongWord` call the exported version so there is one implementation.
  - `buildTimeline(messages, opts) => { items, duration }` where `opts` is `{ msPerChar, holdMs, gapMs, typingEnabled }` and each item is `{ index, side, text, typeStart, typeEnd }`.
  - `appendLive(items, message, now, opts) => Array<Item>` producing the same item shape.
  - `HOLD_MIN_MS`, `HOLD_MAX_MS`, and `clampHold` are DELETED. So are the item fields `typingStart`, `typingEnd`, and `appearAt`. Task 13 consumes `typeStart`/`typeEnd`.

- [ ] **Step 1: Rewrite the three test files**

Replace the whole of `tests/timeline.test.js`:

```js
import { test, eq } from './assert.js';
import { buildTimeline } from '../src/timeline.js';

const OPTS = { msPerChar: 100, holdMs: 700, gapMs: 300, typingEnabled: true };

test('typing runs one msPerChar per grapheme', () => {
  const { items } = buildTimeline([{ side: 'left', text: 'abcde' }], OPTS);
  eq(items[0].typeStart, 0);
  eq(items[0].typeEnd, 500);
});

test('typing disabled makes the bubble appear complete', () => {
  const { items } = buildTimeline(
    [{ side: 'left', text: 'abcde' }],
    { ...OPTS, typingEnabled: false },
  );
  eq(items[0].typeStart, 0);
  eq(items[0].typeEnd, 0);
});

test('a Thai combining mark does not cost its own character time', () => {
  // 'วั' is two code points but one grapheme cluster.
  const { items } = buildTimeline([{ side: 'left', text: 'วั' }], OPTS);
  eq(items[0].typeEnd, 100);
});

test('the next message starts after typing, hold, and gap', () => {
  const { items } = buildTimeline(
    [
      { side: 'left', text: 'abcde' },
      { side: 'right', text: 'xy' },
    ],
    OPTS,
  );
  // first: type 0..500, hold to 1200, gap to 1500
  eq(items[1].typeStart, 1500);
  eq(items[1].typeEnd, 1700);
});

test('items carry index, side, and text', () => {
  const { items } = buildTimeline([{ side: 'right', text: 'hi' }], OPTS);
  eq(items[0].index, 0);
  eq(items[0].side, 'right');
  eq(items[0].text, 'hi');
});

test('duration covers the last hold and the trailing gap', () => {
  const { duration } = buildTimeline([{ side: 'left', text: 'abcde' }], OPTS);
  eq(duration, 500 + 700 + 300);
});

test('a long message is not clamped', () => {
  const text = 'a'.repeat(200);
  const { items } = buildTimeline([{ side: 'left', text }], OPTS);
  eq(items[0].typeEnd, 20000);
});

test('empty message list yields no items and zero duration', () => {
  eq(buildTimeline([], OPTS), { items: [], duration: 0 });
});
```

Replace the whole of `tests/live.test.js`:

```js
import { test, eq } from './assert.js';
import { appendLive } from '../src/live.js';

const OPTS = { msPerChar: 100, typingEnabled: true };

test('appends one item carrying the side and text', () => {
  const items = appendLive([], { side: 'right', text: 'hi' }, 1000, OPTS);
  eq(items.length, 1);
  eq(items[0].side, 'right');
  eq(items[0].text, 'hi');
});

test('typing starts now and runs one msPerChar per grapheme', () => {
  const items = appendLive([], { side: 'left', text: 'abcde' }, 1000, OPTS);
  eq(items[0].typeStart, 1000);
  eq(items[0].typeEnd, 1500);
});

test('typing disabled makes the bubble appear complete', () => {
  const items = appendLive([], { side: 'left', text: 'abcde' }, 1000, { ...OPTS, typingEnabled: false });
  eq(items[0].typeStart, 1000);
  eq(items[0].typeEnd, 1000);
});

test('index counts from zero and increments', () => {
  const first = appendLive([], { side: 'left', text: 'a' }, 0, OPTS);
  const second = appendLive(first, { side: 'right', text: 'b' }, 5000, OPTS);
  eq(second[0].index, 0);
  eq(second[1].index, 1);
});

test('appending keeps earlier items unchanged and in order', () => {
  const first = appendLive([], { side: 'left', text: 'a' }, 0, OPTS);
  const second = appendLive(first, { side: 'right', text: 'bb' }, 5000, OPTS);
  eq(second.length, 2);
  eq(second[0].text, 'a');
  eq(second[1].typeEnd, 5200);
});

test('does not mutate the array it was given', () => {
  const first = appendLive([], { side: 'left', text: 'a' }, 0, OPTS);
  appendLive(first, { side: 'right', text: 'b' }, 5000, OPTS);
  eq(first.length, 1);
});
```

Append to `tests/layout.test.js`:

```js
test('graphemes splits ASCII one character per entry', () => {
  eq(graphemes('abc'), ['a', 'b', 'c']);
});

test('graphemes keeps a Thai base consonant and its mark together', () => {
  eq(graphemes('วั'), ['วั']);
});

test('graphemes of an empty string is an empty list', () => {
  eq(graphemes(''), []);
});
```

and add `graphemes` to that file's existing import from `../src/layout.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Open `http://localhost:8000/tests/tests.html?v=<unique>`.
Expected: failures — `graphemes` is not exported, and the timeline and live tests assert fields that do not exist yet.

- [ ] **Step 3: Export the grapheme splitter**

In `src/layout.js`, change the private grapheme helper into an export and have `breakLongWord` use it, so there is exactly one implementation:

```js
export function graphemes(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}
```

Keep `wrapText` and `measureBubble` exactly as they are apart from `breakLongWord` now calling `graphemes`.

- [ ] **Step 4: Rewrite the timeline**

Replace the whole of `src/timeline.js`:

```js
import { graphemes } from './layout.js';

// Builds the absolute-time schedule for a scripted conversation. Each message
// types itself in one grapheme at a time, holds, then yields to the next.
export function buildTimeline(messages, opts) {
  const { msPerChar, holdMs, gapMs, typingEnabled } = opts;
  const items = [];
  let cursor = 0;

  messages.forEach((message, index) => {
    const typeStart = cursor;
    const typeMs = typingEnabled ? graphemes(message.text).length * msPerChar : 0;
    const typeEnd = typeStart + typeMs;

    items.push({ index, side: message.side, text: message.text, typeStart, typeEnd });
    cursor = typeEnd + holdMs + gapMs;
  });

  return { items, duration: cursor };
}
```

- [ ] **Step 5: Rewrite the live stamper**

Replace the whole of `src/live.js`:

```js
import { graphemes } from './layout.js';

// Appends one live-typed message to a session's item list, stamping its times
// from the session clock. Returns a new array; the input is untouched. The item
// shape matches src/timeline.js so src/renderer.js draws both the same way.
export function appendLive(items, message, now, opts) {
  const { msPerChar, typingEnabled } = opts;
  const typeMs = typingEnabled ? graphemes(message.text).length * msPerChar : 0;

  return [
    ...items,
    {
      index: items.length,
      side: message.side,
      text: message.text,
      typeStart: now,
      typeEnd: now + typeMs,
    },
  ];
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Open `http://localhost:8000/tests/tests.html?v=<unique>`.
Expected: `34 passed, 0 failed` (2 harness + 8 parse + 8 timeline + 10 layout + 6 live).

- [ ] **Step 7: Commit**

```bash
git add src/layout.js src/timeline.js src/live.js tests/
git commit -m "feat: replace the typing indicator with a per-grapheme typewriter schedule"
```

---

### Task 13: Typewriter rendering and bottom-anchored stack

**Run this task after Task 12 and before Task 14.**

**Files:**
- Modify: `src/renderer.js`

**Interfaces:**
- Consumes: `graphemes` and `measureBubble` from `src/layout.js`; items shaped `{ index, side, text, typeStart, typeEnd }`.
- Produces: `renderFrame(ctx, timeline, elapsed, settings)` and `cameraTargetY(contentHeight, settings)`, both keeping their existing signatures. `settings.typingMs` is no longer read.

This task has no unit tests; verification is visual.

- [ ] **Step 1: Reveal text by grapheme instead of drawing dots**

In `src/renderer.js`, add `graphemes` to the existing import from `./layout.js`.

Add this helper above `layoutScene`:

```js
// How much of an item's text is on screen at `elapsed`. A bubble is never
// empty: once typing starts, at least the first grapheme shows.
function visibleText(item, elapsed) {
  if (elapsed >= item.typeEnd) return item.text;

  const parts = graphemes(item.text);
  const span = item.typeEnd - item.typeStart;
  const progress = span <= 0 ? 1 : (elapsed - item.typeStart) / span;
  const shown = Math.max(1, Math.ceil(progress * parts.length));
  return parts.slice(0, shown).join('');
}
```

Replace the body of `layoutScene`'s loop. Delete the `typing` branch, the `typing` box kind, and the whole `drawTypingDots` function — the three-dot indicator is gone. The loop becomes:

```js
  for (const item of timeline.items) {
    if (elapsed < item.typeStart) break;

    const text = visibleText(item, elapsed);
    const measured = measureBubble(ctx, text, m);
    const progress = Math.min(1, (elapsed - item.typeStart) / APPEAR_MS);
    boxes.push({
      kind: 'bubble',
      side: item.side,
      x: 0,
      y,
      width: measured.width,
      height: measured.height,
      lines: measured.lines,
      progress,
      item,
    });
    y += measured.height + m.gutter;
  }
```

In `renderFrame`'s drawing loop, delete the `if (box.kind === 'typing')` branch and always draw the text path.

- [ ] **Step 2: Anchor the stack to the bottom**

Replace `cameraTargetY`:

```js
// The stack hangs from the bottom of the stage: positive while the content is
// short, negative once it outgrows the frame and the top must scroll away.
export function cameraTargetY(contentHeight, settings) {
  const m = metricsFor(settings);
  return settings.height - m.bottomPad - contentHeight;
}
```

In `renderFrame`, change the camera translate from `ctx.translate(0, m.bottomPad + (settings.cameraY ?? 0));` back to:

```js
  ctx.translate(0, settings.cameraY ?? 0);
```

- [ ] **Step 3: Verify visually**

Open `http://localhost:8000/index.html?v=<unique>`.
Expected:
1. In Script mode, pressing Play types each message in character by character, and the bubble grows as it fills — no three-dot indicator anywhere.
2. The first bubble sits at the BOTTOM of the stage, not the top.
3. Each new bubble pushes the stack upward, and the movement eases rather than jumping.
4. A Thai message never flashes a base consonant separated from its tone mark mid-type.
5. Once enough messages accumulate to fill the stage, the oldest scroll off the top and the newest stays in frame.
6. Turning the typewriter off makes each bubble appear complete.
7. `tests/tests.html?v=<unique>` still reads 34 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add src/renderer.js
git commit -m "feat: type bubbles in by grapheme and anchor the stack to the bottom"
```

---

### Task 14: Panel settings for the typewriter

**Run this task after Task 13 and before Task 9.**

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `readTiming()` returning `{ msPerChar, holdMs, gapMs, typingEnabled }`.

This task has no unit tests; verification is visual.

- [ ] **Step 1: Update the panel fields**

In `index.html`:

- Change the typing checkbox label text from `Typing animation` to `Typewriter animation`. Keep the id `typingEnabled`.
- DELETE the whole `Typing duration (ms)` field, including its `<input id="typingMs">`.
- Change the `Milliseconds per character` label to `Typing speed (ms per character)` and its default `value` from `60` to `45`. Keep the id `msPerChar`.
- ADD a field immediately after it:

```html
        <label class="field"><span>Hold after typing (ms)</span>
          <input type="number" id="holdMs" value="700" min="0" max="10000" step="50" /></label>
```

- Change the `Font size (px)` input's default `value` from `44` to `34`. Keep the id `fontSize`.
- Update the live-mode helper text if it mentions a typing indicator.

- [ ] **Step 2: Update the wiring**

In `src/app.js`:

- In `readTiming()`, drop the `typingMs` line and add `holdMs`:

```js
function readTiming() {
  return {
    msPerChar: num('msPerChar', 0, 1000, 45),
    holdMs: num('holdMs', 0, 10000, 700),
    gapMs: num('gapMs', 0, 10000, 300),
    typingEnabled: el('typingEnabled').checked,
  };
}
```

- In `readSettings()`, change the `fontSize` fallback from `44` to `34`.
- In the settings-input id list, replace `'typingMs'` with `'holdMs'`.
- Wherever the camera is initialised for a fresh render — `drawStatic()`, `play()`, `applyMode()`, and the live Clear handler — set `camera` directly to `cameraTargetY(...)` for the first frame rather than starting it at `0`, so the opening frame is already bottom-anchored instead of sliding up into place.

Leave everything else alone, including the Play re-entrancy guard, the conditional canvas resize, the note clearing, the Record `if (playing)` guard, and the live-mode branches.

- [ ] **Step 3: Verify**

Open `http://localhost:8000/index.html?v=<unique>`.
Expected:
1. The panel shows `Typewriter animation`, `Typing speed (ms per character)` defaulting to 45, `Hold after typing (ms)` defaulting to 700, and no `Typing duration` field.
2. Font size defaults to 34 and the bubbles are visibly smaller than before.
3. Script mode plays with the typewriter at the new defaults; raising the typing speed number visibly slows typing.
4. The very first frame is already bottom-anchored — nothing slides up from the middle on load.
5. Live mode still works: Enter types the bubble in, the stack grows upward, the side toggle and Tab still flip sides, Clear still empties it.
6. Recording still produces a playable WebM in both modes.
7. `tests/tests.html?v=<unique>` reads 34 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add index.html src/app.js
git commit -m "feat: expose typewriter speed and hold, shrink default text"
```

---

## Self-Review Notes

**Spec coverage.** Parser — Task 2. Timeline and the hold clamp — Task 3. Text wrapping including unspaced Thai — Task 4. Canvas-only rendering, the three bubble styles, typing indicator, appear animation, sender name — Task 5. Camera — Task 6. All controls, aspect ratios, colors, empty-input and clamping error handling — Task 7. Recorder including codec fallback, the disabled-button path, and transparent mode — Task 8. Manual testing checklist — Task 9.

**Type consistency.** `settings` carries the same keys from Task 5 through Task 8. `renderFrame` returns the scene object so callers can read `contentHeight`, which Tasks 6 and 7 rely on. `cameraTargetY` and `metricsFor` share the same metrics derivation.

**Known sharp edge.** Task 5's `layoutScene` stops the loop at the first typing indicator, so only one typing bubble is ever on screen — that matches the spec, where messages are strictly sequential.
