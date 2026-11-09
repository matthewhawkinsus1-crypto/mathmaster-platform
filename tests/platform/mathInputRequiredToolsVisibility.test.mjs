import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'src/MathInput.jsx'), 'utf8');

test('authored required answer tools are merged into the desktop keypad', () => {
  // The laptop's branch of the keypad: its last group is the answer's required tools.
  const laptop = source.slice(source.indexOf('if (!isMobile) {'), source.indexOf('return buildMobileMathTools({'));
  assert.ok(laptop.length > 0, 'the laptop branch');
  assert.match(laptop, /return mergeToolKeys\(\s*withExtraKeys\([^\n]*\),\s*requiredTools,\s*\);/);
});

test('authored required symbols open the keypad automatically', () => {
  assert.match(source, /useState\(showToolsInitially \|\| requiredSymbols\.length > 0\)/);
});
