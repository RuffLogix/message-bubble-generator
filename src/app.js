import { parseMessages } from './parse.js';
import { buildTimeline } from './timeline.js';
import { renderFrame } from './renderer.js';

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

const start = performance.now();
function loop(now) {
  const elapsed = (now - start) % timeline.duration;
  renderFrame(ctx, timeline, elapsed, settings);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
