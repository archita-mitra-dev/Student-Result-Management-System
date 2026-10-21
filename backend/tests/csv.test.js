const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv } = require('../src/utils/csv');

test('parses quoted fields, escaped quotes, CRLF and BOM', () => {
  const rows = parseCsv('﻿roll_no,note\r\nR1,"a, b"\r\nR2,"say ""hi"""\r\n');
  assert.deepEqual(rows, [['roll_no', 'note'], ['R1', 'a, b'], ['R2', 'say "hi"']]);
});
test('ignores blank lines', () => {
  assert.deepEqual(parseCsv('a,b\n\n1,2\n'), [['a', 'b'], ['1', '2']]);
});
