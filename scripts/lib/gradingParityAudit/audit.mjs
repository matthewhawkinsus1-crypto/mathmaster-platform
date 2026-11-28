/*
 * THE REAL-ITEM GRADING AUDIT: EVERY BOX OF EVERY LESSON ITEM, STUDENT-LIKE
 * ANSWERS, THE SCREEN'S VERDICT AGAINST THE SERVER'S, AND BOTH AGAINST THE KEY.
 *
 * The grader fuzz harness (scripts/lib/graderFuzz) types generated input into
 * bank and family questions. This types what students type (right answers in
 * many spellings, one-slip wrong answers, edge input: studentAnswers.mjs) into
 * every typed box of every gradable item in teacher-import-jsons
 * (realItems.mjs), and asks of each answer:
 *
 *   screen   what the box and its grader do on the device: the shared grader
 *            the screen calls (gradeMultiAnswerResponse with the
 *            follow-through rules, gradeTableResponse) and the checks that
 *            keep an entry from being submitted (answerShapeGuard
 *            formatProblemForResponse, typedEntryGuard typedEntryNotice)
 *   server   gradeServerResponse on the response as ingestion receives it
 *            (normalizeOrdinaryResponse of the screen's answer state, as JSON)
 *
 * and reports
 *
 *   disagreements   the two verdicts differ (a box the screen refuses is
 *                   never sent: the server must then not mark it right)
 *   wrong verdicts  both agree and the verdict is wrong by the item's own key:
 *                   a right spelling marked wrong (or refused), a wrong answer
 *                   or an edge input marked right. `firm` when the
 *                   independent reading (mathOracle.mjs) confirmed what the
 *                   answer is; otherwise listed for review.
 *
 * The other boxes of the item hold their own keys, so the item's verdict
 * turns on the box under test; both the box's part and the whole item are
 * compared.
 *
 * Rich tools (Step Algebra, systems, graphs, ...) are counted, not typed into:
 * their answers are structured work, which the fuzz harness's structuredWork
 * target covers. This audit is about typed boxes.
 *
 * Pure apart from reading the lesson files. Deterministic for a seed.
 */
import { gradeMultiAnswerResponse, gradeTableResponse, normalizeOrdinaryResponse } from '../../../functions/shared/ordinaryResponseGrading.mjs';
import { answerCandidatesForField, isChoiceAnswerField } from '../../../functions/shared/answerUtils.mjs';
import * as followThrough from '../../../functions/shared/followThrough.mjs';
import { fieldTexts, questionTexts } from '../../../functions/shared/lineFormPolicy.mjs';
import { formRequestIn } from '../../../functions/shared/linearEquationForm.mjs';
import { deliveredQuestionForGrading } from '../../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { gradeServerResponse } from '../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { typedEntryNotice } from '../../../functions/shared/typedEntryGuard.mjs';
import { formatProblemForResponse } from '../../../src/platform/interaction/answerShapeGuard.js';
import '../../../functions/shared/formSpecificFieldGrading.mjs';
import { createRng } from '../graderFuzz/prng.mjs';
import { check as checkStructuredWork } from '../graderFuzz/targets/structuredWork.mjs';
import { GRADING_MANIFEST, resolveGradingSurfaceId } from '../../../functions/shared/serverGrading/gradingManifest.mjs';
import { TOOL_GRADERS } from '../../../functions/shared/serverGrading/toolGraders.mjs';
import { resolveToolMode } from '../../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { equationWorkspaceWork, relationWorkspaceWork } from '../../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { composedWorkflowWork, resolveComposedWorkflow } from '../../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { realItems } from './realItems.mjs';
import { numberOf } from './mathOracle.mjs';
import { fieldKind, formRuleOf, studentAnswersFor } from './studentAnswers.mjs';

const text = (value) => String(value ?? '');
const plain = (value) => JSON.parse(JSON.stringify(value));
const scalar = (value) => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
const FRACTION_REQUEST = /\bfractions?\b|lowest terms|simplest form|improper|mixed numbers?/i;

/* ------------------------------------------------------------------ the boxes of an item */

/**
 * The typed boxes of an item, each with its own key and the answers that fill
 * the other boxes (their keys). A follow-through box keeps the item's own key
 * (`-5`), not the rule it is built from (`1 - 4*{slope}`): with every earlier
 * box right the two are one value, and a number box takes the value.
 */
export const typedBoxesOf = (question) => {
  if (question.type === 'multiAnswer') {
    const fields = (question.answerFields || []).filter((field) => field?.id);
    const keyed = Object.fromEntries(fields.map((field) => [field.id, text(field.answer)]));
    return fields
      .filter((field) => !isChoiceAnswerField(field) && scalar(field.answer) && text(field.answer).trim() !== '' && !/\{\{/.test(text(field.answer)))
      .map((field) => ({
        id: field.id,
        field,
        key: keyed[field.id],
        accepted: (Array.isArray(field.acceptedAnswers) ? field.acceptedAnswers : []).filter(scalar).map(text),
        others: keyed,
        facts: {
          formAsked: ['equivalence', 'gradingMode', 'answerForm', 'lineForm'].some((name) => field[name]) || formRequestIn([...fieldTexts(field), ...questionTexts(question)]) !== null,
          fractionAsked: [...fieldTexts(field), ...questionTexts(question), field.answerFormat, field.inputContract?.format].some((value) => FRACTION_REQUEST.test(text(value))),
        },
      }));
  }
  if (question.type === 'table') {
    const answers = question.table?.answers || {};
    const others = { ...Object.fromEntries((question.table?.blanks || []).map((key) => [key, '0'])), ...Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, text(value)])) };
    return Object.entries(answers).filter(([, value]) => scalar(value) && text(value).trim()).map(([id, value]) => ({
      id,
      field: { id, answer: value, inputProfile: /[A-Za-z]/.test(text(value)) ? 'expression' : 'number' },
      key: text(value),
      accepted: [],
      others,
      facts: { formAsked: false, fractionAsked: false },
    }));
  }
  return [];
};

/* ------------------------------------------------------------------ the two verdicts */

const partVerdict = (result, id) => result?.parts?.find((part) => text(part.id) === text(id));

/** The screen: its grader's verdict, or why the box will not submit. */
export const screenVerdict = (question, box, value) => {
  const answers = { ...box.others, [box.id]: value };
  if (question.type === 'table') {
    const table = { answers: question.table?.answers || {}, blanks: (question.table?.blanks || []).map(String) };
    const graded = gradeTableResponse({ table }, answers);
    const notice = typedEntryNotice(value);
    const part = partVerdict(graded, box.id);
    return { graded, verdict: notice ? 'refused' : !text(value).trim() ? 'incomplete' : part?.isCorrect === true ? 'right' : 'wrong', why: notice ? 'entry' : null, whole: graded.isCorrect === true };
  }
  const graded = gradeMultiAnswerResponse(question, answers, { followThrough });
  const field = box.field;
  const format = formatProblemForResponse(field, value);
  const entry = typedEntryNotice(value, { words: field.type === 'text' || field.inputMode === 'text', keys: answerCandidatesForField(field) });
  const part = partVerdict(graded, box.id);
  let verdict;
  if (format || entry) verdict = 'refused';
  else if (!text(value).trim() || part?.isComplete === false) verdict = 'incomplete';
  else verdict = part?.isCorrect === true ? 'right' : 'wrong';
  return { graded, verdict, why: format ? `format: ${format}` : entry ? `entry: ${entry.split('.')[0]}` : null, whole: graded.isCorrect === true };
};

/** The server: gradeServerResponse on the bytes the screen sends. */
export const serverVerdict = (question, screen, box) => {
  const response = plain(normalizeOrdinaryResponse({ question, answerState: { parts: screen.graded.parts } }));
  const result = gradeServerResponse({ question, response });
  if (!result.graded) return { verdict: `ungraded:${result.reason}`, whole: false, result };
  const part = partVerdict(result, box.id);
  return { verdict: part?.isCorrect === true ? 'right' : 'wrong', whole: result.isCorrect === true, result };
};

/** Do the two agree? A box the screen will not send must not be marked right by the server. */
export const verdictsAgree = (screen, server) => {
  if (screen.verdict === 'refused') return server.verdict !== 'right';
  if (screen.verdict === 'incomplete') return server.verdict !== 'right';
  return screen.verdict === server.verdict && screen.whole === server.whole;
};

/* ------------------------------------------------------------------ follow-through */

const decimalText = (value) => String(Number(value.toFixed(6)));

/**
 * A follow-through box (SP-3) after an earlier box it builds on was answered
 * WRONG: the earlier box holds its key moved by one, and the answer carried
 * through from that value is right while the same answer moved by one is not.
 * Only for number keys, whose carried value the oracle can work out.
 */
export const followThroughAnswersFor = (question, box) => {
  const rule = followThrough.followThroughOf(box.field);
  if (!rule || question.type !== 'multiAnswer') return [];
  const fields = (question.answerFields || []).filter((field) => field?.id);
  const others = { ...box.others };
  for (const name of rule.from) {
    const value = numberOf(others[name]);
    if (value === null) return [];
    others[name] = decimalText(value + 1);
  }
  const built = followThrough.followThroughKeys(fields, others).get(box.id);
  if (!built?.length) return [];
  const carried = fieldKind(box.field) === 'number' ? numberOf(built[0]) : null;
  if (carried === null) return [];
  const original = numberOf(box.key);
  if (original !== null && Math.abs(original - carried) < 1e-9) return [];
  const moved = { ...box, others };
  return [
    { box: moved, answer: { text: decimalText(carried), category: 'follow-through', spellingClass: `carried from a wrong ${rule.from.join(', ')}`, expect: 'right', firm: true } },
    { box: moved, answer: { text: decimalText(carried + 1), category: 'follow-through', spellingClass: 'carried, then off by one', expect: 'wrong', firm: true } },
  ];
};

/* ------------------------------------------------------------------ rich tools */

/*
 * A rich tool's answer is structured work, not one typed box, and an item
 * holds no worked key the audit could spell. So its real items get the
 * parity half only: work built from the names the tool's grader reads, each
 * holding what a student plausibly types (the numbers of the item itself, a
 * Unicode minus, LaTeX, blank, unfinished, over-long), checked by the fuzz
 * harness's own structuredWork target (device against server, never throws,
 * stable, a typed value never unreadable).
 */
const namesRead = (question, surfaceId) => {
  const grader = TOOL_GRADERS[surfaceId];
  if (!grader) return [];
  const seen = new Set();
  const recorder = new Proxy({}, {
    get: (_, key) => { if (typeof key === 'string') seen.add(key); return undefined; },
    has: (_, key) => { if (typeof key === 'string') seen.add(key); return false; },
  });
  try { grader.modeGraders[resolveToolMode(grader.declaration, question)]?.(question, recorder); } catch { /* the names read before it gave up are still names */ }
  return [...seen].filter((key) => !['then', 'toJSON', 'constructor'].includes(key)).sort();
};

const EDGE_TYPED = ['', ' ', '+', '=', '\\placeholder{}', 'x +', `${'1+'.repeat(130)}1`];
const itemNumbers = (question) => [...new Set([...JSON.stringify(question).matchAll(/-?\d+(?:\.\d+)?(?:\/\d+)?/g)].map((match) => match[0]))].slice(0, 40);

const studentValue = (rng, numbers) => {
  const number = numbers.length ? rng.pick(numbers) : String(rng.int(-9, 9));
  return rng.pick([
    () => number,
    () => number.replace(/^-/, '−'),
    () => (/\//.test(number) ? `\\frac{${number.split('/')[0].replace('-', '')}}{${number.split('/')[1]}}` : ` ${number} `),
    () => `x = ${number}`,
    () => `(${number}, ${rng.pick(numbers.length ? numbers : ['0'])})`,
    () => Number(number),
    () => rng.pick(EDGE_TYPED),
  ])();
};

export const toolWorkCasesFor = (item, rng, count) => {
  const question = deliveredQuestionForGrading(item.question);
  const surfaceId = resolveGradingSurfaceId(question);
  const declaration = GRADING_MANIFEST[surfaceId];
  if (!declaration) return [];
  const numbers = itemNumbers(question);
  const variable = text(question.objective?.variable || question.variable || 'x');
  const out = [];
  for (let index = 0; index < count; index += 1) {
    let work;
    // Which names are boxes and which are lists is the tool's to know: work
    // built from the names read may have a shape the tool never sends
    // ('shape', as the fuzz harness calls it), so a refusal there is reported,
    // not failed. Workspace and workflow work is built in the tool's own shape.
    let change = 'typed';
    if (['stepAlgebra', 'algebra', 'literalWorkspace'].includes(surfaceId)) {
      const value = () => text(studentValue(rng, numbers));
      work = rng.chance(0.5)
        ? equationWorkspaceWork({ equation: { left: variable, right: value() } })
        : relationWorkspaceWork({ relationState: { connective: null, branches: [{ expressions: [variable, value()], relations: [rng.pick(['=', '<', '<=', '>', '>='])] }] }, solutionSet: rng.chance(0.5) ? { none: false, values: [value()] } : null });
    } else if (surfaceId === 'composedWorkflow') {
      const stages = resolveComposedWorkflow(question)?.workflow || [];
      work = composedWorkflowWork(Object.fromEntries(stages.map((stage) => [stage.id, studentValue(rng, numbers)])));
    } else if (declaration.kind === 'tool') {
      const names = namesRead(question, surfaceId);
      if (!names.length) return out;
      work = Object.fromEntries(names.map((name) => [name, studentValue(rng, numbers)]));
      change = 'shape';
    } else {
      return out;
    }
    out.push({ target: 'structuredWork', source: item.id, question, work: plain(work), change, at: 'real-item', given: null });
  }
  return out;
};

/** The parity half for every rich-tool item: `{ cases, findings }` from the fuzz harness's structuredWork check. */
export const runToolItemParity = async ({ seed = 'real-items', seats = 2, perItem = 6, itemSample = null } = {}) => {
  const rng = createRng(`grading-parity-real-items/tools/${seed}`);
  const { items: all } = realItems({ seats });
  const tools = all.filter((item) => item.supported && !['multiAnswer', 'table'].includes(item.question.type));
  const items = itemSample ? rng.sample(tools, itemSample) : tools;
  const findings = [];
  let cases = 0;
  const bySurface = {};
  for (const item of items) {
    for (const fuzzCase of toolWorkCasesFor(item, rng, perItem)) {
      cases += 1;
      bySurface[item.surface] = (bySurface[item.surface] || 0) + 1;
      for (const found of await checkStructuredWork(fuzzCase)) findings.push({ ...found, item: item.id });
    }
  }
  return { items: items.length, cases, bySurface, findings };
};

/* ------------------------------------------------------------------ the run */

const wrongVerdictOf = (answer, screen) => {
  if (answer.expect === 'right' && screen.verdict === 'wrong') return 'right answer marked wrong';
  if (answer.expect === 'right' && screen.verdict === 'refused') return 'right answer refused by the box';
  if (answer.expect !== 'right' && screen.verdict === 'right') return answer.expect === 'wrong' ? 'wrong answer marked right' : 'edge input marked right';
  return null;
};

/**
 * Run the audit.
 *
 *   seats        family seats drawn per item
 *   itemSample   grade only this many items (seeded); all when omitted
 *   answerSample per box, only this many answers (seeded, the key always kept)
 */
export const runRealItemAudit = ({ seed = 'real-items', seats = 2, itemSample = null, answerSample = null } = {}) => {
  const rng = createRng(`grading-parity-real-items/${seed}`);
  const { items: all, failures, lessons } = realItems({ seats });
  const items = itemSample ? rng.sample(all, itemSample) : all;
  const counts = { lessons, items: all.length, itemsGraded: 0, typedItems: 0, boxes: 0, answers: 0, bySurface: {}, byCategory: {}, unreadKeys: 0 };
  const disagreements = [];
  const wrongVerdicts = [];
  const keyNotRight = [];
  for (const item of items) {
    counts.bySurface[item.surface] = (counts.bySurface[item.surface] || 0) + 1;
    if (!item.supported) continue;
    counts.itemsGraded += 1;
    const question = deliveredQuestionForGrading(item.question);
    const boxes = typedBoxesOf(question);
    if (!boxes.length) continue;
    counts.typedItems += 1;
    for (const box of boxes) {
      counts.boxes += 1;
      let answers = studentAnswersFor({ key: box.key, accepted: box.accepted, field: box.field, fieldFacts: box.facts, seed: item.id }).map((answer) => ({ box, answer }));
      if (answerSample && answers.length > answerSample) answers = [answers[0], ...rng.sample(answers.slice(1), answerSample - 1)];
      answers.push(...followThroughAnswersFor(question, box));
      for (const { box: asked, answer } of answers) {
        counts.answers += 1;
        counts.byCategory[answer.category] = (counts.byCategory[answer.category] || 0) + 1;
        let screen;
        let server;
        try {
          screen = screenVerdict(question, asked, answer.text);
          server = serverVerdict(question, screen, asked);
        } catch (error) {
          disagreements.push({ item: item.id, box: box.id, key: box.key, input: answer.text, category: answer.category, spellingClass: answer.spellingClass, kind: 'threw', screen: 'threw', server: String(error?.message || error).slice(0, 200) });
          continue;
        }
        const row = {
          item: item.id,
          box: box.id,
          kind: fieldKind(box.field),
          form: formRuleOf(box.field),
          key: box.key,
          accepted: box.accepted,
          input: answer.text,
          category: answer.category,
          spellingClass: answer.spellingClass,
          expected: answer.expect,
          screen: screen.verdict,
          screenWhy: screen.why,
          server: server.verdict,
        };
        if (!verdictsAgree(screen, server)) {
          disagreements.push({ ...row, type: `screen ${screen.verdict} / server ${server.verdict}${screen.whole !== server.whole && screen.verdict === server.verdict ? ' (whole item differs)' : ''}` });
        }
        const wrong = wrongVerdictOf(answer, screen);
        if (wrong) {
          if (answer.spellingClass === 'key') keyNotRight.push({ ...row, type: wrong });
          else wrongVerdicts.push({ ...row, type: wrong, firm: answer.firm });
        }
      }
    }
  }
  return { seed: String(seed), seats, counts, failures, disagreements, wrongVerdicts, keyNotRight };
};

/** A finding's signature: what tells one cause from another, never the value. */
export const signatureOf = (row) => [row.type, row.kind, row.form || '-', row.category, row.spellingClass, `screen=${row.screen}`, `server=${row.server}`].join(' | ');

export const groupBySignature = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const signature = signatureOf(row);
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(row);
  }
  return [...groups].map(([signature, list]) => ({ signature, count: list.length, examples: list.slice(0, 5) })).sort((a, b) => b.count - a.count);
};

/**
 * Whether a run fails: any disagreement, a firm wrong verdict off the review
 * list, a failing tool finding, an item's own key refused, or a lesson that
 * did not compile (and so was not audited at all).
 */
export const auditFails = ({ disagreements = 0, wrongVerdictsFirmUnlisted = 0, toolFindingsFailing = 0, keyNotRight = 0, lessonsThatDidNotCompile = 0 } = {}) => (
  disagreements + wrongVerdictsFirmUnlisted + toolFindingsFailing + keyNotRight + lessonsThatDidNotCompile > 0
);
