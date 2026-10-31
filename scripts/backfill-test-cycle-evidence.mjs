#!/usr/bin/env node
/*
 * GIVE PAST TESTS THE MISTAKE EVIDENCE THEY WERE GRADED WITHOUT (TC13; C2-110).
 *
 * *** NOT RUN. *** Written, unit-tested and exercised against the Firestore
 * emulator only. It has not been pointed at any real project, and its default is
 * a READ-ONLY REPORT: run that first, read it, and only then decide whether to
 * pass --execute.
 *
 * From the W7-6 deploy on, a secure Test or Retest response that is a graded miss
 * records the mistake its work proves (`grading.misconceptionEvidence`). A Test
 * graded before that has none, so a student in Corrections on it reads the
 * generic line and a teacher reads no pattern. This finds those responses,
 * asks the server's own diagnosis (the one secureExamItems.missEvidenceOf asks)
 * of the issued item the session still holds and the work the student submitted,
 * and reports what would be named. With --execute it writes that, and refreshes
 * the diagnosis of the targets of a Corrections plan that is still open, exactly
 * as buildCorrectionPlan would have named them.
 *
 *   node scripts/backfill-test-cycle-evidence.mjs --project <id>             # REPORT (the default): reads, writes nothing
 *   node scripts/backfill-test-cycle-evidence.mjs --project <id> --execute   # writes (asks for the project id again)
 *   node scripts/backfill-test-cycle-evidence.mjs --project <id> --assignment <assignmentId> --limit 20
 *
 * WHAT IT NEVER DOES. It never changes a score, a verdict or a grade: a response
 * is touched only if the grader as it is today ALSO marks it a miss, and the only
 * thing added to it is the provenance block. It never touches a plan's progress,
 * tries, evidence references or forbidden instances, and a complete plan is left
 * alone unless --include-complete is given. It does not write class sittings:
 * what a sitting records is the day's bell-schedule times, which for a past day
 * may be exactly what has changed (the report counts the days instead). It needs
 * no new index and no Functions or rules deploy.
 *
 * Idempotent: a response that already carries evidence is skipped, a plan target
 * that already names a mistake is skipped, so a second run writes nothing. Each
 * session is re-read and re-planned inside the transaction that writes it, so a
 * release or a correction landing meanwhile is never overwritten, and one
 * session's failure is reported without stopping the run.
 *
 * PRIVACY. Standard output is counts only; the JSON report (release-reports/,
 * gitignored) lists session, student and assignment ids and codes, never names.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  BACKFILL_STAGES,
  evidenceCandidateIds,
  planPlanRefresh,
  planSessionEvidence,
  sessionIsCandidate,
  sittingIdSeen,
  withPlannedEvidence,
} from './lib/testCycleEvidenceBackfill.mjs';
import { pathMisconceptionEvidence } from '../functions/shared/correctionMissDiagnosis.mjs';
import { SCHOOL_TIME_ZONE } from '../functions/shared/sectionDeadline.mjs';
import { TEST_CYCLE_CLASS_SITTINGS } from '../functions/shared/testCycleAvailability.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

const SESSIONS = 'examSessions';
const PLANS = 'testCycleCorrectionPlans';

export const USAGE = `Usage:
  node scripts/backfill-test-cycle-evidence.mjs --project <id> [--execute] [--yes] [--assignment <id>] [--stage test|retest|both] [--include-complete] [--limit <n>] [--report <path>]

  --project <id>        Firebase project (required; there is no default)
  --execute             write what the report lists (default: a read-only report, nothing is written)
  --yes                 skip the typed project id; refused unless FIRESTORE_EMULATOR_HOST is set
  --assignment <id>     only this assignment's sessions
  --stage <which>       test, retest or both (default both)
  --include-complete    also refresh Corrections plans that are already finished (default: open plans only)
  --limit <n>           stop after n sessions (a trial run)
  --report <path>       where to write the JSON report (default release-reports/)`;

export const parseArgs = (argv = [], env = process.env) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}. See --help.`);
    const name = arg.slice(2);
    if (['execute', 'yes', 'include-complete', 'help'].includes(name)) options[name] = true;
    else if (['project', 'assignment', 'stage', 'limit', 'report'].includes(name)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value.`);
      options[name] = value;
      index += 1;
    } else throw new Error(`Unknown option --${name}. See --help.`);
  }
  if (options.help) return { help: true };
  if (!options.project) throw new Error('--project <id> is required. Nothing has been read.');
  if (options.yes && !options.execute) throw new Error('--yes only makes sense with --execute.');
  if (options.yes && !env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('refusing --yes: it skips the typed project id, which is allowed only against the Firestore emulator (FIRESTORE_EMULATOR_HOST). Against a real project, type the id.');
  }
  const stage = options.stage || 'both';
  if (!['test', 'retest', 'both'].includes(stage)) throw new Error('--stage must be test, retest or both.');
  return {
    help: false,
    project: options.project,
    execute: Boolean(options.execute),
    yes: Boolean(options.yes),
    assignment: options.assignment || null,
    stages: stage === 'both' ? [...BACKFILL_STAGES] : [stage],
    includeComplete: Boolean(options['include-complete']),
    limit: options.limit ? Math.max(1, Number.parseInt(options.limit, 10) || 1) : null,
    reportPath: options.report || null,
  };
};

/** The server's own functions, so the plan is the server's answer to the same question. */
export const serverDeps = () => {
  const secureItems = functionsRequire('./lib/secureItems.js');
  return {
    gradeIssuedItem: secureItems.gradeIssuedItem,
    readStoredItem: secureItems.readStoredItem,
    rawWorkOf: secureItems.rawWorkOf,
    pathMisconceptionEvidence,
  };
};

const ITEMS = () => functionsRequire('./lib/secureExamNavigation.js').ITEMS_SUBCOLLECTION;

const chunk = (values, size) => {
  const groups = [];
  for (let start = 0; start < values.length; start += size) groups.push(values.slice(start, start + size));
  return groups;
};

/** The issued items of a session, by question instance id (`getAll` may be a transaction's). */
const readItems = async (db, getAll, sessionId, questionInstanceIds) => {
  const byId = new Map();
  for (const ids of chunk(questionInstanceIds, 100)) {
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await getAll(...ids.map((id) => db.collection(SESSIONS).doc(sessionId).collection(ITEMS()).doc(id)));
    snapshots.forEach((snapshot, index) => { if (snapshot.exists) byId.set(ids[index], snapshot.data() || {}); });
  }
  return byId;
};

const planOne = async ({ db, getAll, readPlan, sessionId, session, deps, includeComplete }) => {
  const itemsById = await readItems(db, getAll, sessionId, evidenceCandidateIds(session));
  const evidence = await planSessionEvidence({ session, itemsById, deps });
  let refresh = { plan: null, changes: [], skipped: 'notATest' };
  const planId = String(session.courseTest?.recordId || '').trim();
  if (session.courseTest?.cycleStage === 'test' && planId) {
    const planSnapshot = await readPlan(planId);
    refresh = planSnapshot.exists
      ? planPlanRefresh({ planDocument: planSnapshot.data(), session: withPlannedEvidence(session, evidence.updates), includeComplete })
      : { plan: null, changes: [], skipped: 'noPlan' };
  }
  return { evidence, refresh, planId };
};

const emptyCounts = () => ({
  sessionsScanned: 0,
  sessionsOutOfScope: 0,
  responses: 0,
  alreadyNamed: 0,
  correct: 0,
  unanswered: 0,
  itemMissing: 0,
  graderDisagrees: 0,
  nothingProved: 0,
  failed: 0,
  wouldName: 0,
  sessionsToWrite: 0,
  plansToRefresh: 0,
  targetsToName: 0,
  planSkippedComplete: 0,
  sittingDays: 0,
  sittingDaysRecorded: 0,
  sittingDaysNotRecorded: 0,
  written: 0,
  plansRefreshed: 0,
});

export const runEvidenceBackfill = async ({
  db, FieldPath, deps = serverDeps(), execute = false, assignment = null, stages = BACKFILL_STAGES,
  includeComplete = false, limit = null, confirm = null, log = () => {}, now = Date.now(), timeZone = SCHOOL_TIME_ZONE,
}) => {
  const report = {
    startedAt: new Date(now).toISOString(),
    mode: execute ? 'execute' : 'report',
    options: { assignment, stages, includeComplete, limit },
    counts: emptyCounts(),
    codes: {},
    sessions: [],
    note: 'Class sittings are counted, never written: what one records is the day\'s bell-schedule times, which may be what changed.',
  };
  const { counts } = report;

  // Light first: which course-test sessions exist, without their answers.
  const listing = assignment
    ? db.collection(SESSIONS).where('courseTest.assignmentId', '==', assignment)
    : db.collection(SESSIONS).where('examType', '==', 'courseTest');
  const everyCourseSession = (await listing.select('status', 'examType', 'courseTest').get()).docs;
  const listed = everyCourseSession.filter((doc) => sessionIsCandidate(doc.data(), { stages }));
  counts.sessionsOutOfScope = everyCourseSession.length - listed.length;
  const targets = listed.slice(0, limit || listed.length);
  const sittingDays = new Set();
  const toWrite = [];

  for (const group of chunk(targets, 25)) {
    // eslint-disable-next-line no-await-in-loop
    const docs = await db.getAll(...group.map((doc) => doc.ref));
    for (const doc of docs) {
      if (!doc.exists) continue;
      const session = doc.data() || {};
      counts.sessionsScanned += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        const { evidence, refresh, planId } = await planOne({
          db, getAll: (...refs) => db.getAll(...refs), readPlan: (id) => db.collection(PLANS).doc(id).get(), sessionId: doc.id, session, deps, includeComplete,
        });
        Object.entries(evidence.counts).forEach(([key, value]) => { if (key in counts) counts[key] += value; });
        evidence.updates.forEach((update) => update.codes.forEach((code) => { report.codes[code] = (report.codes[code] || 0) + 1; }));
        if (refresh.skipped === 'complete') counts.planSkippedComplete += 1;
        if (session.courseTest?.cycleStage === 'test') {
          const sittingId = sittingIdSeen(session, { timeZone });
          if (sittingId) sittingDays.add(sittingId);
        }
        if (evidence.updates.length || refresh.changes.length) {
          counts.sessionsToWrite += 1;
          counts.plansToRefresh += refresh.changes.length ? 1 : 0;
          counts.targetsToName += refresh.changes.length;
          report.sessions.push({
            examSessionId: doc.id,
            studentId: session.studentId || null,
            assignmentId: session.courseTest?.assignmentId || null,
            stage: session.courseTest?.cycleStage || null,
            namedResponses: evidence.updates.length,
            codes: [...new Set(evidence.updates.flatMap((update) => update.codes))],
            targetsToName: refresh.changes.map((change) => ({ correctionId: change.correctionId, code: change.code })),
          });
          toWrite.push({ sessionId: doc.id, planId });
        }
      } catch (error) {
        counts.failed += 1;
        report.sessions.push({ examSessionId: doc.id, action: 'failed', stage: 'plan', message: String(error?.message || error).slice(0, 300) });
      }
    }
  }

  // The days a class sat the Test, against the sittings recorded for them.
  const sittingIds = [...sittingDays];
  for (const ids of chunk(sittingIds, 100)) {
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await db.getAll(...ids.map((id) => db.collection(TEST_CYCLE_CLASS_SITTINGS).doc(id)));
    snapshots.forEach((snapshot) => { counts.sittingDays += 1; counts[snapshot.exists ? 'sittingDaysRecorded' : 'sittingDaysNotRecorded'] += 1; });
  }

  log(`${counts.sessionsScanned} finished Test/Retest sessions read; ${counts.wouldName} responses would be named in ${counts.sessionsToWrite} sessions; ${counts.targetsToName} Corrections targets would name a mistake.`);
  if (!execute || !toWrite.length) return report;
  if (confirm && !(await confirm(counts))) { report.aborted = true; return report; }

  for (const { sessionId, planId } of toWrite) {
    const sessionRef = db.collection(SESSIONS).doc(sessionId);
    try {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await db.runTransaction(async (transaction) => {
        // Everything re-read and re-planned inside the transaction: the session
        // and plan as they are now, so a release or a correction that landed
        // since the report is never overwritten.
        const [sessionSnapshot] = await transaction.getAll(sessionRef);
        if (!sessionSnapshot.exists) return { written: 0, refreshed: 0 };
        const session = sessionSnapshot.data() || {};
        const planRef = planId ? db.collection(PLANS).doc(planId) : null;
        const { evidence, refresh } = await planOne({
          db, getAll: (...refs) => transaction.getAll(...refs), readPlan: (id) => transaction.get(db.collection(PLANS).doc(id)), sessionId, session, deps, includeComplete,
        });
        const fields = [];
        evidence.updates.forEach((update) => fields.push(new FieldPath('responses', update.questionInstanceId, 'grading', 'misconceptionEvidence'), update.evidence));
        if (fields.length) transaction.update(sessionRef, ...fields, 'evidenceBackfilledAt', now);
        if (refresh.plan && planRef) transaction.update(planRef, { plan: refresh.plan, evidenceBackfilledAt: now });
        return { written: evidence.updates.length ? 1 : 0, refreshed: refresh.plan ? 1 : 0 };
      });
      counts.written += outcome.written;
      counts.plansRefreshed += outcome.refreshed;
    } catch (error) {
      // One session never stops the run, and the report is still written.
      counts.failed += 1;
      report.sessions.push({ examSessionId: sessionId, action: 'failed', stage: 'write', message: String(error?.message || error).slice(0, 300) });
    }
  }
  return report;
};

const askLine = (question) => new Promise((resolve) => {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  let settled = false;
  const finish = (answer) => { if (!settled) { settled = true; prompt.close(); resolve(answer); } };
  prompt.on('close', () => finish(''));
  prompt.question(question).then(finish, () => finish(''));
});

const main = async () => {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`backfill-test-cycle-evidence: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) { console.log(USAGE); return; }
  const admin = functionsRequire('firebase-admin');
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  const app = admin.initializeApp({ projectId: options.project }, 'backfill-test-cycle-evidence');
  console.log(`Test Cycle evidence backfill — ${options.execute ? 'EXECUTE' : 'REPORT (read-only; nothing is written)'}`);
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  const confirm = options.execute && !options.yes
    ? async (counts) => {
      console.log(`\n  ${counts.wouldName} responses in ${counts.sessionsToWrite} sessions will be named; ${counts.targetsToName} Corrections targets will change.`);
      const answer = await askLine(`Type the project id to write to ${options.project}: `);
      return answer.trim() === options.project;
    }
    : null;
  let report;
  try {
    report = await runEvidenceBackfill({
      db: app.firestore(), FieldPath: admin.firestore.FieldPath, ...options, confirm, log: (line) => console.log(`  ${line}`),
    });
  } finally {
    await app.delete().catch(() => {});
  }
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const reportPath = options.reportPath ? path.resolve(options.reportPath) : path.join(repoRoot, 'release-reports', `test-cycle-evidence-${report.mode}-${stamp}.json`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({ ...report, project: options.project, emulator }, null, 2)}\n`);
  console.log('');
  Object.entries(report.counts).forEach(([key, value]) => console.log(`  ${key.padEnd(24)} ${value}`));
  if (Object.keys(report.codes).length) {
    console.log('  by mistake:');
    Object.entries(report.codes).sort((a, b) => b[1] - a[1]).forEach(([code, n]) => console.log(`    ${code.padEnd(40)} ${n}`));
  }
  if (report.aborted) console.log('Not confirmed; nothing was written.');
  console.log(`Report: ${reportPath}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
