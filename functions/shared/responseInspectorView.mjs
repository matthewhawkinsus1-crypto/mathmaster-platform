/*
 * THE RESPONSE INSPECTOR'S FIELD-BY-FIELD VIEW, FOR EVERY QUESTION TYPE (#249 Feature 6, #554 item 8).
 *
 * Only multi-answer questions had a readable comparison; every other type
 * showed its stored response as raw JSON. This builds, from the evidence the
 * inspector already holds, what a teacher reads instead:
 *
 *   rows    one per thing the grader marked: a typed box, a choice, a table
 *           cell, an ordered pair and its coordinates, a system's solution, a
 *           tool's checks. Each row: what was saved, what was submitted (and
 *           graded), how the grader read it, the key, and the result.
 *   facts   the key facts of graph and tool work: points, lines, inequalities,
 *           intervals, the values typed into a tool — read from the stored
 *           work, labelled by where they sit in it.
 *   final   the final state of Step Algebra or relation work: the equation or
 *           relation the student ended on, the candidates they checked, the
 *           number line they marked.
 *   steps   the steps the student took, from the saved workspace's work-step
 *           log (Step Algebra keeps one; the submitted work is only the final
 *           state, so the steps are labelled with when they were saved).
 *
 * Every value is text exactly as written, bounded; the screen draws it as text
 * (and as mathematics only when it is LaTeX), so nothing typed is read as
 * markup. A value that cannot be read is shown as written, never thrown on.
 * The raw stored response stays available behind the screen's details control.
 *
 * Pure: no Firestore, no clock, no React.
 */
import { checkpointParts, partIdOfStepField } from './showTheStepFields.mjs';
import { stepRowLabel, withStepsAfterParts } from './showTheStepRows.mjs';
import { answerCandidatesForField, isChoiceAnswerField, orderedPairKey } from './answerUtils.mjs';
import { multiAnswerFields, systemSolutionKey } from './ordinaryResponseGrading.mjs';
import { resolveGradingSurfaceId } from './serverGrading/gradingManifest.mjs';
import { isToolResponse, readToolWork } from './serverGrading/toolResponseContract.mjs';
import { graderReading } from './responseInspectorReasons.mjs';
import { followThroughKeys, followThroughOf, followThroughValue } from './followThrough.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const MAX_TEXT = 400;
const MAX_FACTS = 80;
const MAX_STEPS = 80;
const MAX_ROWS = 120;
const MAX_DEPTH = 6;

/** Text exactly as written, bounded. Never throws. */
export const viewText = (value) => {
  let written;
  if (value === null || value === undefined) written = '';
  else if (typeof value === 'string') written = value;
  else if (typeof value === 'number' || typeof value === 'boolean') written = String(value);
  else {
    try { written = JSON.stringify(value) ?? ''; } catch { written = ''; }
  }
  return written.length > MAX_TEXT ? `${written.slice(0, MAX_TEXT)}…` : written;
};
const cell = (value) => (value === null || value === undefined ? null : { text: viewText(value) });

// A table looked up by its own keys only: text such as "__proto__" is not a key of it.
const own = (table, key) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);

const safely = (read, fallback) => {
  try { return read(); } catch { return fallback; }
};

/* ---------------------------------------------------------------------------
 * KEY FACTS OF A PIECE OF WORK.
 * ------------------------------------------------------------------------- */

const humanize = (key) => String(key)
  .replace(/([a-z0-9])([A-Z])/g, (match, before, capital) => `${before} ${capital.toLowerCase()}`)
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^./, (letter) => letter.toUpperCase());

const number = (value) => (finite(value) ? String(Number(value.toPrecision(10))) : viewText(value));
const isPairOfNumbers = (value) => Array.isArray(value) && value.length === 2 && value.every(finite);
const isPointObject = (value) => isObject(value) && 'x' in value && 'y' in value
  && Object.keys(value).every((key) => ['x', 'y', 'id', 'label', 'name'].includes(key))
  && [value.x, value.y].every((coordinate) => coordinate === null || finite(coordinate) || typeof coordinate === 'string');
const pointText = (value) => {
  if (Array.isArray(value)) return `(${number(value[0])}, ${number(value[1])})`;
  if (value.x === null || value.y === null || value.x === '' || value.y === '') return 'not placed';
  return `(${number(value.x)}, ${number(value.y)})`;
};
const term = (coefficient, variable) => {
  if (coefficient === 0) return '';
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${number(coefficient)}${variable}`;
};
const lineText = ({ m, b }) => {
  const slope = term(m, 'x');
  if (!slope) return `y = ${number(b)}`;
  if (b === 0) return `y = ${slope}`;
  return `y = ${slope} ${b < 0 ? '-' : '+'} ${number(Math.abs(b))}`;
};
const isSlopeLine = (value) => isObject(value) && finite(value.m) && finite(value.b);
const isStandardLine = (value) => isObject(value) && ['A', 'B', 'C'].every((key) => finite(value[key]));
const RELATIONS = new Set(['<', '<=', '>', '>=', '≤', '≥', '=', '!=', '≠']);
const RELATION_SYMBOLS = Object.freeze({ '<=': '≤', '>=': '≥', '!=': '≠' });
const relationSymbol = (relation) => own(RELATION_SYMBOLS, relation) || relation;
const isInequality = (value) => isObject(value) && RELATIONS.has(viewText(value.relation ?? ''));
const inequalityText = (value) => {
  const symbol = relationSymbol(viewText(value.relation));
  if (isSlopeLine(value)) return lineText(value).replace(' = ', ` ${symbol} `);
  if (isStandardLine(value)) return `${number(value.A)}x + ${number(value.B)}y ${symbol} ${number(value.C)}`.replace(/\+ -/g, '- ');
  if (finite(value.x)) return `x ${symbol} ${number(value.x)}`;
  if (finite(value.y)) return `y ${symbol} ${number(value.y)}`;
  return null;
};
const INTERVAL_KEYS = [['min', 'max', 'minClosed', 'maxClosed'], ['left', 'right', 'leftClosed', 'rightClosed'], ['start', 'end', 'startClosed', 'endClosed']];
const intervalKeys = (value) => (isObject(value)
  ? INTERVAL_KEYS.find(([low, high]) => low in value && high in value && [value[low], value[high]].every((end) => end === null || finite(end)))
  : null);
const intervalText = (value, [low, high, lowClosed, highClosed]) => {
  const left = value[low] === null ? '(-∞' : `${value[lowClosed] === true ? '[' : '('}${number(value[low])}`;
  const right = value[high] === null ? '∞)' : `${number(value[high])}${value[highClosed] === true ? ']' : ')'}`;
  return `${left}, ${right}`;
};
const isWorkStep = (value) => isObject(value) && isObject(value.before) && isObject(value.after)
  && 'left' in value.before && 'right' in value.before && 'left' in value.after && 'right' in value.after;

// One value as a person reads it, or null when it is a record to open up.
const describe = (value) => {
  if (value === null || value === undefined) return 'none';
  if (typeof value === 'string') return value === '' ? 'blank' : viewText(value);
  if (typeof value === 'number') return number(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (isPairOfNumbers(value) || isPointObject(value)) return pointText(value);
  if (isInequality(value)) return inequalityText(value);
  if (isSlopeLine(value)) return lineText(value);
  if (isStandardLine(value)) return `${number(value.A)}x + ${number(value.B)}y = ${number(value.C)}`.replace(/\+ -/g, '- ');
  const keys = intervalKeys(value);
  if (keys) return intervalText(value, keys);
  if (Array.isArray(value)) {
    if (!value.length) return 'none';
    const parts = value.map((entry) => (entry !== null && typeof entry === 'object' && !isPairOfNumbers(entry) && !isPointObject(entry) && !intervalKeys(entry) && !isInequality(entry) && !isSlopeLine(entry) ? null : describe(entry)));
    return parts.every((part) => part !== null) ? viewText(parts.join(', ')) : null;
  }
  return null;
};

/**
 * The key facts of some work: `[{ label, value }]`, every value text. Points,
 * lines, inequalities and intervals are written the way a teacher writes them;
 * anything else is labelled by where it sits in the work. Bounded in depth and
 * in number, and total on any value.
 */
export const workFacts = (work) => {
  const facts = [];
  const walk = (value, path, depth) => {
    if (facts.length >= MAX_FACTS) return;
    const label = path.length ? path.join(' · ') : 'Work';
    const described = depth > MAX_DEPTH ? viewText(value) : describe(value);
    if (described !== null) {
      facts.push({ label, value: described });
      return;
    }
    if (Array.isArray(value)) {
      // A list of { id, value } (typed prompt answers): each by its id.
      if (value.every((entry) => isObject(entry) && 'id' in entry && 'value' in entry && Object.keys(entry).length === 2)) {
        value.forEach((entry) => walk(entry.value, [...path, humanize(viewText(entry.id))], depth + 1));
        return;
      }
      // An item is numbered within its list: "Construction 1", not "Construction · 1".
      value.forEach((entry, index) => walk(entry, path.length ? [...path.slice(0, -1), `${path[path.length - 1]} ${index + 1}`] : [`Item ${index + 1}`], depth + 1));
      return;
    }
    Object.entries(value).forEach(([key, entry]) => walk(entry, [...path, humanize(key)], depth + 1));
  };
  safely(() => walk(work, [], 0), null);
  if (facts.length >= MAX_FACTS) facts.push({ label: 'More', value: 'Further work is in the raw response.' });
  return facts;
};

/* ---------------------------------------------------------------------------
 * STEP ALGEBRA AND RELATION WORK.
 * ------------------------------------------------------------------------- */

const sides = (equation) => `${viewText(equation?.left)} = ${viewText(equation?.right)}`;

// The relation the student ended on, as they would read it: each branch's
// expressions joined by its relations, the branches by their connective.
const relationText = (relation) => {
  if (!isObject(relation)) return null;
  if (relation.special === 'noSolution') return 'No solution';
  if (relation.special === 'allReals') return 'All real numbers';
  const branches = list(relation.branches).map((branch) => {
    const expressions = list(branch?.expressions).map(viewText);
    const relations = list(branch?.relations).map((entry) => relationSymbol(viewText(entry)));
    return expressions.map((expression, index) => (index ? `${relations[index - 1] ?? '?'} ${expression}` : expression)).join(' ');
  }).filter(Boolean);
  if (!branches.length) return null;
  return branches.join(` ${viewText(relation.connective || 'or')} `);
};

/** The final state of Step Algebra or relation work, as labelled lines. */
export const stepAlgebraFinal = (work) => safely(() => {
  if (!isObject(work)) return [];
  const lines = [];
  if (isObject(work.equation)) lines.push({ label: 'Final equation', value: viewText(sides(work.equation)) });
  if (typeof work.finalEquation === 'string') lines.push({ label: 'Final equation', value: viewText(work.finalEquation.trim()) });
  const relation = relationText(work.relation);
  if (relation) lines.push({ label: 'Final relation', value: viewText(relation) });
  list(work.promptAnswers).forEach((entry, index) => {
    if (isObject(entry)) lines.push({ label: `Answer ${viewText(entry.id || index + 1)}`, value: describe(entry.value) ?? viewText(entry.value) });
  });
  list(work.candidateChecks).forEach((check) => {
    if (!isObject(check)) return;
    const values = [check.left, check.right].every((side) => typeof side === 'string') ? ` (left side ${viewText(check.left)}, right side ${viewText(check.right)})` : '';
    lines.push({ label: `Check of ${viewText(check.candidate)}`, value: `${viewText(check.choice) || 'blank'}${values}` });
  });
  if (isObject(work.solutionSet)) {
    lines.push({ label: 'Solution set', value: work.solutionSet.none === true ? 'No real solution' : viewText(list(work.solutionSet.values).map(viewText).join(', ') || 'blank') });
  }
  if (isObject(work.representation)) {
    const intervals = list(work.representation.intervals).map((interval) => describe(interval)).filter(Boolean);
    if (intervals.length) lines.push({ label: 'Number line', value: viewText(intervals.join(' ∪ ')) });
    if (work.representation.notation) lines.push({ label: 'Interval notation', value: viewText(work.representation.notation) });
    if (work.representation.inequality) lines.push({ label: 'Inequality', value: viewText(work.representation.inequality) });
  }
  if ('xIntercept' in work || 'yIntercept' in work) {
    lines.push({ label: 'x-intercept', value: viewText(work.xIntercept) || 'blank' });
    lines.push({ label: 'y-intercept', value: viewText(work.yIntercept) || 'blank' });
  }
  return lines;
}, []);

/** The steps in a saved Step Algebra workspace: `[{ description, before, after }]`. */
export const savedWorkSteps = (workspace) => safely(() => {
  for (const entry of list(workspace?.entries)) {
    const steps = list(entry?.value?.workSteps).filter(isWorkStep);
    if (steps.length) {
      return steps.slice(-MAX_STEPS).map((step) => ({
        description: viewText(step.description || 'Algebra step'),
        before: viewText(sides(step.before)),
        after: viewText(sides(step.after)),
      }));
    }
  }
  return [];
}, []);

/* ---------------------------------------------------------------------------
 * ROWS.
 * ------------------------------------------------------------------------- */

// A number only from a number or numeric text (Number() on a hostile object throws).
const numberFrom = (value) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN);

const resultCell = (part) => {
  if (!isObject(part)) return null;
  if (part.graded === false) return { status: 'ungraded', label: 'Not graded here' };
  const credit = Number.isFinite(numberFrom(part.credit)) ? Math.max(0, Math.min(1, numberFrom(part.credit))) : (part.isCorrect ? 1 : 0);
  if (part.isCorrect === true) return { status: 'correct', label: 'Correct', credit: 100 };
  if (part.isComplete === false) return { status: 'blank', label: 'Not answered', credit: 0 };
  if (credit > 0) return { status: 'partial', label: 'Partly correct', credit: Math.round(credit * 100) };
  return { status: 'incorrect', label: 'Incorrect', credit: 0 };
};

const readCell = (value) => {
  if (value === null || value === undefined || viewText(value).trim() === '') return null;
  const reading = graderReading(viewText(value));
  return reading.kind === 'number' ? { text: reading.value, note: 'a number' } : { text: viewText(reading.value), note: 'text' };
};

// A choice field's options as { value, label }, for writing the option picked by its text.
const choiceOptions = (field) => list(field?.options?.length ? field.options : field?.choices).map((option) => {
  if (isObject(option)) {
    const value = option.id ?? option.value ?? option.label ?? option.text;
    return { value: viewText(value), label: viewText(option.label ?? option.text ?? option.value ?? option.id) };
  }
  return { value: viewText(option), label: viewText(option) };
});
const choiceCell = (field, value) => {
  if (value === null || value === undefined) return null;
  const option = choiceOptions(field).find((entry) => entry.value === viewText(value));
  return option && option.label !== option.value ? { text: viewText(value), option: option.label } : { text: viewText(value) };
};

// The saved workspace's value for one box: the multi-answer draft is a record
// keyed by box id (workspaceDraftSchema.mjs `multi-answer`).
const savedFieldValue = (workspace, id) => {
  for (const entry of list(workspace?.entries)) {
    const record = entry?.value;
    for (const candidate of [record, record?.answers, record?.responses, record?.fields]) {
      if (isObject(candidate) && Object.prototype.hasOwnProperty.call(candidate, id)) return candidate[id];
    }
  }
  return undefined;
};
const savedScalarValue = (workspace) => {
  const entries = list(workspace?.entries);
  if (entries.length !== 1) return undefined;
  const value = entries[0]?.value;
  return value === null || ['string', 'number', 'boolean'].includes(typeof value) ? value : undefined;
};

const partsById = (result) => new Map(list(result?.parts).filter(isObject).map((part) => [viewText(part.id), part]));
const submittedFields = (response) => new Map(list(response?.fields).filter(isObject).map((field) => [viewText(field.id), field.value]));

const expectedCell = (expected, values) => {
  if (expected?.available === false) return { unavailable: true, text: viewText(expected.reason) };
  const shown = list(values).map(viewText).filter((value) => value !== '');
  return shown.length ? { text: shown.join(' or ') } : null;
};

// How a box with a form of its own is compared (responseInspector.mjs traceField).
const COMPARED_AS = Object.freeze({
  'equivalent-expression': 'compared as an equivalent expression',
  'factored-form': 'compared in factored form',
  'simplest-radical-form': 'compared in simplest radical form',
});

/*
 * SP-3: a follow-through part is marked right when it matches the key built
 * from the student's own earlier answer, or its own answer
 * (followThrough.mjs withFollowThroughKeys). Its expected cell is the key the
 * grader used, said to be built from the earlier answer, with the authored
 * answer beside it. With no value to build from (a blank or unfinished
 * earlier answer), the grader used the authored answer alone, and the cell
 * says so. The verdict is the recorded one either way.
 */
const followThroughExpected = ({ field, authored, responsesById, keyed, own: ownCell }) => {
  const rule = followThroughOf(field);
  if (!rule) return ownCell;
  const byId = new Map(authored.map((entry) => [viewText(entry.id), entry]));
  const sources = rule.from.map((id) => byId.get(id)).filter(Boolean);
  const named = sources.map((source) => {
    const found = safely(() => followThroughValue(responsesById[viewText(source.id)], source), null);
    const label = viewText(source.label || source.id);
    return found ? `${label} (${viewText(found.shown)})` : label;
  }).join(', ') || rule.from.map(viewText).join(', ');
  if (!keyed?.length) {
    return ownCell ? { ...ownCell, note: `No key built from the student's answer to ${named}: graded against the authored answer` } : null;
  }
  return {
    text: viewText(keyed.join(' or ')),
    note: `Built from the student's answer to ${named}`,
    ...(ownCell?.text ? { authored: { text: ownCell.text } } : {}),
  };
};

const multiAnswerRows = ({ question, response, result, workspace, expected, trace }) => {
  const parts = partsById(result);
  const values = submittedFields(response);
  const traces = new Map(list(trace?.fields).map((field) => [viewText(field?.id), field]));
  const authored = multiAnswerFields(question);
  // What the grader read for each box, as followThroughKeys reads it.
  const responsesById = Object.fromEntries([...parts.entries()].map(([id, part]) => [id, part?.response]).concat([...values.entries()]));
  const keyedById = expected?.available === false ? new Map() : safely(() => followThroughKeys(authored, responsesById), new Map());
  const stepParts = checkpointParts(question);
  const ids = withStepsAfterParts([...new Set([...authored.map((field) => viewText(field.id)), ...values.keys(), ...parts.keys()])], question).slice(0, MAX_ROWS);
  return ids.map((id) => {
    // SP-4: the step a part's checkpoint asked for, as the student left it.
    // It is their work, not an answer: no grader read it, so the row has no
    // reading, no expected answer and no result. `step` says what it was
    // done on, and the screen has the tool's engine check it
    // (ResponseInspectorFieldView.jsx).
    const stepPart = stepParts.get(partIdOfStepField(id) ?? '');
    if (stepPart) {
      const checkpoint = stepPart.checkpoint;
      return {
        id,
        label: viewText(stepRowLabel(checkpoint.kind, stepPart.label)),
        kind: 'step',
        step: {
          kind: viewText(checkpoint.kind),
          ...(Number.isInteger(checkpoint.count) ? { count: checkpoint.count } : {}),
          of: viewText(checkpoint.of ?? ''),
        },
        saved: cell(savedFieldValue(workspace, id)),
        submitted: cell(values.get(id)),
        read: null,
        expected: null,
        result: null,
      };
    }
    const authoredField = authored.find((entry) => viewText(entry.id) === id) || {};
    // A template's options may not be the instance's: an option is written by
    // its text only from the question the student was shown.
    const field = expected?.available === false ? { ...authoredField, options: undefined, choices: undefined } : authoredField;
    const choice = isChoiceAnswerField(field) || choiceOptions(field).length > 0;
    const submitted = values.has(id) ? values.get(id) : parts.get(id)?.response;
    const fieldTrace = traces.get(id);
    const keys = expected?.available === false ? null : answerCandidatesForField(field);
    // Only a box the question authors is read the way a typed box is read.
    const typedBox = authored.some((entry) => viewText(entry.id) === id);
    return {
      id,
      label: viewText(field.label || parts.get(id)?.label || id),
      kind: choice ? 'choice' : 'typed',
      saved: choice ? choiceCell(field, savedFieldValue(workspace, id)) : cell(savedFieldValue(workspace, id)),
      submitted: choice ? choiceCell(field, submitted) : cell(submitted),
      read: choice || !typedBox ? null : fieldTrace && fieldTrace.normalizedAvailable === false
        ? { text: '', note: own(COMPARED_AS, fieldTrace.comparator) || 'compared as mathematics' }
        : readCell(submitted),
      expected: keys === null
        ? expectedCell(expected, [])
        : choice
          ? (() => { const shown = keys.map((key) => choiceCell(field, key)); return shown.length ? { text: shown.map((entry) => entry.option || entry.text).join(' or ') } : null; })()
          : followThroughExpected({ field, authored, responsesById, keyed: keyedById.get(id), own: expectedCell(expected, keys) }),
      result: resultCell(parts.get(id)),
    };
  });
};

const tableRows = ({ question, response, result, workspace, expected }) => {
  const table = isObject(question?.table) ? question.table : {};
  const columns = list(table.columns).filter(isObject);
  const answers = isObject(table.answers) ? table.answers : {};
  const parts = partsById(result);
  const values = submittedFields(response);
  // The editable cells, as tableEditableKeys reads them, from a real record
  // and list only: a malformed `answers` string is not one cell per character.
  const keys = [...Object.keys(answers), ...list(table.blanks).map(String)];
  const ids = [...new Set([...keys, ...values.keys()])].slice(0, MAX_ROWS);
  return ids.map((id) => {
    const [rowIndex, columnKey] = viewText(id).split(':');
    const column = columns.find((entry) => viewText(entry.key) === columnKey);
    const row = list(table.rows)[Number(rowIndex)];
    const given = isObject(row)
      ? columns.filter((entry) => viewText(entry.key) !== columnKey && row[entry.key] !== null && row[entry.key] !== undefined && row[entry.key] !== '')
        .slice(0, 2).map((entry) => `${viewText(entry.label || entry.key)} = ${viewText(row[entry.key])}`)
      : [];
    const label = column && /^\d+$/.test(rowIndex)
      ? `${viewText(column.label || column.key)}, row ${Number(rowIndex) + 1}${given.length ? ` (${given.join(', ')})` : ''}`
      : `Table blank ${viewText(id)}`;
    const submitted = values.has(id) ? values.get(id) : parts.get(id)?.response;
    return {
      id,
      label,
      kind: 'typed',
      saved: cell(savedFieldValue(workspace, id)),
      submitted: cell(submitted),
      read: readCell(submitted),
      expected: Object.prototype.hasOwnProperty.call(answers, id) ? expectedCell(expected, [answers[id]]) : { text: 'Not graded here' },
      result: resultCell(parts.get(id)),
    };
  });
};

const pairText = (pair) => (Array.isArray(pair) && pair.length === 2 ? `(${viewText(pair[0])}, ${viewText(pair[1])})` : viewText(pair));

const scalarRows = ({ surface, question, response, result, workspace, expected }) => {
  const parts = list(result?.parts).filter(isObject);
  const value = response?.value;
  const saved = cell(savedScalarValue(workspace));
  if (surface === 'orderedPair' || surface === 'system') {
    const key = surface === 'system'
      ? systemSolutionKey(question || {})
      : (orderedPairKey(question?.answer || question?.solution) || question?.answer || question?.solution);
    const keyPair = Array.isArray(key) && key.length === 2 ? key : null;
    return [
      {
        id: 'response',
        label: surface === 'system' ? 'Solution (x, y)' : 'Ordered pair',
        kind: 'typed',
        saved,
        submitted: cell(value),
        read: null,
        expected: expectedCell(expected, [keyPair ? pairText(keyPair) : key]),
        result: { status: result?.isCorrect === true ? 'correct' : 'incorrect', label: result?.isCorrect === true ? 'Correct' : 'Incorrect', credit: result?.isCorrect === true ? 100 : Math.round(Math.max(0, Math.min(1, numberFrom(result?.score) || 0)) * 100) },
      },
      ...parts.map((part, index) => ({
        id: viewText(part.id),
        label: viewText(part.label || part.id),
        kind: 'coordinate',
        saved: null,
        submitted: cell(part.response),
        read: null,
        expected: keyPair && index < 2 ? expectedCell(expected, [keyPair[index]]) : null,
        result: resultCell(part),
      })),
    ];
  }
  const keys = surface === 'literal' ? list(question?.acceptedAnswers)
    : surface === 'numberLine' ? [question?.target]
      : [question?.answer ?? (question?.ansNum !== undefined ? `${question.ansNum}/${question.ansDen}` : undefined)];
  const part = parts[0] || null;
  return [{
    id: viewText(part?.id || 'response'),
    label: viewText(part?.label || 'Your answer'),
    kind: 'typed',
    saved,
    submitted: cell(value),
    read: readCell(value),
    expected: expectedCell(expected, keys.filter((key) => key !== undefined && key !== null)),
    result: part ? resultCell(part) : { status: result?.isCorrect === true ? 'correct' : 'incorrect', label: result?.isCorrect === true ? 'Correct' : 'Incorrect' },
  }];
};

// A tool's checks: each part the grader reported, with the response text it
// recorded for that part (a plotted point, a line, a typed value).
const toolRows = ({ result }) => list(result?.parts).filter(isObject).slice(0, MAX_ROWS).map((part) => ({
  id: viewText(part.id),
  label: viewText(part.label || part.id),
  kind: 'check',
  saved: null,
  submitted: part.response === undefined || part.response === null || part.response === '' ? null : cell(part.response),
  read: null,
  expected: null,
  result: resultCell(part),
}));

// What a tool's saved workspace holds, as facts: each saved entry by its name.
const savedWorkFacts = (workspace) => safely(() => list(workspace?.entries)
  .flatMap((entry) => workFacts(entry?.value).map((fact) => ({
    label: entry?.scope && entry.scope !== 'question' ? `${humanize(viewText(entry.scope).replace(/:/g, ' '))} · ${fact.label}` : fact.label,
    value: fact.value,
  })))
  .slice(0, MAX_FACTS), []);

const STEP_ALGEBRA_SURFACES = new Set(['stepAlgebra', 'algebra', 'literalWorkspace']);
const TYPED_SURFACES = new Set(['literal', 'orderedPair', 'system', 'fraction', 'numberLine']);

const savedRelation = (workspace) => {
  if (!workspace?.available) return null;
  return workspace.relationToSubmission === 'newer' ? 'saved after the submission'
    : workspace.relationToSubmission === 'older' ? 'saved before the submission'
      : workspace.relationToSubmission === 'same-time' ? 'saved when it was submitted'
        : 'saved at an unknown time';
};

/**
 * The view of one stored response. `response` is the submitted snapshot, or
 * the legacy recorded parts when no snapshot was kept (`provenance` says
 * which); `result` the recorded automatic result.
 */
export const buildResponseView = ({
  question = null,
  response = null,
  provenance = 'submitted',
  result = null,
  workspace = null,
  expected = null,
  trace = null,
} = {}) => safely(() => {
  const surface = isObject(question) ? resolveGradingSurfaceId(question) : null;
  const base = {
    surface: surface || null,
    provenance,
    snapshotLabel: provenance === 'legacy' ? 'Recorded grader response (legacy)' : 'Submitted Snapshot',
    savedTiming: savedRelation(workspace),
    rows: [],
    facts: [],
    savedFacts: [],
    final: [],
    steps: [],
    stepsTiming: null,
  };
  if (!isObject(response)) {
    return { ...base, kind: 'unavailable', rows: toolRows({ result }) };
  }
  if (response.kind === 'fields' && surface === 'table') {
    return { ...base, kind: 'typed', rows: tableRows({ question, response, result, workspace, expected }) };
  }
  if (response.kind === 'fields' && (surface === 'multiAnswer' || response.type === 'multiAnswer')) {
    return { ...base, kind: 'typed', rows: multiAnswerRows({ question, response, result, workspace, expected, trace }) };
  }
  if (isToolResponse(response)) {
    const work = readToolWork(response);
    const stepAlgebra = STEP_ALGEBRA_SURFACES.has(surface) || response.toolId === 'stepAlgebra';
    const steps = stepAlgebra ? savedWorkSteps(workspace) : [];
    return {
      ...base,
      kind: stepAlgebra ? 'steps' : 'tool',
      rows: toolRows({ result }),
      facts: work.ok && !stepAlgebra ? workFacts(work.work) : [],
      savedFacts: stepAlgebra ? [] : savedWorkFacts(workspace),
      final: work.ok && stepAlgebra ? stepAlgebraFinal(work.work) : [],
      steps,
      stepsTiming: steps.length ? savedRelation(workspace) : null,
      unreadable: work.ok ? null : viewText(work.reason),
    };
  }
  if (STEP_ALGEBRA_SURFACES.has(surface)) {
    const steps = savedWorkSteps(workspace);
    const finalEquation = viewText(viewText(response.value ?? '').split('|')[0]).trim();
    return {
      ...base,
      kind: 'steps',
      rows: toolRows({ result }),
      final: finalEquation ? [{ label: 'Final equation', value: finalEquation }] : [],
      steps,
      stepsTiming: steps.length ? savedRelation(workspace) : null,
    };
  }
  if (response.kind === 'fields') {
    // Fields of a type that is not a multi-answer or a table: each as a row.
    return { ...base, kind: 'typed', rows: multiAnswerRows({ question: { answerFields: [] }, response, result, workspace, expected, trace: null }) };
  }
  if (TYPED_SURFACES.has(surface) || response.kind === 'scalar') {
    return { ...base, kind: 'typed', rows: scalarRows({ surface, question, response, result, workspace, expected }) };
  }
  // An opaque response from an older client: the parts the grader recorded,
  // and the stored text as written.
  return {
    ...base,
    kind: 'opaque',
    rows: toolRows({ result }),
    facts: response.value ? [{ label: 'Stored response', value: viewText(response.value) }] : [],
  };
}, { kind: 'unavailable', surface: null, provenance, snapshotLabel: 'Submitted Snapshot', savedTiming: null, rows: [], facts: [], savedFacts: [], final: [], steps: [], stepsTiming: null });
