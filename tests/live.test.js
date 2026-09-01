import { test, eq } from './assert.js';
import { appendLive } from '../src/live.js';
import { buildTimeline } from '../src/timeline.js';

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

test('buildTimeline and appendLive items share the same shape', () => {
  const message = { side: 'left', text: 'hi' };
  const timelineOpts = { msPerChar: 100, holdMs: 700, gapMs: 300, typingEnabled: true };
  const { items } = buildTimeline([message], timelineOpts);
  const liveItems = appendLive([], message, 0, OPTS);
  eq(Object.keys(items[0]).sort(), Object.keys(liveItems[0]).sort());
});
