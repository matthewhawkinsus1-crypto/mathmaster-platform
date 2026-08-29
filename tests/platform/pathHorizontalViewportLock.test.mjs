import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Path session owns a horizontal viewport lock instead of relying on CSS alone', () => {
  const source = readFileSync('src/components/student/PathSessionPlayer.jsx', 'utf8');
  assert.match(source, /workspaceRef = useRef\(null\)/);
  assert.match(source, /window\.scrollTo\(0, top\)/);
  assert.match(source, /window\.addEventListener\('scroll', scheduleRestore/);
  assert.match(source, /<main ref=\{workspaceRef\} style=\{TOOL_WRAPPER\}>/);
  assert.match(source, /<main ref=\{workspaceRef\} style=\{WRAPPER\}>/);
});

test('MathInput focus cannot ask the browser to pan the document', () => {
  const source = readFileSync('src/MathInput.jsx', 'utf8');
  assert.match(source, /focus\?\.\(\{ preventScroll: true \}\)/);
  assert.match(source, /mathField\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /contain: 'inline-size'/);
});
