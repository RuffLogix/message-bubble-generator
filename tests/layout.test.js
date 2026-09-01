import { test, eq, ok } from './assert.js';
import { wrapText, measureBubble } from '../src/layout.js';

function makeCtx() {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.font = '20px monospace';
  return ctx;
}

test('short text stays on one line', () => {
  const ctx = makeCtx();
  eq(wrapText(ctx, 'hello', 500), ['hello']);
});

test('long spaced text wraps onto multiple lines', () => {
  const ctx = makeCtx();
  const lines = wrapText(ctx, 'the quick brown fox jumps over the lazy dog', 200);
  ok(lines.length > 1, 'expected more than one line');
  for (const line of lines) {
    ok(ctx.measureText(line).width <= 200, `line too wide: ${line}`);
  }
});

test('wrapping does not lose or duplicate words', () => {
  const ctx = makeCtx();
  const text = 'the quick brown fox jumps over the lazy dog';
  const lines = wrapText(ctx, text, 200);
  eq(lines.join(' '), text);
});

test('an unspaced run longer than maxWidth breaks by character', () => {
  const ctx = makeCtx();
  const text = 'สวัสดีครับวันนี้อากาศดีมากเลยนะครับผมสบายดีขอบคุณ';
  const lines = wrapText(ctx, text, 200);
  ok(lines.length > 1, 'expected the unspaced run to break');
  for (const line of lines) {
    ok(ctx.measureText(line).width <= 200, `line too wide: ${line}`);
  }
  eq(lines.join(''), text);
});

test('a single character wider than maxWidth still emits one line', () => {
  const ctx = makeCtx();
  const lines = wrapText(ctx, 'W', 2);
  eq(lines, ['W']);
});

test('measureBubble sizes to the widest line plus padding', () => {
  const ctx = makeCtx();
  const metrics = { maxTextWidth: 500, padX: 24, padY: 16, lineHeight: 28 };
  const result = measureBubble(ctx, 'hello', metrics);
  eq(result.lines, ['hello']);
  eq(result.height, 28 + 32);
  ok(result.width > 48, 'width should exceed horizontal padding alone');
  ok(result.width < 500 + 48, 'width should not exceed the cap plus padding');
});

test('measureBubble height grows one lineHeight per line', () => {
  const ctx = makeCtx();
  const metrics = { maxTextWidth: 200, padX: 24, padY: 16, lineHeight: 28 };
  const one = measureBubble(ctx, 'hi', metrics);
  const many = measureBubble(ctx, 'the quick brown fox jumps over the lazy dog', metrics);
  eq(many.height, 28 * many.lines.length + 32);
  ok(many.height > one.height, 'multi-line bubble should be taller');
});
