const PREFIX = /^([LR]):[ ]?(.*)$/i;

export function parseMessages(raw) {
  const messages = [];
  let side = 'left';

  for (const line of String(raw).split('\n')) {
    const match = line.match(PREFIX);
    const lineSide = match
      ? (match[1].toUpperCase() === 'L' ? 'left' : 'right')
      : side;
    const text = (match ? match[2] : line).trim();

    if (text === '') continue;

    side = lineSide;
    messages.push({ side, text });
  }

  return messages;
}
