import { SUPPORT_TOOL } from '../language/supportToolsEntitlement.js';

/*
 * READ ALOUD AND TRANSLATE BESIDE A WORKED SOLUTION, FROM AN ENTITLEMENT.
 *
 * SolutionReviewPanel takes `readAloud` and `translation` already decided
 * (SupportedText.jsx). Each caller decides the entitlement for its own page —
 * a Test's results from the student's plan for a test
 * (secureItemAccess.js secureAccessEntitlement), Corrections from the plan
 * for the activity's role — and this turns it into those two props the same
 * way everywhere:
 *
 *   readAloud    { language: 'en' } when Read aloud is entitled AND this
 *                browser can speak, else null
 *   translation  { language } when Translate is entitled with a language,
 *                else null
 *
 * A student entitled to neither sees the solution and nothing else.
 */
export const workedSolutionSupports = (entitlement, { speechReady = false } = {}) => {
  const tools = Array.isArray(entitlement?.tools) ? entitlement.tools : [];
  const language = typeof entitlement?.language === 'string' && entitlement.language.trim() ? entitlement.language.trim() : null;
  return {
    readAloud: speechReady && tools.includes(SUPPORT_TOOL.READ_ALOUD) ? { language: 'en' } : null,
    translation: tools.includes(SUPPORT_TOOL.TRANSLATE) && language ? { language } : null,
  };
};

export default workedSolutionSupports;
