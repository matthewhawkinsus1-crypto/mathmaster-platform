import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('QuestionEngine owns one prominent prompt and exposes a large next-question action', async () => {
  const [engine, prompt, css] = await Promise.all([
    read('src/QuestionEngine.jsx'),
    read('src/QuestionPrompt.jsx'),
    read('src/index.css'),
  ]);
  assert.match(engine, /mathmaster-desktop-question-anchor/);
  assert.match(engine, /mathmaster-question-tool-workspace/);
  assert.match(engine, /mathmaster-success-next-question/);
  assert.match(engine, /Next Question/);
  assert.match(prompt, /Your question/);
  assert.match(prompt, /borderLeft: isProminent \? '7px solid #1a73e8'/);
  assert.match(css, /mathmaster-question-engine-has-anchor[\s\S]*mathmaster-question-prompt-prominent/);
});

test('assignment current-section strip reports completion and remaining question count', async () => {
  const app = await read('src/App.jsx');
  assert.match(app, /currentSectionCompletedCount/);
  assert.match(app, /currentSectionRemainingCount/);
  assert.match(app, /remaining/);
  assert.match(app, /section-progress-/);
  assert.match(app, /onNextQuestion=\{nextQuestionEntry/);
});
