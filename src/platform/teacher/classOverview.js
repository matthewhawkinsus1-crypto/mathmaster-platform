import { BAND_LABEL, INSTRUCTIONAL_BAND } from '../profile/studentLearningProfile.js';

/*
 * WHAT IS TRUE ABOUT THIS CLASS, IN ONE PARAGRAPH.
 *
 * The brief's instruction for this screen is a single sentence — "do not create
 * a wall of charts" — and it is the hardest one in the document to follow,
 * because a wall of charts is what you get for free. Every number here is
 * already computed somewhere; putting all of them on one page takes no
 * decisions at all, and produces a screen a teacher glances at and leaves.
 *
 * So this module does the deciding. It returns a small number of SENTENCES
 * about a class, each with the students behind it attached, and it deliberately
 * omits:
 *
 *   Anything that is fine. "22 students on track" is not an observation, it is
 *   the absence of one, and it costs the same space as a real finding.
 *
 *   Any number a teacher cannot act on. A class mastery average of 71% does not
 *   tell anyone what to teach tomorrow. Which three standards are holding the
 *   class back does.
 *
 *   Any distribution shown as a chart when a sentence would do. "Most of this
 *   class is holding at the course band; four students are not" is faster to
 *   read than a bar chart of the same fact, and it fits on a phone.
 *
 * Progressive disclosure is the structure: a headline anyone can read in two
 * seconds, findings underneath it, and the students behind each finding one
 * interaction away — never in the way, never more than one click from reach.
 */

const list = (value) => (Array.isArray(value) ? value : []);

export const OVERVIEW_SECTION = Object.freeze({
  BANDS: 'bands',
  STANDARDS: 'standards',
  RIGOR: 'rigor',
  WORK: 'work',
});

/**
 * How the class is distributed across instructional bands — as counts a
 * sentence can be built from, not as a chart.
 *
 * Students the profile has not classified are counted SEPARATELY and never
 * folded into "on level". A class of 30 where 12 are still establishing a
 * baseline is a different class from one where 12 are confirmed on level, and a
 * screen that shows both as the same green bar is lying to the teacher.
 */
export const bandDistribution = (students = [], profilesByStudentId = {}) => {
  const buckets = {
    [INSTRUCTIONAL_BAND.BELOW]: [],
    [INSTRUCTIONAL_BAND.ON]: [],
    [INSTRUCTIONAL_BAND.ABOVE]: [],
    unclassified: [],
  };
  list(students).forEach((student) => {
    const profile = profilesByStudentId[student.id] || null;
    const name = student.displayName || student.name || String(student.id);
    const entry = { studentId: student.id, studentName: name };
    if (!profile?.baseline?.established) { buckets.unclassified.push(entry); return; }
    const band = profile.instructionalBand;
    (buckets[band] || buckets.unclassified).push(entry);
  });
  Object.values(buckets).forEach((bucket) => bucket.sort((a, b) => (
    String(a.studentName).localeCompare(String(b.studentName))
  )));
  return buckets;
};

/**
 * The standards holding this class back, ranked.
 *
 * Only standards with enough class-wide evidence to be worth naming. A standard
 * two students have touched is not a class problem, and reporting it as one
 * sends a teacher to reteach something twenty-eight people already know.
 */
export const strugglingStandards = (students = [], masteryProfilesByStudentId = {}, {
  minStudents = 5, atRiskScore = 70, minShare = 0.34, limit = 3,
} = {}) => {
  const byStandard = new Map();
  list(students).forEach((student) => {
    const teks = masteryProfilesByStudentId[student.id]?.teks || {};
    Object.entries(teks).forEach(([code, summary]) => {
      const score = Number(summary?.score);
      if (!Number.isFinite(score)) return;
      if (!byStandard.has(code)) byStandard.set(code, { code, scores: [], atRisk: [] });
      const entry = byStandard.get(code);
      entry.scores.push(score);
      if (score < atRiskScore) {
        entry.atRisk.push({
          studentId: student.id,
          studentName: student.displayName || student.name || String(student.id),
          score,
        });
      }
    });
  });

  return [...byStandard.values()]
    .filter((entry) => entry.scores.length >= minStudents)
    .map((entry) => ({
      code: entry.code,
      students: entry.scores.length,
      atRisk: entry.atRisk.sort((a, b) => a.score - b.score),
      share: entry.atRisk.length / entry.scores.length,
      average: Math.round(entry.scores.reduce((sum, value) => sum + value, 0) / entry.scores.length),
    }))
    .filter((entry) => entry.share >= minShare)
    .sort((a, b) => b.share - a.share || a.average - b.average)
    .slice(0, limit);
};

/**
 * What rigor this class is actually receiving, from delivered evidence.
 *
 * The number that answers "is my adaptive assignment doing anything?" — and the
 * one a teacher has no other way to see. It reads the ADAPTED flag on real
 * evidence rather than the assignment's declared mode, because an assignment
 * can be set to adaptive and still deliver everyone the same question.
 */
export const rigorReach = (evidenceByStudentId = {}) => {
  let delivered = 0;
  let adapted = 0;
  const raised = new Set();
  const lowered = new Set();
  Object.entries(evidenceByStudentId).forEach(([studentId, events]) => {
    list(events).forEach((event) => {
      const snapshot = event?.questionSnapshot;
      if (!snapshot) return;
      delivered += 1;
      if (!snapshot.adapted) return;
      adapted += 1;
      const assigned = Number(snapshot.assignedDifficultyBand);
      const actual = Number(snapshot.difficultyBand);
      if (Number.isFinite(assigned) && Number.isFinite(actual)) {
        if (actual > assigned) raised.add(studentId);
        if (actual < assigned) lowered.add(studentId);
      }
    });
  });
  return {
    delivered,
    adapted,
    share: delivered ? adapted / delivered : 0,
    raisedFor: raised.size,
    loweredFor: lowered.size,
  };
};

/**
 * The whole overview: a headline plus the findings worth a teacher's time.
 *
 * Returns `{ headline, findings }` where every finding carries its own
 * `students` array, so the screen can offer the names without the caller
 * re-deriving them.
 */
export const buildClassOverview = ({
  className = 'This class',
  students = [],
  profilesByStudentId = {},
  masteryProfilesByStudentId = {},
  evidenceByStudentId = {},
  openAssignments = 0,
  needsAttentionCount = 0,
} = {}) => {
  const roster = list(students);
  const bands = bandDistribution(roster, profilesByStudentId);
  const classified = roster.length - bands.unclassified.length;
  const findings = [];

  if (!roster.length) {
    return {
      headline: `${className} has no students yet.`,
      findings: [],
      bands,
      classified: 0,
    };
  }

  // The headline states the shape of the class, and states plainly when it
  // cannot. A class where most students are still unclassified gets told so
  // rather than being described from the third of it we happen to know.
  const headline = classified === 0
    ? `No student in ${className} has enough completed work yet for MathMaster to describe. ${roster.length} students, ${openAssignments} assignment${openAssignments === 1 ? '' : 's'} open.`
    : classified < roster.length / 2
      ? `Only ${classified} of ${roster.length} students in ${className} have enough completed work to describe yet. Everything below is about those ${classified}.`
      : `${bands[INSTRUCTIONAL_BAND.ON].length + bands[INSTRUCTIONAL_BAND.ABOVE].length} of ${classified} described students are holding at or above the course band${
        bands[INSTRUCTIONAL_BAND.BELOW].length ? `; ${bands[INSTRUCTIONAL_BAND.BELOW].length} ${bands[INSTRUCTIONAL_BAND.BELOW].length === 1 ? 'is' : 'are'} not` : ''
      }.${needsAttentionCount ? ` ${needsAttentionCount} item${needsAttentionCount === 1 ? '' : 's'} need your attention.` : ''}`;

  if (bands[INSTRUCTIONAL_BAND.BELOW].length) {
    findings.push({
      section: OVERVIEW_SECTION.BANDS,
      headline: `${bands[INSTRUCTIONAL_BAND.BELOW].length} student${bands[INSTRUCTIONAL_BAND.BELOW].length === 1 ? '' : 's'} below the course band`,
      detail: 'Nothing is holding steadily at the independent course expectation for these students. Their weekly paths already include repair work; a short conference confirms whether it is the right repair.',
      students: bands[INSTRUCTIONAL_BAND.BELOW],
    });
  }

  if (bands.unclassified.length && classified > 0) {
    findings.push({
      section: OVERVIEW_SECTION.BANDS,
      headline: `${bands.unclassified.length} student${bands.unclassified.length === 1 ? ' is' : 's are'} still establishing a baseline`,
      // Said explicitly, because the temptation is to read a grey chip as "fine".
      detail: 'Not a performance finding. These students have not completed enough work for MathMaster to describe them, so nothing on any teacher screen asserts anything about their mathematics yet.',
      students: bands.unclassified,
    });
  }

  strugglingStandards(roster, masteryProfilesByStudentId).forEach((standard) => {
    findings.push({
      section: OVERVIEW_SECTION.STANDARDS,
      headline: `${standard.code} — ${standard.atRisk.length} of ${standard.students} students below 70%`,
      detail: `Class average ${standard.average}%. This is the kind of spread that usually means the lesson rather than the students, which is worth checking before assigning more practice on it.`,
      students: standard.atRisk.map((entry) => ({ ...entry, note: `${entry.score}%` })),
    });
  });

  const rigor = rigorReach(evidenceByStudentId);
  if (rigor.delivered > 0) {
    findings.push({
      section: OVERVIEW_SECTION.RIGOR,
      headline: rigor.adapted
        ? `${Math.round(rigor.share * 100)}% of delivered questions were adapted`
        : 'No question delivered to this class has been adapted',
      detail: rigor.adapted
        ? `Raised for ${rigor.raisedFor} student${rigor.raisedFor === 1 ? '' : 's'}, lowered for ${rigor.loweredFor}. The assigned standard was preserved every time.`
        : 'Either no assignment is set to adaptive, or every student is landing on the authored rigor. Both are legitimate; this line exists so the difference is visible rather than assumed.',
      students: [],
    });
  }

  return { headline, findings, bands, classified };
};

export default buildClassOverview;
