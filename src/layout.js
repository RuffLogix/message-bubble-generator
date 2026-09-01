export function graphemes(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

function breakLongWord(ctx, word, maxWidth) {
  const parts = [];
  let current = '';

  for (const char of graphemes(word)) {
    const candidate = current + char;
    if (current !== '' && ctx.measureText(candidate).width > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current !== '') parts.push(current);
  return parts;
}

export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let current = '';

  for (const word of String(text).split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;

    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current !== '') {
      lines.push(current);
      current = '';
    }

    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }

    const parts = breakLongWord(ctx, word, maxWidth);
    lines.push(...parts.slice(0, -1));
    current = parts[parts.length - 1] ?? '';
  }

  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export function measureBubble(ctx, text, metrics) {
  const { maxTextWidth, padX, padY, lineHeight } = metrics;
  const lines = wrapText(ctx, text, maxTextWidth);
  let widest = 0;

  for (const line of lines) {
    widest = Math.max(widest, ctx.measureText(line).width);
  }

  return {
    lines,
    width: Math.ceil(widest) + padX * 2,
    height: lines.length * lineHeight + padY * 2,
  };
}
