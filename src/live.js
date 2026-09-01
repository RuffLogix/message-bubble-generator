import { graphemes } from './layout.js';

// Appends one live-typed message to a session's item list, stamping its times
// from the session clock. Returns a new array; the input is untouched. The item
// shape matches src/timeline.js so src/renderer.js draws both the same way.
export function appendLive(items, message, now, opts) {
  const { msPerChar, typingEnabled } = opts;
  const typeMs = typingEnabled ? graphemes(message.text).length * msPerChar : 0;

  return [
    ...items,
    {
      index: items.length,
      side: message.side,
      text: message.text,
      typeStart: now,
      typeEnd: now + typeMs,
    },
  ];
}
