import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource, assertCapability } from './helpers/sourceContract.mjs';
import {
  MAX_AWARD_AMOUNT as BACKEND_MAX_AWARD_AMOUNT,
  REASON_CODES as BACKEND_REASON_CODES,
} from '../../functions/shared/classPoints.mjs';
import {
  DEFAULT_REASON_LABELS,
  DEFAULT_REVERSAL_REASON,
  MAX_AWARD_AMOUNT,
  QUICK_AWARD_AMOUNTS,
  REASON_CODES,
  accountDocsToBalanceMap,
  buildAwardPayload,
  buildReversalPayload,
  classPointsBalanceFor,
  createRequestIdController,
  historyDocsToTransactions,
  isReversibleTeacherAward,
  reversedAwardTransactionIds,
  sourceTypeLabel,
} from '../../src/platform/classPointsClient.js';

// Classroom Live Phase 4A: the TEACHER-SIDE UI for the Class Points ledger
// PR #253 already built server-side (functions/shared/classPoints.mjs,
// functions/index.js's awardClassPoints/reverseClassPointAward). This suite
// covers the client seam (src/platform/classPointsClient.js) and the two new
// teacher components directly with pure-function tests, and reads
// LiveClassMonitor.jsx/the new components as source contracts for the
// wiring nothing here can execute (React never renders in a node test — see
// tests/platform/helpers/sourceContract.mjs).
//
// It does NOT retest authorization, ledger correctness, or reversal
// semantics — tests/platform/classPoints.test.mjs and
// classPointsAuthorizationOrder.test.mjs already own that. This suite only
// proves the teacher UI calls the existing callables correctly and never
// invents a parallel source of truth.

const clientSource = readFileSync('src/platform/classPointsClient.js', 'utf8');
const awardDialogSource = readFileSync('src/components/teacher/ClassPointsAwardDialog.jsx', 'utf8');
const historyPanelSource = readFileSync('src/components/teacher/ClassPointsHistoryPanel.jsx', 'utf8');
const monitorSource = readFileSync('src/components/teacher/LiveClassMonitor.jsx', 'utf8');

// --- Server drift guard -------------------------------------------------
// classPointsClient.js cannot IMPORT functions/shared/classPoints.mjs (it
// pulls in node:crypto and cannot be bundled for the browser), so the values
// the teacher UI depends on are duplicated by hand. This is the tripwire
// that catches the server changing out from under the duplicate.

test('the client REASON_CODES stay a subset of the server\'s reason codes', () => {
  REASON_CODES.forEach((code) => assert.ok(BACKEND_REASON_CODES.includes(code), `"${code}" is not a server-recognized reason code`));
});

test('the client MAX_AWARD_AMOUNT matches the server cap', () => {
  assert.equal(MAX_AWARD_AMOUNT, BACKEND_MAX_AWARD_AMOUNT);
  QUICK_AWARD_AMOUNTS.forEach((amount) => assert.ok(amount >= 1 && amount <= MAX_AWARD_AMOUNT));
});

test('every REASON_CODE has a teacher-facing label, so the reason picker never shows a blank/raw enum option', () => {
  REASON_CODES.forEach((code) => assert.ok(DEFAULT_REASON_LABELS[code], `"${code}" has no DEFAULT_REASON_LABELS entry`));
});

// --- 1 & 2: active-class balances map to correct student IDs; a missing account is 0 ---

test('accountDocsToBalanceMap keys balances by studentId, not document id', () => {
  const docs = [
    { id: 'acct-1', data: () => ({ studentId: 'S1', classId: 'class-a', balance: 14 }) },
    { id: 'acct-2', data: () => ({ studentId: 'S2', classId: 'class-a', balance: 3 }) },
  ];
  const map = accountDocsToBalanceMap(docs);
  assert.equal(classPointsBalanceFor(map, 'S1'), 14);
  assert.equal(classPointsBalanceFor(map, 'S2'), 3);
  // The account document id (a hash of studentId+classId, see accountId()
  // server-side) must never leak as the lookup key on the client.
  assert.equal(map['acct-1'], undefined);
});

test('a student with no classPointAccounts document yet displays 0, never undefined or a thrown error', () => {
  const map = accountDocsToBalanceMap([{ id: 'acct-1', data: () => ({ studentId: 'S1', classId: 'class-a', balance: 9 }) }]);
  assert.equal(classPointsBalanceFor(map, 'never-awarded-student'), 0);
  assert.equal(classPointsBalanceFor({}, 'S1'), 0);
  assert.equal(classPointsBalanceFor(null, 'S1'), 0);
});

test('accountDocsToBalanceMap never invents a balance by summing anything — it only ever reflects the account projection field', () => {
  const map = accountDocsToBalanceMap([{ id: 'acct-1', data: () => ({ studentId: 'S1', classId: 'class-a', balance: 5, lifetimeEarned: 500 }) }]);
  assert.equal(classPointsBalanceFor(map, 'S1'), 5);
});

// --- 3: a teacher outside this class's authorization can never become a balance source ---

test('the balance and history queries are scoped by BOTH authorizedTeacherEmails and classId, matching the PR #253 rules/index shape', () => {
  const accountsQueryBody = region(clientSource, 'export const classPointAccountsQuery', 'export const classPointHistoryQuery', 'classPointAccountsQuery');
  const historyQueryBody = region(clientSource, 'export const classPointHistoryQuery', 'accountDocsToBalanceMap', 'classPointHistoryQuery');
  [accountsQueryBody, historyQueryBody].forEach((body) => {
    assert.match(body, /where\(\s*'authorizedTeacherEmails',\s*'array-contains',\s*teacherEmail\s*\)/);
    assert.match(body, /where\(\s*'classId',\s*'=='\s*,\s*classId\s*\)/);
  });
  assert.match(historyQueryBody, /orderBy\(\s*'createdAt',\s*'desc'\s*\)/);
  assert.match(historyQueryBody, /fsLimit\(/);
});

test('a subscription with no authorized teacherEmail/classId is a silent no-op, never an unscoped read', () => {
  assert.match(clientSource, /if \(!firestore \|\| !teacherEmail \|\| !classId\)/g);
});

// --- 4: award request builds correct callable payload ---

test('buildAwardPayload shapes a well-formed request exactly as the callable expects it', () => {
  const payload = buildAwardPayload({
    studentId: ' S1 ', classId: 'class-a', amount: 3, reasonCode: 'participation', requestId: 'req-1', announce: true,
  });
  assert.deepEqual(payload, {
    studentId: 'S1', classId: 'class-a', amount: 3, reasonCode: 'participation', reasonLabel: 'Participation', requestId: 'req-1', announce: true,
  });
});

test('buildAwardPayload defaults announce to false, matching the required OFF default', () => {
  const payload = buildAwardPayload({ studentId: 'S1', classId: 'class-a', amount: 1, reasonCode: 'teacherBonus', requestId: 'req-1' });
  assert.equal(payload.announce, false);
});

test('buildAwardPayload rejects an amount over MAX_AWARD_AMOUNT, a non-integer amount, and a missing reason', () => {
  const base = { studentId: 'S1', classId: 'class-a', requestId: 'req-1' };
  assert.throws(() => buildAwardPayload({ ...base, amount: MAX_AWARD_AMOUNT + 1, reasonCode: 'participation' }));
  assert.throws(() => buildAwardPayload({ ...base, amount: 2.5, reasonCode: 'participation' }));
  assert.throws(() => buildAwardPayload({ ...base, amount: 3, reasonCode: 'not-a-real-reason' }));
});

test('buildAwardPayload requires a non-empty label for a custom reason rather than falling back to a generic one', () => {
  assert.throws(() => buildAwardPayload({ studentId: 'S1', classId: 'class-a', amount: 2, reasonCode: 'custom', reasonLabel: '', requestId: 'req-1' }));
  const ok = buildAwardPayload({ studentId: 'S1', classId: 'class-a', amount: 2, reasonCode: 'custom', reasonLabel: 'Fixed a graphing error live', requestId: 'req-1' });
  assert.equal(ok.reasonLabel, 'Fixed a graphing error live');
});

test('buildAwardPayload refuses to build a payload with no requestId — a caller bug, not a teacher-fixable input', () => {
  assert.throws(() => buildAwardPayload({ studentId: 'S1', classId: 'class-a', amount: 2, reasonCode: 'participation', requestId: '' }));
});

test('buildReversalPayload shapes a well-formed reversal request and defaults to the standard corrective reason', () => {
  const payload = buildReversalPayload({ transactionId: 'tx-1', requestId: 'rev-req-1' });
  assert.deepEqual(payload, { transactionId: 'tx-1', requestId: 'rev-req-1', reason: DEFAULT_REVERSAL_REASON });
  const withReason = buildReversalPayload({ transactionId: 'tx-1', requestId: 'rev-req-1', reason: 'Wrong student tapped' });
  assert.equal(withReason.reason, 'Wrong student tapped');
});

test('buildReversalPayload refuses a reversal with no transactionId or requestId', () => {
  assert.throws(() => buildReversalPayload({ transactionId: '', requestId: 'rev-req-1' }));
  assert.throws(() => buildReversalPayload({ transactionId: 'tx-1', requestId: '' }));
});

// --- 5, 6, 7: idempotency controller — double submit, retry, and a fresh award after success ---

test('createRequestIdController mints exactly one id per intended action, even across repeated calls before success', () => {
  let calls = 0;
  const controller = createRequestIdController(() => { calls += 1; return `id-${calls}`; });
  const first = controller.next();
  const second = controller.next(); // simulates a rapid double click / re-render before the callable resolves
  const third = controller.next();
  assert.equal(first, 'id-1');
  assert.equal(second, 'id-1');
  assert.equal(third, 'id-1');
  assert.equal(calls, 1);
});

test('a retry after a failed/uncertain attempt reuses the exact same requestId', () => {
  let calls = 0;
  const controller = createRequestIdController(() => { calls += 1; return `id-${calls}`; });
  const attempt1 = controller.next();
  // ...callable throws; the dialog does NOT call resolveSuccess()...
  const retryAttempt = controller.next();
  assert.equal(retryAttempt, attempt1);
  assert.equal(calls, 1);
});

test('once an award definitely succeeds, the next intended award receives a brand new requestId', () => {
  let calls = 0;
  const controller = createRequestIdController(() => { calls += 1; return `id-${calls}`; });
  const firstAward = controller.next();
  controller.resolveSuccess();
  const secondAward = controller.next();
  assert.notEqual(secondAward, firstAward);
  assert.equal(calls, 2);
});

test('reset() also forces a fresh requestId, for a teacher who changes the intended action before submitting', () => {
  let calls = 0;
  const controller = createRequestIdController(() => { calls += 1; return `id-${calls}`; });
  const initial = controller.next();
  controller.reset();
  const afterReset = controller.next();
  assert.notEqual(initial, afterReset);
});

test('the award dialog guards submission against a rapid double click and disables its submit button while a request is pending', () => {
  const submitBody = executableSource(region(awardDialogSource, 'const submit = async () =>', 'return (\n    <div', 'award submit handler'));
  assertCapability(submitBody, [/if \(submitting\) return;/], 'the submit handler must bail out immediately on a re-entrant call while one is already pending');
  assert.match(awardDialogSource, /disabled=\{submitting\}[\s\S]{0,80}onClick=\{submit\}/, 'the submit button must be disabled while a request is in flight');
});

test('changing Celebrate with class resets the pending requestId because announce changes the callable payload fingerprint', () => {
  const announceControl = region(awardDialogSource, 'checked={announce}', 'Celebrate with class', 'announce control');
  assert.match(announceControl, /setAnnounce\(event\.target\.checked\)/);
  assert.match(announceControl, /requestControllerRef\.current\.reset\(\)/);
});

test('a failed award does NOT clear the requestId controller, but a successful one does', () => {
  const submitBody = region(awardDialogSource, 'const submit = async () =>', 'return (\n    <div', 'award submit handler');
  const tryBlock = region(submitBody, 'setSubmitting(true);', 'finally', 'award try/catch');
  assert.match(tryBlock, /requestControllerRef\.current\.resolveSuccess\(\)/);
  const catchBlock = tryBlock.slice(tryBlock.indexOf('} catch'));
  assert.doesNotMatch(executableSource(catchBlock), /resolveSuccess|\.reset\(\)/);
});

// --- 8 & 9: reversal calls reverseClassPointAward, never edits/deletes the ledger; presentation is clear ---

test('reversedAwardTransactionIds/isReversibleTeacherAward compute reversal state from the ledger, never from a client-invented flag', () => {
  const transactions = [
    { id: 'tx-1', sourceType: 'teacherAward', amount: 3 },
    { id: 'tx-2', sourceType: 'teacherAward', amount: 5 },
    { id: 'rev_tx-1', sourceType: 'teacherReversal', amount: -3, reversalOf: 'tx-1' },
  ];
  const reversedIds = reversedAwardTransactionIds(transactions);
  assert.deepEqual([...reversedIds], ['tx-1']);
  assert.equal(isReversibleTeacherAward(transactions[0], reversedIds), false); // already reversed
  assert.equal(isReversibleTeacherAward(transactions[1], reversedIds), true); // still live
  assert.equal(isReversibleTeacherAward(transactions[2], reversedIds), false); // a reversal is never itself reversible
});

test('sourceTypeLabel gives a clear, non-enum label, distinguishing a reversal from a teacher award', () => {
  assert.equal(sourceTypeLabel({ sourceType: 'teacherAward' }), 'Teacher award');
  assert.equal(sourceTypeLabel({ sourceType: 'teacherReversal' }), 'Reversal');
});

test('historyDocsToTransactions attaches the document id and preserves the query\'s newest-first order', () => {
  const docs = [
    { id: 'tx-2', data: () => ({ amount: 5, createdAt: '2026-01-02' }) },
    { id: 'tx-1', data: () => ({ amount: 3, createdAt: '2026-01-01' }) },
  ];
  const transactions = historyDocsToTransactions(docs);
  assert.deepEqual(transactions.map((entry) => entry.id), ['tx-2', 'tx-1']);
});

test('reversal builds a request through buildReversalPayload/reverseClassPointAward — the panel never calls updateDoc/deleteDoc/setDoc on a ledger entry', () => {
  assert.match(historyPanelSource, /reverseClassPointAward\(payload\)/);
  assert.match(historyPanelSource, /buildReversalPayload\(\{/);
  assert.doesNotMatch(executableSource(historyPanelSource), /\b(updateDoc|deleteDoc|setDoc|addDoc)\s*\(/);
  assert.doesNotMatch(executableSource(clientSource), /\b(updateDoc|deleteDoc|setDoc|addDoc)\b/);
});

test('a confirmed reversal defaults to the standard corrective reason but stays editable', () => {
  assert.equal(DEFAULT_REVERSAL_REASON, 'Teacher corrected an accidental award');
  assert.match(historyPanelSource, /useState\(DEFAULT_REVERSAL_REASON\)/);
  assert.match(historyPanelSource, /onChange=\{\(event\) => setReasonText\(event\.target\.value\)\}/);
});

test('reversal is guarded against double-submission the same way an award is — a per-transaction requestId controller and a busy guard', () => {
  const controlBody = region(historyPanelSource, 'function ReversalControl(', 'export default function ClassPointsHistoryPanel', 'ReversalControl');
  assert.match(controlBody, /createRequestIdController\(\)/);
  assert.match(controlBody, /if \(busy\) return;/);
});

test('a reversal the server reports as already-reversed is presented safely, without offering another attempt', () => {
  const controlBody = region(historyPanelSource, 'function ReversalControl(', 'export default function ClassPointsHistoryPanel', 'ReversalControl');
  assert.match(controlBody, /already.*reversed/i);
  assert.match(controlBody, /setDone\(true\)/);
});

test('once reversed, the button no longer encourages a second reversal', () => {
  const controlBody = region(historyPanelSource, 'function ReversalControl(', 'export default function ClassPointsHistoryPanel', 'ReversalControl');
  assert.match(controlBody, /if \(done\) return <span/);
});

// --- 10: raw student IDs are never the primary teacher-facing label ---

test('the history panel resolves a roster display name for the primary label; it does not render the raw studentId in <strong>', () => {
  const rowBody = region(historyPanelSource, 'transactions.map((transaction) =>', 'export default function ClassPointsHistoryPanel', 'history row').split('return (')[1] || '';
  assert.match(historyPanelSource, /resolveRosterStudentName\(\{ studentId: transaction\.studentId, students: roster \}\)/);
  assert.match(historyPanelSource, /<strong[^>]*>\{studentName\}<\/strong>/);
  assert.doesNotMatch(executableSource(rowBody || historyPanelSource), /<strong[^>]*>\{transaction\.studentId\}/);
});

test('the student tile award control is keyed by the teacher-visible row, not a bare id string', () => {
  assert.doesNotMatch(executableSource(awardDialogSource), /<h2[^>]*>Award \{student\?\.id/);
  assert.match(awardDialogSource, /Award \{student\?\.name \|\| 'this student'\}/);
});

// --- 11: Class Points cannot mutate grades/mastery/evidence/presence/Google Classroom/Live Challenge scoring ---

const FORBIDDEN_SURFACES = /\bgrades\b|\bpresence\b|\bmastery\b|\bevidence\b|googleClassroom|liveChallengeScore|studentWorkspaceDrafts/i;

test('classPointsClient.js never reads or writes grades/mastery/evidence/presence/Google Classroom/Live Challenge scoring', () => {
  assert.doesNotMatch(executableSource(clientSource), FORBIDDEN_SURFACES);
});

test('the award dialog and history panel never touch grades/mastery/evidence/presence', () => {
  assert.doesNotMatch(executableSource(awardDialogSource), FORBIDDEN_SURFACES);
  assert.doesNotMatch(executableSource(historyPanelSource), FORBIDDEN_SURFACES);
});

test('the Class Points wiring added to LiveClassMonitor.jsx stays out of grades/mastery/evidence — scoped to the code this phase actually added', () => {
  const stateAndEffect = region(monitorSource, '// Class Points: a live projection', 'setSpotlightRequests([]);', 'Class Points state/effect');
  const rowHelper = region(monitorSource, 'const classPointsForRow = (row) =>', 'const switchMode = (nextMode) => {', 'classPointsForRow');
  const toggleAndPanels = region(monitorSource, "setShowClassPoints((current) => !current)", '{activeSectionTimers.length > 0 &&', 'Class Points toggle/panels');
  [stateAndEffect, rowHelper, toggleAndPanels].forEach((slice) => {
    assert.doesNotMatch(executableSource(slice), FORBIDDEN_SURFACES);
  });
});

test('Class Points writes go through exactly the two existing PR #253 callables — no direct Firestore write to its collections anywhere in the teacher UI', () => {
  [clientSource, awardDialogSource, historyPanelSource].forEach((source) => {
    assert.doesNotMatch(executableSource(source), /\b(updateDoc|deleteDoc|setDoc|addDoc)\s*\([^)]*classPoint/i);
  });
  assert.match(clientSource, /httpsCallable\(functions, name\)/);
});

// --- 12: Live Teaching and Student Spotlight wiring remain intact ---

test('Live Teaching and Student Spotlight wiring survive the Class Points changes', () => {
  assert.match(monitorSource, /activeTeacherSpotlightQuery\(db, \{ teacherEmail, classId: activeClassId \}\)/);
  assert.match(monitorSource, /function LiveTeachingPanel\(/);
  assert.match(monitorSource, /onSpotlight=\{activeClassId && !activeSpotlight \? requestSpotlight : null\}/);
  assert.match(monitorSource, /liveTeachingActiveForClass/);
  assert.match(monitorSource, /StudentSpotlightView/);
});

test('the Class Points award/history surfaces are themselves scoped to an authoritative active class, same as Spotlight', () => {
  assert.match(monitorSource, /activeClassId \? \{[\s\S]{0,20}balance: classPointsBalanceFor/);
  assert.match(monitorSource, /\{showClassPoints && activeClassId && \(/);
});
