export const WORKFLOW_FOCUS_MIN_STAGES = 4;

export const shouldUseWorkflowFocusMode = (stages = []) => (
  Array.isArray(stages) && stages.length >= WORKFLOW_FOCUS_MIN_STAGES
);

const asText = (value) => String(value ?? '').trim();

// Kept in step with PointInputStage: the stored token for "does not exist".
const POINT_INPUT_NONE = '__none__';

const quantityLabel = (stage, id) => {
  const quantities = Array.isArray(stage?.quantities) ? stage.quantities : [];
  return quantities.find((entry) => entry?.id === id)?.label || id || '';
};

const choiceLabel = (stage, value) => {
  const choices = Array.isArray(stage?.choices) ? stage.choices : [];
  const match = choices.find((entry) => (
    typeof entry === 'string' ? entry === value : entry?.id === value
  ));
  return typeof match === 'string' ? match : (match?.label || value);
};

export const summarizeStageResponse = (stage, response) => {
  if (response === undefined || response === null || response === '') return null;
  const label = stage?.label || stage?.summaryLabel || stage?.id || 'Step';

  if (stage?.kind === 'quantityRoles' && response && typeof response === 'object') {
    const independent = quantityLabel(stage, response.independent);
    const dependent = quantityLabel(stage, response.dependent);
    const parts = [];
    if (independent) parts.push(`Input: ${independent}`);
    if (dependent) parts.push(`Output: ${dependent}`);
    return parts.length ? { label, text: parts.join(' · '), kind: 'text' } : null;
  }

  if (['equationInput', 'domainInput', 'rangeInput', 'intervalInput', 'algebraWorkspace'].includes(stage?.kind)) {
    const raw = typeof response === 'string' ? response : (response?.equation || response?.responseKey || '');
    return asText(raw) ? { label, text: asText(raw), kind: 'math' } : null;
  }

  if (stage?.kind === 'axisSetup' && response && typeof response === 'object') {
    const x = [response.xLabel, response.xUnit].filter(Boolean).join(' · ');
    const y = [response.yLabel, response.yUnit].filter(Boolean).join(' · ');
    const scale = response.xStep && response.yStep ? `Scale: x by ${response.xStep}, y by ${response.yStep}` : '';
    const text = [x ? `x: ${x}` : '', y ? `y: ${y}` : '', scale].filter(Boolean).join(' · ');
    return text ? { label, text, kind: 'text' } : null;
  }

  if (stage?.kind === 'tableInput' && response && typeof response === 'object') {
    const points = Array.isArray(response.points) ? response.points : [];
    if (points.length) {
      const preview = points.slice(0, 5).map(([x, y]) => `(${x}, ${y})`).join('  ');
      return { label, text: points.length > 5 ? `${preview}  +${points.length - 5} more` : preview, kind: 'text' };
    }
    return response.isComplete ? { label, text: 'Table completed', kind: 'text' } : null;
  }

  if (['functionGraph', 'coordinatePlot'].includes(stage?.kind) && response && typeof response === 'object') {
    return response.isComplete
      ? { label, text: 'Graph completed', kind: 'text' }
      : null;
  }

  // WHAT WAS MARKED, NEVER WHERE.
  //
  // The summary strip sits on screen while later stages are answered, and a
  // question of this shape asks the student to mark the x-intercepts and then,
  // several steps on, to WRITE them. Printing "(-1, 0), (5, 0)" here would hand
  // over the later answer just as surely as a readout on the plane would.
  if (stage?.kind === 'graphFeatureSelect' && response && typeof response === 'object') {
    if (response.none === true) return { label, text: 'Marked: none on this graph', kind: 'text' };
    const marked = Array.isArray(response.selections) ? response.selections.length : 0;
    if (!marked) return null;
    return { label, text: `${marked} marked on the graph`, kind: 'text' };
  }

  // The student's own typed answer, already committed, so it shows in full.
  if (stage?.kind === 'pointInput') {
    if (response === POINT_INPUT_NONE) {
      return { label, text: stage?.noneLabel || 'Does not exist', kind: 'text' };
    }
    return asText(response) ? { label, text: asText(response), kind: 'text' } : null;
  }

  if (['classification', 'multipleChoice'].includes(stage?.kind)) {
    return { label, text: choiceLabel(stage, response), kind: 'text' };
  }

  if (stage?.kind === 'mappingDiagram') {
    return { label, text: 'Mapping completed', kind: 'text' };
  }

  if (stage?.kind === 'numberLine') {
    return { label, text: 'Number line completed', kind: 'text' };
  }

  if (typeof response === 'string' || typeof response === 'number') {
    return { label, text: asText(response), kind: 'text' };
  }

  return null;
};

export const buildWorkflowSummaryItems = (stages = [], responses = {}) => (
  (Array.isArray(stages) ? stages : [])
    .map((stage) => {
      const summary = summarizeStageResponse(stage, responses?.[stage.id]);
      return summary ? { ...summary, stageId: stage.id } : null;
    })
    .filter(Boolean)
);
