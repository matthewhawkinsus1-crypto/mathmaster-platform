/*
 * ONE INEQUALITY IS NOT A SYSTEM (F-SW-SYSTEM-WORDS, PR #537 walkthrough).
 *
 * On a one-inequality lesson (Algebra I M3 T2 L4) the Systems Workspace said
 * "Find overlap / Combine regions", "The overlap of the shaded sides is
 * hatched" and "Is the point a solution to the entire system?". With one
 * constraint it now says "Check your region" and "Is the point a solution?";
 * with two or more, exactly what it said before (inequalitySystemWords.js).
 *
 * Left from that batch (the November build's notes): the model button said
 * "Graph these constraints" with one constraint, the graph was named "the
 * inequality system", and the closed solution review was the
 * "Inequality-system solution" with a verdict on "the whole system".
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { ONE_CONSTRAINT_WORDS, wordsFor } from '../../src/tools/systemsWorkspace/inequalitySystemWords.js';
import { inequalityGraphMarksText, inequalityGraphName } from '../../src/tools/systemsWorkspace/inequalityGraphMarks.js';
import { buildSystemsWorkspaceReview } from '../../src/tools/shared/reviews/systemsWorkspaceReview.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';

after(closeEngine);

const SYSTEM_WORDS = /overlap|system|combine|every constraint|each inequality|every inequality|\bregions\b|individual/i;

test('with one constraint the workspace speaks of one inequality; with two or more, as before', () => {
  const one = wordsFor(1);
  assert.equal(one('Find overlap / Combine regions'), 'Check your region');
  assert.equal(one('Combine the regions'), 'Check your region');
  assert.equal(one('Is the point a solution to the entire system?'), 'Is the point a solution?');
  assert.equal(one('The overlap of the shaded sides is hatched.'), 'The shaded side is hatched.');
  for (const count of [2, 3, 6]) {
    for (const sentence of Object.keys(ONE_CONSTRAINT_WORDS)) assert.equal(wordsFor(count)(sentence), sentence, `${count} constraints: "${sentence}"`);
  }
  assert.equal(one('A sentence the table does not know.'), 'A sentence the table does not know.');
  assert.equal(wordsFor(0)('Systems of Inequalities'), 'Systems of Inequalities', 'not a student-build count');
  for (const [sentence, oneWording] of Object.entries(ONE_CONSTRAINT_WORDS)) {
    assert.doesNotMatch(oneWording, SYSTEM_WORDS, `"${oneWording}" (for "${sentence}")`);
  }
});

test('the graph says what is hatched in the same words', () => {
  const entry = { visible: true, style: 'solid', shadePoint: [0, 6] };
  const line = { A: -1, B: 1, C: -1, relation: '>=' };
  const marks = (count) => inequalityGraphMarksText({
    build: Array.from({ length: count }, () => entry),
    effectiveLines: Array.from({ length: count }, () => line),
    buildConfig: { boundary: true, lineStyle: true, shading: true },
    workingConstraints: Array.from({ length: count }, () => line),
    bounds: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
    combined: true,
    studentPolygon: [[0, 1], [0, 10], [-6, 10]],
  });
  assert.equal(marks(1), 'Boundary line 1: solid. One side of boundary line 1 is shaded. The shaded side is hatched.');
  assert.match(marks(2), /The overlap of the shaded sides is hatched\.$/);
});

// ------------------------------------------------------- the screen is held to it
const sources = {
  mode: executableSource(componentSource('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx')),
  panels: executableSource(componentSource('src/tools/systemsWorkspace/InequalityBuildPanels.jsx')),
  marks: executableSource(componentSource('src/tools/systemsWorkspace/inequalityGraphMarks.js')),
  workspace: executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx')),
  // The model step's title, and the closed solution review.
  flow: executableSource(componentSource('src/tools/systemsWorkspace/inequalityBuildFlow.js')),
  review: executableSource(componentSource('src/tools/shared/reviews/systemsWorkspaceReview.js')),
};

test('every sentence with a one-constraint wording is one the screen says, through that wording', () => {
  const all = Object.values(sources).join('\n');
  // As JavaScript writes it: in single quotes (an apostrophe escaped), or in double quotes.
  const literals = (sentence) => [`'${sentence.replace(/'/g, "\\'")}'`, `"${sentence}"`];
  for (const sentence of Object.keys(ONE_CONSTRAINT_WORDS)) {
    assert.ok(literals(sentence).some((literal) => all.includes(literal)), `"${sentence}" is still said on screen (edit both together)`);
  }
  assert.match(sources.mode, /\n\s*const said = wordsFor\(constraintCount\);/);
  assert.match(sources.mode, /phaseCard\('combine', said\('Combine the regions'\),/);
  assert.match(sources.mode, /onClick=\{combineRegions\} disabled=\{!allConstraintsComplete\}>\{said\('Find overlap \/ Combine regions'\)\}<\/button>/);
  assert.match(sources.mode, /\? said\('Your overlap is hatched on the graph\.'\)/);
  assert.match(sources.panels, /const said = wordsFor\(count\);/);
  assert.match(sources.panels, /legend=\{said\('Is the point a solution to the entire system\?'\)\}/);
  assert.match(sources.panels, /legend=\{said\('Does this point lie exactly on one of the boundary lines\?'\)\}/);
  assert.match(sources.workspace, /mode === 'inequalities' \? said\('Systems of Inequalities'\)/);
  // The model step, its button and the graph's name.
  assert.match(sources.mode, /phaseCard\('model', said\(STEP_LABELS\.model\), \(/);
  assert.match(sources.flow, /\n\s*model: 'Write the constraints',/);
  assert.match(sources.mode, /onClick=\{sendModel\} disabled=\{!modelingEntriesReady\}>\{said\('Graph these constraints'\)\}<\/button>/);
  assert.match(sources.mode, /onClick=\{reopenModeling\}>\{said\('Edit constraints'\)\}<\/button>/);
  // The graph's name is built from messages (AX05, slice 4), its one-constraint
  // wording through the same table; the screen's name for each count is held
  // below (graphName).
  assert.equal(inequalityGraphName({ constraintCount: 1 }).text, `Student-constructed graph of ${wordsFor(1)('the inequality system')}`);
  assert.equal(inequalityGraphName({ constraintCount: 2 }).text, 'Student-constructed graph of the inequality system');
  // Both reviews are told how many constraints there are.
  assert.match(region(sources.review, 'const studentBuildReview = ', 'const inequalitiesReview = '), /const said = wordsFor\(constraintCount\);[\s\S]*title: said\('Inequality-system solution'\),/);
  assert.match(region(sources.review, 'const legacyInequalitiesReview = ', 'const studentBuildReview = '), /const said = wordsFor\(lines\.length\);[\s\S]*title: said\('Inequality-system solution'\),/);
});

/* ------------------------------------------- the screen, one and two constraints */

const sw = (fields) => ({ type: 'systemsWorkspace', mode: 'inequalities', ...fields });
// Algebra I M3 T2 L4 CW 2: one constraint the student writes from words, graphs and tests.
const KAI = sw({
  questionId: 'words-kai',
  prompt: 'Let x be the number of two-point shots and y the number of three-point shots. Kai scores AT LEAST 20 points per game. Write the inequality, then graph it, and test the point (6, 4).',
  modeling: { variables: [{ symbol: 'x', label: 'two-point shots' }, { symbol: 'y', label: 'three-point shots' }], expectedConstraints: [{ A: 2, B: 3, C: -20, relation: '>=' }] },
  studentBuild: { rewrite: false, boundary: true, lineStyle: true, shading: true },
  reasoning: { testPoint: true, classifyRegion: false, vertices: false },
  testPoint: { x: 6, y: 4 },
  graph: { xMin: 0, xMax: 12, yMin: 0, yMax: 10 },
});
// Two constraints from words (Algebra I M3 T2 L5).
const CLUB = sw({
  questionId: 'words-club',
  prompt: 'A club sells x adult tickets and y student tickets. It can sell at most 10 tickets, and needs at least 2 adult tickets. Write the constraints, then graph them, and test the point (3, 4).',
  modeling: { variables: [{ symbol: 'x', label: 'adult tickets' }, { symbol: 'y', label: 'student tickets' }], expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }, { A: 1, B: 0, C: -2, relation: '>=' }] },
  studentBuild: { boundary: true, lineStyle: true, shading: true },
  reasoning: { testPoint: true, classifyRegion: false, vertices: false },
  testPoint: { x: 3, y: 4 },
  graph: { xMin: -2, xMax: 12, yMin: -2, yMax: 12 },
});
const buildMarkup = async (questionData) => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const Tool = registry.getToolDefinition('systemsWorkspace').component;
  return withBrowser(() => render(React.createElement(Tool, { questionData, onAction() {}, attemptRecord: null })));
};
const graphName = (markup) => (markup.match(/<svg\b[^>]*\baria-label="(Student-constructed graph of [^"]*)"/) || [])[1] || '';

test('with one constraint the model step and the graph speak of one inequality; with two, as before', async () => {
  const one = await buildMarkup(KAI);
  assert.match(one, />Write the inequality</);
  assert.match(one, /write the inequality\./);
  assert.match(one, /<button[^>]*>Graph this inequality<\/button>/);
  assert.match(one, /The inequality needs both coefficients, a relation and a constant\./);
  assert.doesNotMatch(one, /Graph these constraints|write each constraint|Every constraint needs|Write the constraints/);
  assert.match(graphName(one), /^Student-constructed graph of the inequality(?! system)/, graphName(one));
  const two = await buildMarkup(CLUB);
  assert.match(two, /<button[^>]*>Graph these constraints<\/button>/);
  assert.match(two, /write each constraint\./);
  assert.match(graphName(two), /^Student-constructed graph of the inequality system/, graphName(two));
});

/* ------------------------------------------- the closed solution review */

const textOf = (review) => [review.title, review.why, review.note, ...review.steps, ...review.items.flatMap((item) => [item.label, item.value])].filter(Boolean);
const labelsOf = (review) => review.items.map((item) => item.label);

test('the closed review of one inequality is an inequality\'s: no system, no overlap, a verdict on "a solution?"', () => {
  const review = buildSystemsWorkspaceReview(KAI);
  assert.equal(review.title, 'Inequality solution');
  assert.ok(labelsOf(review).includes('Marked point (6, 4): the inequality'), labelsOf(review).join(' | '));
  assert.ok(labelsOf(review).includes('Marked point (6, 4): a solution?'), labelsOf(review).join(' | '));
  assert.match(review.steps.join(' '), /It satisfies the inequality, so it is a solution\./);
  assert.match(review.steps.join(' '), /^Write an inequality for the condition \(x = two-point shots, y = three-point shots\): 2x \+ 3y ≥ 20\. Enter its coefficients, symbol and constant, then send your model\./);
  for (const text of textOf(review)) assert.doesNotMatch(text, SYSTEM_WORDS, `"${text}"`);
  // A point that fails it, and a given boundary (the legacy form, on My Math Path).
  assert.match(buildSystemsWorkspaceReview({ ...KAI, testPoint: { x: 1, y: 1 } }).steps.join(' '), /It fails the inequality, so it is not a solution\./);
  const legacy = buildSystemsWorkspaceReview(sw({ questionId: 'words-legacy', prompt: 'Is (1, 4) a solution of y ≥ 2x − 3?', inequalities: [{ m: 2, b: -3, relation: '>=' }], testPoint: { x: 1, y: 4 } }));
  assert.equal(legacy.title, 'Inequality solution');
  for (const text of textOf(legacy)) assert.doesNotMatch(text, SYSTEM_WORDS, `"${text}"`);
});

test('the closed review of two or more constraints is the system\'s, as before', () => {
  const review = buildSystemsWorkspaceReview(CLUB);
  assert.equal(review.title, 'Inequality-system solution');
  assert.ok(labelsOf(review).includes('Marked point (3, 4): each inequality'), labelsOf(review).join(' | '));
  assert.ok(labelsOf(review).includes('Marked point (3, 4): the whole system'), labelsOf(review).join(' | '));
  assert.match(review.why, /^A point solves the system exactly when it satisfies every constraint/);
  const legacy = buildSystemsWorkspaceReview(sw({ questionId: 'words-legacy-2', prompt: 'Is (1, 4) in the region?', inequalities: [{ m: 2, b: -3, relation: '>=' }, { m: -1, b: 6, relation: '<=' }], testPoint: { x: 1, y: 4 } }));
  assert.equal(legacy.title, 'Inequality-system solution');
  assert.match(legacy.steps.join(' '), /in each inequality/);
});
