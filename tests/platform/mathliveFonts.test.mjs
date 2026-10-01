import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { executableSource } from './helpers/sourceContract.mjs';

// MathLive's KaTeX fonts reach a production build only through the package's
// @font-face sheet; left to itself MathLive fetched them from /assets/fonts/,
// which the build never published (tests/browser/mathFontsProduction.mjs).

const require = createRequire(import.meta.url);
const sourceFiles = (directory) => readdirSync(directory).flatMap((name) => {
  const full = path.join(directory, name);
  if (statSync(full).isDirectory()) return sourceFiles(full);
  return /\.(jsx?|mjs)$/.test(name) ? [full] : [];
});

// The families MathLive's own loader requires before it considers fonts ready.
const MATHLIVE_FAMILIES = ['KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', 'KaTeX_Caligraphic', 'KaTeX_Fraktur', 'KaTeX_SansSerif', 'KaTeX_Script', 'KaTeX_Typewriter', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4'];

test('the math editor is loaded in one place, together with its fonts', () => {
  const runtime = executableSource(readFileSync('src/platform/math/mathliveRuntime.js', 'utf8'));
  assert.match(runtime, /^import 'mathlive';$/m);
  assert.match(runtime, /^import 'mathlive\/fonts\.css';$/m);
  const bare = sourceFiles('src')
    .filter((file) => /^import 'mathlive';$/m.test(executableSource(readFileSync(file, 'utf8'))))
    .map((file) => file.split(path.sep).join('/'));
  assert.deepEqual(bare, ['src/platform/math/mathliveRuntime.js'], 'anything that needs MathLive imports mathliveRuntime.js');
});

test('every component that mounts a math field or renders with MathLive loads the runtime', () => {
  for (const [file, specifier] of [
    ['src/MathInput.jsx', './platform/math/mathliveRuntime.js'],
    ['src/MathDisplay.jsx', './platform/math/mathliveRuntime.js'],
    ['src/components/CalculatorPanel.jsx', '../platform/math/mathliveRuntime.js'],
  ]) {
    assert.match(readFileSync(file, 'utf8'), new RegExp(`^import '${specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}';$`, 'm'), file);
  }
  // And nothing else mounts one without it.
  const mounting = sourceFiles('src')
    .filter((file) => /<math-field\b|document\.createElement\('math-field'\)/.test(executableSource(readFileSync(file, 'utf8'))))
    .filter((file) => !/mathliveRuntime\.js'/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(mounting, []);
});

test('the package sheet declares every family MathLive waits for', () => {
  const sheet = readFileSync(require.resolve('mathlive/fonts.css'), 'utf8');
  const declared = new Set([...sheet.matchAll(/font-family:\s*["']?([A-Za-z0-9_]+)/g)].map((match) => match[1]));
  MATHLIVE_FAMILIES.forEach((family) => assert.ok(declared.has(family), family));
});
