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
