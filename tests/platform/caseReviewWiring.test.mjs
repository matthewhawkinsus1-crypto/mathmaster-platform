// The Student Case Review is reached from the student drawer, loads only when
// opened, reads one student through rules-guarded readers and a read-only
// callable, stacks between the drawer and the Support Evidence Report, and
// prints only itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { region, executableSource } from './helpers/sourceContract.mjs';
import { caseReviewWindow } from '../../src/platform/caseReview/caseReviewStore.js';
import { CASE_EVIDENCE_LIMITS } from '../../functions/shared/caseReviewEvidence.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const drawer = read('src/components/teacher/StudentProfileDrawer.jsx');
const view = read('src/components/teacher/caseReview/StudentCaseReviewView.jsx');
const store = read('src/platform/caseReview/caseReviewStore.js');
const css = read('src/components/teacher/caseReview/caseReview.css');
const functionsIndex = read('functions/index.js');
const caseComponentDir = new URL('../../src/components/teacher/caseReview/', import.meta.url);
const caseComponents = readdirSync(caseComponentDir).filter((name) => name.endsWith('.jsx'))
  .map((name) => ({ name, source: readFileSync(new URL(name, caseComponentDir), 'utf8') }));

test('App loads the case review lazily and mounts it between the drawer and the Support Evidence Report', () => {
  assert.match(app, /const StudentCaseReviewView = lazy\(\(\) => import\('\.\/components\/teacher\/caseReview\/StudentCaseReviewView\.jsx'\)\);/);
  const executable = executableSource(app);
  assert.doesNotMatch(executable, /import StudentCaseReviewView from/, 'never imported eagerly');
  assert.doesNotMatch(executable, /from '\.\/platform\/caseReview\//, 'no case review module in the main bundle');
  const mountAt = app.indexOf('<StudentCaseReviewView');
  assert.ok(mountAt > app.indexOf('<StudentProfileDrawer'), 'after the drawer, so it stacks above the student it was opened from');
  assert.ok(mountAt < app.indexOf('<SupportEvidenceReportView'), 'before the support report, which it can open on top of itself');
  const mount = region(app, '<StudentCaseReviewView', '/>', 'case review mount');
  assert.match(mount, /onClose=\{\(\) => setCaseReviewStudentId\(null\)\}/);
  assert.match(mount, /onInspectResponse=\{\(target\) => setResponseInspectorTarget\(target\)\}/);
  assert.match(mount, /onOpenSupportReport=\{\(studentId\) => setSupportReportStudentId\(studentId\)\}/);
  assert.match(mount, /teacherEmail=\{user\?\.email \|\| ''\}/);
  assert.match(region(app, 'const caseStudent = caseReviewStudentId', '</Suspense>', 'case review block'), /<Suspense fallback=\{null\}>/);
});

test('the drawer offers the entry to teachers only, and loads nothing itself', () => {
  const drawerMount = executableSource(region(app, '<StudentProfileDrawer', '/>', 'drawer mount'));
  assert.match(drawerMount, /onOpenCaseReview=\{user\?\.role === 'teacher' \? \(studentId\) => setCaseReviewStudentId\(studentId\) : null\}/);
  const entry = region(drawer, '{onOpenCaseReview && studentId && (', '\n          )}', 'drawer entry');
  assert.match(entry, /data-case-review-entry=\{studentId\}/);
  assert.match(entry, /Academic evidence deep dive/);
  assert.match(entry, /onClick=\{\(\) => onOpenCaseReview\(studentId\)\}/);
  assert.doesNotMatch(executableSource(drawer), /caseReview\//, 'the drawer imports no case review code');
});

test('building reads one student through the store, then the model is a pure function of what was read', () => {
  assert.match(view, /import \{ db, functions \} from '\.\.\/\.\.\/\.\.\/firebase\.js';/);
  assert.match(view, /import \{ loadStudentCaseRecords, saveSisSnapshot \} from '\.\.\/\.\.\/\.\.\/platform\/caseReview\/caseReviewStore\.js';/);
  assert.match(view, /import \{ buildStudentCaseReview \} from '\.\.\/\.\.\/\.\.\/platform\/caseReview\/studentCaseReview\.js';/);
  const build = region(view, 'const build = async () => {', '\n  };', 'build');
  assert.match(build, /loadStudentCaseRecords\(\{\s*db, functions, student, assignments, gradingPeriodSettings, selection: chosen, teacherEmail,\s*\}\)/);
  const memo = region(view, 'const model = useMemo(() => {', '\n  }, [', 'model memo');
  assert.match(memo, /buildStudentCaseReview\(\{/);
  assert.match(memo, /sisSnapshot: sis\.snapshot,/);
  assert.match(memo, /sisConfirmedMatches: sis\.confirmedMatches,/);
  assert.match(memo, /caseEvidence: records\.caseEvidence,/);
  assert.match(memo, /nowValue: records\.loadedAtMs,/);
});

test('the store fails on required records and degrades optional ones to "not loaded"', () => {
  const loader = region(store, 'export const loadStudentCaseRecords = async', '\n};', 'loader');
  assert.match(loader, /const record = await fetchStudentGradeRecord\(\{ db, studentId \}\);\n  if \(!record\) throw new Error/);
  // Awaited bare — no .catch turning a failed read into "no support records".
  assert.match(loader, /const supportRecords = await loadStudentSupportRecords\(\{\n[^\n]*\n  \}\);/);
  assert.match(loader, /await Promise\.allSettled\(\[/);
  assert.match(loader, /sessionSummaries: historyValue \? historyValue\.summaries \|\| \[\] : undefined,/);
  assert.match(loader, /exportSnapshots: transferValue \? transferValue\.snapshots : null,/);
  assert.match(loader, /\.slice\(0, CASE_EVIDENCE_LIMITS\.maxAssignments\)/);
});

test('the evidence window follows the selection and never exceeds what the callable accepts', () => {
  const nowMs = Date.parse('2026-10-12T15:00:00Z');
  const chosen = caseReviewWindow({ included: [], selection: { fromDateKey: '2026-09-01', toDateKey: '2026-09-30' }, nowMs });
  assert.ok(chosen.fromMs <= Date.parse('2026-09-01T05:00:00Z') && chosen.toMs >= Date.parse('2026-10-01T04:59:59Z'), 'covers both school days in full');
  const anchored = caseReviewWindow({ included: [{ assignment: { releaseAt: '2026-09-15T08:00:00-05:00' } }], selection: {}, nowMs });
  assert.equal(anchored.fromMs, Date.parse('2026-09-15T08:00:00-05:00') - 30 * 86400000);
  assert.equal(anchored.toMs, nowMs);
  const wide = caseReviewWindow({ included: [], selection: { fromDateKey: '2024-01-01' }, nowMs });
  assert.ok(wide.toMs - wide.fromMs < CASE_EVIDENCE_LIMITS.maxRangeDays * 86400000, 'clamped to the callable range');
});

test('the evidence callable is read-only, teacher-only, and authorizes before it reads', () => {
  const callable = region(functionsIndex, 'exports.loadStudentCaseEvidence = onCall(async (request) => {', '\n});', 'callable');
  const code = executableSource(callable);
  assert.match(code, /^exports\.loadStudentCaseEvidence = onCall\(async \(request\) => \{\s*await requireTeacher\(request\);/);
  assert.doesNotMatch(code, /\.(?:set|update|add|delete|create)\(|\bbatch\(|runTransaction|FieldValue/, 'no writes of any kind');
  const authorizedAt = code.indexOf('if (!decision.allowed)');
  assert.ok(authorizedAt > 0);
  ['collection("evidenceEvents")', 'SUBMISSION_RECEIPT_COLLECTION', 'db.getAll(', 'collection("gradeOverrideAudits")'].forEach((read) => {
    assert.ok(code.indexOf(read) > authorizedAt, `${read} happens after authorization`);
  });
  assert.match(code, /fieldMask: \["practice", "practiceUpdatedAt", "updatedAt"\]/, 'a draft\'s saved work is never read');
});

test('Escape closes the case review only when it is the top layer and nothing above handled it', () => {
  // The shell is the shared modal Dialog (src/ui/Dialog.jsx): it answers Escape
  // only when it is the topmost Dialog and nothing above already handled the
  // key, marks it handled, and stays open while printing.
  const dialog = read('src/ui/Dialog.jsx');
  assert.match(view, /import Dialog from '\.\.\/\.\.\/\.\.\/ui\/Dialog\.jsx';/);
  const shell = region(view, '<Dialog as="article"', '\n', 'case review shell');
  assert.match(shell, /ref=\{shellRef\}/);
  assert.match(shell, /className="cr-shell"/);
  assert.match(shell, /onClose=\{closeIfTopLayer\}/);
  assert.match(shell, /closeOnEscape=\{!printing\}/);
  // Topmost Dialog, not covered by a later non-Dialog modal, key not handled.
  assert.match(dialog, /const onTop = \(\) => isTopDialog\(token\) && !coveredByForeignModal\(dialog\);/);
  assert.match(dialog, /if \(handledInside \|\| !onTop\(\)\) return;/);
  assert.match(dialog, /if \(escapeRef\.current && typeof onCloseRef\.current === 'function'\) \{\s*event\.stopPropagation\(\);\s*event\.preventDefault\(\);/);
  assert.match(dialog, /<Tag ref=\{setRef\} role=\{role\} aria-modal="true"/);
  // A modal above it that is not a Dialog (a Toast confirmation) is found by
  // DOM order.
  const guard = region(view, 'const closeIfTopLayer = () => {', '\n  };', 'top-layer guard');
  assert.match(guard, /if \(modals\.length && modals\[modals\.length - 1\] !== shellRef\.current\) return;\n\s*onCloseRef\.current\?\.\(\);/);
});

test('printing renders the print copy onto <body> and hides the app while it prints', () => {
  const print = region(view, 'if (!printing) return undefined;', '\n  }, [printing]);', 'print effect');
  assert.match(print, /document\.body\.classList\.add\('cr-printing'\);/);
  assert.match(print, /window\.addEventListener\('afterprint', done\);/);
  assert.match(print, /document\.body\.classList\.remove\('cr-printing'\);/);
  assert.match(view, /\{printing && model && createPortal\(\s*<div className="cr-print-root"><CasePrintView model=\{model\} nextSteps=\{nextSteps\} \/><\/div>,\s*document\.body,\s*\)\}/);
  const printCss = region(css, '@media print {', '\n}\n', 'print css');
  assert.match(printCss, /body\.cr-printing > :not\(\.cr-print-root\) \{ display: none !important; \}/);
  assert.match(printCss, /\.cr-print-root, \.cr-print-root \* \{ visibility: visible !important; \}/);
});

test('downloads use the model\'s own serialisers, with the teacher\'s next steps labelled', () => {
  const exportsFor = region(view, 'const exportsFor = (kind) => {', '\n  };', 'exports');
  assert.match(exportsFor, /download\(caseReviewJson\(model, \{ nextSteps \}\), caseReviewFileName\(model, '', 'json'\), 'application\/json'\)/);
  assert.match(exportsFor, /download\(caseAssignmentsCsv\(model\), caseReviewFileName\(model, 'assignments', 'csv'\), 'text\/csv'\)/);
  assert.match(exportsFor, /download\(caseQuestionsCsv\(model\), caseReviewFileName\(model, 'questions', 'csv'\), 'text\/csv'\)/);
  assert.match(exportsFor, /download\(caseFactsCsv\(model\), caseReviewFileName\(model, 'facts', 'csv'\), 'text\/csv'\)/);
  const printView = caseComponents.find((entry) => entry.name === 'CasePrintView.jsx').source;
  assert.match(printView, /<section data-teacher-authored>[\s\S]*TEACHER_AUTHORED_LABEL/);
});

test('no case review screen reads an answer key or a response field', () => {
  caseComponents.forEach(({ name, source }) => {
    assert.doesNotMatch(executableSource(source), /\.(?:correctAnswer|acceptableAnswers|answerSpec|answerKey|solution|workedSolution|expected|response|lastResponse|algebraState|stepGrades)\b/, name);
  });
});

test('the support tab reuses PR #401\'s classification tag and styles', () => {
  const support = caseComponents.find((entry) => entry.name === 'CaseSupportTab.jsx').source;
  assert.match(support, /import \{ SupportClassificationTag \} from '\.\.\/SupportProfileEditor\.jsx';/);
  assert.match(view, /import '\.\.\/supportEvidence\.css';/);
});
