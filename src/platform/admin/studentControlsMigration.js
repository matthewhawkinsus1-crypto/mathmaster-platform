import { combineOverrideMigrationReports } from '../../../functions/shared/studentAssignmentOverrides.mjs';
import {
  OVERRIDE_MIGRATION_STAGE,
  RETIREMENT_GATE,
  firstFullSchoolDayAfter,
} from '../../../functions/shared/overrideRetirementGate.mjs';
import { schoolYearNonInstructionalRanges } from '../../curriculum/calendars/schoolYear2026-2027.js';
import { buildNonInstructionalSet } from '../path/curriculumCalendar.js';

/*
 * THE ADMINISTRATOR'S VIEW OF THE STUDENTS'-CONTROLS MIGRATION
 * (docs/architecture/student-assignment-overrides.md §11).
 *
 * The server decides every gate (functions/shared/overrideRetirementGate.mjs)
 * and runs every pass (studentAssignmentOverrideStore.mjs); this module only
 * drives the paged passes the admin card asks for and says, in an
 * administrator's words, which stage the school is in and why the next step is
 * or is not available. Nothing here retires, strips or restores on its own:
 * each of those is a separate request the card sends only on an explicit,
 * typed action.
 */

const MAX_PAGES = 500;

/**
 * One whole pass, page by page, as one report. A real pass resumes from the
 * server's cursor when an earlier one stopped part-way (the server continues
 * that pass); a dry run always reads from the beginning. `migrate` and
 * `readProgress` are the callables (authService.js), so this is testable.
 */
export const runStudentControlsMigrationPass = async ({
  mode = 'backfill',
  dryRun = true,
  confirm = '',
  onPage = null,
  migrate,
  readProgress = null,
} = {}) => {
  if (typeof migrate !== 'function') throw new Error('A migration callable is required.');
  const progress = !dryRun && typeof readProgress === 'function' ? (await readProgress())?.[mode] : null;
  const resumeFrom = progress && progress.done === false && progress.cursor ? progress.cursor : null;
  const pages = [];
  let startAfter = resumeFrom;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await migrate({
      mode,
      dryRun,
      ...(dryRun || !confirm ? {} : { confirm }),
      ...(startAfter ? { startAfter } : {}),
    });
    pages.push(page || {});
    startAfter = page?.nextCursor || null;
    if (typeof onPage === 'function') onPage(combineOverrideMigrationReports(pages));
  } while (startAfter && pages.length < MAX_PAGES);
  const last = pages[pages.length - 1] || {};
  return { ...combineOverrideMigrationReports(pages), resumedFrom: resumeFrom, pass: last.pass || null };
};

/* ------------------------------------------------------------ the stages */

export const MIGRATION_STEPS = Object.freeze([
  {
    id: 'mirrored',
    label: 'Mirrored',
    summary: 'Private records exist and every server writer keeps the shared copy in step, so older screens still read the same controls.',
  },
  {
    id: OVERRIDE_MIGRATION_STAGE.BACKFILL_INCOMPLETE,
    label: 'Backfill incomplete',
    summary: 'Copy every student’s controls into private records, to the end of a full pass, with no failures.',
  },
  {
    id: OVERRIDE_MIGRATION_STAGE.WAITING_SAFETY_PERIOD,
    label: 'Backfill complete — waiting for the safety period',
    summary: 'The release that reads private records must be live for one full school day, so no older screen is still open when the shared copy stops being kept in step.',
  },
  {
    id: OVERRIDE_MIGRATION_STAGE.READY_TO_RETIRE,
    label: 'Ready to retire',
    summary: 'Every gate passes. Retiring stops the mirror and locks per-student data off shared assignments.',
  },
  {
    id: OVERRIDE_MIGRATION_STAGE.RETIRED,
    label: 'Retired',
    summary: 'Shared writers are locked and the mirror is stopped. Strip the shared copies (dry run first); restore is the rollback.',
  },
]);

/** The step the school is on, and every step's state, from the server's readiness. */
export const describeMigrationStage = (readiness = null) => {
  const stage = readiness?.stage || OVERRIDE_MIGRATION_STAGE.BACKFILL_INCOMPLETE;
  const order = MIGRATION_STEPS.map((step) => step.id);
  const at = Math.max(1, order.indexOf(stage));
  return {
    stage,
    steps: MIGRATION_STEPS.map((step, index) => ({
      ...step,
      // "Mirrored" is the state of every stage before retirement.
      state: step.id === 'mirrored'
        ? (stage === OVERRIDE_MIGRATION_STAGE.RETIRED ? 'done' : 'current')
        : index < at ? 'done' : index === at ? 'current' : 'upcoming',
    })),
    blocking: (readiness?.gates || []).filter((gate) => !gate.ok),
  };
};

export const GATE_LABELS = Object.freeze({
  [RETIREMENT_GATE.CLIENT_CUTOVER_DEPLOYED]: 'The release that reads private records is deployed',
  [RETIREMENT_GATE.LIVE_ONE_FULL_SCHOOL_DAY]: 'It has been live for one full school day',
  [RETIREMENT_GATE.FULL_BACKFILL_COMPLETED]: 'A full backfill pass has completed',
  [RETIREMENT_GATE.BACKFILL_ZERO_FAILURES]: 'That backfill pass had zero failures',
});

/**
 * The first full SCHOOL day after the cutover by the district calendar — the
 * one thing the server cannot see (holidays, staff days). A hint for the
 * administrator's attestation; the server's own floor is the first weekday.
 */
export const firstFullDistrictSchoolDay = (confirmedAtMs, { ranges = schoolYearNonInstructionalRanges() } = {}) => (
  // Nothing recorded (null, '', 0) is no moment at all — never the epoch.
  typeof confirmedAtMs === 'number' && Number.isFinite(confirmedAtMs) && confirmedAtMs > 0
    ? firstFullSchoolDayAfter(confirmedAtMs, { nonInstructionalDateKeys: [...buildNonInstructionalSet(ranges)] })
    : null
);

/** The six numbers an administrator reads before a strip, in the order they are asked for. */
export const stripReportRows = (report = {}) => [
  ['Assignments scanned', report.assignmentsScanned || 0],
  ['Assignments with shared student data', report.assignmentsWithSharedStudentData || 0],
  ['Records confirmed private', report.recordsConfirmedPrivate ?? report.recordsUnchanged ?? 0],
  ['Awaiting absorption (copied in first)', report.studentsAwaitingAbsorption || 0],
  ['Failures', Array.isArray(report.failures) ? report.failures.length : 0],
  [report.dryRun === false ? 'Archives written' : 'Archives that would be written', report.dryRun === false ? report.archivesWritten || 0 : report.archivesToWrite || 0],
];
