import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

test('QuestionEngine imports QuestionPrompt before rendering the desktop question anchor', () => {
  assert.match(source, /import\s+QuestionPrompt\s+from\s+['"]\.\/QuestionPrompt['"];?/);
  // Attributes allowed: the anchor is rendered as `<QuestionPrompt variant="task">`
  // now. What this guards is that the prompt is wrapped by the imported
  // component at all — the crash it was written for was QuestionPrompt being
  // used without being imported — not the exact spelling of the opening tag.
  assert.match(source, /<QuestionPrompt(\s[^>]*)?>[\s\S]*processedQuestion\?\.prompt/);
});
