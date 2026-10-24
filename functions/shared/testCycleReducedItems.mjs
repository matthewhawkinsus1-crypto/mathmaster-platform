/*
 * FEWER QUESTIONS ON A SECURE TEST: THE TEACHER CHOOSES, THE SERVER APPLIES (TC15).
 *
 * The accommodation `reduced-item-count-same-rigor` ("Reduced number of items
 * — same TEKS and rigor") reshapes ordinary work by itself
 * (reducedWorkload.mjs). A secure Test Cycle is never reshaped that way: every
 * student sits an EQUIVALENT Test built from one approved blueprint
 * (testCycleBlueprint.mjs), and an automatic plan would hand one student a
 * test the blueprint never approved. So on a secure Test MathMaster decides
 * nothing. The student's own teacher chooses, and the server applies exactly
 * that choice:
 *
 *   WHO          a student whose support plan lists the accommodation, set by
 *                the teacher who may manage the assignment.
 *   WHAT         which of the Test's questions (blueprint slots) the student
 *                does not answer. Kept on that student's own server-only Test
 *                Cycle record (`record.reducedItems`) with who set it and when
 *                — never on the shared assignment every student can read.
 *   THEIR TEST   the plan they would have had, minus the excused slots. Every
 *                other question keeps its family and its seed, so nothing else
 *                about their Test moves, and nobody else's Test changes at all.
 *   THEIR GRADE  over the questions they were asked, weighted as for everyone
 *                (secureExam.js scores the session's plan entries). An excused
 *                question is not missing and never a zero.
 *   RETEST       built from the questions they were asked, shorter by the same
 *                share as their Test. A Retest that replaces a missed Test is
 *                the whole Test minus the same excused questions.
 *   CORRECTIONS  built from answered work, as always: nothing excused is
 *                ever "missed", so nothing excused is ever corrected.
 *   WHEN         before the student starts. Once their Test (or a Retest
 *                standing in for it) has started, the choice is locked.
 *
 * SAME TEKS, SAME RIGOR — THE LIMITS. Every skill on the Test (blueprint
 * target) keeps at least one question, so nothing the Test assesses goes
 * unasked; the questions that remain are the blueprint's own slots, so rigor
 * is untouched; and at most half the Test can be excused, the same ceiling the
 * automatic accommodation has (ITEM_REDUCTION_LIMITS.maxPercent).
 *
 * Pure: no Firestore, no network, no clock. The browser imports it too, so the
 * teacher's form and the server refuse the same choices in the same words.
 */

import { expandBlueprintSlots, normalizeTestBlueprint } from './testCycleBlueprint.mjs';
import { resolveRetestQuestionCount } from './testCycleRetest.mjs';
import { ITEM_REDUCTION_LIMITS, resolveItemReductionPolicy } from './reducedWorkload.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const wholeCount = (value) => Math.max(0, Math.round(Number(value) || 0));

/** At most this share of a Test's questions can be excused for one student. */
export const REDUCED_ITEMS_MAX_PERCENT = ITEM_REDUCTION_LIMITS.maxPercent;

// A blueprint holds at most 60 questions per target; this bounds what a record
// or a request can carry, whatever a client sends.
const MAX_EXCUSED_IDS = 200;

const uniqueIds = (values) => [...new Set(list(values).map((value) => clean(value).slice(0, 160)).filter(Boolean))]
  .slice(0, MAX_EXCUSED_IDS);

/**
 * `record.reducedItems`, normalized. Null when nothing is excused, so a record
 * a teacher never touched keeps exactly the shape it always had.
 *
 *   excusedSlotIds   the blueprint slots this student does not answer
 *   questions        how many they answer
 *   testQuestions    how many the Test has
 *   blueprintId/Version  the blueprint those slot ids belong to
 *   setBy / setAt    who chose, and when
 */
export const normalizeReducedItems = (raw) => {
  if (!isObject(raw)) return null;
  const excusedSlotIds = uniqueIds(raw.excusedSlotIds);
  if (!excusedSlotIds.length) return null;
  return {
    excusedSlotIds,
    questions: wholeCount(raw.questions),
    testQuestions: wholeCount(raw.testQuestions),
    blueprintId: clean(raw.blueprintId).slice(0, 180) || null,
    blueprintVersion: Math.max(1, Math.round(Number(raw.blueprintVersion) || 1)),
    setBy: clean(raw.setBy).slice(0, 160) || null,
    setAt: optionalNumber(raw.setAt),
  };
};

/** The excused slot ids a record carries (an empty list when none). */
export const excusedSlotIdsOf = (record) => normalizeReducedItems(record?.reducedItems)?.excusedSlotIds || [];

/**
 * The Test's questions as a teacher chooses among them: the number every
 * student meets it at, its skill, its depth. Nothing that reproduces an item
 * (no family, no seed) and nothing a teacher cannot already read in preflight.
 */
export const testCycleQuestionList = (blueprint) => expandBlueprintSlots(blueprint).map((slot) => ({
  slotId: slot.slotId,
  number: slot.ordinal,
  targetId: slot.targetId,
  label: slot.label,
  alignmentKey: slot.alignmentKey || null,
  dok: slot.dok,
  anchor: slot.anchor === true,
}));

/**
 * Is this choice allowed on this Test? `questions` is `testCycleQuestionList`.
 *
 * Returns the choice in Test order, how many questions remain, and the reasons
 * it is refused (teacher-facing sentences). Excusing nothing is always allowed:
 * it is how the whole Test is given back.
 */
export const validateExcusedQuestions = ({ questions = [], excusedSlotIds = [] } = {}) => {
  const all = list(questions).filter((question) => clean(question?.slotId));
  const requested = new Set(uniqueIds(excusedSlotIds));
  const known = new Set(all.map((question) => clean(question.slotId)));
  const errors = [];
  if ([...requested].some((slotId) => !known.has(slotId))) {
    errors.push('Some of the chosen questions are not on this Test any more. Reload and choose again.');
  }
  const excused = all.filter((question) => requested.has(clean(question.slotId)));

  // Every skill keeps at least one question: the same TEKS, asked.
  const bySkill = new Map();
  all.forEach((question) => {
    const entry = bySkill.get(question.targetId) || { label: clean(question.label) || clean(question.alignmentKey) || question.targetId, total: 0, excused: 0 };
    entry.total += 1;
    if (requested.has(clean(question.slotId))) entry.excused += 1;
    bySkill.set(question.targetId, entry);
  });
  const emptied = [...bySkill.values()].filter((entry) => entry.total > 0 && entry.excused >= entry.total);
  if (emptied.length) {
    errors.push(`Keep at least one question on each skill: ${emptied.map((entry) => entry.label).join(', ')}.`);
  }

  const maxExcused = Math.floor((all.length * REDUCED_ITEMS_MAX_PERCENT) / 100);
  if (excused.length > maxExcused) {
    errors.push(`At most ${maxExcused} of the ${all.length} questions can be skipped (half the Test).`);
  }
  return {
    ok: errors.length === 0,
    errors,
    excusedSlotIds: excused.map((question) => clean(question.slotId)),
    excusedNumbers: excused.map((question) => question.number),
    questions: all.length - excused.length,
    testQuestions: all.length,
    maxExcused,
  };
};

/*
 * THE CHOICE THAT APPLIES TO THIS TEST — OR NONE.
 *
 * A teacher can still replace a cycle's Test before any session exists
 * (attachTestCycleContract). A choice made for the earlier Test names slots of
 * a blueprint that is no longer the one issued, and could leave a skill with
 * no question at all. Such a choice is not applied: the student gets the whole
 * published Test (never less than it), and the teacher's row asks them to
 * choose again (`stale`). Every planner reads the excused slots through here.
 */
export const reducedItemsState = (record, blueprint) => {
  const chosen = normalizeReducedItems(record?.reducedItems);
  if (!chosen) return { excusedSlotIds: [], stale: false };
  const normalized = normalizeTestBlueprint(blueprint);
  const sameBlueprint = (!chosen.blueprintId || chosen.blueprintId === normalized.blueprintId)
    && chosen.blueprintVersion === normalized.version;
  const choice = validateExcusedQuestions({ questions: testCycleQuestionList(normalized), excusedSlotIds: chosen.excusedSlotIds });
  const applies = sameBlueprint && choice.ok && choice.excusedSlotIds.length === chosen.excusedSlotIds.length;
  return applies ? { excusedSlotIds: choice.excusedSlotIds, stale: false } : { excusedSlotIds: [], stale: true };
};

/** The excused slots that apply to this blueprint (an empty list when none, or stale). */
export const applicableExcusedSlotIds = (record, blueprint) => reducedItemsState(record, blueprint).excusedSlotIds;

/*
 * LOCKED ONCE THE STUDENT HAS STARTED.
 *
 * A Test the student has opened has shown them its questions in its order;
 * changing which ones count after that would change a Test already under way.
 * The record says when a session moved on (these are testCycleRecord.mjs's
 * SESSION_STATE values: that module imports this one, so it cannot be imported
 * back), and inside the transaction the session itself says so before the
 * record has caught up ("not_started" is a secure session's only unstarted
 * status). A Retest opened in place of a missed Test is the same Test for this
 * purpose. A teacher's reset gives the student a new, unstarted attempt.
 */
const STARTED_RECORD_STATES = new Set(['inProgress', 'submitted', 'released']);
const sessionStarted = (status) => status !== null && status !== undefined && clean(status) !== 'not_started';

// `noun` names the record's `test` session: "Retest" on an external-original
// cycle, whose one secure session is the retest.
export const reducedItemsLock = ({ record = null, testSessionStatus = null, retestSessionStatus = null, noun = 'Test' } = {}) => {
  if (STARTED_RECORD_STATES.has(clean(record?.test?.state)) || sessionStarted(testSessionStatus)) {
    return { locked: true, reason: `Locked: this student has started their ${clean(noun) || 'Test'}, so its questions cannot change now.` };
  }
  if (STARTED_RECORD_STATES.has(clean(record?.retest?.state)) || sessionStarted(retestSessionStatus)) {
    return { locked: true, reason: 'Locked: this student has started their Retest, so its questions cannot change now.' };
  }
  return { locked: false, reason: null };
};

/**
 * The plan this student is issued: the plan they would have had, minus the
 * excused slots. The remaining entries are untouched (family, seed, weight,
 * slot id), renumbered so their question numbers run 1..n. With nothing
 * excused the plan comes back as it was — the same object.
 */
export const applyExcusedQuestionsToPlan = (plan, excusedSlotIds = []) => {
  const excused = new Set(uniqueIds(excusedSlotIds));
  if (!isObject(plan) || !excused.size) return plan;
  const allEntries = list(plan.entries);
  const entries = allEntries
    .filter((entry) => !excused.has(clean(entry?.slotId)))
    .map((entry, index) => ({ ...entry, ordinal: index + 1 }));
  return {
    ...plan,
    entries,
    totalQuestions: entries.length,
    // An excused slot is never issued, so it never needs a family.
    unfilledSlots: list(plan.unfilledSlots).filter((slot) => !excused.has(clean(slot?.slotId))),
    // Kept on the stored plan so an auditor can see what was left out, and why
    // the plan is shorter than the blueprint. Never sent to a browser
    // (secureExam.publicSession strips the whole plan).
    excusedSlotIds: allEntries.map((entry) => clean(entry?.slotId)).filter((slotId) => excused.has(slotId)),
  };
};

/**
 * The Test as THIS student sits it, skill by skill: each target's question
 * count less what was excused. What their card counts ("20 questions"), what
 * their evidence is read against, and what their Retest is derived from.
 * Issuance never uses it — slot ids would renumber — it filters the plan.
 */
export const studentTestBlueprint = (blueprint, excusedSlotIds = []) => {
  const normalized = normalizeTestBlueprint(blueprint);
  const excused = new Set(uniqueIds(excusedSlotIds));
  if (!excused.size) return normalized;
  const excusedByTarget = new Map();
  expandBlueprintSlots(normalized).forEach((slot) => {
    if (excused.has(slot.slotId)) excusedByTarget.set(slot.targetId, (excusedByTarget.get(slot.targetId) || 0) + 1);
  });
  if (!excusedByTarget.size) return normalized;
  return normalizeTestBlueprint({
    ...normalized,
    targets: normalized.targets.map((target) => ({
      ...target,
      questionCount: Math.max(0, target.questionCount - (excusedByTarget.get(target.targetId) || 0)),
    })),
  });
};

/**
 * How long this student's targeted Retest is: the class's Retest length,
 * shorter by the same share as their Test (25 of 25 asked → the class's
 * length; 20 of 25 → four fifths of it), at least one question. Null when
 * nothing was excused: the class's own rule applies unchanged.
 */
export const studentRetestQuestionCount = ({ blueprint = null, excusedSlotIds = [], policy = null } = {}) => {
  const testQuestions = normalizeTestBlueprint(blueprint).totalQuestions;
  const own = studentTestBlueprint(blueprint, excusedSlotIds).totalQuestions;
  if (!testQuestions || own >= testQuestions) return null;
  const classCount = resolveRetestQuestionCount({ originalTotal: testQuestions, policy });
  if (!classCount) return null;
  return Math.max(1, Math.round((classCount * own) / testQuestions));
};

/**
 * Does this student's support plan list fewer items for this assignment? The
 * revision that governs it (by its due date, as every other reader of the plan
 * decides), whether the plan gives a percentage or only records the support.
 */
export const planFewerItems = ({ profile = null, assignment = null, nowValue = Date.now() } = {}) => {
  const policy = resolveItemReductionPolicy({ profile, assignment, nowValue });
  return {
    listed: policy.status === 'automatic' || policy.status === 'manual',
    // The plan's own percentage when it gives one: a guide for the teacher,
    // never applied to a secure Test by itself.
    percent: policy.status === 'automatic' ? policy.percent : null,
  };
};

/** The record field as the server writes it. */
export const reducedItemsForRecord = ({ choice, blueprint, by = null, at = null }) => (
  choice?.excusedSlotIds?.length
    ? normalizeReducedItems({
      excusedSlotIds: choice.excusedSlotIds,
      questions: choice.questions,
      testQuestions: choice.testQuestions,
      blueprintId: normalizeTestBlueprint(blueprint).blueprintId,
      blueprintVersion: normalizeTestBlueprint(blueprint).version,
      setBy: by,
      setAt: at,
    })
    : null
);

const joinNumbers = (numbers) => {
  const values = list(numbers).map(String);
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
};

/** One teacher-facing line for the audit row and the panel. */
export const describeReducedItemsChoice = (choice) => (
  choice?.excusedSlotIds?.length
    ? `Fewer questions: answers ${choice.questions} of ${choice.testQuestions} (skips question${choice.excusedNumbers.length === 1 ? '' : 's'} ${joinNumbers(choice.excusedNumbers)}).`
    : `Fewer questions removed: answers all ${choice?.testQuestions ?? 0} questions.`
);
