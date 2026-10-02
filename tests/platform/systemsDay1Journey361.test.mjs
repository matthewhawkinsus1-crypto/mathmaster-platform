/*
 * ISSUE #361: THE DAY 1 3×3 LESSON AS ONE CONTINUOUS SYSTEMS WORKSPACE.
 *
 * A live student pass through the Day 1 assignment found the journey split
 * into pieces that did not look or behave alike: the 3×3 rounds used one
 * elimination interface and the reduced 2×2 — inside the same problem — used
 * another; finished work vanished into chips; the 2×2 called R₁/R₂ "Equation
 * 1/2" and showed a Verify step already ticked; the 2×2 previewed scaled terms
 * in its placeholders; the three-plane choices showed no selection. Each
 * contract below binds one of those fixes to the statement that enforces it.
 * The behaviour end to end, in a browser, is tests/browser/day1SystemsJourney.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { linearEquationForm, normalizeEquationForStepAlgebra, substituteIntoEquation } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
import { legibleCamera, planeFacing } from '../../src/tools/systemsWorkspace/threePlaneGeometry.js';
import { earnedResultCaption } from '../../src/tools/systemsWorkspace/spatialFeedback.js';

const elimination = executableSource(componentSource('src/tools/systemsWorkspace/EliminationReductionMode.jsx'));
const twoByTwo = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'));
const substitution3 = executableSource(componentSource('src/tools/systemsWorkspace/SubstitutionReductionMode.jsx'));
const methodChoice = executableSource(componentSource('src/tools/systemsWorkspace/Algebraic3SystemMode.jsx'));
const threePlanes = executableSource(componentSource('src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx'));
const workspace = executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
const stack = executableSource(componentSource('src/tools/systemsWorkspace/EliminationStack.jsx'));

/* ------------------------------------------- one elimination interface */

test('each 3×3 round is a stacked, column-aligned elimination with the 2×2\'s + / − rail beside the second row', () => {
  const board = region(elimination, 'function EliminationRoundBoard(', 'function ReducedEliminationSubsystem(', 'EliminationRoundBoard');
  // Both equations of the pair are rows of one stack, one column per variable.
  assert.match(board, /<div className="mathmaster-elim-stack"[^>]*>\s*<EliminationStackRow[\s\S]*?rowId=\{idA\}[\s\S]*?<EliminationStackRow[\s\S]*?rowId=\{idB\}[\s\S]*?opCell=\{opRail\}/);
  // The operation is chosen on the rail beside the second row — the shared control.
  assert.match(board, /<EliminationOperationRail[\s\S]*?onChoose=\{\(operation\) => apply\(setEliminationOperation\(elimination, roundKey, operation\)\)\}/);
  const rail = region(stack, 'export function EliminationOperationRail(', 'export function EliminationOperationSymbol(', 'rail');
  assert.match(rail, /className="mathmaster-systems-operation-rail mathmaster-elim-rail"/);
  assert.match(rail, /onClick=\{\(\) => onChoose\('add'\)\}/);
  assert.match(rail, /onClick=\{\(\) => onChoose\('subtract'\)\}/);
  // Cancellation is marking the term itself, in its row.
  assert.match(board, /onToggleCancel=\{canEditRows && cancellationOpen \? \(\) => apply\(toggleEliminationCancellation\(elimination, system, roundKey, idA\)\) : null\}/);
  // The combined row is typed on the line under the columns.
  assert.match(board, /<div className="mathmaster-elim-rule"[\s\S]*?<EliminationCombinationEntry[\s\S]*?entryId=\{roundKey\}/);
  // The old side-by-side interface is gone.
  assert.doesNotMatch(elimination, /term cancels/);
  assert.doesNotMatch(elimination, /Add the two \(scaled\) equations/);
});

test('a finished round stays on the page as read-only work instead of collapsing into a chip', () => {
  // Each board renders whenever its pair exists — not only while it is the active phase.
  assert.match(elimination, /\{elimination\.rounds\.round1\.pair \? \(\s*<EliminationRoundBoard[\s\S]*?readOnly=\{phase !== 'round1-combine'\}/);
  assert.match(elimination, /\{elimination\.rounds\.round2\.pair \? \(\s*<EliminationRoundBoard[\s\S]*?readOnly=\{phase !== 'round2-combine'\}/);
  const board = region(elimination, 'function EliminationRoundBoard(', 'function ReducedEliminationSubsystem(', 'EliminationRoundBoard');
  assert.match(board, /\{done && combinedRowForm \? \(\s*<EliminationStackRow/);
  // R₁/R₂ are no longer repeated a third time as trail chips.
  const trail = region(elimination, 'const workTrailStages = [', '];', 'work trail');
  assert.doesNotMatch(trail, /id: 'round1'[^}]*summary/);
  assert.doesNotMatch(trail, /id: 'round2'[^}]*summary/);
});

test('scaling is offered on every row of an open round, applied only by the student, and reversible', () => {
  const board = region(elimination, 'function EliminationRoundBoard(', 'function ReducedEliminationSubsystem(', 'EliminationRoundBoard');
  const scaleAction = region(board, 'const scaleAction = ', 'const scaleTools = ', 'scaleAction');
  assert.match(scaleAction, /apply\(openEliminationScaleEditor\(elimination, roundKey, id\)\)/);
  const tools = region(board, 'const scaleTools = ', 'const opRail = ', 'scaleTools');
  assert.match(tools, /apply\(applyEliminationMultiplier\(elimination, system, roundKey, id\)\)/);
  assert.match(tools, /apply\(keepEliminationEquationAsWritten\(elimination, roundKey, id\)\)/);
  assert.match(tools, /apply\(checkEliminationMultiplierProducts\(elimination, system, roundKey, id\)\)/);
  // The factor is shown as "· 2": a × beside a column of x terms reads as another x.
  assert.match(elimination, /`· \$\{exactNumberText\(value\)\}`/);
  assert.doesNotMatch(board, /`× \$\{/);
  // The screen never announced "(×1)" as if the student had decided it.
  assert.doesNotMatch(elimination, /Used as written \(×1\)/);
});

test('no field previews the product or result it asks for', () => {
  // The 2×2 scale step once showed the expected products as placeholders
  // ("8x" for 4x · 2). Every elimination field at every size is drawn by the
  // shared board, whose placeholders are fixed words, never a computed term.
  const placeholders = [...stack.matchAll(/placeholder=\{([^}]*)\}|placeholder="([^"]*)"/g)].map((match) => match[1] || match[2]);
  assert.ok(placeholders.length >= 4, 'the shared board draws the factor, distribution and combination fields');
  placeholders.forEach((value) => {
    assert.match(value, /^(?:variable \? 'term' : 'value'|term|value|factor)$/, `unexpected placeholder expression: ${value}`);
  });
  // Neither screen draws an elimination field of its own.
  const twoByTwoBoard = region(twoByTwo, 'const eliminationBoard = ', 'const methodTitle = ', '2×2 board');
  const threeByThreeBoard = region(elimination, 'function EliminationRoundBoard(', 'function ReducedEliminationSubsystem(', 'EliminationRoundBoard');
  for (const source of [twoByTwoBoard, threeByThreeBoard]) assert.doesNotMatch(source, /<MathInput/);
});

test('every elimination — 3×3 pair rounds, standalone 2×2, reduced 2×2 — is drawn with the same board', () => {
  const parts = ['EliminationStackRow', 'EliminationScaleButton', 'EliminationScaleEditor', 'EliminationDistribution', 'EliminationOperationRail', 'EliminationCombinationEntry', 'eliminationDirection'];
  const twoByTwoBoard = region(twoByTwo, 'const eliminationBoard = ', 'const methodTitle = ', '2×2 board');
  const threeByThreeBoard = region(elimination, 'function EliminationRoundBoard(', 'function ReducedEliminationSubsystem(', 'EliminationRoundBoard');
  for (const [name, source, board] of [['AlgebraicSystemMode', twoByTwo, twoByTwoBoard], ['EliminationReductionMode', elimination, threeByThreeBoard]]) {
    assert.match(source, /from '\.\/EliminationStack\.jsx';/, `${name} imports the shared board`);
    for (const part of parts) assert.match(board, new RegExp(`\\b${part}\\b`), `${name} draws ${part} from the shared board`);
    // No private copy of the row or the old 2×2 card layout.
    assert.doesNotMatch(source, /function (?:EliminationStackRow|AlignedEquationRow)\b|mathmaster-systems-elimination-equation-card|mathmaster-systems-multiplier-composer/, `${name} has its own elimination rows`);
  }
  // The 2×2 board is rendered in place of the old Prepare / Combine cards.
  assert.match(twoByTwo, /\) : \(\s*eliminationBoard\s*\)\}/);
});

test('a wrong distribution is reported inside its own box, under the button pressed, at every size', () => {
  const distribution = region(stack, 'export function EliminationDistribution(', 'export function EliminationOperationRail(', 'distribution');
  assert.match(distribution, /Check my scaled terms<\/button>[\s\S]*?<\/div>\s*\{error \? <p className="mathmaster-systems-substitution-feedback is-error" role="status">\{error\}<\/p> : null\}/);
  // 3×3: the round board hands the product error to the box it belongs to,
  // and the panel-wide note leaves it out so it is not shown twice.
  assert.match(elimination, /const productError = feedbackNote\?\.stage === 'multiplier-products' && note/);
  assert.match(elimination, /\{note && !productError \? <p/);
  const board = region(elimination, 'function EliminationRoundBoard(', 'function ReducedEliminationSubsystem(', 'EliminationRoundBoard');
  assert.match(board, /error=\{productError\?\.roundKey === roundKey && productError\.equationId === id \? productError\.text : null\}/);
  // 2×2: the same box shows its own product check.
  const twoByTwoBoard = region(twoByTwo, 'const eliminationBoard = ', 'const methodTitle = ', '2×2 board');
  assert.match(twoByTwoBoard, /error=\{work\.checked && !work\.valid/);
});

/* ------------------------------------------------ the reduced 2×2 inside */

test('inside a 3×3 the reduced 2×2 names its equations R₁ and R₂ and has no Verify step of its own', () => {
  assert.match(twoByTwo, /const equationName = \(index\) => subsystem\?\.equationLabels\?\.\[index\] \|\| `Equation \$\{index \+ 1\}`;/);
  const twoByTwoBoard = region(twoByTwo, 'const eliminationBoard = ', 'const methodTitle = ', '2×2 board');
  assert.match(twoByTwoBoard, /label=\{equationName\(index\)\}/);
  assert.match(twoByTwoBoard, /firstLabel=\{equationName\(0\)\}\s*secondLabel=\{equationName\(1\)\}/);
  // The trail's Verify stage exists only outside the subsystem role.
  assert.match(twoByTwo, /\.\.\.\(subsystem \? \[\] : \[\{\s*id: 'verify',/);
  // "Prepare" is not ticked before a target variable exists (scaling defaults to ×1).
  assert.match(twoByTwo, /complete: Boolean\(selection\.variable\) && multipliersApplied,/);
});

test('the solved 2×2 folds away but stays one click from view', () => {
  assert.match(elimination, /hidden=\{phase !== 'subsystem' && !subsystemState\?\.outcome && !\(reducedSolution && showSolvedSubsystem\)\}/);
  assert.match(elimination, /onClick=\{\(\) => setShowSolvedSubsystem\(\(open\) => !open\)\}/);
  assert.match(elimination, /showSolvedSubsystem \? 'Hide my 2×2 work' : 'Show my 2×2 work'/);
});

/* ----------------------------------------------------------- wording */

test('student-facing systems copy never says "token"', () => {
  const visibleStrings = (source) => [
    ...source.matchAll(/>([^<>{}]*)</g),
    ...source.matchAll(/(?:aria-label|ariaLabel|title|placeholder|label)=(?:"([^"]*)"|\{`([^`]*)`\})/g),
    ...source.matchAll(/return '([^']*)';/g),
  ].map((match) => match.slice(1).filter(Boolean).join(' ')).filter((text) => text.trim());
  for (const [name, source] of [['AlgebraicSystemMode', twoByTwo], ['SubstitutionReductionMode', substitution3], ['EliminationReductionMode', elimination]]) {
    const offenders = visibleStrings(source).filter((text) => /\btokens?\b/i.test(text));
    assert.deepEqual(offenders, [], `${name} still shows "token" to students`);
  }
});

test('an assigned 3×3 method gets directions for that method; only a real choice says "choose substitution or elimination"', () => {
  assert.match(workspace, /assignedMethod3 === 'elimination' \? 'algebraic3Elimination' : assignedMethod3 === 'substitution' \? 'algebraic3Substitution' : 'algebraic3'/);
  const steps = region(workspace, 'const MODE_STEPS = {', '};', 'MODE_STEPS');
  const eliminationSteps = region(steps, 'algebraic3Elimination:', '\n', 'elimination steps');
  assert.doesNotMatch(eliminationSteps, /substitution or elimination/i);
  assert.match(workspace, /steps=\{MODE_STEPS\[taskKey\] \|\| MODE_STEPS\.linear\}/);
});

test('the method choice shows the system it asks the student to judge', () => {
  const choice = region(methodChoice, 'if (isStudentChoice && !effectiveMethod) {', 'return (\n    <div className="mathmaster-algebraic3-mode">', 'method choice screen');
  assert.match(choice, /config\.equations\.map\(\(equation, index\) =>[\s\S]*?<MathDisplay value=\{equation\}/);
  assert.match(methodChoice, /import MathDisplay from '\.\.\/\.\.\/MathDisplay';/);
});

/* ------------------------------------------------------- three planes */

test('a three-plane interpretation is a real choice group whose chosen option looks chosen', () => {
  const panel = region(threePlanes, '<Panel title="Interpret what you found">', '</Panel>', 'interpretation panel');
  assert.match(panel, /role="radiogroup"/);
  assert.match(panel, /role="radio"\s*aria-checked=\{selected\}/);
  assert.match(panel, /className=\{`mathmaster-threeplane-choice\$\{selected \? ' is-selected' : ''\}`\}/);
  assert.doesNotMatch(panel, /mathmaster-reduction-carry/);
  // A wrong check gets an idea to reconsider, not only "Not yet" — and never the option.
  assert.match(panel, /\{!feedback\.isCorrect \? \([\s\S]*?spatialMisconceptionFeedback\(answerFields, responses, feedback\.metadata\?\.parts\)/);
});

test('the three-plane model opens on (and resets to) the view where every plane is seen most face-on', () => {
  assert.match(threePlanes, /const openingCamera = useMemo\(\(\) => legibleCamera\(forms, variables, DEFAULT_CAMERA\), \[forms, variables\]\);/);
  assert.match(threePlanes, /useState\(openingCamera\)/);
  // #387 made Reset view also stop the idle orbit, so it is no longer a
  // one-liner. What must hold: the callback puts the camera back on
  // openingCamera, and re-binds when openingCamera changes.
  const resetView = region(threePlanes, 'const resetView = useCallback(', 'const handlePointerDown', 'resetView');
  assert.match(resetView, /setCamera\(openingCamera\);/);
  assert.match(resetView, /\}, \[[^\]]*\bopeningCamera\b[^\]]*\]\);/);
});

test('legibleCamera turns the Day 1 planes from slivers into faces, and is deterministic', () => {
  const variables = ['x', 'y', 'z'];
  const day1 = ['2x - y + 2z = 15', '-x + y + z = 3', '3x - y + 2z = 18'].map((equation) => linearEquationForm(equation, variables));
  const fixed = { azimuth: -0.7, elevation: 0.5 };
  const before = Math.min(...planeFacing(day1, variables, fixed));
  const camera = legibleCamera(day1, variables, fixed);
  const after = Math.min(...planeFacing(day1, variables, camera));
  assert.ok(before < 0.15, `the old fixed view showed a plane almost edge-on (${before.toFixed(2)})`);
  assert.ok(after > 0.6, `every plane should be well face-on from the opening view (${after.toFixed(2)})`);
  assert.deepEqual(legibleCamera(day1, variables, fixed), camera);
  assert.ok(camera.elevation >= 0.2 && camera.elevation <= 0.9, 'the view stays upright');
});

/* --------------------------------------------------- classroom notation */

test('a substituted negative value keeps its parentheses on the way into Step Algebra', () => {
  // Back-substituting y = −1 into 4x + 3y = 5 was shown as "4x + 3 · −1",
  // and y = −2 into 2x − y + 3z = 16 as "2x − −2" (#361).
  const product = normalizeEquationForStepAlgebra(substituteIntoEquation('4x + 3y = 5', 'y', '-1'));
  assert.match(product, /3 \* \(-1\)/);
  assert.doesNotMatch(product, /\* -1/);
  const difference = normalizeEquationForStepAlgebra(substituteIntoEquation('2x - y + 3z = 16', 'y', '-2'));
  assert.match(difference, /- \(-2\)/);
  assert.doesNotMatch(difference, /- -2/);
  // Positive values and fractions keep their existing forms.
  assert.equal(normalizeEquationForStepAlgebra(substituteIntoEquation('x + y + z = 3', 'x', '1')), '1 + y + z = 3');
  assert.match(normalizeEquationForStepAlgebra(substituteIntoEquation('-3x - 3y = 1', 'x', '20/9')), /3\s*\*\s*\(20 \/ 9\)/);
});

test('revealing the point marks and labels it without classifying the system for the student', () => {
  // The caption under the model: a model opened from the student's own result
  // words it through earnedResultCaption (which also knows the activity's
  // outcome policy); an authored reveal words it here. Both mark the point and
  // neither classifies the system.
  const reveal = region(threePlanes, '{earnedResult', "'This system could not be classified.'", 'reveal message');
  assert.match(reveal, /`Point marked on the model: \$\{orderedTripleText\(shownSolution, variables\)\}\.`/);
  assert.match(reveal, /earnedResultCaption\(\{ type: shownType, solutionText: shownType === 'unique' \? orderedTripleText\(shownSolution, variables\) : ''/);
  assert.doesNotMatch(reveal, /meet at exactly one point/);
  for (const showImmediateFeedback of [true, false]) {
    const caption = earnedResultCaption({ type: 'unique', solutionText: '(−2, 6, −3)', showImmediateFeedback });
    assert.equal(caption, 'Point marked on the model: (−2, 6, −3).');
  }
  const marker = region(threePlanes, '{solutionMarker ? (', ') : null}', 'solution marker');
  assert.match(marker, /<circle[\s\S]*?<text[\s\S]*?\{orderedTripleText\(shownSolution, variables\)\}/);
});
