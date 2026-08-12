import {
  compareSequencesAt,
  normalizeSequenceSpec,
  sequenceChange,
  sequencePartialSum,
  sequenceTerm,
} from '../sequenceExplorer/sequenceMath.js';
import {
  findTableMismatchIndexes,
  mismatchedRepresentationKinds,
  representationById,
} from '../representationMatch/representationMath.js';
import {
  FUNCTION_FAMILY_LABELS,
  behaviorForSpec,
  behaviorLabel,
  compareFunctionValues,
  domainRangeForSpec,
  interceptsForSpec,
  investigationFeatures,
  normalizeInvestigationSpec,
  relationLabel,
} from '../functionInvestigation2/functionInvestigationMath.js';

const finiteText = (value) => Number.isFinite(Number(value)) ? String(Number(value)) : String(value ?? '');
const titleCase = (value) => String(value || '').replace(/^./, (character) => character.toUpperCase());
const listText = (values = []) => values.length ? values.map(finiteText).join(', ') : 'none';

const sequenceSpec = (question = {}) => {
  const source = question.sequence || {};
  const kind = source.kind || question.kind || 'arithmetic';
  return normalizeSequenceSpec({ ...source, kind }, kind);
};

const sequenceRules = (spec) => {
  if (spec.kind === 'arithmetic') {
    const sign = spec.difference < 0 ? '−' : '+';
    const magnitude = Math.abs(spec.difference);
    return {
      explicit: `aₙ = ${finiteText(spec.first)} ${sign} (n − 1)(${finiteText(magnitude)})`,
      recursive: `a₁ = ${finiteText(spec.first)}; aₙ = aₙ₋₁ ${sign} ${finiteText(magnitude)}`,
    };
  }
  return {
    explicit: `aₙ = ${finiteText(spec.first)}(${finiteText(spec.ratio)})ⁿ⁻¹`,
    recursive: `a₁ = ${finiteText(spec.first)}; aₙ = ${finiteText(spec.ratio)} · aₙ₋₁`,
  };
};

const relationPairs = (question = {}) => (Array.isArray(question.pairs) ? question.pairs : [])
  .map((pair) => Array.isArray(pair) ? [Number(pair[0]), Number(pair[1])] : [Number(pair?.x), Number(pair?.y)])
  .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

const uniqueSorted = (values = []) => [...new Set(values)].sort((a, b) => a - b);

const buildSequenceReview = (question) => {
  const mode = question.mode || 'analyze';
  if (mode === 'compare') {
    const left = normalizeSequenceSpec(question.left || {}, question.left?.kind || 'arithmetic');
    const right = normalizeSequenceSpec(question.right || {}, question.right?.kind || 'geometric');
    const n = Number(question.compareN ?? 7);
    const result = compareSequencesAt(left, right, n);
    const leftLabel = question.leftLabel || 'Sequence A';
    const rightLabel = question.rightLabel || 'Sequence B';
    const larger = result.relation === 'left' ? leftLabel : result.relation === 'right' ? rightLabel : 'They are equal';
    return {
      title: 'Sequence solution',
      items: [
        { label: `${leftLabel} at n = ${n}`, value: finiteText(result.left) },
        { label: `${rightLabel} at n = ${n}`, value: finiteText(result.right) },
        { label: 'Larger term', value: larger },
        { label: 'Absolute difference', value: finiteText(result.difference) },
      ],
    };
  }

  const spec = sequenceSpec(question);
  const family = titleCase(spec.kind);
  if (mode === 'ruleBridge') {
    const rules = sequenceRules(spec);
    return {
      title: 'Sequence-rule solution',
      items: [
        { label: 'Sequence family', value: family },
        { label: 'Explicit rule', value: rules.explicit },
        { label: 'Recursive rule', value: rules.recursive },
      ],
    };
  }
  if (mode === 'missingTerm') {
    const n = Number(question.missingIndex ?? 4);
    return {
      title: 'Missing-term solution',
      items: [
        { label: 'Sequence family', value: family },
        { label: `a${n}`, value: finiteText(sequenceTerm(spec, n)) },
      ],
    };
  }
  if (mode === 'partialSum') {
    const n = Number(question.sumN ?? 6);
    return {
      title: 'Finite-sum solution',
      items: [
        { label: `Last term a${n}`, value: finiteText(sequenceTerm(spec, n)) },
        { label: `Sum S${n}`, value: finiteText(sequencePartialSum(spec, n)) },
      ],
    };
  }

  const targetN = Number(question.targetN ?? 8);
  return {
    title: 'Sequence solution',
    items: [
      { label: 'Sequence family', value: family },
      { label: spec.kind === 'arithmetic' ? 'Common difference' : 'Common ratio', value: finiteText(sequenceChange(spec)) },
      { label: `a${targetN}`, value: finiteText(sequenceTerm(spec, targetN)) },
    ],
  };
};

const buildRepresentationReview = (question) => {
  const mode = question.mode || 'completeSet';
  const sets = Array.isArray(question.sets) ? question.sets : [];
  const target = representationById(sets, question.targetId || sets[0]?.id);
  if (mode === 'graphMatch') {
    const index = sets.findIndex((item) => item.id === target?.id);
    return {
      title: 'Representation solution',
      items: [
        { label: 'Target equation', value: target?.equation || '—' },
        { label: 'Matching graph', value: index >= 0 ? `Graph ${String.fromCharCode(65 + index)}` : '—' },
      ],
    };
  }
  if (mode === 'findMismatch') {
    const mixed = question.mixedSet || {};
    const mismatch = mismatchedRepresentationKinds(target?.id, mixed);
    return {
      title: 'Representation solution',
      items: [{ label: 'Representation that does not belong', value: mismatch.length ? mismatch.map(titleCase).join(', ') : '—' }],
    };
  }
  if (mode === 'tableAudit') {
    const mismatches = findTableMismatchIndexes(question.function || {}, question.rows || [], Number(question.tolerance ?? 0.01));
    return {
      title: 'Table-audit solution',
      items: [{ label: 'Row that breaks the rule', value: mismatches.length ? mismatches.map((index) => `Row ${index + 1}`).join(', ') : 'none' }],
    };
  }
  return {
    title: 'Representation solution',
    items: [
      { label: 'Equation', value: target?.equation || '—' },
      { label: 'Table', value: target?.table || '—' },
      { label: 'Context', value: target?.context || '—' },
    ],
  };
};

const buildFunctionReview = (question) => {
  const mode = question.mode || 'features';
  if (mode === 'compare') {
    const left = normalizeInvestigationSpec(question.left || {});
    const right = normalizeInvestigationSpec(question.right || {});
    const x = Number(question.x ?? 2);
    const result = compareFunctionValues(left, right, x);
    const relation = result.relation === 'left' ? 'f(x) is greater'
      : result.relation === 'right' ? 'g(x) is greater'
        : result.relation === 'equal' ? 'The values are equal' : 'At least one value is undefined';
    return {
      title: 'Function-comparison solution',
      items: [
        { label: `f(${finiteText(x)})`, value: finiteText(result.leftValue) },
        { label: `g(${finiteText(x)})`, value: finiteText(result.rightValue) },
        { label: 'Comparison', value: relation },
      ],
    };
  }

  const spec = normalizeInvestigationSpec(question.function || {});
  const family = FUNCTION_FAMILY_LABELS[spec.type] || titleCase(spec.type);
  if (mode === 'domainRange') {
    const answer = domainRangeForSpec(spec);
    return {
      title: 'Function solution',
      items: [
        { label: 'Family', value: family },
        { label: 'Domain', value: relationLabel(answer.domainCode, spec) },
        { label: 'Range', value: relationLabel(answer.rangeCode, spec) },
      ],
    };
  }
  if (mode === 'behavior') {
    return {
      title: 'Function solution',
      items: [
        { label: 'Family', value: family },
        { label: 'Behavior', value: behaviorLabel(behaviorForSpec(spec)) },
      ],
    };
  }
  if (mode === 'intercepts') {
    const intercepts = interceptsForSpec(spec);
    return {
      title: 'Function solution',
      items: [
        { label: 'x-intercepts', value: listText(intercepts.x) },
        { label: 'y-intercept', value: intercepts.y == null ? 'none' : finiteText(intercepts.y) },
      ],
    };
  }
  const features = investigationFeatures(spec);
  return {
    title: 'Function solution',
    items: [
      { label: 'Family', value: family },
      { label: features.anchor.label, value: `(${finiteText(features.anchor.point[0])}, ${finiteText(features.anchor.point[1])})` },
      ...(features.verticalAsymptotes.length ? [{ label: 'Vertical asymptote', value: `x = ${finiteText(features.verticalAsymptotes[0])}` }] : []),
      ...(features.horizontalAsymptotes.length ? [{ label: 'Horizontal asymptote', value: `y = ${finiteText(features.horizontalAsymptotes[0])}` }] : []),
    ],
  };
};

const buildRelationReview = (question) => {
  const pairs = relationPairs(question);
  const domain = uniqueSorted(pairs.map(([x]) => x));
  const range = uniqueSorted(pairs.map(([, y]) => y));
  const outputsByInput = new Map();
  let isFunction = true;
  pairs.forEach(([x, y]) => {
    if (!outputsByInput.has(x)) outputsByInput.set(x, new Set());
    outputsByInput.get(x).add(y);
    if (outputsByInput.get(x).size > 1) isFunction = false;
  });
  return {
    title: 'Relation solution',
    items: [
      { label: 'Mapping arrows', value: pairs.map(([x, y]) => `${finiteText(x)} → ${finiteText(y)}`).join(', ') },
      { label: 'Domain', value: `{${listText(domain)}}` },
      { label: 'Range', value: `{${listText(range)}}` },
      { label: 'Function?', value: isFunction ? 'Yes' : 'No' },
    ],
  };
};

export const buildToolSolutionReviewModel = (question = {}) => {
  const toolId = question.toolId || question.type;
  try {
    if (toolId === 'sequenceExplorer') return buildSequenceReview(question);
    if (toolId === 'representationMatch') return buildRepresentationReview(question);
    if (toolId === 'functionInvestigation2') return buildFunctionReview(question);
    if (toolId === 'relationMapping') return buildRelationReview(question);
  } catch (error) {
    return { title: 'Solution review', items: [], note: `The worked solution could not be generated: ${error.message}` };
  }
  return null;
};
