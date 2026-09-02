import { test, eq, ok } from './assert.js';
import { clicksBetween } from '../src/sound.js';

// Mirrors what buildTimeline/appendLive emit: {index, side, text, typeStart,
// typeEnd}. clicksBetween only reads index/text/typeStart/typeEnd.
const typed = (text, typeStart, typeEnd, index = 0) => ({
  index,
  side: 'left',
  text,
  typeStart,
  typeEnd,
});

// Walks a run frame by frame the way the render loop does, collecting every
// grapheme that clicked.
function sweep(items, until, humanize = 0, step = 16) {
  const struck = [];
  let from = -1;
  for (let to = 0; to <= until; to += step) {
    struck.push(...clicksBetween(items, from, to, humanize));
    from = to;
  }
  return struck;
}

test('no items means no clicks', () => {
  eq(clicksBetween([], -1, 5000), []);
});

test('nothing clicks before the item starts', () => {
  eq(clicksBetween([typed('abcde', 1000, 1500)], -1, 999), []);
});

test('the first grapheme clicks on the first frame of the message', () => {
  // typeStart is when the renderer puts grapheme one on screen, so that is
  // when its key is heard.
  eq(clicksBetween([typed('abcde', 1000, 1500)], -1, 1000), ['a']);
});

test('every grapheme clicks exactly once, in order', () => {
  eq(sweep([typed('abcde', 0, 500)], 900).join(''), 'abcde');
});

test('humanizing changes when keys land but not which, or how many', () => {
  eq(sweep([typed('the quick brown fox', 0, 1900)], 2400, 0.8).join(''), 'the quick brown fox');
});

test('a frame that skips ahead still hears the keys it skipped over', () => {
  // A long frame (a stalled tab, a slow first paint) must not swallow clicks.
  eq(clicksBetween([typed('abcde', 0, 500)], -1, 500).join(''), 'abcde');
});

test('nothing clicks twice once the message is finished', () => {
  eq(clicksBetween([typed('abcde', 0, 500)], 500, 9999), []);
});

test('typing disabled clicks once per message, not once per grapheme', () => {
  // buildTimeline collapses typeEnd onto typeStart when typewriting is off.
  eq(clicksBetween([typed('abcde', 300, 300)], -1, 300).length, 1);
  eq(clicksBetween([typed('abcde', 300, 300)], -1, 299).length, 0);
  eq(sweep([typed('abcde', 300, 300)], 900).length, 1);
});

test('a Thai combining mark clicks once, not once per code point', () => {
  // 'วั' is two code points but one grapheme cluster.
  eq(clicksBetween([typed('วั', 0, 100)], -1, 100), ['วั']);
});

test('a Thai sentence clicks once per cluster and reassembles', () => {
  const text = 'สวัสดีครับ';
  eq(sweep([typed(text, 0, 450)], 700, 0.7).join(''), text);
});

test('clicks from several items stay in message order', () => {
  const items = [typed('abc', 0, 300), typed('xy', 900, 1100, 1)];
  eq(sweep(items, 1400).join(''), 'abcxy');
});

test('an empty message contributes nothing', () => {
  eq(sweep([typed('', 0, 0)], 200), []);
});

test('the window is half-open, so adjacent frames never double-strike', () => {
  const items = [typed('abcdefghij', 0, 1000)];
  const seen = [];
  let from = -1;
  for (let to = 0; to <= 1100; to += 37) {
    seen.push(...clicksBetween(items, from, to, 0.6));
    from = to;
  }
  eq(seen.length, 10);
  ok(seen.join('') === 'abcdefghij', `expected each key once, got ${seen.join('')}`);
});
