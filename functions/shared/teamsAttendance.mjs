/*
 * TEAMS ATTENDANCE, MIRRORED INTO MATHMASTER — THE RULES.
 *
 * The teacher takes attendance once, in TEAMS, the district's record. The
 * MathMaster extension (extensions/teams-sync) reads a section's marks in the
 * teacher's signed-in TEAMS tab and hands them to the teacher's open
 * MathMaster tab (src/platform/attendance/teamsAttendanceBridge.js). That tab
 * records them through the same handler as a mark taken in Live Classroom
 * (createAttendanceExtensionControls), so deadline extensions follow exactly
 * as they do today. docs/plans/2026-11-27-teams-attendance-mirror.md.
 *
 * Decided with the teacher (2026-11-27):
 *   - TEAMS is the source. A mark is recorded in MathMaster when it first
 *     appears in TEAMS and whenever it changes there. A correction made in
 *     MathMaster afterwards stands until TEAMS changes again.
 *   - An absence in TEAMS extends the student's deadlines automatically, as
 *     an absence marked in MathMaster does.
 *   - A tardy in TEAMS today is recorded in the Discipline Tracker as a
 *     Tardy "from TEAMS". It goes to the district form with the class's
 *     batch after the period ends, so the teacher can undo it until then.
 *     An excused tardy is never recorded, and a tardy TEAMS takes back is
 *     undone while it has not been sent.
 *
 * And never: an absence inferred from a student with no mark, an absence
 * called unexcused because TEAMS did not say so, a code MathMaster does not
 * know guessed at, a day still to come, a student under a district ID two
 * students share, or a shortened extension (the mirror records marks; the
 * existing rules decide extensions, and they never shorten one on their own).
 *
 * A student with no code in TEAMS is present. "Present" is recorded only
 * where it changes something: it undoes a mark TEAMS took back, and it marks
 * a student's first day back after an absence (return check-ins need an
 * explicit present). Writing it for every student every day would push the
 * teacher's other records out of the recent-records feed.
 *
 * Pure: no Firestore, no clock (today's date is passed in).
 */
import { canonicalDistrictStudentId, effectiveDistrictStudentId, isValidDistrictStudentId } from './studentDistrictId.mjs';
import { LIVE_ATTENDANCE_EVENT_KIND, effectiveAttendanceForStudentDay, eventMatchesClass } from './attendanceDay.mjs';

/** What a TEAMS code means, in MathMaster's terms. */
export const TEAMS_ATTENDANCE_KIND = Object.freeze({
  PRESENT: 'present',
  TARDY: 'tardy',
  TARDY_EXCUSED: 'tardyExcused',
  ABSENT: 'absent',
  ABSENT_EXCUSED: 'absentExcused',
  ABSENT_UNEXCUSED: 'absentUnexcused',
});

/** The MathMaster attendance mark each kind is recorded as (attendanceDay.mjs). */
export const TEAMS_KIND_MARK = Object.freeze({
  present: 'present',
  tardy: 'late',
  tardyExcused: 'late',
  // Absent, reason not given: MathMaster's own unclassified state. It earns
  // the deadline extension and is never treated as unexcused.
  absent: 'absent',
  absentExcused: 'excused',
  absentUnexcused: 'unexcused',
});

/**
 * DeSoto's TEAMS attendance codes, code -> { kind, label }. Filled in from the
 * live TEAMS attendance legend, with the teacher confirming what each code
 * means (the plan's "Before it runs"). Until a code is here, a student with it
 * is left as MathMaster has them and the code is reported; it is never
 * guessed at. A student with no code is present and needs no entry.
 */
export const DESOTO_TEAMS_ATTENDANCE_CODES = Object.freeze({});

export const TEAMS_ATTENDANCE_LIMITS = Object.freeze({
  maxMarks: 250,
  // How far back the office's later changes are read (an absence it codes
  // excused the next week, say).
  maxDaysBack: 30,
  // The class's records read before the report's day, to know a return day.
  lookbackDays: 21,
});

/** Where the mirror's records come from, on every one it writes. */
export const TEAMS_ATTENDANCE_SOURCE = 'teams';

/**
 * The marks Live Classroom takes. Today's excused or unexcused absence is two
 * records: absent in Live Classroom, and the classification in the history
 * beside it.
 */
export const TEAMS_LIVE_MARKS = Object.freeze(new Set(['present', 'late', 'absent']));

export class TeamsAttendanceInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamsAttendanceInputError';
  }
}
const refuse = (message) => { throw new TeamsAttendanceInputError(message); };

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Z0-9*#+-]{1,8}$/;
const DAY_MS = 86400000;
const KINDS = new Set(Object.values(TEAMS_ATTENDANCE_KIND));
const ABSENT_MARKS = new Set(['absent', 'excused', 'unexcused']);

const dayNumber = (dateKey) => Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS;
/** The date key `days` before `dateKey`. */
export const dateKeyDaysBefore = (dateKey, days) => new Date((dayNumber(dateKey) - days) * DAY_MS).toISOString().slice(0, 10);

/** A TEAMS code as MathMaster compares it: upper case, '' for none. */
export const normalizeTeamsCode = (value) => text(value).toUpperCase();

/**
 * The code table, checked: every entry a known kind. A table with a bad entry
 * is refused whole, so a typo can never send a tardy to the district form.
 */
export const normalizeTeamsAttendanceCodes = (codes = {}) => Object.freeze(Object.fromEntries(
  Object.entries(codes || {}).map(([code, entry]) => {
    const key = normalizeTeamsCode(code);
    if (!CODE.test(key)) refuse(`"${code}" is not a TEAMS attendance code.`);
    if (!KINDS.has(entry?.kind)) refuse(`TEAMS code ${key} has no meaning MathMaster knows.`);
    return [key, Object.freeze({ kind: entry.kind, label: text(entry.label).slice(0, 80) || key })];
  }),
));

/**
 * One section's attendance for one day, as the extension read it, checked.
 * `taken` is TEAMS saying attendance was taken: until then every student
 * reads blank, and blank must not become "present".
 */
export const normalizeTeamsAttendanceReport = (report = {}, { todayKey } = {}) => {
  const sectionRef = text(report?.sectionRef).slice(0, 40);
  if (!sectionRef) refuse('The TEAMS section is missing.');
  const dateKey = text(report?.dateKey);
  if (!DATE_KEY.test(dateKey) || !Number.isFinite(dayNumber(dateKey))) refuse('The attendance date is not a date.');
  if (!DATE_KEY.test(text(todayKey))) refuse('Today\'s date is required.');
  if (dateKey > todayKey) refuse('That attendance date has not happened yet.');
  if (dayNumber(todayKey) - dayNumber(dateKey) > TEAMS_ATTENDANCE_LIMITS.maxDaysBack) {
    refuse(`Attendance more than ${TEAMS_ATTENDANCE_LIMITS.maxDaysBack} days old is not mirrored.`);
  }
  const taken = report?.taken === true;
  const raw = list(report?.marks);
  if (raw.length > TEAMS_ATTENDANCE_LIMITS.maxMarks) refuse('That section lists more students than a class holds.');
  const seen = new Map();
  raw.forEach((mark) => {
    const districtId = text(mark?.districtId);
    if (!isValidDistrictStudentId(districtId)) refuse('A student in the report has no valid district ID.');
    const code = normalizeTeamsCode(mark?.code);
    if (code && !CODE.test(code)) refuse(`"${text(mark?.code)}" is not a TEAMS attendance code.`);
    const key = canonicalDistrictStudentId(districtId);
    // The same student twice with two codes is a page read wrong, not a fact.
    if (seen.has(key) && seen.get(key).code !== code) refuse('A student is listed twice with different codes.');
    seen.set(key, { districtId, code });
  });
  return { sectionRef, dateKey, taken, marks: [...seen.values()] };
};

/**
 * District ID (canonical) -> student id, for this class's students. The rule
 * is grade sync's (teamsSyncServer.mjs teamsRosterIndex, which a test holds
 * this to): a district ID two students the teacher holds carry, here or in
 * another class, is left out, so no mark is recorded under it. Kept here
 * rather than imported, so the attendance code a teacher's browser loads
 * does not carry the grade sync's.
 */
export const districtIdRosterIndex = (roster = [], { sharedWith = [] } = {}) => {
  const idOf = (student) => text(student?.id ?? student?.studentId);
  const holders = new Map();
  [...list(roster), ...list(sharedWith)].forEach((student) => {
    const canonical = canonicalDistrictStudentId(effectiveDistrictStudentId(student || {}));
    if (!canonical || !idOf(student)) return;
    if (!holders.has(canonical)) holders.set(canonical, new Set());
    holders.get(canonical).add(idOf(student));
  });
  const index = new Map();
  list(roster).forEach((student) => {
    const districtId = effectiveDistrictStudentId(student || {});
    const canonical = canonicalDistrictStudentId(districtId);
    if (idOf(student) && isValidDistrictStudentId(districtId) && holders.get(canonical)?.size === 1) index.set(canonical, idOf(student));
  });
  return index;
};

/**
 * The Discipline Tracker tap id of a TEAMS tardy: one per student per class
 * per day, however often it is read. A tardy TEAMS took back and then showed
 * again is a new record (`sequence` 2, 3, ...): the one undone stays undone.
 */
export const teamsTardyTapId = ({ dateKey, studentId, sequence = 1 }) => {
  // FNV-1a, so any account id fits the tracker's tap-id pattern.
  let hash = 0x811c9dc5;
  for (const char of text(studentId)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const base = `teams-${text(dateKey)}-${hash.toString(16).padStart(8, '0')}`;
  return Number(sequence) > 1 ? `${base}-${Math.floor(Number(sequence))}` : base;
};

/**
 * A student's TEAMS tardies that day among the tracker's records for the
 * class ({ id } as `${classId}_${tapId}`), with their sequence; the newest last.
 */
export const teamsTardyRecords = (incidents = [], { classId, dateKey, studentId }) => {
  const base = `${text(classId)}_${teamsTardyTapId({ dateKey, studentId })}`;
  return list(incidents)
    .map((incident) => {
      const id = text(incident?.id);
      if (id === base) return { incident, sequence: 1 };
      const match = id.startsWith(`${base}-`) ? /^(\d+)$/.exec(id.slice(base.length + 1)) : null;
      return match ? { incident, sequence: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.sequence - right.sequence);
};

const recordTime = (record) => {
  const value = record?.evidence?.markedAt ?? record?.evidence?.correctedAt ?? record?.createdAt;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * The newest record the mirror wrote for one student on one day, or null:
 * its TEAMS code is the one last mirrored.
 */
const lastMirroredRecord = (records, { studentId, classId, classPeriod, dateKey }) => records
  .filter((record) => text(record?.studentId) === studentId && text(record?.evidence?.dateKey) === dateKey)
  .filter((record) => record?.source === TEAMS_ATTENDANCE_SOURCE && eventMatchesClass(record, classId, classPeriod))
  .sort((left, right) => recordTime(right) - recordTime(left))[0] || null;

/** Is `dateKey` the student's first marked day back: their latest marked day before it an absence? */
const returnsFromAbsence = (records, { studentId, classId, classPeriod, dateKey }) => {
  const earlier = [...new Set(records
    .filter((record) => text(record?.studentId) === studentId && eventMatchesClass(record, classId, classPeriod))
    .map((record) => text(record?.evidence?.dateKey))
    .filter((day) => DATE_KEY.test(day) && day < dateKey))]
    .sort()
    .reverse();
  for (const day of earlier) {
    const effective = effectiveAttendanceForStudentDay({ supportEvents: records, studentId, classId, classPeriod, dateKey: day });
    if (effective.mark) return ABSENT_MARKS.has(effective.mark);
  }
  return false;
};

/**
 * What one section's report changes in MathMaster.
 *
 *   report   normalizeTeamsAttendanceReport's result
 *   roster   this MathMaster class's students ({ id, sisStudentId })
 *   sharedWith every student the teacher holds (a district ID two of them
 *            share is never used, as for grades: districtIdRosterIndex)
 *   records  this class's attendance records (studentSupportEvents) from
 *            TEAMS_ATTENDANCE_LIMITS.lookbackDays before the report's day to it
 *
 * Returns the marks to record (each with whether it is today's, so Live
 * Classroom shows it), and for today's report the students TEAMS has tardy
 * (`tardies`, recorded in the Discipline Tracker once each by their tap id)
 * and those it does not (`notTardy`: a TEAMS tardy recorded for one of them
 * earlier is undone while it waits to be sent). Both are the state TEAMS
 * shows now, not a change, so a call that failed is put right by the next
 * read. Also what was left alone and why.
 */
export const planTeamsAttendanceMirror = ({
  report, classId, classPeriod = null, roster = [], sharedWith = [], records = [], codes = DESOTO_TEAMS_ATTENDANCE_CODES, todayKey,
} = {}) => {
  const table = normalizeTeamsAttendanceCodes(codes);
  const plan = {
    sectionRef: report?.sectionRef || '',
    dateKey: report?.dateKey || '',
    taken: Boolean(report?.taken),
    marks: [],
    tardies: [],
    notTardy: [],
    unchanged: 0,
    notOnRoster: 0,
    unknownCodes: [],
  };
  if (!report?.taken) return plan;
  const today = report.dateKey === todayKey;
  const byDistrictId = districtIdRosterIndex(roster, { sharedWith });
  const kindOf = (code) => (code ? table[code]?.kind : TEAMS_ATTENDANCE_KIND.PRESENT);
  const unknown = new Set();

  report.marks.forEach(({ districtId, code }) => {
    const studentId = byDistrictId.get(canonicalDistrictStudentId(districtId));
    if (!studentId) { plan.notOnRoster += 1; return; }
    const kind = kindOf(code);
    if (!kind) { unknown.add(code); return; }
    const where = { studentId, classId, classPeriod, dateKey: report.dateKey };
    const lastRecord = lastMirroredRecord(records, where);
    const last = lastRecord ? normalizeTeamsCode(lastRecord.evidence?.teamsCode) : undefined;

    // Only today's: the Discipline Tracker records today. An excused tardy
    // is never one.
    if (today) (kind === TEAMS_ATTENDANCE_KIND.TARDY ? plan.tardies : plan.notTardy).push(studentId);

    let write;
    let classifyOnly = false;
    if (last !== undefined && last === code && today && !TEAMS_LIVE_MARKS.has(TEAMS_KIND_MARK[kind])
      && lastRecord.kind === LIVE_ATTENDANCE_EVENT_KIND) {
      // Today's classified absence saved only its Live Classroom half: the
      // classification is written now, while that record is still the
      // student's mark. A correction the teacher made since then stands.
      classifyOnly = effectiveAttendanceForStudentDay({ supportEvents: records, ...where }).event === lastRecord;
      write = classifyOnly;
    } else if (last !== undefined) {
      // Mirrored before: only a change in TEAMS is written, so a
      // correction the teacher made in MathMaster since then stands.
      write = last !== code;
    } else if (kind === TEAMS_ATTENDANCE_KIND.PRESENT) {
      // Present, never mirrored: nothing to record, unless it is the
      // student's first day back (an explicit present starts the return
      // check-in). A mark the teacher made in MathMaster is left alone.
      const effective = effectiveAttendanceForStudentDay({ supportEvents: records, ...where }).mark;
      write = !effective && returnsFromAbsence(records, where);
    } else {
      // A code, first seen: recorded even where MathMaster agrees, so a later
      // change in TEAMS is known to be one.
      write = true;
    }
    if (!write) { plan.unchanged += 1; return; }
    plan.marks.push({
      studentId, code, kind, mark: TEAMS_KIND_MARK[kind], label: code ? table[code].label : 'Present', today, ...(classifyOnly ? { classifyOnly } : {}),
    });
  });
  plan.unknownCodes = [...unknown].sort();
  return plan;
};
