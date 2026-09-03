import { parseMessages } from './parse.js';
import { buildTimeline } from './timeline.js';
import { renderFrame, cameraTargetY } from './renderer.js';
import { pickMimeType, createRecorder, downloadBlob } from './recorder.js';
import { appendLive } from './live.js';
import { clicksBetween, TypingSound } from './sound.js';

const el = (id) => document.getElementById(id);
const canvas = el('canvas');
const ctx = canvas.getContext('2d', { alpha: true });
const note = el('note');

const ASPECTS = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
};

// Pure clamp: never touches the DOM. An empty string means "nothing
// committed yet" — it returns fallback rather than being coerced to 0, so a
// field the author just cleared doesn't render as if they'd typed its
// minimum.
function clampNum(raw, min, max, fallback) {
  if (raw.trim() === '') return fallback;
  let value = Number(raw);
  if (!Number.isFinite(value)) value = fallback;
  return Math.min(max, Math.max(min, value));
}

// Used by the render path on every keystroke, so it must NOT write back to
// the element — doing so mid-edit fights the caret (see normalizeNumberInput
// for the write-back, applied at change/blur instead).
function num(id, min, max, fallback) {
  return clampNum(el(id).value, min, max, fallback);
}

// Snaps a numeric field's displayed value to its clamped form. Called on
// 'change'/'blur' only, once the author has committed a value, not on every
// 'input' keystroke.
function normalizeNumberInput(id, min, max, fallback) {
  const input = el(id);
  const clamped = clampNum(input.value, min, max, fallback);
  if (String(clamped) !== input.value) input.value = String(clamped);
}

function readTiming() {
  return {
    msPerChar: num('msPerChar', 0, 1000, 45),
    holdMs: num('holdMs', 0, 10000, 700),
    gapMs: num('gapMs', 0, 10000, 300),
    typingEnabled: el('typingEnabled').checked,
  };
}

function readSound() {
  return {
    enabled: el('soundEnabled').checked,
    volume: num('soundVolume', 0, 100, 60) / 100,
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
    // Reaches renderFrame as part of settings rather than riding on the items,
    // so the one-item-shape-two-producers contract stays exactly as it was.
    humanize: num('humanize', 0, 100, 40) / 100,
    fontSize: num('fontSize', 12, 200, 34),
    // 0 means no limit — the stack grows and the camera scrolls, as before.
    maxVisible: num('maxVisible', 0, 99, 0),
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

let liveItems = [];
let liveStart = 0;
let liveRunning = false;
let liveSide = 'left';

// Typing sound. The schedule comes from clicksBetween() — a pure function of
// the same elapsed time the renderer draws from — so a recording hears exactly
// what the preview heard, for the same reason it looks exactly like it.
// Nothing here is scheduled with setTimeout.
const typingSound = new TypingSound();
let sound = readSound();
// Exclusive lower bound of the next click window. Starts before zero so the
// very first keystroke, which lands exactly at typeStart, is heard.
let lastSoundAt = -1;

// A frame that reveals a burst of graphemes (a long first frame, a tab
// regaining focus) would otherwise dump the whole backlog at once. Excess
// clicks are dropped, not queued: lastSoundAt advances to the true elapsed
// either way, so the sound stays in step with the picture instead of lagging.
const MAX_CLICKS_PER_FRAME = 4;

function emitClicks(items, elapsed) {
  if (!sound.enabled) {
    lastSoundAt = elapsed;
    return;
  }
  const struck = clicksBetween(items, lastSoundAt, elapsed, settings.humanize);
  lastSoundAt = elapsed;
  if (struck.length > 0) typingSound.play(struck.slice(0, MAX_CLICKS_PER_FRAME));
}

// Browsers keep an AudioContext suspended until a user gesture, and a
// suspended context feeds the recorder a silent track. Every entry point that
// can start audio is a click or a keypress, so resuming there is safe.
function resumeSound() {
  if (sound.enabled) typingSound.resume();
}

function liveFrame(now) {
  if (!liveRunning) return;
  const dt = Math.min(64, now - lastFrame);
  lastFrame = now;

  const elapsed = now - liveStart;
  emitClicks(liveItems, elapsed);
  const probe = renderFrame(ctx, { items: liveItems }, elapsed, { ...settings, cameraY: camera });
  const target = cameraTargetY(probe.contentHeight, settings);
  camera += (target - camera) * (1 - Math.exp(-dt / 120));

  requestAnimationFrame(liveFrame);
}

function startLive() {
  if (liveRunning) return;
  stop();
  settings = readSettings();
  canvas.width = settings.width;
  canvas.height = settings.height;
  liveStart = performance.now();
  lastFrame = liveStart;
  lastSoundAt = -1;
  liveRunning = true;
  resumeSound();
  requestAnimationFrame(liveFrame);
}

function stopLive() {
  liveRunning = false;
}

function isLive() {
  return el('mode').value === 'live';
}

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
  emitClicks(timeline.items, elapsed);
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
  const probe = renderFrame(ctx, timeline, 0, { ...settings, cameraY: 0 });
  camera = cameraTargetY(probe.contentHeight, settings);
  playing = true;
  el('play').disabled = true;
  startedAt = performance.now();
  lastFrame = startedAt;
  lastSoundAt = -1;
  resumeSound();
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

async function applyMode() {
  // Clear any stale note from the previous mode before awaiting
  // finishRecording(), so a fresh "Saved X MB." confirmation set by
  // finishRecording() survives instead of being wiped immediately after.
  note.textContent = '';
  if (activeRecorder) await finishRecording();

  const live = isLive();
  el('liveControls').hidden = !live;
  el('scriptControls').hidden = live;
  // #transport wraps Play, Reset, AND Record — hiding the whole row would
  // also hide Record, which must stay reachable in live mode (Step 4). Hide
  // only Play/Reset; Record's own click handler branches on isLive().
  el('play').hidden = live;
  el('reset').hidden = live;

  if (live) {
    liveItems = [];
    settings = readSettings();
    camera = cameraTargetY(0, settings);
    startLive();
    el('liveInput').focus();
  } else {
    stopLive();
    liveItems = [];
    drawStatic();
  }
}

el('mode').addEventListener('change', applyMode);

el('liveSide').addEventListener('click', () => {
  liveSide = liveSide === 'left' ? 'right' : 'left';
  el('liveSide').textContent = liveSide === 'left' ? 'Side: Left' : 'Side: Right';
});

el('liveClear').addEventListener('click', () => {
  liveItems = [];
  camera = cameraTargetY(0, settings);
  liveStart = performance.now();
  lastSoundAt = -1;
});

el('liveInput').addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    el('liveSide').click();
    return;
  }
  if (event.key !== 'Enter') return;

  event.preventDefault();
  const text = event.target.value.trim();
  if (text === '') return;

  resumeSound();
  liveItems = appendLive(
    liveItems,
    { side: liveSide, text },
    performance.now() - liveStart,
    readTiming(),
  );
  event.target.value = '';
});

// 'mode' is intentionally NOT in this list. It has its own 'change' listener
// (applyMode(), above) which already does everything this generic handler
// would do for a mode switch, in the right order (finish/await any active
// recording, then tear down or start the live loop). A <select> fires
// 'input' before 'change', so including 'mode' here would let this handler's
// live/script branches run against the *new* mode value before applyMode()
// has torn down the *old* one — racing the live rAF loop against
// drawStatic() and, if a recorder was active, running while teardown is
// still in flight. Keeping 'mode' out avoids that race entirely.
for (const id of [
  'messages', 'typingEnabled', 'humanize', 'holdMs', 'msPerChar', 'gapMs', 'style',
  'senderName', 'aspect', 'leftBg', 'leftFg', 'rightBg', 'rightFg',
  'bgColor', 'transparent', 'fontSize', 'fontFamily', 'maxVisible',
]) {
  el(id).addEventListener('input', () => {
    if (isLive()) {
      settings = readSettings();
      // Skip the resize while a recorder is bound to the canvas: 'aspect'
      // fires 'input' with no corresponding teardown step (unlike 'mode',
      // which now has none of this handler's live branch to race), so this
      // guard still matters — resizing mid-recording would break the
      // in-flight capture stream. Not dead code: still reachable via
      // 'aspect' during a live recording.
      if (activeRecorder) {
        // readSettings() just picked up whatever the Aspect select now
        // shows, but the canvas (and the in-flight capture stream) can't
        // resize until recording stops. Pin settings back to the canvas's
        // actual, currently-recording dimensions so renderFrame/layoutScene
        // keep laying out for the stage that's really there — otherwise the
        // stack renders for the new aspect on a canvas still sized for the
        // old one (stale pixels outside the redrawn area, bubbles positioned
        // off-canvas). The select's new value takes effect once recording
        // stops and any settings-input fires the else-branch below.
        settings.width = canvas.width;
        settings.height = canvas.height;
      } else {
        canvas.width = settings.width;
        canvas.height = settings.height;
      }
      return;
    }
    if (!playing) {
      note.textContent = '';
      drawStatic();
    }
  });
}

// Write-back for the numeric fields, deferred to commit time (change/blur)
// rather than every keystroke — see clampNum/num above for why.
const NUMERIC_FIELDS = {
  fontSize: [12, 200, 34],
  maxVisible: [0, 99, 0],
  msPerChar: [0, 1000, 45],
  holdMs: [0, 10000, 700],
  gapMs: [0, 10000, 300],
  humanize: [0, 100, 40],
  soundVolume: [0, 100, 60],
};
for (const [id, [min, max, fallback]] of Object.entries(NUMERIC_FIELDS)) {
  el(id).addEventListener('change', () => normalizeNumberInput(id, min, max, fallback));
  el(id).addEventListener('blur', () => normalizeNumberInput(id, min, max, fallback));
}

// The sound controls are deliberately NOT in the settings-input list above.
// They change nothing the renderer draws, so the repaint that listener does
// would be wasted work, and readSettings() has no field to carry them.
function syncSound() {
  sound = readSound();
  typingSound.setVolume(sound.volume);
  el('soundVolumeField').hidden = !sound.enabled;
}
el('soundEnabled').addEventListener('change', () => {
  syncSound();
  resumeSound();
});
el('soundVolume').addEventListener('input', syncSound);
syncSound();

const recordButton = el('record');
let activeRecorder = null;

if (!pickMimeType()) {
  recordButton.disabled = true;
  recordButton.title = 'This browser cannot record WebM. Screen record the preview instead.';
}

// Resolves the capture stream and container for one recording. The mime type
// is chosen per recording, not once at load: it has to declare an Opus track
// exactly when there is one to mux, and the checkbox can change between takes.
// A browser with no AudioContext yields a null stream, which silently falls
// back to a video-only recording rather than failing the take.
async function openRecording() {
  let audioStream = null;
  if (sound.enabled) {
    await typingSound.resume();
    audioStream = typingSound.captureStream();
  }
  const mimeType = pickMimeType(Boolean(audioStream));
  const recorder = createRecorder(canvas, mimeType, 60, audioStream);
  recorder.start();
  recordButton.textContent = 'Stop';
  recordButton.classList.add('recording');
  return recorder;
}

async function finishRecording() {
  if (!activeRecorder) return;
  const recorder = activeRecorder;
  activeRecorder = null;
  recordButton.textContent = 'Record';
  recordButton.classList.remove('recording');
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

  if (isLive()) {
    // openRecording() awaits the AudioContext resume, so activeRecorder is
    // assigned a tick later than it used to be. Disabling the button closes
    // that window — a second click during the await would sail past the
    // `if (activeRecorder)` guard above and start a second recording.
    recordButton.disabled = true;
    try {
      activeRecorder = await openRecording();
    } finally {
      recordButton.disabled = false;
    }
    note.textContent = 'Recording… press Stop when finished.';
    el('liveInput').focus();
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

  recordButton.disabled = true;
  try {
    activeRecorder = await openRecording();
  } finally {
    recordButton.disabled = false;
  }
  note.textContent = 'Recording…';
  play();
});

document.addEventListener('playback-ended', () => {
  if (!activeRecorder || isLive()) return;
  setTimeout(finishRecording, 400);
});

// The renderer only draws a sender name in the LINE style; hide the field in
// the other styles so the panel doesn't offer a control that does nothing.
function syncSenderNameVisibility() {
  el('senderNameField').hidden = el('style').value !== 'line';
}
el('style').addEventListener('input', syncSenderNameVisibility);
syncSenderNameVisibility();

// Humanize redistributes time inside a typewriter reveal, so with the reveal
// switched off it has nothing to act on. Hide it rather than offer a control
// that does nothing.
function syncHumanizeVisibility() {
  el('humanizeField').hidden = !el('typingEnabled').checked;
}
el('typingEnabled').addEventListener('input', syncHumanizeVisibility);
syncHumanizeVisibility();

applyMode();
