// "Practice This Skill" on an assignment result practises the SKILL.
//
// The button sits on a closed assignment's result screen. It used to reopen
// the assignment itself in Practice Mode — the same questions, already seen,
// already solved on the Review screen beside it, and practice that went
// nowhere: My Math Path, where practice adapts and counts toward mastery,
// never heard about it. So the button now opens My Math Path on the skill the
// assignment teaches.
//
// WHICH SKILL. "That question's TEKS" is not a usable answer on its own: a
// result route carries the index of the FIRST included question (Grade Center
// and Assignments open it at 0, a closed Classroom link at its first included
// question), and in a MathMaster lesson that is usually a Warm-Up item
// reviewing an earlier skill. Practising the Warm-Up's prerequisite is not
// what a student pressing "Practice This Skill" asked for. So the skill is the
// one the assignment's lesson questions are primarily aligned to most often,
// with the route's own question breaking a tie and then the order the
// questions appear in. Warm-Up questions are consulted only when nothing else
// is aligned to a Path skill.
//
// A question's alignment is read with getPrimaryTeksCodes — the canonical
// reader behind collectAssignmentSkillIds' "framework teks, role primary"
// filter, which also understands the legacy `standard` / `standards.primary`
// shapes stored assignments still carry. Only codes that name a skill in the
// Path's skill graph count: a process standard is a way of working, not a
// destination, and an unknown code has nowhere to go.
//
// WHEN THIS RETURNS NULL the caller keeps the old behaviour, unchanged:
//   - a split Classroom post's section practice ("Practice Warm-Up"), which is
//     practice of that section, not of a skill;
//   - a Test Cycle, whose practice runs through its own stage card;
//   - an assignment with no question aligned to a Path skill.
// Section Recovery for a closed Warm-Up/DOL is a separate control with its own
// handler and never reaches this module.
//
// Whether the Path has published practice for the skill is NOT decided here.
// My Math Path checks its secure coverage before it starts a session and says
// plainly when a skill is not ready — exactly as it does for a skill chosen
// from Recommended for You.
//
// Pure: no Firestore, no React.

import { getPrimaryTeksCodes } from '../contract/alignments.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import { isTestCycleAssignment } from '../assessment/testCycle.js';
import { resolveSkillAnywhere, teksCodeFromSkillId, teksSkillId } from './skillGraph.js';

const WARM_UP_ROLE = 'warmup';

const clean = (value) => String(value ?? '').trim();

/**
 * The Path skill a TEKS code names, or null when the Path has none for it.
 */
export const pathSkillForTeks = (code) => {
  const text = clean(code);
  if (!text) return null;
  const skill = resolveSkillAnywhere(teksSkillId(text));
  const teksCode = skill ? teksCodeFromSkillId(skill.skillId) : null;
  return skill && teksCode ? { skillId: skill.skillId, teksCode } : null;
};

/**
 * The questions a student was actually given, with their section role.
 *
 * A Version 5 assignment goes through the current-content projection, so a
 * question the teacher excluded does not vote and its replacement does. A flat
 * legacy list is read the same way without section structure.
 */
const assignmentEntries = (assignment) => {
  if (Array.isArray(assignment?.sections) && assignment.sections.length) {
    return projectCurrentAssignmentContent(assignment).entries.map((entry) => ({
      question: entry.question,
      storageIndex: entry.storageIndex,
      historicalStorageIndex: entry.historicalStorageIndex,
      role: entry.logicalRole,
    }));
  }
  return (Array.isArray(assignment?.questions) ? assignment.questions : [])
    .map((question, storageIndex) => ({
      question,
      storageIndex,
      historicalStorageIndex: null,
      role: clean(question?.activityRole).toLowerCase() || 'practice',
    }))
    .filter((entry) => entry.question && entry.question.teacherExcluded !== true);
};

// The Path skills one question is primarily aligned to, each counted once.
const questionSkills = (question) => {
  const bySkillId = new Map();
  getPrimaryTeksCodes(question).forEach((code) => {
    const skill = pathSkillForTeks(code);
    if (skill && !bySkillId.has(skill.skillId)) bySkillId.set(skill.skillId, skill);
  });
  return [...bySkillId.values()];
};

// The most common skill in a pool of questions: the route's own question wins
// a tie, then the skill that appears first.
const dominantSkill = (pool, isRequested) => {
  const tally = new Map();
  pool.forEach((entry, order) => {
    questionSkills(entry.question).forEach((skill) => {
      const current = tally.get(skill.skillId) || { ...skill, count: 0, first: order, requested: false };
      current.count += 1;
      if (isRequested(entry)) current.requested = true;
      tally.set(skill.skillId, current);
    });
  });
  const [best] = [...tally.values()].sort((a, b) => (
    b.count - a.count
    || Number(b.requested) - Number(a.requested)
    || a.first - b.first
  ));
  return best ? { skillId: best.skillId, teksCode: best.teksCode } : null;
};

/**
 * Where "Practice This Skill" should take the student, or null to keep the
 * old behaviour (reopen the assignment).
 *
 * `questionIndex` is the result route's stored question index, `sectionKey`
 * the Classroom section the result covers (null or 'whole' for the whole
 * assignment). Returns { skillId, teksCode } for My Math Path.
 */
export const resolveAssignmentPathLaunch = ({ assignment = null, questionIndex = 0, sectionKey = null } = {}) => {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) return null;
  const scope = clean(sectionKey).toLowerCase();
  if (scope && scope !== 'whole') return null;
  if (isTestCycleAssignment(assignment)) return null;

  const entries = assignmentEntries(assignment);
  const requested = Number(questionIndex);
  const isRequested = (entry) => Number.isInteger(requested)
    && (entry.storageIndex === requested || entry.historicalStorageIndex === requested);

  return dominantSkill(entries.filter((entry) => entry.role !== WARM_UP_ROLE), isRequested)
    || dominantSkill(entries.filter((entry) => entry.role === WARM_UP_ROLE), isRequested);
};

export default resolveAssignmentPathLaunch;
