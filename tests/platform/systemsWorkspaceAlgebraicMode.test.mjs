import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const workspaceSource = executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
const modeSource = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'));
const engineSource = executableSource(componentSource('src/tools/systemsWorkspace/algebraicSystemsEngine.js'));

// ---------------------------------------------------------------------------
// Opt-in mode wiring, backward compatibility (#23-27)
// ---------------------------------------------------------------------------

test('the algebraic mode is dispatched by mode id, alongside every existing mode, without replacing any of them', () => {
  const dispatch = region(workspaceSource, 'export default function SystemsWorkspace(', null, 'SystemsWorkspace dispatch');
  assert.match(dispatch, /mode === 'inequalities'[\s\S]*?<InequalityMode/);
  assert.match(dispatch, /mode === 'linearQuadratic'[\s\S]*?<LinearQuadraticMode/);
  assert.match(dispatch, /mode === 'matrix' \|\| mode === 'matrix3'[\s\S]*?<MatrixMode/);
  assert.match(dispatch, /mode === 'algebraic'[\s\S]*?<AlgebraicSystemMode/);
  // The pre-existing fallback (no mode, or 'linear') must still resolve to LinearMode.
  assert.match(dispatch, /<LinearMode questionData=\{questionData\} onAction=\{onAction\}\/>/);
});

test('AlgebraicSystemMode is imported once, as its own module, never inlined into the existing file', () => {
  assert.match(workspaceSource, /import AlgebraicSystemMode from '\.\/AlgebraicSystemMode\.jsx';/);
});

test('every pre-existing mode component is untouched: LinearMode, InequalityMode, LinearQuadraticMode and MatrixMode are all still defined', () => {
  assert.match(workspaceSource, /function LinearMode\(/);
  assert.match(workspaceSource, /function InequalityMode\(/);
  assert.match(workspaceSource, /function LinearQuadraticMode\(/);
  assert.match(workspaceSource, /function MatrixMode\(/);
});

// ---------------------------------------------------------------------------
// Step Algebra reuse — never a second mini solver (architectural rule)
// ---------------------------------------------------------------------------

test('every isolation and one-variable solve is handed to the existing StepByStepAlgebraCore engine', () => {
  assert.match(modeSource, /import StepByStepAlgebraCore from '\.\.\/\.\.\/StepByStepAlgebraCore\.jsx';/);
  const embed = region(modeSource, 'function EmbeddedStepAlgebra(', 'export default function AlgebraicSystemMode', 'EmbeddedStepAlgebra');
  assert.match(embed, /<StepByStepAlgebraCore/);
  // The embed only watches for Step Algebra's own solved signal; it must not
  // re-implement isolation, balancing, distribution or cancellation.
  assert.match(embed, /algebra-objective/);
  assert.doesNotMatch(embed, /applyBalancedOperation|distribut|cancellation/i);
});

test('the workspace-level engine never reimplements balanced-operation solving, distribution, or cancellation', () => {
  assert.doesNotMatch(engineSource, /applyBalancedOperation|distribut|cancellation|isSolvedEquation/i);
});

test('there are exactly three Step Algebra embeds: isolate, reduce, and back-substitution solve — one per handoff the spec requires', () => {
  const embeds = [...modeSource.matchAll(/<EmbeddedStepAlgebra/g)];
  assert.equal(embeds.length, 3);
});

// ---------------------------------------------------------------------------
// Persistence — every meaningful piece of unfinished work is draft-backed
// ---------------------------------------------------------------------------

test('AlgebraicSystemMode is declared in the persistence contract alongside SystemsWorkspace.jsx', () => {
  const contract = TOOL_STATE_PERSISTENCE.systemsWorkspace;
  assert.ok(contract.sources.includes('systemsWorkspace/AlgebraicSystemMode.jsx'));
  assert.equal(contract.studentStatePersistence, 'draft-backed');
});

test('every stage of mathematical work required by the spec is stored through usePersistentToolState, not useState', () => {
  const persistentFields = [...modeSource.matchAll(/usePersistentToolState\(\s*'([^']+)'/g)].map((m) => m[1]);
  [
    'method', 'selection', 'isolation', 'substitution', 'multipliers', 'appliedMultipliers',
    'combination', 'firstSolved', 'specialCase', 'backSub', 'secondSolved', 'verification',
    'methodEfficiencyReason',
  ].forEach((field) => {
    assert.ok(persistentFields.includes(field), `"${field}" must be draft-backed so unfinished work survives navigation`);
  });
});

test('the only local useState is the transient substitution-slot interaction hint, already declared as presentation', () => {
  const useStateFields = [...modeSource.matchAll(/const\s*\[\s*([A-Za-z0-9_$]+)\s*,\s*set[A-Za-z0-9_$]*\s*\]\s*=\s*useState\(/g)].map((m) => m[1]);
  assert.deepEqual(useStateFields, ['slotAttempt']);
  assert.ok(TOOL_STATE_PERSISTENCE.systemsWorkspace.transientState.slotAttempt);
});

test('each Step Algebra embed gets a draft key scoped to the exact mathematical identity being solved, so a different choice never rehydrates stale work', () => {
  const isolateBlock = region(modeSource, 'label={`Isolate ${selection.variable}`}', 'onSolved={handleIsolated}', 'isolate embed');
  assert.match(isolateBlock, /algebraic:isolate:\$\{selection\.equationIndex\}:\$\{selection\.variable\}/);

  const reduceBlock = region(modeSource, 'label={`Solve for ${survivingVariable}`}', 'onSolved={handleReduceSolved}', 'reduce embed');
  assert.match(reduceBlock, /algebraic:reduce:\$\{effectiveMethod\}:\$\{selection\.variable\}/);

  const backSolveBlock = region(modeSource, 'label={`Solve for ${removedVariable}`}', 'onSolved={handleSecondSolved}', 'back-solve embed');
  assert.match(backSolveBlock, /algebraic:back-solve:\$\{backSub\.equationIndex\}/);
});

test('changing the equation/variable selection resets every downstream field so no stale answer can leak forward', () => {
  const reset = region(modeSource, 'const resetFromSelection = useCallback(', '}, []);', 'resetFromSelection');
  ['setSelection', 'setIsolation', 'setSubstitution', 'setMultipliers', 'setAppliedMultipliers', 'setCombination', 'setFirstSolved', 'setSpecialCase', 'setBackSub', 'setSecondSolved', 'setVerification']
    .forEach((setter) => assert.match(reset, new RegExp(setter)));
});

// ---------------------------------------------------------------------------
// Substitution workflow (#1-7)
// ---------------------------------------------------------------------------

test('an already-isolated variable skips Step Algebra entirely', () => {
  assert.match(modeSource, /alreadyIsolated \? null : \(/);
});

test('substitution is only performed once the student identifies the correct variable location, and a wrong pick gives feedback without corrupting state', () => {
  const attempt = region(modeSource, 'const attemptSubstitution = ', 'const setMultiplierValue', 'attemptSubstitution');
  assert.match(attempt, /clickedVariable !== selection\.variable/);
  assert.match(attempt, /setSlotAttempt\(\{ variable: clickedVariable, correct: false \}\);\s*\n\s*return;/);
});

test('the substitution feedback names the isolated variable, per the platform feedback philosophy (identify the structural problem)', () => {
  assert.match(modeSource, /You isolated \{selection\.variable\}, so replace \{selection\.variable\}/);
});

test('substitution and back-substitution both route their one-variable result through Step Algebra rather than solving it locally', () => {
  assert.match(modeSource, /equationText=\{reduceInputText\}/);
  assert.match(modeSource, /equationText=\{backSubEquationText\}/);
});

test('the ordered pair is only assembled after both variables are solved, and verification is required before the workspace considers the attempt ready to check', () => {
  assert.match(modeSource, /const solution = secondSolvedDone \? \{ \[survivingVariable\]: firstSolved\.value, \[removedVariable\]: secondSolved\.value \} : null;/);
  assert.match(modeSource, /readyToSubmit = isDegenerate \? Boolean\(specialCaseAnswered\) : Boolean\(solution && \(!config\.requireVerification \|\| allVerified\)\)/);
});

test('verification requires both original equations to be checked independently, not a single yes/no', () => {
  assert.match(modeSource, /allVerified = solution && verification\[0\]\.checked && verification\[0\]\.valid && verification\[1\]\.checked && verification\[1\]\.valid/);
  const verifyPanel = region(modeSource, "Verify the ordered pair in both original equations", 'readyToSubmit ? (', 'verification panel');
  assert.match(verifyPanel, /equations\.map/);
  assert.match(verifyPanel, /Left side simplifies to/);
  assert.match(verifyPanel, /Right side simplifies to/);
});

// ---------------------------------------------------------------------------
// Elimination workflow (#8-14)
// ---------------------------------------------------------------------------

test('a multiplier is a student choice applied to a whole equation and shown before combination, never auto-chosen', () => {
  const multiplierUi = region(modeSource, 'Multiply by', 'multipliersApplied ? (', 'multiplier UI');
  assert.match(multiplierUi, /onChange=\{\(e\) => setMultiplierValue\(index, e\.target\.value\)\}/);
  assert.match(multiplierUi, /onClick=\{\(\) => applyMultiplier\(index\)\}/);
  assert.doesNotMatch(modeSource, /bestMultiplier|autoChooseMultiplier|optimalMultiplier/i);
});

test('the combine step lets the student choose add or subtract explicitly', () => {
  assert.match(modeSource, /onClick=\{\(\) => handleCombine\('add'\)\}/);
  assert.match(modeSource, /onClick=\{\(\) => handleCombine\('subtract'\)\}/);
});

test('a combination that fails to cancel the target variable is rejected without destroying the prior valid combination', () => {
  const handle = region(modeSource, 'const handleCombine = ', 'const handleReduceSolved', 'handleCombine');
  assert.match(handle, /coefficients: eliminates \? combined : current\.coefficients/);
  assert.match(handle, /text: eliminates \? formatLinearEquation\(combined, variables\) : current\.text/);
});

test('a failed combination attempt surfaces mathematical feedback naming the operation/multiplier, per the feedback philosophy', () => {
  assert.match(modeSource, /These coefficients do not cancel \{selection\.variable\} when the equations are/);
});

test('the reduced one-variable equation after elimination is handed to Step Algebra, never solved by this engine', () => {
  assert.doesNotMatch(engineSource, /divide|solveFor/i);
});

// ---------------------------------------------------------------------------
// Special cases (#15-17)
// ---------------------------------------------------------------------------

test('a degenerate reduced statement routes to true/false + classification reasoning instead of Step Algebra', () => {
  assert.match(modeSource, /reduceInputText && !isDegenerate && !firstSolvedDone/);
  assert.match(modeSource, /Is this statement true or false\?/);
  assert.match(modeSource, /What does that mean for the system\?/);
  assert.match(modeSource, /How would you classify this system\?/);
});

test('the special-case reasoning options match the instructional vocabulary exactly', () => {
  assert.match(modeSource, /<option value="none">No solution<\/option>/);
  assert.match(modeSource, /<option value="infinite">Infinitely many solutions<\/option>/);
  assert.match(modeSource, /<option value="inconsistent">Inconsistent<\/option>/);
  assert.match(modeSource, /<option value="consistent-dependent">Consistent and dependent<\/option>/);
});

test('special-case feedback never simply announces the verdict — it explains the statement before the classification', () => {
  assert.match(modeSource, /0 = 0 is a true statement; a false statement like -4 = 8 means the system has no solution\./);
});

// ---------------------------------------------------------------------------
// Work View conventions
// ---------------------------------------------------------------------------

test('the mode renders exactly one EnlargeableFigure host — no nested toolbar inside the embedded Step Algebra boundary', () => {
  const hostCount = [...modeSource.matchAll(/<EnlargeableFigure/g)].length;
  assert.equal(hostCount, 1);
});

test('the Task Card stays visible via the shared MODE_TASKS/MODE_STEPS registry, and algebraic mode has its own entries', () => {
  assert.match(workspaceSource, /algebraic: 'Solve this 2×2 system algebraically/);
  assert.match(workspaceSource, /algebraic: \[.*Choose \(or use the assigned\) method/s);
});


test('embedded Step Algebra owns universal Undo while a one-variable solve is active', () => {
  assert.match(modeSource, /useActiveUndoOwner/);
  assert.match(modeSource, /algebraic-system-embedded-step-algebra/);
  assert.match(modeSource, /onUndoStateChange=\{setEmbeddedUndoController\}/);
  assert.match(modeSource, /activeUndoCapability/);
  assert.match(modeSource, /undo:\s*activeUndoCapability/);
});

test('ordered-pair display uses coordinate values rather than x = / y = labels', () => {
  assert.match(modeSource, /Ordered-pair solution:[\s\S]*\(\{solution\[variables\[0\]\]\}, \{solution\[variables\[1\]\]\}\)/);
  assert.doesNotMatch(modeSource, /Ordered-pair solution:[\s\S]{0,180}\{variables\[0\]\}\s*=\s*\{solution/);
});


test('tool schema accepts authored algebraic systems and rejects malformed equations', () => {
  const valid = validateToolQuestion({
    toolId: 'systemsWorkspace',
    mode: 'algebraic',
    method: 'substitution',
    variables: ['x', 'y'],
    equations: ['x - 2y = -3', '3x + 5y = 24'],
    requireVerification: true,
  });
  assert.equal(valid.isValid, true, valid.errors.join('; '));

  const invalid = validateToolQuestion({
    toolId: 'systemsWorkspace',
    mode: 'algebraic',
    variables: ['x', 'y'],
    equations: ['x^2 + y = 3', 'x + y = 4'],
  });
  assert.equal(invalid.isValid, false);
  assert.ok(invalid.errors.some((message) => message.includes('equation 1 must be linear')));
});
