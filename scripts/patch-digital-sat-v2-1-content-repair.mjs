#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(path.join(here, '..'));
const sourceRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT');
const DRY_RUN = process.argv.includes('--check');

const walk = (dir) => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const roleOf = (doc) => doc?.ccmrFamilyRole || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');
const formatOf = (doc) => String(doc?.assessmentItemFormat || '').toLowerCase();

const advancedDirect = new Set([
  'mm_sat_A_10A_3_missing-linear-coefficient_v21',
  'mm_sat_A_10A_5_subtraction-constant-parameter_v21',
  'mm_sat_A_10B_4_middle-coefficient-from-product_v21',
  'mm_sat_A_10D_5_missing-distributed-coefficient_v21',
  'mm_sat_A_10E_4_missing_middle_coefficient_v21',
  'mm_sat_A_10F_4_missing_square_constant_v21',
  'mm_sat_A_11A_3_radical-product-integer_v21',
  'mm_sat_A_11A_5_perfect-square-radical_v21',
  'mm_sat_A_11B_3_quotient_exponent_law_v21',
]);

const advancedChallengeExclusions = new Set([
  'mm_sat_A_7B_challenge_challenge-coefficient-from-roots_v21',
  'mm_sat_A2_4A_challenge-context-three-point-prediction_v21',
  'mm_sat_A2_4A_challenge-predict-fourth-value_v21',
  'mm_sat_A2_6F_challenge_parameter_inclusion_v21',
  'mm_sat_A2_6I_challenge_2_parameter-from-solution_v21',
  'mm_sat_A2_7D_challenge_factor_parameter_cubic_v21',
]);

const algebraChallenge = new Set([
  'mm_sat_A_2B_8_derived_feature_from_two_points_v21',
  'mm_sat_A_2C_8_standard_form_parameter_from_table_v21',
  'mm_sat_A_2D_6_scaled_observation_v21',
  'mm_sat_A_2D_8_compare_proportional_models_v21',
  'mm_sat_A_2E_7_parallel_intercept_shift_v21',
  'mm_sat_A_2F_7_perpendicular_rational_step_output_v21',
  'mm_sat_A_2F_8_perpendicular_y_intercept_v21',
  'mm_sat_A_2G_8_horizontal_vertical_intersection_v21',
  'mm_sat_A_2I_8_parameterized_common_solution_v21',
  'mm_sat_A_3A_challenge_2_compare-representations_v21',
  'mm_sat_A_3B_challenge_1_unit-converted-rate_v21',
  'mm_sat_A_3C_challenge_1_parameter-from-x-intercept_v21',
  'mm_sat_A_3E_challenge_1_combined-shifts-intercept_v21',
  'mm_sat_A_3F_challenge_1_no-solution-excluded-constant_v21',
  'mm_sat_A_3F_challenge_2_intersection-derived-sum_v21',
  'mm_sat_A_3H_challenge_1_parameter-feasible-point_v21',
  'mm_sat_A_3H_challenge_2_integer-points-vertical-slice_v21',
  'mm_sat_A_5B_challenge_3_parameter_v21',
  'mm_sat_A_5C_challenge_1_parameter_v21',
  'mm_sat_A_5C_challenge_3_combined_value_v21',
  'mm_sat_A2_3F_challenge_1_challenge-integer-count_v21',
]);

const geometryDirect = new Set([
  'mm_sat_native_areaVolume_1_rectangular-prism-volume_v21',
  'mm_sat_native_areaVolume_3_cylinder-volume-coefficient_v21',
  'mm_sat_native_circles_1_inscribed-angle_v21',
  'mm_sat_native_circles_3_arc-length-coefficient_v21',
  'mm_sat_native_circles_5_radians-to-degrees_v21',
  'mm_sat_native_linesAnglesTriangles_1_triangle-angle-sum_v21',
  'mm_sat_native_linesAnglesTriangles_4_triangle-exterior-angle_v21',
]);

const geometryChallenge = new Set([
  'mm_sat_native_areaVolume_ch2_volume-ratio-scale_v21',
  'mm_sat_native_circles_ch2_sector-area-coefficient_v21',
  'mm_sat_native_linesAnglesTriangles_ch3_similarity-from-perimeters_v21',
  'mm_sat_native_rightTrig_ch1_tangent-height_v21',
  'mm_sat_native_rightTrig_ch2_cosine-find-opposite_v21',
  'mm_sat_native_rightTrig_ch3_similar-right-triangles_v21',
]);

const psdDirect = new Set([
  'mm_sat_A_3B_psda_2_model-predicted-change_v21',
  'mm_sat_A_4C_1_predict_from_model_v21',
  'mm_sat_A_4C_5_context_extrapolation_v21',
  'mm_sat_A_8B_2_predict-from-quadratic-model_v21',
  'mm_sat_A_9E_2_predict-from-exponential-model_v21',
  'mm_sat_native_inf_2_lower-bound_v21',
  'mm_sat_native_pct_2_percent-increase-value_v21',
  'mm_sat_native_prob_5_expected-count_v21',
]);

const psdChallenge = new Set([
  'mm_sat_A_3B_psda_ch1_recover-trend-change_v21',
  'mm_sat_A_4C_ch1_recover_rate_and_predict_v21',
  'mm_sat_A_8B_ch1_symmetric-model-prediction_v21',
  'mm_sat_A_9E_ch1_separated-observations-predict_v21',
  'mm_sat_A2_6L_context-recover-new-output_v21',
  'mm_sat_A2_8C_ch1_select-model-and-predict_v21',
  'mm_sat_native_pct_ch1_successive-changes_v21',
  'mm_sat_native_rru_ch2_total-mixture_v21',
]);

const explicitDistractors = Object.freeze({
  mm_sat_native_pct_2_percent-increase-value_v21: ['base*p/100', 'base*(100-p)/100', 'base*(100+p)'],
  mm_sat_native_prob_5_expected-count_v21: ['p*trials', '(100-p)*trials/100', 'trials/100'],
  mm_sat_native_pct_ch1_successive-changes_v21: [
    'start*(100-d+u)/100',
    'start*(100+d)*(100+u)/10000',
    'start*(100-d)*(100-u)/10000',
  ],
  mm_sat_A2_6L_context-recover-new-output_v21: ['t0*factor', 'factor/t0', 't0-factor'],
  mm_sat_native_areaVolume_ch2_volume-ratio-scale_v21: ['k*k', 'k*k*k', '2*k'],
});

const simpleTemplateVar = /^\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}$/;

function splitSignedTerms(expression) {
  const source = String(expression).trim();
  if (source.includes('(') || source.includes(')')) return null;
  const terms = [];
  let token = '';
  let sign = '+';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if ((char === '+' || char === '-') && i > 0) {
      terms.push({ sign, token });
      sign = char;
      token = '';
    } else if (i === 0 && char === '-') {
      sign = '-';
    } else token += char;
  }
  terms.push({ sign, token });
  return terms.filter((entry) => entry.token);
}

function joinTerms(terms) {
  return terms.map((entry, index) => {
    if (index === 0) return entry.sign === '-' ? `-${entry.token}` : entry.token;
    return `${entry.sign}${entry.token}`;
  }).join('');
}

function misconceptionExpressions(id, expression) {
  if (explicitDistractors[id]) return explicitDistractors[id];
  const source = String(expression).replace(/\s+/g, '');

  if (/^[A-Za-z_][A-Za-z0-9_]*\^[A-Za-z0-9_]+$/.test(source)) {
    const [base, exponent] = source.split('^');
    return [`${base}*${exponent}`, `${base}+${exponent}`, `${base}^(${exponent}-1)`];
  }

  if (source.includes('^')) {
    const powerMatch = source.match(/^([^+\-]+)\*([A-Za-z_][A-Za-z0-9_]*)\^([A-Za-z0-9_]+)$/);
    if (powerMatch) {
      const [, coefficient, base, exponent] = powerMatch;
      return [
        `${coefficient}*${base}*${exponent}`,
        `${coefficient}+${base}^${exponent}`,
        `${coefficient}*${base}^(${exponent}-1)`,
      ];
    }
  }

  const terms = splitSignedTerms(source);
  if (terms && terms.length >= 2) {
    const swappedFirst = terms.map((entry, index) => index === 1
      ? { ...entry, sign: entry.sign === '+' ? '-' : '+' }
      : { ...entry });
    const omitLast = terms.slice(0, -1);
    const multiplicationIndex = terms.findIndex((entry) => entry.token.includes('*'));
    const operationError = terms.map((entry, index) => index === multiplicationIndex
      ? { ...entry, token: entry.token.replace('*', '+') }
      : { ...entry });
    const third = multiplicationIndex >= 0 ? joinTerms(operationError) : terms[0].token;
    return [joinTerms(swappedFirst), joinTerms(omitLast), third];
  }

  const product = source.replace(/^\-/, '').split('*');
  const leadingNegative = source.startsWith('-');
  if (product.length >= 2 && product.every(Boolean)) {
    if (product.length === 2) {
      const [a, b] = product;
      const sign = leadingNegative ? '-' : '';
      return [`${sign}(${a}+${b})`, `${sign}${a}`, `${sign}${b}`];
    }
    const [a, b, ...rest] = product;
    const c = rest.join('*');
    const sign = leadingNegative ? '-' : '';
    return [`${sign}${a}*${b}`, `${sign}${a}*${c}`, `${sign}(${product.join('+')})`];
  }

  throw new Error(`${id}: no misconception strategy for derived expression ${source}`);
}

function shouldConvert(doc) {
  const id = String(doc?.id || '');
  const domain = doc?.assessmentContext?.domainId;
  const role = roleOf(doc);
  if (advancedDirect.has(id)) return true;
  if (domain === 'advancedMath' && role === 'challenge') {
    const expected = String(doc?.responseFields?.[0]?.expected || '');
    const answerVar = expected.match(simpleTemplateVar)?.[1];
    const derived = answerVar ? doc?.generator?.derived?.[answerVar] : null;
    return formatOf(doc) === 'studentproducedresponse'
      && typeof derived === 'string'
      && !advancedChallengeExclusions.has(id);
  }
  return algebraChallenge.has(id)
    || geometryDirect.has(id)
    || geometryChallenge.has(id)
    || psdDirect.has(id)
    || psdChallenge.has(id);
}

function convertToMcq(doc) {
  if (formatOf(doc) === 'multiplechoice') return false;
  if (formatOf(doc) !== 'studentproducedresponse') throw new Error(`${doc.id}: expected SPR before conversion`);
  const field = Array.isArray(doc.responseFields) ? doc.responseFields[0] : null;
  const answerVar = String(field?.expected || '').match(simpleTemplateVar)?.[1];
  if (!answerVar) throw new Error(`${doc.id}: conversion requires a simple derived answer token`);
  const correctExpression = doc?.generator?.derived?.[answerVar];
  if (typeof correctExpression !== 'string') throw new Error(`${doc.id}: conversion requires a derived answer expression`);

  const [d1, d2, d3] = misconceptionExpressions(doc.id, correctExpression);
  doc.generator.derived = {
    ...doc.generator.derived,
    satDistractor1: d1,
    satDistractor2: d2,
    satDistractor3: d3,
  };
  const uniqueness = [
    `satDistractor1!=${answerVar}`,
    `satDistractor2!=${answerVar}`,
    `satDistractor3!=${answerVar}`,
    'satDistractor1!=satDistractor2',
    'satDistractor1!=satDistractor3',
    'satDistractor2!=satDistractor3',
  ];
  doc.generator.constraints = [...new Set([...(doc.generator.constraints || []), ...uniqueness])];
  doc.assessmentItemFormat = 'multipleChoice';
  doc.choices = [
    { id: 'sat-correct', label: `{{${answerVar}}}` },
    { id: 'sat-d1', label: '{{satDistractor1}}' },
    { id: 'sat-d2', label: '{{satDistractor2}}' },
    { id: 'sat-d3', label: '{{satDistractor3}}' },
  ];
  doc.responseFields = [{ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice', expected: 'sat-correct' }];
  doc.ccmrAuthenticLanguage = {
    ...doc.ccmrAuthenticLanguage,
    responseEcologyRevision: 'v2.1-75pct-mcq',
  };
  return true;
}

const promptPatches = Object.freeze({
  mm_sat_A2_7E_difference_cubes_v21: 'Which factored expression is equivalent to $x^3-{{a3}}$?',
  mm_sat_A_10F_challenge_2_difference_squares_quadratic_factor_v21: 'The expression ${{m2}}x^4-{{n2}}$ can be written as a product of two quadratic expressions. Which product is equivalent to the expression?',
  mm_sat_A2_7E_challenge_scaled_difference_cubes_v21: 'Which factorization has the same value as ${{m3}}x^3-{{n3}}$ for all values of $x$?',
  mm_sat_A_11A_challenge_1_two-hidden-square-factors_v21: 'What is the result of simplifying $\\sqrt{{{rad1}}}+\\sqrt{{{rad2}}}$?',
  mm_sat_A2_3D_no-intersection-horizontal-below_v21: 'How many points of intersection do the graphs of $y=(x-{{h}})^2 {{v|signed}}$ and $y={{below}}$ have?',
  mm_sat_A2_5D_related-bases-equation_v21: 'For which value of $x$ is ${{r2}}^x={{rhs}}$?',
  mm_sat_A_2B_6_fractional_slope_two_points_v21: 'The graph of a linear function contains the points $({{x1}},{{y1}})$ and $({{x2}},{{y2}})$. Which equation could define the function?',
  mm_sat_A_2G_5_same_coordinate_equation_v21: 'The points $({{x}},{{y1}})$ and $({{x}},{{y2}})$ lie on the same line. What is the equation of that line?',
  mm_sat_A2_7F_challenge_2_three-factor-rational-cancel_v21: 'Simplify $\\dfrac{x+{{p}}}{x+{{q}}}\\cdot\\dfrac{x+{{q}}}{x+{{r}}}\\cdot\\dfrac{x+{{r}}}{x+{{s}}}$ for all values of $x$ for which the original expression is defined.',
});

function replaceExponentialChallenge(doc) {
  if (doc.id !== 'mm_sat_A2_5B_challenge-nonconsecutive-anchor-model_v21') return false;
  doc.taskType = 'functionEvaluation';
  doc.representation = 'functionValues';
  doc.ccmrAuthenticLanguage = {
    ...doc.ccmrAuthenticLanguage,
    stemProfile: 'challenge-nonconsecutive-anchor-prediction',
  };
  doc.prompt = 'An exponential function satisfies $f(2)={{M}}$ and $f(5)={{N}}$. What is the value of $f(8)$?';
  doc.generator.derived = {
    N: 'M*b^3',
    F8: 'N*b^3',
    oneStep: 'N*b',
    twoSteps: 'N*b*b',
  };
  doc.choices = [
    { id: 'sat-correct', label: '{{F8}}' },
    { id: 'sat-d1', label: '{{N}}' },
    { id: 'sat-d2', label: '{{oneStep}}' },
    { id: 'sat-d3', label: '{{twoSteps}}' },
  ];
  doc.responseFields = [{ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice', expected: 'sat-correct' }];
  return true;
}

function replaceQuarticClone(doc) {
  if (doc.id !== 'mm_sat_A2_7E_challenge_quartic_complete_factor_v21') return false;
  doc.ccmrAuthenticLanguage = {
    ...doc.ccmrAuthenticLanguage,
    stemProfile: 'challenge-sixth-power-complete-factor',
  };
  doc.prompt = '$x^6-{{a6}}$ can be factored into linear and quadratic factors. Which expression gives a complete factorization over the real numbers?';
  doc.generator = {
    parameters: { a: { type: 'int', min: 2, max: 5 } },
    derived: { a2: 'a*a', a6: 'a*a*a*a*a*a' },
  };
  doc.choices = [
    { id: 'sat-correct', label: '$(x-{{a}})(x+{{a}})(x^2+{{a}}x+{{a2}})(x^2-{{a}}x+{{a2}})$' },
    { id: 'sat-d1', label: '$(x-{{a}})(x+{{a}})(x^2+{{a}}x+{{a2}})$' },
    { id: 'sat-d2', label: '$(x-{{a}})(x+{{a}})(x^2-{{a}}x+{{a2}})$' },
    { id: 'sat-d3', label: '$(x-{{a}})(x+{{a}})(x^2+{{a}}x-{{a2}})(x^2-{{a}}x+{{a2}})$' },
  ];
  return true;
}

const expectedConverted = Object.freeze({
  advancedMath: 47,
  algebra: 21,
  geometryTrigonometry: 13,
  problemSolvingData: 16,
});
const convertedByDomain = Object.fromEntries(Object.keys(expectedConverted).map((key) => [key, 0]));
const touchedFiles = [];
const seenSelected = new Set();
const seenPromptPatches = new Set();
let exponentialReplaced = 0;
let quarticReplaced = 0;

for (const file of walk(sourceRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (parsed?.framework !== 'digitalSAT' || !Array.isArray(parsed?.documents)) continue;
  let changed = false;
  for (const doc of parsed.documents) {
    if (promptPatches[doc.id]) {
      doc.prompt = promptPatches[doc.id];
      seenPromptPatches.add(doc.id);
      changed = true;
    }
    if (replaceExponentialChallenge(doc)) {
      exponentialReplaced += 1;
      changed = true;
    }
    if (replaceQuarticClone(doc)) {
      quarticReplaced += 1;
      changed = true;
    }
    if (shouldConvert(doc)) {
      seenSelected.add(doc.id);
      if (convertToMcq(doc)) {
        const domain = doc.assessmentContext.domainId;
        convertedByDomain[domain] += 1;
        changed = true;
      }
    }
  }
  if (changed) {
    touchedFiles.push(path.relative(root, file));
    if (!DRY_RUN) writeFileSync(file, `${JSON.stringify(parsed)}\n`);
  }
}

for (const [domain, expected] of Object.entries(expectedConverted)) {
  if (convertedByDomain[domain] !== expected) {
    throw new Error(`${domain}: expected ${expected} response conversions, found ${convertedByDomain[domain]}`);
  }
}
const expectedSelectionCount = Object.values(expectedConverted).reduce((sum, value) => sum + value, 0);
if (seenSelected.size !== expectedSelectionCount) throw new Error(`Expected ${expectedSelectionCount} selected response items; found ${seenSelected.size}`);
if (seenPromptPatches.size !== Object.keys(promptPatches).length) throw new Error(`Expected ${Object.keys(promptPatches).length} prompt repairs; found ${seenPromptPatches.size}`);
if (exponentialReplaced !== 1) throw new Error(`Expected one exponential challenge replacement; found ${exponentialReplaced}`);
if (quarticReplaced !== 1) throw new Error(`Expected one quartic clone replacement; found ${quarticReplaced}`);

console.log(JSON.stringify({
  mode: DRY_RUN ? 'check' : 'write',
  convertedByDomain,
  converted: expectedSelectionCount,
  promptRepairs: seenPromptPatches.size,
  structuralReplacements: { exponential: exponentialReplaced, quartic: quarticReplaced },
  touchedFiles: touchedFiles.length,
}, null, 2));
