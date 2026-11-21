/*
 * FUZZ TARGET: A WHOLE ORDINARY QUESTION, ON THE DEVICE AND AS THE SERVER GETS IT.
 *
 * typedFields.mjs asks about one box. This asks about the question a student
 * actually answers: every multiAnswer Question Family instance with all of its
 * boxes (and the words of its own prompt, which lineFormPolicy reads), and the
 * scalar types (literal, ordered pair, system, table, fraction, number line).
 * One box holds a fuzzed value; the others hold their keys, so the verdict on
 * the whole question turns on that box.
 *
 *   device   the type's own grader, as the question's screen calls it
 *            (gradeMultiAnswerResponse, gradeLiteralResponse, ...)
 *   server   gradeServerResponse on the response as ingestion receives it:
 *            the screen's answer state, normalized (normalizeOrdinaryResponse)
 *            and sent as JSON
 *
 * PROPERTIES
 *
 *   never-throws           neither throws
 *   device-server-parity   one verdict, part for part, wherever the server
 *                          marks the type at all
 *   unfinished-not-right   the key left unfinished is not a right answer
 *   key-is-right           a question answered with its own keys is right
 *   stable                 asked again, the same verdict
 *   answers-in-time        one check takes under `slowMs`
 */
import {
  gradeFractionResponse,
  gradeLiteralResponse,
  gradeMultiAnswerResponse,
  gradeNumberLineResponse,
  gradeOrderedPairResponse,
  gradeSystemResponse,
  gradeTableResponse,
  normalizeOrdinaryResponse,
} from '../../../../functions/shared/ordinaryResponseGrading.mjs';
import { isChoiceAnswerField } from '../../../../functions/shared/answerUtils.mjs';
import { gradeServerResponse } from '../../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { familyQuestionCorpus } from '../corpus.mjs';
import { errorLine, finding } from '../findings.mjs';
import { INPUT_CLASSES, breakOf, isUnfinished, typedInput } from '../inputs.mjs';
import { typedEntryNotice } from '../../../../functions/shared/typedEntryGuard.mjs';

export const id = 'questionResponses';

const plain = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => String(value ?? '');
const scalar = (value) => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

// Synthetic questions of the scalar types, in each shape their keys are stored in.
const SYNTHETIC_QUESTIONS = [
  { type: 'literal', prompt: 'Solve A = lw for w.', solveFor: 'w', acceptedAnswers: ['w = A/l', 'A/l'] },
  { type: 'literal', prompt: 'Solve I = Prt for r.', solveFor: 'r', acceptedAnswers: ['r = I/(Pt)', '\\frac{I}{Pt}'] },
  { type: 'literal', prompt: 'Solve C = 2πr for r.', solveFor: 'r', acceptedAnswers: ['r = C/(2π)', 'r=\\frac{C}{2\\pi}'] },
  { type: 'literal', prompt: 'How many are left?', acceptedAnswers: ['1,250'] },
  { type: 'orderedPair', prompt: 'Name the vertex.', answer: [2, -3] },
  { type: 'orderedPair', prompt: 'Name the intercept.', answer: '(1/2, 0)' },
  { type: 'orderedPair', prompt: 'Name the point.', solution: ['\\frac{3}{4}', '-1.5'] },
  { type: 'system', prompt: 'Solve the system.', equationsLatex: ['y = 2x + 1', 'y = -x + 4'], solution: [1, 3] },
  { type: 'system', prompt: 'Solve the system.', equationsLatex: ['2x + y = 9', 'x - y = 0'], answer: { x: 3, y: 3 } },
  { type: 'system', prompt: 'Solve the system.', equationsLatex: ['x + y = 1', 'x - y = 0'], answer: '(1/2, 1/2)' },
  { type: 'table', prompt: 'Complete the table.', table: { headers: ['x', 'y'], rows: [['1', ''], ['2', '']], answers: { 'r0c1': '5', 'r1c1': '7.5' } } },
  { type: 'table', prompt: 'Complete the table.', table: { headers: ['x', 'y'], rows: [['1', ''], ['2', '']], answers: { 'r0c1': '1,000' }, blanks: ['r1c1'] } },
  { type: 'fraction', prompt: 'Write in lowest terms.', answer: '3/4' },
  { type: 'fraction', prompt: 'Add.', num1: 1, den1: 4, num2: 1, den2: 2, ansNum: 3, ansDen: 4 },
  { type: 'numberLine', prompt: 'Plot the point.', target: -2, min: -5, max: 5 },
];

let subjects = null;
const subjectCorpus = () => {
  if (subjects) return subjects;
  subjects = SYNTHETIC_QUESTIONS.map((question, index) => ({ source: `synthetic:${question.type}:${index}`, question: { questionId: `fuzz-${index}`, ...question } }));
  for (const { source, question } of familyQuestionCorpus({ perFamily: 3 })) {
    if (['multiAnswer', 'literal', 'orderedPair', 'system', 'table', 'fraction', 'numberLine'].includes(question.type) && !Array.isArray(question.workflow)) subjects.push({ source, question });
  }
  return subjects;
};

/** The boxes of a question: `{ id, key }`, `key` null where the box is a choice or has no single key. */
const boxesOf = (question) => {
  const pairText = (pair) => (Array.isArray(pair) ? `(${pair[0]}, ${pair[1]})` : pair && typeof pair === 'object' ? `(${pair.x}, ${pair.y})` : scalar(pair) ? text(pair) : null);
  switch (question.type) {
    case 'multiAnswer': return (question.answerFields || []).filter((field) => field?.id).map((field) => ({ id: field.id, key: scalar(field.answer) ? field.answer : null, choice: isChoiceAnswerField(field), field }));
    // A blank graded elsewhere has no key here: it is filled, never the box under test.
    case 'table': return [...new Set([...Object.keys(question.table?.answers || {}), ...(question.table?.blanks || [])])].map((key) => ({ id: key, key: question.table.answers?.[key] ?? '0', choice: !Object.hasOwn(question.table?.answers || {}, key) }));
    case 'literal': return [{ id: 'value', key: question.acceptedAnswers?.[0] ?? null }];
    case 'orderedPair': return [{ id: 'value', key: pairText(question.answer || question.solution) }];
    case 'system': return [{ id: 'value', key: pairText(question.solution || question.answer) }];
    case 'fraction': return [{ id: 'value', key: question.answer ?? `${question.ansNum}/${question.ansDen}` }];
    case 'numberLine': return [{ id: 'value', key: question.target }];
    default: return [];
  }
};

const FIELD_TYPES = new Set(['multiAnswer', 'table']);
const SCALAR_GRADERS = { literal: gradeLiteralResponse, orderedPair: gradeOrderedPairResponse, system: gradeSystemResponse, fraction: gradeFractionResponse, numberLine: gradeNumberLineResponse };

/** What the question's screen computes: its verdict and the answer state it reports. */
const onDevice = (question, answers) => {
  if (question.type === 'multiAnswer') return gradeMultiAnswerResponse(question, answers);
  if (question.type === 'table') return gradeTableResponse(question, answers);
  return SCALAR_GRADERS[question.type](question, answers.value);
};

const onServer = (question, answers, device) => gradeServerResponse({
  question,
  response: plain(normalizeOrdinaryResponse({
    question,
    answerState: FIELD_TYPES.has(question.type) ? { parts: device.parts } : { responseKey: answers.value },
  })),
});

export const cases = function* cases({ rng, count, maxLength = 2000 }) {
  const corpus = subjectCorpus();
  const byType = new Map();
  for (const subject of corpus) {
    if (!byType.has(subject.question.type)) byType.set(subject.question.type, []);
    byType.get(subject.question.type).push(subject);
  }
  const types = [...byType.keys()].sort();
  for (let index = 0; index < count; index += 1) {
    // Half the cases are multiAnswer (where most questions are); the rest go round the scalar types.
    const type = byType.has('multiAnswer') && index % 2 === 0 ? 'multiAnswer' : types[(index >> 1) % types.length];
    const { source, question } = rng.pick(byType.get(type));
    const boxes = boxesOf(question);
    const typedBoxes = boxes.filter((box) => !box.choice);
    if (!typedBoxes.length) continue;
    const fuzzed = rng.pick(typedBoxes);
    const input = typedInput(rng, rng.pick(INPUT_CLASSES), { key: fuzzed.key, field: fuzzed.field || {}, maxLength });
    const answers = Object.fromEntries(boxes.map((box) => [box.id, box.id === fuzzed.id ? input.text : text(box.key ?? '')]));
    // Whether every box has a key of its own to hold: then the keys, typed, are the right answer.
    const allKeyed = boxes.every((box) => box.key !== null && box.key !== undefined);
    yield { target: id, source, question, answers, fuzzed: fuzzed.id, key: fuzzed.key, allKeyed, input: { inputClass: input.inputClass, detail: input.detail } };
  }
};

export const check = async (fuzzCase, { slowMs = 2000 } = {}) => {
  const { question, answers, input } = fuzzCase;
  const typed = text(answers[fuzzCase.fuzzed]);
  const found = [];
  const report = (property, signature, message, severity) => found.push(finding({ target: id, property, signature, message, repro: fuzzCase, severity }));
  const timed = (name, run) => {
    const started = performance.now();
    try {
      return { result: run() };
    } catch (error) {
      report('never-throws', `${question.type}/${name}/${input.inputClass}/${errorLine(error)}`, `${name} threw on a ${question.type} question for ${JSON.stringify(typed.slice(0, 80))}: ${error?.message}`);
      return { thrown: true };
    } finally {
      const elapsed = performance.now() - started;
      if (elapsed > slowMs) report('answers-in-time', input.inputClass, `${name} took ${Math.round(elapsed)} ms on a ${typed.length}-character ${input.inputClass} value`);
    }
  };

  const device = timed('device', () => onDevice(question, answers));
  if (device.thrown) return found;
  const partsOf = (result) => (result.parts || []).filter((part) => part.graded !== false).map((part) => `${part.id}:${part.isCorrect === true}`);

  // An entry the box refuses (unfinished, or over the length an answer may
  // be: typedEntryGuard.mjs) is never sent, so there is no verdict to agree
  // on. A tab on an older build still sends it: the server must not mark it
  // right. (A box of a multi-answer or table question travels one character
  // past the limit, so the server sees an over-long one: typedEntryGuard.mjs
  // TYPED_ANSWER_WIRE_LENGTH. A scalar answer travels whole.)
  const refusedOnScreen = fuzzCase.fuzzed !== undefined && question.type !== 'numberLine' && typedEntryNotice(typed) !== '';
  const server = timed('server', () => onServer(question, answers, device.result));
  if (!server.thrown && refusedOnScreen) {
    if (server.result.graded && server.result.isCorrect === true) {
      report('device-server-parity', `refused-on-screen/${question.type}/${input.inputClass}/server=true`,
        `${question.type}: the box refuses ${JSON.stringify(typed.slice(0, 120))}${typed.length > 120 ? `… (${typed.length} characters)` : ''} in ${fuzzCase.fuzzed}, and the server marks the question right when it is sent anyway`);
    }
  } else if (!server.thrown) {
    const marked = server.result;
    // The server does not mark these types at all (gradingManifest.mjs), and
    // it refuses, never marks wrong, what the screen calls unfinished.
    const notMarkedHere = !marked.graded && /^(not-server-gradable|client-graded-surface|non-graded-surface|unsupported-type|mode-not-server-gradable|no-answer-key|family-template|generated-question|variant-selection|adaptive-band-profile)/.test(text(marked.reason));
    const refusedAsUnfinished = !marked.graded && ['blank-response', 'incomplete-response'].includes(marked.reason) && device.result.isComplete !== true;
    if (!notMarkedHere && !refusedAsUnfinished) {
      const same = marked.graded && marked.isCorrect === device.result.isCorrect && JSON.stringify(partsOf(marked)) === JSON.stringify(partsOf(device.result));
      if (!same) {
        report('device-server-parity', typed.length > 240 ? 'over-240-characters' : `${question.type}/${input.inputClass}/${marked.graded ? `device=${device.result.isCorrect},server=${marked.isCorrect}` : `server:${marked.reason}`}`,
          `${question.type}: the screen says ${device.result.isCorrect} ${JSON.stringify(partsOf(device.result))} and the server says ${marked.graded ? `${marked.isCorrect} ${JSON.stringify(partsOf(marked))}` : `ungraded (${marked.reason})`} for ${JSON.stringify(typed.slice(0, 120))}${typed.length > 120 ? `… (${typed.length} characters)` : ''} in ${fuzzCase.fuzzed}`);
      }
    }
  }

  const again = timed('device', () => onDevice(question, answers));
  if (!again.thrown && (again.result.isCorrect !== device.result.isCorrect || JSON.stringify(partsOf(again.result)) !== JSON.stringify(partsOf(device.result)))) {
    report('stable', question.type, `${question.type} gave ${device.result.isCorrect} and then ${again.result.isCorrect} for the same answers`);
  }

  if (input.inputClass === 'key' && fuzzCase.allKeyed && device.result.isCorrect !== true) {
    report('key-is-right', question.type, `a ${question.type} question answered with its own keys is not marked right: ${JSON.stringify(partsOf(device.result))}`);
  }
  // …and its box takes it: a key is never called unfinished or too long.
  if (input.inputClass === 'key' && refusedOnScreen) {
    report('key-is-right', `${question.type}/refused-on-screen`, `the box refuses the key ${JSON.stringify(typed.slice(0, 120))} of a ${question.type} question: ${typedEntryNotice(typed)}`);
  }

  if (input.inputClass === 'brokenKey' && isUnfinished(typed) && !refusedOnScreen && device.result.isCorrect === true) {
    report('unfinished-not-right', breakOf(typed, fuzzCase.key), `${JSON.stringify(typed)} is marked right on a ${question.type} question keyed ${JSON.stringify(fuzzCase.key)}`);
  }
  return found;
};
