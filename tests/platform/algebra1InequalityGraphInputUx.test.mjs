import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const graphWorkspace = fs.readFileSync('src/InteractiveGraphWorkspace.jsx', 'utf8');
const mathInput = fs.readFileSync('src/MathInput.jsx', 'utf8');

test('inequality domain/range fields always offer an All Real Numbers response', () => {
  assert.match(graphWorkspace, /offersAllRealNumbers/);
  assert.match(graphWorkspace, /\['domain', 'range'\]\.includes\(part\.kind\)/);
  assert.match(graphWorkspace, />\s*All Real Numbers\s*</);
  assert.match(graphWorkspace, /\\\\text\{All Real Numbers\}/);
});

test('inequality keypad does not teach interval-only infinity or union symbols', () => {
  const inequalityStart = mathInput.indexOf('const INEQUALITY_KEYS = [');
  const inequalityEnd = mathInput.indexOf('];', inequalityStart);
  assert.ok(inequalityStart >= 0 && inequalityEnd > inequalityStart);
  const inequalityKeys = mathInput.slice(inequalityStart, inequalityEnd);

  assert.match(inequalityKeys, /label: '≤'/);
  assert.match(inequalityKeys, /label: '≥'/);
  assert.doesNotMatch(inequalityKeys, /∞/);
  assert.doesNotMatch(inequalityKeys, /∪/);

  const intervalStart = mathInput.indexOf('const INTERVAL_KEYS = [');
  const intervalEnd = mathInput.indexOf('];', intervalStart);
  const intervalKeys = mathInput.slice(intervalStart, intervalEnd);
  assert.match(intervalKeys, /∞/);
  assert.match(intervalKeys, /∪/);
});
