import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'src/MathInput.jsx'), 'utf8');

test('authored required answer tools are visible on desktop and mobile', () => {
  assert.match(source, /\{requiredTools\.length > 0 && \(/);
  assert.doesNotMatch(source, /\{isMobile && requiredTools\.length > 0 && \(/);
});
