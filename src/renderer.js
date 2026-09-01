import { graphemes, measureBubble } from './layout.js';

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

// Appends a clockwise rounded-rect subpath. Callers own beginPath/fill so the
// body and the tail can be filled as a single path (see drawBubbleShape).
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The tail's two base points are placed *on the bubble's own corner arc*, so it
// stays welded to the body whatever radius the shape ended up with. Anchoring
// it to a fixed offset detaches it as soon as the bubble goes pill-shaped.
function tailPath(ctx, x, y, w, h, side, r, size) {
  const dir = side === 'right' ? 1 : -1;
  const cx = (side === 'right' ? x + w : x) - dir * r;
  const cy = y + h - r;
  const at = (t) => ({ x: cx + dir * r * Math.sin(t), y: cy + r * Math.cos(t) });

  // The base straddles the corner arc's 45° point. Its half-span is solved
  // from the chord length so the tail keeps a constant size no matter how
  // fat the corner radius got.
  const s = Math.min(size, r);
  const mid = Math.PI / 4;
  const half = Math.asin(Math.min(0.98, s / (2 * r)));
  const a = at(mid + half);
  const b = at(mid - half);
  const m = at(mid);
  const tip = { x: m.x + dir * s * 0.95, y: m.y + s * 0.62 };

  // Clockwise on screen for both sides, matching roundedRectPath, so the
  // nonzero fill unions the two subpaths instead of punching a hole.
  const outCp = { x: a.x + dir * s * 0.62, y: a.y + s * 0.30 };
  const backCp = { x: b.x + dir * s * 0.34, y: b.y - s * 0.22 };
  if (side === 'right') {
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(outCp.x, outCp.y, tip.x, tip.y);
    ctx.quadraticCurveTo(backCp.x, backCp.y, b.x, b.y);
  } else {
    ctx.moveTo(b.x, b.y);
    ctx.quadraticCurveTo(backCp.x, backCp.y, tip.x, tip.y);
    ctx.quadraticCurveTo(outCp.x, outCp.y, a.x, a.y);
  }
  ctx.closePath();
}

function drawBubbleShape(ctx, style, x, y, w, h, side, m) {
  const requested = style === 'imessage'
    ? m.radius * 2
    : style === 'line'
      ? m.radius
      : m.radius * 0.5;
  const r = Math.min(Math.round(requested), w / 2, h / 2);

  ctx.beginPath();
  roundedRectPath(ctx, x, y, w, h, r);
  if (style === 'imessage') tailPath(ctx, x, y, w, h, side, r, m.radius * 0.8);
  ctx.fill();
}

function colorsFor(side, settings) {
  return side === 'left'
    ? { bg: settings.leftBg, fg: settings.leftFg }
    : { bg: settings.rightBg, fg: settings.rightFg };
}

// How much of an item's text is on screen at `elapsed`. A bubble is never
// empty: once typing starts, at least the first grapheme shows.
function visibleText(item, elapsed) {
  if (elapsed >= item.typeEnd) return item.text;

  const parts = graphemes(item.text);
  const span = item.typeEnd - item.typeStart;
  const progress = span <= 0 ? 1 : (elapsed - item.typeStart) / span;
  const shown = Math.max(1, Math.ceil(progress * parts.length));
  return parts.slice(0, shown).join('');
}

// Returns the stacked boxes for every item visible at `elapsed`, in draw order.
// `y` is relative to the top of the content column, before any camera offset.
export function layoutScene(ctx, timeline, elapsed, settings) {
  const m = metricsFor(settings);
  ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;

  const boxes = [];
  let y = 0;

  for (const item of timeline.items) {
    if (elapsed < item.typeStart) break;

    const text = visibleText(item, elapsed);
    const measured = measureBubble(ctx, text, m);
    const progress = Math.min(1, (elapsed - item.typeStart) / APPEAR_MS);
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
  ctx.translate(0, settings.cameraY ?? 0);

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

    drawSenderName(ctx, box, settings, m);
    ctx.fillStyle = fg;
    // Centre each line inside its own line box. With 'top' the whole 1.32
    // leading piles up under the glyphs and the text rides the bubble's roof.
    ctx.textBaseline = 'middle';
    ctx.font = `${settings.fontSize}px ${settings.fontFamily}`;
    box.lines.forEach((line, i) => {
      ctx.fillText(line, box.x + m.padX, box.y + m.padY + (i + 0.5) * m.lineHeight);
    });

    ctx.restore();
  }

  ctx.restore();
  return scene;
}

// The stack hangs from the bottom of the stage: positive while the content is
// short, negative once it outgrows the frame and the top must scroll away.
export function cameraTargetY(contentHeight, settings) {
  const m = metricsFor(settings);
  return settings.height - m.bottomPad - contentHeight;
}
