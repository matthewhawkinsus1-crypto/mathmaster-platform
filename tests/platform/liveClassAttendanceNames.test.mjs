import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url),
  'utf8',
);

test('Live Class attendance uses the canonical student-name formatter', () => {
  assert.match(source, /import\s*\{\s*formatStudentName\s*\}\s*from\s*['"]\.\.\/\.\.\/platform\/studentName['"]/);
  assert.match(source, /formatStudentName\(student,\s*\{\s*lastFirst:\s*false,\s*fallbackToId:\s*false\s*\}\)/);
});

test('Live Class attendance keeps ID as secondary identification instead of the primary name', () => {
  assert.doesNotMatch(
    source,
    /const name = student\?\.displayName \|\| student\?\.name \|\| student\?\.studentName \|\| id;/,
  );
  assert.match(source, />ID \{id\}</);
});
