import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel, ToolSplit } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import useToolSubmission from '../shared/useToolSubmission';
import {
  BUILDER_FAMILIES,
  builderEquation,
  evaluateBuilderModel,
  normalizeBuilderModel,
  scoreConstraintModel,
} from './constraintFunctionMath';

const inputStyle = { width: '100%', minHeight: 42, boxSizing: 'border-box', padding: 9, border: '1px solid #c9d6e8', borderRadius: 8, fontSize: 15, background: '#fff' };
const primary = { minHeight: 46, padding: '10px 17px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const FAMILY_LABELS = { linear: 'Linear', quadratic: 'Quadratic', exponential: 'Exponential', absolute: 'Absolute value', verticalLine: 'Vertical line (not a function)' };

const numericField = (label, value, setter, step = 1) => (
  <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#3c4756' }}>{label}<input type="number" step={step} value={value} onChange={(event) => setter(Number(event.target.value))} style={inputStyle} /></label>
);

export default function ConstraintFunctionBuilder({ questionData = {}, onAction }) {
  const allowedFamilies = (questionData.allowedFamilies || BUILDER_FAMILIES).filter((family) => BUILDER_FAMILIES.includes(family));
  const hasAuthoredInitialModel = questionData.initialModel && typeof questionData.initialModel === 'object';
  const initial = normalizeBuilderModel({
    family: allowedFamilies[0] || 'linear',
    // An open-construction question must not open on a fully valid answer.
    // A zero leading coefficient intentionally collapses linear/quadratic/
    // absolute/exponential defaults until the student actually constructs one.
    ...(hasAuthoredInitialModel ? questionData.initialModel : { a: 0, h: 0, k: 0 }),
  });
  const [model, setModel] = useState(initial);
  const [hasEdited, setHasEdited] = useState(false);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
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
  const liveScore = scoreConstraintModel(model, questionData.constraints || []);

  const set = (patch) => {
    clearFeedback();
    setHasEdited(true);
    setModel((current) => normalizeBuilderModel({ ...current, ...patch }));
  };
  const check = () => {
    if (!hasEdited) return;
    const result = scoreConstraintModel(model, questionData.constraints || []);
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      { model, equation: builderEquation(model) },
      { parts: result.parts.map((part) => ({ id: part.id, label: part.label, isComplete: true, isCorrect: part.isCorrect })) },
    );
  };

  return (
    <ToolShell title="Constraint-Based Function Builder" subtitle="There is not one secret equation. Build any relation that satisfies every stated characteristic." badge="Many correct answers">
      <TaskCard
        question={questionData}
        task="Choose a family and adjust its parameters until the graph satisfies every constraint. Then submit your constructed model."
        steps={[
          'Read the characteristics first — identify which families are even possible.',
          'Choose a family, then adjust the coefficients/parameters while watching the graph update.',
          'Use the constraint checklist as a target, not as an answer key: it tells you which properties are satisfied, not what numbers to choose.',
          'Submit when every constraint is satisfied.',
        ]}
      />

      <ToolSplit>
        <Panel title="Live graph">
          <CoordinatePlane
            xMin={Number(bounds.xMin ?? -8)} xMax={Number(bounds.xMax ?? 8)} yMin={Number(bounds.yMin ?? -8)} yMax={Number(bounds.yMax ?? 8)}
            functions={functions} points={discretePoints} verticalLines={verticalLines}
            ariaLabel="Graph of the relation you are constructing"
          />
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: '#f4f8ff', color: '#174ea6', fontWeight: 900, overflowWrap: 'anywhere' }}>{builderEquation(model)}</div>
          {model.domainMode === 'discrete' && <div style={{ marginTop: 7, fontSize: 12, color: '#5f6b7a' }}>Discrete integer domain shown from {Math.min(model.domainMin, model.domainMax)} through {Math.max(model.domainMin, model.domainMax)}.</div>}
        </Panel>

        <Panel title="Build the relation">
          <label style={{ display: 'block', marginBottom: 11, fontSize: 13, fontWeight: 800, color: '#3c4756' }}>Family<select value={model.family} onChange={(event) => set({ family: event.target.value })} style={inputStyle}>{allowedFamilies.map((family) => <option value={family} key={family}>{FAMILY_LABELS[family]}</option>)}</select></label>
          <label style={{ display: 'block', marginBottom: 11, fontSize: 13, fontWeight: 800, color: '#3c4756' }}>Graph type<select value={model.domainMode} onChange={(event) => set({ domainMode: event.target.value })} style={inputStyle}><option value="continuous">Continuous</option><option value="discrete">Discrete</option></select></label>

          {model.family === 'linear' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{numericField('Slope m', model.a, (a) => set({ a }), 0.5)}{numericField('y-intercept b', model.k, (k) => set({ k }), 0.5)}</div>}
          {['quadratic', 'absolute'].includes(model.family) && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>{numericField('a', model.a, (a) => set({ a }), 0.5)}{numericField('h', model.h, (h) => set({ h }), 0.5)}{numericField('k', model.k, (k) => set({ k }), 0.5)}</div>}
          {model.family === 'exponential' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>{numericField('a', model.a, (a) => set({ a }), 0.5)}{numericField('base b', model.base, (base) => set({ base: Math.max(0.1, base) }), 0.1)}{numericField('horizontal shift h', model.h, (h) => set({ h }), 0.5)}{numericField('vertical shift k', model.k, (k) => set({ k }), 0.5)}</div>}
          {model.family === 'verticalLine' && numericField('Vertical line x =', model.verticalX, (verticalX) => set({ verticalX }), 0.5)}
          {model.domainMode === 'discrete' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>{numericField('Smallest integer x', model.domainMin, (domainMin) => set({ domainMin }))}{numericField('Largest integer x', model.domainMax, (domainMax) => set({ domainMax }))}</div>}

          <div style={{ marginTop: 15 }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Constraint checklist</strong>
            <div style={{ display: 'grid', gap: 7 }}>
              {liveScore.parts.map((part) => <div key={part.id} style={{ padding: '8px 10px', borderRadius: 8, background: part.isCorrect ? '#e6f4ea' : '#f8f9fa', color: part.isCorrect ? '#137333' : '#5f6368', border: `1px solid ${part.isCorrect ? '#a8dab5' : '#d9e2f1'}`, fontWeight: 800 }}>{part.isCorrect ? '✓' : '○'} {part.label}</div>)}
            </div>
          </div>

          <button
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
          <HintPanel hints={questionData.hints || [
            'Start with the family: a straight line, a U-shaped curve, and exponential growth/decay do not share the same structure.',
            'For a linear model, the sign of the slope controls increasing versus decreasing. For a quadratic or absolute-value model, the sign of a controls maximum versus minimum.',
            'For an exponential model, a base between 0 and 1 gives decay when a is positive; a base greater than 1 gives growth.',
          ]} onHintUsed={() => onAction?.('HINT_USED')} />
        </Panel>
      </ToolSplit>
    </ToolShell>
  );
}
