import { parseMessages } from './parse.js';
import { buildTimeline } from './timeline.js';
import { renderFrame, cameraTargetY } from './renderer.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 1080;
canvas.height = 1920;

const settings = {
  width: 1080,
  height: 1920,
  style: 'imessage',
  bgColor: '#00B140',
  transparent: false,
  leftBg: '#FFFFFF',
  leftFg: '#000000',
  rightBg: '#FFFFFF',
  rightFg: '#000000',
  fontSize: 44,
  fontFamily: 'system-ui, sans-serif',
  senderName: '',
  cameraY: 0,
};

const messages = parseMessages('L: สวัสดีครับ\nR: ว่าไง\nL: วันนี้ว่างมั้ย\nR: ว่าง');
const timeline = buildTimeline(messages, {
  msPerChar: 60,
  typingMs: 900,
  gapMs: 300,
  typingEnabled: true,
});

let camera = 0;
let last = performance.now();
const start = performance.now();

function loop(now) {
  const dt = Math.min(64, now - last);
  last = now;
  const elapsed = (now - start) % timeline.duration;

  const probe = renderFrame(ctx, timeline, elapsed, { ...settings, cameraY: camera });
  const target = cameraTargetY(probe.contentHeight, settings);
  camera += (target - camera) * (1 - Math.exp(-dt / 120));

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
