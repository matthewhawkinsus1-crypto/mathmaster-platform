#!/usr/bin/env node
/*
 * MY MATH PATH MULTIPLE-CHOICE ANSWERS RECORDED WRONG BEFORE HOTFIX #456.
 * A READ-ONLY REPORT. It has no write mode: no --execute, no re-grade, and no
 * Firestore write anywhere in this file (tests/platform/
 * kGrading_pathChoiceIdRegradeReport.test.mjs runs it against a database that
 * throws on any write, and checks the source).
 *
 *   node scripts/report-path-choice-id-regrade.mjs --project <id> --since <date> --until <date> [--out <dir>]
 *
 * --since / --until bound the submissions read (pathSubmissions.createdAt, ms)
 * and are the window the operator vouches for: pre-fix code was serving
 * issueNextQuestion from --since to --until. Give the deploy times, e.g. from
 *   gcloud run revisions list --service issuenextquestion --region us-central1 --project <id>
 * A date alone is midnight UTC. Give the REVISION times, not commit times: a
 * window that ends at a fix commit but before its deploy silently leaves out
 * the answers recorded wrong in between.
 *
 * WINDOW CHECKS. Both are reported, neither writes or lists anything extra.
 *   - Inside: a choice item recorded RIGHT (with a recap or without) is
 *     impossible under the bug, so if one exists the window runs past the fix
 *     (or lies wholly after it, e.g. after the recap of #459, where a non-final
 *     wrong attempt has no recap and would otherwise read as pre-fix): the
 *     report then flags nothing on the window's word alone, and says when that
 *     answer was recorded.
 *   - Outside: a window that starts too late or ends too early is not
 *     contradicted by anything inside it. So the report also reads up to
 *     --probe-days (default 7) before --since and after --until, out to the
 *     nearest choice item recorded right, and counts the choice items
 *     recorded wrong without a recap in between: answers the bug may have
 *     graded that the window leaves out. They are counted, never listed; if
 *     any exist, check the window against the revision history.
 *
 * WHAT IT CAN AND CANNOT SAY. The decisions are scripts/lib/pathChoiceIdRegradePlan.mjs,
 * whose header explains it: no stored record holds the option a pre-fix
 * student clicked, so "would have been right" cannot be decided for any of
 * them. The report lists every answer whose recorded "wrong" carries no
 * information (recorded wrong on a choice item that was served ids the answer
 * key could not match), with the evidence event it wrote and the mastery that
 * event fed, so the owner can decide what to do with them.
 *
 * PRIVACY. Standard output is COUNTS ONLY. The JSON detail lists students by
 * id, never by name (no name is read), and goes to the gitignored
 * path-choice-reports/ unless --out says otherwise.
 *
 * READS. pathSubmissions in the window and up to --probe-days either side of
 * it, paged and projected; for a recorded-wrong answer without a recap, and
 * for a recorded-right one without a recap (the window checks), the session's
 * Path evidence events (projected) and the bank document they name (projected
 * to its response shape); for each listed answer, the student's mastery
 * profile and the evidence's application marker.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PATH_CHOICE_ID_BASIS,
  PATH_CHOICE_ID_CLASS,
  PATH_CHOICE_ID_REASON,
  bankItemChoiceShape,
  isFlaggedPlan,
  planStoredSubmission,
  recapChoiceAnswers,
} from './lib/pathChoiceIdRegradePlan.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin and mathPath live in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const mathPath = functionsRequire('./lib/mathPath.js');
const recapRules = await import('../functions/shared/pathSessionRecap.mjs');

export const REPORT_VERSION = 1;
export const DEFAULT_OUT_DIR = 'path-choice-reports';
export const SUBMISSIONS_COLLECTION = 'pathSubmissions';
export const BANK_COLLECTION = 'pathQuestionBank';
export const PAGE_SIZE = 300;
export const PROBE_DAYS = 7;
const DAY_MS = 864e5;

// Every field read, per collection. Nothing else is fetched.
export const SUBMISSION_FIELDS = Object.freeze(['studentId', 'sessionId', 'submissionId', 'createdAt', 'result.grading', 'recapJson']);
export const EVIDENCE_FIELDS = Object.freeze([
  'eventKey', 'occurredAt', 'alignmentKeys', 'masteryEvidenceKeys',
  'questionSnapshot.questionId', 'questionSnapshot.familyId', 'performance', 'source.kind',
]);
export const BANK_FIELDS = Object.freeze(['responseFields', 'choices', 'variants', 'pathToolId', 'toolId', 'tool.id']);

const USAGE = `Usage: node scripts/report-path-choice-id-regrade.mjs --project <id> --since <date> --until <date> [--out <dir>]

Read-only. Lists My Math Path multiple-choice answers recorded wrong while
issueNextQuestion served double-hashed option ids (before hotfix #456).

  --project <id>   Firebase project (Application Default Credentials; a viewer role is enough)
  --since <date>   start of the pre-fix window (ISO date or date-time; a date is 00:00 UTC)
  --until <date>   end of the window, exclusive: when the hotfix began serving
  --out <dir>      where the JSON detail goes (default ${DEFAULT_OUT_DIR}/, gitignored)
  --page-size <n>  submissions per read (default ${PAGE_SIZE})
  --probe-days <n> how far past each end of the window to look for answers it
                   may leave out (default ${PROBE_DAYS}; 0 turns the check off)`;

const list = (value) => (Array.isArray(value) ? value : []);
const iso = (ms) => (Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString() : null);

export const parseDate = (value, flag) => {
  const raw = String(value || '').trim();
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00Z`) : Date.parse(raw);
  if (!raw || !Number.isFinite(ms)) throw new Error(`${flag} needs a date (2026-10-07 or 2026-10-07T21:15:00Z), got "${raw}"`);
  return ms;
};

export const parseReportArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    const known = ['--project', '--since', '--until', '--out', '--page-size', '--probe-days'];
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  if (!options.since || !options.until) throw new Error('--since and --until are required: the window pre-fix code was serving');
  const since = parseDate(options.since, '--since');
  const until = parseDate(options.until, '--until');
  if (since >= until) throw new Error('--since must be before --until');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error('--page-size must be 1–1000');
  const probeDays = options['probe-days'] !== undefined ? Number(options['probe-days']) : PROBE_DAYS;
  if (!Number.isFinite(probeDays) || probeDays < 0 || probeDays > 60) throw new Error('--probe-days must be 0–60');
  return { help: false, project: options.project, since, until, outDir: options.out || null, pageSize, probeDays };
};

// --- reads ------------------------------------------------------------------

async function* submissionsInWindow(db, { since, until, pageSize, direction = 'asc' }) {
  let last = null;
  for (;;) {
    let query = db.collection(SUBMISSIONS_COLLECTION)
      .where('createdAt', '>=', since)
      .where('createdAt', '<', until)
      .orderBy('createdAt', direction)
      .select(...SUBMISSION_FIELDS)
      .limit(pageSize);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    for (const doc of page.docs) yield doc;
    if (page.docs.length < pageSize) return;
    last = page.docs[page.docs.length - 1];
  }
}

// One read per session, shared by every submission in it.
const evidenceReader = (db) => {
  const cache = new Map();
  return (studentId, sessionId) => {
    const key = `${studentId}\u0000${sessionId}`;
    if (!cache.has(key)) {
      cache.set(key, db.collection('grades').doc(studentId).collection('evidenceEvents')
        .where('source.activitySessionId', '==', sessionId)
        .select(...EVIDENCE_FIELDS)
        .get()
        .then((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, path: doc.ref?.path || `grades/${studentId}/evidenceEvents/${doc.id}`, ...doc.data() }))));
    }
    return cache.get(key);
  };
};

const bankReader = (db) => {
  const cache = new Map();
  return (questionId) => {
    if (!questionId) return Promise.resolve(null);
    if (!cache.has(questionId)) {
      cache.set(questionId, db.getAll(db.collection(BANK_COLLECTION).doc(questionId), { fieldMask: [...BANK_FIELDS] })
        .then(([snapshot]) => (snapshot?.exists ? snapshot.data() : null)));
    }
    return cache.get(questionId);
  };
};

/**
 * The evidence event a submission wrote: same transaction, same `now`, so its
 * occurredAt equals the submission's createdAt; the attempt number agrees.
 */
export const matchEvidenceEvent = (events, submission) => {
  const createdAt = Number(submission?.createdAt);
  const attempt = Number(submission?.result?.grading?.attemptNumber);
  const matches = list(events).filter((event) => Number(event.occurredAt) === createdAt
    && event.source?.kind === 'myMathPath'
    && (!Number.isFinite(attempt) || Number(event.performance?.attemptNumber) === attempt));
  return matches.length === 1 ? matches[0] : null;
};

const displaySkill = (event, recapEntry) => (
  recapEntry?.skillCode
  || mathPath.displayAlignmentKey(list(event?.alignmentKeys)[0] || '')
  || null
);

/**
 * What one stored submission says about its item: whether it is a choice
 * item ('choice', 'not-choice' or 'unknown'), from the recap when there is
 * one, else from the bank document its evidence event names.
 */
const itemFacts = async ({ submission, recapEntry, evidenceFor, bankFor }) => {
  const studentId = String(submission.studentId || '');
  const sessionId = String(submission.sessionId || '');
  if (recapEntry) {
    const recap = recapChoiceAnswers(recapEntry);
    const shape = !recap || recap.shed ? 'unknown' : (recap.choiceFieldIds.length ? 'choice' : 'not-choice');
    return { event: null, bankDoc: null, evidenceFound: false, shape };
  }
  if (!studentId || !sessionId) return { event: null, bankDoc: null, evidenceFound: false, shape: 'unknown' };
  const event = matchEvidenceEvent(await evidenceFor(studentId, sessionId), submission);
  const bankDoc = event ? await bankFor(event.questionSnapshot?.questionId || null) : null;
  return { event, bankDoc, evidenceFound: Boolean(event), shape: event ? bankItemChoiceShape(bankDoc) : 'unknown' };
};

/**
 * Reads outward from one end of the window, nearest first, up to `spanMs`,
 * and stops at the first choice item recorded right (the grader worked then).
 * Counts the choice items recorded wrong WITHOUT a recap before that point:
 * answers the bug may have graded that the window leaves out.
 */
const probeOutsideWindow = async ({ db, side, edge, spanMs, pageSize, evidenceFor, bankFor }) => {
  const result = { probedTo: null, recordedRightChoiceAt: null, recordedWrongChoiceWithoutRecap: 0, submissions: [] };
  if (!(spanMs > 0)) return result;
  const range = side === 'before'
    ? { since: edge - spanMs, until: edge, direction: 'desc' }
    : { since: edge, until: edge + spanMs, direction: 'asc' };
  result.probedTo = iso(side === 'before' ? range.since : range.until);
  for await (const doc of submissionsInWindow(db, { ...range, pageSize })) {
    const submission = doc.data() || {};
    const recapEntry = recapRules.parsePathRecapEntry(submission.recapJson);
    const recorded = submission.result?.grading?.isCorrect;
    if (recorded !== true && (recorded !== false || recapEntry)) continue;
    const { shape } = await itemFacts({ submission, recapEntry, evidenceFor, bankFor });
    if (shape !== 'choice') continue;
    if (recorded === true) {
      result.recordedRightChoiceAt = iso(submission.createdAt);
      break;
    }
    result.recordedWrongChoiceWithoutRecap += 1;
    // Ids only, for the JSON detail; stdout gets the count.
    result.submissions.push({ submissionDocId: doc.id, studentId: String(submission.studentId || ''), submittedAt: iso(submission.createdAt) });
  }
  return result;
};

// --- the report ---------------------------------------------------------------

/**
 * Reads, classifies and returns the report object. `db` is a Firestore (Admin
 * SDK); only collection/doc/where/orderBy/select/limit/startAfter/get and
 * getAll are used.
 */
export const runPathChoiceIdRegradeReport = async ({
  db, since, until, pageSize = PAGE_SIZE, probeDays = PROBE_DAYS, now = () => Date.now(),
}) => {
  const startedAt = new Date(now()).toISOString();
  const evidenceFor = evidenceReader(db);
  const bankFor = bankReader(db);

  const counts = {
    scanned: 0,
    byClass: Object.fromEntries(Object.values(PATH_CHOICE_ID_CLASS).map((value) => [value, 0])),
    undeterminableByReason: {},
    flagged: 0,
    flaggedByBasis: Object.fromEntries(Object.values(PATH_CHOICE_ID_BASIS).map((value) => [value, 0])),
    studentsFlagged: 0,
    withRecap: 0,
  };
  const candidates = [];
  const windowContradictions = [];

  for await (const doc of submissionsInWindow(db, { since, until, pageSize })) {
    counts.scanned += 1;
    const submission = doc.data() || {};
    const recapEntry = recapRules.parsePathRecapEntry(submission.recapJson);
    if (recapEntry) counts.withRecap += 1;
    const recorded = submission.result?.grading?.isCorrect;
    const studentId = String(submission.studentId || '');
    const sessionId = String(submission.sessionId || '');

    // The item is needed when the recap cannot answer (a wrong answer without
    // one), and for every right one (the window check: under the bug no
    // choice item could be recorded right, recap or not).
    let event = null;
    let bankDoc = null;
    let evidenceFound = false;
    const needsItem = (!recapEntry && studentId && sessionId && recorded === false) || recorded === true;
    if (needsItem) {
      const facts = await itemFacts({ submission, recapEntry, evidenceFor, bankFor });
      ({ event, bankDoc, evidenceFound } = facts);
      if (recorded === true && facts.shape === 'choice') {
        windowContradictions.push({ submissionDocId: doc.id, submittedAt: iso(submission.createdAt) });
      }
    }

    const plan = planStoredSubmission({ submission, recapEntry, bankDoc, evidenceFound, gradedBeforeFix: true });
    candidates.push({ doc, submission, recapEntry, event, plan });
  }

  // A recorded-right choice item inside the window disproves the window, so
  // nothing is flagged on its word: fail closed.
  const windowHolds = windowContradictions.length === 0;
  const flagged = [];
  for (const candidate of candidates) {
    let { plan } = candidate;
    if (!windowHolds && plan.basis === PATH_CHOICE_ID_BASIS.GRADED_BEFORE_FIX) {
      plan = { classification: PATH_CHOICE_ID_CLASS.UNDETERMINABLE, reason: PATH_CHOICE_ID_REASON.WINDOW_CONTRADICTED, basis: null };
    }
    counts.byClass[plan.classification] += 1;
    if (plan.classification === PATH_CHOICE_ID_CLASS.UNDETERMINABLE) {
      counts.undeterminableByReason[plan.reason] = (counts.undeterminableByReason[plan.reason] || 0) + 1;
    }
    if (!isFlaggedPlan(plan)) continue;
    counts.flagged += 1;
    if (plan.basis) counts.flaggedByBasis[plan.basis] += 1;
    const { doc, submission, recapEntry } = candidate;
    // A recap-based flag has not looked its evidence up yet.
    const event = candidate.event
      || matchEvidenceEvent(await evidenceFor(String(submission.studentId), String(submission.sessionId)), submission);
    flagged.push({
      studentId: String(submission.studentId || ''),
      skill: displaySkill(event, recapEntry),
      submittedAt: iso(submission.createdAt),
      submissionDocId: doc.id,
      sessionId: String(submission.sessionId || ''),
      questionInstanceId: recapEntry?.questionInstanceId || null,
      questionId: event?.questionSnapshot?.questionId || null,
      attemptNumber: submission.result?.grading?.attemptNumber ?? null,
      questionFinalized: submission.result?.grading?.questionFinalized ?? null,
      classification: plan.classification,
      reason: plan.reason,
      basis: plan.basis,
      fieldIds: plan.fieldIds || null,
      evidence: event ? {
        path: event.path,
        eventKey: event.eventKey || event.id,
        alignmentKeys: list(event.masteryEvidenceKeys).length ? event.masteryEvidenceKeys : list(event.alignmentKeys),
        isCorrect: event.performance?.isCorrect ?? null,
        score: event.performance?.score ?? null,
        status: event.performance?.status ?? null,
        isMathematicallyIndependent: event.performance?.isMathematicallyIndependent ?? null,
      } : null,
      mastery: null,
    });
  }

  // The mastery each listed evidence event fed: whether the trigger applied it
  // (its idempotency marker exists) and the profile's current state for each
  // skill it names.
  const profiles = new Map();
  for (const entry of flagged) {
    if (!entry.evidence) continue;
    if (!profiles.has(entry.studentId)) {
      const [snapshot] = await db.getAll(db.collection('studentMasteryProfiles').doc(entry.studentId), { fieldMask: ['profiles'] });
      profiles.set(entry.studentId, snapshot?.exists ? (snapshot.data()?.profiles || {}) : null);
    }
    const markerId = mathPath.opaqueId('mastery', entry.studentId, entry.evidence.eventKey);
    const [marker] = await db.getAll(db.collection('masteryEvidenceApplications').doc(markerId), { fieldMask: ['appliedAt'] });
    const studentProfiles = profiles.get(entry.studentId);
    const codes = [...new Set(entry.evidence.alignmentKeys.map((key) => mathPath.displayAlignmentKey(mathPath.canonicalAlignmentKey(key))))];
    entry.mastery = {
      profilePath: `studentMasteryProfiles/${entry.studentId}`,
      applied: Boolean(marker?.exists),
      appliedAt: iso(marker?.exists ? marker.data()?.appliedAt : null),
      current: Object.fromEntries(codes.map((code) => {
        const mastery = studentProfiles?.[code]?.mastery;
        return [code, mastery ? { estimate: mastery.estimate ?? null, status: mastery.status ?? null, confidence: mastery.confidence ?? null } : null];
      })),
    };
  }
  counts.studentsFlagged = new Set(flagged.map((entry) => entry.studentId)).size;

  const probe = { db, spanMs: probeDays * DAY_MS, pageSize, evidenceFor, bankFor };
  const beforeSince = await probeOutsideWindow({ ...probe, side: 'before', edge: since });
  const afterUntil = await probeOutsideWindow({ ...probe, side: 'after', edge: until });

  return {
    tool: 'report-path-choice-id-regrade',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    window: { since: iso(since), until: iso(until) },
    windowCheck: {
      holds: windowHolds,
      choiceItemsRecordedRight: windowContradictions.length,
      latestRecordedRightAt: windowContradictions.map((entry) => entry.submittedAt).sort().at(-1) || null,
      earliestRecordedRightAt: windowContradictions.map((entry) => entry.submittedAt).sort()[0] || null,
      // Not listed, only counted: see WINDOW CHECKS above.
      beforeSince,
      afterUntil,
    },
    counts,
    notes: [
      'would-be-correct cannot be decided from stored data: pathSubmissions never stored the response, and a recap keeps only an answer that matched a stored option.',
      'Each listed answer was recorded wrong on a choice item whose served option ids the answer key could not match; which option the student picked was never stored.',
      'Bank documents are read as they are today.',
    ],
    flagged,
  };
};

// --- CLI ----------------------------------------------------------------------

const printCounts = (report) => {
  const lines = [];
  const add = (label, value) => lines.push(`  ${label.padEnd(60)} ${value}`);
  const { counts } = report;
  add('submissions in the window', counts.scanned);
  add('  with a recap entry', counts.withRecap);
  Object.entries(counts.byClass).forEach(([name, value]) => add(name, value));
  Object.entries(counts.undeterminableByReason).forEach(([name, value]) => add(`  undeterminable: ${name}`, value));
  add('LISTED: recorded wrong, verdict void, option not stored', counts.flagged);
  Object.entries(counts.flaggedByBasis).forEach(([name, value]) => add(`  basis: ${name}`, value));
  add('students with a listed answer', counts.studentsFlagged);
  console.log(lines.join('\n'));
  if (!report.windowCheck.holds) {
    console.log(`\nThe window does not hold: ${report.windowCheck.choiceItemsRecordedRight} choice answer(s) were recorded RIGHT`
      + ` inside it (latest ${report.windowCheck.latestRecordedRightAt}), which the bug made impossible.`
      + '\nNothing is listed on the window alone. Re-run with --since/--until set to the deploy times of the double-hashing code and the hotfix.');
  }
  const outside = [
    ['before --since', report.windowCheck.beforeSince, 'last'],
    ['after --until', report.windowCheck.afterUntil, 'first'],
  ];
  for (const [label, probe, which] of outside) {
    if (!probe.recordedWrongChoiceWithoutRecap) continue;
    console.log(`\nWindow edge: ${probe.recordedWrongChoiceWithoutRecap} choice answer(s) were recorded wrong without a recap ${label},`
      + ` and no choice answer was recorded right in between (${which} right one: ${probe.recordedRightChoiceAt || `none up to ${probe.probedTo}`}).`
      + '\nThey are NOT listed. If the double-hashing code was still serving then, widen the window to the revision times.');
  }
};

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-path-choice-id-regrade: ${error.message}\n\n${USAGE}`);
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
      console.error('report-path-choice-id-regrade: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-path-choice-id-regrade');
  console.log('My Math Path choice-id report — READ ONLY (nothing is written)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  console.log(`  window:  ${iso(options.since)} .. ${iso(options.until)}`);

  let report;
  try {
    report = await runPathChoiceIdRegradeReport({
      db: app.firestore(), since: options.since, until: options.until, pageSize: options.pageSize, probeDays: options.probeDays,
    });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
  report.project = options.project;
  report.emulator = emulator;

  const outDir = path.resolve(options.outDir || path.join(repoRoot, DEFAULT_OUT_DIR));
  const reportPath = path.join(outDir, `path-choice-id-${report.startedAt.replace(/[:.]/g, '-')}.json`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const insideRepo = !path.relative(repoRoot, reportPath).startsWith('..');
  const insideIgnored = !path.relative(path.join(repoRoot, DEFAULT_OUT_DIR), reportPath).startsWith('..');
  if (insideRepo && !insideIgnored) {
    console.error(`\nWARNING: ${reportPath} lists student ids and is inside the repository but outside the gitignored ${DEFAULT_OUT_DIR}/. Move it before anything is committed.`);
  }

  console.log('');
  printCounts(report);
  console.log(`\nDetail (student ids, no names): ${path.relative(process.cwd(), reportPath) || reportPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-path-choice-id-regrade: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
