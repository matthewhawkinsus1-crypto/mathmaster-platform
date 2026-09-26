/*
 * ISSUE #341: THE 3×3 SUBSTITUTION SCREEN IS WIRED TO THE STUDENT-AGENCY RULES.
 *
 * Node cannot render the workspace, so these contracts bind each rule to the
 * statement that enforces it. The full behaviour — a real student solving a
 * real 3×3 through QuestionEngine — is tests/browser/algebraicSystems3x3.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';

const reduction = executableSource(componentSource('src/tools/systemsWorkspace/SubstitutionReductionMode.jsx'));
const twoByTwo = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'));
const workspace = executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
const methodDispatch = executableSource(componentSource('src/tools/systemsWorkspace/Algebraic3SystemMode.jsx'));
const model = executableSource(componentSource('src/tools/systemsWorkspace/substitutionReduction.js'));

/* ----------------------------------------------------------------- routing */

test('three equations route to the 3×3 workflow and everything else stays on the 2×2, with its own task card', () => {
  const dispatch = region(workspace, 'export default function SystemsWorkspace(', null, 'SystemsWorkspace dispatch');
  assert.match(dispatch, /const algebraic3 = mode === 'algebraic' && algebraicSystemDimension\(questionData\) === 3;/);
  // #359: a 3×3 system can be solved by substitution OR elimination now, so
  // SystemsWorkspace hands off to a method-dispatching wrapper instead of
  // mounting SubstitutionReductionMode directly.
  assert.match(dispatch, /mode === 'algebraic' \? \(algebraic3\s*\? <Algebraic3SystemMode [^>]*\/>\s*: <AlgebraicSystemMode /);
  assert.match(dispatch, /task=\{MODE_TASKS\[taskKey\]/);
  assert.match(workspace, /algebraic3: 'Solve this 3×3 system/);
  // App.jsx lesson: a call needs its import.
  assert.match(workspace, /import Algebraic3SystemMode from '\.\/Algebraic3SystemMode\.jsx';/);
  assert.match(workspace, /import \{ algebraicSystemDimension \} from '\.\/algebraicSystemsEngine\.js';/);
});

test('the 3×3 method-choice wrapper offers substitution or elimination, never silently defaulting to substitution', () => {
  assert.match(methodDispatch, /config\.method === 'studentChoice'/);
  assert.match(methodDispatch, /setMethod\('substitution'\)/);
  assert.match(methodDispatch, /setMethod\('elimination'\)/);
  assert.match(methodDispatch, /effectiveMethod === 'elimination'\s*\n?\s*\? <EliminationReductionMode/);
  assert.match(methodDispatch, /: <SubstitutionReductionMode/);
});

/* ------------------------------------------------------ the student decides */

test('the student chooses the source equation and variable from every option; none is suggested', () => {
  const choose = region(reduction, "{phase === 'choose-source' ? (", "{phase === 'isolate' ? (", 'choose-source stage');
  assert.match(choose, /system\.equations\.map\(\(equation\) =>/);
  assert.match(choose, /system\.variables\.map\(\(name\) =>/);
  assert.match(choose, /chooseReductionSource\(reduction, system, equation\.id, name\)/);
  assert.doesNotMatch(reduction, /easiest|recommended|suggested|coefficient of 1 is/i);
});

test('every isolation, standard form and final solve is Step Algebra, never this workspace', () => {
  const embeds = [...reduction.matchAll(/<EmbeddedStepAlgebra/g)];
  assert.equal(embeds.length, 3, 'isolate, standard form, back-solve');
  assert.doesNotMatch(reduction, /applyBalancedOperation|commitDistribution|simplifyExpression|evaluate\(/);
  assert.doesNotMatch(model, /applyBalancedOperation|commitDistribution|simplify\(/);
});

test('each derived equation is simplified by the student in Step Algebra, with distributed products left for them', () => {
  const standardize = region(reduction, 'label={`Simplify ${lineageName(', 'onSolved={handleStandardized}', 'standard-form embed');
  assert.match(reduction, /const standardFormObjective = useMemo\(\(\) => \{[\s\S]*?kind: 'linearStandardForm'/);
  assert.match(standardize, /objective=\{standardFormObjective\}/);
  assert.match(standardize, /requireSimplifiedFinalForm/);
  assert.match(standardize, /showHint=\{false\}/);
  const after = region(reduction, 'onSolved={handleStandardized}', '/>', 'standard-form embed options');
  assert.match(after, /autoOpenDistribution/);
  assert.match(after, /simplifyDistributedProducts=\{false\}/);
});

test('the final value is the student’s own simplified number — the workspace never evaluates it', () => {
  const back = region(reduction, 'function BackSubstitution(', 'function Verification(', 'BackSubstitution');
  const solve = region(back, '<EmbeddedStepAlgebra', '/>', 'back-solve embed');
  assert.match(solve, /requireSimplifiedFinalForm/);
  assert.match(solve, /equationText=\{backEquation\}/);
  // The destination and every placement are the student's.
  assert.match(back, /destinations\.map\(\(destination\) =>/);
  assert.match(back, /attemptBackPlacement\(reduction, system, reducedSolution, destination\.id, targetVariable, tokenVariable\)/);
});

test('substitution targets are the shared neutral drop targets: nothing is pre-highlighted, only the hovered variable responds', () => {
  const reduce = region(reduction, "{phase === 'reduce' ? (", '{reduced ? (', 'reduce stage');
  assert.match(reduce, /<VariableDropEquation/);
  assert.match(reduce, /tokenArmed=\{armedToken\?\.kind === 'substitution'\}/);
  assert.match(reduce, /attemptTargetSubstitution\(reduction, system, equation\.id, variable\)/);
  assert.doesNotMatch(reduce, /is-target|is-correct|data-correct/);
  // Offered on every target, so offering it reveals nothing.
  assert.match(reduce, /carryTargetUnchanged\(reduction, system, equation\.id\)/);
  const dropTarget = region(twoByTwo, 'export function VariableDropEquation', 'export function SystemsWorkTrail', 'VariableDropEquation');
  assert.match(dropTarget, /dragOverVariable === part \? ' is-drag-over' : ''/);
});

test('the token stays available until every target has it, and progress names the count, not the move', () => {
  const reduce = region(reduction, "{phase === 'reduce' ? (", '{reduced ? (', 'reduce stage');
  assert.match(reduce, /targets\.some\(\(equation\) => !reduction\.targets\[equation\.id\]\) \? \(/);
  assert.match(reduce, /Reduced equations \{reducedCount\} of \{targets\.length\}/);
});

/* --------------------------------------------------- the reduced subsystem */

test('the reduced 2×2 IS the existing 2×2 workflow, under its own draft scope and Undo channel', () => {
  const subsystem = region(reduction, 'function ReducedSubsystem(', 'function BackSubstitution(', 'ReducedSubsystem');
  assert.match(subsystem, /<ToolDraftScopeProvider draftKey=\{scopeContext\?\.draftKey \|\| null\} scope=\{scope\}/);
  assert.match(subsystem, /<WorkViewUndoProvider register=\{onUndoController\} resetKey=\{identity\}>/);
  assert.match(subsystem, /<AlgebraicSystemMode[\s\S]*?subsystem=\{subsystem\}/);
  assert.match(subsystem, /method: 'substitution'/);
  assert.match(subsystem, /requireVerification: false/);
  assert.match(subsystem, /draftKey=\{draftKey \? `\$\{draftKey\}:reduction:reduced:\$\{identity\}` : null\}/);
  // Identity comes from the exact reduced equations, so a different reduction never rehydrates stale work.
  assert.match(reduction, /const subsystemScope = reducedIdentity \? `\$\{scopeContext\?\.scope \|\| 'tool'\}:reduced-\$\{reducedIdentity\}` : null;/);
});

test('in its subsystem role the 2×2 submits nothing, verifies nothing, and reports its solution up', () => {
  assert.match(twoByTwo, /export default function AlgebraicSystemMode\(\{ questionData = \{\}, onAction, draftKey = null, subsystem = null \}\)/);
  assert.match(twoByTwo, /subsystem \? null : <button type="button" onClick=\{check\} style=\{actionStyle\}>Check my work<\/button>/);
  assert.match(twoByTwo, /\{subsystem \? null : <HintPanel/);
  const report = region(twoByTwo, 'const onSubsystemSolutionChange = subsystem?.onSolutionChange;', 'const bothPlaced = ', 'subsystem report');
  assert.match(report, /onSubsystemSolutionChange\(solution \? \{/);
  assert.match(report, /\} : null\);/);
  // Its Undo owners never collide with the parent's.
  assert.match(twoByTwo, /ownerId: 'algebraic-subsystem-history'/);
  assert.match(twoByTwo, /subsystem \? 'algebraic-subsystem-embedded-step-algebra' : 'algebraic-system-embedded-step-algebra'/);
  // Values it solves are exact and simplified by the student.
  assert.match(twoByTwo, /const valueText = \(value\) => \(subsystem \? exactNumberText\(value\) : String\(value\)\);/);
  assert.equal([...twoByTwo.matchAll(/requireSimplifiedFinalForm=\{Boolean\(subsystem\)\}/g)].length, 2);
});

test('a solved subsystem is known on the first render after a reload, from its own draft', () => {
  assert.match(reduction, /return subsystemReportFromDraft\(readToolDraftRecord\(scopeContext\.draftKey, subsystemScope\)\);/);
  assert.match(reduction, /if \(subsystemReport\?\.identity === reducedIdentity\) return subsystemReport\.report;/);
  // Kept mounted once solved, so Undo can walk back into it.
  assert.match(reduction, /<div className="mathmaster-reduction-subsystem" hidden=\{phase !== 'subsystem'\}>/);
});

/* ------------------------------------------------------------- Undo */

test('Undo is most local first: open Step Algebra, then the subsystem while it is the frontier, then this round', () => {
  const undo = region(reduction, 'const compositeUndo = useMemo(() => {', '}, [', 'compositeUndo');
  const order = [
    'if (embeddedUndoController?.canUndo) return embeddedUndoController;',
    "if (phase === 'subsystem' && subsystemUndoController?.canUndo) return subsystemUndoController;",
    'if (reducedSolution && !hasPostSubsystemWork && subsystemUndoController?.canUndo) return subsystemUndoController;',
    'return historyController;',
  ].map((line) => undo.indexOf(line));
  assert.ok(order.every((index) => index >= 0), `missing an Undo rule: ${JSON.stringify(order)}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Undo rules out of order');
  assert.match(reduction, /useActiveUndoOwner\(\{ id: 'algebraic-reduction-composite', active: true, priority: 60, controller: compositeUndo \}\)/);
  assert.match(reduction, /undo: undoCapability/);
  // The 2×2 falls through to its systems history when the open solver has nothing to undo.
  assert.match(twoByTwo, /active: Boolean\(embeddedUndoController\?\.canUndo\),/);
  assert.match(twoByTwo, /const activeUndoCapability = embeddedUndoController\?\.canUndo/);
});

/* -------------------------------------------------------- persistence */

test('the whole round is one draft-backed, repaired field; every useState is declared presentation', () => {
  const persistent = [...reduction.matchAll(/usePersistentToolState\(\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(persistent, ['reduction']);
  assert.match(reduction, /const reduction = useMemo\(\(\) => repairReductionState\(storedReduction, system\), \[storedReduction, system\]\);/);
  const contract = TOOL_STATE_PERSISTENCE.systemsWorkspace;
  assert.ok(contract.sources.includes('systemsWorkspace/SubstitutionReductionMode.jsx'));
  const local = [...reduction.matchAll(/const\s*\[\s*([A-Za-z0-9_$]+)\s*,\s*set[A-Za-z0-9_$]*\s*\]\s*=\s*useState\(/g)].map((match) => match[1]).sort();
  assert.deepEqual(local, ['armedToken', 'embeddedUndoController', 'reductionFeedback', 'subsystemReport', 'subsystemUndoController']);
  local.forEach((field) => assert.ok(contract.transientState[field], `${field} must be declared transient`));
});

test('Step Algebra draft keys name the exact mathematics, so a different choice never rehydrates stale work', () => {
  assert.match(reduction, /`\$\{draftKey\}:reduction:isolate:\$\{source\.equationId\}:\$\{sourceVariable\}`/);
  assert.match(reduction, /`\$\{draftKey\}:reduction:standardize:\$\{activeTargetId\}:\$\{hashText\(reduction\.targets\[activeTargetId\]\.rawText\)\}`/);
  assert.match(reduction, /`\$\{draftKey\}:reduction:back-solve:\$\{reduction\.back\.destinationId\}:\$\{hashText\(backEquation\)\}`/);
});

/* -------------------------------------------------- verification + UI */

test('verification is in all three ORIGINAL equations with the student’s own arithmetic', () => {
  const verify = region(reduction, 'function Verification(', null, 'Verification');
  assert.match(verify, /Verify the ordered triple in all three original equations/);
  assert.match(verify, /system\.equations\.map\(\(equation\) =>/);
  assert.match(verify, /Left side simplifies to[\s\S]*?<MathInput/);
  assert.match(verify, /checkVerification\(reduction, system, solution, equation\.id\)/);
  assert.match(reduction, /const readyToSubmit = phase === 'complete';/);
});

test('one Work View host, originals always visible, and SubstitutionReductionMode itself never offers a method choice', () => {
  // #359: the method choice (substitution vs. elimination) now lives one
  // level up, in Algebraic3SystemMode — SubstitutionReductionMode stays the
  // substitution-only screen it always was, mounted once that choice is made.
  assert.equal([...reduction.matchAll(/<EnlargeableFigure/g)].length, 1);
  assert.match(reduction, /<aside className="mathmaster-reduction-reference"[\s\S]*?system\.equations\.map/);
  assert.doesNotMatch(reduction, />Elimination</);
  // An unsupported system reaches the student as an explanation, never a crash or a wrong grade.
  assert.match(reduction, /const unsupported = answerKey\.type !== 'unique';/);
});
