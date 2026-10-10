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
 * and fails when it drifts. Content follow-up: widen these generators.
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
  'mm_A2_3B_v2_matrix-technology-rref',
  'mm_A2_4E_v2_quadratic-context-interpolation',
  'mm_A2_4E_v2_quadratic-regression-table',
  'mm_A2_4E_v2_square-root-context-interpolation',
  'mm_A2_5B_v2_logarithmic-ratio-scale-model',
  'mm_A2_8B_v2_exponential-regression-decay-noisy',
  'mm_A2_8B_v2_exponential-regression-growth-noisy',
  'mm_A2_8B_v2_linear-regression-noisy',
  'mm_A2_8B_v2_quadratic-regression-noisy',
  'mm_A2_8C_v2_prediction-model-variants',
  'mm_A_12A_v2_mapping-nonfunction',
  'mm_A_12D_v2_geometric-decay-terms-to-formula',
  'mm_A_12E_v2_solve-area-height',
  'mm_A_2A_v2_discrete-mapping-domain-range',
  'mm_A_3G_v2_error-read-intersection',
  'mm_A_3G_v2_graph-then-verify',
  'mm_A_3G_v2_pricing-estimate',
  'mm_A_3G_v2_savings-estimate',
  'mm_A_3G_v2_transport-estimate',
  'mm_A_9B_v2_growth-factor',
  'mm_A_9D_v2_context-decay-graph',
]);

const WITHHELD = new Set(RECAP_WITHHELD_TEMPLATE_IDS);

/** True when a template's recap entries must not carry its answer or solution. */
export const recapWithholdsAnswer = (templateId) => WITHHELD.has(String(templateId ?? '').trim());
