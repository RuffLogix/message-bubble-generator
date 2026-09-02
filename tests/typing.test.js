import { test, eq, ok } from './assert.js';
import { revealedCount } from '../src/typing.js';
import { graphemes } from '../src/layout.js';

const item = (text, typeStart, typeEnd, index = 0) => ({
  index,
  side: 'left',
  text,
  typeStart,
  typeEnd,
});

const SENTENCE = 'the quick brown fox, jumped. over';

test('humanize 0 reproduces the plain linear reveal exactly', () => {
  const subject = item('abcdefghij', 0, 1000);
  const n = 10;
  for (let t = 0; t <= 1000; t += 3) {
    const linear = Math.max(1, Math.ceil((t / 1000) * n));
    eq(revealedCount(subject, t, 0), Math.min(n, linear), `at ${t}ms`);
  }
});

test('nothing is revealed before the message starts', () => {
  eq(revealedCount(item('abcde', 500, 1000), 499, 0.5), 0);
});

test('the first grapheme is on screen at typeStart, humanized or not', () => {
  eq(revealedCount(item('abcde', 500, 1000), 500, 0), 1);
  eq(revealedCount(item('abcde', 500, 1000), 500, 1), 1);
});

test('humanizing does not change when the message finishes', () => {
  // The dwell weights are normalised to mean 1, so jitter only redistributes
  // time inside the message. typeEnd stays exactly where buildTimeline put it.
  for (const humanize of [0, 0.25, 0.6, 1]) {
    eq(revealedCount(item(SENTENCE, 0, 3200), 3200, humanize), graphemes(SENTENCE).length);
  }
});

test('the count stays complete after typeEnd', () => {
  eq(revealedCount(item('abcde', 0, 500), 99999, 0.7), 5);
});

test('the reveal is deterministic — the same frame always answers the same', () => {
  // Math.random() here would make graphemes flicker in and out between frames
  // and break the recording/preview match. Two identical calls must agree.
  const subject = item(SENTENCE, 0, 3200, 3);
  for (let t = 0; t <= 3200; t += 11) {
    eq(revealedCount(subject, t, 0.6), revealedCount(subject, t, 0.6), `at ${t}ms`);
  }
});

test('the humanized reveal never goes backwards', () => {
  const subject = item(SENTENCE, 0, 3200, 2);
  let previous = 0;
  for (let t = 0; t <= 3400; t += 5) {
    const now = revealedCount(subject, t, 0.8);
    ok(now >= previous, `reveal went backwards at ${t}: ${previous} -> ${now}`);
    previous = now;
  }
});

test('humanizing actually moves the reveal off the linear curve', () => {
  const subject = item(SENTENCE, 0, 3200, 1);
  let differences = 0;
  for (let t = 0; t <= 3200; t += 7) {
    if (revealedCount(subject, t, 0.8) !== revealedCount(subject, t, 0)) differences += 1;
  }
  ok(differences > 20, `expected the curves to diverge, saw ${differences} differing frames`);
});

test('two messages do not share the same rhythm', () => {
  // Seeded on item.index, so consecutive bubbles stutter in different places
  // instead of replaying one recorded rhythm.
  const first = item(SENTENCE, 0, 3200, 0);
  const second = item(SENTENCE, 0, 3200, 1);
  let differences = 0;
  for (let t = 0; t <= 3200; t += 7) {
    if (revealedCount(first, t, 0.8) !== revealedCount(second, t, 0.8)) differences += 1;
  }
  ok(differences > 10, `expected differing rhythms, saw ${differences} differing frames`);
});

test('the reveal never exceeds the grapheme count', () => {
  const text = 'สวัสดีครับ';
  const n = graphemes(text).length;
  const subject = item(text, 0, n * 45, 4);
  for (let t = 0; t <= n * 45; t += 3) {
    ok(revealedCount(subject, t, 0.9) <= n, `overran at ${t}ms`);
  }
});

test('a Thai cluster counts as one reveal step, not two', () => {
  // 'วั' is two code points but one grapheme cluster.
  eq(revealedCount(item('วั', 0, 100), 100, 0.8), 1);
});

test('an empty message reveals nothing', () => {
  eq(revealedCount(item('', 0, 0), 100, 0.5), 0);
});

test('typing disabled reveals the whole message at typeStart', () => {
  // buildTimeline collapses typeEnd onto typeStart when typewriting is off.
  eq(revealedCount(item('abcde', 300, 300), 300, 0.5), 5);
  eq(revealedCount(item('abcde', 300, 300), 299, 0.5), 0);
});
