/*
 * THE TEST-PREP DISPLAY LEFTOVERS ARE GONE, AND NO STORED ANSWER MOVED (CT14).
 *
 * O2 (#492) left a list of forms in the Digital SAT, ACT and TSIA2 banks: an exponent
 * of 1 ("x^{ 1 }"), a denominator of 1 ("\frac{\sqrt{11}}{1}", "-7/1"), a factor that
 * collapsed to "(x)", a plural unit after 1 ("1 units"), and a "where" clause that
 * compares the generator's constants where letters were meant ("where 14>0 and
 * 2>1"). The audit (scripts/audit-testprep-display-leftovers.mjs, CT12) counted 5, 27,
 * 3, 21 and 2 templates. 60 templates are edited: the audit's sample and a sweep of every
 * value reach most of them, and walking every combination of every template found three
 * more, whose form shows only when several values line up; this holds that:
 *
 *   - the formatter's new words do what they say (`plural`, `yshift`);
 *   - every template of the three banks draws none of those forms, over many draws;
 *   - every value of every parameter of the edited templates draws none of them,
 *     because the draws that used to show one (rise = 1, a run of 1, a shift of 0)
 *     are exactly the ones a random sample can miss;
 *   - the few that need several parameters to line up (a coefficient of 1 only when three
 *     values meet) are walked at every combination, or pinned where the space is too large;
 *   - a value a template no longer deals is one it was edited to refuse, and says so;
 *   - nothing a student answered changes meaning: for every seed, a draw that was not
 *     refused is the same question with the same choice ids in the same order and the
 *     same keyed response as on the base commit, and a refused draw violates a
 *     constraint this change added;
 *   - the hand-kept SAT aggregate says the same thing as the seed.
 *
 * They are listed here by hand and each must be found in the bank AND in the fixture
 * of the base commit's version (fixtures/testPrepDisplayLeftoverMainTemplates.json), so a
 * template dropped from the fix, or from the fixture, fails rather than passes by never
 * being looked at.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { evaluateExpression, generatePathInstance, substitutePlaceholders } from '../../functions/shared/pathQuestionGeneration.mjs';
import { findDisplayProblems, scanBank, surfacesOf } from '../../scripts/lib/testPrepDisplayAudit.mjs';

const EXAMS = ['digitalSAT', 'act', 'tsia2'];
const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const BANK = Object.fromEntries(EXAMS.map((exam) => [exam, JSON.parse(read(`seed/pathQuestionBank/${exam}_pathQuestionBank_seed.json`)).documents]));
const MAIN = JSON.parse(read('tests/platform/fixtures/testPrepDisplayLeftoverMainTemplates.json')).documents;
const byId = (docs) => new Map(docs.map((doc) => [doc.id, doc]));

// The forms this change removes. (The O2 classes stay at zero too, and are held by their own test.)
const FIXED_CLASSES = ['exponentOne', 'denominatorOne', 'collapsedFactor', 'constantCondition', 'pluralOne'];

/** How many templates CT14 edits, in all and in each bank: a template dropped from the list below fails here. */
const EDITED_BY_EXAM = { digitalSAT: 39, act: 9, tsia2: 12 };
const EDITED_COUNT = 60;

/** The templates CT14 edits, by what changed in them. */
const EDITED = {
  // An exponent of 1 shown in the question (the 'pow' filter), or in a worked step.
  exponent: [
    'mm_sat_A_11B_challenge_2_missing_exponent_parameter_v21',
    'mm_sat_A2_5D_exponent-parameter-from-solution_v21',
    'mm_sat_A2_7G_challenge_3_radical-exponent-parameter_v21',
  ],
  // A shift of 0 or a unit rise that a choice or the question showed as "(x )", "(x)" or "/1": the draw is refused.
  refusedDraw: {
    'mm_sat_A_2B_6_fractional_slope_two_points_v21': ['p', 1],
    'mm_sat_A_3A_4_slope-point-slope-form_v21': ['x1', 0],
    'mm_tsia2_gsr_gac_2_v21': ['rise', 1],
    'mm_tsia2_gsr_gac_6_v21': ['rise', 1],
    'mm_tsia2_qr_rim_8_v21': ['c', 1],
  },
  // A conic centred on an axis, written without the empty bracket (the 'xshift' and 'yshift' filters).
  centredConic: ['mm_act_geo_3_ellipse-vertex_v21', 'mm_act_geo_ch2_hyperbola-vertices-distance_v21'],
  // A "where" clause over the generator's constants, taken out.
  constantCondition: [
    'mm_sat_A_9D_unshifted-asymptote_v21',
    'mm_act_ies_coordinateplane_1_quadrant-identification_v21',
    'mm_sat_A_7C_challenge_challenge-compare-values_v21',
    'mm_sat_A_9B_compare-initial-growth_v21',
    'mm_sat_A_9D_growth-decay-from-factor_v21',
    'mm_sat_A_3G_3_estimate-crossing-from-values_v21',
    'mm_sat_A_9C_nonconsecutive-values-model_v21',
  ],
  // A worked step that divided by something that can be 1, written without the fraction.
  workedStep: [
    'mm_sat_A_12E_adv_challenge_1_solve-shift-parameter_v21',
    'mm_sat_A_2G_3_horizontal_slope_v21',
    'mm_sat_A_3A_1_slope-two-points_v21',
    'mm_sat_A_3A_2_slope-table_v21',
    'mm_sat_A_3A_5_slope-from-intercept-and-point_v21',
    'mm_sat_A_3A_challenge_3_coordinate-parameter-slope_v21',
    'mm_sat_A_3C_challenge_3_y-intercept-from-zero-point_v21',
    'mm_sat_A_3D_challenge_1_parameter-boundary-point_v21',
    'mm_sat_A_3F_challenge_2_intersection-derived-sum_v21',
    'mm_sat_A_3G_challenge_3_infer-intersection-from-models_v21',
    'mm_sat_A_3H_challenge_3_intersection-feasible-vertex_v21',
    'mm_sat_A_6B_challenge_challenge-context-vertex-point_v21',
    'mm_sat_A_6B_vertex-form-from-point_v21',
    'mm_sat_A_6B_vertex-form-leading-parameter_v21',
    'mm_sat_A2_3C_challenge_other-intersection-from-one_v21',
    'mm_sat_A2_4A_symmetric-three-points_v21',
    'mm_sat_A2_6G_side-of-asymptote_v21',
    'mm_sat_A2_6I_2_ratio-linear-fraction_v21',
    // Its coefficient is 1 only when t = 1, h = 4 and k = 5: the audit's sample never drew it.
    'mm_sat_A2_6I_challenge_1_two-reciprocal-sides_v21',
    'mm_tsia2_ar_leis_2_v21',
    'mm_tsia2_ar_leis_7_v21',
    'mm_tsia2_ar_lf_2_v21',
    'mm_tsia2_ar_lf_8_v21',
    'mm_tsia2_qr_leei_8_v21',
  ],
  // A unit word that agrees with its number (the 'plural' filter).
  plural: [
    'mm_act_fn_4_translated-point_v21',
    'mm_act_ies_coordinateplane_2_reflection-across-x-axis_v21',
    'mm_act_ies_perimetercircumferencearea_ch1_changed-dimensions-perimeter_v21',
    'mm_act_ies_rnps_ch2_signed-balance-chain_v21',
    'mm_act_ies_rnps_ch3_fraction-decimal-chain_v21',
    'mm_act_sp_ch1_expected-net-value_v21',
    'mm_sat_A2_5B_challenge-infer-growth-interval_v21',
    'mm_sat_A_2C_7_context_two_observations_v21',
    'mm_sat_A_3A_challenge_2_compare-representations_v21',
    'mm_sat_A_3B_1_water-level-rate_v21',
    'mm_sat_A_3E_1_vertical-shift-intercept_v21',
    'mm_sat_A_3E_2_same-slope-different-intercept_v21',
    'mm_sat_A_3G_2_meeting-time-interpretation_v21',
    'mm_sat_A_3G_challenge_1_infer-crossing-from-differences_v21',
    'mm_sat_A_9D_point-translation_v21',
    'mm_tsia2_gsr_tcss_1_v21',
    'mm_tsia2_gsr_tcss_6_v21',
    'mm_tsia2_psr_repr_2_v21',
    'mm_tsia2_qr_pc_5_v21',
  ],
};
const ALL_EDITED = [
  ...EDITED.exponent, ...Object.keys(EDITED.refusedDraw), ...EDITED.centredConic,
  ...EDITED.constantCondition, ...EDITED.workedStep, ...EDITED.plural,
];
// A draw refused not for one parameter's value but for a combination (a derived value of 1 is printed as
// "1 feet"). One combination each that the base commit dealt; the template is also in a list above.
const REFUSES_A_COMBINATION = {
  // h2 = h1 + rate * dt = 31 - 5 * 6 = 1
  'mm_sat_A_3B_1_water-level-rate_v21': { t1: 1, dt: 6, rate: -5, h1: 31 },
};
const examOf = (id) => (id.startsWith('mm_sat_') ? 'digitalSAT' : id.startsWith('mm_act_') ? 'act' : 'tsia2');
const nowDoc = (id) => byId(BANK[examOf(id)]).get(id);
const mainDoc = (id) => byId(MAIN[examOf(id)]).get(id);

test('the formatter writes a unit that agrees with its number, and a conic centred on an axis without an empty bracket', () => {
  const say = (text, n) => substitutePlaceholders(text, { n });
  assert.equal(say('{{n}} unit{{n|plural}}', 1), '1 unit');
  assert.equal(say('{{n}} unit{{n|plural}}', -1), '-1 unit', '-1 is singular too');
  assert.equal(say('{{n}} unit{{n|plural}}', 3), '3 units');
  assert.equal(say('{{n}} unit{{n|plural}}', 0), '0 units');
  assert.equal(say('{{n}} unit{{n|plural}}', 1.5), '1.5 units', '1.5 is plural');
  assert.equal(say('{{n}} mile{{n|plural}}', 11), '11 miles', '11 is not 1');
  assert.equal(say('{{n|yshift}}^2', 0), 'y^2');
  assert.equal(say('{{n|yshift}}^2', 4), '(y - 4)^2');
  assert.equal(say('{{n|yshift}}^2', -4), '(y + 4)^2');
  assert.equal(say('{{n|xshift}}^2', 0), 'x^2', 'xshift is unchanged');
  assert.equal(say('x{{n|pow}}', 1), 'x', 'pow is unchanged');
  assert.equal(say('{{n}}|plural', 1), '1|plural', 'a filter name is only read inside a placeholder');
});

test('the edited templates are listed once each, are in the bank, and are in the fixture of the base commit', () => {
  assert.equal(ALL_EDITED.length, EDITED_COUNT);
  assert.equal(new Set(ALL_EDITED).size, EDITED_COUNT, 'listed once each');
  assert.deepEqual(
    Object.fromEntries(EXAMS.map((exam) => [exam, MAIN[exam].length])),
    EDITED_BY_EXAM,
    'the fixture holds the base commit\'s version of exactly the edited templates',
  );
  assert.deepEqual(
    Object.fromEntries(EXAMS.map((exam) => [exam, ALL_EDITED.filter((id) => examOf(id) === exam).length])),
    EDITED_BY_EXAM,
    'the list and the fixture agree bank by bank',
  );
  ALL_EDITED.forEach((id) => {
    assert.ok(nowDoc(id), `${id} is in the bank`);
    assert.ok(mainDoc(id), `${id} is in the fixture`);
    assert.notEqual(JSON.stringify(nowDoc(id)), JSON.stringify(mainDoc(id)), `${id} is not the base commit's version: it was edited`);
    assert.equal(nowDoc(id).active, true, `${id} is still active`);
  });
});

test('no template of the Digital SAT, ACT or TSIA2 banks draws an exponent of 1, a denominator of 1, a collapsed factor, a constant condition or a plural unit after 1', () => {
  const result = scanBank({ draws: 40, seedPrefix: 'ct14' });
  const active = EXAMS.reduce((sum, exam) => sum + BANK[exam].filter((doc) => doc.active !== false).length, 0);
  assert.equal(result.templates, active, 'the scan read every active template');
  assert.ok(result.draws > active * 30, `${result.draws} draws were issued`);
  FIXED_CLASSES.forEach((id) => {
    assert.deepEqual(result.classes[id].items.map((item) => `${item.id} (${Object.keys(item.surfaces)})`), [], result.classes[id].label);
  });
});

/** Every value one parameter of a template can take (a very long range is sampled at both ends and in the middle). */
const valuesOf = (spec) => {
  if (spec.type === 'choice') return spec.values;
  const step = Number(spec.step) > 0 ? Number(spec.step) : 1;
  const all = [];
  for (let value = Number(spec.min); value <= Number(spec.max); value += step) if (!(spec.exclude || []).includes(value)) all.push(value);
  return all.length <= 40 ? all : [...all.slice(0, 15), ...all.slice(Math.floor(all.length / 2) - 5, Math.floor(all.length / 2) + 5), ...all.slice(-15)];
};

test('every value of every parameter of the edited templates draws none of those forms, in the prompt, the choices or the worked solution', () => {
  const problems = [];
  let issued = 0;
  let refused = 0;
  for (const id of ALL_EDITED) {
    const doc = nowDoc(id);
    let issuedHere = 0;
    for (const [name, spec] of Object.entries(doc.generator.parameters)) {
      for (const value of valuesOf(spec)) {
        const pinned = { ...doc, generator: { ...doc.generator, parameters: { ...doc.generator.parameters, [name]: { type: 'choice', values: [value] } } } };
        for (let seed = 0; seed < 5; seed += 1) {
          const { question } = generatePathInstance(pinned, `ct14-sweep|${id}|${name}=${value}|${seed}`);
          if (!question) { refused += 1; continue; }
          issued += 1;
          issuedHere += 1;
          for (const [surface, text] of surfacesOf(question)) {
            const found = findDisplayProblems(text);
            FIXED_CLASSES.filter((classId) => found[classId]).forEach((classId) => {
              if (problems.length < 8) problems.push(`${id} with ${name}=${value}: ${classId} in the ${surface}: ${text.slice(0, 110)}`);
            });
          }
        }
      }
    }
    assert.ok(issuedHere >= 20, `${id}: only ${issuedHere} draws were issued`);
  }
  assert.deepEqual(problems, []);
  assert.ok(issued > 8000, `${issued} draws were checked (${refused} were refused by a constraint)`);
});

// CT18 widens this template's ranges (21 versions were too few for a class of 32). A wider range moves the draw a
// seed makes, so "the same seed deals the same question" cannot hold for it; what CT14 promised, that a version reads the
// same and keeps its key, is held version by version over the base commit's own ranges instead.
const WIDENED_LATER = new Set(['mm_sat_A2_7G_challenge_3_radical-exponent-parameter_v21']);
const withValues = (doc, values) => ({ ...doc, generator: { ...doc.generator, parameters: { ...doc.generator.parameters, ...Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { type: 'choice', values: [value] }])) } } });

/** Every value of one parameter, however long the range. */
const allValuesOf = (spec) => {
  if (spec.type === 'choice') return spec.values;
  const step = Number(spec.step) > 0 ? Number(spec.step) : 1;
  const all = [];
  for (let value = Number(spec.min); value <= Number(spec.max); value += step) if (!(spec.exclude || []).includes(value)) all.push(value);
  return all;
};

// Templates whose leftover needed several parameters to line up, so that one value at a time (above) and a
// random sample (the audit) both miss it. Walking every combination found these; the list is theirs.
const NEEDS_EVERY_COMBINATION = [
  // Its coefficient (A - B = t(k - h)) is 1 only when t = 1, h = 4 and k = 5.
  'mm_sat_A2_6I_challenge_1_two-reciprocal-sides_v21',
];

test('a template whose leftover needed several parameters to line up draws none of those forms at any combination of them', () => {
  assert.equal(NEEDS_EVERY_COMBINATION.length, 1, 'the templates walked at every combination have not been dropped from the list');
  assert.ok(NEEDS_EVERY_COMBINATION.every((id) => ALL_EDITED.includes(id)), 'each is one of the edited templates');
  for (const id of NEEDS_EVERY_COMBINATION) {
    const doc = nowDoc(id);
    const names = Object.keys(doc.generator.parameters);
    const lists = names.map((name) => allValuesOf(doc.generator.parameters[name]));
    const total = lists.reduce((product, list) => product * list.length, 1);
    assert.ok(total <= 5000, `${id}: ${total} combinations is more than a unit test should walk`);
    const problems = [];
    let issued = 0;
    const counters = names.map(() => 0);
    for (let index = 0; index < total; index += 1) {
      const combination = counters.map((counter, position) => lists[position][counter]);
      const pinned = { ...doc, generator: { ...doc.generator, parameters: Object.fromEntries(names.map((name, position) => [name, { type: 'choice', values: [combination[position]] }])) } };
      const { question } = generatePathInstance(pinned, `ct14-every|${id}|${index}`);
      if (question) {
        issued += 1;
        for (const [surface, text] of surfacesOf(question)) {
          const found = findDisplayProblems(text);
          FIXED_CLASSES.filter((classId) => found[classId]).forEach((classId) => {
            if (problems.length < 5) problems.push(`${id} at ${names.map((name, position) => `${name}=${combination[position]}`).join(', ')}: ${classId} in the ${surface}: ${text.slice(0, 110)}`);
          });
        }
      }
      for (let position = names.length - 1; position >= 0; position -= 1) {
        counters[position] += 1;
        if (counters[position] < lists[position].length) break;
        counters[position] = 0;
      }
    }
    assert.deepEqual(problems, []);
    assert.ok(issued > total * 0.5, `${id}: ${issued} of ${total} combinations were issued`);
  }
});

test('a value a template was edited to refuse is refused, and every other value of that parameter is still dealt', () => {
  for (const [id, [name, value]] of Object.entries(EDITED.refusedDraw)) {
    const doc = nowDoc(id);
    const pin = (v) => ({ ...doc, generator: { ...doc.generator, parameters: { ...doc.generator.parameters, [name]: { type: 'choice', values: [v] } } } });
    assert.equal(generatePathInstance(pin(value), `ct14-refused|${id}`).question, null, `${id}: ${name}=${value} is refused`);
    // The base commit dealt it: that is the draw this change removes.
    assert.ok(generatePathInstance({ ...mainDoc(id), generator: { ...mainDoc(id).generator, parameters: { ...mainDoc(id).generator.parameters, [name]: { type: 'choice', values: [value] } } } }, `ct14-refused|${id}`).question, `${id}: the base commit dealt ${name}=${value}`);
    const others = valuesOf(doc.generator.parameters[name]).filter((v) => v !== value);
    assert.ok(others.length >= 3, `${id}: ${others.length} other values remain`);
    others.forEach((v) => assert.ok(generatePathInstance(pin(v), `ct14-refused|${id}|${v}`).question, `${id}: ${name}=${v} is still dealt`));
  }
});

// Combinations that drew one of those forms on the base commit and that no sample or one-value-at-a-time sweep
// reaches: the walk over every combination found them. Each is pinned, and the base commit must still show the
// form there, so the entry stays a real canary rather than a number that never mattered.
const KNOWN_COINCIDENCES = {
  // The balance is start - w + dep - fee = 1 dollar: "1 dollars".
  'mm_act_ies_rnps_ch2_signed-balance-chain_v21': [{ start: 40, w: 40, dep: 13, fee: 12 }],
  // A - B = t(k - h) = 1: "\frac{8}{1}".
  'mm_sat_A2_6I_challenge_1_two-reciprocal-sides_v21': [{ xsol: 8, h: 4, k: 5, t: 1 }],
};

test('the combinations that drew a form on the base commit and that nothing but a walk over every combination reaches draw none of them now', () => {
  const formsAt = (doc, combination, key) => {
    const pinned = { ...doc, generator: { ...doc.generator, parameters: { ...doc.generator.parameters, ...Object.fromEntries(Object.entries(combination).map(([name, value]) => [name, { type: 'choice', values: [value] }])) } } };
    const { question } = generatePathInstance(pinned, key);
    assert.ok(question, `${doc.id} deals ${JSON.stringify(combination)}`);
    return surfacesOf(question).flatMap(([surface, text]) => {
      const found = findDisplayProblems(text);
      return FIXED_CLASSES.filter((classId) => found[classId]).map((classId) => `${classId} in the ${surface}: ${text.slice(0, 100)}`);
    });
  };
  assert.equal(Object.keys(KNOWN_COINCIDENCES).length, 2, 'the pinned combinations have not been dropped from the list');
  for (const [id, combinations] of Object.entries(KNOWN_COINCIDENCES)) {
    assert.ok(ALL_EDITED.includes(id), `${id} is one of the edited templates`);
    for (const combination of combinations) {
      assert.ok(formsAt(mainDoc(id), combination, `ct14-known|${id}`).length > 0, `${id}: the base commit drew a form at ${JSON.stringify(combination)}`);
      assert.deepEqual(formsAt(nowDoc(id), combination, `ct14-known|${id}`), [], `${id} at ${JSON.stringify(combination)}`);
    }
  }
});

test('a combination a template was edited to refuse is refused, the base commit dealt it, and its neighbours are still dealt', () => {
  assert.equal(Object.keys(REFUSES_A_COMBINATION).length, 1, 'the refused combination has not been dropped from the list');
  for (const [id, combination] of Object.entries(REFUSES_A_COMBINATION)) {
    assert.ok(ALL_EDITED.includes(id), `${id} is one of the edited templates`);
    const pin = (doc, values) => ({ ...doc, generator: { ...doc.generator, parameters: { ...doc.generator.parameters, ...Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { type: 'choice', values: [value] }])) } } });
    assert.equal(generatePathInstance(pin(nowDoc(id), combination), `ct14-combination|${id}`).question, null, `${id}: ${JSON.stringify(combination)} is refused`);
    assert.ok(generatePathInstance(pin(mainDoc(id), combination), `ct14-combination|${id}`).question, `${id}: the base commit dealt ${JSON.stringify(combination)}`);
    // Move the last parameter: the neighbouring combinations (a level of 2, 3, ... feet) are dealt.
    const [last] = Object.keys(combination).slice(-1);
    const neighbours = valuesOf(nowDoc(id).generator.parameters[last]).filter((value) => value !== combination[last]);
    const dealt = neighbours.filter((value) => generatePathInstance(pin(nowDoc(id), { ...combination, [last]: value }), `ct14-combination|${id}|${value}`).question);
    assert.ok(dealt.length >= 3, `${id}: only ${dealt.length} of ${neighbours.length} neighbouring values of ${last} are dealt`);
  }
});

test('no stored answer changes meaning: a draw that is not refused is the same question with the same choice ids, order and keyed response, and a refused one violates a constraint this change added', () => {
  const SEEDS = 150;
  let same = 0;
  let moved = 0;
  let widenedVersions = 0;
  for (const id of ALL_EDITED) {
    const before = mainDoc(id);
    const after = nowDoc(id);
    if (WIDENED_LATER.has(id)) {
      // Only the ranges widen: nothing that decides a key or a display moves, and each version of the old ranges is the same question.
      Object.entries(before.generator.parameters).forEach(([name, was]) => {
        const now = after.generator.parameters[name];
        assert.ok(now && now.type === was.type && now.min <= was.min && now.max >= was.max && (now.step || 1) === (was.step || 1) && JSON.stringify(now.exclude || []) === JSON.stringify(was.exclude || []), `${id}: ${name} only widens`);
      });
      assert.deepEqual(after.generator.derived, before.generator.derived, `${id}: the same derived values`);
      assert.deepEqual(after.generator.constraints, before.generator.constraints, `${id}: the same constraints`);
      assert.equal(JSON.stringify(after.responseFields), JSON.stringify(before.responseFields), `${id}: the same response fields and keys`);
      assert.equal(JSON.stringify((after.choices || []).map((choice) => choice.id)), JSON.stringify((before.choices || []).map((choice) => choice.id)), `${id}: the same choice ids in the same order`);
      const names = Object.keys(before.generator.parameters);
      const lists = names.map((name) => allValuesOf(before.generator.parameters[name]));
      const counters = names.map(() => 0);
      const total = lists.reduce((product, list) => product * list.length, 1);
      for (let index = 0; index < total; index += 1) {
        const combination = Object.fromEntries(names.map((name, position) => [name, lists[position][counters[position]]]));
        const key = `ct14-widened|${id}|${index}`;
        const old = generatePathInstance(withValues(before, combination), key);
        const fresh = generatePathInstance(withValues(after, combination), key);
        assert.equal(Boolean(fresh.question), Boolean(old.question), `${id} at ${JSON.stringify(combination)}: dealt or refused as before`);
        if (old.question) {
          assert.deepEqual(fresh.question.choices?.map((choice) => choice.id), old.question.choices?.map((choice) => choice.id), `${id} at ${JSON.stringify(combination)}: same choice ids, same order`);
          assert.equal(JSON.stringify(fresh.question.responseFields), JSON.stringify(old.question.responseFields), `${id} at ${JSON.stringify(combination)}: same keyed response`);
          widenedVersions += 1;
        }
        for (let position = names.length - 1; position >= 0; position -= 1) {
          counters[position] += 1;
          if (counters[position] < lists[position].length) break;
          counters[position] = 0;
        }
      }
      continue;
    }
    const oldConstraints = before.generator.constraints || [];
    const newConstraints = after.generator.constraints || [];
    assert.deepEqual(newConstraints.slice(0, oldConstraints.length), oldConstraints, `${id}: the base commit's constraints are kept`);
    const added = newConstraints.slice(oldConstraints.length);
    // Parameters, derived values (only new names may be added) and everything that decides a key are the base commit's.
    assert.deepEqual(after.generator.parameters, before.generator.parameters, `${id}: the same parameters and ranges`);
    Object.entries(before.generator.derived || {}).forEach(([name, expression]) => assert.equal(after.generator.derived?.[name], expression, `${id}: derived ${name} is the base commit's`));
    assert.equal(JSON.stringify(after.responseFields), JSON.stringify(before.responseFields), `${id}: the same response fields and keys`);
    assert.equal(JSON.stringify((after.choices || []).map((choice) => choice.id)), JSON.stringify((before.choices || []).map((choice) => choice.id)), `${id}: the same choice ids in the same order`);
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const key = `ct14-same|${id}|${seed}`;
      const old = generatePathInstance(before, key);
      const fresh = generatePathInstance(after, key);
      assert.ok(old.question && fresh.question, `${id} ${key}: both issue a question`);
      const sameDraw = Object.keys(old.parameters || {}).every((name) => old.parameters[name] === fresh.parameters?.[name]);
      if (!sameDraw) {
        moved += 1;
        assert.ok(added.length, `${id} ${key}: the parameters moved without a constraint added`);
        assert.ok(added.some((expression) => !evaluateExpression(expression, old.parameters)), `${id} ${key}: the base commit's draw violates none of the constraints this change added`);
        continue;
      }
      same += 1;
      assert.deepEqual(fresh.question.choices?.map((choice) => choice.id), old.question.choices?.map((choice) => choice.id), `${id} ${key}: same choice ids, same order`);
      assert.equal(JSON.stringify(fresh.question.responseFields), JSON.stringify(old.question.responseFields), `${id} ${key}: same keyed response`);
    }
  }
  // Only the six templates edited to refuse a draw move one, and not often.
  const compared = (ALL_EDITED.length - WIDENED_LATER.size) * SEEDS;
  assert.ok(same > compared * 0.9, `${same} draws kept, ${moved} refused and redrawn`);
  assert.ok(moved > 0 && moved < compared * 0.1, `${moved} draws redrawn`);
  assert.equal(widenedVersions, 21, "every version of the widened template's old ranges was compared");
});

test('the SAT aggregate kept by hand says the same thing as the seed for every edited Digital SAT template', () => {
  const aggregate = byId(JSON.parse(read('drafts/digitalSAT.v2.1.json')).documents);
  // It lags the sources on the display filters (#492), so the words are what must agree.
  const words = (text) => String(text ?? '').replace(/\{\{([^}|]+)\|[a-zA-Z]+\}\}/g, '{{$1}}');
  // The aggregate still writes this one's point-slope form from the letters (y-{{y1}}), where O2 (#492)
  // gave the source a derived value and a filter for each side. That is older than this change; only the
  // constraint is held for it, and the day the aggregate is brought in line this entry fails and goes.
  const WRITES_ITS_OWN_FORM = new Set(['mm_sat_A_3A_4_slope-point-slope-form_v21']);
  let compared = 0;
  ALL_EDITED.filter((id) => examOf(id) === 'digitalSAT').forEach((id) => {
    const held = aggregate.get(id);
    assert.ok(held, `${id} is in drafts/digitalSAT.v2.1.json`);
    if (WRITES_ITS_OWN_FORM.has(id)) assert.notEqual(words(held.prompt), words(nowDoc(id).prompt), `${id}: the aggregate has been brought in line, so drop it from the exemption`);
    else assert.equal(words(held.prompt), words(nowDoc(id).prompt), `${id}: the prompt`);
    assert.deepEqual((held.choices || []).map((choice) => words(choice.label)), (nowDoc(id).choices || []).map((choice) => words(choice.label)), `${id}: the choices`);
    assert.deepEqual(held.generator.constraints || [], nowDoc(id).generator.constraints || [], `${id}: the constraints`);
    compared += 1;
  });
  assert.equal(compared, EDITED_BY_EXAM.digitalSAT);
});
