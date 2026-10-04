// THE SHARED COPY OF STUDENTS' CONTROLS IS RETIRED ONLY THROUGH ITS GATE.
//
// PR #432 stated the condition (docs/architecture/student-assignment-overrides.md
// §5, §11); this release makes the server enforce it
// (functions/shared/overrideRetirementGate.mjs) and gives the administrator a
// staged screen for it (src/components/admin/StudentControlsMigrationCard.jsx):
//
//   1. the client release reading private records is deployed;
//   2. it has been live for one full school day;
//   3. a full backfill pass has completed;
//   4. with zero failures.
//
// What the server can prove it checks (the live build manifest, its own
// clock, its own pass accounting); what it cannot (a holiday) it requires the
// administrator to attest, explicitly. The strip's dry run never writes; the
// strip itself is a separate, typed action; restore stays available.
//
// The same callables against Firestore: tests/integration/studentAssignmentOverrides.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CLIENT_CUTOVER_CAPABILITY,
  DAY_MS,
  LEGACY_IGNORE_DAYS,
  OVERRIDE_MIGRATION_STAGE,
  RESTORE_CONFIRMATION,
  RETIREMENT_GATE,
  RETIRE_CONFIRMATION,
  STRIP_CONFIRMATION,
  cutoverManifestFields,
  evaluateRetirementReadiness,
  firstFullSchoolDayAfter,
  hostingCutoverEvidence,
  retirementRefusal,
} from '../../functions/shared/overrideRetirementGate.mjs';
import { MIGRATION_COUNTERS, advanceMigrationPass } from '../../functions/shared/studentAssignmentOverrideStore.mjs';
import {
  describeMigrationStage,
  firstFullDistrictSchoolDay,
  runStudentControlsMigrationPass,
  stripReportRows,
} from '../../src/platform/admin/studentControlsMigration.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const at = (iso) => Date.parse(iso);
// Monday 5 October 2026, 10:00 in Chicago.
const MONDAY_10AM = at('2026-10-05T15:00:00.000Z');
const DEPLOYED = { checked: true, gitSha: 'abc123def456', capability: 1 };

const completedPass = (overrides = {}) => ({
  passId: 'pass-1', startedAtMs: MONDAY_10AM - DAY_MS, completedAtMs: MONDAY_10AM - DAY_MS + 60_000,
  pages: 3, nextCursor: null, failureCount: 0, failures: [], assignmentsScanned: 420, ...overrides,
});
const readyMigration = (overrides = {}) => ({
  backfill: { lastCompletedPass: completedPass(), pass: completedPass() },
  cutover: { confirmedAtMs: MONDAY_10AM, hostingVerified: true },
  ...overrides,
});
const gate = (readiness, id) => readiness.gates.find((entry) => entry.id === id);

/* -------------------------------------------------- 21. early retirement */

test('21. nothing done yet: every gate fails, and the stage says the backfill comes first', () => {
  const readiness = evaluateRetirementReadiness({ storage: null, migration: {}, hosting: null, nowMs: MONDAY_10AM });
  assert.equal(readiness.canRetire, false);
  assert.equal(readiness.stage, OVERRIDE_MIGRATION_STAGE.BACKFILL_INCOMPLETE);
  assert.deepEqual(readiness.gates.map((entry) => [entry.id, entry.ok]), [
    [RETIREMENT_GATE.CLIENT_CUTOVER_DEPLOYED, false],
    [RETIREMENT_GATE.LIVE_ONE_FULL_SCHOOL_DAY, false],
    [RETIREMENT_GATE.FULL_BACKFILL_COMPLETED, false],
    [RETIREMENT_GATE.BACKFILL_ZERO_FAILURES, false],
  ]);
  assert.equal(retirementRefusal({ readiness, confirmation: RETIRE_CONFIRMATION, attestFullSchoolDay: true }).code, 'failed-precondition');
});

test('21. each gate blocks on its own — a backfill with failures, an unfinished newer pass, the same school day, an old Hosting', () => {
  const tuesdayEnd = at('2026-10-07T05:00:00.000Z'); // Wednesday 00:00 Chicago
  const later = tuesdayEnd + 60_000;
  // Ready, to start from.
  assert.equal(evaluateRetirementReadiness({ migration: readyMigration(), hosting: DEPLOYED, nowMs: later }).canRetire, true);
  // A full pass with failures.
  const failed = evaluateRetirementReadiness({ migration: readyMigration({ backfill: { lastCompletedPass: completedPass({ failureCount: 2 }) } }), hosting: DEPLOYED, nowMs: later });
  assert.equal(gate(failed, RETIREMENT_GATE.BACKFILL_ZERO_FAILURES).ok, false);
  assert.equal(failed.stage, OVERRIDE_MIGRATION_STAGE.BACKFILL_INCOMPLETE);
  // A newer pass started after the completed one and has not finished.
  const unfinished = evaluateRetirementReadiness({
    migration: readyMigration({ backfill: { lastCompletedPass: completedPass(), pass: { ...completedPass({ passId: 'pass-2', completedAtMs: null }), startedAtMs: MONDAY_10AM } } }),
    hosting: DEPLOYED,
    nowMs: later,
  });
  assert.equal(gate(unfinished, RETIREMENT_GATE.FULL_BACKFILL_COMPLETED).ok, false);
  // Recorded live Monday 10:00 → Tuesday is the first full school day; not over until Wednesday 00:00.
  const sameDay = evaluateRetirementReadiness({ migration: readyMigration(), hosting: DEPLOYED, nowMs: tuesdayEnd - 1 });
  assert.equal(gate(sameDay, RETIREMENT_GATE.LIVE_ONE_FULL_SCHOOL_DAY).ok, false);
  assert.equal(gate(sameDay, RETIREMENT_GATE.LIVE_ONE_FULL_SCHOOL_DAY).schoolDay, '2026-10-06');
  assert.equal(sameDay.stage, OVERRIDE_MIGRATION_STAGE.WAITING_SAFETY_PERIOD);
  assert.equal(evaluateRetirementReadiness({ migration: readyMigration(), hosting: DEPLOYED, nowMs: tuesdayEnd }).canRetire, true);
  // Hosting definitely serves an older client: blocked whatever was recorded or attested.
  const oldHosting = evaluateRetirementReadiness({
    migration: readyMigration({ cutover: { confirmedAtMs: MONDAY_10AM, hostingAttested: true } }),
    hosting: { checked: true, gitSha: 'old', capability: 0 },
    nowMs: later,
  });
  assert.equal(gate(oldHosting, RETIREMENT_GATE.CLIENT_CUTOVER_DEPLOYED).ok, false);
  assert.equal(oldHosting.canRetire, false);
  // Not recorded at all: no clock.
  const unrecorded = evaluateRetirementReadiness({ migration: readyMigration({ cutover: null }), hosting: DEPLOYED, nowMs: later });
  assert.equal(gate(unrecorded, RETIREMENT_GATE.CLIENT_CUTOVER_DEPLOYED).ok, false);
  assert.equal(gate(unrecorded, RETIREMENT_GATE.LIVE_ONE_FULL_SCHOOL_DAY).ok, false);
});

test('what the server cannot read it does not pretend: an unreadable build needs the recorded attestation', () => {
  const later = at('2026-10-08T15:00:00.000Z');
  const unverified = { checked: false, reason: 'emulator' };
  assert.equal(hostingCutoverEvidence(unverified).state, 'unverified');
  const noAttestation = evaluateRetirementReadiness({ migration: readyMigration({ cutover: { confirmedAtMs: MONDAY_10AM } }), hosting: unverified, nowMs: later });
  assert.equal(gate(noAttestation, RETIREMENT_GATE.CLIENT_CUTOVER_DEPLOYED).ok, false);
  const attested = evaluateRetirementReadiness({ migration: readyMigration({ cutover: { confirmedAtMs: MONDAY_10AM, hostingAttested: true } }), hosting: unverified, nowMs: later });
  assert.equal(gate(attested, RETIREMENT_GATE.CLIENT_CUTOVER_DEPLOYED).ok, true);
  assert.match(gate(attested, RETIREMENT_GATE.CLIENT_CUTOVER_DEPLOYED).detail, /attested/);
});

test('ready is still not enough: the typed confirmation and the school-day attestation are both required', () => {
  const readiness = evaluateRetirementReadiness({ migration: readyMigration(), hosting: DEPLOYED, nowMs: at('2026-10-08T15:00:00.000Z') });
  assert.equal(readiness.stage, OVERRIDE_MIGRATION_STAGE.READY_TO_RETIRE);
  assert.equal(retirementRefusal({ readiness, confirmation: 'retire', attestFullSchoolDay: true }).code, 'invalid-argument');
  assert.equal(retirementRefusal({ readiness, confirmation: RETIRE_CONFIRMATION, attestFullSchoolDay: false }).code, 'invalid-argument');
  assert.equal(retirementRefusal({ readiness, confirmation: RETIRE_CONFIRMATION, attestFullSchoolDay: true }), null);
  // Already retired: nothing to refuse, nothing to do.
  const retired = evaluateRetirementReadiness({ storage: { sharedRetired: true }, migration: readyMigration(), hosting: DEPLOYED, nowMs: at('2026-10-08T15:00:00.000Z') });
  assert.equal(retired.stage, OVERRIDE_MIGRATION_STAGE.RETIRED);
  assert.equal(retired.canRetire, false);
});

/* ------------------------------------------------------ the school day */

test('one full school day: the first whole weekday after going live, in the school\'s time zone', () => {
  assert.equal(firstFullSchoolDayAfter(MONDAY_10AM).dateKey, '2026-10-06', 'Monday 10:00 → Tuesday');
  assert.equal(firstFullSchoolDayAfter(at('2026-10-09T15:00:00.000Z')).dateKey, '2026-10-12', 'Friday → Monday (the server cannot see holidays)');
  assert.equal(firstFullSchoolDayAfter(at('2026-10-06T05:00:00.000Z')).dateKey, '2026-10-06', 'live from exactly midnight: that day counts');
  assert.equal(firstFullSchoolDayAfter(at('2026-10-06T05:00:01.000Z')).dateKey, '2026-10-07', 'a second late: it does not');
  // Across the end of daylight saving (Sunday 1 November 2026): the day is midnight to midnight in Chicago.
  const afterDst = firstFullSchoolDayAfter(at('2026-10-30T15:00:00.000Z'));
  assert.equal(afterDst.dateKey, '2026-11-02');
  assert.equal(new Date(afterDst.startMs).toISOString(), '2026-11-02T06:00:00.000Z');
  assert.equal(new Date(afterDst.endMs).toISOString(), '2026-11-03T06:00:00.000Z');
  // The admin screen's hint knows the district calendar: fall break is 12–16 October.
  assert.equal(firstFullDistrictSchoolDay(at('2026-10-09T15:00:00.000Z')).dateKey, '2026-10-19');
  // …and with nothing recorded it names no day (never one counted from 1970).
  [null, undefined, '', 0, '1791000000000', Number.NaN].forEach((value) => assert.equal(firstFullDistrictSchoolDay(value), null, String(value)));
});

/* --------------------------------------------------------- the passes */

test('a pass is the server\'s own sum over pages that ran in order; a page out of order belongs to none', () => {
  const page = (startAfter, nextCursor, extra = {}) => ({
    startAfter, nextCursor, done: nextCursor === null, failures: [], assignmentsScanned: 100, recordsCreated: 3, ...extra,
  });
  const first = advanceMigrationPass({ previous: null, report: page(null, 'a100'), nowMs: 1, passId: 'run-1' });
  assert.equal(first.pages, 1);
  assert.equal(first.completedAtMs, null);
  const second = advanceMigrationPass({ previous: first, report: page('a100', 'a200', { failures: [{ assignmentId: 'a150', reason: 'x' }] }), nowMs: 2 });
  assert.equal(advanceMigrationPass({ previous: second, report: page('a999', null), nowMs: 3 }), null, 'a page from elsewhere does not continue the pass');
  const done = advanceMigrationPass({ previous: second, report: page('a200', null), nowMs: 4 });
  assert.equal(done.completedAtMs, 4);
  assert.equal(done.pages, 3);
  assert.equal(done.assignmentsScanned, 300);
  assert.equal(done.recordsCreated, 9);
  assert.equal(done.failureCount, 1, 'a failure on any page is the pass\'s failure');
  assert.equal(done.passId, 'run-1');
  assert.ok(MIGRATION_COUNTERS.every((key) => typeof done[key] === 'number'));
  // A completed pass is never continued; a page from the start begins a new one.
  assert.equal(advanceMigrationPass({ previous: done, report: page('a200', null), nowMs: 5 }), null);
  assert.equal(advanceMigrationPass({ previous: done, report: page(null, null), nowMs: 6 }).pages, 1);
});

test('the 30-day condition starts at a clean strip after retiring, and a restore resets it', () => {
  const retiredAt = at('2026-10-09T15:00:00.000Z');
  const cleanAt = retiredAt + 2 * DAY_MS;
  const migration = readyMigration({
    retirement: { retiredAtMs: retiredAt },
    strip: { lastCompletedPass: { completedAtMs: cleanAt, assignmentsWithSharedStudentData: 0, assignmentsAwaitingAbsorption: 0, studentsAwaitingAbsorption: 0, failureCount: 0 } },
  });
  const readiness = evaluateRetirementReadiness({ storage: { sharedRetired: true }, migration, hosting: DEPLOYED, nowMs: cleanAt + DAY_MS });
  assert.equal(readiness.legacyIgnore.cleanSinceMs, cleanAt);
  assert.equal(readiness.legacyIgnore.earliestMs, cleanAt + LEGACY_IGNORE_DAYS * DAY_MS);
  assert.equal(readiness.legacyIgnore.eligibleByTime, false);
  assert.equal(evaluateRetirementReadiness({ storage: { sharedRetired: true }, migration, nowMs: cleanAt + LEGACY_IGNORE_DAYS * DAY_MS }).legacyIgnore.eligibleByTime, true);
  // A strip that still found shared data starts nothing.
  const dirty = readyMigration({ retirement: { retiredAtMs: retiredAt }, strip: { lastCompletedPass: { completedAtMs: cleanAt, assignmentsWithSharedStudentData: 4, failureCount: 0 } } });
  assert.equal(evaluateRetirementReadiness({ storage: { sharedRetired: true }, migration: dirty, nowMs: cleanAt }).legacyIgnore.cleanSinceMs, null);
  // A restore after it: the clock resets until a new clean strip.
  const restored = { ...migration, restore: { lastRealRunAtMs: cleanAt + DAY_MS } };
  assert.equal(evaluateRetirementReadiness({ storage: { sharedRetired: true }, migration: restored, nowMs: cleanAt + 40 * DAY_MS }).legacyIgnore.cleanSinceMs, null);
});

/* ------------------------------------------------- the admin workflow */

test('the stages, in the administrator\'s words, and the strip\'s six numbers', () => {
  const waiting = describeMigrationStage({ stage: OVERRIDE_MIGRATION_STAGE.WAITING_SAFETY_PERIOD, gates: [{ id: RETIREMENT_GATE.LIVE_ONE_FULL_SCHOOL_DAY, ok: false }] });
  assert.deepEqual(waiting.steps.map((step) => [step.label, step.state]), [
    ['Mirrored', 'current'],
    ['Backfill incomplete', 'done'],
    ['Backfill complete — waiting for the safety period', 'current'],
    ['Ready to retire', 'upcoming'],
    ['Retired', 'upcoming'],
  ]);
  assert.deepEqual(waiting.blocking.map((entry) => entry.id), [RETIREMENT_GATE.LIVE_ONE_FULL_SCHOOL_DAY]);
  assert.equal(describeMigrationStage({ stage: OVERRIDE_MIGRATION_STAGE.RETIRED, gates: [] }).steps[0].state, 'done');
  assert.deepEqual(stripReportRows({
    dryRun: true, assignmentsScanned: 420, assignmentsWithSharedStudentData: 37, recordsConfirmedPrivate: 512,
    studentsAwaitingAbsorption: 3, failures: [{}], archivesToWrite: 37,
  }), [
    ['Assignments scanned', 420],
    ['Assignments with shared student data', 37],
    ['Records confirmed private', 512],
    ['Awaiting absorption (copied in first)', 3],
    ['Failures', 1],
    ['Archives that would be written', 37],
  ]);
  assert.deepEqual(stripReportRows({ dryRun: false, archivesWritten: 36 }).at(-1), ['Archives written', 36]);
});

test('22. a dry-run pass never asks for a write: no confirmation is sent, and it reads from the beginning', async () => {
  const sent = [];
  const pages = [{ nextCursor: 'a1', done: false, assignmentsScanned: 1, failures: [] }, { nextCursor: null, done: true, assignmentsScanned: 1, failures: [] }];
  const report = await runStudentControlsMigrationPass({
    mode: 'strip', dryRun: true, confirm: STRIP_CONFIRMATION,
    migrate: async (request) => { sent.push(request); return pages[sent.length - 1]; },
    readProgress: async () => ({ strip: { done: false, cursor: 'zzz' } }),
  });
  assert.deepEqual(sent, [{ mode: 'strip', dryRun: true }, { mode: 'strip', dryRun: true, startAfter: 'a1' }]);
  assert.equal(report.assignmentsScanned, 2);
  // A real pass carries the typed confirmation and resumes from the server's cursor.
  const real = [];
  await runStudentControlsMigrationPass({
    mode: 'strip', dryRun: false, confirm: STRIP_CONFIRMATION,
    migrate: async (request) => { real.push(request); return { nextCursor: null, done: true, failures: [] }; },
    readProgress: async () => ({ strip: { done: false, cursor: 'a7' } }),
  });
  assert.deepEqual(real, [{ mode: 'strip', dryRun: false, confirm: STRIP_CONFIRMATION, startAfter: 'a7' }]);
});

test('the build declares the capability the server checks, and the server reads it itself', () => {
  assert.deepEqual(cutoverManifestFields(), { [CLIENT_CUTOVER_CAPABILITY]: 1 });
  const builder = read('scripts/build-firebase-hosting.mjs');
  assert.match(builder, /import \{ cutoverManifestFields \} from '\.\.\/functions\/shared\/overrideRetirementGate\.mjs';/);
  assert.match(region(builder, "writeFileSync(manifestPath, JSON.stringify({", '}, null, 2)'), /\.\.\.cutoverManifestFields\(\),/);
  assert.equal(hostingCutoverEvidence({ checked: true, ...cutoverManifestFields() }).state, 'notDeployed', 'capability must be read from the manifest field');
  assert.equal(hostingCutoverEvidence({ checked: true, capability: cutoverManifestFields()[CLIENT_CUTOVER_CAPABILITY] }).state, 'deployed');
  const index = read('functions/index.js');
  const hosting = executableSource(region(index, 'async function liveHostingBuild()', 'const reportedBuild', 'liveHostingBuild'));
  assert.match(hosting, /mathmaster-build\.json/);
  assert.match(hosting, /capability: Number\(manifest\?\.\[gate\.CLIENT_CUTOVER_CAPABILITY\]\) \|\| 0/);
});

test('the switch: retiring is gated and re-checked in its transaction; rolling back never is; nothing about who acted goes on the flag', () => {
  const index = executableSource(read('functions/index.js'));
  const callable = region(index, 'exports.setAssignmentOverrideStorage = onCall(', 'exports.absorbSharedStudentControls', 'setAssignmentOverrideStorage');
  const retire = region(callable, 'if (action === "retire") {', 'if (action === "mirror") {', 'retire');
  assert.match(retire, /const refusal = gate\.retirementRefusal\(\{[\s\S]*confirmation: data\.confirmation,[\s\S]*attestFullSchoolDay: data\.attestFullSchoolDay === true/);
  assert.match(retire, /if \(refusal\) \{[\s\S]*student_assignment_overrides_retire_refused[\s\S]*throw new HttpsError\(refusal\.code/);
  assert.match(retire, /const fresh = gate\.evaluateRetirementReadiness\([\s\S]*if \(!fresh\.canRetire\) \{\s*throw new HttpsError\("failed-precondition"/);
  assert.match(retire, /transaction\.set\(flagRef, \{\s*\[overrides\.SHARED_RETIRED_FIELD\]: true,\s*updatedAt: FieldValue\.serverTimestamp\(\),\s*\}, \{ merge: true \}\)/);
  const mirror = region(callable, 'if (action === "mirror") {', 'throw new HttpsError("invalid-argument", "Unknown action', 'mirror');
  assert.doesNotMatch(mirror, /retirementRefusal|evaluateRetirementReadiness|canRetire/, 'the rollback is never gated');
  // Rolling a retirement back sets its cutover aside: retiring again starts over.
  assert.match(mirror, /if \(wasRetired\) \{[\s\S]*next\.previousCutover = \{ \.\.\.current\.cutover, supersededAtMs: nowMs \};\s*next\.cutover = null;/);
  assert.doesNotMatch(callable, /updatedBy:/, 'the flag is readable by every signed-in client: no actor on it');
  const cutover = region(callable, 'if (action === "confirmClientCutover") {', 'if (action === "retire") {', 'confirmClientCutover');
  assert.match(cutover, /evidence\.state === "notDeployed"/);
  assert.match(cutover, /confirmedAtMs: nowMs,/, 'the clock starts at the server\'s time');
  assert.doesNotMatch(cutover, /confirmedAtMs: (data|request)\./, 'never a time a browser sends');
});

test('23. the strip and the restore are separate, typed actions; a strip needs its own finished dry run', () => {
  const index = executableSource(read('functions/index.js'));
  const migrate = region(index, 'exports.migrateStudentAssignmentOverrides = onCall(', 'try {', 'migrateStudentAssignmentOverrides');
  assert.match(migrate, /!dryRun && mode === "strip" && String\(request\.data\?\.confirm \|\| ""\) !== gate\.STRIP_CONFIRMATION/);
  assert.match(migrate, /!dryRun && mode === "restore" && String\(request\.data\?\.confirm \|\| ""\) !== gate\.RESTORE_CONFIRMATION/);
  // The dry run of the same scope: a canary's own for a canary strip, the full
  // one for the full strip (both run against Firestore in
  // tests/integration/studentAssignmentOverrides.test.mjs).
  assert.match(migrate, /if \(!dryRun && mode === "strip"\) \{[\s\S]*const passes = prefix \? progress\?\.canaryPasses\?\.strip\?\.\[prefix\] : progress\?\.strip;\s*const dry = passes\?\.lastCompletedDryRunPass[\s\S]*Number\(dry\.failureCount\) > 0[\s\S]*< retiredAtMs/);
  // The card: the dry run and the strip are different buttons, and the strip
  // needs the finished dry run and the typed phrase.
  const card = read('src/components/admin/StudentControlsMigrationCard.jsx');
  assert.match(card, /runPass\('strip-dry', \{ mode: 'strip', dryRun: true \}/);
  assert.match(card, /disabled=\{Boolean\(busy\) \|\| !dryStripReady \|\| stripText\.trim\(\) !== STRIP_CONFIRMATION\}[\s\S]{0,200}runPass\('strip', \{ mode: 'strip', dryRun: false, confirm: stripText\.trim\(\) \}/);
  assert.match(card, /disabled=\{Boolean\(busy\) \|\| !attestSchoolDay \|\| retireText\.trim\(\) !== RETIRE_CONFIRMATION\}/);
  assert.match(card, /teacherAdmin\.retireSharedStudentControls\(\{ confirmation: retireText\.trim\(\), attestFullSchoolDay: attestSchoolDay \}\)/);
  assert.match(card, /runPass\('restore', \{ mode: 'restore', dryRun: false, confirm: restoreText\.trim\(\) \}/);
  assert.equal(STRIP_CONFIRMATION !== RESTORE_CONFIRMATION && STRIP_CONFIRMATION !== RETIRE_CONFIRMATION, true);
  // Only the newest status is shown: a slow read never replaces what a later action returned.
  assert.match(card, /const ticket = statusTicket\.current;[\s\S]*if \(ticket === statusTicket\.current\) setStatus\(value\);/);
  assert.doesNotMatch(card.slice(card.indexOf('return (')), /setStatus\(result\)/, 'actions show their result through showStatus');
  // The admin page shows the card.
  const admin = read('src/components/admin/ClassesAdmin.jsx');
  assert.match(admin, /import StudentControlsMigrationCard from '\.\/StudentControlsMigrationCard\.jsx';/);
  assert.match(admin, /<StudentControlsMigrationCard \/>/);
});
