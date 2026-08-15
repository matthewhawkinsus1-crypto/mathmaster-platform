import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MathInput from '../../MathInput';
import MathDisplay from '../../MathDisplay';
import QuestionPrompt from '../../QuestionPrompt';
import TableGrader from '../../TableGrader';
import InteractiveGraphWorkspace from '../../InteractiveGraphWorkspace';
import StepByStepAlgebra from '../../StepByStepAlgebra';
import IntervalNumberLine from '../../tools/intervalNumberLine/IntervalNumberLine';
import RelationMapping from '../../tools/relationMapping/RelationMapping';
import { getStage } from './interactionStages';
import { hasStageResponse, readComposedQuestion, resolveStageInput, summarizeWorkflowProgress } from './questionWorkflow';
import { checkTableConsistency, gradeWorkflow } from './workflowGrading';
import { buildExpressionFunctionSpec, evaluateModelAt, evaluateNumericValue, parseIntervalDomainRestriction } from './modelExpression';
import { evaluateGraphFunction } from '../../functionGraphUtils';
import { buildStudentTableMagneticTargets } from '../../graphInteractionPrecision';

// Renders a question composed from interaction primitives.
//
// The runtime owns three things and nothing else: the order stages appear in,
// the responses they produce, and threading one stage's output into the next.
// It draws no mathematics itself — every stage delegates to the component that
// already knows how to do that job, which is what stops this from becoming a
// sixteenth renderer with its own opinions about graphs.
//
// Two delegation contracts exist in the codebase and both are bridged here:
// `{ question, onStateChange }` for the original components and
// `{ questionData, onAction }` for the newer tools. Adapters live in one table
// so a stage is a few lines rather than a special case.

const panel = {
  border: '1px solid #dadce0', borderRadius: 12, background: '#fff',
  padding: 16, marginBottom: 12, textAlign: 'left',
};
const stageHeading = { margin: '0 0 8px', fontSize: 13, fontWeight: 900, color: '#174ea6' };
const waitingPanel = { ...panel, background: '#f8f9fa', borderStyle: 'dashed', color: '#5f6368' };

const niceGridStep = (range, fallback = 1) => {
  const safeRange = Math.abs(Number(range));
  const safeFallback = Number(fallback);
  if (!Number.isFinite(safeRange) || safeRange <= 0) return Number.isFinite(safeFallback) && safeFallback > 0 ? safeFallback : 1;
  const raw = safeRange / 10;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const scaled = raw / power;
  const multiplier = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return multiplier * power;
};

// The authored viewport is a minimum useful window, not a cage. A dependent
// graph must always be able to display the points the student actually made.
// Expand only when upstream work falls outside the authored bounds; never
// silently clip a table point just because the original answer key fit.
const expandGraphWindowToPoints = (graph = {}, points = []) => {
  const base = {
    xMin: Number.isFinite(Number(graph.xMin)) ? Number(graph.xMin) : -10,
    xMax: Number.isFinite(Number(graph.xMax)) ? Number(graph.xMax) : 10,
    yMin: Number.isFinite(Number(graph.yMin)) ? Number(graph.yMin) : -10,
    yMax: Number.isFinite(Number(graph.yMax)) ? Number(graph.yMax) : 10,
    ...graph,
  };
  const valid = (Array.isArray(points) ? points : [])
    .filter((point) => Array.isArray(point) && point.length === 2 && point.every((entry) => Number.isFinite(Number(entry))))
    .map(([x, y]) => [Number(x), Number(y)]);
  if (!valid.length) return base;

  const xs = valid.map(([x]) => x);
  const ys = valid.map(([, y]) => y);
  const baseXRange = Math.max(1, Number(base.xMax) - Number(base.xMin));
  const baseYRange = Math.max(1, Number(base.yMax) - Number(base.yMin));
  const xPad = Math.max(Number(base.xStep) || 0, baseXRange * 0.08, 0.5);
  const yPad = Math.max(Number(base.yStep) || 0, baseYRange * 0.08, 0.5);

  const expanded = {
    ...base,
    xMin: Math.min(Number(base.xMin), Math.min(...xs) < Number(base.xMin) ? Math.min(...xs) - xPad : Number(base.xMin)),
    xMax: Math.max(Number(base.xMax), Math.max(...xs) > Number(base.xMax) ? Math.max(...xs) + xPad : Number(base.xMax)),
    yMin: Math.min(Number(base.yMin), Math.min(...ys) < Number(base.yMin) ? Math.min(...ys) - yPad : Number(base.yMin)),
    yMax: Math.max(Number(base.yMax), Math.max(...ys) > Number(base.yMax) ? Math.max(...ys) + yPad : Number(base.yMax)),
  };
  const xRange = expanded.xMax - expanded.xMin;
  const yRange = expanded.yMax - expanded.yMin;
  const currentXStep = Number(base.xStep) || 1;
  const currentYStep = Number(base.yStep) || 1;
  if (xRange / currentXStep > 20) expanded.xStep = niceGridStep(xRange, currentXStep);
  if (yRange / currentYStep > 20) expanded.yStep = niceGridStep(yRange, currentYStep);
  return expanded;
};

const chipRow = { display: 'flex', gap: 8, flexWrap: 'wrap' };
const choiceChip = (active) => ({
  padding: '10px 16px', minHeight: 44, borderRadius: 999, cursor: 'pointer',
  border: `2px solid ${active ? '#1a73e8' : '#c9ced6'}`,
  background: active ? '#e8f0fe' : '#fff',
  color: active ? '#174ea6' : '#3c4043', fontWeight: 800, fontSize: 14,
});

const textArea = {
  width: '100%', minHeight: 84, fontSize: 15, padding: '10px', resize: 'vertical',
  border: '1px solid #c9ced6', borderRadius: 8, boxSizing: 'border-box',
};

/**
 * What a stage says when it is driven by the student's own earlier work.
 * Naming the source matters: a table built from the student's function is a
 * different task from a table built from the correct one, and the student
 * should know which they are doing.
 */
function StageSource({ input, stages }) {
  if (!input?.sourceStageId) return null;
  const upstream = stages.find((entry) => entry.id === input.sourceStageId);
  const label = getStage(upstream?.kind)?.label || input.sourceStageId;
  return (
    <p style={{ margin: '0 0 8px', fontSize: 12, color: '#5f6368', lineHeight: 1.5 }}>
      Built from your answer to <strong>{label}</strong>
      {typeof input.value === 'string' && input.value ? <> — <MathDisplay value={input.value} inline /></> : null}
    </p>
  );
}

function ChoiceStage({ stage, value, onChange, disabled }) {
  const choices = Array.isArray(stage.choices) ? stage.choices : [];
  return (
    <div style={chipRow}>
      {choices.map((choice) => {
        const id = typeof choice === 'string' ? choice : choice?.id ?? String(choice);
        const label = typeof choice === 'string' ? choice : choice?.label ?? id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(id)}
            style={choiceChip(value === id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function QuantityRolesStage({ stage, value, onChange, disabled }) {
  const quantities = Array.isArray(stage.quantities) ? stage.quantities.filter((item) => item?.id) : [];
  const current = value && typeof value === 'object' ? value : {};
  const set = (role, id) => onChange({ ...current, [role]: id });
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {[['independent', 'Independent (input)'], ['dependent', 'Dependent (output)']].map(([role, label]) => (
        <div key={role}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: '#5f6368' }}>{label}</p>
          <div style={chipRow}>
            {quantities.map((quantity) => (
              <button
                key={quantity.id}
                type="button"
                disabled={disabled}
                onClick={() => set(role, quantity.id)}
                style={choiceChip(current[role] === quantity.id)}
              >
                {quantity.label || quantity.id}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Delegated components report a STATUS object — isComplete, isCorrect,
// responseKey and so on — not the student's answer. Storing that whole object
// as the stage response would mean a stage counted as answered the moment it
// mounted, and would hand the next stage a status payload instead of a value.
// Each delegate therefore says how to read the answer out of what it reports.
const WORKFLOW_ARTIFACT = '__mathmasterWorkflowArtifact';

const parseResponseKey = (payload) => {
  try {
    return JSON.parse(payload?.responseKey || '{}');
  } catch {
    return {};
  }
};

const numericTablePoints = ({ stage, cells }) => {
  const columns = Array.isArray(stage.columns) && stage.columns.length
    ? stage.columns
    : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
  const inputColumn = stage.inputColumn || columns[0]?.key || 'x';
  const responseColumn = stage.responseColumn || columns[columns.length - 1]?.key || 'y';
  const xValues = Array.isArray(stage.xValues) ? stage.xValues : [];
  return xValues.map((x, rowIndex) => {
    const rawY = cells?.[`${rowIndex}:${responseColumn}`];
    if (String(rawY ?? '').trim() === '') return null;
    const numericX = evaluateNumericValue(x);
    const y = evaluateNumericValue(rawY);
    return numericX !== null && y !== null ? [numericX, y] : null;
  }).filter(Boolean);
};

const checkTableAgainstFunctionSpec = ({ cells = {}, stage, functionSpec }) => {
  if (!functionSpec) return null;
  const columns = Array.isArray(stage.columns) && stage.columns.length
    ? stage.columns
    : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
  const responseColumn = stage.responseColumn || columns[columns.length - 1]?.key || 'y';
  const xValues = Array.isArray(stage.xValues) ? stage.xValues : [];
  const rows = [];
  xValues.forEach((x, rowIndex) => {
    const entered = cells?.[`${rowIndex}:${responseColumn}`];
    if (String(entered ?? '').trim() === '') return;
    const numericX = evaluateNumericValue(x);
    const expected = numericX === null ? Number.NaN : evaluateGraphFunction(functionSpec, numericX);
    const enteredNumber = evaluateNumericValue(entered);
    rows.push({
      x,
      entered,
      expected,
      matches: Number.isFinite(expected)
        ? (enteredNumber !== null && Math.abs(enteredNumber - expected) <= 1e-6)
        : null,
    });
  });
  const checked = rows.filter((row) => row.matches !== null);
  return {
    checked: checked.length,
    consistent: checked.length > 0 && checked.every((row) => row.matches),
    mismatches: checked.filter((row) => !row.matches),
    rows,
  };
};

const tableArtifact = (payload, { stage, input, content }) => {
  const cells = parseResponseKey(payload);
  const sourceModel = typeof input?.value === 'string'
    ? input.value
    : input?.value?.sourceModel || null;
  const columns = Array.isArray(stage.columns) && stage.columns.length
    ? stage.columns
    : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
  const responseColumn = stage.responseColumn || columns[columns.length - 1]?.key || 'y';
  const sourceFunctionSpec = !sourceModel && content?.functionSpec ? content.functionSpec : null;
  const consistency = sourceModel
    ? checkTableConsistency({
      response: cells,
      xValues: Array.isArray(stage.xValues) ? stage.xValues : [],
      model: sourceModel,
      responseColumn,
    })
    : checkTableAgainstFunctionSpec({ cells, stage, functionSpec: sourceFunctionSpec });

  return {
    [WORKFLOW_ARTIFACT]: 'table',
    isComplete: Boolean(payload?.isComplete),
    cells,
    xValues: Array.isArray(stage.xValues) ? stage.xValues : [],
    points: numericTablePoints({ stage, cells }),
    sourceModel,
    sourceFunctionSpec,
    sourceChecked: consistency?.checked || 0,
    sourceConsistent: consistency ? consistency.consistent : null,
  };
};

const graphArtifact = (payload) => ({
  [WORKFLOW_ARTIFACT]: 'graph',
  isComplete: Boolean(payload?.isComplete),
  isCorrect: Boolean(payload?.isCorrect),
  responseKey: payload?.responseKey || '',
  parts: Array.isArray(payload?.parts) ? payload.parts : [],
});

// Delegated components report a STATUS object — isComplete, isCorrect,
// responseKey and so on — not the student's answer. Each reader turns that
// status into the mathematical artifact the next workflow stage actually needs.
// Dependent artifacts deliberately retain lineage: a table built from the
// student's equation carries that equation forward so a graph can be built
// from BOTH pieces of student work rather than from the answer key.
const readDelegateResponse = {
  tableInput: (payload, context) => tableArtifact(payload, context),
  // The two newer tools report through `onAction('ATTEMPT_SUBMITTED', payload)`
  // and put the student's work in `payload.response`.
  numberLine: (payload) => payload?.response?.intervals ?? payload?.response ?? null,
  mappingDiagram: (payload) => payload?.response?.arrows ?? payload?.response ?? null,
  coordinatePlot: (payload) => graphArtifact(payload),
  functionGraph: (payload) => graphArtifact(payload),
  algebraWorkspace: (payload) => payload?.responseKey ?? payload?.equation ?? null,
};

// The newer tools speak `onAction(actionType, payload)` rather than reporting
// state continuously. Passing the stage's setter straight in as `onAction`
// hands it the action NAME as its first argument, so the stage records the
// string "ATTEMPT_SUBMITTED" and never the student's work.
const toolAction = (onChange) => (actionType, payload) => {
  if (actionType === 'ATTEMPT_SUBMITTED') onChange(payload);
};

// Stages that delegate to an existing component. Each adapter builds the
// sub-question that component expects; nothing here reimplements a renderer.
const DELEGATES = {
  tableInput: ({ stage, input, content, onChange, draftKey }) => {
    const xValues = Array.isArray(stage.xValues) ? stage.xValues : [];
    const columns = Array.isArray(stage.columns) && stage.columns.length
      ? stage.columns
      : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
    const inputColumn = stage.inputColumn || columns[0]?.key || 'x';
    const responseColumn = stage.responseColumn || columns[columns.length - 1]?.key || 'y';
    const rows = xValues.map((x) => ({ [inputColumn]: x }));

    // Driven by the student's own function: every response cell is editable and
    // NOTHING here holds a key for it. Whether 5 belongs in that row depends on
    // the function they wrote, so correctness is decided against that model
    // rather than against the authored answer — which is the point of the
    // dependency. A student who wrote f(x) = x + 2 fills their table from it,
    // and MathMaster can then say the table is consistent with their function
    // while the function does not model the situation.
    const driven = Boolean(input?.sourceStageId);
    const rule = driven
      ? (typeof input.value === 'string' ? input.value : null)
      : content?.equation;

    return (
      <TableGrader
        question={{
          prompt: '',
          table: {
            columns,
            rows,
            // Workflow answer keys live only in question.grading and are never
            // passed into the renderer. Every response cell is therefore an
            // editable blank here; gradeWorkflow checks it after submission.
            // Previously fixed-table workflows relied on content.tableAnswers,
            // but readComposedQuestion intentionally strips that answer field,
            // leaving students with a read-only table (notably Algebra II L1
            // Day 2 Q8). Keeping editability separate from answer ownership
            // fixes that class of question without exposing a key in the UI.
            answers: {},
            blanks: xValues.map((_, rowIndex) => `${rowIndex}:${responseColumn}`),
          },
          ruleLatex: rule,
          showRule: Boolean(rule),
        }}
        onStateChange={onChange}
        draftKey={draftKey}
        compact
      />
    );
  },
  numberLine: ({ stage, onChange }) => (
    <IntervalNumberLine
      questionData={{ min: stage.min, max: stage.max, step: stage.step, ask: stage.ask || ['graph'] }}
      onAction={toolAction(onChange)}
    />
  ),
  mappingDiagram: ({ stage, content, onChange }) => (
    <RelationMapping
      questionData={{
        pairs: content?.pairs || stage.pairs || [],
        ask: ['mapping'],
        domainLabel: stage.domainLabel,
        rangeLabel: stage.rangeLabel,
      }}
      onAction={toolAction(onChange)}
    />
  ),
  coordinatePlot: ({ stage, input, content, onChange, draftKey }) => {
    const source = input?.from === 'student' ? input.value : null;
    const fromTable = source?.[WORKFLOW_ARTIFACT] === 'table' ? source.points : null;
    const equationPoints = typeof source === 'string'
      ? (Array.isArray(content?.tableXValues) && content.tableXValues.length ? content.tableXValues : [0, 1, 2, 3, 4])
        .map((x) => {
          const y = evaluateModelAt(source, Number(x));
          return y === null ? null : [Number(x), y];
        }).filter(Boolean)
      : [];
    const rawPairs = Array.isArray(fromTable) && fromTable.length
      ? fromTable
      : (equationPoints.length ? equationPoints : (stage.pairs || content?.pairs || []));
    const pairs = (Array.isArray(rawPairs) ? rawPairs : []).map((pair) => {
      if (Array.isArray(pair)) return [Number(pair[0]), Number(pair[1])];
      return [Number(pair?.x), Number(pair?.y)];
    }).filter((pair) => pair.every(Number.isFinite));
    const pointTasks = pairs.map((point, index) => ({
      id: `point-${index + 1}`,
      label: `P${index + 1}`,
      role: 'point',
      x: point[0],
      expected: point,
      lockedX: true,
    }));
    const magneticSnapTargets = source?.[WORKFLOW_ARTIFACT] === 'table'
      && source.isComplete
      && source.sourceConsistent !== false
      ? buildStudentTableMagneticTargets(pairs)
      : [];

    return (
      <InteractiveGraphWorkspace
        question={{
          prompt: '',
          graph: expandGraphWindowToPoints(stage.graph || content?.graph || { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, pairs),
          plotMode: 'points',
          pointOnly: true,
          pointTasks,
          magneticSnapTargets,
          functionSpec: { type: 'expression', expression: '0', variable: 'x', referencePoints: pairs },
          showCoordinates: true,
          requireEndpointMarkers: false,
        }}
        mode="construct"
        onStateChange={onChange}
        draftKey={draftKey}
      />
    );
  },
  functionGraph: ({ stage, input, content, onChange, draftKey }) => {
    const source = input?.from === 'student' ? input.value : null;
    const sourceIsTable = source?.[WORKFLOW_ARTIFACT] === 'table';
    const tablePoints = sourceIsTable && Array.isArray(source.points) ? source.points : [];
    const sourceModel = sourceIsTable ? source.sourceModel : (typeof source === 'string' ? source : null);
    const sourceFunctionSpec = sourceIsTable ? source.sourceFunctionSpec : null;
    const authoredGraphWindow = stage.graph || content?.graph || { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
    const points = tablePoints.length ? tablePoints : (() => {
      if (!sourceModel) return [];
      const xMin = Number(authoredGraphWindow.xMin);
      const xMax = Number(authoredGraphWindow.xMax);
      if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return [];
      const candidates = Array.from({ length: 5 }, (_, index) => xMin + (index / 4) * (xMax - xMin));
      return candidates.map((x) => {
        const y = evaluateModelAt(sourceModel, x);
        return y === null ? null : [Number(x.toFixed(6)), Number(y.toFixed(6))];
      }).filter(Boolean);
    })();
    const graphWindow = expandGraphWindowToPoints(authoredGraphWindow, points);
    const magneticSnapTargets = sourceIsTable
      && source.isComplete
      && source.sourceConsistent !== false
      ? buildStudentTableMagneticTargets(points)
      : [];

    // The graph must represent the student's own prior work.  For a table that
    // came from an equation, contradictory work has no single graph; make that
    // conflict visible and require the student to resolve it rather than
    // secretly switching to the authored answer key.
    if (sourceIsTable && (source.sourceModel || source.sourceFunctionSpec) && source.sourceChecked > 0 && source.sourceConsistent === false) {
      return (
        <div style={{ ...waitingPanel, background: '#fff8e1', color: '#7a4f00' }}>
          <strong>Your table and function do not agree yet.</strong>
          <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
            Fix the table or the function first. Once they describe the same relationship, MathMaster will build this graphing step from your work.
          </p>
        </div>
      );
    }

    const functionSpec = sourceModel
      ? buildExpressionFunctionSpec(sourceModel, { referencePoints: points, domain: stage.domainRestriction || null })
      : (sourceFunctionSpec || content?.functionSpec);

    if (!functionSpec) {
      return (
        <div style={{ ...waitingPanel, background: '#fff8e1', color: '#7a4f00' }}>
          <strong>Your model cannot be graphed yet.</strong>
          <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
            Revise the function so it is a complete equation, then finish the table. This graph is generated from those answers, not from a hidden answer key.
          </p>
        </div>
      );
    }

    return (
      <InteractiveGraphWorkspace
        question={{
          prompt: '',
          graph: graphWindow,
          functionSpec,
          equationLatex: sourceModel || undefined,
          graphAnswer: points.length ? { suggestedPoints: points } : undefined,
          magneticSnapTargets,
          showCoordinates: true,
          studentChoosesX: false,
          // A restricted relationship needs explicit visual boundaries. The
          // domain stage still asks the student to STATE the domain, but the
          // graph itself is incomplete until its open/closed endpoints are shown.
          requireEndpointMarkers: stage.requireEndpointMarkers ?? Boolean(stage.domainRestriction),
        }}
        mode="construct"
        onStateChange={onChange}
        draftKey={draftKey}
      />
    );
  },
  algebraWorkspace: ({ stage, content, input, onChange, draftKey }) => (
    <StepByStepAlgebra
      question={{
        prompt: '',
        equation: stage.equation
          || (typeof input?.value === 'string' ? input.value : null)
          || content?.equation,
        workspaceDifficulty: stage.workspaceDifficulty,
      }}
      questionRecord={null}
      onStateChange={onChange}
      draftKey={draftKey}
    />
  ),
};

const NOTATION_PROFILE = { interval: 'interval', inequality: 'inequality', set: 'set' };

function StageBody({ stage, input, content, value, onChange, disabled, draftKey }) {
  const delegate = DELEGATES[stage.kind];
  if (delegate) return delegate({ stage, input, content, onChange, draftKey, disabled });

  switch (stage.kind) {
    case 'equationInput':
      return (
        <MathInput
          value={value || ''}
          onChange={onChange}
          toolProfile="function"
          showToolsInitially
          placeholder={stage.placeholder || 'f(x) = …'}
          ariaLabel={stage.prompt || 'Function equation'}
        />
      );
    case 'domainInput':
    case 'rangeInput':
    case 'intervalInput':
      if (Array.isArray(stage.choices) && stage.choices.length) {
        return <ChoiceStage stage={stage} value={value} onChange={onChange} disabled={disabled} />;
      }
      return (
        <MathInput
          value={value || ''}
          onChange={onChange}
          toolProfile={NOTATION_PROFILE[stage.notation] || 'interval'}
          showToolsInitially
          placeholder={stage.notation || 'interval notation'}
          ariaLabel={stage.prompt || 'Interval notation'}
        />
      );
    case 'classification':
    case 'multipleChoice':
      return <ChoiceStage stage={stage} value={value} onChange={onChange} disabled={disabled} />;
    case 'quantityRoles':
      return <QuantityRolesStage stage={stage} value={value} onChange={onChange} disabled={disabled} />;
    case 'interpretation':
    case 'shortResponse':
      return (
        <textarea
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          rows={3}
          style={textArea}
          placeholder="Write your answer."
        />
      );
    default:
      // Validation rejects unknown kinds at Preflight, so reaching here means a
      // known kind with no renderer yet. Say so rather than showing a blank.
      return (
        <p style={{ margin: 0, color: '#7a4f00', fontSize: 13 }}>
          This step type ({stage.kind}) is not available in this workspace yet.
        </p>
      );
  }
}

const dependencyFingerprint = (value) => {
  let text = '';
  try { text = JSON.stringify(value ?? null); } catch { text = String(value ?? ''); }
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export default function WorkflowRunner({
  question,
  onStateChange,
  onProgressChange,
  disabled = false,
  draftKey = null,
}) {
  const { content, workflow, grading } = useMemo(() => readComposedQuestion(question), [question]);
  const [responses, setResponses] = useState({});
  const onStateChangeRef = useRef(onStateChange);
  const onProgressChangeRef = useRef(onProgressChange);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { onProgressChangeRef.current = onProgressChange; }, [onProgressChange]);

  const progress = summarizeWorkflowProgress(workflow, responses);

  // Deferred deliberately. Delegated components report their state as they
  // mount, and a delegate that calls back DURING its own render would make this
  // a setState-in-render on the parent — React refuses it, and the whole
  // question falls into the error boundary. A microtask puts the update after
  // the render that triggered it, which costs nothing and cannot loop.
  //
  // The equality check is structural, not by identity. Delegated components
  // rebuild their state object on every render and report it, so an identity
  // comparison never matches: each report would be "new", causing a re-render,
  // causing another report. That is an infinite loop, and it is what happens
  // if you take the obvious `Object.is` route here.
  const setResponse = useCallback((stageId, value) => {
    queueMicrotask(() => {
      setResponses((current) => {
        const sameValue = current[stageId] === value
          || JSON.stringify(current[stageId] ?? null) === JSON.stringify(value ?? null);
        return sameValue ? current : { ...current, [stageId]: value };
      });
    });
  }, []);

  // Reporting upward is an effect, not part of the updater. State updaters must
  // be pure — React may run one twice — so a side effect inside one fires twice
  // and, in this case, fired during another component's render.
  //
  // The dependency is `responses` ALONE. Depending on `workflow` looped:
  // reporting upward re-renders the parent, which rebuilds the question object,
  // which produces a new workflow array, which re-fires the effect. The stage
  // list is read from a ref instead, because it is not what changed.
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;
  const gradingRef = useRef(grading);
  gradingRef.current = grading;
  useEffect(() => {
    // What is reported is the same answer state every other tool reports, so a
    // composed question submits, records an attempt and shows feedback through
    // the existing path rather than a parallel one.
    const stages = workflowRef.current;
    onStateChangeRef.current?.(gradeWorkflow({
      stages,
      responses,
      grading: gradingRef.current,
    }));

    // Guided Notes follows the first unfinished mathematical stage rather than
    // maintaining a second, unrelated "Step 1 of 3" counter. Nothing about
    // correctness is exposed here — only which student-facing stage is current.
    const progressState = summarizeWorkflowProgress(stages, responses);
    const firstIncompleteIndex = stages.findIndex((stage) => !hasStageResponse(responses[stage.id]));
    const currentIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(0, stages.length - 1);
    const currentStage = stages[currentIndex] || null;
    onProgressChangeRef.current?.({
      ...progressState,
      currentStageId: currentStage?.id || null,
      currentStageKind: currentStage?.kind || null,
      currentStageIndex: currentStage ? currentIndex : null,
    });
  }, [responses]);

  if (!workflow.length) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      {content?.prompt && (
        <div style={{ ...panel, background: '#f8fbff', borderColor: '#c5d5ef' }}>
          <QuestionPrompt>{content.prompt}</QuestionPrompt>
        </div>
      )}
      {content?.scenario && !question?.suppressScenarioDisplay && content.scenario !== content?.prompt && (
        <div style={{ ...panel, background: '#f8f9fa' }}>
          <QuestionPrompt variant="plain">{content.scenario}</QuestionPrompt>
        </div>
      )}

      {workflow.map((stage, index) => {
        const definition = getStage(stage.kind);
        // If this modelling workflow has an authored finite domain, give only
        // its boundary semantics to the graph primitive. This lets the student
        // explicitly mark open/closed endpoints instead of leaving a stopped
        // segment visually ambiguous. The later domain stage remains separate.
        const domainRestriction = stage.kind === 'functionGraph'
          ? parseIntervalDomainRestriction(grading?.domain)
          : null;
        const effectiveStage = domainRestriction && !stage.domainRestriction
          ? { ...stage, domainRestriction }
          : stage;
        const input = resolveStageInput({ stage, responses, content });
        // A stage driven by unanswered work is waiting, not broken. Showing it
        // as an empty input would invite the student to answer it out of order
        // and then have it rebuilt underneath them.
        const waiting = Boolean(stage.sourceStageId) && !input.ready;

        if (waiting) {
          const upstream = workflow.find((entry) => entry.id === stage.sourceStageId);
          return (
            <section key={stage.id} style={waitingPanel}>
              <h4 style={{ ...stageHeading, color: '#5f6368' }}>
                Step {index + 1}. {definition?.label || stage.kind}
              </h4>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
                Finish <strong>{getStage(upstream?.kind)?.label || stage.sourceStageId}</strong> first — this step is built
                from what you write there.
              </p>
            </section>
          );
        }

        return (
          <section key={stage.id} style={panel}>
            <h4 style={stageHeading}>Step {index + 1}. {definition?.label || stage.kind}</h4>
            {stage.prompt && <QuestionPrompt variant="plain" style={{ fontSize: 16, margin: '0 0 12px' }}>{stage.prompt}</QuestionPrompt>}
            <StageSource input={input} stages={workflow} />
            <StageBody
              stage={effectiveStage}
              input={input}
              content={content}
              value={responses[stage.id]}
              onChange={(value) => setResponse(stage.id, (readDelegateResponse[stage.kind] || ((raw) => raw))(value, { stage, input, content }))}
              disabled={disabled}
              draftKey={draftKey ? `${draftKey}:${stage.id}${stage.sourceStageId && ['functionGraph', 'coordinatePlot'].includes(stage.kind) ? `:${dependencyFingerprint(input.value)}` : ''}` : null}
            />
          </section>
        );
      })}

      <p style={{ color: '#5f6368', fontSize: 12, margin: '4px 2px 0' }}>
        {progress.answered} of {progress.total} steps answered. Each step is marked on its own.
      </p>
    </div>
  );
}
