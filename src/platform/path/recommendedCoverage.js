// "Recommended for you" offers only skills a student can actually practise.
//
// Home's panel used to offer every skill the engine ranked, so a skill the
// secure bank cannot yet issue a question for ("Equations of perpendicular
// lines") was a YOUR CHOICE card while the Path map said COMING SOON, and
// choosing it ended in a coverage error (release-candidate QA m10). The map
// and the launcher read the coverage index (functions/shared/pathCoverage.mjs);
// the panel now reads it too, before it picks its cards.
//
// Teacher-assigned (required) skills are left as they are: they are the
// teacher's contract and the Path explains them. A repair card is offered only
// when the skill it repairs can be practised. No index (never built, or the
// read failed) fails closed: nothing optional is offered.

import { isSkillLaunchable } from '../../../functions/shared/pathCoverage.mjs';
import { teksCodeFromSkillId } from './skillGraph.js';

const OPTIONAL_BUCKETS = ['remediation', 'recommended', 'priority', 'available', 'extension'];

/** True when the coverage index says a student can be issued this skill. */
export const skillIsPractisable = (coverage, skillId) => Boolean(coverage) && isSkillLaunchable(coverage, teksCodeFromSkillId(skillId));

/** The engine's options with every optional skill nobody can practise yet removed. */
export const practisableOptions = (options, coverage) => {
  if (!options || typeof options !== 'object') return options;
  const keep = (row) => skillIsPractisable(coverage, row?.skillId);
  const next = { ...options };
  OPTIONAL_BUCKETS.forEach((key) => {
    if (Array.isArray(options[key])) next[key] = options[key].filter(keep);
  });
  // A locked skill's repair card points at its prerequisite; offer it only
  // when that prerequisite can be practised.
  if (Array.isArray(options.locked)) {
    next.locked = options.locked.map((row) => (row?.remediationTarget && !skillIsPractisable(coverage, row.remediationTarget)
      ? { ...row, remediationTarget: null }
      : row));
  }
  return next;
};
