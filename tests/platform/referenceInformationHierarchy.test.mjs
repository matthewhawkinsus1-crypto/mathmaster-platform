import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolveReferenceInfo } from '../../src/referenceInfo.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('scenario automatically becomes prominent reference information', () => {
  const info = resolveReferenceInfo({
    prompt: 'Build a model for the money collected.',
    scenario: 'A student group sells chocolate bars for $2 each. M(x) gives the money collected after selling x bars.',
  });
  assert.equal(info.source, 'scenario');
  assert.match(info.statements[0].text, /\$2 each/);
});

test('scenario fallback stays hidden when it only repeats the task', () => {
  const info = resolveReferenceInfo({
    prompt: 'Andrew is at an amusement park. The roller coaster ride lasts 3 minutes and reaches a maximum speed of 75 miles per hour. Identify the domain and range.',
    scenario: 'A roller coaster ride lasts 3 minutes and reaches a maximum speed of 75 miles per hour.',
  });
  assert.equal(info, null);
});

test('mostly repeated authored referenceInfo stays hidden', () => {
  const info = resolveReferenceInfo({
    prompt: 'Natalia fills a tub at 12 gallons per minute. Let t be time in minutes and V be water added in gallons. Use the first 4 minutes.',
    referenceInfo: {
      statements: [
        'The tub fills at 12 gallons per minute.',
        't represents time in minutes.',
        'V represents the amount of water added in gallons.',
        'Use the interval 0 ≤ t ≤ 4.',
      ],
    },
  });
  assert.equal(info, null);
});

test('authored referenceInfo overrides scenario fallback', () => {
  const info = resolveReferenceInfo({
    scenario: 'Long scenario fallback.',
    referenceInfo: {
      title: 'Chocolate Bar Sales',
      statements: ['Chocolate bars sell for $2 each.', 'M(x) is money collected.'],
    },
  });
  assert.equal(info.source, 'authored');
  assert.equal(info.title, 'Chocolate Bar Sales');
  assert.equal(info.statements.length, 2);
});

test('V5 compiler preserves authored referenceInfo', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Reference Test', courseId: 'algebra1' },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A.3C',
        prompt: 'Identify the input and output.',
        scenario: 'Tickets cost $5 each.',
        referenceInfo: { statements: ['Tickets cost $5 each.'] },
        studentActions: ['identifyQuantities'],
        quantities: [{ id: 'tickets', label: 'Tickets' }, { id: 'cost', label: 'Cost' }],
        correctIndependentId: 'tickets',
        correctDependentId: 'cost',
      }],
    }],
  });
  assert.equal(compiled.package.sections[0].questions[0].referenceInfo.statements[0], 'Tickets cost $5 each.');
});

test('QuestionEngine places reference before work and Guided Notes inside the work area', async () => {
  const engine = await read('src/QuestionEngine.jsx');
  const referenceIndex = engine.indexOf('<ReferenceInfoCard referenceInfo={referenceInfo} />');
  const workspaceIndex = engine.indexOf('className="mathmaster-question-tool-workspace"');
  const guidedIndex = engine.indexOf('<GuidedClassworkCoach', workspaceIndex);
  assert.ok(referenceIndex > 0);
  assert.ok(workspaceIndex > referenceIndex);
  assert.ok(guidedIndex > workspaceIndex);
  assert.match(engine, /suppressScenarioDisplay/);
});

test('desktop assignments keep Your Task as the persistent prompt instead of duplicating it in workflows', async () => {
  const engine = await read('src/QuestionEngine.jsx');
  const css = await read('src/App.css');
  assert.match(engine, /<WorkflowRunner[\s\S]*showPrompt=\{false\}/);
  assert.match(engine, /overflow: 'visible'/);
  assert.match(css, /\.mathmaster-desktop-question-content \.mathmaster-desktop-question-anchor\s*\{[\s\S]*position:\s*sticky/);
  assert.match(css, /top:\s*var\(--mm-sticky-task-top\)/);
});

test('Guided Notes are collapsed by default and offered as optional help', async () => {
  const coach = await read('src/GuidedClassworkCoach.jsx');
  assert.match(coach, /guided-collapsed` : null, true/);
  assert.match(coach, /Need help\? Guided Notes/);
});
