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
import { readComposedQuestion, resolveStageInput, summarizeWorkflowProgress } from './questionWorkflow';
import { gradeWorkflow } from './workflowGrading';

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
const readDelegateResponse = {
  tableInput: (payload) => {
    try {
      return JSON.parse(payload?.responseKey || '{}');
    } catch {
      return {};
    }
  },
  numberLine: (payload) => payload?.intervals ?? payload?.value ?? payload,
  mappingDiagram: (payload) => payload?.pairs ?? payload?.value ?? payload,
  coordinatePlot: (payload) => payload?.placements ?? payload?.points ?? payload?.responseKey ?? null,
  functionGraph: (payload) => payload?.placements ?? payload?.points ?? payload?.responseKey ?? null,
  algebraWorkspace: (payload) => payload?.responseKey ?? payload?.equation ?? null,
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
            answers: driven ? {} : (content?.tableAnswers || stage.answers || {}),
            blanks: driven ? xValues.map((_, rowIndex) => `${rowIndex}:${responseColumn}`) : [],
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
      onAction={onChange}
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
      onAction={onChange}
    />
  ),
  coordinatePlot: ({ stage, content, onChange, draftKey }) => (
    <InteractiveGraphWorkspace
      question={{
        prompt: '',
        graph: stage.graph || content?.graph || { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
        plotMode: 'points',
        pairs: stage.pairs || content?.pairs || [],
      }}
      mode="construct"
      onStateChange={onChange}
      draftKey={draftKey}
    />
  ),
  functionGraph: ({ stage, content, onChange, draftKey }) => (
    <InteractiveGraphWorkspace
      question={{
        prompt: '',
        graph: stage.graph || content?.graph || { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
        functionSpec: content?.functionSpec,
      }}
      mode="construct"
      onStateChange={onChange}
      draftKey={draftKey}
    />
  ),
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

const NOTATION_PROFILE = { interval: 'interval', inequality: 'inequality', set: 'interval' };

function StageBody({ stage, input, content, value, onChange, disabled, draftKey }) {
  const delegate = DELEGATES[stage.kind];
  if (delegate) return delegate({ stage, input, content, onChange, draftKey, disabled });

  switch (stage.kind) {
    case 'equationInput':
      return (
        <MathInput
          value={value || ''}
          onChange={onChange}
          toolProfile="basic"
          placeholder={stage.placeholder || 'f(x) = …'}
          ariaLabel={stage.prompt || 'Function equation'}
        />
      );
    case 'domainInput':
    case 'rangeInput':
    case 'intervalInput':
      return (
        <MathInput
          value={value || ''}
          onChange={onChange}
          toolProfile={NOTATION_PROFILE[stage.notation] || 'interval'}
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

export default function WorkflowRunner({
  question,
  onStateChange,
  disabled = false,
  draftKey = null,
}) {
  const { content, workflow, grading } = useMemo(() => readComposedQuestion(question), [question]);
  const [responses, setResponses] = useState({});
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

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
    onStateChangeRef.current?.(gradeWorkflow({
      stages: workflowRef.current,
      responses,
      grading: gradingRef.current,
    }));
  }, [responses]);

  if (!workflow.length) return null;

  return (
    <div style={{ textAlign: 'left' }}>
      {content?.scenario && (
        <div style={{ ...panel, background: '#f8f9fa' }}>
          <QuestionPrompt>{content.scenario}</QuestionPrompt>
        </div>
      )}

      {workflow.map((stage, index) => {
        const definition = getStage(stage.kind);
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
            {stage.prompt && <QuestionPrompt style={{ fontSize: 16, margin: '0 0 12px' }}>{stage.prompt}</QuestionPrompt>}
            <StageSource input={input} stages={workflow} />
            <StageBody
              stage={stage}
              input={input}
              content={content}
              value={responses[stage.id]}
              onChange={(value) => setResponse(stage.id, (readDelegateResponse[stage.kind] || ((raw) => raw))(value))}
              disabled={disabled}
              draftKey={draftKey ? `${draftKey}:${stage.id}` : null}
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
