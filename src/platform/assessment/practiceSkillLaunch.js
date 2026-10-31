import { toDisplayCode } from '../../utils/teksUtils.js';

/*
 * WHERE "PRACTISE THIS SKILL" GOES, FROM A RELEASED TEST REVIEW OR THE TEST
 * CYCLE CARD.
 *
 * The results screens name a destination — `{ alignmentKey, framework,
 * domainId }` — and App turns it into the same My Math Path launch a
 * recommended-skill card uses (a TEKS code to practise), or, for a practice
 * test's exam domain, that exam's practice on the CCMR tab.
 *
 * A practice test's destination starts that exam's practice on the standard
 * the student missed in the domain (MP14: `framework` goes to My Math Path as
 * its launch framework, never dropped). With no course standard to start on,
 * or when the exam has no practice published for it (My Math Path says so and
 * starts nothing), the student is on the CCMR tab, where that exam's practice
 * lives. It is never ordinary course practice.
 *
 * Returns null when there is nowhere to send the student, so the caller can
 * leave them where they are rather than open an empty Path.
 */
export const practiceSkillLaunch = ({ alignmentKey = null, framework = null } = {}) => {
  // A course standard (`texas:A.5A`) becomes its TEKS code; anything still
  // namespaced after that is not a TEKS standard.
  const code = alignmentKey ? String(toDisplayCode(alignmentKey) || '').trim() : '';
  const teksCode = code && !code.includes(':') ? code : null;
  // A practice test's skill is practised in that exam's own format: that
  // exam's practice on the missed standard, opened from the CCMR tab — never
  // ordinary course practice, even though the domain names a standard.
  if (framework) return { teksCode, framework, tab: 'ccmr' };
  if (teksCode) return { teksCode, framework: null, tab: null };
  return null;
};

export default practiceSkillLaunch;
