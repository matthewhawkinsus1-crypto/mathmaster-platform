import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizePlainMathTypography } from '../../src/components/common/mathSegments.js';

const source = fs.readFileSync(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8');

test('MobileViewportContainer owns and imports the canonical student task prompt', () => {
  assert.match(source, /import\s+QuestionPrompt\s+from\s+['"]\.\.\/\.\.\/QuestionPrompt['"];?/);
  assert.match(source, /mathmaster-desktop-question-anchor[\s\S]*<QuestionPrompt variant="task">/);
  assert.match(source, /promptText \|\| 'Complete the math task\.'/);
});


test('embedded ToolShell task cards do not duplicate the canonical assignment prompt', () => {
  const toolShell = fs.readFileSync(new URL('../../src/tools/shared/ToolShell.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../src/components/student/MathToolMobileLayout.css', import.meta.url), 'utf8');
  const engine = fs.readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  assert.match(toolShell, /mathmaster-tool-task-prompt/);
  assert.match(css, /mathmaster-question-engine-has-anchor[\s\S]*mathmaster-tool-task-prompt[\s\S]*display:\s*none/);
  assert.doesNotMatch(engine, /className="mathmaster-desktop-question-anchor"/);
});


test('student prose typography converts raw exponent shorthand instead of showing carets', () => {
  assert.equal(
    normalizePlainMathTypography('Graph f(x)=(x-2)^2-9 and identify the vertex.'),
    'Graph f(x)=(x-2)²-9 and identify the vertex.',
  );
  assert.equal(
    normalizePlainMathTypography('Compare f(x)=3(2^x) with a decay model.'),
    'Compare f(x)=3(2ˣ) with a decay model.',
  );
  assert.equal(normalizePlainMathTypography('x^-1'), 'x⁻¹');
});
