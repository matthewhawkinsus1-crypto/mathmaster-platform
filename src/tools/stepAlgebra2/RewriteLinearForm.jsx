import React, { useCallback, useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure';
import { useActiveUndoOwner } from '../../platform/workView/useMathUndoHistory';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import StepByStepAlgebraCore from '../../StepByStepAlgebraCore';
import AlgebraWorkSteps from '../../AlgebraWorkSteps';
import {
  buildInitialEquationState,
  describeRewriteGap,
} from './rewriteLinearFormMath';

/*
 * REWRITING A LINE IS DONE IN THE SAME STEP ALGEBRA WORKSPACE AS EVERYTHING ELSE.
 *
 * This mode used to be its own small island: a +/−/×/÷ form, and a generic
 * "type the equivalent side" box that let (and made) the student type the
 * finished y = -(5/2)x + 3 or y = 15(x - 3) instead of doing the algebra. It
 * now hosts the mature StepByStepAlgebraCore — balanced placement, cancellation,
 * distribution, combine like terms, and the structure tools (Factor, Split
 * fraction, Cancel factors, Simplify arithmetic, Arrange terms) — with the
 * target form as the objective. What stays here is what this mode adds: the
 * goal chips, the Check button, and the student's described steps.
 *
 * Persistence: the core keeps its own per-question draft (equation, open tool,
 * step log). The earlier `rewriteEquationState` / `rewriteHistory` tool state is
 * kept as a mirror, so a student who started on the old island continues from
 * the equation and history they left — nothing is lost in the move.
 */

const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };

const GAP_MESSAGES = {
  isolateVariable: 'y is not isolated on the left side yet. Use a balanced operation, then cancel until the left side is plain y.',
  variableOnBothSides: 'y still appears on the right side. It needs to end up only on the left.',
  needsSimplification: 'This is equivalent to the target line, but it is not yet written as y = mx + b. Split a fraction, cancel common factors, or combine like terms.',
  needsFactoring: 'This is equivalent, but the right side is not yet a number times (x − c). Use Factor to pull out a common factor.',
  domainChange: 'That expression changes the domain by putting a variable in a denominator. Use a rewrite that is defined for every original input.',
};

const stepsAreUsable = (steps) => (Array.isArray(steps) ? steps : []).filter((step) => (
  step?.before?.left != null && step?.before?.right != null && step?.after?.left != null && step?.after?.right != null
));

export default function RewriteLinearForm({ questionData = {}, onAction, draftKey = null }) {
  const targetForm = questionData.targetForm === 'factoredLinear' ? 'factoredLinear' : 'slopeIntercept';
  const factoredTarget = targetForm === 'factoredLinear';
  const initialEquationState = useMemo(() => buildInitialEquationState(questionData), [questionData]);
  // Mirrors of the core's committed equation and step log (see above).
  const [equationState, setEquationState] = usePersistentToolState('rewriteEquationState', initialEquationState);
  const [history, setHistory] = usePersistentToolState('rewriteHistory', []);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const [coreUndo, setCoreUndo] = useState(null);

  const objective = useMemo(() => ({
    kind: targetForm,
    variable: 'y',
    targetForm,
    // Slope-intercept is graded on its written form: y = (6 - 5x)/2 is
    // equivalent but not finished. Factored form is always structural.
    requireSimplifiedFinalForm: targetForm === 'slopeIntercept',
  }), [targetForm]);

  const coreQuestion = useMemo(() => ({
    id: questionData.questionId ?? questionData.id ?? null,
    questionId: questionData.questionId ?? null,
    prompt: questionData.prompt || '',
    leftExpression: initialEquationState.left,
    rightExpression: initialEquationState.right,
    solveFor: 'y',
    objective,
    workspaceDifficulty: questionData.workspaceDifficulty,
    showHint: false,
  }), [questionData.questionId, questionData.id, questionData.prompt, questionData.workspaceDifficulty, initialEquationState, objective]);

  // Captured once: where a student who began on the earlier rewrite screen left
  // off. Used only when the core has no draft of its own yet.
  const [legacyStart] = useState(() => {
    const moved = equationState?.left && equationState?.right
      && (equationState.left !== initialEquationState.left || equationState.right !== initialEquationState.right);
    return {
      record: moved ? { algebraState: { equation: { left: equationState.left, right: equationState.right, variable: 'y', objective } } } : null,
      steps: stepsAreUsable(history),
    };
  });

  const coreDraftKey = draftKey ? `${draftKey}:rewrite-linear-form` : null;

  // useToolSubmission hands back a new clearFeedback every render; reading it
  // through a ref keeps this callback stable, so the core's report effect runs
  // once per real equation change rather than once per render.
  const clearFeedbackRef = useRef(clearFeedback);
  clearFeedbackRef.current = clearFeedback;
  const reportedEquationRef = useRef(null);
  const handleEquationChange = useCallback((equation) => {
    const key = `${equation.left} = ${equation.right}`;
    if (reportedEquationRef.current === key) return;
    const firstReport = reportedEquationRef.current === null;
    reportedEquationRef.current = key;
    setEquationState({ left: equation.left, right: equation.right, variable: 'y', objective });
    // A new equation makes an earlier Check result stale.
    if (!firstReport) clearFeedbackRef.current?.();
  }, [setEquationState, objective]);
  const handleWorkSteps = useCallback((steps) => setHistory(steps), [setHistory]);
  const ignoreStateChange = useCallback(() => {}, []);

  // The open Step Algebra owns Undo whenever it has something to undo — a
  // transient decision (a chosen prime, a placed denominator) or a committed
  // step, whose history entry it removes in the same move.
  useActiveUndoOwner({
    id: 'rewrite-linear-form-step-algebra',
    active: Boolean(coreUndo?.canUndo),
    priority: 50,
    controller: coreUndo,
  });

  const gap = describeRewriteGap({ ...equationState, objective });
  const complete = gap === null;
  const leftIsolated = gap !== 'isolateVariable';
  const noVariableOnRight = leftIsolated && gap !== 'variableOnBothSides';

  const check = () => {
    const score = complete ? 1 : ['needsSimplification', 'needsFactoring'].includes(gap) ? 0.75 : gap === 'variableOnBothSides' ? 0.4 : history.length ? 0.15 : 0;
    submit({ isCorrect: complete, score }, { equationState, history }, { mode: 'rewriteLinearForm', gap });
  };

  const feedbackMessage = () => {
    if (feedback.isCorrect) return `Correct — that is equivalent to the original equation and written in ${factoredTarget ? 'factored linear' : 'slope-intercept'} form.`;
    return GAP_MESSAGES[feedback.metadata?.gap] || 'Not yet — keep transforming the equation.';
  };

  const goalChip = (done, label) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999,
      background: done ? '#e6f4ea' : '#f1f3f4', color: done ? '#137333' : '#5f6b7a', fontWeight: 800, fontSize: 12,
    }}>
      {done ? '✓' : '○'} {label}
    </span>
  );

  const formName = factoredTarget ? 'factored linear' : 'slope-intercept';
  const formLatexText = factoredTarget ? 'y = a(x − c)' : 'y = mx + b';

  const activity = (
    <ToolShell
      title="Rewriting a Linear Equation"
      subtitle={`Transform the equation one equivalent step at a time until it reads ${formLatexText}.`}
      badge={`Rewrite to ${formName} form`}
    >
      <TaskCard
        question={questionData}
        task={`Rewrite the given equation in ${formName} form (${formLatexText}).`}
        steps={factoredTarget ? [
          'Get y alone on the left with balanced operations.',
          'Use Factor: choose the terms, write them as primes, choose the factors every term shares, and pull them out.',
          'Write what is left of each term inside the parentheses. Press Check equation.',
        ] : [
          'Get y alone on the left with balanced operations and cancellation.',
          'If a whole numerator sits over one denominator, use Split fraction, then Cancel factors in each fraction.',
          'Optionally Arrange terms into mx + b. Press Check equation.',
        ]}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 8px' }}>
        {goalChip(leftIsolated, 'y isolated on the left')}
        {goalChip(noVariableOnRight, 'No y on the right')}
        {goalChip(complete, factoredTarget ? 'Written as y = a(x − c)' : 'Written as y = mx + b')}
      </div>

      <div className="mathmaster-rewrite-linear-form-workspace">
        <StepByStepAlgebraCore
          key={`${coreDraftKey || 'local'}:${targetForm}:${initialEquationState.left}=${initialEquationState.right}`}
          question={coreQuestion}
          questionRecord={legacyStart.record}
          draftKey={coreDraftKey}
          onStateChange={ignoreStateChange}
          onStepGrade={null}
          onUndoStateChange={setCoreUndo}
          onEquationChange={handleEquationChange}
          onWorkStepsChange={handleWorkSteps}
          initialWorkSteps={legacyStart.steps}
          showPrompt={false}
        />
      </div>

      <button type="button" onClick={check} style={{ ...primaryButton, marginTop: 8, width: '100%', background: complete ? '#137333' : '#1a73e8' }}>
        Check equation
      </button>

      {feedback ? (
        <div style={{ marginTop: 12 }}>
          <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
          <p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>{feedbackMessage()}</p>
        </div>
      ) : null}

      <Panel title="Your steps">
        {history.length ? <AlgebraWorkSteps steps={history} /> : (
          <p style={{ color: '#5f6b7a', margin: 0 }}>
            Each committed step appears here in words and as an equation. Undo removes the latest one together with its equation.
          </p>
        )}
        <HintPanel
          hints={factoredTarget ? [
            'Look for a number that divides every coefficient on the right side.',
            'Write each term as a product of primes, then choose the primes that appear in every term.',
            'After pulling out the common factor, divide each term by it — that is what goes inside the parentheses.',
          ] : [
            'First get every y-term alone on one side by adding or subtracting the x-term from both sides.',
            'Divide both sides by the coefficient of y — watch the sign if that coefficient is negative.',
            'If the right side is one fraction over a single denominator, split it, then cancel common factors in each piece.',
          ]}
          onHintUsed={() => onAction?.('HINT_USED')}
        />
      </Panel>
    </ToolShell>
  );

  return (
    <EnlargeableFigure
      label="Rewrite linear form working activity"
      enlargeLabel="Enlarge algebra workspace"
      style={{ width: '100%' }}
      taskText={`Rewrite the given equation in ${formName} form.`}
      capabilities={{
        undo: {
          label: '↶ Undo',
          title: coreUndo?.label || 'Undo the last algebra step',
          onAction: () => coreUndo?.onUndo?.(),
          disabled: !coreUndo?.canUndo,
          studentState: true,
        },
        equationInput: { label: 'Both sides of the equation', studentState: true },
        numericControls: { label: 'Operation and structure controls', studentState: true },
        instruction: { text: `Apply balanced operations and structural steps until ${formLatexText}.` },
        task: { text: `Rewrite the given equation in ${formName} form.` },
        help: { content: factoredTarget ? 'Isolate y, then factor: choose the common factor yourself and write what remains in each term.' : 'Isolate y, then split, cancel and arrange the right side into mx + b.' },
        primaryActions: [{ id: 'check-rewrite-linear-form', label: 'Check equation', onAction: check }],
      }}
    >
      {activity}
    </EnlargeableFigure>
  );
}
