import { parseMessages } from './parse.js';
import { buildTimeline } from './timeline.js';
import { renderFrame, cameraTargetY } from './renderer.js';
import { pickMimeType, createRecorder, downloadBlob } from './recorder.js';

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
  if (canvas.width !== settings.width) canvas.width = settings.width;
  if (canvas.height !== settings.height) canvas.height = settings.height;
  canvas.style.background = settings.transparent
    ? 'repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 0 0 / 40px 40px'
    : 'none';
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
    el('play').disabled = false;
    document.dispatchEvent(new CustomEvent('playback-ended'));
    return;
  }
  requestAnimationFrame(frame);
}

export function play() {
  if (playing) return false;
  rebuild();
  if (timeline.items.length === 0) {
    note.textContent = 'Message list is empty.';
    el('play').disabled = false;
    renderFrame(ctx, timeline, 0, { ...settings, cameraY: 0 });
    return false;
  }
  note.textContent = '';
  camera = 0;
  playing = true;
  el('play').disabled = true;
  startedAt = performance.now();
  lastFrame = startedAt;
  el('play').textContent = 'Playing…';
  requestAnimationFrame(frame);
  return true;
}

export function stop() {
  playing = false;
  el('play').textContent = 'Play';
  el('play').disabled = false;
}

el('play').addEventListener('click', play);
el('reset').addEventListener('click', () => {
  stop();
  note.textContent = '';
  drawStatic();
});

for (const id of [
  'messages', 'typingEnabled', 'typingMs', 'msPerChar', 'gapMs', 'style',
  'senderName', 'aspect', 'leftBg', 'leftFg', 'rightBg', 'rightFg',
  'bgColor', 'transparent', 'fontSize', 'fontFamily',
]) {
  el(id).addEventListener('input', () => {
    if (!playing) {
      note.textContent = '';
      drawStatic();
    }
  });
}

drawStatic();

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
  if (playing) {
    note.textContent = 'Stop playback before recording.';
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
