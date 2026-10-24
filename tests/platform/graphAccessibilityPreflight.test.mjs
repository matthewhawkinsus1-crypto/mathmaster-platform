// PR #454 review B2 follow-up: a graph-reading item without an authored
// screen-reader description is flagged (warning, never a block), because while
// it can be answered the generated description names no feature value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditAssignmentGraphAccessibility, graphReadingWithoutDescription } from '../../src/platform/preflight/graphAccessibilityPreflight.js';
import { familyGraphReadingWithoutDescription, graphReadingWithoutDescription as sharedGraphReadingWithoutDescription } from '../../functions/shared/graphReadingAccessibility.mjs';
import { preflightTestCycle } from '../../functions/shared/testCyclePreflight.mjs';
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

/*
 * AX03: the remedy a teacher can now choose is named — the Graph read-out
 * support (src/platform/supports/graphReadOut.js) — and graph-reading TEST
 * items are warned about too, in the Test Cycle Pre-Flight the server runs.
 * Still a warning, never a block. The detection is one shared module.
 */
test('the warning names the Graph read-out support among the remedies', () => {
  const { warnings } = auditAssignmentGraphAccessibility([{ stimulus: { graph: { readCoordinates: true } } }]);
  assert.match(warnings[0], /the Graph read-out support on their plan/);
});

test('a bank family is checked across its template and every variant it can issue', () => {
  const described = { readCoordinates: true, accessibleDescription: 'A line through two grid points.' };
  const bare = { readCoordinates: true };
  assert.match(familyGraphReadingWithoutDescription({ stimulus: { graph: bare } }), /read coordinates/);
  assert.match(familyGraphReadingWithoutDescription({ stimulus: {}, variants: [{ stimulus: { graph: described } }, { stimulus: { graph: bare } }] }), /read coordinates/, 'one variant without a description is enough');
  assert.match(familyGraphReadingWithoutDescription({ variants: [{ template: { stimulus: { panels: [{ graph: bare }] } } }] }), /read coordinates/, 'a variant\'s template, inside a panel');
  assert.equal(familyGraphReadingWithoutDescription({ stimulus: { graph: described }, variants: [{ stimulus: { graph: described } }] }), null);
  assert.equal(familyGraphReadingWithoutDescription({ prompt: 'Solve.', variants: [{ prompt: 'Solve again.' }] }), null);
  assert.equal(familyGraphReadingWithoutDescription(null), null);
  // The lesson Pre-Flight asks the same shared question.
  assert.equal(graphReadingWithoutDescription, sharedGraphReadingWithoutDescription);
});

const dol2Assignment = JSON.parse(read('drafts/district-dol2/assignment.json'));
const dol2Families = JSON.parse(read('functions/seeds/secureAssessments/algebra1_district_dol2.json')).documents;
const dol2Preflight = (families) => preflightTestCycle({
  assignment: dol2Assignment,
  blueprint: dol2Assignment.testBlueprint,
  families,
  familyIssuability: Object.fromEntries(families.map((family) => [family.id, { issuable: true, reason: null }])),
});
const graphWarnings = (result) => result.warnings.filter((warning) => /graph-reading questions with no screen-reader description/.test(warning));

test('Test Cycle Pre-Flight: the district DOL 2 test names its seven graph-reading items, and still publishes', () => {
  const baseline = dol2Preflight(dol2Families);
  const [warning, ...more] = graphWarnings(baseline);
  assert.equal(more.length, 0, 'one warning for the whole test');
  assert.ok(warning, 'the Test Cycle warns');
  assert.match(warning, /^7 targets draw graph-reading questions with no screen-reader description \(graph\.accessibleDescription\): /);
  const named = [...warning.matchAll(/(dol2-q\d+) \((mm_district_dol2_q\d+)\)/g)].map((match) => match[1]);
  assert.deepEqual(named, ['dol2-q03', 'dol2-q04', 'dol2-q07', 'dol2-q08', 'dol2-q10', 'dol2-q11', 'dol2-q12']);
  assert.match(warning, /the Graph read-out support on their plan, a human reader or a tactile graphic\.$/);
  assert.equal(baseline.blocked, false, 'advisory, like the lesson Pre-Flight');
  assert.ok(!baseline.errors.some((error) => /screen-reader/.test(error)));
});

test('Test Cycle Pre-Flight: an authored description silences an item; a family the Test cannot draw is not named', () => {
  const describe = (family) => ({
    ...family,
    stimulus: JSON.parse(JSON.stringify(family.stimulus || {}).replaceAll('"readCoordinates":true', '"readCoordinates":true,"accessibleDescription":"A line on the grid."')),
    variants: (family.variants || []).map((variant) => JSON.parse(JSON.stringify(variant).replaceAll('"readCoordinates":true', '"readCoordinates":true,"accessibleDescription":"A line on the grid."'))),
  });
  const withDescription = dol2Families.map((family) => (family.id === 'mm_district_dol2_q03' ? describe(family) : family));
  const [warning] = graphWarnings(dol2Preflight(withDescription));
  assert.match(warning, /^6 targets /);
  assert.doesNotMatch(warning, /dol2-q03/);
  const retired = dol2Families.map((family) => (family.id === 'mm_district_dol2_q04' ? { ...family, active: false } : family));
  assert.doesNotMatch(graphWarnings(dol2Preflight(retired))[0] || '', /dol2-q04/, 'never drawn, so not a question a student meets');
  const allDescribed = dol2Families.map(describe);
  assert.deepEqual(graphWarnings(dol2Preflight(allDescribed)), []);
});
