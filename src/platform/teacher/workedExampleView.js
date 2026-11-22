/*
 * THE TEACHER'S VIEW OF WORKED EXAMPLES (docs/platform/WORKED_EXAMPLES.md,
 * section 9, slice G).
 *
 * Per skill: which students opened a worked example, and how their next
 * question on that skill was then marked. Shown in the teacher's results,
 * beside the "worth a conversation" signals.
 *
 * WHAT IT READS. Only what each answer already recorded with it:
 *   - `supportUsage.workedExampleUsed`: the student asked for the example, or
 *     opened it again;
 *   - `supportUsage.workedExampleShown === 'auto'`: Classwork opened it by
 *     itself before the first question on a new skill (nobody asked);
 *   - the question's status and its count of tries.
 * The skill is the one the example player and the coverage report use
 * (workedExample/exampleSkill.js): the question's family, or its kind with its
 * primary standard. A question with neither can still have an example opened
 * on it (the player finds a family for it by its type), so it is listed on its
 * own, as a question with no skill named: an example opened is never left out.
 *
 * WHAT IT IS NOT. Counts of records, side by side. Opening an example changes
 * no score, and nothing here says an example caused what followed: the record
 * holds no time for when an example was opened, only that it was. Nothing here
 * is written, and no grade, attempt or mastery path reads this module.
 *
 * "THE NEXT QUESTION" is the next question on the same skill later in the
 * assignment's own order, in any section (so a DOL question on the skill
 * counts). When the record shows it was last answered before the question the
 * example was opened on, it is reported as answered earlier, and is not
 * counted as what happened next.
 *
 * Pure: no Firestore, no React.
 */
import { exampleSkillOf, exampleKindOf, primaryStandardOf } from '../supports/workedExample/exampleSkill.js';
import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';
import { resolveQuestionActivityRole } from '../policies/activityPolicies.js';
import { DETAIL_FIELDS, isSplitSummary } from '../../../functions/shared/gradeEntryStorage.mjs';

export const WORKED_EXAMPLES_TITLE = 'Worked examples, by skill';
export const WORKED_EXAMPLES_NOTE = 'Which students opened a worked example, and how their next question on the same skill was marked. Opening an example changes no score. These are counts of what was recorded: they do not say the example is why a question went right or wrong.';
export const WORKED_EXAMPLES_NONE = 'No worked example was opened on this assignment.';
export const WORKED_EXAMPLES_LIMITATIONS = Object.freeze([
  '"The next question" is the next one on the same skill in the assignment\'s order. The record does not hold when an example was opened, so a student who worked the questions out of order may have opened it after answering the next one; where the times recorded show that, it is marked "answered earlier".',
  'An example opened on an answer that was later replaced (a new version of the question, a reset) is on the record only if the latest answer carries it.',
  'Examples appear on Classwork and Practice only. A DOL, Quiz or Test question never has one, but can be the next question on a skill.',
]);

export const EXAMPLE_HOW = Object.freeze({ ASKED: 'asked', SHOWN: 'shown', BOTH: 'both' });
export const EXAMPLE_HOW_LABEL = Object.freeze({
  [EXAMPLE_HOW.ASKED]: 'Asked for it',
  [EXAMPLE_HOW.SHOWN]: 'Shown by Classwork (not asked for)',
  [EXAMPLE_HOW.BOTH]: 'Shown by Classwork, then opened again',
});

export const EXAMPLE_OUTCOME = Object.freeze({
  RIGHT_FIRST: 'rightFirstTry',
  RIGHT_LATER: 'rightAfterRetry',
  NOT_RIGHT: 'notRight',
  NOT_ANSWERED: 'notAnswered',
});
export const EXAMPLE_OUTCOME_LABEL = Object.freeze({
  [EXAMPLE_OUTCOME.RIGHT_FIRST]: 'Right on the first try',
  [EXAMPLE_OUTCOME.RIGHT_LATER]: 'Right after another try',
  [EXAMPLE_OUTCOME.NOT_RIGHT]: 'Not right',
  [EXAMPLE_OUTCOME.NOT_ANSWERED]: 'Not answered',
});
// What followed, where there is something to say about it.
export const EXAMPLE_NEXT = Object.freeze({ ...EXAMPLE_OUTCOME, NONE: 'noNextQuestion', EARLIER: 'answeredEarlier' });
export const EXAMPLE_NEXT_LABEL = Object.freeze({
  ...EXAMPLE_OUTCOME_LABEL,
  [EXAMPLE_NEXT.NONE]: 'No later question on this skill',
  [EXAMPLE_NEXT.EARLIER]: 'Answered earlier (before the question the example was opened on)',
});

const ROLE_LABEL = Object.freeze({
  warmup: 'Warm-Up', classwork: 'Classwork', practice: 'Practice', dol: 'DOL', quiz: 'Quiz', test: 'Test', review: 'Review', corrections: 'Corrections',
});

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const millis = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

// A family id or a student action, in words: "factoring-trinomials" -> "Factoring trinomials".
const words = (value) => {
  const spaced = clean(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : '';
};

/** A skill's name for a teacher: the family in words, or the standard with the kind of question. */
export const exampleSkillLabel = (question) => {
  const family = clean(question?.familyId);
  if (family) return words(family);
  const kind = words(exampleKindOf(question));
  const standard = primaryStandardOf(question);
  return standard ? `${standard}: ${kind || 'question'}` : kind;
};

/** How an example reached this answer, or null when none did. */
export const exampleOpenedOn = (record) => {
  const usage = record?.supportUsage;
  const asked = usage?.workedExampleUsed === true;
  const shown = usage?.workedExampleShown === 'auto';
  if (asked && shown) return EXAMPLE_HOW.BOTH;
  if (asked) return EXAMPLE_HOW.ASKED;
  return shown ? EXAMPLE_HOW.SHOWN : null;
};

/** How a question's record was marked: counts of tries and its status, nothing else. */
export const exampleOutcomeOf = (record) => {
  const status = clean(typeof record === 'string' ? record : record?.status);
  const tries = Math.max(Number(record?.totalAttempts) || 0, Number(record?.attemptCount) || 0);
  if (status === 'correct') return tries <= 1 ? EXAMPLE_OUTCOME.RIGHT_FIRST : EXAMPLE_OUTCOME.RIGHT_LATER;
  if (['attempted', 'incorrect', 'expired'].includes(status) || tries > 0) return EXAMPLE_OUTCOME.NOT_RIGHT;
  return EXAMPLE_OUTCOME.NOT_ANSWERED;
};

// A record whose support flags are stored apart and have not arrived: what
// was opened on it cannot be known yet (functions/shared/gradeEntryStorage.mjs).
const detailMissing = (record) => isSplitSummary(record)
  && !DETAIL_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(record, field));

/**
 * @param assignment the stored assignment (its questions, in order).
 * @param students   `[{ id, name, tracker }]`: each student's records for this
 *                   assignment, by question position, joined to their detail.
 * @param questions  the assignment's questions, when the caller already has them.
 */
export const buildWorkedExampleView = ({ assignment = null, students = [], questions = null } = {}) => {
  const stored = list(questions || getStoredAssignmentQuestions(assignment || {}));
  // Each question that teaches or tests a skill, in the assignment's order.
  const placed = stored
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question && question.teacherExcluded !== true)
    .map(({ question, index }) => {
      const role = clean(resolveQuestionActivityRole({ question, assignment: assignment || {} })).toLowerCase();
      const skill = exampleSkillOf(question);
      // No family and no student action: its own heading, so nothing opened on it is lost.
      return skill
        ? { index, skill, named: true, label: exampleSkillLabel(question), role, roleLabel: ROLE_LABEL[role] || role }
        : { index, skill: `question:${index}`, named: false, label: `Question ${index + 1} (no skill named on this question)`, role, roleLabel: ROLE_LABEL[role] || role };
    });

  const order = [];
  const bySkill = new Map();
  placed.forEach((entry) => {
    if (!bySkill.has(entry.skill)) {
      bySkill.set(entry.skill, { key: entry.skill, named: entry.named, label: entry.label || entry.skill, questions: [], students: [], examples: [] });
      order.push(entry.skill);
    }
    bySkill.get(entry.skill).questions.push({ questionIndex: entry.index, role: entry.role, roleLabel: entry.roleLabel });
  });

  const notLoaded = [];
  list(students).forEach((student) => {
    const id = clean(student?.id);
    if (!id) return;
    const name = clean(student?.name) || 'Name unavailable';
    const tracker = student?.tracker && typeof student.tracker === 'object' ? student.tracker : {};
    if (Object.values(tracker).some(detailMissing)) notLoaded.push({ studentId: id, name });
    order.forEach((skillKey) => {
      const skill = bySkill.get(skillKey);
      const opened = [];
      skill.questions.forEach((place, position) => {
        const record = tracker[place.questionIndex];
        const how = exampleOpenedOn(record);
        if (!how) return;
        const next = skill.questions[position + 1] || null;
        const nextRecord = next ? tracker[next.questionIndex] : null;
        let nextOutcome = next ? exampleOutcomeOf(nextRecord) : EXAMPLE_NEXT.NONE;
        // What was answered before this question is not what happened next.
        const at = millis(record?.lastAttemptAt);
        const nextAt = millis(nextRecord?.lastAttemptAt);
        if (next && nextOutcome !== EXAMPLE_OUTCOME.NOT_ANSWERED && at !== null && nextAt !== null && nextAt < at) nextOutcome = EXAMPLE_NEXT.EARLIER;
        const outcome = exampleOutcomeOf(record);
        opened.push({
          questionIndex: place.questionIndex,
          roleLabel: place.roleLabel,
          how,
          howLabel: EXAMPLE_HOW_LABEL[how],
          outcome,
          outcomeLabel: EXAMPLE_OUTCOME_LABEL[outcome],
          next: {
            questionIndex: next ? next.questionIndex : null,
            roleLabel: next ? next.roleLabel : '',
            outcome: nextOutcome,
            outcomeLabel: EXAMPLE_NEXT_LABEL[nextOutcome],
          },
        });
      });
      if (!opened.length) return;
      skill.students.push({ studentId: id, name, opened });
      skill.examples.push(...opened);
    });
  });

  const skills = order.map((skillKey) => {
    const skill = bySkill.get(skillKey);
    const count = (outcome) => skill.examples.filter((entry) => entry.next.outcome === outcome).length;
    const next = {
      rightFirstTry: count(EXAMPLE_NEXT.RIGHT_FIRST),
      rightAfterRetry: count(EXAMPLE_NEXT.RIGHT_LATER),
      notRight: count(EXAMPLE_NEXT.NOT_RIGHT),
      notAnswered: count(EXAMPLE_NEXT.NOT_ANSWERED),
      answeredEarlier: count(EXAMPLE_NEXT.EARLIER),
      noNextQuestion: count(EXAMPLE_NEXT.NONE),
    };
    const followed = next.rightFirstTry + next.rightAfterRetry + next.notRight;
    const parts = [
      next.rightFirstTry ? `${next.rightFirstTry} right on the first try` : '',
      next.rightAfterRetry ? `${next.rightAfterRetry} right after another try` : '',
      next.notRight ? `${next.notRight} not right` : '',
      next.notAnswered ? `${next.notAnswered} not answered` : '',
      next.answeredEarlier ? `${next.answeredEarlier} answered earlier` : '',
      next.noNextQuestion ? `${next.noNextQuestion} with no later question on the skill` : '',
    ].filter(Boolean);
    const students = [...skill.students].sort((a, b) => a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId));
    return {
      key: skill.key,
      named: skill.named,
      label: skill.label,
      questions: skill.questions,
      questionNumbers: skill.questions.map((place) => place.questionIndex + 1),
      students,
      studentsOpened: students.length,
      examplesOpened: skill.examples.length,
      asked: skill.examples.filter((entry) => entry.how !== EXAMPLE_HOW.SHOWN).length,
      shownOnly: skill.examples.filter((entry) => entry.how === EXAMPLE_HOW.SHOWN).length,
      next,
      nextAnswered: followed,
      // "3 students opened an example (4 times). On the next question on the skill: 2 right on the first try, 1 not right, 1 not answered."
      line: skill.examples.length
        ? `${plural(students.length, 'student')} opened an example (${plural(skill.examples.length, 'time')}). On the next question on the skill: ${parts.join(', ')}.`
        : 'No example opened.',
    };
  });

  const opened = skills.filter((skill) => skill.examplesOpened > 0);
  const namedOpened = opened.filter((skill) => skill.named).length;
  const unnamedOpened = opened.length - namedOpened;
  return {
    title: WORKED_EXAMPLES_TITLE,
    note: WORKED_EXAMPLES_NOTE,
    skills,
    opened,
    // Skills nobody opened an example on: named in one line, not a table each.
    untouched: skills.filter((skill) => skill.examplesOpened === 0 && skill.named).map((skill) => skill.label),
    // "on 2 skills", "on 1 skill and 1 question with no skill named".
    where: [namedOpened ? plural(namedOpened, 'skill') : '', unnamedOpened ? `${plural(unnamedOpened, 'question')} with no skill named` : ''].filter(Boolean).join(' and '),
    studentsOpened: new Set(opened.flatMap((skill) => skill.students.map((student) => student.studentId))).size,
    examplesOpened: opened.reduce((sum, skill) => sum + skill.examplesOpened, 0),
    studentsLooked: list(students).filter((student) => clean(student?.id)).length,
    // Students whose support record has not arrived: not "opened none".
    notLoaded,
    none: opened.length === 0 ? WORKED_EXAMPLES_NONE : '',
    limitations: [...WORKED_EXAMPLES_LIMITATIONS],
  };
};

export default buildWorkedExampleView;
