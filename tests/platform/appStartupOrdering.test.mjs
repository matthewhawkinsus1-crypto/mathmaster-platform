import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('teacher needs-attention dependencies are initialized before use', () => {
  const source = readFileSync(
    new URL('../../src/App.jsx', import.meta.url),
    'utf8',
  );

  const studentsDeclaration = source.indexOf(
    'const studentsInActiveClass = useMemo',
  );

  const needsAttentionDeclaration = source.indexOf(
    'const needsAttentionQueue = useMemo',
  );

  assert.notEqual(
    studentsDeclaration,
    -1,
    'studentsInActiveClass declaration must exist',
  );

  assert.notEqual(
    needsAttentionDeclaration,
    -1,
    'needsAttentionQueue declaration must exist',
  );

  assert.ok(
    studentsDeclaration < needsAttentionDeclaration,
    'studentsInActiveClass must initialize before needsAttentionQueue reads it',
  );
});
