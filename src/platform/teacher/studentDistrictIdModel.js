// How a teacher screen shows a student's two identifiers — and how a teacher
// corrects the district one.
//
// The rules (what each ID is, which one exports, the duplicate rule) are in
// functions/shared/studentDistrictId.mjs. This module is only the words and
// the state a screen renders, shared by Student Access (the canonical place
// to manage a student's identity) and Grade Export's district ID list, so the
// two never explain the same thing differently. Teacher language only: no
// "SIS", "Firestore", "document" or "field".
//
// Pure: no Firestore, no React.

import {
  DISTRICT_ID_SOURCE,
  DISTRICT_STUDENT_ID_MAX_LENGTH,
  districtStudentIdSource,
  effectiveDistrictStudentId,
  storedDistrictStudentId,
  studentAccountIdOf,
  validateDistrictStudentIdInput,
} from '../../../functions/shared/studentDistrictId.mjs';

export const DISTRICT_ID_COPY = Object.freeze({
  accountIdLabel: 'MathMaster account ID',
  accountIdHelp: 'MathMaster’s own number for this student. They sign in with it, and all of their work, grades and history stay attached to it. It never changes.',
  districtIdLabel: 'District student ID',
  districtIdHelp: 'The district’s number for this student (TEAMS). Grade exports use only this number.',
  editAction: 'Edit district ID',
  addAction: 'Add district ID',
  saveAction: 'Save district ID',
  inputLabel: 'Correct district student ID',
  effectsHeading: 'Changing the district ID',
  effects: Object.freeze([
    'does not create a new MathMaster student;',
    'does not move, copy or delete any work, grades or history;',
    'does not change the student’s MathMaster account ID or how they sign in;',
    'changes only the number future grade exports use.',
  ]),
  differsNote: 'MathMaster account ID and district ID differ. Grade exports use the verified district ID.',
  sameNote: 'Same as the MathMaster account ID.',
  missingNote: 'No district ID on file — this student’s grades cannot be exported until one is added.',
  invalidNote: 'The district ID on file is not a valid number — this student’s grades cannot be exported until it is corrected.',
});

export const DISTRICT_ID_STATUS = Object.freeze({
  SAME: 'same',
  DIFFERS: 'differs',
  MISSING: 'missing',
  INVALID: 'invalid',
});

/**
 * What a teacher sees for one student:
 *   { accountId, districtId, status, note, tone, exportable, actionLabel }
 * `districtId` is the number grade exports use ('' when there is none);
 * `tone` is 'neutral' when nothing needs doing, 'info' for the calm
 * "they differ" note, 'warning' when the student cannot be exported.
 */
export const describeStudentDistrictId = (student = {}) => {
  const accountId = studentAccountIdOf(student);
  const source = districtStudentIdSource(student);
  const districtId = source === DISTRICT_ID_SOURCE.INVALID
    ? storedDistrictStudentId(student)
    : effectiveDistrictStudentId(student);
  const describe = (status, note, tone) => ({
    accountId,
    districtId,
    status,
    note,
    tone,
    exportable: status === DISTRICT_ID_STATUS.SAME || status === DISTRICT_ID_STATUS.DIFFERS,
    actionLabel: status === DISTRICT_ID_STATUS.MISSING ? DISTRICT_ID_COPY.addAction : DISTRICT_ID_COPY.editAction,
  });
  if (source === DISTRICT_ID_SOURCE.MISSING) return describe(DISTRICT_ID_STATUS.MISSING, DISTRICT_ID_COPY.missingNote, 'warning');
  if (source === DISTRICT_ID_SOURCE.INVALID) return describe(DISTRICT_ID_STATUS.INVALID, DISTRICT_ID_COPY.invalidNote, 'warning');
  if (districtId === accountId) return describe(DISTRICT_ID_STATUS.SAME, DISTRICT_ID_COPY.sameNote, 'neutral');
  return describe(DISTRICT_ID_STATUS.DIFFERS, DISTRICT_ID_COPY.differsNote, 'info');
};

/** What the district ID box keeps of what was typed: digits, at most 20. */
export const sanitizeDistrictIdDraft = (value) => String(value ?? '').replace(/\D/g, '').slice(0, DISTRICT_STUDENT_ID_MAX_LENGTH);

/** The same validation the server runs, for the form: { ok, value } | { ok, error }. */
export const validateDistrictIdDraft = (value) => validateDistrictStudentIdInput(value);

/**
 * The line under the box once a valid, different number is typed, so the
 * change is deliberate: "Future grade exports will use district ID 222222
 * instead of district ID 111111." Empty when there is nothing to preview.
 * Every number is labelled: an old district ID is often the student's own
 * MathMaster ID, and an unlabelled one reads like a name.
 */
export const districtIdChangePreview = ({ currentDistrictId = '', draft = '' } = {}) => {
  const checked = validateDistrictStudentIdInput(draft);
  if (!checked.ok) return '';
  const current = String(currentDistrictId || '').trim();
  if (checked.value === current) return `District ID ${checked.value} is already this student’s district ID. Saving confirms it.`;
  return current
    ? `Future grade exports will use district ID ${checked.value} instead of district ID ${current}.`
    : `Future grade exports will use district ID ${checked.value}.`;
};

/**
 * The confirmation after a save. `previousDistrictId` is what exports used
 * before (the server's previousSisStudentId). When it differs, the teacher is
 * told the part MathMaster cannot do: grades already in TEAMS under the old
 * number stay there until removed in TEAMS.
 */
export const districtIdSavedMessage = ({ studentName = '', previousDistrictId = '', districtId = '' } = {}) => {
  const next = String(districtId || '').trim();
  const previous = String(previousDistrictId || '').trim();
  const who = String(studentName || '').trim();
  const saved = `District ID updated${who ? ` for ${who}` : ''}. The student’s MathMaster account, work, and grades were not changed. Future grade exports will use ${next}.`;
  if (!previous || previous === next) return saved;
  return `${saved} Grades already sent to TEAMS under old district ID ${previous} are not moved by MathMaster — export them again from Grade Export, and remove any grade that landed under district ID ${previous} in TEAMS.`;
};
