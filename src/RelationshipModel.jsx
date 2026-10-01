import { useEffect, useMemo } from 'react';
import QuestionPrompt from './QuestionPrompt';
import GraphDisplay from './GraphDisplay';
import GraphAxisEditor from './GraphAxisEditor';
import PointMeaningBuilder from './PointMeaningBuilder';
import useUndoHistory from './useUndoHistory';
import {
  buildInterpretationGraph,
  EMPTY_POINT_MEANING,
} from './contextInterpretationUtils';
import relationshipModelGrader from '../functions/shared/serverGrading/tools/relationshipModel.mjs';
import {
  relationshipAxisInputMode,
  relationshipModelRequirements,
  relationshipOriginConfig,
  relationshipOriginMode,
} from '../functions/shared/toolMath/scenario/relationshipModelMath.mjs';
import { relationshipModelWork } from '../functions/shared/toolMath/scenario/scenarioWork.mjs';
import { gradeToolCheck } from './tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from './platform/grading/sharedAnswerState.js';

const selectStyle = (status) => ({
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  border: `2px solid ${status === 'correct' ? '#188038' : status === 'incorrect' ? '#d93025' : '#bdc7d6'}`,
  background: status === 'incorrect' ? '#fff8f7' : '#fff',
  fontSize: '16px',
});

const getGrade = (feedback, id) => feedback?.partGrades?.find((part) => part.id === id);
const statusFor = (feedback, id) => {
  const grade = getGrade(feedback, id);
  return grade ? (grade.isCorrect ? 'correct' : 'incorrect') : 'neutral';
};

const positiveNumberOr = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export default function RelationshipModel({
  question,
  onStateChange,
  onUndoStateChange,
  feedback,
  draftKey,
  disabled = false,
}) {
  const quantities = useMemo(
    () => (Array.isArray(question.quantities) ? question.quantities.filter((item) => item?.id) : []),
    [question.quantities],
  );
  const initial = {
    independentId: '',
    dependentId: '',
    relationshipType: '',
    xLabel: '',
    xUnit: '',
    yLabel: '',
    yUnit: '',
    xStep: '',
    yStep: '',
    originMeaning: '',
    pointMeaning: EMPTY_POINT_MEANING,
  };
  const history = useUndoHistory(initial, 80, draftKey ? `${draftKey}:relationship-model` : null);
  const values = history.value;
  const axisSetup = question.axisSetup && typeof question.axisSetup === 'object' ? question.axisSetup : {};
  // Which sections to show, how the origin is answered and its point-meaning
  // config: the SAME helpers the shared grader marks with
  // (functions/shared/toolMath/scenario/relationshipModelMath.mjs).
  const axisInputMode = relationshipAxisInputMode(question);
  const requirements = useMemo(() => relationshipModelRequirements(question), [question]);
  const originMode = relationshipOriginMode(question);
  const originConfig = useMemo(() => relationshipOriginConfig(question), [question]);

  // The student's raw work. Every part's verdict comes ONLY from the shared
  // grader the server also runs (serverGrading/tools/relationshipModel.mjs).
  const work = useMemo(() => relationshipModelWork(values), [values]);
  const grading = useMemo(() => gradeToolCheck(relationshipModelGrader, question, work), [question, work]);
  const questionDetails = `${question.prompt || 'Model the relationship.'} Scenario: ${question.scenario || ''} Responses: ${JSON.stringify(values)}`;

  useEffect(() => {
    onStateChange(answerStateFromSharedGrading(grading, { questionDetails }));
  }, [grading, questionDetails, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last relationship-model entry' });
    return () => onUndoStateChange?.(null);
  }, [history.canUndo, history.undo, onUndoStateChange]);

  const setField = (field, value) => history.setValue((current) => ({ ...current, [field]: value }));
  const setPointMeaning = (next) => history.setValue((current) => ({ ...current, pointMeaning: next }));

  const displayGraph = useMemo(() => {
    if (!question.graph) return null;
    const applyToGraph = axisSetup.applyToGraph === true;
    if (!applyToGraph) return question.graph;

    const hideLabels = axisSetup.hideGraphLabels === true;
    const hideUnits = axisSetup.hideGraphUnits === true;
    const hideScale = axisSetup.hideGraphScale === true;
    const originalAxisDisplay = question.graph.axisDisplay && typeof question.graph.axisDisplay === 'object'
      ? question.graph.axisDisplay
      : {};

    const base = {
      ...question.graph,
      xAxisLabel: values.xLabel || (hideLabels ? '' : question.graph.xAxisLabel || ''),
      yAxisLabel: values.yLabel || (hideLabels ? '' : question.graph.yAxisLabel || ''),
      xAxisUnit: values.xUnit || (hideUnits ? '' : question.graph.xAxisUnit || ''),
      yAxisUnit: values.yUnit || (hideUnits ? '' : question.graph.yAxisUnit || ''),
      xStep: positiveNumberOr(values.xStep, question.graph.xStep),
      yStep: positiveNumberOr(values.yStep, question.graph.yStep),
      axisDisplay: {
        ...originalAxisDisplay,
        showAxisTitles: true,
        showXTickLabels: hideScale ? Boolean(String(values.xStep).trim()) : originalAxisDisplay.showXTickLabels !== false,
        showYTickLabels: hideScale ? Boolean(String(values.yStep).trim()) : originalAxisDisplay.showYTickLabels !== false,
      },
    };
    return requirements.origin && originMode !== 'open'
      ? buildInterpretationGraph(base, values.pointMeaning, originConfig)
      : base;
  }, [axisSetup, originConfig, originMode, question.graph, requirements.origin, values.pointMeaning, values.xLabel, values.yLabel, values.xUnit, values.yUnit, values.xStep, values.yStep]);

  const showDragAxisEditor = Boolean(displayGraph && requirements.axes && axisInputMode === 'drag');

  return (
    <div style={{ textAlign: 'left', maxWidth: '920px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, textAlign: 'center' }}>Quantities and Their Relationship</h2>
      <QuestionPrompt>{question.prompt || 'Identify and describe the relationship.'}</QuestionPrompt>
      {question.scenario && !question.suppressScenarioDisplay && <div style={{ padding: '18px', borderRadius: '12px', background: '#f8fbff', border: '1px solid #cbd9ec', lineHeight: 1.6, fontSize: '17px' }}>{question.scenario}</div>}

      {showDragAxisEditor && (
        <GraphAxisEditor
          graph={displayGraph}
          quantities={quantities}
          values={values}
          onFieldChange={setField}
          feedback={feedback}
          title="Relationship graph"
        />
      )}
      {displayGraph && !showDragAxisEditor && <GraphDisplay graph={displayGraph} title="Relationship graph" />}

      {requirements.quantities && (
        <section style={{ marginTop: '22px' }}>
          <h3>1. Identify the quantities</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <label style={{ fontWeight: 800 }}>Independent quantity
              <select disabled={disabled} value={values.independentId} onChange={(event) => setField('independentId', event.target.value)} style={{ ...selectStyle(statusFor(feedback, 'independent')), display: 'block', marginTop: '7px' }}>
                <option value="">Choose a quantity</option>
                {quantities.map((quantity) => <option key={quantity.id} value={quantity.id}>{quantity.label}</option>)}
              </select>
            </label>
            <label style={{ fontWeight: 800 }}>Dependent quantity
              <select disabled={disabled} value={values.dependentId} onChange={(event) => setField('dependentId', event.target.value)} style={{ ...selectStyle(statusFor(feedback, 'dependent')), display: 'block', marginTop: '7px' }}>
                <option value="">Choose a quantity</option>
                {quantities.map((quantity) => <option key={quantity.id} value={quantity.id}>{quantity.label}</option>)}
              </select>
            </label>
          </div>
        </section>
      )}

      {requirements.continuity && (
        <section style={{ marginTop: '22px' }}>
          <h3>2. Decide whether the relationship is discrete or continuous</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['discrete', 'continuous'].map((kind) => (
              <label key={kind} style={{ padding: '10px 15px', borderRadius: '999px', border: `2px solid ${values.relationshipType === kind ? '#1a73e8' : '#cbd3df'}`, background: values.relationshipType === kind ? '#e8f0fe' : '#fff', fontWeight: 800, textTransform: 'capitalize' }}>
                <input disabled={disabled} type="radio" name="relationship-type" checked={values.relationshipType === kind} onChange={() => setField('relationshipType', kind)} /> {kind}
              </label>
            ))}
          </div>
        </section>
      )}

      {requirements.axes && axisInputMode !== 'drag' && (
        <section style={{ marginTop: '22px' }}>
          <h3>3. Label the axes and units</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            {[
              ['xLabel', 'X-axis quantity', 'x-label'],
              ['xUnit', 'X-axis unit', 'x-unit'],
              ['yLabel', 'Y-axis quantity', 'y-label'],
              ['yUnit', 'Y-axis unit', 'y-unit'],
            ].map(([field, label, partId]) => (
              <label key={field} style={{ fontWeight: 800 }}>{label}
                <input disabled={disabled} value={values[field]} onChange={(event) => setField(field, event.target.value)} style={{ ...selectStyle(statusFor(feedback, partId)), display: 'block', marginTop: '7px', boxSizing: 'border-box' }} />
              </label>
            ))}
          </div>
          {axisSetup.applyToGraph === true && (
            <div style={{ marginTop: '9px', color: '#5f6368', fontSize: '13px' }}>
              Your labels and units appear on the graph as you enter them.
            </div>
          )}
        </section>
      )}

      {requirements.axes && axisInputMode === 'drag' && (
        <section style={{ marginTop: '18px', padding: '12px 14px', borderRadius: '10px', background: '#f8fbff', color: '#3c4043' }}>
          <strong>Axis setup:</strong> Drag the quantity and unit cards directly to the graph. Your choices appear on the graph immediately.
        </section>
      )}

      {requirements.scale && (
        <section style={{ marginTop: '22px' }}>
          <h3>4. Choose a reasonable scale</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            <label style={{ fontWeight: 800 }}>X-axis count-by value
              <input disabled={disabled} type="number" min="0" step="any" value={values.xStep} onChange={(event) => setField('xStep', event.target.value)} style={{ ...selectStyle(statusFor(feedback, 'x-step')), display: 'block', marginTop: '7px', boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontWeight: 800 }}>Y-axis count-by value
              <input disabled={disabled} type="number" min="0" step="any" value={values.yStep} onChange={(event) => setField('yStep', event.target.value)} style={{ ...selectStyle(statusFor(feedback, 'y-step')), display: 'block', marginTop: '7px', boxSizing: 'border-box' }} />
            </label>
          </div>
          {axisSetup.applyToGraph === true && (
            <div style={{ marginTop: '9px', color: '#5f6368', fontSize: '13px' }}>
              Each positive count-by value immediately changes that axis on the graph. Hidden numbers appear only after you choose a scale.
            </div>
          )}
        </section>
      )}

      {requirements.origin && (
        <section style={{ marginTop: '22px' }}>
          <h3>5. Interpret the starting point</h3>
          {originMode === 'open' ? (
            <textarea disabled={disabled} value={values.originMeaning} onChange={(event) => setField('originMeaning', event.target.value)} placeholder="Explain what the starting point means in the situation." style={{ width: '100%', minHeight: '105px', padding: '12px', boxSizing: 'border-box', borderRadius: '9px', border: `2px solid ${statusFor(feedback, 'origin') === 'incorrect' ? '#d93025' : statusFor(feedback, 'origin') === 'correct' ? '#188038' : '#bdc7d6'}`, font: 'inherit' }} />
          ) : (
            <PointMeaningBuilder
              config={originConfig}
              values={values.pointMeaning}
              onChange={setPointMeaning}
              graph={null}
              feedback={feedback}
              prefix="origin"
              disabled={disabled}
              showGraph={false}
              quantityChoices={quantities}
            />
          )}
        </section>
      )}
    </div>
  );
}
