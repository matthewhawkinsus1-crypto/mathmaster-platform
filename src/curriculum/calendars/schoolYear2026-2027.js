// The 2026-27 district instructional calendar. The dates live in
// functions/shared/schoolYearCalendar.mjs so the Cloud Functions read the same
// closures the browser does (TT17: an individual "next school day" skips
// them); this file keeps the path every course calendar and screen imports.
export {
  SCHOOL_YEAR_2026_27,
  schoolYearClosedDateKeys,
  schoolYearNonInstructionalRanges,
  default,
} from '../../../functions/shared/schoolYearCalendar.mjs';
