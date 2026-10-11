/*
 * THE PREREQUISITE-MET-EARLY FIX MOVES ONE CASE AND NOTHING ELSE.
 *
 * getSectionAccessState feeds the student's entry, the dashboard, the printable
 * worksheet and — through captureSectionAccessProof — the server's ingestion
 * verdict on whether a section was open when the student pressed Submit. A fix
 * there must not reopen, close, or re-grade anything except what it is for.
 *
 * The oracle below is a FROZEN COPY of getSectionAccessState as it was at
 * 3a70944, before the fix. Do not "update" it to match the module: it is the
 * definition of the old behaviour. The grid crosses statuses, release / due /
 * final-close dates on both sides of now, prerequisite absent / met / unmet /
 * unread, teacher locks and per-class overrides, every section role, excused
 * students, shared and private extensions, and class identity. Every cell must
 * answer exactly as before, except a scheduled Classwork/Practice section whose
 * prerequisite is met — which must now answer as the teacher's lock does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MANUALLY_CONTROLLABLE_SECTION_ROLES,
  getAssignmentLifecycle,
  getSectionAccessState,
} from '../../src/assignmentLifecycle.js';
import { projectCurrentAssignmentContent } from '../../src/platform/assignments/currentContentProjection.js';
import { captureSectionAccessProof, resolveLiveSectionAccess } from '../../functions/shared/submissionEnvelope.mjs';
import { sectionWasOpenAtCapture } from '../../functions/shared/studentSubmissionDisposition.mjs';

/* ---------------------------------------------------------------- the oracle
 * Frozen from src/assignmentLifecycle.js at 3a70944. `getAssignmentLifecycle`
 * and the content projection are imported because the fix did not touch them;
 * the two module-private helpers are copied verbatim. */
const OLD_SECTION_ACCESS_STATES = new Set(['open', 'closed']);
const oldScopedOverride = ({ byClassId, classId }) => {
  const overrides = byClassId && typeof byClassId === 'object' ? byClassId : {};
  return classId ? overrides[classId] || null : null;
};
const oldGetSectionAccessState = ({
  assignment, activityRole, classId = null, classPeriod: _classPeriod, nowValue = Date.now(), studentId = null, privateOverride = undefined,
}) => {
  const role = String(activityRole || '').trim().toLowerCase();
  const exists = projectCurrentAssignmentContent(assignment).entries.some((entry) => entry.logicalRole === role);
  const lifecycle = getAssignmentLifecycle(assignment, nowValue, { studentId, privateOverride });

  if (!MANUALLY_CONTROLLABLE_SECTION_ROLES.includes(role) || !exists) {
    return { role, enabled: false, status: 'unavailable', isOpen: true, defaultState: 'open', override: null, lifecycle };
  }
  if (lifecycle.isPracticeOnly) {
    return { role, enabled: true, status: 'open', isOpen: true, defaultState: 'open', override: null, lifecycle, practiceOnly: true };
  }
  if (lifecycle.isScheduled) {
    return { role, enabled: true, status: 'scheduled', isOpen: false, defaultState: 'open', override: null, lifecycle };
  }
  if (!lifecycle.isOpen) {
    return { role, enabled: true, status: 'closedAssignment', isOpen: false, defaultState: 'open', override: null, lifecycle };
  }

  const config = assignment?.sectionAccess?.[role] || {};
  const configuredDefault = String(config.defaultState || assignment?.sectionAccessDefaults?.[role] || 'open').toLowerCase();
  const defaultState = OLD_SECTION_ACCESS_STATES.has(configuredDefault) ? configuredDefault : 'open';
  const override = oldScopedOverride({ byClassId: config?.overridesByClassId, classId });
  const overrideState = String(override?.state || '').toLowerCase();
  const status = OLD_SECTION_ACCESS_STATES.has(overrideState) ? overrideState : defaultState;
  return { role, enabled: true, status, isOpen: status === 'open', defaultState, override, lifecycle };
};

/* ------------------------------------------------------------------ the grid */
const NOW = Date.parse('2026-10-05T15:00:00Z');
const at = (days) => new Date(NOW + days * 86400e3).toISOString();
const CLASS_ID = 'class-a';
const STUDENT = 's1';

const fullSections = [
  { id: 'warmup', role: 'warmup', questions: [{ activityRole: 'warmup' }] },
  { id: 'classwork', role: 'classwork', questions: [{ activityRole: 'classwork' }] },
  { id: 'practice', role: 'practice', questions: [{ activityRole: 'practice' }] },
  { id: 'dol', role: 'dol', questions: [{ activityRole: 'dol' }] },
];
const CONTENT = {
  full: fullSections,
  noPractice: fullSections.filter((section) => section.role !== 'practice'),
};
const RELEASE = { absent: {}, past: { releaseAt: at(-3) }, future: { releaseAt: at(3) }, futureLegacyField: { releaseDate: at(2) } };
// due → final, covering on time, late, closed, and the odd orders a teacher
// can save (final before due, due before release).
const DEADLINES = {
  none: {},
  onTime: { dueAt: at(5), lateDueAt: at(9) },
  dueOnly: { dueAt: at(5) },
  late: { dueAt: at(-1), lateDueAt: at(4) },
  closed: { dueAt: at(-6), lateDueAt: at(-2) },
  dueBeforeRelease: { dueAt: at(1), lateDueAt: at(2) },
  finalBeforeDue: { dueAt: at(6), lateDueAt: at(1) },
};
const PREREQUISITE = {
  absent: { patch: {}, grades: undefined },
  unread: { patch: { prerequisiteAssignmentId: 'P1' }, grades: undefined },
  empty: { patch: { prerequisiteAssignmentId: 'P1' }, grades: {} },
  unmet: { patch: { prerequisiteAssignmentId: 'P1' }, grades: { P1: { score: 80 } } },
  met: { patch: { prerequisiteAssignmentId: 'P1' }, grades: { P1: { score: 100 } } },
  metAsString: { patch: { prerequisiteAssignmentId: 'P1' }, grades: { P1: { score: '100' } } },
  otherMet: { patch: { prerequisiteAssignmentId: 'P1' }, grades: { P9: { score: 100 } } },
  noPrerequisiteButGrades: { patch: {}, grades: { P1: { score: 100 } } },
};
const changedAt = at(-1);
const ACCESS = {
  none: {},
  defaultClosed: { sectionAccess: { classwork: { defaultState: 'closed' }, practice: { defaultState: 'closed' } } },
  legacyDefaults: { sectionAccessDefaults: { practice: 'closed' } },
  overrideOpen: { sectionAccess: { practice: { defaultState: 'closed', overridesByClassId: { [CLASS_ID]: { state: 'open', changedAt } } } } },
  overrideClosed: { sectionAccess: { classwork: { overridesByClassId: { [CLASS_ID]: { state: 'closed', changedAt } } } } },
  otherClassOverride: { sectionAccess: { classwork: { overridesByClassId: { 'class-b': { state: 'closed', changedAt } } } } },
  garbage: { sectionAccess: { classwork: { defaultState: 'sideways', overridesByClassId: { [CLASS_ID]: { state: 'maybe' } } } } },
};
const STUDENTS = {
  anonymous: { studentId: null, patch: {}, privateOverride: undefined },
  plain: { studentId: STUDENT, patch: {}, privateOverride: undefined },
  excused: { studentId: STUDENT, patch: { studentOverrides: { [STUDENT]: { excused: true } } }, privateOverride: undefined },
  sharedExtension: { studentId: STUDENT, patch: { studentOverrides: { [STUDENT]: { lateDueAt: at(12) } } }, privateOverride: undefined },
  privateExtension: { studentId: STUDENT, patch: {}, privateOverride: { lateDueAt: at(12) } },
  privateExcusedReopened: { studentId: STUDENT, patch: {}, privateOverride: { excused: true, reopened: true } },
};
// `dol` takes the same branch as `warmup`; '' the same as 'quiz'.
const ROLES = ['warmup', 'classwork', 'practice', 'Classwork ', 'quiz'];
const CLASS_IDS = [CLASS_ID, null];

function* cells() {
  for (const [contentKey, sections] of Object.entries(CONTENT)) {
    for (const [releaseKey, release] of Object.entries(RELEASE)) {
      for (const [deadlineKey, deadlines] of Object.entries(DEADLINES)) {
        for (const [prereqKey, prereq] of Object.entries(PREREQUISITE)) {
          for (const [accessKey, access] of Object.entries(ACCESS)) {
            for (const [studentKey, student] of Object.entries(STUDENTS)) {
              const assignment = {
                id: 'A1', schemaVersion: 5, assignedClassIds: [CLASS_ID], sections,
                ...release, ...deadlines, ...prereq.patch, ...access, ...student.patch,
              };
              for (const activityRole of ROLES) {
                for (const classId of CLASS_IDS) {
                  yield {
                    label: [contentKey, releaseKey, deadlineKey, prereqKey, accessKey, studentKey, JSON.stringify(activityRole), classId].join(' / '),
                    prereqKey,
                    assignment,
                    args: {
                      assignment, activityRole, classId, classPeriod: 'Period 3', nowValue: NOW,
                      studentId: student.studentId, privateOverride: student.privateOverride,
                    },
                    grades: prereq.grades,
                  };
                }
              }
            }
          }
        }
      }
    }
  }
}

// What the student's section is when the prerequisite has opened the lesson:
// the teacher's lock, read as it is on an open assignment. Taken from the
// ORACLE with the dates cleared, so the expectation is not re-derived from the
// code under test.
const teacherLockAnswer = (cell) => {
  const { releaseAt: _r, releaseDate: _rd, dueAt: _d, lateDueAt: _l, ...undated } = cell.assignment;
  return oldGetSectionAccessState({ ...cell.args, assignment: undated });
};
const withoutLifecycle = ({ lifecycle: _lifecycle, ...rest }) => rest;
// Ingestion's verdict on a submission captured now, from this section answer.
const ingestionVerdict = (cell, state) => sectionWasOpenAtCapture({
  capturedSectionAccess: captureSectionAccessProof({ sectionAccess: state, capturedAt: NOW }),
  liveSectionAccess: resolveLiveSectionAccess({ assignment: cell.assignment, activityRole: state.role, classId: cell.args.classId }),
  capturedAt: NOW,
});

test('every lifecycle cell answers exactly as before, except a scheduled section whose prerequisite is met', () => {
  let total = 0;
  let changed = 0;
  let verdictMoved = 0;
  const changedPrereqKeys = new Set();
  for (const cell of cells()) {
    total += 1;
    const before = oldGetSectionAccessState(cell.args);
    const after = getSectionAccessState({ ...cell.args, classworkGradesByAssignment: cell.grades });
    const expectChange = before.status === 'scheduled' && ['met', 'metAsString'].includes(cell.prereqKey);

    if (!expectChange) {
      assert.deepEqual(after, before, cell.label);
      continue;
    }
    changed += 1;
    changedPrereqKeys.add(cell.prereqKey);
    // The lifecycle is the old one, untouched: still scheduled, no credit yet,
    // the same due/late/close dates.
    assert.deepEqual(after.lifecycle, before.lifecycle, cell.label);
    assert.equal(after.lifecycle.isScheduled, true, cell.label);
    assert.equal(after.lifecycle.creditEligible, false, cell.label);
    // The section itself is the teacher's lock, as on an open assignment.
    assert.deepEqual(withoutLifecycle(after), { ...withoutLifecycle(teacherLockAnswer(cell)), openedByPrerequisite: true }, cell.label);
    assert.notEqual(after.status, 'scheduled', cell.label);

    // Ingestion's capture-time verdict (the only grading decision this state
    // reaches). Opened early, the browser's proof and the server's live
    // section agree; and because the server never had a release gate on
    // sections, a submission it accepted before is accepted now and one it
    // refused is still refused — this is agreement, not new grades.
    const live = resolveLiveSectionAccess({ assignment: cell.assignment, activityRole: after.role, classId: cell.args.classId });
    assert.equal(after.isOpen, live.isOpen, cell.label);
    if (ingestionVerdict(cell, after) !== ingestionVerdict(cell, before)) verdictMoved += 1;
  }
  // The grid really reached both sides of the line. (Unchanged cells are
  // deepEqual including the section answer, so their capture proof — built
  // from that answer alone — cannot differ.)
  assert.ok(total > 50000, `grid too small: ${total}`);
  assert.ok(changed > 1000, `too few cells exercised the fix: ${changed}`);
  assert.deepEqual([...changedPrereqKeys].sort(), ['met', 'metAsString']);
  assert.equal(verdictMoved, 0);
});
