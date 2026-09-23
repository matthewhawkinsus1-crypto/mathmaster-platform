import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

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
  assert.doesNotMatch(embed, /applyBalancedOperation|commitDistribution|detectDistributableGroup|cancellation/i);
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

test('the only local useState fields are transient interaction/Undo presentation state', () => {
  const useStateFields = [...modeSource.matchAll(/const\s*\[\s*([A-Za-z0-9_$]+)\s*,\s*set[A-Za-z0-9_$]*\s*\]\s*=\s*useState\(/g)].map((m) => m[1]);
  assert.deepEqual(useStateFields.sort(), ['embeddedUndoController', 'slotAttempt'].sort());
  assert.ok(TOOL_STATE_PERSISTENCE.systemsWorkspace.transientState.slotAttempt);
  assert.ok(TOOL_STATE_PERSISTENCE.systemsWorkspace.transientState.embeddedUndoController);
});

test('each Step Algebra embed gets a draft key scoped to the exact mathematical identity being solved, so a different choice never rehydrates stale work', () => {
  const isolateBlock = region(modeSource, 'label={`Isolate ${selection.variable}`}', 'onSolved={handleIsolated}', 'isolate embed');
  assert.match(isolateBlock, /algebraic:isolate:\$\{selection\.equationIndex\}:\$\{selection\.variable\}/);

  const reduceBlock = region(modeSource, 'label={`Solve for ${survivingVariable}`}', 'onSolved={handleReduceSolved}', 'reduce embed');
  assert.match(reduceBlock, /algebraic:reduce:\$\{effectiveMethod\}:\$\{selection\.variable\}/);

  const backSolveBlock = region(modeSource, 'label="Solve the back-substitution equation"', 'onSolved={handleSecondSolved}', 'back-solve embed');
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

test('substitution requires the student to choose both the other equation and the matching variable location', () => {
  const attempt = region(modeSource, 'const attemptSubstitution = ', 'const setMultiplierValue', 'attemptSubstitution');
  assert.match(attempt, /equationIndex === selection\.equationIndex/);
  assert.match(attempt, /clickedVariable !== selection\.variable/);
  assert.match(attempt, /targetEquationIndex: equationIndex/);
  assert.match(attempt, /const reducedEquation = substituteIntoEquation\(/);
  assert.match(attempt, /equationText: reducedEquation/);
});


test('substitution token creation lets the student keep the valid isolated form or simplify it first', () => {
  assert.match(modeSource, /Use this form as the token/);
  assert.match(modeSource, /Simplify first \(optional\)/);
  assert.match(modeSource, /Skip simplification/);
  assert.match(modeSource, /expressionsEquivalent\(draft, isolatedExpr, selection\.variable\)/);
  assert.match(modeSource, /tokenExpression: isolatedExpr/);
  assert.match(modeSource, /expression=\{substitutionTokenExpression\}/);
});

test('optional substitution-token simplification is draft-backed and can never silently change the mathematics', () => {
  assert.match(modeSource, /simplificationDraft/);
  assert.match(modeSource, /simplificationChecked/);
  assert.match(modeSource, /simplificationValid/);
  assert.match(modeSource, /That rewrite is not equivalent to the isolated expression yet/);
  assert.match(modeSource, /const reducedEquation = substituteIntoEquation\(/);
  assert.match(modeSource, /substitutionTokenExpression \|\| isolatedExpr/);
});

test('substitution feedback identifies the structural mistake without giving away the target variable', () => {
  assert.match(modeSource, /That variable does not match the isolated equation/);
  assert.doesNotMatch(modeSource, /so replace \{selection\.variable\}/);
  assert.doesNotMatch(modeSource, /Replace \{variable\} with/);
});

test('substitution and back-substitution both route their one-variable result through Step Algebra rather than solving it locally', () => {
  assert.match(modeSource, /equationText=\{reduceInputText\}/);
  assert.match(modeSource, /equationText=\{backSubEquationText\}/);
});


test('a successful substitution immediately reveals the one-variable solver and activates manual distribution', () => {
  const attempt = region(modeSource, 'const attemptSubstitution = ', 'const setMultiplierValue', 'attemptSubstitution');
  assert.match(attempt, /const reducedEquation = substituteIntoEquation/);
  assert.match(attempt, /equationText: reducedEquation/);
  assert.match(attempt, /setSlotAttempt\(null\)/);

  assert.match(modeSource, /label=\{`Solve for \$\{survivingVariable\}`\}[\s\S]*?autoReveal[\s\S]*?autoOpenDistribution=\{effectiveMethod === 'substitution'\}[\s\S]*?simplifyDistributedProducts=\{effectiveMethod === 'substitution'\}/);
});

test('embedded solver reveal is presentation-only and does not solve or choose a distribution step for the student', () => {
  const embed = region(modeSource, 'function EmbeddedStepAlgebra(', 'export default function AlgebraicSystemMode', 'EmbeddedStepAlgebra');
  assert.match(embed, /scrollIntoView/);
  assert.match(embed, /autoOpenDistribution=\{autoOpenDistribution\}/);
  assert.match(embed, /simplifyDistributedProducts=\{simplifyDistributedProducts\}/);
  assert.doesNotMatch(embed, /placeDistributionFactor|commitDistributionStep|combine like terms automatically/i);
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

test('a multiplier is entered with MathInput, picked up, and placed on the whole equation instead of applied by a form button', () => {
  assert.match(modeSource, /ariaLabel=\{\`Multiplier for equation/);
  assert.match(modeSource, /mathmaster-system-multiplier:/);
  assert.match(modeSource, /draggable/);
  assert.match(modeSource, /dropMultiplier\(/);
  assert.doesNotMatch(modeSource, />Apply<\/button>/);
  assert.doesNotMatch(modeSource, /bestMultiplier|autoChooseMultiplier|optimalMultiplier/i);
});

test('the combine step uses draggable add/subtract operation tokens and preserves subtraction order', () => {
  assert.match(modeSource, /mathmaster-system-combine:/);
  assert.match(modeSource, /armCombine\(operation\)/);
  assert.match(modeSource, /dropCombine\(/);
  assert.match(modeSource, /Equation 1 − Equation 2/);
  assert.match(modeSource, /Equation 1 \+ Equation 2/);
});

test('a combination that fails to cancel the target variable is rejected without destroying the prior valid combination', () => {
  const handle = region(modeSource, 'const handleCombine = ', 'const handleReduceSolved', 'handleCombine');
  assert.match(handle, /coefficients: eliminates \? combined : current\.coefficients/);
  assert.match(handle, /text: eliminates \? formatLinearEquation\(combined, variables\) : current\.text/);
});

test('a failed combination attempt keeps the board intact and redirects attention to signs or multipliers', () => {
  assert.match(modeSource, /That combination does not eliminate the variable you chose/);
  assert.match(modeSource, /change a multiplier/);
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


test('substitution is a neutral placement interaction that does not pre-highlight the correct variable', () => {
  assert.match(modeSource, /function SubstitutionToken/);
  assert.match(modeSource, /mathmaster-substitution:/);
  assert.match(modeSource, /function VariableDropEquation/);
  assert.match(modeSource, /Use the prepared expression to create a one-variable equation/);
  const substitutionTarget = region(modeSource, 'function VariableDropEquation', 'function SystemsWorkTrail', 'VariableDropEquation');
  assert.doesNotMatch(substitutionTarget, /is-target/);
  assert.doesNotMatch(modeSource, />Substitute for \{v\}</);
});

test('back-substitution reuses the same neutral token-to-variable placement model', () => {
  assert.match(modeSource, /attemptBackSubstitution/);
  assert.match(modeSource, /Back-substitute the solved value into one original equation/);
  assert.match(modeSource, /armedPayloadValue=\{survivingVariable\}/);
  assert.doesNotMatch(modeSource, /select the token, then select \{survivingVariable\}/);
});

test('an active embedded solver gets the dominant systems workspace column', () => {
  assert.match(modeSource, /embeddedSolverActive/);
  assert.match(modeSource, /mathmaster-algebraic-system-layout/);
  assert.match(modeSource, /has-active-solver/);
  assert.match(workspaceSource, /workspaceWidth=\{mode === 'algebraic' \? 'min\(100%, 1360px\)'/);
});


test('solution verification uses reusable drag tokens instead of Place-value buttons', () => {
  const verifyPanel = region(modeSource, "Verify the ordered pair in both original equations", 'readyToSubmit ? (', 'verification drag panel');
  assert.match(verifyPanel, /payloadPrefix="mathmaster-verification:"/);
  assert.match(verifyPanel, /armVerificationValue/);
  assert.match(verifyPanel, /VariableDropEquation/);
  assert.doesNotMatch(verifyPanel, />Place \{v\} = \{solution\[v\]\}</);
});

test('verification arithmetic uses MathInput so exact stacked-fraction entries remain available', () => {
  const verifyPanel = region(modeSource, "Verify the ordered pair in both original equations", 'readyToSubmit ? (', 'verification arithmetic');
  assert.match(verifyPanel, /<MathInput/);
  assert.match(modeSource, /numericVerificationEntry/);
  assert.match(modeSource, /latexToExpression\(value\)/);
});

test('the systems work trail compresses completed mathematical decisions instead of keeping every stage full-size', () => {
  assert.match(modeSource, /function SystemsWorkTrail/);
  assert.match(modeSource, /mathmaster-systems-completed-work/);
  assert.match(modeSource, /workTrailStages/);
  assert.match(modeSource, /Equation \$\{Number\(substitution\.targetEquationIndex/);
});

test('elimination visually aligns equations and crosses the student-selected target column only after a successful combination', () => {
  assert.match(modeSource, /function AlignedEquationRow/);
  assert.match(modeSource, /is-target-column/);
  assert.match(modeSource, /is-cancelled/);
  assert.match(modeSource, /combinationLocked && !firstSolvedDone/);
});


test('V5 solveSystem intent preserves the algebraic systemsWorkspace contract', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Algebraic systems V5 compile',
      courseId: 'algebra2',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'classwork',
    },
    sections: [{
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A2.3A',
        prompt: 'Use substitution to solve the system.',
        studentActions: ['solveSystem'],
        mode: 'algebraic',
        method: 'substitution',
        equations: ['y = -4x + 12', '2x + y = 2'],
        variables: ['x', 'y'],
        requireVerification: true,
        askEfficiency: false,
      }],
    }],
  });

  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'systemsWorkspace');
  assert.equal(question.mode, 'algebraic');
  assert.equal(question.method, 'substitution');
  assert.deepEqual(question.equations, ['y = -4x + 12', '2x + y = 2']);
  assert.deepEqual(question.variables, ['x', 'y']);
  assert.equal(question.requireVerification, true);
  assert.equal(question.askEfficiency, false);
  assert.equal(validateToolQuestion(question).isValid, true);
});
