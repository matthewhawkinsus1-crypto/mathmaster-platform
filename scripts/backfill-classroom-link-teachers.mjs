#!/usr/bin/env node
/*
 * STAMP THE TEACHER ON GOOGLE CLASSROOM PUBLICATIONS THAT RECORD NONE (#545).
 *
 * *** NOT RUN. *** Written for the owner to run. Its planning logic is
 * unit-tested (scripts/lib/classroomLinkTeacherBackfill.mjs,
 * tests/tools/classroomLinkTeacherBackfill.test.mjs); the script itself has
 * never been run, against the emulator or any real project. Its default is a
 * READ-ONLY REPORT: run that first, read it, and only then decide whether to
 * pass --execute.
 *
 * A classroomLinks document records the teacher whose Google account made the
 * post (`teacherUid`). Links from before Classroom V2 (Aug 17, 2026) record
 * none. Since #545 such a link is shown and acted on only for the root
 * administrator and its assignment's teacher, and the lists ("Published
 * assignments", the grade passback monitor) read each teacher's links by
 * `teacherUid`, so they list it for nobody. This stamps, on each such link,
 * the teacher of record its assignment's classes share, as the uid their
 * account signs in with (teacherDirectory). The report says how many links
 * record no teacher at all: on Nov 11, 2026 every one of the 488 links carried
 * `gradePassbackEnabled`, which every writer has stored in the same record as
 * `teacherUid` since Aug 17, so the likely answer is none.
 *
 *   node scripts/backfill-classroom-link-teachers.mjs --project <id>                                # REPORT (the default): reads, writes nothing
 *   node scripts/backfill-classroom-link-teachers.mjs --project <id> --execute                      # stamps the "stamp" links (asks for the project id again)
 *   node scripts/backfill-classroom-link-teachers.mjs --project <id> --execute --include-review     # and the "review" ones
 *
 * WHAT IT READS. Every classroomLinks document once, four fields of each, a
 * page at a time. Then, for the links that record no teacher only: their
 * assignments' class ids, those classes' teacher of record, those teachers'
 * uids, and who took over the original shared Google connection
 * (teacherIntegrations/default's `migratedToUid`; never its tokens).
 *
 * WHAT IT WRITES, with --execute: on a link that records no teacher,
 * `teacherUid` and two provenance fields, nothing else. A link is stamped only
 * when every class its assignment is assigned to has the same teacher of
 * record and that teacher has signed in. By default only when its grades keep
 * going through the same Google connection (see the lib for why); the others
 * are listed for review. Every other link is left as it is: still the
 * administrator's and its assignment's teacher's, not listed.
 *
 * Idempotent: a link that records a teacher is never written, so a second run
 * writes nothing. Each link is re-read and re-planned inside the transaction
 * that writes it, so a publish or a class change landing meanwhile is never
 * overwritten, and one link's failure is reported without stopping the run.
 * No index, rules or Functions deploy is needed.
 *
 * Undo: every stamped link carries `teacherUidBackfilledAt`; deleting
 * `teacherUid` and the two provenance fields from those links restores them.
 *
 * PRIVACY. Standard output is counts only; the JSON report (release-reports/,
 * gitignored) lists link, assignment and course ids and teacher uids, never
 * names or email addresses.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  USAGE,
  assignedClassIds,
  isWritten,
  linkTeacherUid,
  parseArgs,
  planLinkTeacher,
  stampFields,
  stillStamp,
} from './lib/classroomLinkTeacherBackfill.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

const LINKS = 'classroomLinks';
const ORIGINAL_CONNECTION = 'teacherIntegrations/default';
const PAGE_SIZE = 500;
const GET_ALL_BATCH = 100;

const text = (value) => String(value ?? '').trim();
const unique = (values) => [...new Set(values)];
const chunk = (values, size) => {
  const groups = [];
  for (let start = 0; start < values.length; start += size) groups.push(values.slice(start, start + size));
  return groups;
};

/** Every link, four fields of each, in document-id order. */
async function scanLinks(db, FieldPath) {
  const base = db.collection(LINKS)
    .select('teacherUid', 'assignmentId', 'courseId', 'status')
    .orderBy(FieldPath.documentId())
    .limit(PAGE_SIZE);
  const docs = [];
  let cursor = null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await (cursor ? base.startAfter(cursor) : base).get();
    docs.push(...snapshot.docs);
    if (snapshot.docs.length < PAGE_SIZE) return docs;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
}

/**
 * What planning `links` needs, read through `getAll` (the database's, or a
 * transaction's): their assignments, those classes, the teachers' uids, and
 * the original connection.
 */
async function readPlanInputs(db, getAll, links) {
  const read = async (refs, fieldMask) => {
    const snapshots = [];
    for (const group of chunk(refs, GET_ALL_BATCH)) {
      // eslint-disable-next-line no-await-in-loop
      snapshots.push(...await getAll(...group, { fieldMask }));
    }
    return snapshots;
  };
  const assignments = new Map();
  const assignmentIds = unique(links.map((link) => text(link.assignmentId)).filter(Boolean));
  (await read(assignmentIds.map((id) => db.collection('assignments').doc(id)), ['assignedClassIds']))
    .forEach((snapshot) => assignments.set(snapshot.id, snapshot.exists ? snapshot.data() || {} : null));
  const classesById = new Map();
  const classIds = unique([...assignments.values()].filter(Boolean).flatMap(assignedClassIds));
  (await read(classIds.map((id) => db.collection('classes').doc(id)), ['teacherOfRecord']))
    .forEach((snapshot) => classesById.set(snapshot.id, snapshot.exists ? snapshot.data() || {} : null));
  const uidByEmail = new Map();
  const emails = unique([...classesById.values()].filter(Boolean).map((entry) => text(entry.teacherOfRecord).toLowerCase()).filter(Boolean));
  (await read(emails.map((value) => db.collection('teacherDirectory').doc(value)), ['uid']))
    .forEach((snapshot) => uidByEmail.set(snapshot.id, snapshot.exists ? text(snapshot.data()?.uid) : ''));
  const [original] = await getAll(db.doc(ORIGINAL_CONNECTION), { fieldMask: ['migratedToUid'] });
  const originalConnection = { exists: original.exists, migratedToUid: original.exists ? text(original.data()?.migratedToUid) : '' };
  return {
    planFor: (link) => planLinkTeacher({
      link,
      assignment: assignments.get(text(link.assignmentId)) ?? null,
      classesById,
      uidByEmail,
      originalConnection,
    }),
    originalConnection,
  };
}

const emptyCounts = () => ({
  linksRead: 0,
  withTeacher: 0,
  withoutTeacher: 0,
  stamp: 0,
  review: 0,
  leave: 0,
  toWrite: 0,
  written: 0,
  changedSinceReport: 0,
  failed: 0,
});

export const runTeacherBackfill = async ({
  db, FieldPath, execute = false, includeReview = false, confirm = null, log = () => {}, now = Date.now(),
}) => {
  const report = {
    startedAt: new Date(now).toISOString(),
    mode: execute ? 'execute' : 'report',
    options: { includeReview },
    counts: emptyCounts(),
    byReason: {},
    originalConnection: null,
    links: [],
  };
  const { counts } = report;

  const links = await scanLinks(db, FieldPath);
  counts.linksRead = links.length;
  const unrecorded = links.filter((doc) => !linkTeacherUid(doc.data()));
  counts.withTeacher = links.length - unrecorded.length;
  counts.withoutTeacher = unrecorded.length;
  if (!unrecorded.length) {
    log(`${counts.linksRead} links read; every one records its teacher. Nothing to do.`);
    return report;
  }

  const { planFor, originalConnection } = await readPlanInputs(db, (...args) => db.getAll(...args), unrecorded.map((doc) => doc.data() || {}));
  report.originalConnection = { exists: originalConnection.exists, takenOverByUid: originalConnection.migratedToUid || null };
  for (const doc of unrecorded) {
    const link = doc.data() || {};
    const plan = planFor(link);
    counts[plan.action] += 1;
    report.byReason[plan.reason] = (report.byReason[plan.reason] || 0) + 1;
    report.links.push({
      linkId: doc.id,
      assignmentId: text(link.assignmentId) || null,
      courseId: text(link.courseId) || null,
      status: text(link.status) || null,
      action: plan.action,
      reason: plan.reason,
      teacherUid: plan.teacherUid || null,
    });
  }
  const toWrite = report.links.filter((entry) => isWritten(entry, { includeReview }));
  counts.toWrite = toWrite.length;
  log(`${counts.linksRead} links read; ${counts.withoutTeacher} record no teacher: ${counts.stamp} to stamp, ${counts.review} for review, ${counts.leave} left as they are.`);
  if (!execute || !toWrite.length) return report;
  if (confirm && !(await confirm(counts))) { report.aborted = true; return report; }

  for (const planned of toWrite) {
    const ref = db.collection(LINKS).doc(planned.linkId);
    try {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await db.runTransaction(async (transaction) => {
        // Everything read again and planned again inside the transaction.
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists ? snapshot.data() || {} : null;
        const replanned = current
          ? (await readPlanInputs(db, (...args) => transaction.getAll(...args), [current])).planFor(current)
          : null;
        if (!stillStamp({ current, planned, replanned, includeReview })) return 'changed';
        transaction.update(ref, stampFields({ teacherUid: replanned.teacherUid, reason: replanned.reason, now }));
        return 'written';
      });
      if (outcome === 'written') counts.written += 1;
      else {
        counts.changedSinceReport += 1;
        planned.outcome = 'changed-since-report';
      }
    } catch (error) {
      // One link never stops the run, and the report is still written.
      counts.failed += 1;
      planned.outcome = 'failed';
      planned.message = String(error?.message || error).slice(0, 300);
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
    console.error(`backfill-classroom-link-teachers: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) { console.log(USAGE); return; }
  const admin = functionsRequire('firebase-admin');
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  const app = admin.initializeApp({ projectId: options.project }, 'backfill-classroom-link-teachers');
  console.log(`Classroom link teacher backfill — ${options.execute ? 'EXECUTE' : 'REPORT (read-only; nothing is written)'}`);
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  const confirm = options.execute && !options.yes
    ? async (counts) => {
      console.log(`\n  ${counts.toWrite} classroomLinks documents will get a teacherUid${options.includeReview ? ' (review links included: their grade passback moves to the teacher\'s own Google connection)' : ''}.`);
      const answer = await askLine(`Type the project id to write to ${options.project}: `);
      return answer.trim() === options.project;
    }
    : null;
  let report;
  try {
    report = await runTeacherBackfill({
      db: app.firestore(), FieldPath: admin.firestore.FieldPath, ...options, confirm, log: (line) => console.log(`  ${line}`),
    });
  } finally {
    await app.delete().catch(() => {});
  }
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const reportPath = options.reportPath
    ? path.resolve(options.reportPath)
    : path.join(repoRoot, 'release-reports', `classroom-link-teachers-${report.mode}-${stamp}.json`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({ ...report, project: options.project, emulator }, null, 2)}\n`);
  console.log('');
  Object.entries(report.counts).forEach(([key, value]) => console.log(`  ${key.padEnd(20)} ${value}`));
  if (Object.keys(report.byReason).length) {
    console.log('  by reason:');
    Object.entries(report.byReason).forEach(([reason, n]) => console.log(`    ${reason.padEnd(44)} ${n}`));
  }
  if (report.counts.review && !options.includeReview) {
    console.log(`  ${report.counts.review} link(s) for review: stamping them moves their grade passback to the teacher's own Google connection. Pass --include-review with --execute to stamp them too.`);
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
