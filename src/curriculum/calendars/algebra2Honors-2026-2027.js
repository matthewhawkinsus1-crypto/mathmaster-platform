// Algebra II Honors — 2026-2027 district tentative calendar.
//
// SOURCE. Transcribed from the district's "Algebra II Honors Tentative Calendar
// SY 26-27" as supplied. Nothing is inferred, corrected, or reordered from
// outside knowledge.
//
// A NOTE ON THE REPEATS. Modules 3, 4 and 5 each appear in more than one part
// of the year, and the April review names modules ("Exploring Quadratic
// Functions", "Reasoning with Shapes") that do not match the module titles used
// earlier in the same document. Both were flagged in the brief as things NOT to
// silently normalise, so each curriculum node simply carries multiple windows
// and the review titles are stored exactly as supplied. If the district's
// tentative calendar is later corrected, this file changes and nothing else
// does.

export const ALGEBRA2_HONORS_2026_2027 = {
  calendarId: 'alg2h-2026-27',
  courseIds: ['algebra2', 'algebra2-honors'],
  label: 'Algebra II Honors — 2026-27 (tentative)',
  firstInstructionalDay: '2026-08-10',
  lastInstructionalDay: '2027-05-29',

  nonInstructionalRanges: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day' },
    { start: '2026-10-12', end: '2026-10-16', label: 'Fall break', derived: true },
    { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving break' },
    { start: '2026-12-21', end: '2027-01-05', label: 'Winter break' },
    { start: '2027-02-15', end: '2027-02-15', label: 'Presidents Day' },
    { start: '2027-03-15', end: '2027-03-19', label: 'Spring break', derived: true },
  ],

  windows: [
    // --- Unit 1: Foundations of Functions -----------------------------------
    { id: 'alg2h.u1', curriculumType: 'unit', curriculumId: 'alg2.unit1', title: 'Unit 1: Foundations of Functions', start: '2026-08-10', end: '2026-08-28', earlyOpenInstructionalDays: 0 },
    { id: 'alg2h.u1.t1', parentId: 'alg2h.u1', curriculumType: 'topic', curriculumId: 'alg2.u1.t1', title: 'Topic 1', start: '2026-08-10', end: '2026-08-21' },
    { id: 'alg2h.u1.t2', parentId: 'alg2h.u1', curriculumType: 'topic', curriculumId: 'alg2.u1.t2', title: 'Topic 2', start: '2026-08-24', end: '2026-08-28' },

    // --- Unit 2: Absolute Value ---------------------------------------------
    { id: 'alg2h.u2', curriculumType: 'unit', curriculumId: 'alg2.unit2', title: 'Unit 2: Absolute Value Functions, Equations, and Inequalities', start: '2026-08-31', end: '2026-09-18' },
    { id: 'alg2h.u2.t1', parentId: 'alg2h.u2', curriculumType: 'topic', curriculumId: 'alg2.u2.t1', title: 'Topic 1', start: '2026-08-31', end: '2026-09-03' },
    { id: 'alg2h.u2.t2', parentId: 'alg2h.u2', curriculumType: 'topic', curriculumId: 'alg2.u2.t2', title: 'Topic 2', start: '2026-09-08', end: '2026-09-15' },
    { id: 'alg2h.u12.assess', curriculumType: 'assessment', curriculumId: 'alg2.units1-2.assessment', title: 'Units 1-2 Assessment', start: '2026-09-16', end: '2026-09-18' },

    // --- Unit 3: Systems ----------------------------------------------------
    { id: 'alg2h.u3', curriculumType: 'unit', curriculumId: 'alg2.u3', title: 'Unit 3: Systems of Linear Equations and Inequalities', start: '2026-09-21', end: '2026-10-02' },

    // --- Unit 4: Expressions, Factoring, Rational Exponents -----------------
    // Split by fall break, which is exactly why instructional-day counting
    // matters: the gap is not five days of progress.
    { id: 'alg2h.u4.a', curriculumType: 'unit', curriculumId: 'alg2.u4', title: 'Unit 4: Expressions, Factoring, Equations with Rational Exponents', start: '2026-10-05', end: '2026-10-08' },
    { id: 'alg2h.u4.b', curriculumType: 'unit', curriculumId: 'alg2.u4', title: 'Unit 4 (continued)', start: '2026-10-19', end: '2026-10-23' },

    // --- Module 3: Analyzing Structure — TWO windows ------------------------
    { id: 'alg2h.m3.a', curriculumType: 'module', curriculumId: 'alg2.m3', title: 'Module 3: Analyzing Structure', start: '2026-10-26', end: '2026-10-27' },
    { id: 'alg2h.m3.dol', curriculumType: 'assessment', curriculumId: 'alg2.module3.dol', title: 'Module 3 DOL', start: '2026-10-28', end: '2026-10-30' },
    { id: 'alg2h.m3.b', curriculumType: 'module', curriculumId: 'alg2.m3', title: 'Module 3: Analyzing Structure (second window)', start: '2027-01-06', end: '2027-01-29' },

    // --- Module 4: Extending Beyond Polynomials — TWO windows ---------------
    { id: 'alg2h.m4.a', curriculumType: 'module', curriculumId: 'alg2.m4', title: 'Module 4: Extending Beyond Polynomials', start: '2026-11-02', end: '2026-11-20' },
    { id: 'alg2h.m4.b', curriculumType: 'module', curriculumId: 'alg2.m4', title: 'Module 4: Extending Beyond Polynomials (second window)', start: '2027-02-01', end: '2027-03-12' },

    // --- Module 5: Exponentials and Logarithmics — TWO windows --------------
    { id: 'alg2h.m5.a', curriculumType: 'module', curriculumId: 'alg2.m5', title: 'Module 5: Exploring Exponentials and Logarithmics', start: '2026-11-30', end: '2026-12-17' },
    { id: 'alg2h.m5.b', curriculumType: 'module', curriculumId: 'alg2.m5', title: 'Module 5: Exploring Exponentials and Logarithmics (second window)', start: '2027-03-22', end: '2027-04-09' },

    // --- April review cycle -------------------------------------------------
    // Titles are stored exactly as the source gives them, including the ones
    // that do not match module names used earlier in the same document.
    { id: 'alg2h.rev.m4', curriculumType: 'review', curriculumId: 'alg2.module4.review', title: 'Module 4 Review: Extending Beyond Polynomials', start: '2027-04-12', end: '2027-04-15', recommendationMode: 'review' },
    { id: 'alg2h.rev.m3', curriculumType: 'review', curriculumId: 'alg2.module3.review', title: 'Module 3 Review: Analyzing Structure', start: '2027-04-16', end: '2027-04-19', recommendationMode: 'review' },
    // Module 2 is named by the syllabus as the quadratic module and the calendar
    // shows a Module 2 REVIEW in April — but no first-teach block anywhere in
    // the supplied pages. Rather than invent a start date, the node is declared
    // unscheduled and carries only the review window the source actually gives.
    { id: 'alg2h.rev.m2', curriculumType: 'review', curriculumId: 'alg2.m2', title: 'Module 2 Review: Exploring Quadratic Functions', start: '2027-04-20', end: '2027-04-22', recommendationMode: 'review', firstTeachMissing: true },
    { id: 'alg2h.rev.m1', curriculumType: 'review', curriculumId: 'alg2.module1.review', title: 'Module 1 Review: Reasoning with Shapes', start: '2027-04-23', end: '2027-04-26', recommendationMode: 'review' },

    // --- Embedded, not blocked out ------------------------------------------
    // Data modelling spans linear, quadratic and exponential families by design,
    // so it has no single dated window. `embedded` means "always in scope",
    // which is different from "unscheduled" (a window the source omitted).
    { id: 'alg2h.modeling', curriculumType: 'embedded', curriculumId: 'alg2.modeling', title: 'Data Modeling and Regression', embedded: true },

    // --- Post-course Geometry extension -------------------------------------
    { id: 'alg2h.geo', curriculumType: 'extension', curriculumId: 'geo.module1', title: 'Geometry Module 1 (post-course extension)', start: '2027-05-05', end: '2027-05-17', recommendationMode: 'extension' },
    { id: 'alg2h.geo.t1', parentId: 'alg2h.geo', curriculumType: 'topic', curriculumId: 'geo.module1.topic1', title: 'Topic 1: Points, Lines, Planes, Rays, and Line Segments', start: '2027-05-05', end: '2027-05-07', recommendationMode: 'extension' },
    { id: 'alg2h.geo.t2', parentId: 'alg2h.geo', curriculumType: 'topic', curriculumId: 'geo.module1.topic2', title: 'Topic 2: Formal Reasoning in Euclidean Geometry', start: '2027-05-10', end: '2027-05-12', recommendationMode: 'extension' },
    { id: 'alg2h.geo.t3', parentId: 'alg2h.geo', curriculumType: 'topic', curriculumId: 'geo.module1.topic3', title: 'Topic 3: Conjectures and Deductive Reasoning', start: '2027-05-13', end: '2027-05-17', recommendationMode: 'extension' },
  ],
};

export default ALGEBRA2_HONORS_2026_2027;
