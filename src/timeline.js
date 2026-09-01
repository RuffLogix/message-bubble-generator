export const HOLD_MIN_MS = 400;
export const HOLD_MAX_MS = 4000;

export function clampHold(ms) {
  return Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, ms));
}

export function buildTimeline(messages, opts) {
  const { msPerChar, typingMs, gapMs, typingEnabled } = opts;
  const items = [];
  let cursor = 0;

  messages.forEach((message, index) => {
    let typingStart = null;
    let typingEnd = null;

    if (typingEnabled) {
      typingStart = cursor;
      typingEnd = cursor + typingMs;
      cursor = typingEnd;
    }

    const appearAt = cursor;
    items.push({ index, side: message.side, text: message.text, typingStart, typingEnd, appearAt });

    cursor = appearAt + clampHold(message.text.length * msPerChar) + gapMs;
  });

  return { items, duration: cursor };
}
