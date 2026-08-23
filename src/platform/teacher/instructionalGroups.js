import { INSTRUCTIONAL_BAND } from '../profile/studentLearningProfile.js';
import { academicFindingsFor } from './needsAttention.js';

/*
 * SUGGESTED GROUPS — AND THE WORD "SUGGESTED" IS DOING REAL WORK.
 *
 * Grouping students by need is ordinary, useful teaching. Grouping students by
 * a label the software assigned them, which then follows them for a year, is
 * tracking — and tracking is the failure mode this whole platform is built to
 * avoid. Three rules keep the distinction:
 *
 *   1. NOTHING IS STORED. A group is recomputed from current evidence every
 *      time it is asked for. There is no field on a student that says "Tier 3",
 *      so there is nothing to become stale, nothing to be inherited by next
 *      year's teacher, and nothing a student can be told they "are".
 *
 *   2. EVERY PLACEMENT CARRIES ITS REASON. A group with no reason is a label. A
 *      group that says "confirmed prerequisite gaps two levels down" is a
 *      teaching decision the teacher can read, disagree with, and act on.
 *
 *   3. A STUDENT WITHOUT ENOUGH EVIDENCE IS NOT PLACED. This is the one the
 *      previous implementation got wrong: it swept every unclassified student
 *      into Tier 1, so a brand-new student with four answered questions was
 *      reported to the teacher as "on track". They are not on track. They are
 *      unknown, and that is a different thing to tell a teacher.
 *
 * The tiers themselves are kept because MTSS tiers are a real concept teachers
 * and campuses already use — they describe INTENSITY OF SUPPORT, not level of
 * ability. What changed is where they come from: they used to be computed by a
 * separate module with its own thresholds, which is how a student could be
 * "Tier 1" on this screen and "Below Level" on the roster in the same minute.
 */

export const GROUP = Object.freeze({
  BASELINE: 'establishingBaseline',
  CORE: 'core',
  TARGETED: 'targeted',
  INTENSIVE: 'intensive',
  EXTENSION: 'extension',
});

export const GROUP_LABEL = Object.freeze({
  [GROUP.BASELINE]: 'Establishing baseline',
  [GROUP.CORE]: 'Core instruction',
  [GROUP.TARGETED]: 'Targeted support',
  [GROUP.INTENSIVE]: 'Intensive support',
  [GROUP.EXTENSION]: 'Extension',
});

/** What each group means, in the words a teacher would use to explain it. */
export const GROUP_PURPOSE = Object.freeze({
  [GROUP.BASELINE]: 'Not enough completed work yet to say anything about these students’ mathematics. The first move is engagement, not placement.',
  [GROUP.CORE]: 'Grade-level instruction is landing. These students need the lesson, not an intervention.',
  [GROUP.TARGETED]: 'Something specific is in the way — a kind of thinking, a slipping skill, a band that will not hold. Short, named follow-up.',
  [GROUP.INTENSIVE]: 'Prerequisite gaps are blocking access to the course itself. More grade-level practice will not reach this.',
  [GROUP.EXTENSION]: 'Working above the course expectation with reasoning evidence behind it. Depth, not acceleration past their peers.',
});

export const GROUP_ORDER = Object.freeze([
  GROUP.INTENSIVE, GROUP.TARGETED, GROUP.CORE, GROUP.EXTENSION, GROUP.BASELINE,
]);

/**
 * Where one student sits today, and why.
 *
 * Returns `{ group, reason, findings }`. The reason is the sentence the teacher
 * reads; the findings are the same academic findings the Needs Attention queue
 * uses, so the two screens can never disagree about a student.
 */
export const groupForStudent = ({ studentId, studentName, profile, classId = null }) => {
  if (!profile?.baseline?.established) {
    const events = profile?.baseline?.events || 0;
    const needed = profile?.baseline?.requirement?.events || 12;
    return {
      studentId,
      studentName,
      classId,
      group: GROUP.BASELINE,
      reason: `${events} of ${needed} pieces of classifying evidence so far. Not placed — MathMaster does not group a student it cannot yet describe.`,
      findings: [],
    };
  }

  const findings = academicFindingsFor({ studentId, studentName, profile, classId });
  const has = (rule) => findings.some((finding) => finding.rule === rule);

  if (has('foundationGap')) {
    return {
      studentId,
      studentName,
      classId,
      group: GROUP.INTENSIVE,
      reason: `Confirmed gaps ${profile.foundationGapDepth} levels below this course. Foundation Bridge work is already in their weekly path.`,
      findings,
    };
  }

  if (findings.length) {
    return {
      studentId,
      studentName,
      classId,
      group: GROUP.TARGETED,
      // The specific reason, not "struggling". A reasoning gap and a slipping
      // retention need different lessons.
      reason: findings.map((finding) => finding.headline).join(' · '),
      findings,
    };
  }

  if (profile.instructionalBand === INSTRUCTIONAL_BAND.ABOVE) {
    return {
      studentId,
      studentName,
      classId,
      group: GROUP.EXTENSION,
      reason: 'Holding above the independent course band with reasoning evidence behind it.',
      findings,
    };
  }

  return {
    studentId,
    studentName,
    classId,
    group: GROUP.CORE,
    reason: 'Grade-level work is holding. Nothing specific is in the way.',
    findings,
  };
};

/**
 * The whole class, grouped.
 *
 * Every group is returned even when empty, because "nobody needs intensive
 * support this week" is information a teacher wants, and a group that silently
 * disappears reads as a group that was never checked.
 */
export const buildInstructionalGroups = ({
  students = [], profilesByStudentId = {},
} = {}) => {
  const placements = (Array.isArray(students) ? students : []).map((student) => groupForStudent({
    studentId: student.id,
    studentName: student.displayName || student.name || String(student.id),
    profile: profilesByStudentId[student.id] || null,
    classId: student.classId || null,
  }));

  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABEL[group],
    purpose: GROUP_PURPOSE[group],
    students: placements
      .filter((placement) => placement.group === group)
      .sort((a, b) => String(a.studentName).localeCompare(String(b.studentName))),
  }));
};

export default buildInstructionalGroups;
