import {
  compareSequencesAt,
  compareSpecsFromQuestion,
  fullBridgeTermCount,
  generateSequence,
  sequenceChange,
  sequencePartialSum,
  sequenceSpecFromQuestion,
  sequenceStudentActions,
  sequenceTerm,
} from '../sequenceExplorer/sequenceMath.js';
import sequenceExplorerDeclaration from '../../../functions/shared/serverGrading/declarations/sequenceExplorer.mjs';
import functionInvestigationDeclaration from '../../../functions/shared/serverGrading/declarations/functionInvestigation2.mjs';
import { resolveToolMode } from '../../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { FUNCTION_CHOICES, correctFunctionChoice } from '../../../functions/shared/relationFunctionChoice.mjs';
import { evaluateFunctionSpec } from '../../../functions/shared/toolMath/shared/toolMath.mjs';
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
import { TOOL_REVIEW_BUILDERS } from './reviews/index.js';

const finiteText = (value) => Number.isFinite(Number(value)) ? String(Number(value)) : String(value ?? '');
const titleCase = (value) => String(value || '').replace(/^./, (character) => character.toUpperCase());
const listText = (values = []) => values.length ? values.map(finiteText).join(', ') : 'none';

/*
 * A WORKED SOLUTION, NOT ONLY THE ANSWER (job K).
 *
 * The sequence, relation and function-investigation reviews below show how
 * each answer is reached — the same numbers the shared grader checks
 * (functions/shared/serverGrading/tools/<tool>.mjs), from the same defaults
 * for an unauthored field — each step true on its own and the last one
 * landing on the stated answer. Shown only once the question is closed.
 */
const MINUS_SIGN = '−';
/** A number for a sentence: float noise trimmed, a real minus sign. */
const shownNumber = (value) => {
  // 15 significant digits: float noise (0.1 + 0.2) goes, an exact 86.49755859375 stays.
  const tidy = Number(Number(value).toPrecision(15));
  const number = Object.is(tidy, -0) ? 0 : tidy;
  return number < 0 ? `${MINUS_SIGN}${String(-number)}` : String(number);
};
/** In a product or after an operator: a negative number is bracketed. */
const shownFactor = (value) => (Number(value) < 0 ? `(${shownNumber(value)})` : shownNumber(value));
/** A number as a student types it (ASCII minus). */
const typedNumber = (value) => shownNumber(value).replace(MINUS_SIGN, '-');
const plusOrMinus = (value) => (Number(value) < 0 ? `${MINUS_SIGN} ${shownNumber(-value)}` : `+ ${shownNumber(value)}`);

const sequenceDeclarationMode = (question) => resolveToolMode(sequenceExplorerDeclaration, question);

const sequenceRules = (spec) => {
  if (spec.kind === 'arithmetic') {
    const sign = spec.difference < 0 ? '−' : '+';
    const magnitude = Math.abs(spec.difference);
    return {
      explicit: `aₙ = ${shownNumber(spec.first)} ${sign} (n − 1)(${shownNumber(magnitude)})`,
      recursive: `aₙ = aₙ₋₁ ${sign} ${typedNumber(magnitude)}`,
    };
  }
  // Typed the way the rule box reads it: a power as ^(n − 1).
  return {
    explicit: `aₙ = ${shownNumber(spec.first)}(${shownNumber(spec.ratio)})^(n − 1)`,
    recursive: `aₙ = ${typedNumber(spec.ratio)} · aₙ₋₁`,
  };
};

/** "Each term is the one before plus 4: a₁ = 3, a₂ = 3 + 4 = 7, … — arithmetic, common difference 4." */
const sequenceFamilyStep = (spec, start = 1) => {
  const indexes = [start, start + 1, start + 2];
  const terms = indexes.map((n) => sequenceTerm(spec, n));
  const shown = indexes.map((n, position) => (position === 0
    ? `a${n} = ${shownNumber(terms[0])}`
    : spec.kind === 'arithmetic'
      ? `a${n} = ${shownNumber(terms[position - 1])} ${plusOrMinus(spec.difference)} = ${shownNumber(terms[position])}`
      : `a${n} = ${shownNumber(terms[position - 1])} · ${shownFactor(spec.ratio)} = ${shownNumber(terms[position])}`));
  return spec.kind === 'arithmetic'
    ? `Each term is the one before ${spec.difference < 0 ? 'minus' : 'plus'} ${shownNumber(Math.abs(spec.difference))}: ${shown.join(', ')}. The difference between neighbouring terms is always ${shownNumber(spec.difference)}, so the sequence is arithmetic with common difference ${shownNumber(spec.difference)}.`
    : `Each term is the one before times ${shownNumber(spec.ratio)}: ${shown.join(', ')}. The ratio of neighbouring terms is always ${shownNumber(spec.ratio)}, so the sequence is geometric with common ratio ${shownNumber(spec.ratio)}.`;
};

/** aₙ from the explicit formula, worked out. */
const sequenceTermStep = (spec, n) => {
  const value = sequenceTerm(spec, n);
  if (spec.kind === 'arithmetic') {
    const added = (n - 1) * spec.difference;
    return `Use aₙ = a₁ + (n − 1)d with a₁ = ${shownNumber(spec.first)} and d = ${shownNumber(spec.difference)}: a${n} = ${shownNumber(spec.first)} + (${n} − 1)(${shownNumber(spec.difference)}) = ${shownNumber(spec.first)} + ${shownFactor(added)} = ${shownNumber(value)}.`;
  }
  const power = spec.ratio ** (n - 1);
  return `Use aₙ = a₁ · rⁿ⁻¹ with a₁ = ${shownNumber(spec.first)} and r = ${shownNumber(spec.ratio)}: a${n} = ${shownNumber(spec.first)} · ${shownFactor(spec.ratio)}^(${n} − 1) = ${shownNumber(spec.first)} · ${shownFactor(power)} = ${shownNumber(value)}.`;
};

const sequenceRuleSteps = (spec) => {
  const rules = sequenceRules(spec);
  return spec.kind === 'arithmetic'
    ? [
      `Recursive rule: start at a₁ = ${shownNumber(spec.first)}, and each term is the one before ${spec.difference < 0 ? 'minus' : 'plus'} ${shownNumber(Math.abs(spec.difference))}: ${rules.recursive}.`,
      `Explicit rule: to reach aₙ from a₁ you add the common difference ${shownNumber(spec.difference)} once for each step after the first — (n − 1) times: ${rules.explicit}.`,
    ]
    : [
      `Recursive rule: start at a₁ = ${shownNumber(spec.first)}, and each term is the one before times ${shownNumber(spec.ratio)}: ${rules.recursive}.`,
      `Explicit rule: to reach aₙ from a₁ you multiply by the common ratio ${shownNumber(spec.ratio)} once for each step after the first — (n − 1) times: ${rules.explicit}.`,
    ];
};

const buildSequenceReview = (question) => {
  const mode = sequenceDeclarationMode(question);
  if (mode === 'compare') {
    // The screen's and the grader's pair, with their defaults.
    const { left, right } = compareSpecsFromQuestion(question);
    const n = Number(question.compareN ?? 7);
    const result = compareSequencesAt(left, right, n);
    const leftLabel = question.leftLabel || 'Sequence A';
    const rightLabel = question.rightLabel || 'Sequence B';
    const larger = result.relation === 'left' ? leftLabel : result.relation === 'right' ? rightLabel : 'They are equal';
    const describe = (spec, label) => `${label}: ${sequenceTermStep(spec, n)}`;
    const bigger = Math.max(result.left, result.right);
    const smaller = Math.min(result.left, result.right);
    return {
      title: 'Sequence solution',
      items: [
        { label: `${leftLabel} at n = ${n}`, value: typedNumber(result.left) },
        { label: `${rightLabel} at n = ${n}`, value: typedNumber(result.right) },
        { label: 'Larger term', value: larger },
        { label: 'Absolute difference', value: typedNumber(result.difference) },
      ],
      steps: [
        describe(left, leftLabel),
        describe(right, rightLabel),
        result.relation === 'equal'
          ? `The two terms are equal, so neither is larger and the absolute difference is ${shownNumber(result.left)} − ${shownFactor(result.right)} = 0.`
          : `${shownNumber(bigger)} > ${shownNumber(smaller)}, so ${larger} has the larger term. The absolute difference is the larger minus the smaller: ${shownNumber(bigger)} − ${shownFactor(smaller)} = ${shownNumber(bigger - smaller)}.`,
      ],
    };
  }

  const spec = sequenceSpecFromQuestion(question);
  const family = titleCase(spec.kind);
  if (mode === 'ruleBridge') {
    const rules = sequenceRules(spec);
    return {
      title: 'Sequence-rule solution',
      items: [
        { label: 'Sequence family', value: family },
        { label: 'Explicit rule', value: rules.explicit },
        { label: 'a₁', value: typedNumber(spec.first) },
        { label: 'Recursive rule', value: rules.recursive },
      ],
      steps: [sequenceFamilyStep(spec), ...sequenceRuleSteps(spec)],
    };
  }
  if (mode === 'missingTerm') {
    const n = Number(question.missingIndex ?? 4);
    const value = sequenceTerm(spec, n);
    // Three shown terms in a row, none of them the gap.
    const start = n >= 4 ? 1 : n + 1;
    const neighbour = n > 1
      ? (spec.kind === 'arithmetic'
        ? `The missing term comes right after a${n - 1} = ${shownNumber(sequenceTerm(spec, n - 1))}, so a${n} = ${shownNumber(sequenceTerm(spec, n - 1))} ${plusOrMinus(spec.difference)} = ${shownNumber(value)}.`
        : `The missing term comes right after a${n - 1} = ${shownNumber(sequenceTerm(spec, n - 1))}, so a${n} = ${shownNumber(sequenceTerm(spec, n - 1))} · ${shownFactor(spec.ratio)} = ${shownNumber(value)}.`)
      : (spec.kind === 'arithmetic'
        ? `The missing term comes right before a2 = ${shownNumber(sequenceTerm(spec, 2))}, so undo one step: a1 = ${shownNumber(sequenceTerm(spec, 2))} − ${shownFactor(spec.difference)} = ${shownNumber(value)}.`
        : `The missing term comes right before a2 = ${shownNumber(sequenceTerm(spec, 2))}, so undo one step: a1 = ${shownNumber(sequenceTerm(spec, 2))} ÷ ${shownFactor(spec.ratio)} = ${shownNumber(value)}.`);
    return {
      title: 'Missing-term solution',
      items: [
        { label: 'Sequence family', value: family },
        { label: `a${n}`, value: typedNumber(value) },
      ],
      steps: [sequenceFamilyStep(spec, start), neighbour],
    };
  }
  if (mode === 'partialSum') {
    const n = Number(question.sumN ?? 6);
    const last = sequenceTerm(spec, n);
    const sum = sequencePartialSum(spec, n);
    const sumStep = spec.kind === 'arithmetic'
      ? `An arithmetic sum is the number of terms times the average of the first and last: Sₙ = n(a₁ + aₙ) ÷ 2, so S${n} = ${n}(${shownNumber(spec.first)} + ${shownFactor(last)}) ÷ 2 = ${n}(${shownNumber(spec.first + last)}) ÷ 2 = ${shownNumber(sum)}.`
      : Math.abs(spec.ratio - 1) < 1e-8
        ? `With ratio 1 every term is ${shownNumber(spec.first)}, so S${n} = ${n} · ${shownFactor(spec.first)} = ${shownNumber(sum)}.`
        : `A geometric sum is Sₙ = a₁(1 − rⁿ) ÷ (1 − r), so S${n} = ${shownNumber(spec.first)}(1 − ${shownFactor(spec.ratio)}^${n}) ÷ (1 − ${shownFactor(spec.ratio)}) = ${shownNumber(spec.first)}(1 − ${shownFactor(spec.ratio ** n)}) ÷ ${shownFactor(1 - spec.ratio)} = ${shownNumber(sum)}.`;
    return {
      title: 'Finite-sum solution',
      items: [
        { label: `Last term a${n}`, value: typedNumber(last) },
        { label: `Sum S${n}`, value: typedNumber(sum) },
      ],
      steps: [sequenceFamilyStep(spec), sequenceTermStep(spec, n), sumStep],
    };
  }
  if (mode === 'fullBridge') {
    // Exactly the parts the grader checks for this model's student actions.
    const actions = sequenceStudentActions(question);
    const rows = generateSequence(spec, fullBridgeTermCount(question));
    const targetN = Number(question.targetN || 0);
    const rules = sequenceRules(spec);
    const items = [];
    const steps = [sequenceFamilyStep(spec)];
    const rowText = rows.map((row) => `(${row.n}, ${typedNumber(row.value)})`).join(', ');
    if (actions.includes('buildSequenceTable') || actions.includes('plotSequence')) {
      steps.push(`Keep going to term ${rows.length}: the terms (n, aₙ) are ${rows.map((row) => `(${row.n}, ${shownNumber(row.value)})`).join(', ')}.`);
    }
    if (actions.includes('buildSequenceTable')) items.push({ label: 'Table of (n, aₙ)', value: rowText });
    if (actions.includes('plotSequence')) {
      items.push({ label: 'Discrete graph', value: `plot ${rowText}` });
      steps.push('Plot each (n, aₙ) as a single point — a sequence is defined only at whole-number n, so the points are not joined.');
    }
    if (actions.includes('analyzeSequence')) {
      items.push({ label: 'Sequence family', value: family }, { label: spec.kind === 'arithmetic' ? 'Common difference' : 'Common ratio', value: typedNumber(sequenceChange(spec)) });
    }
    if (actions.includes('writeExplicit') || actions.includes('writeRecursive')) {
      const [recursiveStep, explicitStep] = sequenceRuleSteps(spec);
      if (actions.includes('writeRecursive')) {
        items.push({ label: 'a₁', value: typedNumber(spec.first) }, { label: 'Recursive rule', value: rules.recursive });
        steps.push(recursiveStep);
      }
      if (actions.includes('writeExplicit')) {
        items.push({ label: 'Explicit rule', value: rules.explicit });
        steps.push(explicitStep);
      }
    }
    if (actions.includes('findSequenceTerm') && targetN > 0) {
      items.push({ label: `a${targetN}`, value: typedNumber(sequenceTerm(spec, targetN)) });
      steps.push(sequenceTermStep(spec, targetN));
    }
    return { title: 'Sequence solution', items, steps };
  }

  const targetN = Number(question.targetN ?? 8);
  return {
    title: 'Sequence solution',
    items: [
      { label: 'Sequence family', value: family },
      { label: spec.kind === 'arithmetic' ? 'Common difference' : 'Common ratio', value: typedNumber(sequenceChange(spec)) },
      { label: `a${targetN}`, value: typedNumber(sequenceTerm(spec, targetN)) },
    ],
    steps: [sequenceFamilyStep(spec), sequenceTermStep(spec, targetN)],
  };
};

const relationPairs = (question = {}) => (Array.isArray(question.pairs) ? question.pairs : [])
  .map((pair) => Array.isArray(pair) ? [Number(pair[0]), Number(pair[1])] : [Number(pair?.x), Number(pair?.y)])
  .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

const uniqueSorted = (values = []) => [...new Set(values)].sort((a, b) => a - b);

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

/** Each row checked against the rule — the check findTableMismatchIndexes makes. Empty when it cannot be written. */
const tableAuditSteps = (rawSpec, rows, mismatches) => {
  const spec = {
    type: rawSpec?.type || 'linear',
    a: Number(rawSpec?.a ?? 1),
    h: Number(rawSpec?.h ?? 0),
    k: Number(rawSpec?.k ?? 0),
    base: Number(rawSpec?.base ?? 2),
  };
  if (!FAMILY_FORMULAS[spec.type] || ![spec.a, spec.h, spec.k, spec.base].every(Number.isFinite)) return [];
  const bad = new Set(mismatches);
  const checks = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const x = Number(row?.[0]);
    const y = Number(row?.[1]);
    const expected = evaluateFunctionSpec(spec, x);
    if (!Array.isArray(row) || row.length !== 2 || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(expected)) return [];
    checks.push(`Row ${index + 1}: f(${shownNumber(x)}) ${equalsShown(expected)} and the table shows ${shownNumber(y)} — ${bad.has(index) ? 'they do not match' : 'a match'}`);
  }
  const rule = functionRuleText('f', spec);
  const verdict = mismatches.length
    ? `So ${mismatches.map((index) => `Row ${index + 1}`).join(', ')} ${mismatches.length === 1 ? 'is the row that breaks' : 'are the rows that break'} the rule.`
    : 'Every row matches, so no row breaks the rule.';
  return [`The rule is ${rule}. Put each row's x into it and compare with the table's y.`, `${checks.join('; ')}.`, verdict];
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
    const rows = tableAuditRows(question, spec);
    const mismatches = findTableMismatchIndexes(spec, rows, Number(question.tolerance ?? 0.01));
    return {
      title: 'Table-audit solution',
      items: [{ label: 'Row that breaks the rule', value: mismatches.length ? mismatches.map((index) => `Row ${index + 1}`).join(', ') : 'none' }],
      steps: tableAuditSteps(spec, rows, mismatches),
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

/* A function-investigation value, worked out. */
/** "= 4" when the value is exact to the shown places, else "≈ 1.4142". */
const equalsShown = (value) => {
  const rounded = Number(Number(value).toFixed(4));
  return Math.abs(rounded - value) <= 1e-9 * Math.max(1, Math.abs(value)) ? `= ${shownNumber(value)}` : `≈ ${shownNumber(rounded)}`;
};
/** a in front of a bracket, root or bar: 1 is not written and −1 is a minus sign; before "·" or "÷" it is always written. */
const coefficientOn = (a, core) => {
  if (core.startsWith(' ')) return `${shownNumber(a)}${core}`;
  if (a === 1) return core;
  if (a === -1) return `${MINUS_SIGN}${core}`;
  return `${shownNumber(a)}${core}`;
};
const differenceText = (x, h) => `${shownNumber(x)} − ${shownFactor(h)}`;
const FAMILY_FORMULAS = Object.freeze({
  linear: 'a(x − h) + k',
  quadratic: 'a(x − h)² + k',
  absolute: 'a|x − h| + k',
  cubic: 'a(x − h)³ + k',
  cubeRoot: 'a∛(x − h) + k',
  squareRoot: 'a√(x − h) + k',
  exponential: 'a · b^(x − h) + k',
  logarithmic: 'a · log_b(x − h) + k',
  rational: 'a ÷ (x − h) + k',
});
/** f's rule with its parameters: "f(x) = 2(x − 1)² + 3". */
const functionRuleText = (name, spec) => {
  const inner = `x − ${shownFactor(spec.h)}`;
  const core = {
    linear: `(${inner})`,
    quadratic: `(${inner})²`,
    absolute: `|${inner}|`,
    cubic: `(${inner})³`,
    cubeRoot: `∛(${inner})`,
    squareRoot: `√(${inner})`,
    exponential: ` · ${shownFactor(spec.base)}^(${inner})`,
    logarithmic: ` · log_${shownFactor(spec.base)}(${inner})`,
    rational: ` ÷ (${inner})`,
  }[spec.type];
  return `${name}(x) = ${coefficientOn(spec.a, core)} ${plusOrMinus(spec.k)}`;
};
/** "f(2) = 1(2 − 0)² + 0 = 1(2)² + 0 = 4", or why f is undefined there; null when it cannot be written. */
const functionValueStep = (name, spec, x) => {
  const d = x - spec.h;
  const value = evaluateFunctionSpec(spec, x);
  const rule = functionRuleText(name, spec);
  const at = `${name}(${shownNumber(x)})`;
  if (!Number.isFinite(value)) {
    if (spec.type === 'squareRoot') return `${rule}, so ${at} needs √(${differenceText(x, spec.h)}) = √(${shownNumber(d)}): a negative number has no real square root, so ${at} is undefined.`;
    if (spec.type === 'logarithmic') return `${rule}, so ${at} needs log_${shownFactor(spec.base)}(${differenceText(x, spec.h)}) = log_${shownFactor(spec.base)}(${shownNumber(d)}): a logarithm needs a positive input, so ${at} is undefined.`;
    if (spec.type === 'rational') return `${rule}, so ${at} needs ${shownNumber(spec.a)} ÷ (${differenceText(x, spec.h)}) = ${shownNumber(spec.a)} ÷ 0: dividing by zero is undefined, so ${at} is undefined.`;
    return null;
  }
  const substituted = {
    linear: `(${differenceText(x, spec.h)})`,
    quadratic: `(${differenceText(x, spec.h)})²`,
    absolute: `|${differenceText(x, spec.h)}|`,
    cubic: `(${differenceText(x, spec.h)})³`,
    cubeRoot: `∛(${differenceText(x, spec.h)})`,
    squareRoot: `√(${differenceText(x, spec.h)})`,
    exponential: ` · ${shownFactor(spec.base)}^(${differenceText(x, spec.h)})`,
    logarithmic: ` · log_${shownFactor(spec.base)}(${differenceText(x, spec.h)})`,
    rational: ` ÷ (${differenceText(x, spec.h)})`,
  }[spec.type];
  const simplified = {
    linear: `(${shownNumber(d)})`,
    quadratic: `(${shownNumber(d)})²`,
    absolute: `|${shownNumber(d)}|`,
    cubic: `(${shownNumber(d)})³`,
    cubeRoot: `∛(${shownNumber(d)})`,
    squareRoot: `√(${shownNumber(d)})`,
    exponential: ` · ${shownFactor(spec.base)}^(${shownNumber(d)})`,
    logarithmic: ` · log_${shownFactor(spec.base)}(${shownNumber(d)})`,
    rational: ` ÷ (${shownNumber(d)})`,
  }[spec.type];
  return `${rule}, so ${at} = ${coefficientOn(spec.a, substituted)} ${plusOrMinus(spec.k)} = ${coefficientOn(spec.a, simplified)} ${plusOrMinus(spec.k)} ${equalsShown(value)}.`;
};

/** Solving f(x) = 0, family by family — the zeros interceptsForSpec finds. Null when it cannot be written. */
const functionZeroSteps = (spec, zeros) => {
  if (Math.abs(spec.a) < 1e-9) return null;
  const list = zeros.map((zero) => `x ${equalsShown(zero)}`).join(' and ');
  const none = (reason) => `${reason}, so f has no x-intercept.`;
  const moves = [
    Math.abs(spec.k) < 1e-12 ? '' : spec.k > 0 ? `subtract ${shownNumber(spec.k)} from both sides` : `add ${shownNumber(-spec.k)} to both sides`,
    spec.a === 1 ? '' : `divide both sides by ${shownFactor(spec.a)}`,
  ].filter(Boolean);
  const isolate = (core) => `Set f(x) = 0: ${coefficientOn(spec.a, core)} ${plusOrMinus(spec.k)} = 0.${moves.length ? ` ${titleCase(moves.join(' and '))}` : ''}`;
  const ratio = -spec.k / spec.a;
  const ratioText = `${shownNumber(-spec.k)} ÷ ${shownFactor(spec.a)} ${equalsShown(ratio)}`;
  const h = shownFactor(spec.h);
  switch (spec.type) {
    case 'linear':
      return [`${isolate(`(x − ${h})`)}: x − ${h} = ${ratioText}. Add ${h} to both sides: ${list}.`];
    case 'quadratic':
      if (ratio < 0 && Math.abs(ratio) > 1e-9) return [`${isolate(`(x − ${h})²`)}: (x − ${h})² = ${ratioText}.`, none('A square is never negative')];
      if (Math.abs(ratio) <= 1e-9) return [`${isolate(`(x − ${h})²`)}: (x − ${h})² = 0, so x − ${h} = 0 and ${list}.`];
      return [`${isolate(`(x − ${h})²`)}: (x − ${h})² = ${ratioText}.`, `Take both square roots: x − ${h} = ±√${shownFactor(Number(ratio.toPrecision(12)))}, so ${list}.`];
    case 'absolute':
      if (ratio < 0 && Math.abs(ratio) > 1e-9) return [`${isolate(`|x − ${h}|`)}: |x − ${h}| = ${ratioText}.`, none('An absolute value is never negative')];
      if (Math.abs(ratio) <= 1e-9) return [`${isolate(`|x − ${h}|`)}: |x − ${h}| = 0, so ${list}.`];
      return [`${isolate(`|x − ${h}|`)}: |x − ${h}| = ${ratioText}.`, `So x − ${h} = ${shownNumber(ratio)} or x − ${h} = ${shownNumber(-ratio)}, and ${list}.`];
    case 'squareRoot':
      if (ratio < 0 && Math.abs(ratio) > 1e-9) return [`${isolate(`√(x − ${h})`)}: √(x − ${h}) = ${ratioText}.`, none('A square root is never negative')];
      return [`${isolate(`√(x − ${h})`)}: √(x − ${h}) = ${ratioText}.`, `Square both sides: x − ${h} = ${shownFactor(Number(ratio.toPrecision(12)))}² ${equalsShown(ratio ** 2)}, so ${list}.`];
    case 'cubic':
      return [`${isolate(`(x − ${h})³`)}: (x − ${h})³ = ${ratioText}.`, `Take the cube root: x − ${h} = ∛${shownFactor(Number(ratio.toPrecision(12)))} ${equalsShown(Math.cbrt(ratio))}, so ${list}.`];
    case 'cubeRoot':
      return [`${isolate(`∛(x − ${h})`)}: ∛(x − ${h}) = ${ratioText}.`, `Cube both sides: x − ${h} = ${shownFactor(Number(ratio.toPrecision(12)))}³ ${equalsShown(ratio ** 3)}, so ${list}.`];
    case 'exponential': {
      const b = shownFactor(spec.base);
      if (!(spec.base > 0) || Math.abs(spec.base - 1) < 1e-9) return null;
      if (!(ratio > 0)) return [`${isolate(` · ${b}^(x − ${h})`)}: ${b}^(x − ${h}) = ${ratioText}.`, none('A positive base raised to any power is positive')];
      return [`${isolate(` · ${b}^(x − ${h})`)}: ${b}^(x − ${h}) = ${ratioText}.`, `Take log base ${shownNumber(spec.base)}: x − ${h} = log_${b}(${shownNumber(Number(ratio.toPrecision(12)))}) ${equalsShown(Math.log(ratio) / Math.log(spec.base))}, so ${list}.`];
    }
    case 'logarithmic': {
      const b = shownFactor(spec.base);
      if (!(spec.base > 0) || Math.abs(spec.base - 1) < 1e-9) return null;
      return [`${isolate(` · log_${b}(x − ${h})`)}: log_${b}(x − ${h}) = ${ratioText}.`, `Rewrite in exponential form: x − ${h} = ${b}^${shownFactor(Number(ratio.toPrecision(12)))} ${equalsShown(spec.base ** ratio)}, so ${list}.`];
    }
    case 'rational':
      if (Math.abs(spec.k) < 1e-9) return [`Set f(x) = 0: ${shownNumber(spec.a)} ÷ (x − ${h}) = 0.`, none(`A fraction with numerator ${shownNumber(spec.a)} is never 0`)];
      return [`Set f(x) = 0: ${shownNumber(spec.a)} ÷ (x − ${h}) ${plusOrMinus(spec.k)} = 0, so ${shownNumber(spec.a)} ÷ (x − ${h}) = ${shownNumber(-spec.k)} and x − ${h} = ${shownNumber(spec.a)} ÷ ${shownFactor(-spec.k)} ${equalsShown(-spec.a / spec.k)}, so ${list}.`];
    default:
      return null;
  }
};

const functionValueText = (value) => (Number.isFinite(value) ? finiteText(value) : 'undefined');

const buildFunctionReview = (question) => {
  // The mode, the functions and their defaults are the grader's
  // (serverGrading/tools/functionInvestigation2.mjs) — so the review explains
  // the screen the student had, never a default nobody showed.
  const mode = resolveToolMode(functionInvestigationDeclaration, question);
  if (mode === 'compare') {
    const left = normalizeInvestigationSpec(question.left || { type: 'linear', a: 1, h: 0, k: 0 });
    const right = normalizeInvestigationSpec(question.right || { type: 'quadratic', a: 1, h: 0, k: 0 });
    const x = Number(question.x ?? 2);
    const result = compareFunctionValues(left, right, x);
    const relation = result.relation === 'left' ? 'f(x) is greater'
      : result.relation === 'right' ? 'g(x) is greater'
        : result.relation === 'equal' ? 'The values are equal' : 'At least one value is undefined';
    const valueSteps = [functionValueStep('f', left, x), functionValueStep('g', right, x)];
    const at = shownNumber(x);
    const verdict = result.relation === 'undefined'
      ? `At least one of the functions has no value at x = ${at}, so choose "At least one is undefined here".`
      : result.relation === 'equal'
        ? `f(${at}) and g(${at}) are the same value, so they are equal.`
        : `${shownNumber(Math.max(result.leftValue, result.rightValue))} > ${shownNumber(Math.min(result.leftValue, result.rightValue))}, so ${relation} at x = ${at}.`;
    return {
      title: 'Function-comparison solution',
      items: [
        { label: `f(${finiteText(x)})`, value: functionValueText(result.leftValue) },
        { label: `g(${finiteText(x)})`, value: functionValueText(result.rightValue) },
        { label: 'Comparison', value: relation },
      ],
      steps: valueSteps.every(Boolean) ? [...valueSteps, verdict] : [],
    };
  }

  const spec = normalizeInvestigationSpec({ type: 'rational', a: 2, h: 1, k: -2, ...question.function });
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
    const zeroSteps = functionZeroSteps(spec, intercepts.x);
    const yStep = functionValueStep('f', spec, 0);
    const steps = zeroSteps && yStep
      ? [
        ...zeroSteps,
        intercepts.y == null
          ? `y-intercept: ${yStep.replace(/is undefined\.$/, 'is undefined, so the graph never crosses the y-axis: no y-intercept.')}`
          : `y-intercept: set x = 0. ${yStep}`,
      ]
      : [];
    return {
      title: 'Function solution',
      items: [
        { label: 'x-intercepts', value: listText(intercepts.x) },
        { label: 'y-intercept', value: intercepts.y == null ? 'none' : finiteText(intercepts.y) },
      ],
      steps,
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
  const arrows = pairs.map(([x, y]) => `${finiteText(x)} → ${finiteText(y)}`);
  const choice = FUNCTION_CHOICES.find((option) => option.value === correctFunctionChoice(isFunction))?.label || '';
  const repeated = [...outputsByInput.entries()].find(([, outputs]) => outputs.size > 1);
  const steps = pairs.length ? [
    `Each ordered pair (x, y) sends the input x to the output y, so draw one arrow per pair: ${[...new Set(arrows)].join(', ')}.`,
    `The domain is the set of inputs — the first coordinates, each listed once: {${listText(domain)}}.`,
    `The range is the set of outputs — the second coordinates, each listed once: {${listText(range)}}.`,
    isFunction
      ? `Every input has exactly one output (${[...outputsByInput.entries()].map(([x, outputs]) => `${finiteText(x)} → ${finiteText([...outputs][0])}`).join(', ')}), so the relation is a function: "${choice}"`
      : `The input ${finiteText(repeated[0])} has more than one output (${[...repeated[1]].map(finiteText).join(' and ')}), so the relation is not a function: "${choice}"`,
  ] : [];
  return {
    title: 'Relation solution',
    items: [
      { label: 'Mapping arrows', value: arrows.join(', ') },
      { label: 'Domain', value: `{${listText(domain)}}` },
      { label: 'Range', value: `{${listText(range)}}` },
      { label: 'Function?', value: isFunction ? 'Yes' : 'No' },
    ],
    steps,
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

/*
 * THE REVIEW MODEL IS TEXT. Every builder returns
 *
 *   { title, items: [{ label, value }], steps: [text], why: text|null, note: text|null }
 *
 *   items  the results — what the correct work arrives at;
 *   steps  the worked solution, in order, each a sentence a student can follow;
 *   why    why the correct answer works (a check), shown to every student
 *          whose question closed — including one who got it right.
 *
 * Anything else a builder returns is dropped here, so no object, array or
 * function ever reaches the page.
 */
const textList = (values, max = 12) => (Array.isArray(values) ? values : [])
  .map(reviewText).filter(Boolean).slice(0, max);

const textOnlyReview = (model) => {
  if (!model || typeof model !== 'object') return null;
  const items = (Array.isArray(model.items) ? model.items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ label: reviewText(item.label) || 'Answer', value: reviewText(item.value) || '—' }));
  return {
    title: reviewText(model.title) || 'Solution review',
    items,
    steps: textList(model.steps),
    why: reviewText(model.why) || null,
    note: reviewText(model.note) || null,
  };
};

const reviewBuilderFor = (toolId) => {
  // Own keys only: a toolId of 'constructor' must not find Object's.
  if (Object.prototype.hasOwnProperty.call(TOOL_REVIEW_BUILDERS, toolId)) return TOOL_REVIEW_BUILDERS[toolId];
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

// The tools this file can explain: its own branches and every implemented
// builder in ./reviews (toolSupportMatrix.js reads this, not the source text).
export const TOOLS_WITH_SOLUTION_REVIEW_BUILDER = Object.freeze([
  'sequenceExplorer', 'representationMatch', 'functionInvestigation2', 'relationMapping', 'openSortBoard', 'constraintFunctionBuilder',
  ...Object.keys(TOOL_REVIEW_BUILDERS),
].filter((toolId, index, all) => all.indexOf(toolId) === index));
