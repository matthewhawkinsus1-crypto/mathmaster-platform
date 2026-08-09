// Algebra I / Algebra I Honors — 2026-2027 district tentative calendar.
//
// SOURCE. Transcribed from the district's "Algebra I / Algebra I Honors
// (Grade 9) Bluebonnet Curriculum Tentative Calendar" as supplied. Nothing here
// is inferred from TEKS ordering, another district's pacing guide, or a
// different Bluebonnet edition. Where the brief gave an approximate boundary
// ("late February-ish", "around the semester transition") the approximation is
// recorded as given and marked `approximate: true` rather than sharpened.
//
// TENTATIVE. The source document calls itself tentative, so this file is meant
// to be edited. Changing a date here changes the platform's behaviour; no
// recommendation code needs to be touched.
//
// GRANULARITY IS MIXED ON PURPOSE. Early Module 1 has lesson-level dates
// because the calendar gives them; later stretches only name a module or topic.
// Missing lesson dates are not invented.
//
// ONE CALENDAR, TWO COURSES. The source serves Algebra I and Algebra I Honors
// together. Honors differs by adaptive policy — acceleration radius, difficulty,
// extension — never by different dates.

export const ALGEBRA1_2026_2027 = {
  calendarId: 'alg1-2026-27',
  courseIds: ['algebra1', 'algebra1-honors'],
  label: 'Algebra I / Algebra I Honors — 2026-27 (tentative)',
  firstInstructionalDay: '2026-08-10',
  lastInstructionalDay: '2027-05-29',

  // Days the calendar shows as non-instructional. These matter because the
  // early-open rule counts instructional days: Thanksgiving week must not spend
  // five of them. Entries marked `derived` come from a gap the supplied dates
  // themselves imply (instruction stops on one date and resumes on a later
  // one) rather than from a named holiday in the brief.
  nonInstructionalRanges: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day' },
    { start: '2026-10-12', end: '2026-10-16', label: 'Fall break', derived: true },
    { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving break' },
    { start: '2026-12-21', end: '2027-01-05', label: 'Winter break' },
    { start: '2027-02-15', end: '2027-02-15', label: 'Presidents Day' },
    { start: '2027-03-15', end: '2027-03-19', label: 'Spring break', derived: true },
  ],

  windows: [
    // --- Module 1: Searching for Patterns -----------------------------------
    // Course start, so there is no earlier instructional week to open into.
    {
      id: 'alg1.m1',
      curriculumType: 'module',
      curriculumId: 'alg1.module1',
      title: 'Module 1: Searching for Patterns',
      start: '2026-08-10', end: '2026-09-10',
      earlyOpenInstructionalDays: 0,
    },
    { id: 'alg1.m1.t1.intro', parentId: 'alg1.m1', curriculumType: 'lesson', curriculumId: 'alg1.module1.topic1.intro', title: 'Topic 1 Intro Lesson', start: '2026-08-10', end: '2026-08-11' },
    { id: 'alg1.m1.t1.l1', parentId: 'alg1.m1', curriculumType: 'lesson', curriculumId: 'alg1.module1.topic1.lesson1', title: 'Topic 1 Lesson 1', start: '2026-08-12', end: '2026-08-13' },
    { id: 'alg1.m1.t1.l23', parentId: 'alg1.m1', curriculumType: 'lesson', curriculumId: 'alg1.module1.topic1.lesson2-3', title: 'Topic 1 Lessons 2-3', start: '2026-08-14', end: '2026-08-19' },
    { id: 'alg1.m1.t1.l4', parentId: 'alg1.m1', curriculumType: 'lesson', curriculumId: 'alg1.module1.topic1.lesson4', title: 'Topic 1 Lesson 4', start: '2026-08-20', end: '2026-08-21' },
    { id: 'alg1.m1.t2', parentId: 'alg1.m1', curriculumType: 'topic', curriculumId: 'alg1.module1.topic2', title: 'Topic 2 Lessons 1-3', start: '2026-08-24', end: '2026-09-02' },
    { id: 'alg1.m1.assess', parentId: 'alg1.m1', curriculumType: 'assessment', curriculumId: 'alg1.module1.assessment', title: 'Module 1 Assessment', start: '2026-09-09', end: '2026-09-10' },

    // --- Module 2: Exploring Constant Rate of Change ------------------------
    {
      id: 'alg1.m2',
      curriculumType: 'module',
      curriculumId: 'alg1.module2',
      title: 'Module 2: Exploring Constant Rate of Change',
      start: '2026-09-03', end: '2026-10-30',
    },
    { id: 'alg1.m2.t1', parentId: 'alg1.m2', curriculumType: 'topic', curriculumId: 'alg1.module2.topic1', title: 'Topic 1', start: '2026-09-03', end: '2026-09-29' },
    { id: 'alg1.m2.assess1', parentId: 'alg1.m2', curriculumType: 'assessment', curriculumId: 'alg1.module2.assessment1', title: 'Module 2 Assessment', start: '2026-09-30', end: '2026-10-01' },
    { id: 'alg1.m2.t2', parentId: 'alg1.m2', curriculumType: 'topic', curriculumId: 'alg1.module2.topic2', title: 'Topic 2', start: '2026-10-05', end: '2026-10-27' },
    { id: 'alg1.m2.assess2', parentId: 'alg1.m2', curriculumType: 'assessment', curriculumId: 'alg1.module2.assessment2', title: 'Module 2 Assessment', start: '2026-10-28', end: '2026-10-30' },

    // --- Module 3: Modeling Linear Equations and Inequalities ---------------
    {
      id: 'alg1.m3',
      curriculumType: 'module',
      curriculumId: 'alg1.module3',
      title: 'Module 3: Modeling Linear Equations and Inequalities',
      start: '2026-11-02', end: '2026-12-18',
    },
    { id: 'alg1.m3.t1', parentId: 'alg1.m3', curriculumType: 'topic', curriculumId: 'alg1.module3.topic1', title: 'Topic 1', start: '2026-11-02', end: '2026-11-20' },
    { id: 'alg1.m3.t2', parentId: 'alg1.m3', curriculumType: 'topic', curriculumId: 'alg1.module3.topic2', title: 'Topic 2', start: '2026-11-30', end: '2026-12-14' },
    { id: 'alg1.m13.assess', parentId: 'alg1.m3', curriculumType: 'assessment', curriculumId: 'alg1.modules1-3.assessment', title: 'Modules 1-3 Assessment', start: '2026-12-15', end: '2026-12-18' },

    // --- Module 4: Investigating Growth and Decay ---------------------------
    // Opens after winter break; the early-open week is whatever instructional
    // days precede it, which the break makes December rather than January.
    {
      id: 'alg1.m4',
      curriculumType: 'module',
      curriculumId: 'alg1.module4',
      title: 'Module 4: Investigating Growth and Decay',
      start: '2027-01-06', end: '2027-02-19',
    },
    { id: 'alg1.m4.t1', parentId: 'alg1.m4', curriculumType: 'topic', curriculumId: 'alg1.module4.topic1', title: 'Topic 1', start: '2027-01-06', end: '2027-01-19' },
    { id: 'alg1.m4.assess', parentId: 'alg1.m4', curriculumType: 'assessment', curriculumId: 'alg1.module4.assessment', title: 'Module 4 Assessment', start: '2027-01-20', end: '2027-01-22' },
    { id: 'alg1.m4.t2', parentId: 'alg1.m4', curriculumType: 'topic', curriculumId: 'alg1.module4.topic2', title: 'Topic 2', start: '2027-01-25', end: '2027-02-19' },

    // --- Module 5: Maximizing and Minimizing --------------------------------
    {
      id: 'alg1.m5',
      curriculumType: 'module',
      curriculumId: 'alg1.module5',
      title: 'Module 5: Maximizing and Minimizing',
      start: '2027-02-22', end: '2027-03-12',
      approximate: true,
    },
    { id: 'alg1.m5.t1', parentId: 'alg1.m5', curriculumType: 'topic', curriculumId: 'alg1.module5.topic1', title: 'Topic 1', start: '2027-02-22', end: '2027-02-26' },
    { id: 'alg1.m5.t2', parentId: 'alg1.m5', curriculumType: 'topic', curriculumId: 'alg1.module5.topic2', title: 'Topic 2', start: '2027-03-01', end: '2027-03-08' },
    { id: 'alg1.m5.assess', parentId: 'alg1.m5', curriculumType: 'assessment', curriculumId: 'alg1.module5.assessment', title: 'Module 5 Assessment', start: '2027-03-10', end: '2027-03-12' },

    // --- STAAR review -------------------------------------------------------
    // Not a new content module: this is where accumulated mastery evidence
    // should decide what each student reviews.
    {
      id: 'alg1.staar-review',
      curriculumType: 'review',
      curriculumId: 'alg1.staar.review',
      title: 'Algebra I STAAR Review',
      start: '2027-03-22', end: '2027-04-20',
      recommendationMode: 'review',
    },
    { id: 'alg1.staar', curriculumType: 'assessment', curriculumId: 'alg1.staar.exam', title: 'Algebra I STAAR', start: '2027-04-21', end: '2027-04-21' },

    // --- Post-EOC extension into Algebra II ---------------------------------
    // The calendar explicitly moves Algebra I students into Algebra II Module 1
    // after the EOC, so these stop being far-future content on that date.
    {
      id: 'alg1.post-eoc',
      curriculumType: 'extension',
      curriculumId: 'alg2.module1',
      title: 'Algebra II Module 1: Absolute Value (post-EOC extension)',
      start: '2027-04-22', end: '2027-05-17',
      recommendationMode: 'extension',
    },
    { id: 'alg1.post-eoc.t1', parentId: 'alg1.post-eoc', curriculumType: 'topic', curriculumId: 'alg2.module1.topic1', title: 'Topic 1: Defining Absolute Value Functions', start: '2027-04-22', end: '2027-04-28', recommendationMode: 'extension' },
    { id: 'alg1.post-eoc.t2', parentId: 'alg1.post-eoc', curriculumType: 'topic', curriculumId: 'alg2.module1.topic2', title: 'Topic 2: Transformations of Absolute Value Equations', start: '2027-04-29', end: '2027-05-09', recommendationMode: 'extension' },
    { id: 'alg1.post-eoc.t3', parentId: 'alg1.post-eoc', curriculumType: 'topic', curriculumId: 'alg2.module1.topic3', title: 'Topic 3: Absolute Value Equations and Inequalities', start: '2027-05-10', end: '2027-05-17', recommendationMode: 'extension' },
  ],
};

export default ALGEBRA1_2026_2027;
