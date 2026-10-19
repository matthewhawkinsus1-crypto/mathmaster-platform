#!/usr/bin/env node
/*
 * RECORDED ANSWERS WHOSE VERDICT THE WAVE-7 GRADER WOULD CHANGE. A READ-ONLY
 * COUNT. Student pass 3, wave 7 (docs/handoffs/STUDENT_PASS3_GRADER_GAPS_2.md).
 * It has no write mode: no --execute, no re-grade, and no Firestore write
 * anywhere in this file (tests/platform/studentPass3GraderGaps2Reports.test.mjs
 * runs it against a database that throws on any write and checks the source;
 * tests/integration/graderGaps2RegradeReport.test.mjs runs the CLI against a
 * seeded Firestore emulator). Decision D8 stands: a re-grade, if the owner
 * orders one, moves a verdict UP only. This report only counts.
 *
 *   node scripts/report-grader-gaps-2-regrade.mjs --project <id> [--surface assignments|secure|path]... [--page-size <n>]
 *
 * Each recorded answer is graded again with this tree's shared grader and
 * compared with the verdict it was given. A change is tagged with the wave-7
 * rule that explains it, or `other` (an earlier wave's change, or a key
 * edited since):
 *
 *   mixedNumber    3\frac{1}{2} or `3 1/2` read as a mixed number, in the
 *                  response or the key (up for 7/2, down for 1.5: the product
 *                  reading is gone);
 *   halfPi         \frac{1}{2}\pi read as π/2;
 *   exactNumber    a number box keyed with an exact constant, compared by value;
 *   textPairKey    an orderedPair question keyed as text, '(2,3)'.
 *
 * WHAT EACH SURFACE KEEPS (and so what can be counted):
 *
 *   assignments  grades/{student}/responseInspectionEvidence/{assignment}__q{i}:
 *                the raw response of the LAST counted attempt and the verdict
 *                it got (evidence.automaticResult); the key is the delivered
 *                question when the evidence holds it authoritatively, else
 *                the assignment's stored question. A generated or family
 *                question without that is counted as not re-gradable. Earlier
 *                attempts are not stored and cannot be counted.
 *   secure       examSessions/{id}.responses[item]: the recorded response and
 *                verdict; the key is examSessions/{id}/items/{item}.item's
 *                private grading (the same grader every secure close uses).
 *   path         pathSubmissions.recapJson, only on the attempt that closed a
 *                question: the typed text by field label and the key's DISPLAY
 *                value (expected, or the first accepted form). No accepted
 *                forms and no field profile are stored, so this is a lower
 *                bound for `up` and cannot see a number box (exactNumber).
 *   Live Challenge stores no response (submissionReceipts hold the verdict
 *                only): not countable, and named as such in the output.
 *
 * PRIVACY. Standard output is COUNTS ONLY. The JSON detail lists students by
 * id (no name is read) with the response and key text, under the gitignored
 * release-reports/.
 *
 * READS (all projected with a field mask): `assignments` (questions only);
 * the `responseInspectionEvidence` collection group; `examSessions` (the
 * responses map) and, for each recorded item, its `items/{id}` document;
 * `pathSubmissions` (recapJson and the student id).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  asNumber, fieldIsNumberBox, fieldValueOptions, looksLikeMixedNumber, normalizeAnswer, sameValue,
} from '../functions/shared/answerEquivalence.mjs';
import { exactConstantValue } from '../functions/shared/exactConstantValue.mjs';
import { gradeFractionResponse, gradeOrdinaryResponse } from '../functions/shared/ordinaryResponseGrading.mjs';
import { fractionQuestionDrawsNumbers } from '../functions/shared/fractionAnswer.mjs';
import { orderedPairKey } from '../functions/shared/answerUtils.mjs';
import { isFamilyBackedQuestion } from '../functions/shared/questionFamilyInstance.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin and the secure grader live in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const REPORT_VERSION = 1;
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 200;
export const SURFACES = Object.freeze(['assignments', 'secure', 'path']);
export const WAVE7_RULES = Object.freeze(['mixedNumber', 'halfPi', 'exactNumber', 'textPairKey', 'other']);
export const ASSIGNMENT_FIELDS = Object.freeze(['schemaVersion', 'sections', 'questions']);
export const EVIDENCE_FIELDS = Object.freeze([
  'evidence.submittedResponse', 'evidence.automaticResult.isCorrect', 'evidence.automaticResult.graded',
  'evidence.deliveredInstanceAuthority', 'evidence.submittedAt',
]);
export const EXAM_SESSION_FIELDS = Object.freeze(['studentId', 'responses']);
export const EXAM_ITEM_FIELDS = Object.freeze(['item']);
export const PATH_SUBMISSION_FIELDS = Object.freeze(['studentId', 'createdAt', 'recapJson']);

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const HALF_PI = /\\frac\{?\d+\}?\{?\d+\}?\s*(?:\\pi|π)/;

/** Which wave-7 rule explains a changed verdict on one response (by its text and the key). */
export const wave7Rule = ({ response = '', key = '', field = {}, question = {} } = {}) => {
  const typed = String(response ?? '');
  // Either side (review S5): a key written `3 1/2` now takes 7/2 and 3.5.
  if (looksLikeMixedNumber(typed) || looksLikeMixedNumber(key)) return 'mixedNumber';
  if (HALF_PI.test(typed)) return 'halfPi';
  if (clean(question?.type) === 'orderedPair' && typeof (question.answer ?? question.solution) === 'string') return 'textPairKey';
  if (fieldIsNumberBox(field) && asNumber(key) === null && exactConstantValue(normalizeAnswer(key))) return 'exactNumber';
  return 'other';
};

const emptyCounts = () => ({
  read: 0, regraded: 0, notRegradable: 0, unchanged: 0,
  up: Object.fromEntries(WAVE7_RULES.map((rule) => [rule, 0])),
  down: Object.fromEntries(WAVE7_RULES.map((rule) => [rule, 0])),
});

const record = (counts, changes, change) => {
  counts[change.direction][change.rule] += 1;
  changes.push(change);
};

/** The text of a typed response, for the rule tags. */
const responseTexts = (response) => {
  if (!isObject(response)) return [String(response ?? '')];
  if (response.kind === 'fields') return list(response.fields).map((field) => String(field?.value ?? ''));
  return [String(response.value ?? '')];
};

/** The question a recorded assignment answer was graded against, or null. */
const assignmentQuestion = (assignment, questionIndex, evidence) => {
  const delivered = evidence?.deliveredInstanceAuthority;
  if (delivered?.authoritative === true && isObject(delivered.question)) return delivered.question;
  const questions = Number(assignment?.schemaVersion) === 5
    ? list(assignment.sections).flatMap((section) => list(section?.questions))
    : list(assignment?.questions);
  const question = questions[questionIndex];
  // A family slot, a generated question or one with variants was not graded
  // against the stored text (the shared support check refuses them too).
  if (!isObject(question) || isFamilyBackedQuestion(question) || question.generator || list(question.variants).length) return null;
  return question;
};

/** This tree's verdict on a recorded assignment answer, or null when it cannot be graded. */
export const regradeAssignmentAnswer = (question, response) => {
  if (clean(question?.type) === 'fraction') {
    // A drill draws its numbers on the device: the stored question is not the key.
    if (fractionQuestionDrawsNumbers(question)) return null;
    const value = isObject(response) ? response.value : response;
    return gradeFractionResponse(question, String(value ?? '')).isCorrect === true;
  }
  const graded = gradeOrdinaryResponse({ question, response });
  return graded.graded ? graded.isCorrect === true : null;
};

const assignmentChange = (question, response) => {
  const fields = list(question.answerFields);
  if (fields.length) {
    const values = Object.fromEntries(list(response?.fields).map((field) => [String(field?.id), field?.value]));
    const field = fields.find((entry) => looksLikeMixedNumber(values[entry.id]) || HALF_PI.test(String(values[entry.id] ?? '')))
      || fields.find((entry) => fieldIsNumberBox(entry)) || fields[0];
    return { response: values[field?.id], key: field?.answer ?? field?.expected, field };
  }
  const [text] = responseTexts(response);
  return { response: text, key: question.answer ?? question.solution ?? list(question.acceptedAnswers)[0], field: {} };
};

async function* paged(query, pageSize) {
  let last = null;
  for (;;) {
    let page = query.limit(pageSize);
    if (last) page = page.startAfter(last);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await page.get();
    for (const doc of snapshot.docs) yield doc;
    if (snapshot.docs.length < pageSize) return;
    last = snapshot.docs[snapshot.docs.length - 1];
  }
}

const countAssignments = async ({ db, pageSize, counts, changes }) => {
  const assignments = new Map();
  const assignmentOf = async (id) => {
    if (!assignments.has(id)) {
      assignments.set(id, db.getAll(db.collection('assignments').doc(id), { fieldMask: [...ASSIGNMENT_FIELDS] })
        .then(([snapshot]) => (snapshot?.exists ? snapshot.data() : null)));
    }
    return assignments.get(id);
  };
  // No orderBy: an unfiltered collection-group query already runs in document
  // order and needs no collection-group index (none is declared for it).
  const query = db.collectionGroup('responseInspectionEvidence').select(...EVIDENCE_FIELDS);
  for await (const doc of paged(query, pageSize)) {
    counts.read += 1;
    const match = /^(.*)__q(\d+)$/.exec(doc.id);
    const studentId = doc.ref?.parent?.parent?.id || doc.ref?.path?.split('/')[1] || null;
    const evidence = doc.data()?.evidence;
    const recorded = evidence?.automaticResult?.isCorrect;
    if (!match || !evidence?.submittedResponse || typeof recorded !== 'boolean' || evidence.automaticResult?.graded === false) { counts.notRegradable += 1; continue; }
    const assignmentId = decodeURIComponent(match[1]);
    const questionIndex = Number(match[2]);
    // eslint-disable-next-line no-await-in-loop
    const question = assignmentQuestion(await assignmentOf(assignmentId), questionIndex, evidence);
    let now = null;
    try { now = question ? regradeAssignmentAnswer(question, evidence.submittedResponse) : null; } catch { now = null; }
    if (now === null) { counts.notRegradable += 1; continue; }
    counts.regraded += 1;
    if (now === recorded) { counts.unchanged += 1; continue; }
    const subject = assignmentChange(question, evidence.submittedResponse);
    record(counts, changes, {
      surface: 'assignments', direction: now ? 'up' : 'down', rule: wave7Rule({ ...subject, question }),
      studentId, assignmentId, questionIndex, questionType: clean(question.type) || null,
      response: subject.response ?? null, key: subject.key ?? null, submittedAt: evidence.submittedAt ?? null,
    });
  }
};

const countSecure = async ({ db, pageSize, documentIdField, counts, changes, secureItems }) => {
  const query = db.collection('examSessions').orderBy(documentIdField).select(...EXAM_SESSION_FIELDS);
  for await (const doc of paged(query, pageSize)) {
    const responses = isObject(doc.data()?.responses) ? doc.data().responses : {};
    const ids = Object.keys(responses).filter((id) => !responses[id]?.unanswered);
    if (!ids.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const items = await db.getAll(...ids.map((id) => db.collection('examSessions').doc(doc.id).collection('items').doc(id)), { fieldMask: [...EXAM_ITEM_FIELDS] });
    for (const [index, id] of ids.entries()) {
      counts.read += 1;
      const recordedAnswer = responses[id];
      const recorded = recordedAnswer?.grading?.isCorrect;
      const stored = items[index]?.exists ? items[index].data()?.item : null;
      const privateGrading = stored ? secureItems.readStoredItem(stored)?.privateGrading : null;
      if (typeof recorded !== 'boolean' || !privateGrading || privateGrading.pathToolId || !list(privateGrading.fields).length) { counts.notRegradable += 1; continue; }
      let now;
      // eslint-disable-next-line no-await-in-loop
      try { now = (await secureItems.gradeItem(privateGrading, recordedAnswer.responsePayload || {})).isCorrect === true; } catch { counts.notRegradable += 1; continue; }
      counts.regraded += 1;
      if (now === recorded) { counts.unchanged += 1; continue; }
      const typed = recordedAnswer.responsePayload?.responses || {};
      const field = list(privateGrading.fields).find((entry) => looksLikeMixedNumber(typed[entry.id]) || HALF_PI.test(String(typed[entry.id] ?? '')))
        || list(privateGrading.fields).find((entry) => fieldIsNumberBox(entry)) || privateGrading.fields[0];
      record(counts, changes, {
        surface: 'secure', direction: now ? 'up' : 'down', rule: wave7Rule({ response: typed[field.id], key: field.expected, field }),
        studentId: doc.data()?.studentId || null, examSessionId: doc.id, questionInstanceId: id,
        response: typed[field.id] ?? null, key: field.expected ?? null,
      });
    }
  }
};

/** This tree's verdict on a closing Path attempt from its recap, by the key's display value; null when unusable. */
export const regradePathRecap = (recap) => {
  const typed = list(recap?.response?.entries);
  const keys = list(recap?.correctAnswer);
  if (recap?.response?.kind !== 'fields' || !typed.length || !keys.length || recap?.answerWithheld) return null;
  const byLabel = new Map(typed.map((entry) => [entry.label, entry.value]));
  const pairs = keys.map((entry) => [byLabel.get(entry.label), entry.value, entry]);
  if (pairs.some(([value]) => value === undefined)) return null;
  // No profile is stored: a key that is a pair is compared as one.
  const verdicts = pairs.map(([value, key]) => sameValue(value, key, 0, fieldValueOptions(orderedPairKey(key) && /,/.test(String(key)) ? { inputProfile: 'orderedPair' } : {})));
  return { isCorrect: verdicts.every(Boolean), pairs };
};

const countPath = async ({ db, pageSize, documentIdField, counts, changes }) => {
  const query = db.collection('pathSubmissions').orderBy(documentIdField).select(...PATH_SUBMISSION_FIELDS);
  for await (const doc of paged(query, pageSize)) {
    const data = doc.data() || {};
    if (!data.recapJson) continue;
    counts.read += 1;
    let recap;
    try { recap = JSON.parse(data.recapJson); } catch { counts.notRegradable += 1; continue; }
    const recorded = recap?.grading?.isCorrect;
    const now = typeof recorded === 'boolean' ? regradePathRecap(recap) : null;
    if (!now) { counts.notRegradable += 1; continue; }
    counts.regraded += 1;
    if (now.isCorrect === recorded) { counts.unchanged += 1; continue; }
    const [value, key] = now.pairs.find(([entry]) => looksLikeMixedNumber(entry) || HALF_PI.test(String(entry ?? ''))) || now.pairs[0];
    record(counts, changes, {
      surface: 'path', direction: now.isCorrect ? 'up' : 'down', rule: wave7Rule({ response: value, key }),
      studentId: data.studentId || null, submissionId: doc.id, response: value ?? null, key: key ?? null, createdAt: data.createdAt ?? null,
    });
  }
};

/**
 * Reads and returns the report object. `db` is a Firestore (Admin SDK); only
 * collection/collectionGroup/doc/orderBy/select/limit/startAfter/get and
 * getAll (with a fieldMask) are used.
 */
export const runGraderGaps2RegradeReport = async ({
  db, surfaces = SURFACES, pageSize = PAGE_SIZE, now = () => Date.now(), documentIdField = '__name__', secureItems = null,
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const totals = {};
  const changes = [];
  const run = { assignments: countAssignments, secure: countSecure, path: countPath };
  const secure = secureItems || functionsRequire('./lib/secureItems.js');
  for (const surface of SURFACES.filter((name) => surfaces.includes(name))) {
    totals[surface] = emptyCounts();
    // eslint-disable-next-line no-await-in-loop
    await run[surface]({ db, pageSize, documentIdField, counts: totals[surface], changes, secureItems: secure });
  }
  return {
    tool: 'report-grader-gaps-2-regrade',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    surfaces: Object.keys(totals),
    notCountable: { liveChallenge: 'no response is stored (liveChallengePrivate players hold submission receipts with the verdict only)' },
    notes: [
      'up: recorded wrong, right under this tree. down: recorded right, wrong under this tree — D8: a re-grade never lowers a verdict, so these are listed for the owner and never applied.',
      'assignments: the last counted attempt of each question only (earlier attempts are not stored).',
      'path: the closing attempt only, against the key\'s display value (no accepted forms, no field profile): a lower bound, and number boxes (exactNumber) are not seen.',
      'rule: the wave-7 rule that explains the change; other is an earlier change or a key edited since the answer was recorded.',
    ],
    totals,
    changes,
  };
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/report-grader-gaps-2-regrade.mjs --project <id> [options]

Read-only. Grades recorded answers again with this tree's grader and counts the
verdicts that would change, by surface, direction and wave-7 rule. Writes one
JSON file to ${REPORT_DIR}/ (gitignored).

  --project <id>        Firebase project (Application Default Credentials; a viewer role is enough)
  --surface <name>      assignments, secure or path (repeatable; default all three)
  --page-size <n>       documents per read (default ${PAGE_SIZE})`;

export const parseReportArgs = (argv) => {
  const options = { surfaces: [] };
  const known = ['--project', '--surface', '--page-size'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode and no output option)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    if (arg === '--surface') {
      if (!SURFACES.includes(value)) throw new Error(`--surface must be one of ${SURFACES.join(', ')}`);
      options.surfaces.push(value);
    } else options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  return { help: false, project: options.project, surfaces: options.surfaces.length ? [...new Set(options.surfaces)] : [...SURFACES], pageSize };
};

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `grader-gaps-2-regrade-${startedAt.replace(/[:.]/g, '-')}.json`);

const printCounts = (report) => {
  const add = (label, value) => console.log(`  ${label.padEnd(44)} ${value}`);
  Object.entries(report.totals).forEach(([surface, counts]) => {
    add(`${surface}: answers read`, counts.read);
    add(`${surface}: re-graded`, counts.regraded);
    add(`${surface}: not re-gradable`, counts.notRegradable);
    add(`${surface}: unchanged`, counts.unchanged);
    WAVE7_RULES.forEach((rule) => {
      if (counts.up[rule] || counts.down[rule]) add(`${surface}: ${rule}`, `up ${counts.up[rule]} · down ${counts.down[rule]}`);
    });
  });
  add('liveChallenge', 'not countable (no response is stored)');
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-grader-gaps-2-regrade: ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  let admin;
  try {
    admin = functionsRequire('firebase-admin');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      console.error('report-grader-gaps-2-regrade: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-grader-gaps-2-regrade');
  console.log('Recorded answers the wave-7 grader would mark differently — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runGraderGaps2RegradeReport({
      db: app.firestore(),
      surfaces: options.surfaces,
      pageSize: options.pageSize,
      documentIdField: admin.firestore.FieldPath.documentId(),
    });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
  report.project = options.project;
  report.emulator = emulator;
  const reportPath = reportFilePath(report.startedAt);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log('');
  printCounts(report);
  console.log(`\nDetail (student ids, responses and keys): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-grader-gaps-2-regrade: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
