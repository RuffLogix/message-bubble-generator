import { test, eq } from './assert.js';
import { parseMessages } from '../src/parse.js';

test('parses L and R prefixes', () => {
  eq(parseMessages('L: hello\nR: hi'), [
    { side: 'left', text: 'hello' },
    { side: 'right', text: 'hi' },
  ]);
});

test('prefix is case-insensitive and space after colon is optional', () => {
  eq(parseMessages('l:hello\nr:  hi'), [
    { side: 'left', text: 'hello' },
    { side: 'right', text: 'hi' },
  ]);
});

test('unprefixed line inherits the previous side', () => {
  eq(parseMessages('R: hi\nagain'), [
    { side: 'right', text: 'hi' },
    { side: 'right', text: 'again' },
  ]);
});

test('leading unprefixed line defaults to left', () => {
  eq(parseMessages('hello'), [{ side: 'left', text: 'hello' }]);
});

test('blank and whitespace-only lines are dropped', () => {
  eq(parseMessages('L: a\n\n   \nL: b'), [
    { side: 'left', text: 'a' },
    { side: 'left', text: 'b' },
  ]);
});

test('a prefix with no text is dropped and does not change side', () => {
  eq(parseMessages('R: hi\nL:\nagain'), [
    { side: 'right', text: 'hi' },
    { side: 'right', text: 'again' },
  ]);
});

test('a colon inside the message body is preserved', () => {
  eq(parseMessages('L: time: 9:30'), [{ side: 'left', text: 'time: 9:30' }]);
});

test('empty input yields an empty list', () => {
  eq(parseMessages('   \n  '), []);
});
