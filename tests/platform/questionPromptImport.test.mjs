import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

test('QuestionEngine imports QuestionPrompt before rendering the desktop question anchor', () => {
  assert.match(source, /import\s+QuestionPrompt\s+from\s+['"]\.\/QuestionPrompt['"];?/);
  assert.match(source, /<QuestionPrompt>[\s\S]*processedQuestion\?\.prompt/);
});
