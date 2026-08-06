import { useEffect, useMemo } from 'react';
import QuestionPrompt from './QuestionPrompt';
import GraphDisplay from './GraphDisplay';
import useUndoHistory from './useUndoHistory';
import {
  matchesAcceptedText,
  matchesConceptGroups,
  stableStringify,
} from './scenarioResponseUtils';

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

export default function RelationshipModel({
  question,
  onStateChange,
  onUndoStateChange,
  feedback,
  draftKey,
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
  };
  const history = useUndoHistory(initial, 80, draftKey ? `${draftKey}:relationship-model` : null);
  const values = history.value;
  const requirements = {
    quantities: question.requireQuantityRoles !== false,
    continuity: Boolean(question.relationshipType || question.requireRelationshipType),
    axes: Boolean(question.axisSetup?.required),
    scale: Boolean(question.axisSetup?.requireScale),
    origin: Boolean(question.origin?.required),
  };

  const quantityById = Object.fromEntries(quantities.map((item) => [item.id, item]));
  const acceptedXLabels = question.axisSetup?.acceptedXLabels || [quantityById[question.correctIndependentId]?.label];
  const acceptedYLabels = question.axisSetup?.acceptedYLabels || [quantityById[question.correctDependentId]?.label];
  const acceptedXUnits = question.axisSetup?.acceptedXUnits || [quantityById[question.correctIndependentId]?.unit];
  const acceptedYUnits = question.axisSetup?.acceptedYUnits || [quantityById[question.correctDependentId]?.unit];
  const acceptedXSteps = (question.axisSetup?.acceptedXSteps || []).map(String);
  const acceptedYSteps = (question.axisSetup?.acceptedYSteps || []).map(String);

  const parts = [];
  if (requirements.quantities) {
    parts.push({
      id: 'independent',
      label: 'Independent quantity',
      isComplete: Boolean(values.independentId),
      isCorrect: values.independentId === question.correctIndependentId,
      response: quantityById[values.independentId]?.label || '',
    });
    parts.push({
      id: 'dependent',
      label: 'Dependent quantity',
      isComplete: Boolean(values.dependentId),
      isCorrect: values.dependentId === question.correctDependentId,
      response: quantityById[values.dependentId]?.label || '',
    });
  }
  if (requirements.continuity) {
    parts.push({
      id: 'relationship-type',
      label: 'Discrete or continuous relationship',
      isComplete: Boolean(values.relationshipType),
      isCorrect: values.relationshipType === question.relationshipType,
      response: values.relationshipType,
    });
  }
  if (requirements.axes) {
    parts.push({ id: 'x-label', label: 'X-axis quantity', isComplete: Boolean(values.xLabel.trim()), isCorrect: matchesAcceptedText(values.xLabel, acceptedXLabels), response: values.xLabel });
    parts.push({ id: 'x-unit', label: 'X-axis unit', isComplete: Boolean(values.xUnit.trim()), isCorrect: matchesAcceptedText(values.xUnit, acceptedXUnits), response: values.xUnit });
    parts.push({ id: 'y-label', label: 'Y-axis quantity', isComplete: Boolean(values.yLabel.trim()), isCorrect: matchesAcceptedText(values.yLabel, acceptedYLabels), response: values.yLabel });
    parts.push({ id: 'y-unit', label: 'Y-axis unit', isComplete: Boolean(values.yUnit.trim()), isCorrect: matchesAcceptedText(values.yUnit, acceptedYUnits), response: values.yUnit });
  }
  if (requirements.scale) {
    parts.push({
      id: 'x-step',
      label: 'Reasonable x-axis scale',
      isComplete: Boolean(String(values.xStep).trim()),
      isCorrect: acceptedXSteps.length ? acceptedXSteps.includes(String(values.xStep).trim()) : Number(values.xStep) > 0,
      response: values.xStep,
    });
    parts.push({
      id: 'y-step',
      label: 'Reasonable y-axis scale',
      isComplete: Boolean(String(values.yStep).trim()),
      isCorrect: acceptedYSteps.length ? acceptedYSteps.includes(String(values.yStep).trim()) : Number(values.yStep) > 0,
      response: values.yStep,
    });
  }
  if (requirements.origin) {
    parts.push({
      id: 'origin',
      label: 'Meaning of the starting point',
      isComplete: Boolean(values.originMeaning.trim()),
      isCorrect: matchesConceptGroups(values.originMeaning, question.origin?.requiredConcepts || []),
      response: values.originMeaning,
    });
  }

  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  const isCorrect = isComplete && parts.every((part) => part.isCorrect);

  useEffect(() => {
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: stableStringify(values),
      questionDetails: `${question.prompt || 'Model the relationship.'} Scenario: ${question.scenario || ''} Responses: ${JSON.stringify(values)}`,
      parts,
    });
  }, [isComplete, isCorrect, onStateChange, question.prompt, question.scenario, values]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last relationship-model entry' });
    return () => onUndoStateChange?.(null);
  }, [history.canUndo, history.undo, onUndoStateChange]);

  const setField = (field, value) => history.setValue((current) => ({ ...current, [field]: value }));

  return (
    <div style={{ textAlign: 'left', maxWidth: '920px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, textAlign: 'center' }}>Quantities and Their Relationship</h2>
      <QuestionPrompt>{question.prompt || 'Identify and describe the relationship.'}</QuestionPrompt>
      {question.scenario && <div style={{ padding: '18px', borderRadius: '12px', background: '#f8fbff', border: '1px solid #cbd9ec', lineHeight: 1.6, fontSize: '17px' }}>{question.scenario}</div>}
      {question.graph && <GraphDisplay graph={question.graph} title="Relationship graph" />}

      {requirements.quantities && (
        <section style={{ marginTop: '22px' }}>
          <h3>1. Identify the quantities</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <label style={{ fontWeight: 800 }}>Independent quantity
              <select value={values.independentId} onChange={(event) => setField('independentId', event.target.value)} style={{ ...selectStyle(statusFor(feedback, 'independent')), display: 'block', marginTop: '7px' }}>
                <option value="">Choose a quantity</option>
                {quantities.map((quantity) => <option key={quantity.id} value={quantity.id}>{quantity.label}</option>)}
              </select>
            </label>
            <label style={{ fontWeight: 800 }}>Dependent quantity
              <select value={values.dependentId} onChange={(event) => setField('dependentId', event.target.value)} style={{ ...selectStyle(statusFor(feedback, 'dependent')), display: 'block', marginTop: '7px' }}>
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
                <input type="radio" name="relationship-type" checked={values.relationshipType === kind} onChange={() => setField('relationshipType', kind)} /> {kind}
              </label>
            ))}
          </div>
        </section>
      )}

      {requirements.axes && (
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
                <input value={values[field]} onChange={(event) => setField(field, event.target.value)} style={{ ...selectStyle(statusFor(feedback, partId)), display: 'block', marginTop: '7px', boxSizing: 'border-box' }} />
              </label>
            ))}
          </div>
        </section>
      )}

      {requirements.scale && (
        <section style={{ marginTop: '22px' }}>
          <h3>4. Choose a reasonable scale</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            <label style={{ fontWeight: 800 }}>X-axis count-by value
              <input type="number" min="0" step="any" value={values.xStep} onChange={(event) => setField('xStep', event.target.value)} style={{ ...selectStyle(statusFor(feedback, 'x-step')), display: 'block', marginTop: '7px', boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontWeight: 800 }}>Y-axis count-by value
              <input type="number" min="0" step="any" value={values.yStep} onChange={(event) => setField('yStep', event.target.value)} style={{ ...selectStyle(statusFor(feedback, 'y-step')), display: 'block', marginTop: '7px', boxSizing: 'border-box' }} />
            </label>
          </div>
        </section>
      )}

      {requirements.origin && (
        <section style={{ marginTop: '22px' }}>
          <h3>5. Interpret the starting point</h3>
          <textarea value={values.originMeaning} onChange={(event) => setField('originMeaning', event.target.value)} placeholder="Explain what the starting point means in the situation." style={{ width: '100%', minHeight: '105px', padding: '12px', boxSizing: 'border-box', borderRadius: '9px', border: `2px solid ${statusFor(feedback, 'origin') === 'incorrect' ? '#d93025' : statusFor(feedback, 'origin') === 'correct' ? '#188038' : '#bdc7d6'}`, font: 'inherit' }} />
        </section>
      )}
    </div>
  );
}
