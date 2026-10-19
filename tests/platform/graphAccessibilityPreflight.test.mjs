// PR #454 review B2 follow-up: a graph-reading item without an authored
// screen-reader description is flagged (warning, never a block), because while
// it can be answered the generated description names no feature value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditAssignmentGraphAccessibility, graphReadingWithoutDescription } from '../../src/platform/preflight/graphAccessibilityPreflight.js';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('a readCoordinates graph, or a mark-the-feature step, with no description is flagged', () => {
  assert.match(graphReadingWithoutDescription({ stimulus: { kind: 'graph', graph: { readCoordinates: true, lines: [] } } }), /read coordinates/);
  assert.match(graphReadingWithoutDescription({ stimulus: { panels: [{ graph: { readCoordinates: true } }] } }), /read coordinates/, 'inside a panel too');
  assert.match(graphReadingWithoutDescription({ workflow: [{ kind: 'graphFeatureSelect', feature: 'xIntercept', graph: {} }] }), /mark a feature/);
});

test('an authored description, or a graph nobody is asked to read, is not flagged', () => {
  assert.equal(graphReadingWithoutDescription({ stimulus: { graph: { readCoordinates: true, accessibleDescription: 'A line falling from the upper left.' } } }), null);
  assert.equal(graphReadingWithoutDescription({ workflow: [{ kind: 'graphFeatureSelect', graph: { accessibleDescription: 'A parabola opening down.' } }] }), null);
  assert.equal(graphReadingWithoutDescription({ stimulus: { graph: { lines: [] } } }), null);
  assert.equal(graphReadingWithoutDescription({ prompt: 'Solve 2x = 4.' }), null);
});

test('the warning names the question and the remedies, and an excluded question is skipped', () => {
  const { warnings } = auditAssignmentGraphAccessibility([
    { prompt: 'Solve.' },
    { stimulus: { graph: { readCoordinates: true } } },
    { teacherExcluded: true, stimulus: { graph: { readCoordinates: true } } },
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Question 2 asks students to read coordinates off a graph and has no screen-reader description/);
  assert.match(warnings[0], /human reader or a tactile graphic/);
});

test('V5 preflight reports it as a warning, never a blocking error', () => {
  const model = executableSource(read('src/platform/preflight/assignmentV5PreflightModel.js'));
  assert.match(model, /import \{ auditAssignmentGraphAccessibility \} from '\.\/graphAccessibilityPreflight\.js';/);
  assert.match(model, /\{ source: 'graphAccessibility', severity: 'warning', messages: graphAccessibility\.warnings \}/);
  assert.doesNotMatch(model, /source: 'graphAccessibility', severity: 'blocking'/);
  // The Path / secure stimulus passes an authored description to the plane.
  assert.match(read('src/components/student/PathQuestionStimulus.jsx'), /description=\{graph\.accessibleDescription \|\| null\}/);
});
