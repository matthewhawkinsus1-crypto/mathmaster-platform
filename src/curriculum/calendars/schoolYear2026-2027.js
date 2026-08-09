// The 2026-27 district instructional calendar — one source, shared.
//
// WHY THIS FILE EXISTS. Algebra I and Algebra II are taught in the same
// district, so they close on the same days. Until now each course calendar
// carried its own copy of the break list, and two of the entries in each were
// marked `derived: true` because they had been inferred from a gap between two
// window dates rather than read off the calendar. Two copies of a guess is
// worse than one, and both copies were incomplete: MLK Day, Good Friday and
// every professional-development day were missing entirely.
//
// These dates are now the supplied district dates. The `derived` flags are gone
// because the two ranges they marked — fall break and spring break — were
// confirmed rather than corrected.
//
// TWO KINDS OF CLOSURE, AND WHY THE DISTINCTION IS KEPT.
//   breaks              named, multi-day, and what a student calls a holiday.
//   nonInstructionDays  professional development. Staff are in the building;
//                       students are not.
// Both make `isInstructionalDay` false and both are skipped by the five-day
// early-open arithmetic. They stay separate because a screen that says "your
// class reaches this after spring break" is saying something a screen cannot
// say about a Tuesday in February when the teachers had training.
//
// WHAT IS DELIBERATELY NOT HERE.
//   Early-release days stay instructional. A short day is still a day, the
//   calendars show instruction and assessment happening on them, and dropping
//   them would silently lengthen every early-open countdown.
//   Testing days (PSAT, ACT, STAAR, TIA, DOL) stay instructional for the same
//   reason. Removing a testing window would let the five-instructional-day rule
//   leap across it and open content a week early.
// Neither is an oversight; both are the rule.

export const SCHOOL_YEAR_2026_27 = {
  id: '2026-27',
  label: '2026-27 district instructional calendar',
  startDate: '2026-08-10',
  endDate: '2027-05-21',

  breaks: [
    { start: '2026-09-07', end: '2026-09-07', type: 'holiday', label: 'Labor Day' },
    { start: '2026-10-12', end: '2026-10-16', type: 'fallBreak', label: 'Fall break' },
    { start: '2026-11-23', end: '2026-11-27', type: 'thanksgivingBreak', label: 'Thanksgiving break' },
    // Ends 1 January. The 4th and 5th are professional development, so
    // instruction resumes on the 6th — which is exactly where the Algebra II
    // calendar restarts Module 3.
    { start: '2026-12-21', end: '2027-01-01', type: 'winterBreak', label: 'Winter break' },
    { start: '2027-01-18', end: '2027-01-18', type: 'holiday', label: 'Martin Luther King Jr. Day' },
    { start: '2027-02-15', end: '2027-02-15', type: 'holiday', label: 'Presidents Day' },
    { start: '2027-03-15', end: '2027-03-19', type: 'springBreak', label: 'Spring break' },
    { start: '2027-03-26', end: '2027-03-26', type: 'holiday', label: 'Good Friday' },
  ],

  // Students not in attendance. Excluded from instructional-day arithmetic.
  nonInstructionDays: [
    '2026-09-04',
    '2026-10-09',
    '2026-11-03',
    '2026-12-11',
    '2027-01-04',
    '2027-01-05',
    '2027-02-12',
  ],

  // Before the student year opens on 10 August. Held separately because these
  // days sit outside the instructional year rather than interrupting it —
  // nothing counts backwards through them, and a countdown that reached them
  // would already be wrong.
  preServiceDays: [
    { start: '2026-08-03', end: '2026-08-07', type: 'professionalDevelopment', label: 'Pre-service professional development' },
  ],

  // Short days on which instruction still happens. Recorded so the decision is
  // visible and reversible, not so it can be applied.
  earlyReleaseDays: ['2026-11-20', '2026-12-18', '2027-03-12', '2027-05-21'],
};

/**
 * The shape `loadCalendar` consumes: every closure flattened into ranges.
 * A course calendar sets `nonInstructionalRanges: schoolYearNonInstructionalRanges()`
 * rather than restating the district's dates.
 */
export const schoolYearNonInstructionalRanges = (year = SCHOOL_YEAR_2026_27) => ([
  ...year.breaks.map((entry) => ({ start: entry.start, end: entry.end, label: entry.label, type: entry.type })),
  ...year.nonInstructionDays.map((day) => ({
    start: day, end: day, label: 'Professional development', type: 'professionalDevelopment',
  })),
]);

export default SCHOOL_YEAR_2026_27;
