/*
 * FUZZ TARGET: A TYPED ANSWER BOX, ASKED OF EVERY GRADER THAT READS ONE.
 *
 * One keyed field of a bank, one typed value, and the seven places the
 * platform decides whether that value is right:
 *
 *   value       sameValue                       the shared equivalence layer
 *   assignment  matchesFieldAnswer              an assignment's field matcher
 *   device      gradeMultiAnswerResponse        what the student's screen shows
 *   server      gradeServerResponse             what the gradebook records, on
 *                                               the response as it is sent
 *                                               (normalizeOrdinaryResponse)
 *   path        mathPath.gradeResponse          My Math Path, Live Challenge
 *   secure      secureItems.gradeItem           a secure test's close
 *   preflight   gradeResponseField              Pre-Flight's key self-check
 *
 * PROPERTIES
 *
 *   never-throws           no grader throws, whatever was typed
 *   device-server-parity   the screen's verdict is the gradebook's
 *   path-secure-parity     one stored grading definition, one verdict
 *   stable                 the same value is given the same verdict when it
 *                          is asked again, after other values were graded
 *   padding                spaces round a value change nothing
 *   unfinished-not-right   the key left unfinished ("12 +", "(x") is not right
 *   key-is-right           the key, typed as it is keyed, is right everywhere
 *   answers-in-time        one verdict takes under `slowMs`
 *   graders-agree          (report only) the assignment matcher, the Path
 *                          grader and Pre-Flight give one verdict. They are
 *                          separate graders with separate rules, so a
 *                          difference is listed, not failed.
 */
import { createRequire } from 'node:module';

import { sameValue } from '../../../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse, normalizeOrdinaryResponse } from '../../../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeResponseField } from '../../../../src/grading/fieldGrader.js';
import { typedFieldCorpus } from '../corpus.mjs';
import { errorLine, finding } from '../findings.mjs';
import { INPUT_CLASSES, breakOf, isUnfinished, typedInput } from '../inputs.mjs';
import { MAX_TYPED_ANSWER_LENGTH, typedEntryNotice } from '../../../../functions/shared/typedEntryGuard.mjs';
import { startWorkClock } from '../workClock.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../../../functions/lib/mathPath.js');
const secureItems = require('../../../../functions/lib/secureItems.js');

export const id = 'typedFields';

const THROWN = Symbol('thrown');
// The box does not let the entry be submitted (unfinished, or too long): no verdict.
const REFUSED = 'refused-on-screen';

/** The question, field and stored grading a bank field becomes in each product. */
const surfacesOf = (field) => {
  const assignmentField = { ...field, id: 'answer', label: 'Answer', answer: field.expected };
  delete assignmentField.expected;
  const question = { questionId: 'grader-fuzz', type: 'multiAnswer', prompt: 'Write the answer.', answerFields: [assignmentField] };
  let grading = null;
  let gradingError = null;
  try { grading = mathPath.privateGradingDefinition({ prompt: 'Write the answer.', responseFields: [field] }); } catch (error) { gradingError = error; }
  return { assignmentField, question, grading, gradingError };
};

/** The response as ingestion receives it: normalized on the device, then JSON. */
const wireResponse = (question, typed) => JSON.parse(JSON.stringify(normalizeOrdinaryResponse({
  question,
  answerState: { parts: [{ id: 'answer', response: typed, isComplete: String(typed).trim() !== '' }] },
})));

const gradersOf = ({ field, assignmentField, question, grading }) => ({
  value: (typed) => sameValue(typed, field.expected),
  assignment: (typed) => matchesFieldAnswer(typed, assignmentField),
  // The screen: the box's own refusal first (MultiAnswerGrader's entryProblems), then its verdict.
  device: (typed) => (typedEntryNotice(typed, { keys: [field.expected, ...(Array.isArray(field.accepted) ? field.accepted : [])] })
    ? REFUSED
    : gradeMultiAnswerResponse(question, { answer: typed }).parts[0].isCorrect === true),
  server: (typed) => {
    const result = gradeServerResponse({ question, response: wireResponse(question, typed) });
    return result.graded ? result.parts?.[0]?.isCorrect === true : `ungraded:${result.reason}`;
  },
  preflight: (typed) => gradeResponseField(field, typed)?.isCorrect === true,
  ...(grading ? {
    path: async (typed) => (await mathPath.gradeResponse(grading, { responses: { answer: typed } })).isCorrect === true,
    secure: async (typed) => (await secureItems.gradeItem(grading, { responses: { answer: typed } })).isCorrect === true,
  } : {}),
});

export const cases = function* cases({ rng, count, maxLength = 2000 }) {
  const corpus = typedFieldCorpus();
  for (let index = 0; index < count; index += 1) {
    const { source, field } = rng.pick(corpus);
    const input = typedInput(rng, rng.pick(INPUT_CLASSES), { key: field.expected, field, maxLength });
    yield { target: id, source, field, input };
  }
};

const profileOf = (field) => [field.inputProfile || 'none', field.equivalence || field.answerFormat || null].filter(Boolean).join('+');
export const check = async (fuzzCase, { slowMs = 2000 } = {}) => {
  const { field, input } = fuzzCase;
  const typed = input.text;
  const found = [];
  const report = (property, signature, message, severity) => found.push(finding({ target: id, property, signature, message, repro: fuzzCase, severity }));

  const surfaces = surfacesOf(field);
  if (surfaces.gradingError) report('never-throws', `privateGradingDefinition/${errorLine(surfaces.gradingError)}`, `privateGradingDefinition threw on a bank field: ${surfaces.gradingError.message}`);
  const graders = gradersOf({ field, ...surfaces });

  const verdicts = {};
  const ask = async (name, value) => {
    const sinceStart = startWorkClock();
    try {
      return await graders[name](value);
    } catch (error) {
      report('never-throws', `${name}/${input.inputClass}/${errorLine(error)}`, `${name} threw on ${JSON.stringify(value.slice(0, 80))} for key ${JSON.stringify(field.expected)}: ${error?.message}`);
      return THROWN;
    } finally {
      const spentMs = sinceStart();
      if (spentMs > slowMs) report('answers-in-time', input.inputClass, `${name} took ${Math.round(spentMs)} ms on a ${value.length}-character ${input.inputClass} value`);
    }
  };
  for (const name of Object.keys(graders)) verdicts[name] = await ask(name, typed);

  // The screen and the gradebook. A value the screen calls blank is not sent.
  const { device, server } = verdicts;
  if (device === REFUSED) {
    // Never sent, so there is no verdict to agree on. A tab on an older build
    // still sends it: no grader a student's credit comes from may mark it right.
    // (An over-long box travels one character past the limit, so the server
    // sees that it is over-long: typedEntryGuard.mjs TYPED_ANSWER_WIRE_LENGTH.)
    const right = ['value', 'assignment', 'path', 'secure', 'server'].filter((name) => verdicts[name] === true);
    if (right.length) {
      report('device-server-parity', `refused-on-screen/${input.inputClass}/${right.join('+')}`,
        `the box refuses ${JSON.stringify(typed.slice(0, 120))}${typed.length > 120 ? `… (${typed.length} characters)` : ''} and ${right.join(', ')} mark it right for key ${JSON.stringify(field.expected)}`);
    }
  } else if (device !== THROWN && server !== THROWN && device !== server) {
    const blankOnBoth = typed.trim() === '' && String(server).startsWith('ungraded:');
    if (!blankOnBoth) {
      report('device-server-parity', typed.length > 240 ? 'over-240-characters' : `${input.inputClass}/server=${server}`,
        `the screen says ${device} and the server says ${server} for ${JSON.stringify(typed.slice(0, 120))}${typed.length > 120 ? `… (${typed.length} characters)` : ''}, key ${JSON.stringify(field.expected)}`);
    }
  }
  if ('path' in verdicts && verdicts.path !== THROWN && verdicts.secure !== THROWN && verdicts.path !== verdicts.secure) {
    report('path-secure-parity', `${profileOf(field)}/${input.inputClass}`, `My Math Path says ${verdicts.path} and the secure close says ${verdicts.secure} for ${JSON.stringify(typed.slice(0, 120))}, key ${JSON.stringify(field.expected)}`);
  }

  // Asked again, after everything above ran in between.
  for (const name of ['value', 'assignment', 'device', 'preflight']) {
    if (verdicts[name] === THROWN) continue;
    const again = await ask(name, typed);
    if (again !== THROWN && again !== verdicts[name]) report('stable', name, `${name} said ${verdicts[name]} and then ${again} for the same value ${JSON.stringify(typed.slice(0, 120))}, key ${JSON.stringify(field.expected)}`);
  }

  // Spaces round the whole value.
  if (typed.trim() !== '' && typed.length + 3 <= MAX_TYPED_ANSWER_LENGTH) {
    for (const name of ['assignment', 'device', 'path']) {
      if (!(name in verdicts) || verdicts[name] === THROWN) continue;
      const padded = await ask(name, `  ${typed} `);
      if (padded !== THROWN && padded !== verdicts[name]) report('padding', `${name}/${profileOf(field)}`, `${name} says ${verdicts[name]} for ${JSON.stringify(typed)} and ${padded} with spaces round it, key ${JSON.stringify(field.expected)}`);
    }
  }

  if (input.inputClass === 'brokenKey' && isUnfinished(typed)) {
    const right = Object.keys(verdicts).filter((name) => verdicts[name] === true);
    // Pre-Flight's check is a teacher's tool reading an authored key; alone, it is listed.
    const studentFacing = right.some((name) => name !== 'preflight');
    if (right.length) report('unfinished-not-right', breakOf(typed, field.expected), `${JSON.stringify(typed)} is marked right for key ${JSON.stringify(field.expected)} by ${right.join(', ')}`, studentFacing ? 'fail' : 'report');
  }

  // The key itself, typed as it is keyed.
  if (input.inputClass === 'key') {
    const refused = ['assignment', 'device', 'server', 'path', 'secure'].filter((name) => name in verdicts && verdicts[name] !== true && verdicts[name] !== THROWN);
    if (refused.length) report('key-is-right', `${profileOf(field)}/${refused.join('+')}`, `the key ${JSON.stringify(field.expected)} is not marked right by ${refused.join(', ')}`);
  }

  // Separate graders, listed where they differ.
  const settled = (name) => name in verdicts && typeof verdicts[name] === 'boolean';
  for (const [left, right] of [['assignment', 'path'], ['path', 'preflight']]) {
    if (settled(left) && settled(right) && verdicts[left] !== verdicts[right]) {
      report('graders-agree', `${left}=${verdicts[left]},${right}=${verdicts[right]}/${profileOf(field)}/${input.inputClass}`,
        `${left} says ${verdicts[left]} and ${right} says ${verdicts[right]} for ${JSON.stringify(typed.slice(0, 120))}, key ${JSON.stringify(field.expected)}`, 'report');
    }
  }
  return found;
};
