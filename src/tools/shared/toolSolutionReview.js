import {
  compareSequencesAt,
  normalizeSequenceSpec,
  sequenceChange,
  sequencePartialSum,
  sequenceTerm,
} from '../sequenceExplorer/sequenceMath.js';
import {
  LINEAR_EQUATION_KINDS,
  buildLinearConnectionCards,
  describeLinearCard,
  findTableMismatchIndexes,
  linearConnectionsCardKinds,
  linearConnectionsTask,
  linearGroupLabels,
  linearMismatchSetFor,
  mismatchedRepresentationKinds,
  representationById,
  representationMatchMode,
  representationMixedSet,
  representationSetsFor,
  representationTargetId,
  scoreLinearMismatchSelection,
  tableAuditFunction,
  tableAuditRows,
} from '../representationMatch/representationMath.js';
import { DEFAULT_LINEAR_GRAPH_BOUNDS, LINEAR_KIND_LABELS } from '../representationMatch/linearCardLabels.js';
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

/*
 * THE CARD SORT'S ANSWER, READ FROM THE DECK THE STUDENT SORTED.
 *
 * `linearConnections` is not a completeSet: it has no single target with an
 * equation, a table and a context. It fell through to that review, which put a
 * set's `table` into the page — and a Question Family set carries its table as
 * a SPEC, `{ xValues: [...] }`, not as text. React refused to render the
 * object, and because this review appears only once a question is closed, a
 * student whose Warm-Up card sort ran out of attempts (often at the deadline,
 * by auto-submit) lost the whole question to "This question did not load"
 * (lmr-wu-1, after the teacher reopened the Warm-Up).
 *
 * The review is built from what the board and the shared grader build from —
 * the same deck (buildLinearConnectionCards), the same group names, the same
 * words for every card (describeLinearCard, LINEAR_KIND_LABELS) — so it shows
 * exactly the grouping the grader calls correct.
 */
const buildLinearConnectionsReview = (question) => {
  const sets = representationSetsFor(question);
  const bounds = question.graphBounds || DEFAULT_LINEAR_GRAPH_BOUNDS;
  const cardText = (card) => `${LINEAR_KIND_LABELS[card.kind] || card.kind}: ${describeLinearCard(card, { bounds })}`;
  if (linearConnectionsTask(question) === 'findMismatch') {
    const mismatchSet = linearMismatchSetFor(question, sets);
    const cards = mismatchSet ? buildLinearConnectionCards([mismatchSet], LINEAR_EQUATION_KINDS) : [];
    const { expectedId } = scoreLinearMismatchSelection(cards, '');
    const mismatch = cards.find((card) => card.id === expectedId) || null;
    const correction = (Array.isArray(question.correctionOptions) ? question.correctionOptions : [])
      .find((option) => option && option.id === question.correctionAnswerId) || null;
    return {
      title: 'Representation solution',
      items: [
        { label: 'Card that does not belong', value: mismatch ? cardText(mismatch) : '—' },
        ...(correction ? [{ label: 'Correction', value: correction.label ?? correction.text ?? correction.value }] : []),
      ],
    };
  }
  const cards = buildLinearConnectionCards(sets, linearConnectionsCardKinds(question));
  const labels = linearGroupLabels(question, sets);
  return {
    title: 'Card-sort solution',
    items: sets.map((set, index) => ({
      label: labels[index],
      value: cards.filter((card) => card.setId === set.id).map(cardText).join(' · '),
    })),
    note: 'A sort is marked by which cards are grouped together, not by which group name they are under.',
  };
};

const buildRepresentationReview = (question) => {
  const mode = representationMatchMode(question);
  if (mode === 'linearConnections') return buildLinearConnectionsReview(question);
  // The sets and target the board shows, including its fallbacks.
  const sets = representationSetsFor(question);
  const target = representationById(sets, representationTargetId(question, sets));
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
    // The mixed set the board deals and the grader marks, authored or not.
    const mixed = representationMixedSet(question, sets, target?.id);
    const mismatch = mismatchedRepresentationKinds(target?.id, mixed);
    return {
      title: 'Representation solution',
      items: [{ label: 'Representation that does not belong', value: mismatch.length ? mismatch.map(titleCase).join(', ') : '—' }],
    };
  }
  if (mode === 'tableAudit') {
    // The function and rows the board shows and the grader checks, with
    // the same defaults when the author left them out.
    const spec = tableAuditFunction(question);
    const mismatches = findTableMismatchIndexes(spec, tableAuditRows(question, spec), Number(question.tolerance ?? 0.01));
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

const buildOpenSortReview = (question) => {
  const schemes = Array.isArray(question.validSchemes) ? question.validSchemes : [];
  return {
    title: 'Open-sort solution',
    items: schemes.slice(0, 4).map((scheme, index) => ({
      label: scheme.label || `Valid sort ${index + 1}`,
      value: (scheme.groups || []).map((group) => `${group.label || 'Group'}: ${(group.itemIds || []).join(', ')}`).join(' · '),
    })),
    note: schemes.length > 1 ? 'More than one mathematical partition is valid for this problem.' : null,
  };
};

const constraintText = (constraint = {}) => {
  if (constraint.kind === 'family') return `Family: ${constraint.value}`;
  if (constraint.kind === 'continuity' || constraint.kind === 'domainMode') return `Graph type: ${constraint.value}`;
  if (constraint.kind === 'behavior') return `Behavior: ${constraint.value}`;
  if (constraint.kind === 'extremum') return `Has an absolute ${constraint.value || constraint.extremumType}`;
  if (constraint.kind === 'isFunction') return constraint.value ? 'Must be a function' : 'Must not be a function';
  if (constraint.kind === 'straightLine') return constraint.value ? 'Must be a straight line' : 'Must not be a straight line';
  if (constraint.kind === 'passesThrough') return `Passes through (${(constraint.point || constraint.value || []).join(', ')})`;
  if (constraint.kind === 'vertex') return `Vertex: (${(constraint.point || constraint.value || []).join(', ')})`;
  if (constraint.kind === 'yIntercept') return `y-intercept: ${constraint.value}`;
  if (constraint.kind === 'xIntercept') return `x-intercept(s): ${Array.isArray(constraint.value) ? constraint.value.join(', ') : constraint.value}`;
  return constraint.label || constraint.kind || 'Constraint';
};

const buildConstraintFunctionReview = (question) => ({
  title: 'Constraint-builder solution',
  items: (question.constraints || []).map((constraint, index) => ({ label: `Constraint ${index + 1}`, value: constraintText(constraint) })),
  note: 'There is intentionally no single answer equation. Any relation that satisfies every listed constraint is correct.',
});

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

/*
 * A REVIEW IS TEXT, WHATEVER THE QUESTION HELD.
 *
 * Every builder above reads authored or generated question fields, and a field
 * can hold structure where a sentence was expected: a Question Family's table
 * is a spec (`{ xValues }`), an authored label can be an object. The review is
 * rendered beside a closed question, so a value React cannot render must never
 * reach it. A number, a coordinate pair or a list of them keeps its meaning;
 * anything else is shown as "—" rather than guessed at.
 */
const reviewText = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? finiteText(value) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
      return `(${finiteText(value[0])}, ${finiteText(value[1])})`;
    }
    return value.map(reviewText).filter(Boolean).join(', ');
  }
  return '';
};

const textOnlyReview = (model) => {
  if (!model || typeof model !== 'object') return null;
  const items = (Array.isArray(model.items) ? model.items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ label: reviewText(item.label) || 'Answer', value: reviewText(item.value) || '—' }));
  return {
    title: reviewText(model.title) || 'Solution review',
    items,
    note: reviewText(model.note) || null,
  };
};

const reviewBuilderFor = (toolId) => {
  if (toolId === 'sequenceExplorer') return buildSequenceReview;
  if (toolId === 'representationMatch') return buildRepresentationReview;
  if (toolId === 'functionInvestigation2') return buildFunctionReview;
  if (toolId === 'relationMapping') return buildRelationReview;
  if (toolId === 'openSortBoard') return buildOpenSortReview;
  if (toolId === 'constraintFunctionBuilder') return buildConstraintFunctionReview;
  return null;
};

export const buildToolSolutionReviewModel = (question = {}) => {
  const source = question && typeof question === 'object' ? question : {};
  const builder = reviewBuilderFor(source.toolId || source.type);
  if (!builder) return null;
  try {
    return textOnlyReview(builder(source));
  } catch {
    return { title: 'Solution review', items: [], note: 'The worked solution could not be generated for this question.' };
  }
};
