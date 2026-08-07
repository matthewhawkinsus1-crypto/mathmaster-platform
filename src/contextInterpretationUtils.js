import { matchesConceptGroups, normalizeResponseText } from './scenarioResponseUtils';

export const EMPTY_POINT_MEANING = {
  xQuantityId: '',
  xValue: '',
  xUnit: '',
  yQuantityId: '',
  yValue: '',
  yUnit: '',
  openText: '',
};

const asArray = (value) => (Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null && String(item).trim() !== '') : value !== undefined && value !== null && String(value).trim() !== '' ? [value] : []);

const normalizedEquals = (value, candidates = []) => {
  const normalized = normalizeResponseText(value);
  return asArray(candidates).some((candidate) => normalizeResponseText(candidate) === normalized);
};

const numericEquals = (value, expected, tolerance = 1e-8) => {
  const actualNumber = Number(value);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  return Math.abs(actualNumber - expectedNumber) <= tolerance;
};

const quantityDescriptor = (value = {}, fallbackId = '') => ({
  id: String(value.id || fallbackId || '').trim(),
  name: String(value.name || value.label || '').trim(),
  unit: String(value.unit || '').trim(),
  acceptedNames: asArray(value.acceptedNames || value.acceptedLabels || value.name || value.label),
  acceptedUnits: asArray(value.acceptedUnits || value.unit),
});

export const normalizeInterpretationConfig = (config = {}) => {
  const target = config.target && typeof config.target === 'object' ? config.target : {};
  const coordinates = Array.isArray(target.coordinates)
    ? target.coordinates
    : Array.isArray(config.coordinates)
      ? config.coordinates
      : [];
  const quantities = config.quantities && typeof config.quantities === 'object' ? config.quantities : {};
  return {
    responseMode: ['builder', 'guided', 'open'].includes(config.responseMode) ? config.responseMode : 'builder',
    target: {
      kind: String(target.kind || config.kind || 'arbitraryPoint'),
      coordinates: coordinates.length >= 2 ? [Number(coordinates[0]), Number(coordinates[1])] : [Number.NaN, Number.NaN],
      label: String(target.label || config.targetLabel || '').trim(),
    },
    x: quantityDescriptor(quantities.x || {}, 'x'),
    y: quantityDescriptor(quantities.y || {}, 'y'),
    requiredConcepts: config.requiredConcepts || [],
    sampleAnswer: String(config.sampleAnswer || '').trim(),
    requireQuantities: config.requireQuantities !== false,
    requireUnits: config.requireUnits !== false,
    requireValues: config.requireValues !== false,
    graphFeedback: config.applyResponseToGraph !== false,
    quantityChoices: Array.isArray(config.quantityChoices) ? config.quantityChoices : [],
  };
};

export const buildContextInterpretationParts = (rawValues, rawConfig, options = {}) => {
  const values = { ...EMPTY_POINT_MEANING, ...(rawValues || {}) };
  const config = normalizeInterpretationConfig(rawConfig);
  const prefix = String(options.prefix || 'meaning');
  const [expectedX, expectedY] = config.target.coordinates;
  const parts = [];

  if (config.responseMode === 'open') {
    parts.push({
      id: `${prefix}-open`,
      label: options.openLabel || 'Interpret the point in context',
      isComplete: Boolean(String(values.openText || '').trim()),
      isCorrect: matchesConceptGroups(values.openText, config.requiredConcepts),
      response: values.openText,
    });
    return parts;
  }

  if (config.responseMode === 'builder' && config.requireQuantities) {
    parts.push({
      id: `${prefix}-x-quantity`,
      label: 'Independent quantity in the point',
      isComplete: Boolean(values.xQuantityId),
      isCorrect: values.xQuantityId === config.x.id || normalizedEquals(values.xQuantityId, config.x.acceptedNames),
      response: values.xQuantityId,
    });
    parts.push({
      id: `${prefix}-y-quantity`,
      label: 'Dependent quantity in the point',
      isComplete: Boolean(values.yQuantityId),
      isCorrect: values.yQuantityId === config.y.id || normalizedEquals(values.yQuantityId, config.y.acceptedNames),
      response: values.yQuantityId,
    });
  }

  if (config.requireValues) {
    parts.push({
      id: `${prefix}-x-value`,
      label: `${config.x.name || 'X'} value`,
      isComplete: String(values.xValue ?? '').trim() !== '',
      isCorrect: numericEquals(values.xValue, expectedX),
      response: values.xValue,
    });
    parts.push({
      id: `${prefix}-y-value`,
      label: `${config.y.name || 'Y'} value`,
      isComplete: String(values.yValue ?? '').trim() !== '',
      isCorrect: numericEquals(values.yValue, expectedY),
      response: values.yValue,
    });
  }

  if (config.requireUnits) {
    parts.push({
      id: `${prefix}-x-unit`,
      label: `${config.x.name || 'X'} unit`,
      isComplete: Boolean(String(values.xUnit || '').trim()),
      isCorrect: normalizedEquals(values.xUnit, config.x.acceptedUnits),
      response: values.xUnit,
    });
    parts.push({
      id: `${prefix}-y-unit`,
      label: `${config.y.name || 'Y'} unit`,
      isComplete: Boolean(String(values.yUnit || '').trim()),
      isCorrect: normalizedEquals(values.yUnit, config.y.acceptedUnits),
      response: values.yUnit,
    });
  }

  return parts;
};

export const buildNaturalMeaning = (rawValues, rawConfig) => {
  const values = { ...EMPTY_POINT_MEANING, ...(rawValues || {}) };
  const config = normalizeInterpretationConfig(rawConfig);
  const choiceLabels = Object.fromEntries((config.quantityChoices || []).map((item) => [String(item?.id || ''), String(item?.label || item?.name || item?.id || '')]));
  const xName = config.responseMode === 'builder'
    ? (choiceLabels[values.xQuantityId] || (values.xQuantityId === config.x.id ? config.x.name : values.xQuantityId || config.x.name))
    : config.x.name;
  const yName = config.responseMode === 'builder'
    ? (choiceLabels[values.yQuantityId] || (values.yQuantityId === config.y.id ? config.y.name : values.yQuantityId || config.y.name))
    : config.y.name;
  const xUnit = String(values.xUnit || '').trim();
  const yUnit = String(values.yUnit || '').trim();
  const xText = [String(values.xValue ?? '').trim(), xUnit].filter(Boolean).join(' ');
  const yText = [String(values.yValue ?? '').trim(), yUnit].filter(Boolean).join(' ');
  if (!xText && !yText) return '';
  return `When ${xName || 'the x-quantity'} is ${xText || '…'}, ${yName || 'the y-quantity'} is ${yText || '…'}.`;
};

export const buildInterpretationGraph = (baseGraph, rawValues, rawConfig) => {
  if (!baseGraph) return null;
  const values = { ...EMPTY_POINT_MEANING, ...(rawValues || {}) };
  const config = normalizeInterpretationConfig(rawConfig);
  if (!config.graphFeedback) return baseGraph;

  const xNumber = Number(values.xValue);
  const yNumber = Number(values.yValue);
  const xQuantityChosen = config.responseMode !== 'builder' || Boolean(values.xQuantityId);
  const yQuantityChosen = config.responseMode !== 'builder' || Boolean(values.yQuantityId);
  const xUnit = String(values.xUnit || '').trim();
  const yUnit = String(values.yUnit || '').trim();
  const choiceLabels = Object.fromEntries((config.quantityChoices || []).map((item) => [String(item?.id || ''), String(item?.label || item?.name || item?.id || '')]));
  const xName = config.responseMode === 'builder'
    ? (choiceLabels[values.xQuantityId] || (values.xQuantityId === config.x.id ? config.x.name : values.xQuantityId || ''))
    : config.x.name;
  const yName = config.responseMode === 'builder'
    ? (choiceLabels[values.yQuantityId] || (values.yQuantityId === config.y.id ? config.y.name : values.yQuantityId || ''))
    : config.y.name;

  return {
    ...baseGraph,
    xAxisLabel: xQuantityChosen && xName ? xName : baseGraph.xAxisLabel,
    yAxisLabel: yQuantityChosen && yName ? yName : baseGraph.yAxisLabel,
    xAxisUnit: xUnit || baseGraph.xAxisUnit,
    yAxisUnit: yUnit || baseGraph.yAxisUnit,
    interactionHighlight: {
      ...(baseGraph.interactionHighlight || {}),
      xAxisActive: xQuantityChosen,
      yAxisActive: yQuantityChosen,
      xValue: Number.isFinite(xNumber) ? xNumber : null,
      yValue: Number.isFinite(yNumber) ? yNumber : null,
      showPoint: Number.isFinite(xNumber) && Number.isFinite(yNumber),
      label: Number.isFinite(xNumber) && Number.isFinite(yNumber) ? `(${xNumber}, ${yNumber})` : '',
    },
  };
};
