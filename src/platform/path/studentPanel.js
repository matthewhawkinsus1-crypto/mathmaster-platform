// What a student actually sees, curated down from the engine's full output.
//
// The engine returns every skill in nine buckets — roughly fifty rows for
// Algebra I. Showing that to a student is decision overload and would make the
// adaptive system feel like a menu. Showing exactly one would make it feel like
// a rail. The brief's answer is four slots, and this file is the only place
// that reduction happens, so no screen re-implements ranking.
//
//   Best Next Step — the single strongest current recommendation
//   Strengthen     — the most valuable repair, if there is one
//   Your Choice    — a few other genuinely valid options
//   Challenge      — slightly-ahead content, only when earned
//
// Required work is not one of the four: it sits above them and suspends free
// choice until it is done (§16), so it is returned separately.

import { STATUS, explainForStudent } from './recommendationEngine.js';
import { describeSkill } from './skillGraph.js';

// More than this in "Your Choice" and the panel stops being a curation.
export const MAX_CHOICES = 3;

const toCard = (row, slot) => (row ? {
  slot,
  skillId: row.skillId,
  title: describeSkill(row.skillId).shortLabel,
  description: describeSkill(row.skillId).label.split(' — ').slice(1).join(' — '),
  reason: explainForStudent(row),
  status: row.status,
  mastery: row.mastery,
  score: row.score,
  pacingIsProvisional: row.pacingIsProvisional,
  calendarTiming: row.calendarTiming || null,
  calendarDaysUntilStart: row.calendarDaysUntilStart ?? 0,
  remediationTarget: row.remediationTarget || null,
} : null);

// A Strengthen card that points at the PREREQUISITE, not at the skill it is
// blocking: the student cannot work on the blocked skill yet, so offering it
// would be an invitation to fail.
const repairCard = (blockedRow) => {
  const target = blockedRow?.remediationTarget;
  if (!target) return null;
  const described = describeSkill(target);
  return {
    slot: 'strengthen',
    skillId: target,
    title: described.shortLabel || target,
    description: described.label.split(' — ').slice(1).join(' — ') || described.label,
    reason: 'Strengthening this will unlock what comes next.',
    status: STATUS.REMEDIATION,
    mastery: null,
    score: blockedRow.score,
    pacingIsProvisional: Boolean(blockedRow.pacingIsProvisional),
    remediationTarget: target,
    blocks: blockedRow.skillId,
  };
};

/**
 * Reduce the engine's output to the student panel.
 *
 * `options` is exactly what getStudentPathOptions returned — this never
 * re-ranks, it only selects, so the order a student sees is the order the
 * engine decided.
 */
export const curateStudentPanel = (options) => {
  const safe = options && typeof options === 'object' ? options : {};
  const list = (key) => (Array.isArray(safe[key]) ? safe[key] : []);

  const required = list('required').map((row) => toCard(row, 'required'));
  const remediation = list('remediation');
  const recommended = list('recommended');
  const priority = list('priority');
  const available = list('available');
  const extension = list('extension');

  // Priority outranks a plain recommendation for the top slot: a skill the
  // teacher flagged, or one the student has been steering around, is the more
  // useful "do this next" than a merely well-scored option.
  const bestPool = [...priority, ...recommended];

  // The repair that matters most. Ranked by the engine, so this is the
  // prerequisite gap standing in front of the most valuable skill.
  //
  // A SEVERE gap is the case that matters here. Those skills land in `locked`
  // rather than `remediation`, and locked is not shown to students — so a
  // student with the worst gap in the class would otherwise see no Strengthen
  // card at all, which is exactly backwards. Fall back to the prerequisite
  // that locked the highest-ranked skill and offer to repair that instead.
  const lockedWithTarget = list('locked').filter((row) => row.remediationTarget);
  const strengthen = remediation.length
    ? toCard(remediation[0], 'strengthen')
    : lockedWithTarget.length
      ? repairCard(lockedWithTarget[0])
      : null;

  // A skill can legitimately be both the strongest current option and the one
  // needing repair — a student weak at the very thing their class is on. Shown
  // twice it reads as a bug, so Strengthen wins (it is the more honest framing)
  // and Best Next Step moves to the next candidate.
  const best = toCard(bestPool.find((row) => row.skillId !== strengthen?.skillId) || null, 'best');

  const taken = new Set([best?.skillId, strengthen?.skillId].filter(Boolean));
  const choices = [...bestPool, ...available]
    .filter((row) => !taken.has(row.skillId))
    .slice(0, MAX_CHOICES)
    .map((row) => toCard(row, 'choice'));

  // Challenge is offered only when the engine earned it — never as filler.
  const challenge = toCard(extension[0] || null, 'challenge');

  return {
    required,
    best,
    strengthen,
    choices,
    challenge,
    confidence: safe.confidence || { level: 'low', message: '' },
    // The count behind "See all available skills", so the link can be honest
    // about how much more there is rather than implying the panel is all of it.
    moreCount: Math.max(0, (bestPool.length + available.length) - 1 - choices.length),
    // Any provisional pacing anywhere in what the student is being shown.
    pacingIsProvisional: [best, strengthen, challenge, ...choices]
      .filter(Boolean)
      .some((card) => card.pacingIsProvisional),
    isEmpty: !required.length && !best && !strengthen && !choices.length && !challenge,
  };
};

/**
 * Free choice is suspended while required work is outstanding (§16). The
 * interface has to say why, so the reason travels with the flag.
 */
export const resolveChoiceState = (panel) => {
  if (panel?.required?.length) {
    return {
      choiceAllowed: false,
      reason: 'Finish the work your teacher assigned before choosing another path.',
    };
  }
  return { choiceAllowed: true, reason: '' };
};

export const SLOT_LABELS = Object.freeze({
  required: 'Assigned by your teacher',
  best: 'Best next step',
  strengthen: 'Strengthen',
  choice: 'Your choice',
  challenge: 'Challenge',
});

export const isRemediationCard = (card) => card?.status === STATUS.REMEDIATION;
