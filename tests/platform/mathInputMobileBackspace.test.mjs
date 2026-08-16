import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('mobile backspace is appended last and pinned to the final grid column', () => {
  const source = fs.readFileSync(new URL('../../src/MathInput.jsx', import.meta.url), 'utf8');
  assert.match(source, /MOBILE_BACKSPACE_KEY/);
  assert.match(source, /return \[\.\.\.combined\.filter\(\(tool\) => tool\.action !== 'deleteBackward'\), MOBILE_BACKSPACE_KEY\]/);
  assert.match(source, /gridColumn: '-2 \/ -1'/);
  assert.match(source, /mathmaster-fixed-backspace/);
});
