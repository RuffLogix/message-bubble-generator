import { graphemes } from './layout.js';

// How much of a message is on screen at a given moment.
//
// This is the single owner of the reveal curve. renderer.js draws what it
// returns and sound.js clicks off it, so a keystroke's sound can never drift
// away from the character it belongs to — there is only one answer to derive.
//
// `humanize` (0..1) adds the unevenness of a real typist. It must produce the
// SAME answer for the same (item, elapsed) every time it is asked: the render
// loop calls this several times per frame and again on replay, so a
// Math.random() here would make graphemes flicker in and out and stop a
// recording from matching its preview. The jitter is therefore hashed from the
// item's index and the grapheme's position, not sampled.

const JITTER_SPAN = 0.5;
const HESITATION_CHANCE = 0.06;
const HESITATION_WEIGHT = 1.6;
const MIN_WEIGHT = 0.15;

// A typist pauses *after* landing these, not before, so the bonus belongs to
// the dwell that follows the character.
const SENTENCE_END = new Set(['.', '!', '?', '…']);
const CLAUSE_BREAK = new Set([',', ';', ':', '—', '–']);
// Thai writes without spaces; 'ๆ' (repetition) and 'ฯ' (abbreviation) are
// where a Thai typist's hand actually pauses.
const WORD_BREAK = new Set([' ', ' ', '\n', 'ๆ', 'ฯ']);

function pauseBonus(part) {
  if (SENTENCE_END.has(part)) return 2;
  if (CLAUSE_BREAK.has(part)) return 1.2;
  if (WORD_BREAK.has(part)) return 0.7;
  return 0;
}

// A cheap integer hash (two rounds of xor-multiply-shift). Seeded on the
// message's index as well as the grapheme's position, so consecutive bubbles
// stutter in different places instead of replaying one recorded rhythm.
function hash01(index, position, count) {
  let x = Math.imul(index + 1, 73856093) ^ Math.imul(position + 1, 19349663) ^ Math.imul(count + 1, 83492791);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// Relative time spent on each grapheme before the next one appears, normalised
// to mean 1. The normalisation is the point: humanizing redistributes time
// *inside* a message and never adds any, so typeEnd stays exactly where
// buildTimeline put it and the timeline above is untouched.
export function dwellWeights(parts, index, humanize) {
  const count = parts.length;
  const weights = new Array(count);
  let total = 0;

  for (let i = 0; i < count; i += 1) {
    const jitter = (hash01(index, i * 2, count) * 2 - 1) * JITTER_SPAN;
    const stumble = hash01(index, i * 2 + 1, count) < HESITATION_CHANCE ? HESITATION_WEIGHT : 0;
    const weight = 1 + humanize * (jitter + stumble + pauseBonus(parts[i]));
    weights[i] = Math.max(MIN_WEIGHT, weight);
    total += weights[i];
  }

  const scale = count / total;
  for (let i = 0; i < count; i += 1) weights[i] *= scale;
  return weights;
}

export function revealedCount(item, elapsed, humanize = 0) {
  if (elapsed < item.typeStart) return 0;

  const span = item.typeEnd - item.typeStart;
  const parts = graphemes(item.text);
  const count = parts.length;
  if (count === 0) return 0;
  // span <= 0 is typewriting turned off: the message lands complete.
  if (span <= 0 || elapsed >= item.typeEnd) return count;

  const progress = (elapsed - item.typeStart) / span;
  // The unhumanized curve is kept as its own expression rather than falling
  // out of the loop below: it is the behaviour the app shipped with, it is
  // pinned by a test that compares against this exact formula, and it skips
  // allocating a weights array on every frame of every bubble.
  if (humanize <= 0) return Math.max(1, Math.ceil(progress * count));

  const weights = dwellWeights(parts, item.index, humanize);
  const threshold = progress * count;
  let cumulative = 0;
  let shown = 0;
  for (let i = 0; i < count; i += 1) {
    // `>=` rather than `>` so a grapheme lands on the same frame the linear
    // curve would have landed it on when every weight is 1.
    if (cumulative >= threshold) break;
    shown = i + 1;
    cumulative += weights[i];
  }

  return Math.max(1, shown);
}
