// LANGUAGE SUPPORTS IN THE TEACHER'S EVIDENCE — WHAT WAS AVAILABLE, AND THEN USE.
//
// The headline is what MathMaster made available or provided, out of the work
// where it applied; use is supplemental and never lowers it. A language on the
// profile is never counted as translated content: an item with none is an
// implementation gap with its reason. Synthetic data only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { buildAssignmentEvidenceRow } from '../../src/platform/supportEvidence/evidenceAggregation.js';
import { buildSupportEvidenceReport, describeEvidenceDetails, supportHeadline } from '../../src/platform/supportEvidence/supportEvidenceReport.js';
import { launchSupportRecords } from '../../src/platform/supportEvidence/studentSupportTelemetry.js';
import { normalizeStudentProfile, studentSupportTools } from '../../src/studentSupport.js';
import { editorGroups, languageCoverageNote } from '../../src/platform/supportEvidence/supportProfileDraft.js';
import { region, executableSource } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-10-20T15:00:00Z');
const EB_REVISION = {
  id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
  sourceLabel: 'Language plan (synthetic)', createdByEmail: 't@example.test', createdAtMs: Date.parse('2026-08-17T14:00:00Z'),
  inclusionStatus: false, translationLanguage: 'es',
  accommodations: ['glossary-lookup', 'chunked-directions', 'sentence-frames', 'text-to-speech'].map((id) => ({ id, params: {}, appliesTo: [] })),
  modifications: [],
};
const profile = buildSupportProjection({ revisions: [EB_REVISION], todayKey: '2026-10-20' });
const lesson = (id, dueAt) => ({
  id, title: `Lesson ${id}`, schemaVersion: 5, assignedClassIds: ['class-a'], dueAt,
  sections: [{ id: 'c', role: 'classwork', questions: [{ questionId: `${id}-1`, type: 'numeric', prompt: 'Solve.', standard: 'A.5A' }] }],
});
const ASSIGNMENTS = [lesson('L1', '2026-10-06'), lesson('L2', '2026-10-08'), lesson('L3', '2026-10-10')];
const student = {
  id: 'S1', classId: 'class-a', profile,
  gradesByAssignment: Object.fromEntries(ASSIGNMENTS.map((assignment) => [assignment.id, { 0: { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-05T15:00:00Z' } }])),
};
let n = 0;
const event = (assignmentId, supportId, eventType, details = null) => {
  n += 1;
  return {
    id: `e${n}`, studentId: 'S1', assignmentId, supportId, eventType, details,
    source: 'automatic-telemetry', actorType: eventType === 'used' ? 'student' : 'system', occurredAtMs: Date.parse('2026-10-05T14:00:00Z') + n,
  };
};

test('the brief\'s report: Translation available in 3 of 3, used in 2; Break it down provided; no usage gaps', () => {
  const evidence = [
    ...['L1', 'L2'].map((id) => event(id, 'translation', 'available', { language: 'es', provider: 'curated', coverage: 'full' })),
    event('L3', 'translation', 'available', { language: 'es', provider: 'curated', coverage: 'partial' }),
    event('L1', 'translation', 'used'), event('L2', 'translation', 'used'),
    ...['L1', 'L2', 'L3'].flatMap((id) => [
      event(id, 'glossary-lookup', 'available', { itemCount: 4 }),
      event(id, 'chunked-directions', 'provided', { deliveryMode: 'automatic', itemCount: 3 }),
      event(id, 'text-to-speech', 'available'),
    ]),
    event('L1', 'sentence-frames', 'available', { itemCount: 4 }), event('L2', 'sentence-frames', 'available', { itemCount: 4 }),
    event('L3', 'sentence-frames', 'not-applicable', { reason: 'no-explanation-asked' }),
    event('L2', 'glossary-lookup', 'used'),
  ];
  const report = buildSupportEvidenceReport({
    student, assignments: ASSIGNMENTS, revisions: [EB_REVISION], evidence,
    selection: { fromDateKey: '2026-09-01', toDateKey: '2026-10-20' }, nowValue: NOW,
  });
  const support = (id) => report.summary.supports.find((entry) => entry.supportId === id);
  assert.equal(supportHeadline(support('translation')), 'Available in 3 of 3 eligible (some items untranslated in 1)');
  assert.equal(support('translation').assignmentsUsed, 2);
  assert.equal(supportHeadline(support('glossary-lookup')), 'Available in 3 of 3 eligible');
  assert.equal(support('glossary-lookup').assignmentsUsed, 1);
  assert.equal(supportHeadline(support('chunked-directions')), 'Provided in 3 of 3 eligible');
  assert.equal(support('chunked-directions').tracksUse, false, 'an automatic support has no "used" to miss');
  assert.equal(supportHeadline(support('sentence-frames')), 'Available in 2 of 2 eligible');
  assert.equal(support('sentence-frames').assignmentsNotApplicable, 1);
  // Not using an on-demand tool is the student's choice, never a gap.
  report.assignments.forEach((row) => assert.ok(!row.gaps.some((gap) => ['translation', 'glossary-lookup', 'sentence-frames', 'text-to-speech'].includes(gap.supportId)), row.assignmentId));
  // The profile lists translation, from the language.
  const listed = report.profile.current.accommodations.find((entry) => entry.id === 'translation');
  assert.match(listed.detail, /Spanish/);
});

test('a language with no translated content is an implementation gap, with its reason — never "provided"', () => {
  const row = buildAssignmentEvidenceRow({
    assignment: ASSIGNMENTS[0], student, revisions: [EB_REVISION],
    evidence: [event('L1', 'translation', 'unavailable', { language: 'es', reason: 'no-translation-resource', surface: 'path' })],
    nowValue: NOW,
  });
  const translation = row.supports.find((entry) => entry.supportId === 'translation');
  assert.deepEqual([translation.configured, translation.available, translation.unavailable], [true, 0, 1]);
  const gap = row.gaps.find((entry) => entry.code === 'support-unavailable' && entry.supportId === 'translation');
  assert.match(gap.message, /could not provide it in this work \(no translated content for this item\)/);
  assert.equal(describeEvidenceDetails({ supportId: 'translation', details: { language: 'es', reason: 'no-translation-resource', surface: 'path' } }),
    'Spanish (Español) · no translated content for this item · on My Math Path');
});

test('Vocabulary was a staff support: a staff record still proves it, and older work predates its recording', () => {
  // No platform record of the tool yet: work predates its recording.
  const before = buildAssignmentEvidenceRow({ assignment: ASSIGNMENTS[0], student, revisions: [EB_REVISION], evidence: [], nowValue: NOW });
  const gap = before.gaps.find((entry) => entry.supportId === 'glossary-lookup');
  assert.match(gap.message, /predates support recording/);
  // A staff record of delivery is still evidence.
  const staff = { id: 's1', studentId: 'S1', assignmentId: 'L1', supportId: 'glossary-lookup', eventType: 'teacher-documented', actorType: 'teacher', actorEmail: 't@example.test', occurredAtMs: Date.parse('2026-10-05T16:00:00Z') };
  const documented = buildAssignmentEvidenceRow({ assignment: ASSIGNMENTS[0], student, revisions: [EB_REVISION], evidence: [staff], nowValue: NOW });
  assert.ok(!documented.gaps.some((entry) => entry.supportId === 'glossary-lookup'));
  // Once the platform records it, a later assignment without a record is a real gap.
  const later = buildAssignmentEvidenceRow({
    assignment: lesson('L9', '2026-10-15'),
    student: { ...student, gradesByAssignment: { L9: { 0: { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-14T15:00:00Z' } } } },
    revisions: [EB_REVISION], evidence: [event('L1', 'glossary-lookup', 'available', { itemCount: 2 })], nowValue: NOW,
  });
  assert.match(later.gaps.find((entry) => entry.supportId === 'glossary-lookup').message, /no record that it was on screen/);
});

test('the language tools are recorded per question where backed — never at launch from the profile alone', () => {
  const normalized = normalizeStudentProfile(profile, { nowValue: NOW });
  const { records } = launchSupportRecords({ profile: normalized, assignment: ASSIGNMENTS[0], roles: ['classwork'], nowValue: NOW });
  ['translation', 'glossary-lookup', 'chunked-directions', 'sentence-frames', 'text-to-speech']
    .forEach((supportId) => assert.ok(!records.some((record) => record.supportId === supportId), supportId));
  // The student's assignment-level summary names Translate without a tick.
  assert.ok(studentSupportTools(profile, { nowValue: NOW }).tools.some((tool) => tool.supportId === 'translation' && tool.label === 'Translate'));
});

test('the teacher configures a language once: no Translation box, and the coverage is said plainly', () => {
  const ids = [...editorGroups().platformAccommodations, ...editorGroups().staffAccommodations].flatMap((group) => group.items.map((entry) => entry.id));
  assert.ok(!ids.includes('translation'));
  ['glossary-lookup', 'chunked-directions', 'sentence-frames'].forEach((id) => assert.ok(ids.includes(id), id));
  assert.match(languageCoverageNote('es'), /never counted as provided/);
  assert.match(languageCoverageNote('vi'), /only items with an authored translation/);
  assert.match(languageCoverageNote(''), /no separate Translation box/);
  const editor = readFileSync(new URL('../../src/components/teacher/SupportProfileEditor.jsx', import.meta.url), 'utf8');
  assert.match(editor, /<span className="se-hint" data-language-coverage>\{languageCoverageNote\(draft\.translationLanguage\)\}<\/span>/);
});

test('the tray is wired into questions, Work View and the Path, and loads lazily', () => {
  const tools = readFileSync(new URL('../../src/components/student/StudentSupportTools.jsx', import.meta.url), 'utf8');
  assert.match(tools, /const SupportToolsTray = lazy\(\(\) => import\('\.\/supportTools\/SupportToolsTray\.jsx'\)\);/);
  assert.match(tools, /if \(!entitlement\?\.tools\?\.length\) return null;/);
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  assert.match(engine, /supportEntitlement \|\| toolsEntitlementFromProfile\(stableStudentProfile, \{ activityRole(?:, universalDesignRole: explicitActivityRole)? \}\)/);
  assert.match(engine, /supportTray=\{supportTrayFor\('assignment'\)\}/);
  assert.match(engine, /supports: languageTools\.tools\.length \? \{ label: 'Support tools', render: \(\) => supportTrayFor\('enlarged'\) \} : null,/);
  assert.match(engine, /onEvidence=\{reportToolEvidence\}/);
  const shell = readFileSync(new URL('../../src/components/common/EnlargeableFigure.jsx', import.meta.url), 'utf8');
  assert.match(shell, /\{enlarged && drawer === 'supports' \? supports\.render\(\) : null\}/);
  const viewport = executableSource(readFileSync(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8'));
  assert.equal((viewport.match(/<div className="mathmaster-question-support-tray">\{supportTray\}<\/div>/g) || []).length, 3, 'phone, desktop and focused workspace');
  const bar = readFileSync(new URL('../../src/components/student/PathSupportBar.jsx', import.meta.url), 'utf8');
  assert.match(bar, /toolsEntitlementFromPath\(\{ applicableSupports: applicable, translationLanguage: supportLanguage \}\)/);
  assert.match(bar, /surface="path"/);
  const player = readFileSync(new URL('../../src/components/student/PathSessionPlayer.jsx', import.meta.url), 'utf8');
  const mount = region(player, '<PathSupportBar', '/>', 'Path support bar mount');
  assert.match(mount, /supportLanguage=\{supportLanguage\}/);
  assert.match(player, /const supportLanguage = questionInstance\?\.supportLanguage \|\| null;/);
  assert.match(mount, /prompt=\{questionInstance\?\.prompt \|\| ''\}/);
});
