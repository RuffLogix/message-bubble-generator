// Appends one live-typed message to a session's item list, stamping its
// times from the session clock. Returns a new array; the input is untouched.
// The item shape matches src/timeline.js so src/renderer.js draws both the
// same way.
export function appendLive(items, message, now, opts) {
  const { typingMs, typingEnabled } = opts;
  const typingStart = typingEnabled ? now : null;
  const typingEnd = typingEnabled ? now + typingMs : null;

  return [
    ...items,
    {
      index: items.length,
      side: message.side,
      text: message.text,
      typingStart,
      typingEnd,
      appearAt: typingEnabled ? typingEnd : now,
    },
  ];
}
