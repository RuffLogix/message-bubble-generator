import { measureBubble } from './layout.js';

const APPEAR_MS = 220;
const SIDE_MARGIN_RATIO = 0.06;
const MAX_BUBBLE_RATIO = 0.72;
const GUTTER_RATIO = 0.55;
const BOTTOM_PAD_RATIO = 0.06;

function metricsFor(settings) {
  const { width, fontSize } = settings;
  return {
    padX: Math.round(fontSize * 0.62),
    padY: Math.round(fontSize * 0.42),
    lineHeight: Math.round(fontSize * 1.32),
    maxTextWidth: Math.round(width * MAX_BUBBLE_RATIO) - Math.round(fontSize * 0.62) * 2,
    sideMargin: Math.round(width * SIDE_MARGIN_RATIO),
    gutter: Math.round(fontSize * GUTTER_RATIO),
    bottomPad: Math.round(settings.height * BOTTOM_PAD_RATIO),
    radius: Math.round(fontSize * 0.6),
  };
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawTail(ctx, x, y, w, h, side, size) {
  ctx.beginPath();
  if (side === 'right') {
    ctx.moveTo(x + w - size, y + h);
    ctx.quadraticCurveTo(x + w + size * 0.4, y + h, x + w + size * 0.9, y + h - size * 0.1);
    ctx.quadraticCurveTo(x + w + size * 0.1, y + h - size * 0.2, x + w, y + h - size);
  } else {
    ctx.moveTo(x + size, y + h);
    ctx.quadraticCurveTo(x - size * 0.4, y + h, x - size * 0.9, y + h - size * 0.1);
    ctx.quadraticCurveTo(x - size * 0.1, y + h - size * 0.2, x, y + h - size);
  }
  ctx.closePath();
  ctx.fill();
}

function drawBubbleShape(ctx, style, x, y, w, h, side, m) {
  if (style === 'imessage') {
    roundedRect(ctx, x, y, w, h, Math.round(h / 2 < m.radius * 2 ? h / 2 : m.radius * 2));
    ctx.fill();
    drawTail(ctx, x, y, w, h, side, m.radius);
  } else if (style === 'line') {
    roundedRect(ctx, x, y, w, h, m.radius);
    ctx.fill();
  } else {
    roundedRect(ctx, x, y, w, h, Math.round(m.radius * 0.5));
    ctx.fill();
  }
}

function colorsFor(side, settings) {
  return side === 'left'
    ? { bg: settings.leftBg, fg: settings.leftFg }
    : { bg: settings.rightBg, fg: settings.rightFg };
}

// Returns the stacked boxes for every item visible at `elapsed`, in draw order.
// `y` is relative to the top of the content column, before any camera offset.
export function layoutScene(ctx, timeline, elapsed, settings) {
  const m = metricsFor(settings);
  ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;

  const boxes = [];
  let y = 0;

  for (const item of timeline.items) {
    const typing =
      item.typingStart !== null && elapsed >= item.typingStart && elapsed < item.typingEnd;
    const appeared = elapsed >= item.appearAt;
    if (!typing && !appeared) break;

    if (typing) {
      const w = Math.round(settings.fontSize * 3.4);
      const h = Math.round(settings.fontSize * 1.9);
      boxes.push({ kind: 'typing', side: item.side, x: 0, y, width: w, height: h, progress: 1, item });
      y += h + m.gutter;
      break;
    }

    const measured = measureBubble(ctx, item.text, m);
    const progress = Math.min(1, (elapsed - item.appearAt) / APPEAR_MS);
    boxes.push({
      kind: 'bubble',
      side: item.side,
      x: 0,
      y,
      width: measured.width,
      height: measured.height,
      lines: measured.lines,
      progress,
      item,
    });
    y += measured.height + m.gutter;
  }

  for (const box of boxes) {
    box.x = box.side === 'left'
      ? m.sideMargin
      : settings.width - m.sideMargin - box.width;
  }

  return { boxes, contentHeight: y, metrics: m };
}

function drawTypingDots(ctx, box, settings, elapsed) {
  const { fg } = colorsFor(box.side, settings);
  const r = Math.round(settings.fontSize * 0.16);
  const spacing = r * 3.2;
  const cx = box.x + box.width / 2 - spacing;
  const cy = box.y + box.height / 2;

  ctx.fillStyle = fg;
  for (let i = 0; i < 3; i += 1) {
    const phase = (elapsed / 500 + i * 0.22) % 1;
    const lift = Math.sin(phase * Math.PI * 2) * r * 0.9;
    ctx.globalAlpha = 0.45 + 0.55 * ((Math.sin(phase * Math.PI * 2) + 1) / 2);
    ctx.beginPath();
    ctx.arc(cx + i * spacing, cy - lift, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSenderName(ctx, box, settings, m) {
  if (settings.style !== 'line' || box.side !== 'left' || !settings.senderName) return 0;
  const size = Math.round(settings.fontSize * 0.6);
  ctx.font = `${size}px ${settings.fontFamily}`;
  ctx.fillStyle = settings.leftFg;
  ctx.globalAlpha = 0.75;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(settings.senderName, box.x + m.padX * 0.2, box.y - Math.round(size * 0.4));
  ctx.globalAlpha = 1;
  ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;
  return size;
}

export function renderFrame(ctx, timeline, elapsed, settings) {
  const { width, height } = settings;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!settings.transparent) {
    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  const scene = layoutScene(ctx, timeline, elapsed, settings);
  const m = scene.metrics;

  ctx.save();
  ctx.translate(0, m.bottomPad + (settings.cameraY ?? 0));

  for (const box of scene.boxes) {
    const { bg, fg } = colorsFor(box.side, settings);
    const scale = box.progress >= 1 ? 1 : 0.7 + 0.3 * easeOutBack(box.progress);
    const alpha = Math.min(1, box.progress * 1.6);

    ctx.save();
    ctx.globalAlpha = alpha;
    const originX = box.side === 'left' ? box.x : box.x + box.width;
    ctx.translate(originX, box.y + box.height);
    ctx.scale(scale, scale);
    ctx.translate(-originX, -(box.y + box.height));

    ctx.fillStyle = bg;
    drawBubbleShape(ctx, settings.style, box.x, box.y, box.width, box.height, box.side, m);

    if (box.kind === 'typing') {
      drawTypingDots(ctx, box, settings, elapsed);
    } else {
      drawSenderName(ctx, box, settings, m);
      ctx.fillStyle = fg;
      ctx.textBaseline = 'top';
      ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;
      box.lines.forEach((line, i) => {
        ctx.fillText(line, box.x + m.padX, box.y + m.padY + i * m.lineHeight);
      });
    }

    ctx.restore();
  }

  ctx.restore();
  return scene;
}

export function cameraTargetY(contentHeight, settings) {
  const m = metricsFor(settings);
  const usable = settings.height - m.bottomPad * 2;
  if (contentHeight <= usable) return 0;
  return -(contentHeight - usable);
}
