/*
 * WHY A PATH ITEM ANSWER WAS PROBABLY MISSED — A CORRECTIONS MISS, AND A SECURE TEST'S EVIDENCE.
 *
 *   diagnoseCorrectionMiss({ privateGrading, grading, raw, responses, question }) → { source, code, message } | null
 *   pathMisconceptionEvidence({ privateGrading, grading, raw, responses, question }) → provenance block | null
 *
 * QA pass 3, HELP-13: a Test Cycle Corrections miss answered "Not yet. Look
 * again at what the question is asking you to find…" whatever the student did.
 * Corrections, Test and Retest items are Path items (an issued family instance
 * with a server-held `privateGrading`), graded by the Path tool contracts
 * (pathToolContracts.mjs) — a shape the platform classifiers
 * (misconceptionClassifiers.mjs), which read assignment questions, never see.
 * This reads the SAME definition the grader just used, the grader's own
 * verdict per part, and the bounded work, and names a canonical registry code
 * only where the work pins one down — the classifiers' own rule for that
 * mistake, read from the Path shape:
 *
 *   system              the typed point is the solution with x and y exchanged
 *                       (x ≠ y) → ordered-pair-reversed
 *   systemsWorkspace    linear mode, "one solution" chosen, the point typed is
 *                       the solution exchanged → ordered-pair-reversed; else a
 *                       point on exactly one of the two lines the workspace
 *                       showed → system-point-on-one-line-only (TC05)
 *   intervalNumberLine  the graph has the key's endpoints with an endpoint
 *                       included or excluded wrongly, or is the key's ray
 *                       pointing the other way — the classifier's own rule
 *                       (`intervalMistake`) → endpoint-inclusion-error /
 *                       inequality-direction-reversed
 *   relationMapping     domain and range both wrong, every entry a number, the
 *                       domain given is exactly the range and the range the
 *                       domain (the classifier's rule) → domain-range-swapped
 *   graphing2           a constructed line through the form's anchor whose
 *                       slope is exactly 1/m or −m (−1/m a blocker; the
 *                       classifier's rule and anchors) → slope-run-over-rise /
 *                       slope-sign-reversed
 *   dataModelingLab     |r| ≥ 0.2 and the direction chosen (the student's own
 *                       choice), or r typed, is the opposite one; a causation
 *                       claim the data do not support, chosen (the
 *                       classifier's rule) → correlation-direction-reversed /
 *                       correlation-treated-as-causation
 *   multiAnswer, fields a typed equation that is the right line in the wrong
 *                       form, as the field asks it (`fieldLineForm`, the
 *                       classifier's own rule) → line-wrong-form-*
 *
 * Anything else says nothing, and the attempt keeps its authored feedback.
 *
 * THE MESSAGE IS FIXED TEXT. It comes from misconceptionStudentMessages.mjs,
 * where no value from the item can reach it: it names the error as a thing to
 * check and never states the answer. A choice part (the system's
 * classification) is never read for a code.
 *
 * NEVER A GRADE. The attempt is graded and recorded before this runs; nothing
 * returned here is read by the grade. Anything that throws is null.
 *
 * TWO USES, ONE RULE. Corrections shows the message on a miss (display only,
 * nothing stored). A secure Test or Retest response stores the provenance
 * block, `grading.misconceptionEvidence`, on the server-only session
 * (secureExamItems.buildResponseRecord): no screen reads it before release —
 * `publicSession` strips every response and `publicReview` copies only the
 * score — and after release the Corrections plan reads it through the
 * registry's trust gate (testCycleCorrections.mjs) to name the mistake. Each
 * tool is its own declared classifier, `path:<tool>` (misconceptionCodes.mjs).
 */
import { fieldLineForm, intervalMistake } from './misconceptionClassifiers.mjs';
import { buildMisconceptionEvidence } from './misconceptionCodes.mjs';
import { studentMisconceptionMessage } from './misconceptionStudentMessages.mjs';
import { normalizePathIntervals, sameSet } from './pathToolContracts.mjs';
import { formAwareAnchorsForMode } from './toolMath/graphing2/constructionPolicy.mjs';
import { choicesAreOwn } from './toolMath/shared/judgmentChoices.mjs';
import { answerCandidatesForField } from './answerUtils.mjs';
import { LINE_FORMS, sameLine, writtenLineForm } from './linearEquationForm.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = text(value).replace(/−/g, '-');
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
};

/** (x, y) from [x, y], {x, y} or "(x, y)"; null otherwise. */
export const correctionPair = (value) => {
  let pair = null;
  if (Array.isArray(value) && value.length === 2) pair = value;
  else if (isObject(value) && 'x' in value && 'y' in value) pair = [value.x, value.y];
  else if (typeof value === 'string') {
    const parts = text(value).replace(/^[([]\s*/, '').replace(/\s*[)\]]$/, '').split(',');
    if (parts.length === 2) pair = parts;
  }
  if (!pair) return null;
  const [x, y] = pair.map(toNumber);
  return x === null || y === null ? null : [x, y];
};

const wrongPart = (grading, id) => list(grading?.parts).some((part) => text(part?.id) === id && part?.isCorrect !== true);
const rightPart = (grading, id) => list(grading?.parts).some((part) => text(part?.id) === id && part?.isCorrect === true);
const finding = (code, parts) => ({ code, parts });
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** A point exchanged: (y0, x0) within the grader's tolerance, never the answer itself. */
const exchanged = (given, expected, tolerance) => {
  const close = (a, b) => Math.abs(a - b) <= tolerance;
  const [x0, y0] = expected;
  return close(given[0], y0) && close(given[1], x0) && !(close(given[0], x0) && close(given[1], y0));
};

/** Every entry a number (the classifier's strict list): a formatting slip is never a reversal. */
const strictNumbers = (values) => {
  if (!Array.isArray(values) || !values.length) return null;
  const numbers = values.map(toNumber);
  return numbers.every((value) => value !== null) ? numbers : null;
};

/*
 * Line form, for typed fields (a multiAnswer tool item's parts, or a field
 * item's response fields): the authored field's own words decide which form
 * is asked, exactly as the ordinary classifier reads them (`fieldLineForm`).
 */
const LINE_FORM_CODES = Object.freeze({
  [LINE_FORMS.SLOPE_INTERCEPT]: 'line-wrong-form-slope-intercept',
  [LINE_FORMS.POINT_SLOPE]: 'line-wrong-form-point-slope',
  [LINE_FORMS.STANDARD]: 'line-wrong-form-standard',
});
const lineFormFindings = ({ keysById, authoredFields, prompt, responses, grading }) => {
  const byCode = new Map();
  const answerFields = authoredFields.map((field, index) => ({ ...field, id: text(field.id) || keysById.ids[index] }));
  keysById.ids.forEach((id, index) => {
    if (!wrongPart(grading, id)) return;
    const response = responses?.[id];
    if (typeof response !== 'string') return;
    const field = { ...(answerFields.find((entry) => entry.id === id) || answerFields[index]), id, ...keysById.keys[index] };
    const keys = answerCandidatesForField(field).filter((key) => typeof key === 'string');
    if (!keys.some((key) => sameLine(response, key))) return;
    const form = fieldLineForm({ answerFields, prompt }, field);
    if (!form || writtenLineForm(response) === form) return;
    const code = LINE_FORM_CODES[form];
    if (code) byCode.set(code, [...(byCode.get(code) || []), id]);
  });
  return [...byCode].map(([code, ids]) => finding(code, ids));
};

// Two numbers equal to the precision the platform classifiers use (misconceptionClassifiers.mjs `near`).
const closeTo = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/*
 * TC05: A POINT ON EXACTLY ONE OF THE WORKSPACE'S TWO LINES.
 *
 * The lines are the item's own public `system` ({ m1, b1, m2, b2 }), the same
 * numbers the key was solved from. A point is on a line only when it satisfies
 * it exactly, and the key's solution must be on both: an item whose shown lines
 * do not meet at its key is not read at all, so nothing is named from numbers
 * the grader did not use.
 */
const pointOnOneLineOnly = (system, point, solution) => {
  const [m1, b1, m2, b2] = ['m1', 'b1', 'm2', 'b2'].map((key) => toNumber(system?.[key]));
  if ([m1, b1, m2, b2].some((value) => value === null)) return [];
  const lines = [[m1, b1], [m2, b2]];
  const onLine = ([m, b], [x, y]) => closeTo(y, m * x + b);
  if (!lines.every((line) => onLine(line, solution))) return [];
  return lines.filter((line) => onLine(line, point)).length === 1
    ? [finding('system-point-on-one-line-only', ['solution'])]
    : [];
};

const DETECTORS = {
  system: ({ definition, grading, raw }) => {
    if (!wrongPart(grading, 'solution')) return [];
    const expected = correctionPair(definition?.solution);
    const given = toNumber(raw?.x) !== null && toNumber(raw?.y) !== null
      ? [toNumber(raw.x), toNumber(raw.y)]
      : correctionPair(raw?.value);
    if (!expected || !given) return [];
    const tolerance = Math.max(1e-9, Number(definition?.tolerance) || 1e-6);
    // With x = y the exchanged pair is the answer, which the grader marked
    // right, so the 'solution' part check above already rules it out.
    return exchanged(given, expected, tolerance) ? [finding('ordered-pair-reversed', ['solution'])] : [];
  },
  systemsWorkspace: ({ definition, grading, raw, question }) => {
    // Linear mode only; "one solution" chosen and graded right, the point wrong.
    if (definition?.mode !== 'linear' || definition?.solution?.type !== 'one') return [];
    if (!rightPart(grading, 'classification') || !wrongPart(grading, 'solution')) return [];
    const { x, y } = definition.solution;
    const given = [toNumber(raw?.x), toNumber(raw?.y)];
    if (!finite(x) || !finite(y) || given.some((value) => value === null)) return [];
    const tolerance = Math.max(1e-9, Number(definition?.tolerance) || 0.05);
    if (exchanged(given, [x, y], tolerance)) return [finding('ordered-pair-reversed', ['solution'])];
    // Not the exchanged pair (which can itself sit on one line, and is the
    // more specific mistake): a point that works in one equation only.
    return pointOnOneLineOnly(isObject(question) ? question.system : null, given, [x, y]);
  },
  intervalNumberLine: ({ definition, grading, raw }) => {
    if (!wrongPart(grading, 'graph') || !Array.isArray(raw?.intervals)) return [];
    const expected = normalizePathIntervals(definition?.intervals);
    const built = normalizePathIntervals(raw.intervals.filter(isObject));
    if (!expected.length || built.length !== raw.intervals.length) return [];
    const code = intervalMistake(built, expected);
    return code ? [finding(code, ['graph'])] : [];
  },
  relationMapping: ({ definition, grading, raw }) => {
    if (!wrongPart(grading, 'domain') || !wrongPart(grading, 'range')) return [];
    const domain = strictNumbers(definition?.domain);
    const range = strictNumbers(definition?.range);
    const typedDomain = strictNumbers(raw?.domain);
    const typedRange = strictNumbers(raw?.range);
    if (!domain || !range || !typedDomain || !typedRange) return [];
    // When the domain IS the range, an exchanged answer is the right answer,
    // and both parts graded wrong already rules it out.
    return sameSet(typedDomain, range) && sameSet(typedRange, domain)
      ? [finding('domain-range-swapped', ['domain', 'range'])]
      : [];
  },
  graphing2: ({ definition, grading, raw, question }) => {
    if (!wrongPart(grading, 'constructed-line') || !Array.isArray(raw?.points)) return [];
    const mode = text(definition?.mode);
    const target = definition?.target;
    if (!['slopeIntercept', 'pointSlope', 'standardForm'].includes(mode) || target?.kind !== 'slopeIntercept') return [];
    const m = Number(target.m);
    if (!finite(m) || m === 0) return [];
    const points = raw.points.filter((point) => Array.isArray(point) && point.length === 2 && point.every(finite));
    if (points.length !== raw.points.length) return [];
    const distinct = points.filter((point, index) => points.findIndex((other) => Math.abs(other[0] - point[0]) < 1e-9 && Math.abs(other[1] - point[1]) < 1e-9) === index);
    if (distinct.length < 2) return [];
    const [first, second] = distinct;
    if (Math.abs(second[0] - first[0]) < 1e-9) return [];
    const slope = (second[1] - first[1]) / (second[0] - first[0]);
    const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
    const onStudentLine = ([x, y]) => close(y, first[1] + slope * (x - first[0]));
    if (!distinct.every(onStudentLine)) return [];
    // A line that misses the form's anchor has two errors in it: no code.
    const authored = isObject(question) && text(question.pathToolId) === 'graphing2' ? question : {};
    const anchors = formAwareAnchorsForMode(mode, authored, target).anchors || [];
    if (!anchors.some(({ point }) => Array.isArray(point) && onStudentLine(point.map(Number)))) return [];
    const candidates = [
      { code: 'slope-run-over-rise', value: 1 / m },
      { code: 'slope-sign-reversed', value: -m },
      { code: null, value: -1 / m },
    ].filter((candidate) => !close(candidate.value, m) && close(slope, candidate.value));
    const codes = new Set(candidates.map((candidate) => candidate.code));
    if (codes.size !== 1 || codes.has(null)) return [];
    return [finding([...codes][0], ['constructed-line'])];
  },
  dataModelingLab: ({ definition, raw }) => {
    // The lab's grading reports its parts by name, so each is recomputed here
    // from the same definition, as the grader computes it.
    const required = list(definition?.requiredParts);
    const r = Number(definition?.r);
    const direction = text(definition?.descriptor?.direction);
    if (!finite(r) || !isObject(raw)) return [];
    const opposite = { positive: 'negative', negative: 'positive' }[direction];
    const ownChoices = choicesAreOwn(raw);
    const interpretationRight = text(raw.direction) === direction && text(raw.strength) === text(definition?.descriptor?.strength);
    const associationRight = interpretationRight && text(raw.causation) === text(definition?.causationExpected);
    const findings = [];
    if (opposite && Math.abs(r) >= 0.2 && !(ownChoices && raw.direction === direction)) {
      const reversed = [];
      if (ownChoices && raw.direction === opposite) {
        if (required.includes('association') && !associationRight) reversed.push('association');
        if (required.includes('correlationInterpretation') && !interpretationRight) reversed.push('correlationInterpretation');
      }
      const tolerance = Number(definition?.correlationTolerance ?? 0.03);
      const typedR = toNumber(raw.r);
      if (required.includes('correlation') && typedR !== null && Math.abs(typedR - r) > tolerance && Math.abs(typedR + r) <= tolerance) {
        reversed.push('correlation');
      }
      if (reversed.length) findings.push(finding('correlation-direction-reversed', reversed));
    }
    if (ownChoices && raw.causation === 'causation' && definition?.causationExpected !== 'causation'
      && required.includes('association') && !associationRight) {
      findings.push(finding('correlation-treated-as-causation', ['association']));
    }
    return findings;
  },
  multiAnswer: ({ definition, grading, raw, question }) => {
    const parts = list(definition?.parts);
    const authored = isObject(question) ? (list(question.answerFields).length ? list(question.answerFields) : list(question.parts)) : [];
    return lineFormFindings({
      keysById: { ids: parts.map((part) => text(part?.id)), keys: parts.map((part) => ({ expected: part?.expected, accepted: list(part?.accepted) })) },
      authoredFields: authored.filter(isObject),
      prompt: question?.prompt,
      responses: isObject(raw?.responses) ? raw.responses : {},
      grading,
    });
  },
  fields: ({ privateGrading, grading, responses, question }) => {
    const fields = list(privateGrading?.fields);
    const authored = isObject(question) ? list(question.responseFields).filter(isObject) : [];
    return lineFormFindings({
      keysById: { ids: fields.map((field) => text(field?.id)), keys: fields.map((field) => ({ expected: field?.expected, accepted: list(field?.accepted) })) },
      authoredFields: authored,
      prompt: question?.prompt,
      responses: isObject(responses) ? responses : {},
      grading,
    });
  },
};

export const CORRECTION_MISS_DIAGNOSIS_TOOLS = Object.freeze(Object.keys(DETECTORS));

/** The classifier id each tool's findings are declared under (misconceptionCodes.mjs). */
export const pathMisconceptionClassifierId = (tool) => (DETECTORS[text(tool)] ? `path:${text(tool)}` : null);
export const IMPLEMENTED_PATH_MISCONCEPTION_CLASSIFIERS = Object.freeze(Object.keys(DETECTORS).map(pathMisconceptionClassifierId));

const toolOf = (privateGrading) => (text(privateGrading?.pathToolId) || (Array.isArray(privateGrading?.fields) ? 'fields' : ''));

/** The findings for one graded Path item answer: [{ code, parts }], possibly empty. Never throws. */
export const pathMissFindings = ({ privateGrading = null, grading = null, raw = null, responses = null, question = null } = {}) => {
  try {
    if (!grading || grading.isCorrect === true || grading.rejected === true) return { tool: null, findings: [] };
    const tool = toolOf(privateGrading);
    const detector = DETECTORS[tool];
    if (!detector) return { tool: null, findings: [] };
    if (tool !== 'fields' && !isObject(raw)) return { tool, findings: [] };
    const findings = detector({ privateGrading, definition: privateGrading.definition || {}, grading, raw, responses, question });
    return { tool, findings: list(findings).filter((entry) => studentMisconceptionMessage(entry?.code)) };
  } catch {
    return { tool: null, findings: [] };
  }
};

export const diagnoseCorrectionMiss = (input = {}) => {
  const [first] = pathMissFindings(input).findings;
  const message = first ? studentMisconceptionMessage(first.code) : null;
  return message ? { source: 'classifier', code: first.code, message } : null;
};

/**
 * The server provenance block for a secure response's miss, or null — what
 * `grading.misconceptionEvidence` holds. Built by the registry's own builder,
 * so it carries only codes, part ids and who classified them.
 */
export const pathMisconceptionEvidence = (input = {}) => {
  try {
    const { tool, findings } = pathMissFindings(input);
    return findings.length ? buildMisconceptionEvidence({ classifierId: pathMisconceptionClassifierId(tool), findings }) : null;
  } catch {
    return null;
  }
};

export default diagnoseCorrectionMiss;
