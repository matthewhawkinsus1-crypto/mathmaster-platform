import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { resolveTaskContextPresentation } from '../../src/platform/workflow/taskContextPresentation.js';

const scenario = 'A tank fills steadily for 10 minutes, going from 0 gallons to 60 gallons.';
const stages = [
  'Should this relationship be represented as discrete points or a continuous graph?',
  'State the domain of the relationship.',
  'State the range of the relationship.',
];

test('multipart task context keeps the original scenario while the active stage changes', () => {
  const presentations = stages.map((currentStagePrompt) => resolveTaskContextPresentation({
    originalTaskPrompt: scenario,
    currentStagePrompt,
    composed: true,
  }));

  assert.deepEqual(presentations.map((value) => value.originalTaskPrompt), [scenario, scenario, scenario]);
  assert.deepEqual(presentations.map((value) => value.currentStagePrompt), stages);
});

test('question navigation replaces both task-context levels', () => {
  const q1 = resolveTaskContextPresentation({ originalTaskPrompt: scenario, currentStagePrompt: stages[1], composed: true });
  const q2 = resolveTaskContextPresentation({
    originalTaskPrompt: 'A bus travels 45 miles in one hour.',
    currentStagePrompt: 'Identify the independent variable.',
    composed: true,
  });

  assert.equal(q1.originalTaskPrompt, scenario);
  assert.deepEqual(q2, {
    originalTaskPrompt: 'A bus travels 45 miles in one hour.',
    currentStagePrompt: 'Identify the independent variable.',
  });
  assert.doesNotMatch(`${q2.originalTaskPrompt} ${q2.currentStagePrompt}`, /tank|domain/i);
});

test('a restored later stage retains original context', () => {
  assert.deepEqual(resolveTaskContextPresentation({
    originalTaskPrompt: scenario,
    currentStagePrompt: stages[2],
    composed: true,
  }), { originalTaskPrompt: scenario, currentStagePrompt: stages[2] });
});

test('equivalent task and stage text is shown only once', () => {
  assert.deepEqual(resolveTaskContextPresentation({
    originalTaskPrompt: `  ${scenario}  `,
    currentStagePrompt: scenario.toUpperCase(),
    composed: true,
  }), { originalTaskPrompt: scenario, currentStagePrompt: '' });
});

test('a simple question remains a single prompt', () => {
  assert.deepEqual(resolveTaskContextPresentation({
    originalTaskPrompt: 'Solve x + 2 = 5.',
    currentStagePrompt: '',
    composed: false,
  }), { originalTaskPrompt: 'Solve x + 2 = 5.', currentStagePrompt: '' });
});

test('QuestionEngine and the shared viewport preserve both semantic prompt values', async () => {
  const engine = await readFile(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  const viewport = await readFile(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8');

  assert.match(engine, /originalTaskPrompt=\{processedQuestion\?\.prompt \|\| processedQuestion\?\.scenario/);
  assert.match(engine, /currentStagePrompt=\{taskContextPresentation\.currentStagePrompt\}/);
  assert.match(viewport, /<span>Current question<\/span>/i);
  assert.match(viewport, /isPromptCollapsed[\s\S]*originalTaskPrompt[\s\S]*currentStagePrompt/,
    'the same hide/show state must control the complete two-level task context');
});
