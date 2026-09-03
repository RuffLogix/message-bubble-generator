import { test, eq, ok } from './assert.js';
import { fadeAt, exitRiseFor, layoutScene, FADE_MS } from '../src/renderer.js';

const item = (index, typeStart, typeEnd) => ({
  index,
  side: index % 2 === 0 ? 'left' : 'right',
  text: `message ${index}`,
  typeStart,
  typeEnd,
});

// Four messages, one per second, each taking 500ms to type.
const ITEMS = [0, 1, 2, 3].map((i) => item(i, i * 1000, i * 1000 + 500));

function makeCtx() {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  return canvas.getContext('2d');
}

const settings = (extra) => ({
  width: 1080,
  height: 1920,
  fontSize: 34,
  fontFamily: 'monospace',
  style: 'imessage',
  leftBg: '#fff',
  leftFg: '#000',
  rightBg: '#fff',
  rightFg: '#000',
  humanize: 0,
  senderName: '',
  ...extra,
});

test('no limit means nothing ever fades', () => {
  for (const limit of [0, undefined]) {
    for (let i = 0; i < ITEMS.length; i += 1) {
      eq(fadeAt(ITEMS, i, 99999, limit), 0, `item ${i} at limit ${limit}`);
    }
  }
});

test('an item with fewer than `limit` messages after it never fades', () => {
  // With limit 2 the last two messages are always on screen.
  eq(fadeAt(ITEMS, 2, 99999, 2), 0);
  eq(fadeAt(ITEMS, 3, 99999, 2), 0);
});

test('the fade clock starts at the typeStart of the message `limit` later', () => {
  // limit 2: item 0 starts fading when item 2 starts typing, at 2000ms.
  eq(fadeAt(ITEMS, 0, 1999, 2), 0);
  eq(fadeAt(ITEMS, 0, 2000, 2), 0);
  ok(fadeAt(ITEMS, 0, 2000 + FADE_MS / 2, 2) > 0, 'expected a partial fade mid-way');
  eq(fadeAt(ITEMS, 0, 2000 + FADE_MS, 2), 1);
  eq(fadeAt(ITEMS, 0, 99999, 2), 1);
});

test('the fade rises monotonically from 0 to 1', () => {
  let previous = 0;
  for (let t = 1900; t <= 2000 + FADE_MS + 100; t += 5) {
    const now = fadeAt(ITEMS, 0, t, 2);
    ok(now >= previous, `fade went backwards at ${t}: ${previous} -> ${now}`);
    ok(now >= 0 && now <= 1, `fade out of range at ${t}: ${now}`);
    previous = now;
  }
  eq(previous, 1);
});

test('a fully faded message is dropped from the layout', () => {
  const ctx = makeCtx();
  const timeline = { items: ITEMS };
  const withLimit = settings({ maxVisible: 2 });

  // At 3000ms all four have started. Item 0 finished fading at 2320; item 1's
  // fade has only just begun, so limit+1 bubbles are on screen for FADE_MS.
  eq(layoutScene(ctx, timeline, 3000, settings({ maxVisible: 0 })).boxes.length, 4);
  eq(layoutScene(ctx, timeline, 3000, withLimit).boxes.map((b) => b.item.index), [1, 2, 3]);

  // Once that fade completes the stack settles back to `limit` bubbles.
  eq(layoutScene(ctx, timeline, 3000 + FADE_MS, withLimit).boxes.map((b) => b.item.index), [2, 3]);
});

test('a fading message still occupies shrinking space, so the stack slides', () => {
  const ctx = makeCtx();
  const timeline = { items: ITEMS };
  const withLimit = settings({ maxVisible: 2 });

  // Item 0 fades across 2000..2320, and no other item starts or finishes
  // typing in that window, so contentHeight can only move because of the fade.
  const heights = [2000, 2080, 2160, 2240, 2319].map(
    (t) => layoutScene(ctx, timeline, t, withLimit).contentHeight,
  );
  for (let i = 1; i < heights.length; i += 1) {
    ok(heights[i] < heights[i - 1], `stack did not shrink: ${heights[i - 1]} -> ${heights[i]}`);
  }

  // And the limit is what makes it shrink — unlimited, the column is taller.
  ok(
    heights[4] < layoutScene(ctx, timeline, 2319, settings({ maxVisible: 0 })).contentHeight,
    'expected the limited stack to be shorter than the unlimited one',
  );
});

test('a bubble that is not fading has no exit travel', () => {
  eq(exitRiseFor(0, 100, 20), 0);
});

test('the exit travel more than cancels the camera drift, so the bubble rises', () => {
  // The stack is bottom-anchored: as a fading bubble gives up its share of the
  // column, the camera pushes what is left back down by exactly that much. An
  // exit rise of only `fade * advance` would hold the bubble still on screen,
  // so the travel has to exceed it for the bubble to visibly slide up.
  const advance = 100 + 20;
  for (const fade of [0.25, 0.5, 0.75, 1]) {
    ok(
      exitRiseFor(fade, 100, 20) > fade * advance,
      `fade ${fade}: expected more than ${fade * advance}, got ${exitRiseFor(fade, 100, 20)}`,
    );
  }
});

test('the exit travel only ever goes up', () => {
  let previous = -1;
  for (let fade = 0; fade <= 1.0001; fade += 0.02) {
    const rise = exitRiseFor(Math.min(1, fade), 100, 20);
    ok(rise >= previous, `travel reversed at fade ${fade}: ${previous} -> ${rise}`);
    previous = rise;
  }
});

test('the exit travel scales with the bubble, not with fixed pixels', () => {
  ok(exitRiseFor(0.5, 200, 20) > exitRiseFor(0.5, 100, 20), 'a taller bubble should travel further');
});

test('boxes carry their exit travel alongside their fade', () => {
  const ctx = makeCtx();
  const boxes = layoutScene(ctx, { items: ITEMS }, 2000 + FADE_MS / 2, settings({ maxVisible: 2 })).boxes;
  const fading = boxes.find((b) => b.item.index === 0);
  ok(fading.exitRise > 0, `expected the fading bubble to be travelling, got ${fading.exitRise}`);
  eq(boxes.find((b) => b.item.index === 2).exitRise, 0);
});

test('boxes carry their fade so the renderer can dim them', () => {
  const ctx = makeCtx();
  const boxes = layoutScene(ctx, { items: ITEMS }, 2000 + FADE_MS / 2, settings({ maxVisible: 2 })).boxes;
  const fading = boxes.find((b) => b.item.index === 0);
  ok(fading, 'expected item 0 to still be laid out mid-fade');
  ok(fading.fade > 0 && fading.fade < 1, `expected a partial fade, got ${fading.fade}`);
  eq(boxes.find((b) => b.item.index === 2).fade, 0);
});
