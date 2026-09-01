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
