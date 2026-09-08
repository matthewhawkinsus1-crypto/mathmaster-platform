import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'src/MathInput.jsx'), 'utf8');

test('authored required answer tools are merged into the desktop keypad', () => {
  assert.match(source, /if \(!isMobile\) return mergeToolKeys\(/);
  assert.match(source, /requiredTools,/);
});

test('authored required symbols open the keypad automatically', () => {
  assert.match(source, /useState\(showToolsInitially \|\| requiredSymbols\.length > 0\)/);
});
