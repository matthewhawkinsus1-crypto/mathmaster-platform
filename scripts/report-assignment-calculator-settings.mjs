#!/usr/bin/env node
/*
 * WHICH LIVE ASSIGNMENTS CARRY A CALCULATOR SETTING, AND WHICH OF THEM HAVE AN
 * EXIT TICKET, QUIZ OR TEST OPEN. A READ-ONLY REPORT.
 * OP03 (finding C1-46; docs/handoffs/STUDENT_PASS3_CALCULATOR_SETTING.md,
 * "Before Hosting goes out (S3)"). A release that changes what a stored
 * calculator setting does reaches every assignment that carries one, including
 * the ones students are sitting right now; this is the count to read first, so
 * the release is not made while an assessment is open. It has no write mode:
 * no --execute, no repair, and no Firestore write anywhere in this file
 * (tests/platform/assignmentCalculatorSettingsReport.test.mjs runs its core
 * against a database that throws on any write, and checks the source).
 *
 *   node scripts/report-assignment-calculator-settings.mjs --project <id> [--within-hours <n>] [--assignment <id>]... [--page-size <n>]
 *
 * WHAT COUNTS AS A SETTING.
 *   - The assignment's: toolPolicy.calculator is none, basic, squareRoot,
 *     scientific, graphing or teacherChoice. inherit (the schema's default),
 *     questionSpecific and empty are no setting. A value the platform does not
 *     recognise changes nothing, so it is counted apart, never as a setting.
 *   - A question's own: its calculatorPolicy, or the calculatorMode its spec
 *     embeds (rawSpec, generator or the question itself), on the question or
 *     one of its variants, set to one of those same values.
 * LIVE is not archived. Each live assignment with either kind is counted, by
 * section role: its questions, the ones with a setting of their own, and the
 * ones that take the assignment's (calculatorPolicy.js resolveCalculatorPolicy:
 * an item with no setting of its own is served by the assignment's).
 *
 * WHICH ASSESSMENTS ARE OPEN. Exit tickets (dol), quizzes and tests are the
 * roles whose feedback waits (calculatorPolicy.js isAssessmentActivity). A
 * section of one of them is looked at when the assignment's setting or one of
 * its own questions' is set, and listed when its window is open now or opens
 * within --within-hours (default 0: only those open now; at most 720).
 *   - A quiz or a test is open from the assignment's release to its final
 *     cutoff (late due date, else due date): the dates the student's lifecycle
 *     reads (studentAssignmentOverrides.mjs resolveStudentDeadlines).
 *   - An exit ticket follows getDOLState (assignmentLifecycle.js): it is open
 *     on its instruction day only (sectionDeadline.mjs resolveDolInstructionDateKey,
 *     for every class and class period the assignment names), inside the
 *     assignment's own window, and only if it is enabled. The bell schedule is
 *     NOT read, so the whole school day counts as open and the report says so
 *     (dayLevel): it may list an exit ticket whose ten minutes come later in
 *     the day, never miss one. An exit ticket with no instruction date is
 *     'not-scheduled' and one switched off (dol.enabled false) 'not-enabled':
 *     neither opens, and both are counted.
 *   - A student's own extension is private and is not read: that student can
 *     still be working after the window the report shows.
 *
 * READS. `assignments` only, paged by id or the ids named with --assignment,
 * and only the fields in ASSIGNMENT_FIELDS (a field mask): the per-student
 * fields an assignment can still carry are never read. No other collection
 * is read.
 * WRITES. One local file, release-reports/assignment-calculator-settings-<time>.json
 * (gitignored). Standard output is counts only: no assignment id, title or
 * class appears on it. The file names the assignments.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CALCULATOR_MODES } from '../src/platform/policies/calculatorPolicy.js';
import { ACTIVITY_POLICIES } from '../functions/shared/activityPolicies.mjs';
import { zonedInstant } from '../functions/shared/instructionalCalendar.mjs';
import { SCHOOL_TIME_ZONE, resolveDolInstructionDateKey } from '../functions/shared/sectionDeadline.mjs';
import { resolveStudentDeadlines } from '../functions/shared/studentAssignmentOverrides.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin lives in functions/ (CommonJS).
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

export const REPORT_VERSION = 1;
/*
 * The only fields read from an assignment (a field mask on every read). An
 * assignment can still carry per-student fields — studentOverrides,
 * excusedStudentIds, dol.attemptGrantsByStudentId, audienceHistory — and the
 * mask is what keeps them out of this process altogether. `dol` is named by
 * the five fields that switch on and date the exit ticket, never as a whole.
 */
export const ASSIGNMENT_FIELDS = Object.freeze([
  'title', 'schemaVersion', 'assignedClassIds', 'archived', 'toolPolicy.calculator', 'sections', 'questions',
  // The assignment's own window.
  'releaseAt', 'releaseDate', 'dueAt', 'dueDate', 'lateDueAt', 'lateDueDate',
  // Whether the exit ticket runs, and on which day.
  'assignmentDate', 'dol.enabled', 'dol.instructionDate', 'dol.date', 'dol.instructionDatesByClassId', 'dol.instructionDatesByClassPeriod',
]);
export const REPORT_DIR = 'release-reports';
export const PAGE_SIZE = 100;
export const MAX_WITHIN_HOURS = 24 * 30;

const HOUR_MS = 3_600_000;

/*
 * The values that are a setting. CALCULATOR_MODES is the platform's own list
 * (inherit among them); questionSpecific is the other spelling of "none set".
 */
export const SETTING_VALUES = Object.freeze(Object.values(CALCULATOR_MODES).filter((mode) => mode !== CALCULATOR_MODES.INHERIT));
const NO_SETTING_VALUES = Object.freeze([CALCULATOR_MODES.INHERIT, 'questionSpecific', '']);
/** The roles whose outcome feedback waits: exit tickets, quizzes and tests. */
export const ASSESSMENT_ROLES = Object.freeze(Object.values(ACTIVITY_POLICIES).filter((policy) => policy.feedback !== 'immediate').map((policy) => policy.role));

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const bump = (counts, key, by = 1) => { counts[key] = (counts[key] || 0) + by; };
const isoOrNull = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** { kind: 'none' | 'mode' | 'unrecognized', value } for one stored setting. */
export const calculatorSetting = (value) => {
  const text = clean(value);
  if (NO_SETTING_VALUES.includes(text)) return { kind: 'none', value: null };
  if (SETTING_VALUES.includes(text)) return { kind: 'mode', value: text };
  return { kind: 'unrecognized', value: text.slice(0, 40) };
};

/** The modes a question sets for itself, on the question or any of its variants. Sorted, each once. */
export const questionOwnSettings = (question) => {
  if (!isObject(question)) return [];
  const modes = [];
  [question, ...list(question.variants).filter(isObject)].forEach((root) => {
    [root.calculatorPolicy, root.calculatorMode, root.rawSpec?.calculatorMode, root.generator?.calculatorMode].forEach((value) => {
      const setting = calculatorSetting(value);
      if (setting.kind === 'mode' && !modes.includes(setting.value)) modes.push(setting.value);
    });
  });
  return modes.sort();
};

/*
 * The sections of one stored assignment. V5 keeps `sections[]`; an older
 * document may still hold a flat `questions[]` — it is read too (under each
 * question's own activityRole, else 'legacy'), since its settings are just as
 * live.
 */
const sectionsOf = (assignment) => {
  if (Array.isArray(assignment?.sections) && assignment.sections.length) {
    return assignment.sections.map((section, index) => ({
      sectionId: clean(section?.id) || `section-${index}`,
      role: clean(section?.role).toLowerCase() || 'classwork',
      title: clean(section?.title) || null,
      questions: list(section?.questions),
    }));
  }
  const byRole = {};
  list(assignment?.questions).forEach((question) => {
    const role = clean(question?.activityRole).toLowerCase() || 'legacy';
    (byRole[role] ??= []).push(question);
  });
  return Object.entries(byRole).map(([role, questions]) => ({ sectionId: `legacy-${role}`, role, title: null, questions }));
};

/* --- the windows ------------------------------------------------------------- */

const dayBounds = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return {
    startMs: zonedInstant({ year, month, day }, SCHOOL_TIME_ZONE),
    endMs: zonedInstant({ year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }, SCHOOL_TIME_ZONE),
  };
};

/** The assignment's own window: release to final cutoff. Either end may be unknown (null). */
export const assignmentWindow = (assignment) => {
  const deadlines = resolveStudentDeadlines({ assignment, override: null, timeZone: SCHOOL_TIME_ZONE });
  return { startMs: deadlines.releaseAtMs ?? null, endMs: deadlines.finalCloseAtMs ?? null };
};

/**
 * Every day the exit ticket can be taught on, as a date key: the one for each
 * class the assignment is given to, for each class and class period its dates
 * name, and the assignment's own. Empty when no date is written anywhere.
 */
export const dolDateKeys = (assignment) => {
  const keys = [];
  const add = (classId, classPeriod) => {
    const key = resolveDolInstructionDateKey({ assignment, classId, classPeriod, timeZone: SCHOOL_TIME_ZONE }) ?? null;
    if (key !== null && !keys.includes(key)) keys.push(key);
  };
  const dol = isObject(assignment?.dol) ? assignment.dol : {};
  add(null, null);
  list(assignment?.assignedClassIds).forEach((classId) => add(classId, null));
  Object.keys(isObject(dol.instructionDatesByClassId) ? dol.instructionDatesByClassId : {}).forEach((classId) => add(classId, null));
  Object.keys(isObject(dol.instructionDatesByClassPeriod) ? dol.instructionDatesByClassPeriod : {}).forEach((period) => add(null, period));
  return keys.sort();
};

/**
 * When a section of this role can be open: windows { startMs, endMs, dates,
 * dayLevel, noDates }, an end of null meaning "not bounded". (See the header
 * for what each role's window is.)
 */
export const sectionWindows = (assignment, role) => {
  const own = assignmentWindow(assignment);
  if (role !== 'dol') {
    return [{ startMs: own.startMs, endMs: own.endMs, dates: [], dayLevel: false, noDates: own.startMs === null && own.endMs === null }];
  }
  return dolDateKeys(assignment).map((key) => {
    const day = dayBounds(key);
    return {
      startMs: own.startMs === null ? day.startMs : Math.max(day.startMs, own.startMs),
      endMs: own.endMs === null ? day.endMs : Math.min(day.endMs, own.endMs),
      dates: [key],
      dayLevel: true,
      noDates: false,
    };
  }).filter((window) => window.startMs <= window.endMs);
};

export const WINDOW_STATE = Object.freeze({
  OPEN: 'open',
  SOON: 'opens-soon',
  LATER: 'later',
  CLOSED: 'closed',
  NOT_SCHEDULED: 'not-scheduled',
  NOT_ENABLED: 'not-enabled',
});

const windowFacts = (state, chosen) => ({
  state,
  opensAt: isoOrNull(chosen.reduce((least, window) => (window.startMs === null ? least : Math.min(least ?? window.startMs, window.startMs)), null)),
  closesAt: chosen.length === 0 || chosen.some((window) => window.endMs === null)
    ? null
    : isoOrNull(chosen.reduce((latest, window) => Math.max(latest ?? window.endMs, window.endMs), null)),
  dates: [...new Set(chosen.flatMap((window) => window.dates))].sort(),
  dayLevel: chosen.some((window) => window.dayLevel),
  noDates: chosen.some((window) => window.noDates),
});

/** Where a section's windows stand at `nowMs`: open, opening within `withinMs`, opening later, or over. */
export const windowState = (windows, nowMs, withinMs = 0) => {
  const open = windows.filter((window) => (window.startMs === null || window.startMs <= nowMs) && (window.endMs === null || nowMs <= window.endMs));
  if (open.length) return windowFacts(WINDOW_STATE.OPEN, open);
  const upcoming = windows.filter((window) => window.startMs !== null && window.startMs > nowMs).sort((a, b) => a.startMs - b.startMs);
  if (upcoming.length) {
    const soonest = upcoming.filter((window) => window.startMs === upcoming[0].startMs);
    return windowFacts(upcoming[0].startMs <= nowMs + withinMs ? WINDOW_STATE.SOON : WINDOW_STATE.LATER, soonest);
  }
  const lastOver = windows.length ? [windows.reduce((latest, window) => (window.endMs > latest.endMs ? window : latest))] : [];
  return windowFacts(WINDOW_STATE.CLOSED, lastOver);
};

/** The exit ticket's window state: the days it can be taught on, if it is switched on and dated. */
export const dolWindowState = (assignment, nowMs, withinMs = 0) => {
  if (assignment?.dol?.enabled === false) return windowFacts(WINDOW_STATE.NOT_ENABLED, []);
  if (dolDateKeys(assignment).length === 0) return windowFacts(WINDOW_STATE.NOT_SCHEDULED, []);
  return windowState(sectionWindows(assignment, 'dol'), nowMs, withinMs);
};

/* --- one assignment ----------------------------------------------------------- */

/**
 * One live assignment's report entry. Pure. `counted` says whether it carries a
 * setting of either kind (the report keeps only those); `unrecognizedSetting`
 * is an assignment value the platform ignores.
 */
export const assignmentCalculatorEntry = (id, assignment, { nowMs, withinMs = 0 } = {}) => {
  const setting = calculatorSetting(assignment?.toolPolicy?.calculator);
  const assignmentSetting = setting.kind === 'mode' ? setting.value : null;
  const totals = { questions: 0, withOwnSetting: 0, servedByAssignmentSetting: 0 };
  const sections = sectionsOf(assignment).map((section) => {
    const ownSettings = {};
    let withOwnSetting = 0;
    section.questions.forEach((question) => {
      const modes = questionOwnSettings(question);
      if (modes.length) withOwnSetting += 1;
      modes.forEach((mode) => bump(ownSettings, mode));
    });
    const questions = section.questions.length;
    const servedByAssignmentSetting = assignmentSetting ? questions - withOwnSetting : 0;
    totals.questions += questions;
    totals.withOwnSetting += withOwnSetting;
    totals.servedByAssignmentSetting += servedByAssignmentSetting;
    const entry = { sectionId: section.sectionId, role: section.role, title: section.title, questions, withOwnSetting, servedByAssignmentSetting, ownSettings };
    // An assessment is affected when the assignment's setting reaches it, or
    // one of its own questions sets one: then when it is open matters.
    if (ASSESSMENT_ROLES.includes(section.role) && (assignmentSetting || withOwnSetting)) {
      entry.window = section.role === 'dol'
        ? dolWindowState(assignment, nowMs, withinMs)
        : windowState(sectionWindows(assignment, section.role), nowMs, withinMs);
    }
    return entry;
  });
  return {
    counted: Boolean(assignmentSetting) || totals.withOwnSetting > 0,
    unrecognizedSetting: setting.kind === 'unrecognized' ? setting.value : null,
    entry: {
      assignmentId: id,
      title: clean(assignment?.title) || null,
      schemaVersion: assignment?.schemaVersion ?? null,
      assignedClassCount: list(assignment?.assignedClassIds).length,
      assignmentSetting,
      ...totals,
      sections,
    },
  };
};

async function* pagedDocuments(collection, pageSize) {
  let last = null;
  for (;;) {
    let page = collection.limit(pageSize);
    if (last) page = page.startAfter(last);
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await page.get();
    for (const doc of snapshot.docs) yield doc;
    if (snapshot.docs.length < pageSize) return;
    last = snapshot.docs[snapshot.docs.length - 1];
  }
}

const SECTION_COUNT_KEY = Object.freeze({
  [WINDOW_STATE.OPEN]: 'open',
  [WINDOW_STATE.SOON]: 'opensSoon',
  [WINDOW_STATE.LATER]: 'later',
  [WINDOW_STATE.CLOSED]: 'closed',
  [WINDOW_STATE.NOT_SCHEDULED]: 'notScheduled',
  [WINDOW_STATE.NOT_ENABLED]: 'notEnabled',
});

/**
 * Reads and returns the report object. `db` is a Firestore (Admin SDK); only
 * collection/doc/orderBy/select/limit/startAfter/get and getAll (with a fieldMask) are used.
 */
export const runAssignmentCalculatorSettingsReport = async ({
  db, assignmentIds = [], pageSize = PAGE_SIZE, withinHours = 0, now = () => Date.now(), documentIdField = '__name__',
} = {}) => {
  const nowMs = now();
  const withinMs = withinHours * HOUR_MS;
  const startedAt = new Date(nowMs).toISOString();
  const totals = {
    assignmentsRead: 0,
    archivedSkipped: 0,
    liveAssignments: 0,
    liveWithAssignmentSetting: 0,
    liveWithQuestionSetting: 0,
    liveWithEither: 0,
    assignmentSettings: {},
    unrecognizedAssignmentSettings: {},
    questions: 0,
    questionsWithOwnSetting: 0,
    questionsServedByAssignmentSetting: 0,
    byRole: {},
    assessmentSections: { open: 0, opensSoon: 0, later: 0, closed: 0, notScheduled: 0, notEnabled: 0 },
  };
  const assignments = [];
  const consider = (id, data) => {
    totals.assignmentsRead += 1;
    if (data?.archived === true) { totals.archivedSkipped += 1; return; }
    totals.liveAssignments += 1;
    const { counted, unrecognizedSetting, entry } = assignmentCalculatorEntry(id, data || {}, { nowMs, withinMs });
    if (unrecognizedSetting !== null) bump(totals.unrecognizedAssignmentSettings, unrecognizedSetting);
    if (!counted) return;
    assignments.push(entry);
    totals.liveWithEither += 1;
    if (entry.assignmentSetting) { totals.liveWithAssignmentSetting += 1; bump(totals.assignmentSettings, entry.assignmentSetting); }
    if (entry.withOwnSetting > 0) totals.liveWithQuestionSetting += 1;
    totals.questions += entry.questions;
    totals.questionsWithOwnSetting += entry.withOwnSetting;
    totals.questionsServedByAssignmentSetting += entry.servedByAssignmentSetting;
    const roles = [];
    entry.sections.forEach((section) => {
      const role = (totals.byRole[section.role] ??= { assignments: 0, sections: 0, questions: 0, withOwnSetting: 0, servedByAssignmentSetting: 0 });
      if (!roles.includes(section.role)) { roles.push(section.role); role.assignments += 1; }
      role.sections += 1;
      role.questions += section.questions;
      role.withOwnSetting += section.withOwnSetting;
      role.servedByAssignmentSetting += section.servedByAssignmentSetting;
      if (section.window) totals.assessmentSections[SECTION_COUNT_KEY[section.window.state]] += 1;
    });
  };
  const missing = [];
  if (assignmentIds.length) {
    const snapshots = await db.getAll(...assignmentIds.map((id) => db.collection('assignments').doc(id)), { fieldMask: [...ASSIGNMENT_FIELDS] });
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists) consider(snapshot.id, snapshot.data());
      else missing.push(assignmentIds[index]);
    });
  } else {
    const ordered = db.collection('assignments').orderBy(documentIdField).select(...ASSIGNMENT_FIELDS);
    for await (const doc of pagedDocuments(ordered, pageSize)) consider(doc.id, doc.data());
  }
  assignments.sort((a, b) => byText(a.assignmentId, b.assignmentId));

  // The assessments an owner must not release over: open now, or opening soon.
  const windows = [];
  assignments.forEach((entry) => {
    entry.sections.forEach((section) => {
      if (!section.window || ![WINDOW_STATE.OPEN, WINDOW_STATE.SOON].includes(section.window.state)) return;
      windows.push({
        assignmentId: entry.assignmentId,
        title: entry.title,
        assignedClassCount: entry.assignedClassCount,
        role: section.role,
        sectionId: section.sectionId,
        assignmentSetting: entry.assignmentSetting,
        questions: section.questions,
        withOwnSetting: section.withOwnSetting,
        servedByAssignmentSetting: section.servedByAssignmentSetting,
        ownSettings: section.ownSettings,
        ...section.window,
      });
    });
  });
  const order = { [WINDOW_STATE.OPEN]: 0, [WINDOW_STATE.SOON]: 1 };
  windows.sort((a, b) => order[a.state] - order[b.state]
    || byText(String(a.opensAt), String(b.opensAt))
    || byText(a.assignmentId, b.assignmentId)
    || byText(a.sectionId, b.sectionId));

  return {
    tool: 'report-assignment-calculator-settings',
    version: REPORT_VERSION,
    readOnly: true,
    startedAt,
    withinHours,
    assignmentFilter: assignmentIds.length ? [...assignmentIds] : null,
    missingAssignments: missing,
    settingValues: [...SETTING_VALUES],
    assessmentRoles: [...ASSESSMENT_ROLES],
    schoolTimeZone: SCHOOL_TIME_ZONE,
    notes: [
      'Live is not archived. A setting is toolPolicy.calculator, or a question\'s own calculatorPolicy / calculatorMode, set to one of settingValues; inherit, questionSpecific and empty are no setting. A value the platform does not recognise changes nothing and is counted apart (unrecognizedAssignmentSettings).',
      'Counts are questions: servedByAssignmentSetting is the questions with no setting of their own, which take the assignment\'s. Only assignments that carry a setting of either kind are listed in assignments.',
      'assessmentWindows lists the exit ticket (dol), quiz and test sections whose assignment setting or own questions\' settings are set, and whose window is open now or opens within withinHours.',
      'A quiz or test is open from the assignment\'s release to its final cutoff (late due date, else due date); noDates: neither is set, so it is always open. An exit ticket is open on its instruction day, inside that window, when it is enabled; the bell schedule is not read, so the whole school day counts as open (dayLevel). not-scheduled: no instruction date anywhere. not-enabled: dol.enabled is false.',
      'A student\'s own extension is private and not read: that student can still be working after closesAt.',
      'Only the fields in ASSIGNMENT_FIELDS were read (a field mask), so no per-student field on an assignment was read. Titles are the teacher\'s own.',
    ],
    totals,
    assessmentWindows: windows,
    assignments,
  };
};

/** The lines printed to standard output: counts only, never an id, a title or a class. */
export const formatReportLines = (report) => {
  const { totals } = report;
  const lines = [];
  const add = (label, value) => lines.push(`  ${label.padEnd(56)} ${value}`);
  const byName = (counts) => Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `${name} ${count}`).join(' · ') || 'none';
  add('assignments read', totals.assignmentsRead);
  if (report.missingAssignments.length) add('named assignments not found', report.missingAssignments.length);
  add('archived (left out)', totals.archivedSkipped);
  add('live assignments', totals.liveAssignments);
  add('  with an assignment setting', `${totals.liveWithAssignmentSetting} (${byName(totals.assignmentSettings)})`);
  add('  with a question\'s own setting', totals.liveWithQuestionSetting);
  add('  with either', totals.liveWithEither);
  if (Object.keys(totals.unrecognizedAssignmentSettings).length) {
    add('  settings the platform does not recognise (not counted)', byName(totals.unrecognizedAssignmentSettings));
  }
  add('questions in those assignments', `${totals.questions} · own setting ${totals.questionsWithOwnSetting} · take the assignment's ${totals.questionsServedByAssignmentSetting}`);
  Object.entries(totals.byRole).sort(([a], [b]) => a.localeCompare(b)).forEach(([role, counts]) => {
    add(`  ${role} (${counts.assignments} assignments, ${counts.sections} sections)`,
      `questions ${counts.questions} · own setting ${counts.withOwnSetting} · take the assignment's ${counts.servedByAssignmentSetting}`);
  });
  const sections = totals.assessmentSections;
  lines.push('  exit ticket, quiz and test sections that carry a setting:');
  add('    open now', sections.open);
  if (report.withinHours > 0) add(`    opening within ${report.withinHours} hour${report.withinHours === 1 ? '' : 's'}`, sections.opensSoon);
  add('    opening later', sections.later);
  add('    over', sections.closed);
  add('    exit tickets with no date, or switched off', sections.notScheduled + sections.notEnabled);
  return lines;
};

// --- CLI ----------------------------------------------------------------------

const USAGE = `Usage: node scripts/report-assignment-calculator-settings.mjs --project <id> [options]

Read-only. Counts the live (not archived) assignments that carry a calculator
setting, on the assignment or on a question, by section role, and lists the
exit ticket, quiz and test sections of those that are open now or open within
--within-hours. Writes one JSON file to ${REPORT_DIR}/ (gitignored); standard
output is counts only, and the file names the assignments.

  --project <id>        Firebase project (Application Default Credentials; a viewer role is enough)
  --within-hours <n>    also list the assessments that open within n hours (default 0: only those open now; at most ${MAX_WITHIN_HOURS})
  --assignment <id>     only this assignment (repeatable; default every assignment)
  --page-size <n>       documents per read (default ${PAGE_SIZE})`;

export const parseReportArgs = (argv) => {
  const options = { assignments: [] };
  const known = ['--project', '--assignment', '--page-size', '--within-hours'];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!known.includes(arg)) throw new Error(`unknown argument ${arg} (this report has no write mode and no output option)`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    if (arg === '--assignment') options.assignments.push(value);
    else options[arg.slice(2)] = value;
    index += 1;
  }
  if (!options.project) throw new Error('--project is required');
  const pageSize = options['page-size'] ? Number(options['page-size']) : PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('--page-size must be 1–500');
  const withinHours = options['within-hours'] === undefined ? 0 : Number(options['within-hours']);
  if (!Number.isFinite(withinHours) || withinHours < 0 || withinHours > MAX_WITHIN_HOURS) throw new Error(`--within-hours must be 0–${MAX_WITHIN_HOURS}`);
  return { help: false, project: options.project, assignmentIds: [...new Set(options.assignments)], pageSize, withinHours };
};

export const reportFilePath = (startedAt) => path.join(repoRoot, REPORT_DIR, `assignment-calculator-settings-${startedAt.replace(/[:.]/g, '-')}.json`);

const main = async () => {
  let options;
  try {
    options = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`report-assignment-calculator-settings: ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  let admin;
  try {
    admin = functionsRequire('firebase-admin');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      console.error('report-assignment-calculator-settings: firebase-admin is not installed in functions/. Run `npm --prefix functions ci` first.');
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST || null;
  // Application Default Credentials; under FIRESTORE_EMULATOR_HOST the Admin
  // SDK talks to the emulator instead.
  const app = admin.initializeApp({ projectId: options.project }, 'report-assignment-calculator-settings');
  console.log('Assignment calculator settings (OP03) — READ ONLY (nothing is written to Firestore)');
  console.log(`  project: ${options.project}${emulator ? `  (Firestore emulator ${emulator})` : ''}`);
  let report;
  try {
    report = await runAssignmentCalculatorSettingsReport({
      db: app.firestore(),
      assignmentIds: options.assignmentIds,
      pageSize: options.pageSize,
      withinHours: options.withinHours,
      documentIdField: admin.firestore.FieldPath.documentId(),
    });
  } finally {
    // Firestore keeps gRPC channels open; without this the process lingers.
    await app.delete().catch(() => {});
  }
  report.project = options.project;
  report.emulator = emulator;
  const reportPath = reportFilePath(report.startedAt);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log('');
  console.log(formatReportLines(report).join('\n'));
  console.log(`\nWhich assessments, and the detail per assignment and section: ${path.relative(process.cwd(), reportPath) || reportPath}`);
  console.log('  (its "assessmentWindows" list names the exit tickets, quizzes and tests that are open or about to open)');
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`report-assignment-calculator-settings: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
