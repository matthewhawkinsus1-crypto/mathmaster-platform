// What a student's NAME is in MathMaster, and what it is not.
//
// A student has exactly one stable internal identifier: the grades/{studentId}
// document id. Everything academic — attempts, evidence, events, presence,
// Live Challenge players, recovery records — carries that id and nothing else.
// The student's human name lives once, on the canonical roster record
// (grades/{studentId}: firstName, lastName, displayName), and every teacher
// screen joins studentId -> lightweight identity -> name at render time.
//
// This module is the single definition of that join, shared by:
//
//   the server   listSignInAccess's lightweight roster projection, every server
//                writer that keeps a name copy, the identity audit/backfill
//   the browser  src/platform/studentName.js re-exports it for every screen
//   the tests    tests/platform/studentIdentityContract.test.mjs and friends
//
// THREE KINDS OF THING, KEPT APART
//
//   identifier       studentIdOf(record)           '101410' — stable, internal
//   display name     resolveStudentIdentity(...)   'Jordan Williams' — or none
//   diagnostic label studentIdLabel(record)        'ID 101410' — secondary text
//
// A numeric id is NEVER a display name. Before this module existed, a roster
// projection that dropped the only name a legacy record had (googleName) met a
// live-view formatter that opted into "fall back to the id", and teachers saw
// '101410' where a child's name belonged. Every candidate name below is checked
// against the record's own identifiers, and a value with no letters, an email
// address, or a neutral placeholder ('Student', 'Name unavailable') is not a
// name. When nothing usable is left, the answer is "no name", and the screen
// says so explicitly instead of promoting the id.
//
// Pure: no Firestore, no React, no Node built-ins.

import { ACCOUNT_STATUS, UNASSIGNED_PERIOD } from './classModel.mjs';

/** The explicit, teacher-facing state for a student whose name is not on file. */
export const STUDENT_NAME_UNAVAILABLE = 'Name unavailable';

/** The neutral label a STUDENT sees for themselves when no name is on file. */
export const STUDENT_SELF_NEUTRAL_LABEL = 'Student';

/**
 * Top-level grades/{studentId} fields that can carry a human name, in the
 * order the resolver trusts them. The lightweight roster projection MUST select
 * every one of these: a field the resolver reads but the projection drops is
 * exactly how Classroom-linked students lost their names (googleName).
 */
export const STUDENT_IDENTITY_FIELDS = Object.freeze([
  'firstName',
  'lastName',
  'displayName',
  'googleName',
  'name',
  'studentName',
]);

/**
 * The complete field list of the teacher roster projection (listSignInAccess).
 * Names, class membership, account state and the small support profile — and
 * deliberately NOTHING from a student's attempt history. Adding a history map
 * here would put every student's whole record back into the teacher's memory.
 */
export const TEACHER_ROSTER_SELECT_FIELDS = Object.freeze([
  'classPeriod',
  'classId',
  'status',
  'linkedEmail',
  'assignedTeacherEmail',
  'sisStudentId',
  'profile',
  ...STUDENT_IDENTITY_FIELDS,
]);

/** Fields only the server may write. Firestore rules pin these on client writes. */
export const SERVER_OWNED_IDENTITY_FIELDS = Object.freeze([
  ...STUDENT_IDENTITY_FIELDS,
  'googleEmail',
  'googleUserId',
  'identityBackfill',
  'nameUpdatedAt',
  'nameUpdatedBy',
]);

const NAME_INPUT_LIMIT = 80;
const DISPLAY_LIMIT = 160;

// Labels this platform (or an older build of it) has written where a name was
// missing. A stored copy of any of these is the absence of a name, not a name.
const PLACEHOLDER_NAMES = new Set([
  'student',
  'students',
  'a student',
  'the student',
  'name unavailable',
  'student name unavailable',
  'name missing',
  'unknown',
  'unknown student',
  'mathmaster user',
  'n/a',
  'none',
  'null',
  'undefined',
]);

const LETTER = /\p{L}/u;
const ID_LABEL = /^(?:student\s*id|student|sis\s*id|id)\s*[#:.-]?\s*(\S+)$/i;

const asRecord = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

/** Whitespace-normalised text; only strings can be names. */
export const cleanStudentNameText = (value, limit = DISPLAY_LIMIT) => (
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : ''
);

const cleanId = (value) => (
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
);

/** The stable internal identifier. Never a display name. */
export const studentIdOf = (record = {}) => {
  const value = asRecord(record);
  return cleanId(value.studentId) || cleanId(value.id);
};

/** Diagnostic, secondary text: 'ID 101410'. Empty when there is no id. */
export const studentIdLabel = (record = {}) => {
  const id = typeof record === 'string' || typeof record === 'number' ? cleanId(record) : studentIdOf(record);
  return id ? `ID ${id}` : '';
};

const identifiersOf = (record = {}) => {
  const value = asRecord(record);
  return [value.studentId, value.id, value.sisStudentId, value.googleUserId]
    .map(cleanId)
    .filter(Boolean)
    .map((id) => id.toLowerCase());
};

/**
 * Is this text something other than a human name? True for: empty text, text
 * with no letters ('101410', '12-34'), email addresses, any of the record's own
 * identifiers, id labels ('Student 101410', 'ID S123'), and the placeholders
 * this platform writes when a name is missing.
 */
export const isIdentifierLikeName = (candidate, record = {}, { namePart = false } = {}) => {
  const text = cleanStudentNameText(candidate);
  if (!text) return true;
  if (!LETTER.test(text)) return true;
  if (text.includes('@')) return true;
  const lower = text.toLowerCase();
  // The placeholder words are what this platform wrote where a WHOLE name was
  // missing. A single structured part is a person's real first or last name,
  // and any word can be a surname ('Student', 'Unknown'), so parts skip it.
  if (!namePart && PLACEHOLDER_NAMES.has(lower)) return true;
  // A one-line label this platform prints ('Name unavailable · ID 101410',
  // 'Jordan Williams · ID 101410') is presentation, never a stored name.
  if (lower.startsWith(`${STUDENT_NAME_UNAVAILABLE.toLowerCase()} `) || / · id \S/.test(lower)) return true;
  const identifiers = identifiersOf(record);
  if (identifiers.includes(lower)) return true;
  const label = text.match(ID_LABEL);
  if (label) {
    const labelled = label[1].toLowerCase();
    if (!LETTER.test(labelled) || identifiers.includes(labelled)) return true;
  }
  return false;
};

/** The text when it is a usable human name for this record, otherwise ''. */
export const acceptStudentName = (candidate, record = {}) => {
  const text = cleanStudentNameText(candidate);
  return text && !isIdentifierLikeName(text, record) ? text : '';
};

/** The same, for one structured part (a first or a last name). */
export const acceptStudentNamePart = (candidate, record = {}) => {
  const text = cleanStudentNameText(candidate);
  return text && !isIdentifierLikeName(text, record, { namePart: true }) ? text : '';
};

/**
 * Display-time split of a single full-name string into parts, so legacy and
 * Google names sort and render "Last, First" like structured ones. A comma form
 * ('Williams, Jordan') is read as "Last, First". This is presentation only —
 * the backfill uses confidentStudentNameSplit, which refuses ambiguous names.
 */
// Generational and credential suffixes: 'Jordan Williams, Jr.' is a name plus
// a suffix, not "Last, First".
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'vi']);
const isNameSuffix = (text) => NAME_SUFFIXES.has(String(text || '').replace(/\./g, '').trim().toLowerCase());

// "Last, First" only when the part after the single comma is not a suffix.
const commaNameParts = (text) => {
  const commaParts = text.split(',');
  if (commaParts.length !== 2) return null;
  const lastName = cleanStudentNameText(commaParts[0]);
  const firstName = cleanStudentNameText(commaParts[1]);
  if (!lastName || !firstName || isNameSuffix(firstName)) return null;
  return { firstName, lastName };
};

/**
 * Display-time split of a single full-name string into parts, so legacy and
 * Google names sort and render "Last, First" like structured ones. A comma form
 * ('Williams, Jordan') is read as "Last, First"; a trailing suffix
 * ('Jordan Williams, Jr.') stays with the name. This is presentation only —
 * the backfill uses confidentStudentNameSplit, which refuses ambiguous names.
 */
export const splitStudentDisplayName = (displayName = '') => {
  const text = cleanStudentNameText(displayName);
  if (!text) return { firstName: '', lastName: '' };
  const comma = commaNameParts(text);
  if (comma) return comma;
  const words = text.split(',')[0].split(' ').filter(Boolean);
  if (!words.length) return { firstName: text, lastName: '' };
  if (words.length === 1) return { firstName: words[0], lastName: '' };
  return { firstName: words.slice(0, -1).join(' '), lastName: words.at(-1) };
};

/**
 * A split the identity backfill may write permanently: only when the full name
 * can be read one way. "Last, First" with one word on each side, or exactly two
 * words. "Mary Ann Smith" could be first "Mary Ann" or last "Ann Smith", and
 * "Jordan Williams, Jr." carries a suffix — those are guesses, so it returns
 * null and the record keeps displayName only.
 */
export const confidentStudentNameSplit = (displayName = '') => {
  const text = cleanStudentNameText(displayName);
  if (!text) return null;
  const commaCount = text.split(',').length - 1;
  if (commaCount === 1) {
    const comma = commaNameParts(text);
    const oneWord = (part) => part && !part.includes(' ') && LETTER.test(part);
    if (comma && oneWord(comma.lastName) && oneWord(comma.firstName)) {
      return { firstName: comma.firstName, lastName: comma.lastName, method: 'commaName' };
    }
    return null;
  }
  if (commaCount > 1) return null;
  const parts = text.split(' ').filter(Boolean);
  if (parts.length !== 2 || !parts.every((part) => LETTER.test(part)) || parts.some(isNameSuffix)) return null;
  return { firstName: parts[0], lastName: parts[1], method: 'twoPartName' };
};

// Full-name candidates after the structured pair, most trusted first.
const FULL_NAME_SOURCES = Object.freeze([
  { source: 'displayName', read: (record) => record.displayName },
  { source: 'googleName', read: (record) => record.googleName },
  { source: 'legacyName', read: (record) => record.name },
  { source: 'legacyName', read: (record) => record.studentName },
  { source: 'profileName', read: (record) => asRecord(record.profile).displayName },
  { source: 'profileName', read: (record) => asRecord(record.profile).name },
  { source: 'profileName', read: (record) => asRecord(record.profile).googleName },
]);

/**
 * THE resolver. Returns the student's identity from whatever name fields the
 * record carries, never from its identifiers:
 *
 *   { studentId, firstName, lastName, displayName, nameSource, structured, hasName }
 *
 * nameSource: 'structured' | 'displayName' | 'googleName' | 'legacyName' |
 *             'profileName' | null   (null means no usable name is on file)
 */
export const resolveStudentIdentity = (record = {}) => {
  const value = asRecord(record);
  const studentId = studentIdOf(value);
  const firstName = acceptStudentNamePart(value.firstName, value);
  const lastName = acceptStudentNamePart(value.lastName, value);
  const storedDisplayName = acceptStudentName(value.displayName, value);

  if (firstName && lastName) {
    return {
      studentId,
      firstName,
      lastName,
      displayName: storedDisplayName || `${firstName} ${lastName}`,
      nameSource: 'structured',
      structured: true,
      hasName: true,
    };
  }

  for (const candidate of FULL_NAME_SOURCES) {
    const text = acceptStudentName(candidate.read(value), value);
    if (text) {
      return {
        studentId,
        firstName: '',
        lastName: '',
        displayName: text,
        nameSource: candidate.source,
        structured: false,
        hasName: true,
      };
    }
  }

  if (firstName || lastName) {
    return {
      studentId,
      firstName,
      lastName,
      displayName: [firstName, lastName].filter(Boolean).join(' '),
      nameSource: 'structured',
      structured: false,
      hasName: true,
    };
  }

  return {
    studentId,
    firstName: '',
    lastName: '',
    displayName: '',
    nameSource: null,
    structured: false,
    hasName: false,
  };
};

/** { firstName, lastName } for display and sorting (split when not structured). */
export const studentNamePartsFromIdentity = (identity) => {
  if (!identity?.hasName) return { firstName: '', lastName: '' };
  if (identity.nameSource === 'structured') {
    return { firstName: identity.firstName, lastName: identity.lastName };
  }
  return splitStudentDisplayName(identity.displayName);
};

/** "First Last" for a resolved identity, keeping any suffix; '' when no name. */
export const naturalStudentName = (identity) => {
  if (!identity?.hasName) return '';
  if (identity.nameSource === 'structured') {
    return [identity.firstName, identity.lastName].filter(Boolean).join(' ') || identity.displayName;
  }
  // A stored "Last, First" reads naturally as "First Last"; any other single
  // string (including one with a suffix) is already in natural order.
  const comma = commaNameParts(identity.displayName);
  return comma ? `${comma.firstName} ${comma.lastName}` : identity.displayName;
};

/**
 * The name to keep on a derived record (an event, a session summary, a recovery
 * row) for readers that cannot join the roster: the natural "First Last", or
 * null. Never the id — readers resolve null by studentId at display time.
 */
export const studentNameForStorage = (record = {}) => (
  naturalStudentName(resolveStudentIdentity(record)) || null
);

/**
 * Server-side validation for a name a person typed (account creation, a name
 * correction). Both parts are required; each must read as a name.
 */
export const validateStudentNameInput = ({ firstName, lastName } = {}, { studentId = '', sisStudentId = '' } = {}) => {
  const record = { studentId, sisStudentId };
  const first = cleanStudentNameText(firstName, NAME_INPUT_LIMIT);
  const last = cleanStudentNameText(lastName, NAME_INPUT_LIMIT);
  if (!first || !last) {
    return { ok: false, error: "Enter both the student's first name and last name." };
  }
  if (isIdentifierLikeName(first, record, { namePart: true }) || isIdentifierLikeName(last, record, { namePart: true })) {
    return {
      ok: false,
      error: "Enter the student's name, not an ID, email address or placeholder.",
    };
  }
  return { ok: true, firstName: first, lastName: last, displayName: `${first} ${last}` };
};

/**
 * One row of the teacher roster projection. Names come from the resolver, so a
 * Classroom-linked legacy student whose only name is googleName arrives with
 * that name; firstName/lastName are reported only when they are really stored.
 * nameSource/nameMissing make an unresolved identity diagnosable on screen.
 */
export const buildTeacherRosterSummaryRow = (studentId, data = {}, { credential = null, linkedEmail = null } = {}) => {
  const value = asRecord(data);
  const id = cleanId(studentId);
  const identity = resolveStudentIdentity({ ...value, studentId: id });
  const structuredParts = identity.nameSource === 'structured';
  return {
    studentId: id,
    firstName: structuredParts ? identity.firstName || null : null,
    lastName: structuredParts ? identity.lastName || null : null,
    displayName: identity.displayName || null,
    nameSource: identity.nameSource,
    nameMissing: !identity.hasName,
    classId: value.classId || null,
    classPeriod: value.classPeriod || UNASSIGNED_PERIOD,
    status: value.status === ACCOUNT_STATUS.DISABLED ? ACCOUNT_STATUS.DISABLED : ACCOUNT_STATUS.ACTIVE,
    assignedTeacherEmail: value.assignedTeacherEmail || null,
    sisStudentId: value.sisStudentId || null,
    profile: asRecord(value.profile),
    hasPasscode: Boolean(credential?.hash) && credential?.resetRequired !== true,
    resetRequired: credential?.resetRequired === true,
    linkedEmail: linkedEmail || value.linkedEmail || null,
  };
};

/**
 * Roster order: named students by last name, first name, then id; students
 * with no name on file after them, by id, so they are easy to find and fix.
 */
export const compareStudentIdentities = (a = {}, b = {}) => {
  const aIdentity = resolveStudentIdentity(a);
  const bIdentity = resolveStudentIdentity(b);
  if (aIdentity.hasName !== bIdentity.hasName) return aIdentity.hasName ? -1 : 1;
  const aParts = studentNamePartsFromIdentity(aIdentity);
  const bParts = studentNamePartsFromIdentity(bIdentity);
  const options = { sensitivity: 'base', numeric: true };
  return aParts.lastName.localeCompare(bParts.lastName, undefined, options)
    || aParts.firstName.localeCompare(bParts.firstName, undefined, options)
    || aIdentity.studentId.localeCompare(bIdentity.studentId, undefined, options);
};

/**
 * A comparison key for "is this the same human name": case, accents,
 * punctuation and "Last, First" order do not matter. Used to detect agreeing or
 * conflicting sources and duplicate names — never to merge students.
 */
export const studentNameComparisonKey = (text = '') => {
  const clean = cleanStudentNameText(text);
  if (!clean) return '';
  const comma = commaNameParts(clean);
  const ordered = comma ? `${comma.firstName} ${comma.lastName}` : clean;
  return ordered
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// ---------------------------------------------------------------------------
// Identity audit and legacy backfill planner.
//
// Reads what the canonical roster record already says and what authoritative
// records ALREADY ASSOCIATED WITH THE SAME studentId say, and plans the fewest
// writes that make the canonical record complete. It never guesses:
//
//   - a name is taken only from a source tied to the same studentId;
//   - identifiers, emails and placeholders are never names;
//   - first/last are written only from a structured source or a split that can
//     be read one way (confidentStudentNameSplit);
//   - two sources that disagree are a conflict, reported and left alone;
//   - a valid stored name is never overwritten;
//   - students are never merged — the studentId is the key, always.
//
// Re-running the plan after it was applied produces no writes (idempotent).
// ---------------------------------------------------------------------------

export const IDENTITY_BACKFILL_VERSION = 1;

// Sources that exist only because a teacher matched a Google Classroom
// student to this record — revocable, so never enough on their own.
const CLASSROOM_LINK_SOURCES = new Set(['googleName', 'classroomRosterLink']);

/** Sources a backfill may take a name from, most trusted first. */
export const IDENTITY_RECOVERY_SOURCES = Object.freeze([
  'storedStructured',
  'storedDisplayName',
  'accountCreationAudit',
  'googleName',
  'classroomRosterLink',
  'googleProfile',
  'legacyField',
]);

const groupBy = (items, keyOf) => {
  const groups = new Map();
  items.forEach((item) => {
    const key = keyOf(item);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
};

const storedNameState = (studentId, data) => {
  const record = { ...asRecord(data), studentId };
  const firstName = acceptStudentNamePart(record.firstName, record);
  const lastName = acceptStudentNamePart(record.lastName, record);
  const displayName = acceptStudentName(record.displayName, record);
  const idLikeStored = ['firstName', 'lastName', 'displayName'].some((field) => (
    cleanStudentNameText(record[field]) && !(field === 'displayName'
      ? acceptStudentName(record[field], record)
      : acceptStudentNamePart(record[field], record))
  ));
  return { record, firstName, lastName, displayName, idLikeStored };
};

// Every non-canonical name candidate for one student, as { source, text, parts? }.
const recoveryCandidates = (studentId, record, inputs) => {
  const candidates = [];
  const push = (source, text, parts = null) => {
    const accepted = acceptStudentName(text, record);
    if (accepted) candidates.push({ source, text: accepted, parts });
  };
  (inputs.creationAuditsByStudent.get(studentId) || []).forEach((audit) => {
    const first = acceptStudentNamePart(audit.firstName, record);
    const last = acceptStudentNamePart(audit.lastName, record);
    if (first && last) {
      candidates.push({ source: 'accountCreationAudit', text: `${first} ${last}`, parts: { firstName: first, lastName: last } });
    } else {
      push('accountCreationAudit', audit.displayName);
    }
  });
  push('googleName', record.googleName);
  (inputs.rosterLinksByStudent.get(studentId) || []).forEach((link) => push('classroomRosterLink', link.name));
  (inputs.googleProfilesByStudent.get(studentId) || []).forEach((profile) => push('googleProfile', profile.displayName));
  push('legacyField', record.name);
  push('legacyField', record.studentName);
  const profile = asRecord(record.profile);
  push('legacyField', profile.displayName);
  push('legacyField', profile.name);
  push('legacyField', profile.googleName);
  return candidates;
};

const fillPlan = ({ studentId, current, chosen }) => {
  const set = {};
  const filledFields = [];
  if (!current.displayName && chosen.displayName) {
    set.displayName = chosen.displayName;
    filledFields.push('displayName');
  }
  if (!current.firstName && !current.lastName && chosen.firstName && chosen.lastName) {
    set.firstName = chosen.firstName;
    set.lastName = chosen.lastName;
    filledFields.push('firstName', 'lastName');
  }
  if (!filledFields.length) return null;
  return {
    studentId,
    source: chosen.source,
    split: chosen.split || null,
    filledFields,
    set,
  };
};

/**
 * Plan the audit and the backfill.
 *
 * inputs:
 *   students        [{ studentId, data }]  grades docs (identity fields only)
 *   creationAudits  [{ studentId, firstName, lastName, displayName }]
 *   rosterLinks     [{ studentId, name, googleUserId, courseId }]
 *   googleProfiles  [{ studentId, displayName }]  Auth profile of a directory-linked Google account
 *   aliases         [{ key, studentId }]
 *   directory       [{ email, studentId }]
 *   credentialKeys  ['KEY', ...]
 *   studentIdKey    (id) => KEY   (functions/lib/auth.js studentIdKey; defaults to upper-case)
 *
 * Returns { counts, updates, unresolved, conflicts, needsStructuredName }.
 * counts holds numbers only — no names — so it is safe to print anywhere.
 * updates/unresolved/conflicts carry studentIds; names appear only in
 * updates[].set, which is the data to be written.
 */
export const planStudentIdentityRepair = (inputs = {}) => {
  const injectedKey = typeof inputs.studentIdKey === 'function' ? inputs.studentIdKey : null;
  // functions/lib/auth.js studentIdKey throws on legacy ids its sign-in pattern
  // rejects; an audit must count those records, not crash on them.
  const studentIdKey = (id) => {
    const fallback = String(id || '').trim().toUpperCase();
    if (!injectedKey) return fallback;
    try { return injectedKey(id); } catch { return fallback; }
  };
  const students = (Array.isArray(inputs.students) ? inputs.students : [])
    .map((entry) => ({ studentId: cleanId(entry?.studentId), data: asRecord(entry?.data) }))
    .filter((entry) => entry.studentId && entry.studentId !== 'test_connection');
  const studentIds = new Set(students.map((entry) => entry.studentId));
  const index = {
    creationAuditsByStudent: groupBy(inputs.creationAudits || [], (entry) => cleanId(entry?.studentId)),
    rosterLinksByStudent: groupBy(inputs.rosterLinks || [], (entry) => cleanId(entry?.studentId)),
    googleProfilesByStudent: groupBy(inputs.googleProfiles || [], (entry) => cleanId(entry?.studentId)),
  };

  const counts = {
    totalStudents: students.length,
    activeStudents: 0,
    disabledStudents: 0,
    active: {
      completeCanonicalNames: 0,
      withFirstName: 0,
      withLastName: 0,
      withDisplayName: 0,
      missingDisplayNameOnly: 0,
      displayNameWithoutStructuredName: 0,
      missingAllNameFields: 0,
      noUsableHumanName: 0,
      idLikeStoredName: 0,
      recoverableElsewhere: 0,
      classroomNameAwaitingConfirmation: 0,
      notRecoverableAutomatically: 0,
    },
    plannedUpdates: 0,
    plannedUpdatesBySource: Object.fromEntries(IDENTITY_RECOVERY_SOURCES.map((source) => [source, 0])),
    plannedFirstLastSplits: { twoPartName: 0, commaName: 0 },
    needsStructuredNameConfirmation: 0,
    unresolved: { total: 0, noAuthoritativeSource: 0, conflictingSources: 0 },
    duplicateHumanNames: { groups: 0, students: 0 },
    duplicateSisIds: { groups: 0, students: 0 },
    identityRecordMismatches: {
      aliasesWithoutRoster: 0,
      aliasKeyMismatch: 0,
      directoryLinksWithoutRoster: 0,
      rosterLinksWithoutRoster: 0,
      credentialsWithoutRoster: 0,
      googleAccountsLinkedToSeveralStudents: 0,
    },
  };

  const updates = [];
  const unresolved = [];
  const conflicts = [];
  const needsStructuredName = [];
  const resolvedNameKeyByStudent = new Map();

  students.forEach(({ studentId, data }) => {
    const active = data.status !== ACCOUNT_STATUS.DISABLED;
    if (active) counts.activeStudents += 1; else counts.disabledStudents += 1;
    const current = storedNameState(studentId, data);
    const tally = (field) => { if (active) counts.active[field] += 1; };
    if (current.firstName) tally('withFirstName');
    if (current.lastName) tally('withLastName');
    if (current.displayName) tally('withDisplayName');
    if (current.idLikeStored) tally('idLikeStoredName');

    const structured = Boolean(current.firstName && current.lastName);
    if (structured && current.displayName) {
      tally('completeCanonicalNames');
      resolvedNameKeyByStudent.set(studentId, studentNameComparisonKey(`${current.firstName} ${current.lastName}`));
      return;
    }

    let chosen = null;
    if (structured) {
      tally('missingDisplayNameOnly');
      chosen = {
        source: 'storedStructured',
        displayName: `${current.firstName} ${current.lastName}`,
      };
    } else {
      const candidates = recoveryCandidates(studentId, current.record, index);
      if (current.displayName && (current.firstName || current.lastName)) {
        // A lone stored first or last name beside a displayName: splitting
        // the displayName could contradict the stored part. A person confirms.
        tally('displayNameWithoutStructuredName');
        needsStructuredName.push({ studentId, reason: 'partialStructuredName' });
      } else if (current.displayName) {
        tally('displayNameWithoutStructuredName');
        const key = studentNameComparisonKey(current.displayName);
        const structuredMatch = candidates.find((candidate) => (
          candidate.parts && studentNameComparisonKey(candidate.text) === key
        ));
        const split = structuredMatch ? null : confidentStudentNameSplit(current.displayName);
        if (structuredMatch) {
          chosen = { source: structuredMatch.source, ...structuredMatch.parts };
        } else if (split) {
          chosen = { source: 'storedDisplayName', firstName: split.firstName, lastName: split.lastName, split: split.method };
        } else {
          needsStructuredName.push({ studentId, reason: 'displayNameNotSplittable' });
        }
      } else {
        // No stored displayName. A lone stored first OR last name is still a
        // (partial) name on file; nothing stored at all is "no usable name".
        const partial = Boolean(current.firstName || current.lastName);
        if (!partial) {
          tally('missingAllNameFields');
          tally('noUsableHumanName');
        }
        const distinct = [...new Set(candidates.map((candidate) => studentNameComparisonKey(candidate.text)))];
        if (partial) {
          // Combining a lone stored part with an outside full name could
          // contradict what is stored. A person confirms it (setStudentName).
          needsStructuredName.push({ studentId, reason: 'partialStructuredName' });
        } else if (!candidates.length) {
          tally('notRecoverableAutomatically');
          unresolved.push({ studentId, reason: 'noAuthoritativeSource' });
        } else if (distinct.length > 1) {
          tally('notRecoverableAutomatically');
          conflicts.push({ studentId, sources: [...new Set(candidates.map((candidate) => candidate.source))] });
          unresolved.push({ studentId, reason: 'conflictingSources' });
        } else if (candidates.every((candidate) => CLASSROOM_LINK_SOURCES.has(candidate.source))) {
          // Only a teacher's Classroom match vouches for this name, and a
          // match can be corrected later (linkClassroomRosterBatch removes
          // googleName from a student who loses the link). Making it
          // canonical would keep the wrong child's name after that
          // correction. Screens already show it (the roster projection reads
          // googleName); a person confirms it in Sign-in Access to make it
          // permanent.
          tally('recoverableElsewhere');
          tally('classroomNameAwaitingConfirmation');
          needsStructuredName.push({ studentId, reason: 'classroomOnlySource' });
        } else {
          // Every source agrees, and at least one is independent of the
          // Classroom match. Take the most trusted text; prefer a source that
          // already knows first from last.
          const structuredSource = candidates.find((candidate) => candidate.parts);
          const best = structuredSource || candidates[0];
          const split = structuredSource ? null : confidentStudentNameSplit(best.text);
          const parts = structuredSource?.parts || (split ? { firstName: split.firstName, lastName: split.lastName } : null);
          chosen = {
            source: best.source,
            displayName: parts ? `${parts.firstName} ${parts.lastName}` : best.text,
            ...parts,
            split: split?.method || null,
          };
          if (!parts) needsStructuredName.push({ studentId, reason: 'recoveredNameNotSplittable' });
          tally('recoverableElsewhere');
        }
      }
    }

    const plan = chosen ? fillPlan({ studentId, current, chosen }) : null;
    if (plan) {
      updates.push(plan);
      counts.plannedUpdates += 1;
      counts.plannedUpdatesBySource[plan.source] = (counts.plannedUpdatesBySource[plan.source] || 0) + 1;
      if (plan.split) counts.plannedFirstLastSplits[plan.split] += 1;
    }
    const finalName = plan?.set?.displayName || current.displayName
      || (current.firstName && current.lastName ? `${current.firstName} ${current.lastName}` : '');
    if (finalName) resolvedNameKeyByStudent.set(studentId, studentNameComparisonKey(finalName));
  });

  counts.needsStructuredNameConfirmation = needsStructuredName.length;
  counts.unresolved.total = unresolved.length;
  counts.unresolved.noAuthoritativeSource = unresolved.filter((entry) => entry.reason === 'noAuthoritativeSource').length;
  counts.unresolved.conflictingSources = unresolved.filter((entry) => entry.reason === 'conflictingSources').length;

  // Same human name, different students: reported, never merged.
  const activeIds = new Set(students.filter(({ data }) => data.status !== ACCOUNT_STATUS.DISABLED).map(({ studentId }) => studentId));
  const nameGroups = groupBy([...resolvedNameKeyByStudent.entries()].filter(([id]) => activeIds.has(id)), ([, key]) => key);
  nameGroups.forEach((members) => {
    if (members.length > 1) {
      counts.duplicateHumanNames.groups += 1;
      counts.duplicateHumanNames.students += members.length;
    }
  });
  const sisGroups = groupBy(students, ({ data }) => cleanId(data.sisStudentId));
  sisGroups.forEach((members) => {
    if (members.length > 1) {
      counts.duplicateSisIds.groups += 1;
      counts.duplicateSisIds.students += members.length;
    }
  });

  const mismatches = counts.identityRecordMismatches;
  (inputs.aliases || []).forEach((alias) => {
    const target = cleanId(alias?.studentId);
    if (!target || !studentIds.has(target)) mismatches.aliasesWithoutRoster += 1;
    else if (cleanId(alias?.key) && cleanId(alias.key) !== studentIdKey(target)) mismatches.aliasKeyMismatch += 1;
  });
  (inputs.directory || []).forEach((link) => {
    if (!studentIds.has(cleanId(link?.studentId))) mismatches.directoryLinksWithoutRoster += 1;
  });
  (inputs.rosterLinks || []).forEach((link) => {
    if (!studentIds.has(cleanId(link?.studentId))) mismatches.rosterLinksWithoutRoster += 1;
  });
  const rosterKeys = new Set([...studentIds].map((id) => studentIdKey(id)));
  const aliasKeys = new Set((inputs.aliases || []).map((alias) => cleanId(alias?.key)).filter(Boolean));
  (inputs.credentialKeys || []).forEach((key) => {
    const clean = cleanId(key);
    if (clean && !rosterKeys.has(clean) && !aliasKeys.has(clean)) mismatches.credentialsWithoutRoster += 1;
  });
  const googleGroups = groupBy(inputs.rosterLinks || [], (link) => (
    cleanId(link?.googleUserId) ? `${cleanId(link.courseId)}::${cleanId(link.googleUserId)}` : ''
  ));
  googleGroups.forEach((links) => {
    if (new Set(links.map((link) => cleanId(link.studentId))).size > 1) mismatches.googleAccountsLinkedToSeveralStudents += 1;
  });

  return { counts, updates, unresolved, conflicts, needsStructuredName };
};

/**
 * The provenance stamped beside a backfilled name, so a run can be audited and
 * rolled back field by field. A later human correction (setStudentName)
 * removes it, which is what keeps a rollback from undoing a person's edit.
 */
export const identityBackfillStamp = ({ runId, at, source, split = null, filledFields = [] }) => ({
  runId: String(runId),
  at,
  source,
  split,
  filledFields: [...filledFields],
  version: IDENTITY_BACKFILL_VERSION,
});

/**
 * Plan the rollback of one backfill run: for every student still carrying that
 * run's stamp, remove exactly the fields the run filled, and the stamp.
 * Returns [{ studentId, deleteFields }].
 */
export const planStudentIdentityRollback = ({ students = [], runId } = {}) => {
  const target = String(runId || '').trim();
  if (!target) return [];
  return (Array.isArray(students) ? students : [])
    .map((entry) => ({ studentId: cleanId(entry?.studentId), data: asRecord(entry?.data) }))
    .filter(({ studentId, data }) => studentId && asRecord(data.identityBackfill).runId === target)
    .map(({ studentId, data }) => ({
      studentId,
      deleteFields: [
        ...(Array.isArray(data.identityBackfill.filledFields) ? data.identityBackfill.filledFields : [])
          .filter((field) => ['firstName', 'lastName', 'displayName'].includes(field)),
        'identityBackfill',
      ],
    }));
};
