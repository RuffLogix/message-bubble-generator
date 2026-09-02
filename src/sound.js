import { graphemes } from './layout.js';
import { revealedCount } from './typing.js';

// Which graphemes were revealed in the window (from, to].
//
// This is the pure half of the typing sound. It reads the reveal curve from
// typing.js — the same one the renderer draws — so a click can never land on a
// frame its character does not. Returning the graphemes themselves rather than
// a count lets the synthesiser hit a space or a full stop harder, the way a
// hand does.
//
// `from` is exclusive so a caller starting at -1 hears the very first
// keystroke, which lands exactly at typeStart.
export function clicksBetween(items, from, to, humanize = 0) {
  const struck = [];

  for (const item of items) {
    if (to < item.typeStart) continue;

    const parts = graphemes(item.text);
    if (parts.length === 0) continue;

    // Typewriting disabled collapses typeEnd onto typeStart, so the whole
    // message lands at once. One click for the message beats every grapheme
    // firing in the same millisecond.
    if (item.typeEnd <= item.typeStart) {
      if (from < item.typeStart) struck.push(' ');
      continue;
    }

    const before = from < item.typeStart ? 0 : revealedCount(item, from, humanize);
    const after = revealedCount(item, to, humanize);
    for (let i = before; i < after; i += 1) struck.push(parts[i]);
  }

  return struck;
}

// Keys a hand hits harder: the thumb on a space, and the deliberate press that
// ends a clause.
const ACCENTED = new Set([' ', ' ', '\n', '.', ',', '!', '?', ';', ':', '…']);

const NOISE_SECONDS = 0.25;
const BODY_HZ = 320;
const TICK_HZ = 2800;
const BODY_SECONDS = 0.028;
const TICK_SECONDS = 0.011;

// Synthesises the keyboard. Everything here is Web Audio side effects — the
// schedule comes from clicksBetween() above.
//
// The graph is built once and fans out to two sinks: the speakers, so the
// author hears the preview, and a MediaStreamDestination, whose track the
// recorder muxes into the WebM. Both are fed by the same gain node, so what
// gets exported is what was heard.
export class TypingSound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.capture = null;
    this.noise = null;
    this.volume = 0.6;
  }

  // AudioContext construction is deferred to the first user gesture: browsers
  // start one suspended otherwise, and a suspended context produces a silent
  // track that still gets muxed into the recording.
  ensure() {
    if (this.ctx) return this.ctx;

    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.noise = this.fillWithNoise(NOISE_SECONDS);

    return this.ctx;
  }

  fillWithNoise(seconds) {
    const frames = Math.ceil(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) samples[i] = Math.random() * 2 - 1;
    return buffer;
  }

  async resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') await ctx.resume();
  }

  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.value = value;
  }

  // The audio track for the recorder. Created on demand and kept for the life
  // of the page — a MediaStreamDestination cannot be reattached to a new
  // AudioContext, and re-creating one per recording leaves dead tracks behind.
  captureStream() {
    const ctx = this.ensure();
    if (!ctx) return null;
    if (!this.capture) {
      this.capture = ctx.createMediaStreamDestination();
      this.master.connect(this.capture);
    }
    return this.capture.stream;
  }

  // Schedules one click per grapheme, `spacingMs` apart, starting now. Spacing
  // matters when a single frame reveals several graphemes: stacking them on one
  // timestamp reads as a single thud instead of fast typing.
  play(struck, spacingMs = 12) {
    const ctx = this.ensure();
    if (!ctx || struck.length === 0 || this.volume <= 0) return;

    struck.forEach((part, i) => {
      this.click(ctx.currentTime + (i * spacingMs) / 1000, ACCENTED.has(part));
    });
  }

  // Two layers, because one filtered noise burst reads as a click track rather
  // than a keyboard: a low body (the key bottoming out) and a high tick (the
  // contact), the tick landing a hair later as it does on a real switch. Every
  // click is jittered in level, pitch, timbre and stereo position — identical
  // clicks are the thing that gives a synthesised keyboard away.
  click(at, accented) {
    const ctx = this.ctx;
    const velocity = (0.7 + Math.random() * 0.6) * (accented ? 1.55 : 1);

    const pan = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;
    if (pan) pan.pan.value = (Math.random() * 2 - 1) * 0.35;

    // Makes up the level the two bandlimited layers lose to their filters —
    // a bandpassed noise burst is far quieter than the raw noise it came from.
    // Tuned so a normal keystroke peaks around -12 dBFS in the export.
    const out = ctx.createGain();
    out.gain.value = 1.5;
    if (pan) out.connect(pan).connect(this.master);
    else out.connect(this.master);

    this.layer(at, 'lowpass', BODY_HZ * (0.8 + Math.random() * 0.4), 1.6,
      velocity * 0.62, BODY_SECONDS * (0.85 + Math.random() * 0.3), out);
    this.layer(at + 0.0015, 'bandpass', TICK_HZ * (0.85 + Math.random() * 0.3), 1.1,
      velocity * 0.38, TICK_SECONDS * (0.8 + Math.random() * 0.4), out);
  }

  layer(at, filterType, frequency, q, peak, seconds, destination) {
    const ctx = this.ctx;

    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.85 + Math.random() * 0.3;
    // The noise buffer is far longer than one click; starting at a random
    // offset stops every keystroke from replaying the same few milliseconds.
    const offset = Math.random() * (NOISE_SECONDS - seconds - 0.01);

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + 0.001);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

    source.connect(filter).connect(envelope).connect(destination);
    source.start(at, Math.max(0, offset), seconds + 0.01);
  }
}
