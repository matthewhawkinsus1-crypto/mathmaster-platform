import React, { useCallback, useMemo, useRef, useState } from 'react';
import StepByStepAlgebraCore from '../../../StepByStepAlgebraCore.jsx';
import { useActiveUndoOwner } from '../../../platform/workView/useMathUndoHistory.js';
import { describeRewriteGap } from '../../stepAlgebra2/rewriteLinearFormMath.js';
import { ChoiceChips, Latex, ProcessField, ProcessMessage, muted, touchButton } from './processUi.jsx';
import {
  factDisplay,
  lmrRewriteQuestion,
  lmrSubstitutionLatex,
  lmrSubstitutionQuestion,
  processFeedback,
  questionEquationLatex,
  slopeInterceptLatexOf,
} from '../lmrProcessMath.js';

/*
 * THE TWO PROCESSES THAT ARE ALGEBRA: SOLVE FOR y, AND SUBSTITUTE 0 AND SOLVE.
 *
 * Neither is rebuilt here. Each opens the platform's own Step Algebra
 * workspace (StepByStepAlgebraCore) — balanced operations, distribution,
 * cancellation, structure tools — on exactly the equation the shared marking
 * checks it against (lmrRewriteQuestion, lmrSubstitutionQuestion), so the
 * steps the student takes are the steps the server re-checks. The workspace
 * keeps its own draft under the question's draft key, keyed by the equation it
 * opened, so a refresh brings the algebra back and a different equation never
 * inherits another's steps.
 *
 * While the workspace has a step to take back, the platform Undo belongs to it
 * (as in every tool that embeds it); otherwise Undo stays the board's.
 */

// A short, stable name for an equation, for its workspace's draft key.
const identity = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One embedded Step Algebra workspace, reporting what the student has done in
 * it — the equation now on screen, the equation after each step, whether the
 * objective is reached — to the process around it. Reports only work, never a
 * verdict: whether that work establishes anything is the shared marking's.
 */
function EmbeddedSolver({ question, title, solverKey, draftKey, onLive, disabled }) {
  const [coreUndo, setCoreUndo] = useState(null);
  useActiveUndoOwner({ id: 'lmr-process-step-algebra', active: Boolean(coreUndo?.canUndo), priority: 50, controller: coreUndo });
  // The core reports from its effects; stable handlers keep each report to one
  // per real change, and the latest callback is read through a ref.
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  const liveRef = useRef({ solverKey, eq: null, steps: [], solved: false, solvedLatex: '' });
  if (liveRef.current.solverKey !== solverKey) liveRef.current = { solverKey, eq: null, steps: [], solved: false, solvedLatex: '' };
  const report = (patch) => {
    const next = { ...liveRef.current, ...patch };
    if (sameJson(next, liveRef.current)) return;
    liveRef.current = next;
    onLiveRef.current?.(next);
  };
  const reportRef = useRef(report);
  reportRef.current = report;
  const handleEquation = useCallback((equation) => {
    reportRef.current({ eq: { left: String(equation.left), right: String(equation.right) } });
  }, []);
  const handleSteps = useCallback((steps) => {
    const after = (Array.isArray(steps) ? steps : [])
      .map((step) => step?.after)
      .filter((equation) => equation?.left != null && equation?.right != null)
      .map((equation) => ({ left: String(equation.left), right: String(equation.right) }));
    reportRef.current({ steps: after });
  }, []);
  const handleState = useCallback((payload) => {
    const part = (payload?.parts || []).find((entry) => entry?.id === 'algebra-objective');
    // Reached the form the workspace asks for — never "is it right", which
    // is not this workspace's to say where outcomes are withheld.
    reportRef.current({ solved: Boolean(part?.isComplete), solvedLatex: part?.isComplete ? String(part.response || '') : '' });
  }, []);
  return (
    <div data-process-algebra="true" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <StepByStepAlgebraCore
        embedded
        embeddedTitle={title}
        key={solverKey}
        question={question}
        questionRecord={null}
        draftKey={draftKey}
        onStateChange={handleState}
        onStepGrade={null}
        onUndoStateChange={setCoreUndo}
        onEquationChange={handleEquation}
        onWorkStepsChange={handleSteps}
        showPrompt={false}
        disabled={disabled}
      />
      <div>
        <button
          type="button"
          onClick={() => coreUndo?.onUndo?.()}
          disabled={disabled || !coreUndo?.canUndo}
          style={touchButton}
          title={coreUndo?.label || 'Undo the last algebra step'}
        >
          ↶ Undo step
        </button>
      </div>
    </div>
  );
}

const goalChip = (done, label) => (
  <span
    key={label}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999,
      background: done ? '#e6f4ea' : '#f1f3f4', color: done ? '#137333' : '#5f6b7a', fontWeight: 800, fontSize: 12,
    }}
  >
    {done ? '✓' : '○'} {label}
  </span>
);

/** Solve the GIVEN equation for y, in Step Algebra, until it reads y = mx + b. */
export function SolveForYMethod({ env, description, draftKeyBase, live, onLive, disabled }) {
  const question = useMemo(() => {
    const built = lmrRewriteQuestion(env);
    return built ? { ...built, prompt: 'Solve for y.' } : null;
  }, [env]);
  if (!question) return <ProcessMessage>This equation cannot be opened in the algebra workspace.</ProcessMessage>;
  const solverKey = `solve-y-${identity(`${question.leftExpression}=${question.rightExpression}`)}`;
  const current = live?.solverKey === solverKey ? live : null;
  let gap = 'isolateVariable';
  try {
    gap = current?.eq ? describeRewriteGap({ ...current.eq, objective: question.objective }) : 'isolateVariable';
  } catch {
    gap = 'isolateVariable';
  }
  const leftIsolated = gap !== 'isolateVariable';
  const noYOnRight = leftIsolated && gap !== 'variableOnBothSides';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <p style={{ ...muted, color: '#24324a' }}>
        Solve <Latex value={description?.latex || questionEquationLatex(question)} /> for <Latex value="y" /> until it reads <Latex value="y = mx + b" />.
        Then you can read the slope and y-intercept from your own equation.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {goalChip(leftIsolated, 'y alone on the left')}
        {goalChip(noYOnRight, 'No y on the right')}
        {goalChip(gap === null, 'Written as y = mx + b')}
      </div>
      <EmbeddedSolver
        question={question}
        title="Solve for y"
        solverKey={solverKey}
        draftKey={draftKeyBase ? `${draftKeyBase}:${solverKey}` : null}
        onLive={onLive}
        disabled={disabled}
      />
    </div>
  );
}

const ZERO_CHOICES = [
  { value: 'x', label: <Latex value="x = 0" /> },
  { value: 'y', label: <Latex value="y = 0" /> },
];

const factsKey = (facts) => JSON.stringify([facts?.siEquation?.value || null, facts?.slope?.value || null, facts?.yIntercept?.value || null]);

/**
 * Substitute 0 for one variable and solve for the other — in the GIVEN, in the
 * student's own y = mx + b, or in the one their slope and y-intercept make —
 * then write the intercept as an ordered pair.
 */
export function SubstituteZeroMethod({ env, option, target, facts, ev, setEv, fieldStatus, disabled, canCheck, draftKeyBase, live, onLive, description }) {
  const zero = ev?.zero === 'x' || ev?.zero === 'y' ? ev.zero : null;
  const factsIdentity = factsKey(facts);
  const question = useMemo(
    () => (zero ? lmrSubstitutionQuestion(env, option.source, zero, facts) : null),
    // The facts it reads, by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [env, option.source, zero, factsIdentity],
  );
  const expected = target === 'xIntercept' ? 'y' : 'x';
  // With guided feedback a substitution aimed at the wrong axis is named at
  // once, before any algebra is spent on it. Where outcomes are withheld the
  // student's choice stands and is marked with the rest.
  const redirect = canCheck && zero && zero !== expected ? processFeedback(target === 'xIntercept' ? 'zero-wrong-x' : 'zero-wrong-y') : '';
  const solverKey = question ? `sub-${target}-${option.source}-${zero}-${identity(question.equation)}` : null;
  const current = solverKey && live?.solverKey === solverKey ? live : null;
  const sourceLine = (() => {
    if (option.source === 'siEquation') return <>Use your equation <Latex value={factDisplay(facts?.siEquation)} />.</>;
    if (option.source === 'facts') {
      const latex = facts?.slope?.value && facts?.yIntercept?.value ? slopeInterceptLatexOf(facts.slope.value, facts.yIntercept.value) : '';
      return latex ? <>Use <Latex value="y = mx + b" /> with your slope and y-intercept: <Latex value={latex} />.</> : null;
    }
    return description?.latex ? <>Use the GIVEN <Latex value={description.latex} />.</> : null;
  })();
  const pointLabel = target === 'xIntercept' ? 'The x-intercept' : 'The y-intercept';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {sourceLine ? <p style={{ ...muted, color: '#24324a' }}>{sourceLine}</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#24324a' }}>
          {target === 'xIntercept' ? 'At the x-intercept, which variable is 0?' : 'At the y-intercept, which variable is 0?'}
        </span>
        <ChoiceChips
          label="Which variable is 0"
          name="zero"
          options={ZERO_CHOICES}
          value={zero}
          disabled={disabled}
          onChange={(value) => {
            onLive?.(null);
            setEv((previous) => ({ ...previous, zero: value, point: '' }));
          }}
        />
      </div>
      {redirect ? <ProcessMessage>{redirect}</ProcessMessage> : null}
      {question && !redirect ? (
        <>
          <p style={{ ...muted, color: '#24324a' }}>
            Substituted: <Latex value={lmrSubstitutionLatex(env, option.source, zero, facts) || questionEquationLatex(question)} /> — now solve for <Latex value={question.solveFor} />.
          </p>
          <EmbeddedSolver
            question={question}
            title={`Solve for ${question.solveFor}`}
            solverKey={solverKey}
            draftKey={draftKeyBase ? `${draftKeyBase}:${solverKey}` : null}
            onLive={onLive}
            disabled={disabled}
          />
          {current?.solved ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ ...muted, color: '#24324a' }}>
                Solved: <Latex value={current.solvedLatex} />. Now write {pointLabel.toLowerCase()} as an ordered pair.
              </p>
              <ProcessField
                field="point"
                label={pointLabel}
                profile="orderedPair"
                placeholder="(x, y)"
                value={ev?.point ?? ''}
                status={fieldStatus('point')}
                disabled={disabled}
                onChange={(next) => setEv((previous) => ({ ...previous, point: next }))}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
