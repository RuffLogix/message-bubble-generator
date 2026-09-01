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
