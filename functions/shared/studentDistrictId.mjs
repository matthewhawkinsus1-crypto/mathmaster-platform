// What a student's DISTRICT (SIS) ID is in MathMaster, and what it is not.
//
// A student has two numbers that can look identical and mean different things:
//
//   account ID   grades/{studentId} — MathMaster's stable, internal key. Every
//                attempt, grade, evidence event, Classroom link, PIN
//                credential, sign-in alias and Google link carries it. The
//                student signs in with it. It never changes.
//   district ID  grades/{studentId}.sisStudentId — the district's number for
//                the student (TEAMS, Skyward). It addresses grade exports and
//                matches the district's own files. Nothing else uses it.
//
// The district ID is a separate field precisely so it can be wrong and be
// corrected. A student who typed a mistaken — but perfectly valid-looking —
// number when the account was made keeps that number as their account ID
// forever (renaming grades/{id} would orphan their whole history); a teacher
// corrects only the district ID (setStudentSisId, functions/index.js), and
// every export from then on uses the corrected number.
//
// Legacy roster records may have no stored district ID. An all-digit account
// ID then stands in for it (effectiveDistrictStudentId), because for those
// students it was the district number. Once a district ID is stored, the
// account ID is never read as a district ID again: if the two differ, the
// account ID is a KNOWN-WRONG district number — possibly another child's — so
// nothing may export under it or match a district row by it.
//
// This module is the single definition of those rules, shared by:
//
//   the server   setStudentSisId and createStudentAccount (format, the
//                duplicate rule and its messages)
//   the browser  Grade Export (gradeTransferModel.js), Student Access, the
//                case review's gradebook import, the Classroom identity bridge
//   the tests    tests/platform/studentDistrictIdCorrection.test.mjs and
//                friends, and the teacher-workflow harness fake
//
// Pure: no Firestore, no React, no Node built-ins.

const DISTRICT_ID_PATTERN = /^\d{1,20}$/;

/** The longest district ID MathMaster stores (TEAMS numbers are far shorter). */
export const DISTRICT_STUDENT_ID_MAX_LENGTH = 20;

/** Teacher-facing: why a typed district ID was refused. */
export const DISTRICT_ID_FORMAT_ERROR = 'A district student ID is 1–20 digits, with no letters, spaces or punctuation.';
export const DISTRICT_ID_REQUIRED_ERROR = 'Enter the district student ID.';

const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

/** Digits only, 1–20 of them. */
export const isValidDistrictStudentId = (value) => DISTRICT_ID_PATTERN.test(text(value));

/**
 * Server-side and form validation for a district ID a person typed. Strict on
 * purpose: nothing is stripped or guessed, so what is saved is what was typed.
 */
export const validateDistrictStudentIdInput = (value) => {
  const clean = text(value);
  if (!clean) return { ok: false, error: DISTRICT_ID_REQUIRED_ERROR };
  if (!DISTRICT_ID_PATTERN.test(clean)) return { ok: false, error: DISTRICT_ID_FORMAT_ERROR };
  return { ok: true, value: clean };
};

/** MathMaster's internal account ID (the grades document id). */
export const studentAccountIdOf = (record = {}) => text(record?.studentId) || text(record?.id);

/** The district ID stored on the record, exactly as stored ('' when none). */
export const storedDistrictStudentId = (record = {}) => text(record?.sisStudentId);

/**
 * The number grade exports use for this student: the stored district ID; for
 * a legacy record with none stored, an all-digit account ID; otherwise ''.
 * A stored value wins even when it is invalid — an invalid stored ID is a
 * problem to repair, never a reason to fall back to the account ID.
 */
export const effectiveDistrictStudentId = (record = {}) => {
  const stored = storedDistrictStudentId(record);
  if (stored) return stored;
  const account = studentAccountIdOf(record);
  return isValidDistrictStudentId(account) ? account : '';
};

export const DISTRICT_ID_SOURCE = Object.freeze({
  /** A valid district ID is stored on the record. */
  STORED: 'stored',
  /** None stored; the all-digit account ID stands in (legacy records). */
  ACCOUNT_ID: 'accountId',
  /** None stored, and the account ID is not a number (an email-style key). */
  MISSING: 'missing',
  /** A stored value that is not a valid district ID. */
  INVALID: 'invalid',
});

export const districtStudentIdSource = (record = {}) => {
  const stored = storedDistrictStudentId(record);
  if (stored) return isValidDistrictStudentId(stored) ? DISTRICT_ID_SOURCE.STORED : DISTRICT_ID_SOURCE.INVALID;
  return isValidDistrictStudentId(studentAccountIdOf(record)) ? DISTRICT_ID_SOURCE.ACCOUNT_ID : DISTRICT_ID_SOURCE.MISSING;
};

/**
 * One district number, however many leading zeros it was written with. A
 * district file or spreadsheet often drops them, so '0222222' and '222222'
 * are the same student there (the case review's gradebook matcher already
 * reads them that way).
 */
export const canonicalDistrictStudentId = (value) => {
  const clean = text(value);
  if (!isValidDistrictStudentId(clean)) return '';
  return clean.replace(/^0+/, '') || '0';
};

export const sameDistrictStudentId = (left, right) => {
  const a = canonicalDistrictStudentId(left);
  return Boolean(a) && a === canonicalDistrictStudentId(right);
};

/**
 * Every way the same district number can be stored: the canonical digits with
 * 0..n leading zeros, up to the 20-digit limit. At most 20 values, so one
 * Firestore `in` query (limit 30) and one getAll cover them all.
 */
export const districtStudentIdVariants = (value) => {
  const canonical = canonicalDistrictStudentId(value);
  if (!canonical) return [];
  const variants = [];
  for (let length = canonical.length; length <= DISTRICT_STUDENT_ID_MAX_LENGTH; length += 1) {
    variants.push(canonical.padStart(length, '0'));
  }
  return variants;
};

/**
 * True when this record's all-digit account ID is NOT its district ID: a valid,
 * different district ID is stored. The account ID is then the number that was
 * corrected away from — never to be exported under, or matched against a
 * district file, again.
 */
export const accountIdIsSupersededDistrictId = (record = {}) => {
  const account = studentAccountIdOf(record);
  const stored = storedDistrictStudentId(record);
  return isValidDistrictStudentId(account)
    && isValidDistrictStudentId(stored)
    && !sameDistrictStudentId(account, stored);
};

/**
 * The ids under which a row in an outside file (a district gradebook export, a
 * pasted roster list) may be matched to this student: the effective district
 * ID, then the account ID — unless the account ID is a superseded district
 * number, which may belong to another child.
 */
export const districtIdMatchKeys = (record = {}) => {
  const keys = [effectiveDistrictStudentId(record)];
  if (!accountIdIsSupersededDistrictId(record)) keys.push(studentAccountIdOf(record));
  return [...new Set(keys.filter(Boolean))];
};

// ---------------------------------------------------------------------------
// The duplicate rule.
//
// A district ID may be given to a student only when no OTHER MathMaster
// student already answers to that number:
//
//   - another record stores it as its district ID; or
//   - another record's account ID is that number. For a legacy record with no
//     stored district ID, that account ID IS its district ID. For a record
//     whose district ID was corrected away from it, it is still the number
//     that student signs in with, and a district file row under it may be
//     theirs from before the correction. Either way it needs a person to look
//     at both students, so it is refused too.
//
// Leading zeros do not make a different number (canonicalDistrictStudentId).
// A refusal names no other student: the teacher may not be allowed to see
// them. Students are never merged, and nothing is written.
// ---------------------------------------------------------------------------

export const DISTRICT_ID_CONFLICT = Object.freeze({
  DISTRICT_ID_IN_USE: 'district-id-in-use',
  ACCOUNT_ID_IN_USE: 'account-id-in-use',
});

// `creating`: the refusal is for a new account (createStudentAccount), whose
// account ID becomes its district ID too, rather than for a correction.
export const districtIdInUseMessage = (districtId, { creating = false } = {}) => (creating
  ? `District ID ${text(districtId)} already belongs to another MathMaster student, so no account was created. `
    + 'Check the number against the district record. If it is right, review the existing student before creating another.'
  : `District ID ${text(districtId)} already belongs to another MathMaster student, so it was not saved. Nothing was changed. `
    + 'Check the number against the district record. If it is right, ask your MathMaster administrator to review both students before changing either one.');

export const accountIdInUseMessage = (districtId, { creating = false } = {}) => (creating
  ? `Another MathMaster student's account ID is the same district number as ${text(districtId)} (leading zeros do not make a different number), so no account was created. `
    + 'Check the number against the district record.'
  : `${text(districtId)} is another MathMaster student's account ID, so it cannot also be this student's district ID. Nothing was changed. `
    + 'Check the number against the district record. If it is right, ask your MathMaster administrator to review both students.');

/**
 * `studentId`        the student being given the district ID
 * `districtId`       the candidate district ID
 * `districtIdHolders` ids of records whose stored sisStudentId is the
 *                    candidate (any leading-zero variant)
 * `accountIdHolders` ids of existing records whose account ID is the
 *                    candidate (any leading-zero variant)
 *
 * Returns null, or { kind, otherStudentId, message }. otherStudentId is for
 * tests and investigation — never shown to the teacher.
 */
export const findDistrictStudentIdConflict = ({
  studentId = '', districtId = '', districtIdHolders = [], accountIdHolders = [], creating = false,
} = {}) => {
  const self = text(studentId);
  const others = (ids) => (Array.isArray(ids) ? ids : []).map(text).filter((id) => id && id !== self);
  const [districtHolder] = others(districtIdHolders);
  if (districtHolder) {
    return { kind: DISTRICT_ID_CONFLICT.DISTRICT_ID_IN_USE, otherStudentId: districtHolder, message: districtIdInUseMessage(districtId, { creating }) };
  }
  const [accountHolder] = others(accountIdHolders);
  if (accountHolder) {
    return { kind: DISTRICT_ID_CONFLICT.ACCOUNT_ID_IN_USE, otherStudentId: accountHolder, message: accountIdInUseMessage(districtId, { creating }) };
  }
  return null;
};

/**
 * Who may set or correct a student's district ID: the root administrator, the
 * student's roster teacher, or the teacher of record of the student's class —
 * the same people who may correct the student's name (setStudentName).
 * `classRecord` is needed only when the first two do not already decide it.
 */
export const mayChangeStudentDistrictId = ({ callerEmail = '', isRootAdmin = false, student = {}, classRecord = null } = {}) => {
  const email = text(callerEmail).toLowerCase();
  if (isRootAdmin === true) return true;
  if (!email) return false;
  if (text(student?.assignedTeacherEmail).toLowerCase() === email) return true;
  return Boolean(classRecord) && text(classRecord?.teacherOfRecord).toLowerCase() === email;
};

/**
 * The audit details of one district ID change, and the response the teacher's
 * screen receives. `previous` is what was stored (null when nothing was) and
 * what exports used before (the effective district ID, which for a legacy
 * record is the account ID).
 */
export const districtIdChangeRecord = ({ studentId = '', student = {}, districtId = '', classId = null } = {}) => {
  const record = { ...student, studentId: text(studentId) };
  const previousStored = storedDistrictStudentId(record) || null;
  const previousExportId = effectiveDistrictStudentId(record) || null;
  const next = text(districtId);
  return {
    details: {
      previous: { sisStudentId: previousStored, exportId: previousExportId },
      next: { sisStudentId: next },
      classId: text(classId) || null,
    },
    response: {
      studentId: text(studentId),
      sisStudentId: next,
      previousSisStudentId: previousExportId,
      changed: previousExportId !== next,
    },
  };
};
