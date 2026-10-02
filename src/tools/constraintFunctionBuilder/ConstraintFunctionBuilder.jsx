import React, { useCallback, useMemo } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel, ToolSplit } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import useToolSubmission from '../shared/useToolSubmission';
import { useHintsAllowed, useToolRuntimeContext } from '../shared/ToolRuntimeContext';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import constraintFunctionGrader from '../../../functions/shared/serverGrading/tools/constraintFunctionBuilder.mjs';
import {
  builderAllowedFamilies,
  builderAsksGraphType,
  builderEquation,
  constraintChecklistView,
  effectiveBuilderConstraints,
  evaluateBuilderModel,
  initialBuilderModel,
  normalizeBuilderModel,
  scoreConstraintModel,
} from './constraintFunctionMath';
import { UNANSWERED } from '../shared/judgmentChoices.js';

const inputStyle = { width: '100%', minHeight: 42, boxSizing: 'border-box', padding: 9, border: '1px solid #c9d6e8', borderRadius: 8, fontSize: 15, background: 'var(--mm-surface)' };
const primary = { minHeight: 46, padding: '10px 17px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const FAMILY_LABELS = { linear: 'Linear', quadratic: 'Quadratic', exponential: 'Exponential', absolute: 'Absolute value', verticalLine: 'Vertical line (not a function)' };

// Named so the panel and the Work View Help drawer read from one list rather
// than drifting into two sets of hints for the same tool.
const DEFAULT_HINTS = [
  'Start with the family: a straight line, a U-shaped curve, and exponential growth/decay do not share the same structure.',
  'For a linear model, the sign of the slope controls increasing versus decreasing. For a quadratic or absolute-value model, the sign of a controls maximum versus minimum.',
  'For an exponential model, a base between 0 and 1 gives decay when a is positive; a base greater than 1 gives growth.',
];

const numericField = (label, value, setter, step = 1) => (
  <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#3c4756' }}>{label}<input type="number" step={step} value={value} onChange={(event) => setter(Number(event.target.value))} style={inputStyle} /></label>
);

export default function ConstraintFunctionBuilder({ questionData = {}, onAction }) {
  // The families on offer, the opening model (an open-construction question
  // never opens on a valid answer, and a graph type the question asks about
  // opens unanswered) and the constraints in the checklist all come from the
  // shared definitions the grader reads.
  const allowedFamilies = builderAllowedFamilies(questionData);
  const initial = initialBuilderModel(questionData);
  // Where a constraint asks "continuous or discrete?", the graph type is the
  // student's judgment: the select offers "Choose…" (judgmentChoices.js).
  const asksGraphType = builderAsksGraphType(questionData.constraints);
  const [model, setModel] = usePersistentToolState('model', initial);
  const [hasEdited, setHasEdited] = usePersistentToolState('hasEdited', false);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const hintsAllowed = useHintsAllowed();
  // The checklist reads the AUTHORED wording, exactly as the grader does: a
  // translated prompt never changes which constraints are checked.
  const effectiveConstraints = useMemo(
    () => effectiveBuilderConstraints({
      prompt: questionData.prompt,
      authoredPrompt: questionData.authoredPrompt,
      constraints: questionData.constraints,
    }),
    [questionData.constraints, questionData.prompt, questionData.authoredPrompt],
  );
  const bounds = questionData.graph || { xMin: -8, xMax: 8, yMin: -8, yMax: 8 };
  const discreteXs = useMemo(() => {
    const low = Math.ceil(Math.min(model.domainMin, model.domainMax));
    const high = Math.floor(Math.max(model.domainMin, model.domainMax));
    const values = [];
    for (let x = low; x <= high && values.length < 40; x += 1) values.push(x);
    return values;
  }, [model.domainMin, model.domainMax]);
  const discretePoints = model.domainMode === 'discrete' && model.family !== 'verticalLine'
    ? discreteXs.map((x) => [x, evaluateBuilderModel(model, x)]).filter(([, y]) => Number.isFinite(y))
    : [];
  const functions = model.domainMode === 'continuous' && model.family !== 'verticalLine'
    ? [(x) => evaluateBuilderModel(model, x)]
    : [];
  const verticalLines = model.family === 'verticalLine' ? [model.verticalX] : [];
  const liveScore = scoreConstraintModel(model, effectiveConstraints);
  // Live ticks only where outcomes are shown at once (constraintChecklistView).
  const { showImmediateFeedback } = useToolRuntimeContext();
  const checklist = constraintChecklistView({ parts: liveScore.parts, showImmediateFeedback });

  /*
   * UNIVERSAL UNDO OVER THE CONSTRUCTED MODEL.
   *
   * Building here is a sequence of small parameter moves against a checklist,
   * which is precisely the shape of work a student wants to step back through:
   * nudge a, watch a constraint go green, nudge h, watch a different one go red.
   * `hasEdited` rides along in the snapshot because it gates submission — undoing
   * back to the untouched model must also take the submit button back to
   * disabled, or the tool would accept a model the student never constructed.
   */
  const mathState = useMemo(() => ({ model, hasEdited }), [model, hasEdited]);
  const restoreMathState = useCallback((previous) => {
    if (!previous) return;
    clearFeedback();
    setModel(normalizeBuilderModel(previous.model));
    setHasEdited(Boolean(previous.hasEdited));
  }, [clearFeedback]);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the last change to your model',
    state: mathState,
    onRestore: restoreMathState,
    resetKey: questionUndoResetKey(questionData),
  });

  const set = (patch) => {
    clearFeedback();
    setHasEdited(true);
    setModel((current) => normalizeBuilderModel({ ...current, ...patch }));
  };
  // The student's work, exactly as the shared grader reads it. `hasEdited` is
  // part of it: the builder never submits an untouched model, and a deadline
  // must not either.
  const work = useMemo(() => ({ model, hasEdited, equation: builderEquation(model) }), [model, hasEdited]);
  useReportToolWork(work);
  const check = () => {
    if (!hasEdited) return;
    const result = gradeToolCheck(constraintFunctionGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'default', parts: result.parts });
  };

  const workspaceCapabilities = {
    undo: undoHistory.capability,
    numericControls: { label: 'Family and parameters', studentState: true },
    equationInput: { label: builderEquation(model), studentState: true },
    instruction: { text: 'Adjust the family and its parameters until every constraint in the checklist is satisfied.' },
    task: { text: questionData.prompt || 'Build any relation that satisfies every stated characteristic.' },
    // The hints ARE this Help: published only where the activity allows them,
    // so a DOL does not show a Help button over an empty drawer.
    help: hintsAllowed ? {
      content: (
        <HintPanel hints={questionData.hints || DEFAULT_HINTS} onHintUsed={() => onAction?.('HINT_USED')} />
      ),
    } : null,
    primaryActions: [{ id: 'submit-model', label: 'Submit this model', onAction: check, disabled: !hasEdited }],
  };

  return (
    <ToolShell title="Constraint-Based Function Builder" subtitle="There is not one secret equation. Build any relation that satisfies every stated characteristic." badge="Many correct answers">
      <TaskCard
        question={questionData}
        task="Choose a family and adjust its parameters until the graph satisfies every constraint. Then submit your constructed model."
        steps={[
          'Read the characteristics first — identify which families are even possible.',
          'Choose a family, then adjust the coefficients/parameters while watching the graph update.',
          showImmediateFeedback !== false
            ? 'Use the constraint checklist as a target, not as an answer key: it tells you which properties are satisfied, not what numbers to choose.'
            : 'Use the constraint checklist as your target: every characteristic on it must be true of your model. It is checked when you submit.',
          'Submit when every constraint is satisfied.',
        ]}
      />

      {/* The graph and the parameters that move it are one activity: enlarging
          the curve without the coefficient fields beside it would leave a
          student watching a graph they cannot change. */}
      <EnlargeableFigure
        label="Function construction workspace"
        enlargeLabel="Enlarge workspace"
        taskText={questionData.prompt || ''}
        style={{ width: '100%' }}
        capabilities={workspaceCapabilities}
      >
      <ToolSplit>
        <Panel title="Live graph">
          <CoordinatePlane
            xMin={Number(bounds.xMin ?? -8)} xMax={Number(bounds.xMax ?? 8)} yMin={Number(bounds.yMin ?? -8)} yMax={Number(bounds.yMax ?? 8)}
            functions={functions} points={discretePoints} verticalLines={verticalLines}
            ariaLabel="Graph of the relation you are constructing"
            enlargeable={false}
          />
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: '#f4f8ff', color: '#174ea6', fontWeight: 900, overflowWrap: 'anywhere' }}>{builderEquation(model)}</div>
          {model.domainMode === 'discrete' && <div style={{ marginTop: 7, fontSize: 12, color: '#5f6b7a' }}>Discrete integer domain shown from {Math.min(model.domainMin, model.domainMax)} through {Math.max(model.domainMin, model.domainMax)}.</div>}
          {model.domainMode === UNANSWERED && model.family !== 'verticalLine' && <div style={{ marginTop: 7, fontSize: 12, color: '#5f6b7a' }}>Choose a graph type to draw your relation.</div>}
        </Panel>

        <Panel title="Build the relation">
          <label style={{ display: 'block', marginBottom: 11, fontSize: 13, fontWeight: 800, color: '#3c4756' }}>Family<select value={model.family} onChange={(event) => set({ family: event.target.value })} style={inputStyle}>{allowedFamilies.map((family) => <option value={family} key={family}>{FAMILY_LABELS[family]}</option>)}</select></label>
          <label style={{ display: 'block', marginBottom: 11, fontSize: 13, fontWeight: 800, color: '#3c4756' }}>Graph type<select value={model.domainMode} onChange={(event) => set({ domainMode: event.target.value })} style={inputStyle}>{asksGraphType || model.domainMode === UNANSWERED ? <option value={UNANSWERED}>Choose…</option> : null}<option value="continuous">Continuous</option><option value="discrete">Discrete</option></select></label>

          {model.family === 'linear' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{numericField('Slope m', model.a, (a) => set({ a }), 0.5)}{numericField('y-intercept b', model.k, (k) => set({ k }), 0.5)}</div>}
          {['quadratic', 'absolute'].includes(model.family) && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>{numericField('a', model.a, (a) => set({ a }), 0.5)}{numericField('h', model.h, (h) => set({ h }), 0.5)}{numericField('k', model.k, (k) => set({ k }), 0.5)}</div>}
          {model.family === 'exponential' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>{numericField('a', model.a, (a) => set({ a }), 0.5)}{numericField('base b', model.base, (base) => set({ base: Math.max(0.1, base) }), 0.1)}{numericField('horizontal shift h', model.h, (h) => set({ h }), 0.5)}{numericField('vertical shift k', model.k, (k) => set({ k }), 0.5)}</div>}
          {model.family === 'verticalLine' && numericField('Vertical line x =', model.verticalX, (verticalX) => set({ verticalX }), 0.5)}
          {model.domainMode === 'discrete' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>{numericField('Smallest integer x', model.domainMin, (domainMin) => set({ domainMin }))}{numericField('Largest integer x', model.domainMax, (domainMax) => set({ domainMax }))}</div>}

          <div style={{ marginTop: 15 }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Constraint checklist</strong>
            <div style={{ display: 'grid', gap: 7 }}>
              {checklist.map((item) => <div key={item.id} data-constraint-satisfied={item.satisfied === null ? 'withheld' : String(item.satisfied)} style={{ padding: '8px 10px', borderRadius: 8, background: item.satisfied ? '#e6f4ea' : '#f8f9fa', color: item.satisfied ? '#137333' : '#5f6368', border: `1px solid ${item.satisfied ? '#a8dab5' : '#d9e2f1'}`, fontWeight: 800 }}>{item.mark} {item.label}</div>)}
            </div>
            {checklist.length > 0 && checklist[0].satisfied === null ? (
              <div style={{ marginTop: 7, fontSize: 12, color: '#5f6368' }}>Your model must satisfy every characteristic above. It is checked when you submit.</div>
            ) : null}
          </div>

          <button
            data-mm-enter-action="submit"
            type="button"
            onClick={check}
            disabled={!hasEdited}
            style={{
              ...primary,
              marginTop: 15,
              width: '100%',
              opacity: hasEdited ? 1 : 0.5,
              cursor: hasEdited ? 'pointer' : 'not-allowed',
            }}
          >
            Submit this model
          </button>
          {!hasEdited && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#5f6368', textAlign: 'center' }}>
              Make at least one mathematical choice or parameter change before submitting.
            </div>
          )}
          {feedback && <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'All constraints satisfied' : 'Keep refining the model'}</ResultPill></div>}
          <HintPanel hints={questionData.hints || DEFAULT_HINTS} onHintUsed={() => onAction?.('HINT_USED')} />
        </Panel>
      </ToolSplit>
      </EnlargeableFigure>
    </ToolShell>
  );
}
