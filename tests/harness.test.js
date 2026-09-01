import { test, eq, ok } from './assert.js';

test('eq compares deep values', () => {
  eq([1, { a: 2 }], [1, { a: 2 }]);
});

test('ok accepts truthy', () => {
  ok(1 === 1);
});
