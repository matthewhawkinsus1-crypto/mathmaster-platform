import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8');

test('MobileViewportContainer owns and imports the canonical student task prompt', () => {
  assert.match(source, /import\s+QuestionPrompt\s+from\s+['"]\.\.\/\.\.\/QuestionPrompt['"];?/);
  assert.match(source, /className="mathmaster-desktop-question-anchor"[\s\S]*<QuestionPrompt variant="task">/);
  assert.match(source, /promptText \|\| 'Complete the math task\.'/);
});
