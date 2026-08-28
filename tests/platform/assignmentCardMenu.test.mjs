import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('desktop assignment menu stays in the three-dot button coordinate system', () => {
  const source = readFileSync('src/AssignmentCardMenu.jsx', 'utf8');
  assert.match(source, /position: 'absolute'/);
  assert.match(source, /right: 0/);
  assert.match(source, /open && layout\?\.mode === 'popover' \? menuItems : null/);
  assert.match(source, /layout\?\.mode === 'sheet'.*createPortal/s);
  assert.doesNotMatch(source, /layout\?\.mode === 'popover'[\s\S]{0,120}createPortal/);
});
