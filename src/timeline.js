import { graphemes } from './layout.js';

// Builds the absolute-time schedule for a scripted conversation. Each message
// types itself in one grapheme at a time, holds, then yields to the next.
export function buildTimeline(messages, opts) {
  const { msPerChar, holdMs, gapMs, typingEnabled } = opts;
  const items = [];
  let cursor = 0;

  messages.forEach((message, index) => {
    const typeStart = cursor;
    const typeMs = typingEnabled ? graphemes(message.text).length * msPerChar : 0;
    const typeEnd = typeStart + typeMs;

    items.push({ index, side: message.side, text: message.text, typeStart, typeEnd });
    cursor = typeEnd + holdMs + gapMs;
  });

  return { items, duration: cursor };
}
