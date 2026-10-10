/*
 * QUESTIONS WHOSE RECAP KEEPS ITS ANSWER TO ITSELF.
 *
 * A recap entry shows the correct answer and the worked solution, and it
 * stays. Most bank templates generate 13 or more distinct questions in 30
 * draws, so last week's answer is no key to this week's question. These
 * generate fewer than 8: the same question comes back, a retention re-check
 * included, and a stored answer would be its key. Their recap entries keep the
 * question and the student's own answer and leave out the correct answer and
 * the solution (pathSessionRecap.mjs).
 *
 * tests/platform/pathRecapWithheld.test.mjs regenerates this list from
 * seed/pathQuestionBank (30 seeded draws per template, compared by content)
 * and fails when it drifts. Student push J widened 20 of D's 27; what is left
 * is either still being widened or, like mm_A_12A_v2_mapping-nonfunction,
 * has the same answer on every draw, so its recap must never carry it.
 */

export const RECAP_INSTANCE_DRAWS = 30;
export const RECAP_MIN_DISTINCT_INSTANCES = 8;

export const RECAP_WITHHELD_TEMPLATE_IDS = Object.freeze([
  'mm_A2_2A_v2_exponential-graph-attributes',
  'mm_A2_2A_v2_logarithmic-graph-attributes',
  'mm_A2_2A_v2_reciprocal-graph-attributes',
  'mm_A2_2A_v2_root-family-graph',
  'mm_A2_2A_v2_symmetry-family-graph',
  'mm_A2_2C_v2_exponential-log-features',
  'mm_A_12A_v2_mapping-nonfunction',
]);

const WITHHELD = new Set(RECAP_WITHHELD_TEMPLATE_IDS);

/** True when a template's recap entries must not carry its answer or solution. */
export const recapWithholdsAnswer = (templateId) => WITHHELD.has(String(templateId ?? '').trim());
