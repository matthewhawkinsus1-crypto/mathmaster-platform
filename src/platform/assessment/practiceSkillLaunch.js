import { toDisplayCode } from '../../utils/teksUtils.js';

/*
 * WHERE "PRACTISE THIS SKILL" GOES, FROM A RELEASED TEST REVIEW OR THE TEST
 * CYCLE CARD.
 *
 * The results screens name a destination — `{ alignmentKey, framework,
 * domainId }` — and App turns it into the same My Math Path launch a
 * recommended-skill card uses (a TEKS code to practise), or, for a practice
 * test's exam domain that has no course standard, the CCMR tab where that
 * exam's practice lives.
 *
 * Returns null when there is nowhere to send the student, so the caller can
 * leave them where they are rather than open an empty Path.
 */
export const practiceSkillLaunch = ({ alignmentKey = null, framework = null } = {}) => {
  // A practice test's skill is practised in that exam's own format, which
  // lives on the CCMR tab — not as ordinary course practice on one standard,
  // even when the domain also names one.
  if (framework) return { teksCode: null, tab: 'ccmr' };
  // A course standard (`texas:A.5A`) becomes its TEKS code; anything still
  // namespaced after that is not a TEKS standard.
  const teksCode = alignmentKey ? String(toDisplayCode(alignmentKey) || '').trim() : '';
  if (teksCode && !teksCode.includes(':')) return { teksCode, tab: null };
  return null;
};

export default practiceSkillLaunch;
