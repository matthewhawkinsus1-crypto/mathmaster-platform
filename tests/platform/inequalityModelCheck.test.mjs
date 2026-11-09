/*
 * "GRAPH THESE CONSTRAINTS" CHECKS THE MODEL AGAINST THE SITUATION
 * (F-SW-CHECKS-OWN-MODEL, PR #537 walkthrough).
 *
 * A student who wrote 2x + 3y ≤ 20 for "at least 20 points" was sent on to the
 * graph, heard ✓ at every step about the wrong half-plane — "Every constraint
 * checks out" — and was told only at Submit, without a reason. Where outcomes
 * are shown, the button is now the model's Check (inequalityModelCheck.js):
 *
 *   - each row's verdict is the shared grader's "Modeled constraint N" part,
 *     so every model the grader accepts passes here and no other does;
 *   - a wrong symbol is told what the situation's words mean, and the symbol;
 *   - wrong coefficients or a wrong constant get an honest line, never the
 *     numbers;
 *   - a DOL, quiz or test is unchanged: the model is sent as written;
 *   - grading is unchanged: the walkthrough's work still earns what it did.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnoseModelRows,
  modelRowMessage,
  modelRowVerdicts,
  situationConstraint,
  situationWords,
} from '../../src/tools/systemsWorkspace/inequalityModelCheck.js';
import { resolveInequalityBuildGate } from '../../src/tools/systemsWorkspace/inequalityBuildPolicy.js';
import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// The walkthrough's item (L4 CW 2) and two systems, as the lessons author them.
const KAI = {
  type: 'systemsWorkspace',
  mode: 'inequalities',
  questionId: 'm3t2l4-cw-2',
  prompt: 'Coach Garcia is analyzing the scoring patterns of players on his basketball team. Kai averages 20 points per game from two-point and three-point shots. Let x be the number of two-point shots and y the number of three-point shots. Coach Garcia believes the team can win the district playoffs if Kai scores AT LEAST 20 points per game. Write the inequality in the tool, then graph it: build the boundary line, choose solid or dashed, and shade the half-plane of combinations that meet the goal. Then test the point (6, 4).',
  modeling: { variables: [{ symbol: 'x', label: 'two-point shots' }, { symbol: 'y', label: 'three-point shots' }], expectedConstraints: [{ A: 2, B: 3, C: -20, relation: '>=' }] },
  studentBuild: { rewrite: false, boundary: true, lineStyle: true, shading: true },
  reasoning: { testPoint: true, classifyRegion: false, vertices: false },
  testPoint: { x: 6, y: 4 },
  graph: { xMin: 0, xMax: 12, yMin: 0, yMax: 10 },
};
const NOAH = {
  type: 'systemsWorkspace',
  mode: 'inequalities',
  prompt: 'Graph Noah’s system. Noah guides groups of adults and children down a river. His raft holds 800 pounds; more weight can make it sink, hit more rocks or maneuver more slowly. Each adult weighs about 200 pounds and each child about 100 pounds. Noah charges adults $75 and children $50, and his goal is to earn at least $150 each trip. Let x be the number of adults and y the number of children. Test the marked point (2, 2), then choose a point of your own in the overlap.',
  modeling: { variables: [{ symbol: 'x', label: 'adults' }, { symbol: 'y', label: 'children' }], expectedConstraints: [{ A: 200, B: 100, C: -800, relation: '<=' }, { A: 75, B: 50, C: -150, relation: '>=' }] },
  studentBuild: { rewrite: false, boundary: true, lineStyle: true, shading: true },
};
const KIM = {
  type: 'systemsWorkspace',
  mode: 'inequalities',
  prompt: 'Kim tutors for $15 an hour and lifeguards for $10 an hour. She can work at most 20 hours a week and wants to earn at least $240. Let x be her tutoring hours and y her lifeguarding hours. Enter the model in the tool and graph it. Test the marked point (6, 12), then choose a solution of your own.',
  modeling: { variables: [{ symbol: 'x', label: 'tutoring hours' }, { symbol: 'y', label: 'lifeguarding hours' }], expectedConstraints: [{ A: 1, B: 1, C: -20, relation: '<=' }, { A: 15, B: 10, C: -240, relation: '>=' }] },
  studentBuild: { rewrite: false, boundary: true, lineStyle: true, shading: true },
};

const row = (coeffA, coeffB, relation, constant) => ({ coeffA: String(coeffA), coeffB: String(coeffB), relation, constant: String(constant) });
// The shared grader's verdict on each row — what Submit records.
const graderRows = (question, entries) => modelRowVerdicts(
  systemsWorkspaceGrader.grade(question, { build: [], modelingEntries: entries, modelingSent: true }).parts,
  entries.length,
);
// What the step says about each row, as the workspace builds it.
const lines = (question, entries, misses = 1) => {
  const expectedConstraints = question.modeling.expectedConstraints;
  const rowCorrect = graderRows(question, entries);
  return diagnoseModelRows({ entries, expectedConstraints, rowCorrect }).map((diagnosis, index) => modelRowMessage({
    diagnosis,
    row: entries[index],
    question,
    expected: expectedConstraints[diagnosis?.kind === 'relation' ? diagnosis.expectedIndex : index],
    misses,
    label: entries.length > 1 ? `Constraint ${index + 1}: ` : '',
  }));
};

test('every model the grader accepts passes the step, in any equivalent form, and says nothing', () => {
  const equivalent = {
    'as the situation says it': row(2, 3, '>=', 20),
    'both sides doubled': row(4, 6, '>=', 40),
    'both sides halved (decimals)': row(1, 1.5, '>=', 10),
    'every sign switched, the symbol turned round (20 ≤ 2x + 3y with the sides swapped)': row(-2, -3, '<=', -20),
    'both sides scaled by a tenth': row(0.2, 0.3, '>=', 2),
  };
  for (const [name, entry] of Object.entries(equivalent)) {
    assert.deepEqual(graderRows(KAI, [entry]), [true], `${name}: the grader accepts it`);
    assert.deepEqual(diagnoseModelRows({ entries: [entry], expectedConstraints: KAI.modeling.expectedConstraints, rowCorrect: [true] }), [null], name);
    assert.deepEqual(lines(KAI, [entry]), [null], `${name}: no line`);
  }
  // A system is a set: the rows in either order, each a multiple of its own.
  assert.deepEqual(graderRows(NOAH, [row(75, 50, '>=', 150), row(2, 1, '<=', 8)]), [true, true], 'rows in the other order');
  assert.deepEqual(lines(NOAH, [row(-3, -2, '<=', -6), row(200, 100, '<=', 800)]), [null, null], 'a negative multiple in a reordered system');
});

test('the model rows that are wrong are the rows the grader turns down — never more, never fewer', () => {
  const wrong = {
    '≤ for "at least"': row(2, 3, '<=', 20),
    '> for "at least"': row(2, 3, '>', 20),
    'every sign switched, the symbol not turned round': row(-2, -3, '>=', -20),
    'the coefficients swapped': row(3, 2, '>=', 20),
    'a wrong constant': row(2, 3, '>=', 24),
    'doubled on one side only': row(4, 6, '>=', 20),
  };
  for (const [name, entry] of Object.entries(wrong)) {
    assert.deepEqual(graderRows(KAI, [entry]), [false], `${name}: the grader turns it down`);
    assert.equal(typeof lines(KAI, [entry])[0], 'string', `${name}: and the step says why`);
  }
  // A duplicate of a right row cannot satisfy the other constraint (the grader matches a set).
  assert.deepEqual(graderRows(NOAH, [row(200, 100, '<=', 800), row(200, 100, '<=', 800)]), [true, false]);
});

test('a wrong symbol is told what the situation means, in the item’s own words, and the symbol', () => {
  assert.deepEqual(lines(KAI, [row(2, 3, '<=', 20)]), ['“At least 20 points” means 20 points or more: ≥.']);
  // Scaled, the line is the same: the symbol is about the situation, not the numbers.
  assert.deepEqual(lines(KAI, [row(4, 6, '<', 40)]), ['“At least 20 points” means 20 points or more: ≥.']);
  // The boundary itself is what ">" leaves out.
  assert.deepEqual(lines(KAI, [row(2, 3, '>', 20)]), ['“At least 20 points” means 20 points or more, so exactly 20 points counts too: ≥.']);
  // A row with every sign switched needs the situation's symbol turned round — said so.
  assert.deepEqual(lines(KAI, [row(-2, -3, '>=', -20)]), ['“At least 20 points” means 20 points or more. Your row has every sign switched, so it needs ≤.']);
  // In a system, each wrong row is named; a right one says nothing.
  assert.deepEqual(lines(KIM, [row(1, 1, '>=', 20), row(15, 10, '>=', 240)]), ['Constraint 1: “At most 20 hours” means 20 hours or less: ≤.', null]);
  assert.deepEqual(lines(KIM, [row(15, 10, '<=', 240), row(1, 1, '<=', 20)]), ['Constraint 1: “At least $240” means $240 or more: ≥.', null], 'matched to its own constraint, in any order');
  // Where the prompt has no phrase for it ("His raft holds 800 pounds"), the amount is named as the prompt writes it, unquoted.
  assert.deepEqual(lines(NOAH, [row(200, 100, '>=', 800), row(75, 50, '>=', 150)]), ['Constraint 1: In this situation the total must be 800 pounds or less: ≤.', null]);
});

test('wrong coefficients or a wrong constant get an honest line that gives no number away', () => {
  const first = lines(KAI, [row(3, 2, '>=', 20)])[0];
  assert.equal(first, 'This does not match the situation yet. Check each coefficient and the constant.');
  assert.equal(lines(KAI, [row(2, 3, '>=', 24)])[0], first, 'a first miss is the same neutral line either way');
  // A repeat narrows it down.
  assert.equal(lines(KAI, [row(3, 2, '>=', 20)], 2)[0], 'Check the coefficients of x and y against the situation.');
  assert.equal(lines(KAI, [row(2, 3, '>=', 24)], 2)[0], 'The x and y parts fit the situation, but the constant does not.');
  assert.equal(lines(KAI, [row(4, 6, '>=', 20)], 2)[0], 'The x and y parts fit the situation, but the constant does not.', 'scaled coefficients still fit');
  // A wrong relation on wrong coefficients is a coefficient problem first.
  assert.equal(lines(KAI, [row(3, 2, '<=', 20)], 2)[0], 'Check the coefficients of x and y against the situation.');
  // A duplicated right row is not "the wrong symbol" of a constraint already matched.
  assert.equal(lines(NOAH, [row(200, 100, '<=', 800), row(200, 100, '>=', 800)], 2)[1], 'Constraint 2: Check the coefficients of x and y against the situation.');
  for (const text of [first, lines(KAI, [row(3, 2, '>=', 20)], 2)[0], lines(KAI, [row(2, 3, '>=', 24)], 2)[0]]) {
    assert.doesNotMatch(text, /\d/, `no number in "${text}"`);
  }
});

test('the symbol a line names is one the grader accepts for that row', () => {
  // Every row that is some multiple of a constraint, with every symbol: when the
  // step names a symbol, that symbol makes the grader accept the row.
  const scales = [1, 2, 0.5, -1, -3];
  const relations = ['>=', '>', '<=', '<'];
  let named = 0;
  for (const question of [KAI, NOAH, KIM]) {
    const expected = question.modeling.expectedConstraints;
    expected.forEach((constraint, at) => {
      for (const scale of scales) {
        for (const relation of relations) {
          const entries = expected.map((other) => row(other.A, other.B, other.relation, -other.C));
          entries[at] = row(constraint.A * scale, constraint.B * scale, relation, -constraint.C * scale);
          const [diagnosis] = diagnoseModelRows({ entries: [entries[at]], expectedConstraints: [constraint], rowCorrect: graderRows({ ...question, modeling: { ...question.modeling, expectedConstraints: [constraint] } }, [entries[at]]) });
          if (!diagnosis) continue;
          assert.equal(diagnosis.kind, 'relation', `${question.prompt.slice(0, 20)} ×${scale} ${relation}`);
          named += 1;
          const fixed = [{ ...entries[at], relation: diagnosis.relation }];
          assert.deepEqual(graderRows({ ...question, modeling: { ...question.modeling, expectedConstraints: [constraint] } }, fixed), [true], `${relation} ×${scale}: the named ${diagnosis.relation} is accepted`);
        }
      }
    });
  }
  assert.ok(named > 20, `${named} wrong symbols were checked`);
});

test('the situation’s words: a phrase only where the prompt says it and it means that symbol', () => {
  assert.deepEqual(situationWords(KAI, KAI.modeling.expectedConstraints[0]), { phrase: 'At least 20 points', amount: '20 points' });
  assert.deepEqual(situationWords(KIM, KIM.modeling.expectedConstraints[1]), { phrase: 'At least $240', amount: '$240' });
  assert.deepEqual(situationWords(NOAH, NOAH.modeling.expectedConstraints[0]), { phrase: null, amount: '800 pounds' });
  // "at most 20" does not explain a "≥ 20" constraint, and "no more than" is not "more than".
  assert.deepEqual(situationWords({ prompt: 'Buy at most 20 apples.' }, { A: 1, B: 1, C: -20, relation: '>=' }), { phrase: null, amount: '20 apples' });
  assert.deepEqual(situationWords({ prompt: 'Spend no more than $30.' }, { A: 3, B: 5, C: -30, relation: '<=' }), { phrase: 'No more than $30', amount: '$30' });
  // A coordinate is never the amount, and an amount is matched as a number ($0.50 is not $50).
  assert.deepEqual(situationWords({ prompt: 'Test the point (40, 20). Each call costs $0.50, and the card holds $50.' }, { A: 0.2, B: 0.5, C: -50, relation: '<=' }), { phrase: null, amount: '$50' });
  assert.deepEqual(situationWords({ prompt: 'Test the point (40, 20) first. The bus holds 20 riders.' }, { A: 1, B: 1, C: -20, relation: '<=' }), { phrase: null, amount: '20 riders' });
  assert.deepEqual(situationWords({ prompt: 'Test the point (40, 20).' }, { A: 1, B: 1, C: -20, relation: '<=' }), { phrase: null, amount: '20' }, 'the bare number when the prompt has no amount');
  // A constraint stored with every sign switched still reads the situation's way.
  assert.deepEqual(situationConstraint({ A: -2, B: -3, C: 20, relation: '<=' }), { A: 2, B: 3, constant: 20, relation: '>=' });
  assert.deepEqual(situationWords(KAI, { A: -2, B: -3, C: 20, relation: '<=' }).phrase, 'At least 20 points');
});

test('where outcomes are withheld the model is sent as written; where shown, only once the grader accepts it', () => {
  const shown = resolveInequalityBuildGate({ showImmediateFeedback: true });
  const withheld = resolveInequalityBuildGate({ showImmediateFeedback: false });
  assert.equal(shown.modelAccepted({ sent: true, correct: false }), false, 'practice: a wrong model is not graphed');
  assert.equal(shown.modelAccepted({ sent: true, correct: true }), true);
  assert.equal(shown.modelAccepted({ sent: false, correct: true }), false, 'not before it is sent');
  assert.equal(withheld.modelAccepted({ sent: true, correct: false }), true, 'a DOL: right or wrong, a sent model is graphed');
  assert.equal(withheld.modelAccepted({ sent: true, correct: true }), true);
  assert.equal(withheld.modelAccepted({ sent: false, correct: true }), false);
});

test('grading is unchanged: the walkthrough’s work earns what it did, and the right model full credit', () => {
  // Kai with ≤, built and tested consistently with that model (as the walkthrough
  // did): the boundary through (10, 0) and (4, 4), solid, shaded below, and (6, 4)
  // judged against the student's own inequality. The model is wrong, the graph of
  // it is right (follow-through), the test point consistent: 3 of 4 parts.
  const build = [{ method: 'points', x1: 10, y1: 0, x2: 4, y2: 4, point1Plotted: true, point2Plotted: true, boundaryAttempts: 1, style: 'solid', styleAttempts: 1, shadePoint: [1, 1], shadeAttempts: 1 }];
  const answered = (verdict) => ({ overall: verdict, perInequality: [verdict], onBoundary: '', boundaryIncluded: '' });
  const walkthrough = systemsWorkspaceGrader.grade(KAI, { build, modelingEntries: [row(2, 3, '<=', 20)], modelingSent: true, regionClassification: '', teacherPointResponse: answered('no'), vertices: [] });
  assert.equal(walkthrough.isCorrect, false);
  assert.equal(walkthrough.score, 0.75);
  assert.deepEqual(Object.fromEntries(walkthrough.parts.map((part) => [part.id, part.isCorrect])), {
    'constraint-1': true, 'model-1': false, 'teacher-point-inequalities': true, 'teacher-point-system': true,
  });
  const right = systemsWorkspaceGrader.grade(KAI, { build: [{ ...build[0], shadePoint: [8, 8] }], modelingEntries: [row(2, 3, '>=', 20)], modelingSent: true, regionClassification: '', teacherPointResponse: answered('yes'), vertices: [] });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);
});

// ------------------------------------------------------- the screen is held to it
const mode = executableSource(componentSource('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx'));

test('the screen asks the shared grader, only where outcomes are shown, and graphs only an accepted model', () => {
  const verdicts = region(mode, 'const modelVerdicts = useMemo(() => (', '));', 'model verdicts');
  assert.match(verdicts, /modeling && buildGate\.verdictsShown\s*\?\s*modelRowVerdicts\(gradeToolCheck\(systemsWorkspaceGrader, questionData,/, 'the verdict is the grader\'s, asked only where outcomes are shown');
  assert.match(mode, /const modelAccepted = !modeling \|\| buildGate\.modelAccepted\(\{ sent: modelingSent, correct: modelVerdicts\.every\(\(verdict\) => verdict !== false\) \}\);/);
  assert.match(region(mode, 'const flowContext = {', '\n  };', 'flowContext'), /\n\s*modelingSent: modelAccepted,/, 'the steps after the model open only on an accepted one');
  const send = region(mode, 'const sendModel = () => {', '\n  };', 'sendModel');
  const held = send.indexOf('if (buildGate.verdictsShown && modelVerdicts.some((verdict) => verdict === false)) {');
  assert.ok(held > -1 && held < send.indexOf('setModelingSent(true);'), 'a wrong model is held before it is sent, and only where outcomes are shown');
  const said = region(mode, 'const modelLines = (() => {', '\n  })();', 'model lines');
  assert.ok(said.indexOf('if (!modeling || !buildGate.verdictsShown) return [];') === said.indexOf('if ('), 'nothing is said about the model where outcomes are withheld');
});
