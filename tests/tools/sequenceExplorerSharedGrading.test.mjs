import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import sequenceExplorerGrader, {
  matchesExplicitRule,
  matchesRecursiveRule,
} from '../../functions/shared/serverGrading/tools/sequenceExplorer.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/sequenceExplorer.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  comparePlotCount,
  fullBridgeTermCount,
  generateSequence,
  missingTermCount,
} from '../../functions/shared/toolMath/sequenceExplorer/sequenceMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * SEQUENCE EXPLORER IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for every mode — and
 * that verdict must be the one the screen's old inline Check reached.
 */

const COMPONENT = 'src/tools/sequenceExplorer/SequenceExplorer.jsx';
const source = fs.readFileSync(COMPONENT, 'utf8');
const code = executableSource(source);

const TYPE = 'sequenceExplorer';
const q = (fields) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(sequenceExplorerGrader, question, work);
  const server = browser.toolResponse
    ? gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) })
    : null;
  assert.ok(server, 'the browser path always produces a tool response for the server');
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'ungraded reason');
  return { ...browser, reason: browser.reason, mode: server.mode, serverReason: server.reason };
};

const partIds = (result) => result.parts.map((part) => part.id);
const failedIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

// The component's own routing, read from its source: `questionData.mode ||
// '<default>'`, then `if (mode === '<view>') return <...`, else the default.
const componentRouting = (() => {
  const body = region(code, 'export default function SequenceExplorer', '\nfunction ', 'router');
  const fallback = body.match(/const mode = questionData\.mode \|\| '(\w+)';/)?.[1];
  const routed = [...body.matchAll(/if \(mode === '(\w+)'\) return </g)].map((match) => match[1]);
  assert.ok(fallback, 'router reads questionData.mode with a default');
  assert.ok(routed.length > 0, 'router has explicit views');
  return { fallback, routed };
})();
const componentMode = (question) => {
  const mode = question.mode || componentRouting.fallback;
  return componentRouting.routed.includes(mode) ? mode : componentRouting.fallback;
};

test('every mode the screen routes to is declared shared-server, contract v1, default Analyze', () => {
  assert.equal(GRADING_MANIFEST.sequenceExplorer, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, componentRouting.fallback);
  assert.deepEqual(
    Object.keys(declaration.modes).sort(),
    [componentRouting.fallback, ...componentRouting.routed].sort(),
    'the declaration names exactly the views the component renders',
  );
  for (const [mode, entry] of Object.entries(declaration.modes)) {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, `${mode} is shared-server`);
    assert.equal(entry.blocker, null);
  }
  assert.deepEqual(Object.keys(sequenceExplorerGrader.modeGraders).sort(), Object.keys(declaration.modes).sort());
});

test('declared mode resolution reproduces the screen routing, including padded, mis-cased and non-string modes', () => {
  const samples = [
    {}, { mode: '' }, { mode: null }, { mode: 'analyze' }, { mode: 'ruleBridge' }, { mode: 'fullBridge' },
    { mode: 'missingTerm' }, { mode: 'partialSum' }, { mode: 'compare' }, { mode: 'unknownView' },
    { mode: ' compare ' }, { mode: 'Compare' }, { mode: 'fullbridge' }, { mode: 5 }, { mode: ['compare'] },
    { mode: { toString: () => 'compare' } }, { mode: 'constructor' }, { mode: 'toString' },
  ];
  for (const question of samples) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `mode ${JSON.stringify(question.mode)}`);
  }
  // A padded mode the manifest's generic fallback would have trimmed into
  // `compare` is graded as the Analyze screen the student actually saw.
  const padded = grade(q({ mode: ' compare ' }), { kindAnswer: 'arithmetic', changeAnswer: '1', termAnswer: '8' });
  assert.equal(padded.mode, 'analyze');
  assert.equal(padded.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* the component is wired to the shared grader and nothing else        */
/* ------------------------------------------------------------------ */

const VIEWS = {
  analyze: 'AnalyzeSequence',
  fullBridge: 'FullSequenceBridge',
  ruleBridge: 'RuleBridge',
  missingTerm: 'MissingTerm',
  partialSum: 'PartialSum',
  compare: 'CompareSequences',
};

test('every view grades its Check through the shared grader and reports the same work it submits', () => {
  assert.match(code, /import sequenceExplorerGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/sequenceExplorer\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  for (const [mode, name] of Object.entries(VIEWS)) {
    const body = region(code, `function ${name}(`, '\nfunction ', name);
    const check = region(body, 'const check = () => {', '\n  };', `${name} check`);
    assert.match(body, /const work = \{/, `${name} builds work at render scope`);
    assert.match(body, /useReportToolWork\(work\);/, `${name} reports live work`);
    assert.match(check, /const result = gradeToolCheck\(sequenceExplorerGrader, questionData, work\);/, `${name} grades through the shared grader`);
    assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{[^}]*mode: '(\w+)'/, `${name} submits the shared verdict with its work`);
    assert.equal(check.match(/mode: '(\w+)'/)[1], mode, `${name} reports the mode the declaration grades it as`);
    assert.match(check, /parts: result\.parts/, `${name} reports the shared parts`);
    // No verdict of its own, and no key material in the metadata.
    assert.doesNotMatch(check, /checks|matchesNumber|matches\w*Rule|pointSetMatchesRows|===|spec\.|expected/, `${name} computes no verdict of its own`);
  }
});

test('the inline verdict code is gone from the component', () => {
  assert.doesNotMatch(code, /from 'mathjs'/, 'rule sampling lives in the shared grader');
  assert.doesNotMatch(code, /matchesNumericAnswer|pointSetMatchesRows|matchesExplicitRule|matchesRecursiveRule|expressionMatchesSamples/);
  assert.doesNotMatch(code, /isCorrect: (?:safe)?[cC]hecks/);
});

/* ------------------------------------------------------------------ */
/* analyze                                                             */
/* ------------------------------------------------------------------ */

const ANALYZE = q({ mode: 'analyze', sequence: { kind: 'arithmetic', first: 7, difference: 4 }, targetN: 8 });

test('analyze: correct, equivalent forms, partial credit, incomplete', () => {
  const correct = grade(ANALYZE, { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '35' });
  assert.equal(correct.graded, true);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.equal(correct.score, 1);
  assert.deepEqual(partIds(correct), ['kind', 'change', 'term']);
  // Labels never depend on the key — the family is an answer, so a geometric
  // question's parts are labelled exactly like an arithmetic one's.
  const geometricLabels = grade(q({ ...ANALYZE, sequence: { kind: 'geometric', first: 7, ratio: 4 } }), {}).parts.map((part) => part.label);
  assert.deepEqual(correct.parts.map((part) => part.label), geometricLabels);
  assert.ok(correct.parts.every((part) => !/arithmetic|geometric/i.test(part.label)));

  for (const changeAnswer of ['8/2', ' 4 ', '4.0005', '+4']) {
    assert.equal(grade(ANALYZE, { kindAnswer: 'arithmetic', changeAnswer, termAnswer: '35.004' }).isCorrect, true, changeAnswer);
  }
  // The change tolerance is 0.001; the term tolerance is 0.01.
  assert.deepEqual(failedIds(grade(ANALYZE, { kindAnswer: 'arithmetic', changeAnswer: '4.01', termAnswer: '35.02' })), ['change', 'term']);

  const partial = grade(ANALYZE, { kindAnswer: 'geometric', changeAnswer: '4', termAnswer: '35' });
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.isComplete, true);
  assert.equal(partial.score, 2 / 3);
  assert.deepEqual(failedIds(partial), ['kind']);

  const incomplete = grade(ANALYZE, { kindAnswer: 'arithmetic', changeAnswer: '', termAnswer: '35' });
  assert.equal(incomplete.isComplete, false);
  assert.equal(incomplete.isCorrect, false);
  assert.equal(incomplete.score, 2 / 3, 'an explicit Check on incomplete work is still graded');
  assert.equal(grade(ANALYZE, {}).score, 0);
});

test('analyze: geometric fractions, unicode minus, the `change` alias and top-level kind', () => {
  const geometric = q({ mode: 'analyze', sequence: { kind: 'geometric', first: 3, ratio: 0.5 }, targetN: 6 });
  assert.equal(grade(geometric, { kindAnswer: 'geometric', changeAnswer: '1/2', termAnswer: '3/32' }).isCorrect, true);
  assert.equal(grade(geometric, { kindAnswer: 'geometric', changeAnswer: '0.5', termAnswer: '0.09375' }).isCorrect, true);

  const alias = q({ mode: 'analyze', sequence: { kind: 'arithmetic', first: 10, change: -3 }, targetN: 5 });
  assert.equal(grade(alias, { kindAnswer: 'arithmetic', changeAnswer: '−3', termAnswer: '−2' }).isCorrect, true);

  // A top-level kind with no authored ratio: 1, 2, 4, ... (ratio defaults to 2).
  const topLevel = q({ kind: 'geometric' });
  assert.equal(grade(topLevel, { kindAnswer: 'geometric', changeAnswer: '2', termAnswer: '128' }).isCorrect, true);
});

test('analyze: an unauthored question grades against the screen defaults (1, 2, 3, ... and a₈)', () => {
  const result = grade(q({}), { kindAnswer: 'arithmetic', changeAnswer: '1', termAnswer: '8' });
  assert.equal(result.mode, 'analyze');
  assert.equal(result.isCorrect, true);
  assert.equal(result.parts.find((part) => part.id === 'term').label, 'a8');
});

/* ------------------------------------------------------------------ */
/* ruleBridge                                                          */
/* ------------------------------------------------------------------ */

const RULES_ARITHMETIC = q({ mode: 'ruleBridge', sequence: { kind: 'arithmetic', first: 3, difference: 4 } });
const RULES_GEOMETRIC = q({ mode: 'ruleBridge', sequence: { kind: 'geometric', first: 5, ratio: 3 } });

test('ruleBridge: every equivalent way of writing the explicit and recursive rules is accepted', () => {
  const explicitForms = ['aₙ = 3 + (n − 1)(4)', '4n - 1', '4n−1', 'a_n=4(n-1)+3', '3 + 4(n - 1)', '-1 + 4n'];
  const recursiveForms = ['a_{n-1} + 4', 'aₙ = aₙ₋₁ + 4', 'a(n-1)+4', 'a[n-1] + 4', '4 + a_{n-1}', 'aₙ₋₁ − (−4)'];
  explicitForms.forEach((explicitRule, index) => {
    const result = grade(RULES_ARITHMETIC, { explicitRule, recursiveFirst: '3', recursiveRule: recursiveForms[index] });
    assert.equal(result.isCorrect, true, `${explicitRule} / ${recursiveForms[index]}`);
    assert.equal(result.score, 1);
  });

  for (const [explicitRule, recursiveRule] of [
    ['5*3^(n-1)', '3a_{n-1}'],
    ['5(3)^(n−1)', 'aₙ₋₁ * 3'],
    ['aₙ = 5·3^(n-1)', '3·aₙ₋₁'],
    ['(5/3)*3^n', 'a(n-1)*3'],
  ]) {
    assert.equal(grade(RULES_GEOMETRIC, { explicitRule, recursiveFirst: '5', recursiveRule }).isCorrect, true, `${explicitRule} / ${recursiveRule}`);
  }
});

test('ruleBridge: wrong rules, partial credit and blanks', () => {
  const wrongExplicit = grade(RULES_ARITHMETIC, { explicitRule: '4n + 3', recursiveFirst: '3', recursiveRule: 'a_{n-1} + 4' });
  assert.deepEqual(failedIds(wrongExplicit), ['explicit-rule']);
  assert.equal(wrongExplicit.score, 2 / 3);

  const wrongRecursive = grade(RULES_ARITHMETIC, { explicitRule: '4n - 1', recursiveFirst: '4', recursiveRule: 'a_{n-1} * 4' });
  assert.deepEqual(failedIds(wrongRecursive), ['recursive-first', 'recursive-rule']);
  assert.equal(wrongRecursive.score, 1 / 3);

  // A geometric rule written additively, and an explicit rule that only
  // matches the first terms, are both wrong.
  assert.equal(matchesRecursiveRule('a_{n-1} + 3', { kind: 'geometric', first: 5, ratio: 3 }), false);
  assert.equal(matchesExplicitRule('5 + 10(n-1)', { kind: 'geometric', first: 5, ratio: 3 }), false);
  assert.equal(matchesExplicitRule('n + junk', { kind: 'arithmetic', first: 1, difference: 1 }), false);

  const blank = grade(RULES_ARITHMETIC, { explicitRule: '', recursiveFirst: '3', recursiveRule: '  ' });
  assert.equal(blank.isComplete, false);
  assert.deepEqual(failedIds(blank), ['explicit-rule', 'recursive-rule']);
});

test('ruleBridge: an unauthored question grades against aₙ = n', () => {
  const result = grade(q({ mode: 'ruleBridge' }), { explicitRule: 'n', recursiveFirst: '1', recursiveRule: 'a_{n-1} + 1' });
  assert.equal(result.isCorrect, true);
});

test('a typed rule is evaluated only as a scalar expression (server memory and shared-state guard)', () => {
  const spec = { kind: 'arithmetic', first: 1, difference: 1 };
  // Every scalar spelling of a rule still matches: operators, brackets,
  // implicit products, powers, and a ternary (whose ":" is not a range).
  for (const rule of ['n', '(n)', '2n - n', 'n^1', '-(-n)', 'n > 0 ? n : 0', '1 + (n - 1)1']) {
    assert.equal(matchesExplicitRule(rule, spec), true, rule);
  }
  // Lookups into a typed list did evaluate to n, and the old inline check
  // accepted them. They are refused now: a matrix, a range, an object or an
  // accessor call is never a sequence term, and each is a way for a short
  // string to allocate on the server.
  for (const rule of ['(1:10)[n]', '[1,2,3,4,5,6,7,8][n]', '[n][1]', '{a:n}["a"]', '{a:abs}["a"](n)', 'q=x=n', '0;n']) {
    assert.equal(matchesExplicitRule(rule, spec), false, rule);
  }
  assert.equal(matchesRecursiveRule('[p][1] + 1', spec), false);

  const started = Date.now();
  assert.equal(matchesExplicitRule('1:20000000', spec), false);
  assert.equal(matchesRecursiveRule('p + 0*(1:20000000)', spec), false);
  // `name(` is read as `name*(`, but a call through an accessor is not, so
  // the guard — not the normalizer — is what keeps zeros() from running.
  assert.equal(matchesExplicitRule('{a:zeros}["a"](2000,2000)', spec), false);
  assert.equal(matchesExplicitRule('[zeros][1](2000,2000)', spec), false);
  // An index assignment resizes a matrix to whatever the student types.
  assert.equal(matchesExplicitRule('q=x=[1];x[2000,2000]=1', spec), false);
  assert.ok(Date.now() - started < 1000, 'refused without building millions of entries');
  assert.equal(matchesExplicitRule('createUnit("n")', spec), false);
  assert.equal(matchesExplicitRule('sqrt(n^2)', spec), false);
});

test('one student\'s typed rule cannot change how the server grades the next one', () => {
  // The server grades on one process-wide mathjs instance. Through an accessor
  // call, createUnit would register a unit there, and a later rule written
  // with that name would start to evaluate — a verdict changed by someone
  // else's submission. A known unit shows the probe itself works.
  const spec = { kind: 'arithmetic', first: 1, difference: 1 };
  assert.equal(matchesExplicitRule('n*(cm/cm)', spec), true, 'control: a defined unit divides out');
  assert.equal(matchesExplicitRule('n*(seqguardunit/seqguardunit)', spec), false);
  for (const attack of ['{a:createUnit}["a"]("seqguardunit")', '[createUnit][1]("seqguardunit")']) {
    assert.equal(grade(RULES_ARITHMETIC, { explicitRule: attack, recursiveFirst: '3', recursiveRule: 'a_{n-1} + 4' }).isCorrect, false);
  }
  assert.equal(matchesExplicitRule('n*(seqguardunit/seqguardunit)', spec), false, 'no unit was created');
});

/* ------------------------------------------------------------------ */
/* fullBridge                                                          */
/* ------------------------------------------------------------------ */

const ALL_ACTIONS = ['buildSequenceTable', 'plotSequence', 'analyzeSequence', 'writeRecursive', 'writeExplicit', 'findSequenceTerm'];
const BRIDGE = q({
  mode: 'fullBridge',
  studentActions: ALL_ACTIONS,
  sequence: { kind: 'arithmetic', first: 125, difference: 18 },
  displayCount: 6,
  targetN: 36,
});
const BRIDGE_ROWS = generateSequence({ kind: 'arithmetic', first: 125, difference: 18 }, 6);
const bridgeWork = (overrides = {}) => ({
  tableValues: BRIDGE_ROWS.map((row) => String(row.value)),
  plottedPoints: BRIDGE_ROWS.map((row) => [row.n, row.value]),
  kindAnswer: 'arithmetic',
  changeAnswer: '18',
  explicitRule: '18n + 107',
  recursiveFirst: '125',
  recursiveRule: 'a_{n-1} + 18',
  termAnswer: '755',
  ...overrides,
});

test('fullBridge: the complete connected model is correct, one check per required action', () => {
  assert.equal(fullBridgeTermCount(BRIDGE), 6);
  const result = grade(BRIDGE, bridgeWork());
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.deepEqual(partIds(result), ['table', 'plot', 'kind', 'change', 'explicit-rule', 'recursive-first', 'recursive-rule', 'term']);

  // Plotted points in any order; one wrong cell costs one of eight checks.
  assert.equal(grade(BRIDGE, bridgeWork({ plottedPoints: [...bridgeWork().plottedPoints].reverse() })).isCorrect, true);
  const oneCell = grade(BRIDGE, bridgeWork({ tableValues: ['125', '143', '161', '180', '197', '215'] }));
  assert.deepEqual(failedIds(oneCell), ['table']);
  assert.equal(oneCell.score, 7 / 8);
});

test('fullBridge: only the required actions are graded', () => {
  const tableAndTerm = q({ ...BRIDGE, studentActions: ['buildSequenceTable', 'findSequenceTerm'] });
  const result = grade(tableAndTerm, bridgeWork({ plottedPoints: [], explicitRule: 'nonsense', kindAnswer: '' }));
  assert.deepEqual(partIds(result), ['table', 'term']);
  assert.equal(result.isCorrect, true);
  // findSequenceTerm with no positive target is not asked.
  assert.deepEqual(partIds(grade(q({ ...BRIDGE, studentActions: ['findSequenceTerm'], targetN: 0 }), bridgeWork())), ['model']);
});

test('fullBridge: plotted graphs must have one point per term, within the snap tolerance', () => {
  const missing = grade(BRIDGE, bridgeWork({ plottedPoints: bridgeWork().plottedPoints.slice(0, 5) }));
  assert.deepEqual(failedIds(missing), ['plot']);
  assert.equal(missing.isComplete, false);
  // Integer terms snap to 1, so a point may sit up to 1/3 away.
  const nudged = bridgeWork().plottedPoints.map(([n, value]) => [n, value + 0.3]);
  assert.equal(grade(BRIDGE, bridgeWork({ plottedPoints: nudged })).isCorrect, true);
  const off = bridgeWork().plottedPoints.map(([n, value], index) => [n, index === 2 ? value + 0.5 : value]);
  assert.deepEqual(failedIds(grade(BRIDGE, bridgeWork({ plottedPoints: off }))), ['plot']);
  // An authored snap step widens the tolerance to snap / 3.
  const coarse = q({ ...BRIDGE, plotSnapStep: 3 });
  assert.equal(grade(coarse, bridgeWork({ plottedPoints: off })).isCorrect, true);
  // A duplicated point never stands in for a missing term.
  const doubled = [...bridgeWork().plottedPoints.slice(0, 5), bridgeWork().plottedPoints[0]];
  assert.deepEqual(failedIds(grade(BRIDGE, bridgeWork({ plottedPoints: doubled }))), ['plot']);
});

test('fullBridge: a table must answer every row on screen (stale or emptied drafts no longer pass)', () => {
  // BEFORE: `tableValues.every(...)` walked the student's array, so an empty
  // table passed the table check vacuously and a longer one threw.
  // AFTER: every row on screen is read; a missing box is blank.
  const tableOnly = q({ ...BRIDGE, studentActions: ['buildSequenceTable'] });
  const empty = grade(tableOnly, bridgeWork({ tableValues: [] }));
  assert.equal(empty.isCorrect, false);
  assert.equal(empty.isComplete, false);
  const short = grade(tableOnly, bridgeWork({ tableValues: ['125', '143', '161'] }));
  assert.equal(short.isCorrect, false);
  assert.equal(short.isComplete, false);
  const long = grade(tableOnly, bridgeWork({ tableValues: [...bridgeWork().tableValues, '233', 'junk'] }));
  assert.equal(long.graded, true);
  assert.equal(long.isCorrect, true, 'a value past the last row is not on screen and is not read');
  // A short draft is never a trap: typing in any box rebuilds the table with
  // one entry per row on screen, so every row the grader reads can be filled.
  const body = region(code, 'function FullSequenceBridge(', '\nfunction ', 'FullSequenceBridge');
  assert.match(body, /value=\{tableValues\[index\] \?\? ''\}/);
  assert.match(body, /onChange=\{\(event\) => setTableValues\(\(current\) => rows\.map\(\(_row, valueIndex\) => \(\s*valueIndex === index \? event\.target\.value : \(current\?\.\[valueIndex\] \?\? ''\)/);
});

test('fullBridge: an unauthored model requires nothing and is marked as one failed check', () => {
  const result = grade(q({ mode: 'fullBridge' }), bridgeWork());
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  assert.equal(result.isComplete, false, 'nothing for a deadline to auto-submit');
  assert.deepEqual(partIds(result), ['model']);
});

test('fullBridge: evidence stops before the target, and the rows graded are the rows shown', () => {
  // displayCount 9 is capped at 8 terms; target 5 stops the table at a₄.
  assert.equal(fullBridgeTermCount(q({ ...BRIDGE, displayCount: 9, targetN: 5 })), 4);
  assert.equal(fullBridgeTermCount(q({ ...BRIDGE, displayCount: 9, targetN: 5, revealTargetTerm: true })), 8);
  assert.equal(fullBridgeTermCount(q({ mode: 'fullBridge' })), 5);
  const four = q({ ...BRIDGE, displayCount: 9, targetN: 5, studentActions: ['buildSequenceTable', 'plotSequence'] });
  const rows = BRIDGE_ROWS.slice(0, 4);
  const result = grade(four, { tableValues: rows.map((row) => String(row.value)), plottedPoints: rows.map((row) => [row.n, row.value]) });
  assert.equal(result.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* missingTerm and partialSum                                          */
/* ------------------------------------------------------------------ */

test('missingTerm: the gap and the family, half credit each', () => {
  const question = q({ mode: 'missingTerm', sequence: { kind: 'geometric', first: 2, ratio: 3 }, missingIndex: 3 });
  assert.equal(grade(question, { termAnswer: '18', kindAnswer: 'geometric' }).isCorrect, true);
  assert.equal(grade(question, { termAnswer: '54/3', kindAnswer: 'geometric' }).isCorrect, true);
  const half = grade(question, { termAnswer: '18', kindAnswer: 'arithmetic' });
  assert.equal(half.score, 0.5);
  assert.deepEqual(failedIds(half), ['kind']);
  const blank = grade(question, { termAnswer: '', kindAnswer: 'geometric' });
  assert.equal(blank.isComplete, false);
  assert.equal(blank.score, 0.5);
  // Unauthored: 1, 2, 3, ? with the gap at a₄.
  assert.equal(grade(q({ mode: 'missingTerm' }), { termAnswer: '4', kindAnswer: 'arithmetic' }).isCorrect, true);
});

test('missingTerm: a question the screen cannot draw is never graded', () => {
  // The screen shows missingTermCount() terms and fails to render when that is
  // not a whole number; tampered work for such a question earns nothing.
  assert.equal(missingTermCount(q({ mode: 'missingTerm' })), 7);
  assert.equal(missingTermCount(q({ mode: 'missingTerm', missingIndex: 9 })), 10);
  assert.equal(missingTermCount(q({ mode: 'missingTerm', displayCount: 3, missingIndex: 2 })), 6, 'never fewer than six terms');
  for (const displayCount of [7.5, 'seven']) {
    const broken = grade(q({ mode: 'missingTerm', displayCount }), { termAnswer: '4', kindAnswer: 'arithmetic' });
    assert.equal(broken.graded, false, `displayCount ${displayCount}`);
    assert.equal(broken.isCorrect, false);
    assert.equal(broken.score, 0);
  }
  assert.equal(grade(q({ mode: 'missingTerm', displayCount: 12 }), { termAnswer: '4', kindAnswer: 'arithmetic' }).isCorrect, true);
  const body = region(code, 'function MissingTerm(', '\nfunction ', 'MissingTerm');
  assert.match(body, /const count = missingTermCount\(questionData\);\s*const rows = generateSequence\(spec, count\);/, 'the screen draws the count the grader checks');
});

test('partialSum: last term and Sₙ, for arithmetic, geometric and ratio-1 sequences', () => {
  const arithmetic = q({ mode: 'partialSum', sequence: { kind: 'arithmetic', first: 3, difference: 2 }, sumN: 5 });
  assert.equal(grade(arithmetic, { lastTerm: '11', sumAnswer: '35' }).isCorrect, true);
  const geometric = q({ mode: 'partialSum', sequence: { kind: 'geometric', first: 3, ratio: 2 }, sumN: 5 });
  assert.equal(grade(geometric, { lastTerm: '48', sumAnswer: '93' }).isCorrect, true);
  const halves = q({ mode: 'partialSum', sequence: { kind: 'geometric', first: 1, ratio: 0.5 }, sumN: 3 });
  assert.equal(grade(halves, { lastTerm: '1/4', sumAnswer: '7/4' }).isCorrect, true);
  assert.equal(grade(halves, { lastTerm: '0.25', sumAnswer: '1.75' }).isCorrect, true);
  const flat = q({ mode: 'partialSum', sequence: { kind: 'geometric', first: 4, ratio: 1 }, sumN: 6 });
  assert.equal(grade(flat, { lastTerm: '4', sumAnswer: '24' }).isCorrect, true);

  const half = grade(geometric, { lastTerm: '96', sumAnswer: '93' });
  assert.deepEqual(failedIds(half), ['last-term']);
  assert.equal(half.score, 0.5);
  // Unauthored: S₆ of 1, 2, 3, ...
  assert.equal(grade(q({ mode: 'partialSum' }), { lastTerm: '6', sumAnswer: '21' }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* compare                                                             */
/* ------------------------------------------------------------------ */

const PLOTTED = q({
  mode: 'compare',
  studentActions: ['plotSequence', 'compareSequences'],
  left: { kind: 'arithmetic', first: 2, difference: 5 },
  right: { kind: 'geometric', first: 2, ratio: 2 },
  displayCount: 7,
  compareN: 7,
});
const plotted = (spec, count = 7) => generateSequence(spec, count).map((row) => [row.n, row.value]);

test('compare: the larger term and the absolute difference, with unauthored defaults', () => {
  // Unauthored: 3, 7, 11, ... against 1, 2, 4, ... at n = 7 → 27 vs 64.
  const defaults = grade(q({ mode: 'compare' }), { relation: 'B', difference: '37', leftPlottedPoints: [], rightPlottedPoints: [] });
  assert.equal(defaults.isCorrect, true);
  assert.deepEqual(partIds(defaults), ['relation', 'difference']);
  const half = grade(q({ mode: 'compare' }), { relation: 'A', difference: '37' });
  assert.deepEqual(failedIds(half), ['relation']);
  assert.equal(half.score, 0.5);

  for (const difference of ['74/2', ' 37 ', '37.004', '+37']) {
    assert.equal(grade(q({ mode: 'compare' }), { relation: 'B', difference }).isCorrect, true, difference);
  }
  assert.equal(grade(q({ mode: 'compare' }), { relation: 'B', difference: '-37' }).isCorrect, false, 'the difference is absolute');

  const tie = q({ mode: 'compare', left: { kind: 'arithmetic', first: 2, difference: 2 }, right: { kind: 'geometric', first: 2, ratio: 2 }, compareN: 2 });
  assert.equal(grade(tie, { relation: 'equal', difference: '0' }).isCorrect, true);
  assert.equal(grade(tie, { relation: 'A', difference: '0' }).isCorrect, false);
});

test('compare with plotting: both graphs are graded, each against its own sequence', () => {
  assert.equal(comparePlotCount(PLOTTED), 7);
  const left = plotted(PLOTTED.left);
  const right = plotted(PLOTTED.right);
  const correct = grade(PLOTTED, { relation: 'B', difference: '96', leftPlottedPoints: left, rightPlottedPoints: right });
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['plot-a', 'plot-b', 'relation', 'difference']);

  const swapped = grade(PLOTTED, { relation: 'B', difference: '96', leftPlottedPoints: right, rightPlottedPoints: left });
  assert.deepEqual(failedIds(swapped), ['plot-a', 'plot-b']);
  assert.equal(swapped.score, 0.5);

  const noRight = grade(PLOTTED, { relation: 'B', difference: '96', leftPlottedPoints: left, rightPlottedPoints: [] });
  assert.deepEqual(failedIds(noRight), ['plot-b']);
  assert.equal(noRight.score, 0.75);
  assert.equal(noRight.isComplete, false);

  // Without displayCount the plot runs to min(compareN, 7) terms, at most 8.
  assert.equal(comparePlotCount(q({ ...PLOTTED, displayCount: undefined, compareN: 4 })), 4);
  assert.equal(comparePlotCount(q({ ...PLOTTED, displayCount: 12, compareN: 4 })), 8);
});

/* ------------------------------------------------------------------ */
/* tampering, malformed work, bounds                                   */
/* ------------------------------------------------------------------ */

test('injected verdicts and keys are dropped and never change the verdict', () => {
  const tampered = { kindAnswer: 'geometric', changeAnswer: '9', termAnswer: '0', isCorrect: true, score: 1, correct: true, expected: '35', answerKey: { termAnswer: '35' }, checks: [true, true, true] };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'checks', 'correct', 'expected', 'isCorrect', 'score'].sort());
  const result = grade(ANALYZE, tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);

  // Every mode: a claimed verdict changes nothing, for wrong and right work.
  const INJECTED = { isCorrect: true, score: 1, correct: true, passed: true, expected: '1', answerKey: {}, checks: [true], verdict: 'correct' };
  const MISSING = q({ mode: 'missingTerm', sequence: { kind: 'geometric', first: 2, ratio: 3 }, missingIndex: 3 });
  const SUM = q({ mode: 'partialSum', sequence: { kind: 'arithmetic', first: 3, difference: 2 }, sumN: 5 });
  for (const [question, work] of [
    [ANALYZE, { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '36' }],
    [RULES_ARITHMETIC, { explicitRule: '4n', recursiveFirst: '3', recursiveRule: 'a_{n-1} + 4' }],
    [BRIDGE, bridgeWork({ termAnswer: '0' })],
    [MISSING, { termAnswer: '19', kindAnswer: 'geometric' }],
    [SUM, { lastTerm: '11', sumAnswer: '36' }],
    [PLOTTED, { relation: 'A', difference: '96', leftPlottedPoints: plotted(PLOTTED.left), rightPlottedPoints: plotted(PLOTTED.right) }],
  ]) {
    const clean = grade(question, work);
    const claimed = grade(question, { ...work, ...INJECTED });
    assert.equal(clean.isCorrect, false, `${question.mode} control is wrong work`);
    assert.deepEqual(
      [claimed.isCorrect, claimed.isComplete, claimed.score, claimed.parts],
      [clean.isCorrect, clean.isComplete, clean.score, clean.parts],
      `${question.mode}: injected verdict ignored`,
    );
    assert.ok(clean.score > 0 && clean.score < 1, `${question.mode}: partial credit`);
  }
});

test('wrong types read as blank and never crash the grader', () => {
  const analyze = grade(ANALYZE, { kindAnswer: ['arithmetic'], changeAnswer: { value: 4 }, termAnswer: true });
  assert.equal(analyze.graded, true);
  assert.equal(analyze.isCorrect, false);
  assert.equal(analyze.isComplete, false);
  // A plain number is what a box would have held as text, and reads the same.
  assert.equal(grade(ANALYZE, { kindAnswer: 'arithmetic', changeAnswer: 4, termAnswer: 35 }).isCorrect, true);

  const bridge = grade(BRIDGE, { tableValues: 'abc', plottedPoints: { 0: [1, 125] }, explicitRule: 42, recursiveRule: ['a_{n-1}+18'] });
  assert.equal(bridge.graded, true);
  assert.equal(bridge.isCorrect, false);
  assert.equal(bridge.score, 0);

  const compare = grade(PLOTTED, { relation: 5, difference: null, leftPlottedPoints: [['x', 'y']], rightPlottedPoints: 'points' });
  assert.equal(compare.graded, true);
  assert.equal(compare.isCorrect, false);

  // A list that would stringify to the right answer is still not a typed box.
  const rules = grade(RULES_ARITHMETIC, { explicitRule: ['4n-1'], recursiveFirst: ['3'], recursiveRule: { rule: 'a_{n-1}+4' } });
  assert.deepEqual([rules.graded, rules.isCorrect, rules.isComplete, rules.score], [true, false, false, 0]);
  const missing = grade(q({ mode: 'missingTerm' }), { termAnswer: ['4'], kindAnswer: ['arithmetic'] });
  assert.deepEqual([missing.graded, missing.score], [true, 0]);
  const sum = grade(q({ mode: 'partialSum' }), { lastTerm: { n: 6 }, sumAnswer: false });
  assert.deepEqual([sum.graded, sum.score, sum.isComplete], [true, 0, false]);
});

test('non-object and oversize work is not graded, on either path', () => {
  for (const work of [null, 'arithmetic', 35, ['arithmetic', '4', '35']]) {
    const result = grade(ANALYZE, work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
  const oversize = grade(BRIDGE, bridgeWork({ tableValues: Array.from({ length: 60 }, () => '9'.repeat(900)) }));
  assert.equal(oversize.graded, false);
  assert.equal(oversize.serverReason, 'oversize-response');
});

test('realistic maximal work stays inside the response bounds with nothing dropped', () => {
  const longRule = `${'(n - 1)*18 + '.repeat(8)}125 - 7*18*(n - 1)`;
  const eight = q({ ...BRIDGE, displayCount: 8, targetN: 40 });
  const rows = generateSequence(BRIDGE.sequence, fullBridgeTermCount(eight));
  assert.equal(rows.length, 8);
  const maximal = {
    tableValues: rows.map((row) => `${row.value}.0000000`),
    plottedPoints: rows.map((row) => [row.n, row.value + 0.123456789]),
    kindAnswer: 'arithmetic',
    changeAnswer: '36/2',
    explicitRule: `aₙ = ${longRule}`,
    recursiveFirst: '125.000',
    recursiveRule: `aₙ = aₙ₋₁ + ${'(9 + 9) - 18 + '.repeat(6)}18`,
    termAnswer: '827',
  };
  const compareMaximal = {
    relation: 'B',
    difference: '96.000000',
    leftPlottedPoints: plotted(PLOTTED.left, 8).map(([n, value]) => [n, value + 0.123456789]),
    rightPlottedPoints: plotted(PLOTTED.right, 8).map(([n, value]) => [n, value + 0.123456789]),
  };
  for (const work of [maximal, compareMaximal]) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, []);
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 10);
  }
  const result = grade(eight, maximal);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, true, 'the long but equivalent rules are still read as rules');

  // Every mode's ordinary work carries no key that the contract strips.
  for (const work of [
    { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '35' },
    { explicitRule: '4n-1', recursiveFirst: '3', recursiveRule: 'a_{n-1}+4' },
    bridgeWork(),
    { termAnswer: '18', kindAnswer: 'geometric' },
    { lastTerm: '11', sumAnswer: '35' },
    { relation: 'B', difference: '96', leftPlottedPoints: [], rightPlottedPoints: [] },
  ]) {
    assert.deepEqual(boundToolWork(work).dropped, []);
  }
});

/* ------------------------------------------------------------------ */
/* discrimination: the key decides                                     */
/* ------------------------------------------------------------------ */

test('correct work fails against a question whose key was altered', () => {
  const cases = [
    [ANALYZE, { ...ANALYZE, sequence: { ...ANALYZE.sequence, difference: 5 } }, { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '35' }],
    [ANALYZE, { ...ANALYZE, targetN: 9 }, { kindAnswer: 'arithmetic', changeAnswer: '4', termAnswer: '35' }],
    [RULES_ARITHMETIC, { ...RULES_ARITHMETIC, sequence: { kind: 'arithmetic', first: 4, difference: 4 } }, { explicitRule: '4n-1', recursiveFirst: '3', recursiveRule: 'a_{n-1}+4' }],
    [BRIDGE, { ...BRIDGE, sequence: { kind: 'arithmetic', first: 125, difference: 17 } }, bridgeWork()],
    [q({ mode: 'missingTerm', sequence: { kind: 'geometric', first: 2, ratio: 3 }, missingIndex: 3 }), q({ mode: 'missingTerm', sequence: { kind: 'geometric', first: 2, ratio: 3 }, missingIndex: 4 }), { termAnswer: '18', kindAnswer: 'geometric' }],
    [q({ mode: 'partialSum', sequence: { kind: 'arithmetic', first: 3, difference: 2 }, sumN: 5 }), q({ mode: 'partialSum', sequence: { kind: 'arithmetic', first: 3, difference: 2 }, sumN: 6 }), { lastTerm: '11', sumAnswer: '35' }],
    [PLOTTED, { ...PLOTTED, right: { kind: 'geometric', first: 2, ratio: 3 } }, { relation: 'B', difference: '96', leftPlottedPoints: plotted(PLOTTED.left), rightPlottedPoints: plotted(PLOTTED.right) }],
  ];
  for (const [question, altered, work] of cases) {
    assert.equal(grade(question, work).isCorrect, true, `${question.mode} control`);
    const result = grade(altered, work);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, `${question.mode} against an altered key`);
  }
});
