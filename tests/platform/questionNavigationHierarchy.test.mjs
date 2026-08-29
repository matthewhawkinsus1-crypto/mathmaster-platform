import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('QuestionEngine owns a compact task prompt and exposes a large next-question action', async () => {
  const [engine, viewport, prompt, css] = await Promise.all([
    read('src/QuestionEngine.jsx'),
    read('src/components/student/MobileViewportContainer.jsx'),
    read('src/QuestionPrompt.jsx'),
    read('src/index.css'),
  ]);
  assert.match(viewport, /mathmaster-desktop-question-anchor/);
  assert.match(engine, /mathmaster-question-tool-workspace/);
  assert.match(engine, /mathmaster-success-next-question/);
  assert.match(engine, /Next Question/);
  assert.match(viewport, /variant="task"/);
  assert.match(prompt, /Your task/);
  assert.match(prompt, /borderLeft: isTask \? '5px solid #5f8fd8'/);
  assert.match(css, /mathmaster-question-engine-has-anchor[\s\S]*mathmaster-question-prompt-prominent/);
});

test('unified assignment navigator reports section completion and supports section/question navigation', async () => {
  const app = await read('src/App.jsx');
  assert.match(app, /currentSectionCompletedCount/);
  assert.match(app, /currentSectionRemainingCount/);
  assert.match(app, /mathmaster-assignment-unified-nav/);
  assert.match(app, /mathmaster-section-tab/);
  assert.match(app, /currentNavigationSection\?\.entries/);
  assert.match(app, /mathmaster-unified-next/);
});
