const results = [];

export function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true, err: null });
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
  }
}

export function eq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${message || 'not equal'}: expected ${b}, got ${a}`);
  }
}

export function ok(value, message) {
  if (!value) {
    throw new Error(message || 'expected truthy value');
  }
}

export function report(root) {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const head = document.createElement('h2');
  head.textContent = `${passed} passed, ${failed} failed`;
  head.style.color = failed === 0 ? '#137a3f' : '#b3261e';
  root.appendChild(head);
  for (const r of results) {
    const line = document.createElement('div');
    line.textContent = `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : ' — ' + r.err}`;
    line.style.color = r.ok ? '#137a3f' : '#b3261e';
    line.style.fontFamily = 'monospace';
    root.appendChild(line);
  }
}
