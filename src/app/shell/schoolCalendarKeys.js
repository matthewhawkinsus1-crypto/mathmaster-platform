/*
 * THE SCHOOL YEAR'S NON-INSTRUCTIONAL DAYS, AS DATE KEYS.
 *
 * Moved from the top of App.jsx so the modules App's code moves into can read it too.
 */
import { buildNonInstructionalSet } from '../../platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../curriculum/calendars/schoolYear2026-2027.js';

// Built once: the district instructional calendar is static reference data,
// not per-render or per-teacher state (see the identical constant in
// LiveClassMonitor.jsx, which needs the same calendar for the same reason).
export const SCHOOL_NON_INSTRUCTIONAL_KEYS = buildNonInstructionalSet(schoolYearNonInstructionalRanges());
