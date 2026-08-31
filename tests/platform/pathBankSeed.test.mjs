import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  MINIMUM_ISSUABLE_FAMILIES, buildCoverageIndex, summarizeCoverage,
} from '../../functions/shared/pathCoverage.mjs';
import { rankCandidates, recordFamilyUse, selectNextFamily } from '../../functions/shared/pathQuestionSelection.mjs';
import { getWheelTeksForCourse } from '../../src/platform/mastery/strandConfig.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const rigorPolicy = require('../../functions/lib/rigorPolicy.js');

// The starter seed, checked the way it will actually be used.
//
// Two different questions have to be answered, and passing the first does not
// imply the second:
//
//   COVERAGE — does the bank contain enough validated families per standard?
//   ISSUANCE — can the runtime actually SELECT one and hand it to a student?
//
// A bank can show five documents for a standard and still fail a child, if
// difficulty selection, active flags or schema rules prevent any of them being
// chosen. So this file audits the bank and then launches a real session on
// every routeable standard.

const SEED_DIR = new URL('../../seed/pathQuestionBank/', import.meta.url);

// Every middle-school standard the Algebra prerequisite graph can route into.
// Off both wheels, and reachable, so a gap here is a dead end met by a student
// who has just answered badly — the worst possible moment.
//
// This list grew from six to twenty-nine when the prerequisite content was
// authored: the graph could always reach these, and nineteen of them had no
// content, so a confirmed prerequisite gap had nowhere to send the student.
const REACHABLE_PREREQUISITES = [
  '6.7A', '6.7D',
  '7.3A', '7.3B', '7.7', '7.11A',
  '8.2B', '8.2C', '8.4A', '8.4B', '8.4C',
  '8.5A', '8.5B', '8.5C', '8.5D', '8.5E', '8.5F', '8.5G', '8.5H', '8.5I',
  '8.7C', '8.8A', '8.8C', '8.9', '8.10A', '8.10C', '8.11A', '8.12C', '8.12D',
];

const loadSeed = async () => {
  const files = (await readdir(SEED_DIR)).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).sort();
  const documents = [];
  for (const name of files) {
    const parsed = JSON.parse(await readFile(new URL(name, SEED_DIR), 'utf8'));
    // The package wraps its payload in `documents`; the importer accepts that
    // alongside `items` and `questions`, and so does this.
    (parsed.documents || parsed.items || parsed.questions || []).forEach((entry) => documents.push(entry));
  }
  return documents;
};

const planAll = async (documents) => {
  const plans = {};
  for (const document of documents) {
    // First enforce the exact template boundary gate used by the importer. A
    // generator is valid only if sampled concrete instances really issue.
    // eslint-disable-next-line no-await-in-loop
    const templatePlan = await mathPath.buildTemplateIssuePlan(document);
    if (!templatePlan.issuable) {
      plans[document.id] = templatePlan;
      continue;
    }
    // Then build one deterministic concrete instance so the remainder of this
    // suite can inspect the real secure grading route (field vs tool). Raw
    // generator placeholders are not themselves a student question.
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(document, `seed-test|${document.id}`);
    if (!instantiated.question) {
      plans[document.id] = { issuable: false, reason: instantiated.reason || "generator_failed" };
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const issuePlan = await mathPath.buildIssuePlan(instantiated.question);
    plans[document.id] = {
      ...issuePlan,
      issuable: templatePlan.issuable && issuePlan.issuable,
      reason: templatePlan.reason || issuePlan.reason,
      templateSamples: templatePlan.samples,
      concreteQuestion: instantiated.question,
    };
  }
  return plans;
};

const SEED = await loadSeed();
const PLANS = await planAll(SEED);

// --- The dry-run: every document, through the real production check -----------------

test('every document has a unique id and an alignment', () => {
  // Not a fixed count any more: the bank grows as standards are authored, and a
  // test that pins the total turns every content addition into a test failure.
  // What must stay true is that an import cannot overwrite one item with
  // another, and that every item is reachable from a standard.
  assert.ok(SEED.length >= 515, `the bank shrank to ${SEED.length} documents`);
  assert.equal(new Set(SEED.map((entry) => entry.id)).size, SEED.length, 'duplicate ids would overwrite each other on import');
  SEED.forEach((entry) => {
    assert.ok(entry.id, 'every document needs an id to be idempotent on');
    assert.ok(Array.isArray(entry.alignmentKeys) && entry.alignmentKeys.length, `${entry.id} has no alignment`);
  });
});

test('every seed document is issuable by production buildIssuePlan', () => {
  const failures = SEED
    .filter((entry) => !PLANS[entry.id]?.issuable)
    .map((entry) => ({
      id: entry.id,
      familyId: entry.familyId,
      standards: entry.alignmentKeys,
      reason: PLANS[entry.id]?.reason,
    }));
  assert.deepEqual(failures, [], `documents that would fail in production:\n${JSON.stringify(failures, null, 2)}`);
});

test('every document is graded by exactly one of the two secure routes', () => {
  // Inspect the concrete question production would issue, not a family shell.
  // Variant-bearing families may intentionally keep grading fields only on
  // their effective variants.
  SEED.forEach((entry) => {
    const plan = PLANS[entry.id];
    const question = plan.concreteQuestion || entry;
    if (plan.toolPayload) {
      assert.ok(question.type || question.toolId || question.pathToolId, `${entry.id} has a tool payload but declares no tool`);
      assert.ok(plan.privateGrading?.pathToolId, `${entry.id} has no server grader`);
    } else {
      assert.equal(question.type, undefined, `${entry.id} declares a type with no contract`);
      assert.equal(question.toolId, undefined, `${entry.id} declares a toolId with no contract`);
      assert.equal(question.pathToolId, undefined, `${entry.id} declares a pathToolId with no contract`);
      assert.ok(Array.isArray(question.responseFields) && question.responseFields.length, `${entry.id} has no response fields`);
    }
  });
});

test('no document asks a student to type the letter of an option', () => {
  // The single worst defect in the original starter bank, and the one the
  // upgrade exists to remove. Checked over the WHOLE bank rather than the
  // authored part, because the starter items are what a student meets on any
  // standard nobody has authored yet.
  // `type\s+a\b` used to be part of this and matched "each type A package has
  // mass ..." in mm_sat_A_2H_1_capacity_constraint_v21 — a noun phrase, not an
  // instruction. The patterns below name the instruction itself, and cover more
  // ways of writing it (enter/write/select as well as type) than the original.
  const TYPE_A_LETTER = /\b(?:type|enter|write|input)\s+(?:in\s+)?(?:the\s+|a\s+)?letter\b/i;
  const LETTER_OF_THE_OPTION = /\b(?:letter|choice)\s+of\s+(?:the\s+)?(?:correct\s+)?(?:answer|option|choice|response)\b/i;
  const LETTER_MENU = /\b(?:type|enter|write|select)\s+(?:one\s+of\s+)?["']?A["']?\s*,\s*["']?B["']?\s*,/i;
  const OPTION_LIST = /(^|\n)\s*[A-D]\s*\)\s+\S/m;
  const offenders = SEED.filter((entry) => TYPE_A_LETTER.test(entry.prompt || '')
    || LETTER_OF_THE_OPTION.test(entry.prompt || '')
    || LETTER_MENU.test(entry.prompt || '')
    || OPTION_LIST.test(entry.prompt || ''));
  assert.deepEqual(offenders.map((entry) => entry.id), []);
});

test('a multiple-choice item ships real selectable options', () => {
  const choiceFields = [];
  SEED.forEach((entry) => {
    (entry.responseFields || []).forEach((field) => {
      if (field.inputProfile === 'choice') choiceFields.push({ entry, field });
    });
  });
  // Options may be family-wide or local to the response field. Both shapes are
  // supported by the renderer; what matters is that the student's actual choice
  // field has selectable options containing its secure expected id.
  assert.ok(choiceFields.length > 0, 'the bank should contain multiple-choice items');
  choiceFields.forEach(({ entry, field }) => {
    const choices = (field.choices || entry.choices || []);
    assert.ok(choices.length >= 2, `${entry.id}/${field.id} has a choice input but no options`);
    const expected = String(field.expected);
    assert.ok(choices.some((choice) => String(choice.id) === expected),
      `${entry.id}/${field.id}'s expected answer is not one of its options`);
  });
});

test('the correct option is not always in the same place', async () => {
  // Generator-backed families may intentionally keep a stable answer ID while
  // the server deterministically shuffles the rendered option order. Test the
  // concrete question a student receives, not the raw template's ID naming.
  const counts = new Map();
  let total = 0;
  for (const entry of SEED) {
    if (!(entry.choices || []).length) continue;
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(entry, `choice-position|${entry.id}`);
    const question = instantiated.question;
    assert.ok(question, `${entry.id} could not be instantiated for choice-position audit`);
    const expected = String(question.responseFields?.[0]?.expected ?? '');
    const position = (question.choices || []).findIndex((choice) => String(choice?.id) === expected);
    assert.ok(position >= 0, `${entry.id}'s expected answer is not one of its generated options`);
    counts.set(position, (counts.get(position) || 0) + 1);
    total += 1;
  }
  const worstShare = Math.max(...counts.values()) / total;
  assert.ok(worstShare <= 0.4, `${Math.round(worstShare * 100)}% of choice items share one answer position`);
});

// --- Coverage, computed from the documents rather than from the manifest -------------

const coverageFor = (courseId) => buildCoverageIndex({
  courseId,
  wheelTeks: getWheelTeksForCourse(courseId),
  bankItems: SEED.filter(isCourseItem),
  plans: PLANS,
});

test('Algebra I: every wheel standard has a full session of families', () => {
  const index = coverageFor('algebra1');
  assert.equal(index.summary.wheelSkills, 49);
  assert.equal(index.summary.studentReady, 49);
  assert.equal(index.summary.fullyCovered, true);
  assert.deepEqual(summarizeCoverage(index, { onlyGaps: true }), []);
});

test('Algebra II: every wheel standard has a full session of families', () => {
  const index = coverageFor('algebra2');
  assert.equal(index.summary.wheelSkills, 48);
  assert.equal(index.summary.studentReady, 48);
  assert.equal(index.summary.fullyCovered, true);
  assert.deepEqual(summarizeCoverage(index, { onlyGaps: true }), []);
});

test('the reachable middle-school prerequisites are covered too', () => {
  // Routing can descend into these, so a gap here is a dead end reached by a
  // student who answered badly — the worst moment to meet one.
  const index = coverageFor('algebra1');
  REACHABLE_PREREQUISITES.forEach((code) => {
    const record = index.offWheel[code];
    assert.ok(record, `${code} has no bank content at all`);
    assert.ok(
      record.issuableCount >= MINIMUM_ISSUABLE_FAMILIES,
      `${code} has ${record.issuableCount} families, needs ${MINIMUM_ISSUABLE_FAMILIES}`,
    );
  });
});

test('no standard is left under-filled or empty', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    const rows = summarizeCoverage(coverageFor(courseId));
    const under = rows.filter((row) => row.issuableCount > 0 && row.issuableCount < MINIMUM_ISSUABLE_FAMILIES);
    const zero = rows.filter((row) => row.issuableCount === 0);
    assert.deepEqual(under.map((row) => `${row.displayCode}(${row.issuableCount})`), [], `${courseId} under-filled`);
    assert.deepEqual(zero.map((row) => row.displayCode), [], `${courseId} empty`);
  });
});

test('every family set is spread across difficulty bands, not stacked in one', () => {
  const index = coverageFor('algebra1');
  Object.values(index.skills).forEach((record) => {
    assert.ok(record.distinctBands >= 2, `${record.displayCode} sits in ${record.distinctBands} band(s)`);
  });
});

// --- Issuance: coverage existing is not the same as a question being issued ----------

const routeableTargets = () => ([
  ...getWheelTeksForCourse('algebra1'),
  ...getWheelTeksForCourse('algebra2'),
  ...REACHABLE_PREREQUISITES,
]);

const isCourseItem = (entry) => String(entry?.assessmentContext?.framework || 'course') === 'course';
const candidatesFor = (code) => SEED.filter((entry) => (
  entry.active !== false
  && isCourseItem(entry)
  && (entry.alignmentKeys || []).some((key) => String(key).replace(/^texas:/i, '').toUpperCase() === code.toUpperCase())
  && PLANS[entry.id]?.issuable
));

test('every routeable standard launches a full five-question session', () => {
  // A fifth family may be blocked by the quality audit; that is a content
  // defect to repair, not permission to repeat one of the first four.
  // Quality-safe fifth families are part of the five-question release contract.
  const targets = routeableTargets();
  assert.equal(targets.length, 49 + 48 + REACHABLE_PREREQUISITES.length, 'the routeable set is both wheels plus every reachable prerequisite');

  const failures = [];
  targets.forEach((code) => {
    const candidates = candidatesFor(code);
    if (!candidates.length) { failures.push({ code, reason: 'no_issuable_candidates' }); return; }

    // Both course levels, because readiness decides the starting band.
    ['standard', 'honors'].forEach((courseLevel) => {
      const rigor = rigorPolicy.resolveAdaptiveRigor({ courseLevel, profile: {} });
      let usage = {};
      const issued = [];
      for (let question = 0; question < 5; question += 1) {
        const ranking = rankCandidates(candidates, { preferredBand: rigor.preferredDifficultyBand, usage });
        const choice = selectNextFamily(candidates, { preferredBand: rigor.preferredDifficultyBand, usage });
        if (!choice) { failures.push({ code, courseLevel, reason: 'selector_returned_nothing' }); return; }
        if (choice.isRepeat && ranking.some((entry) => entry.timesUsed === 0)) {
          failures.push({
            code,
            courseLevel,
            reason: 'repeat_selected_while_unused_family_exists',
            issued,
            ranking: ranking.map((entry) => ({
              id: entry.question.id,
              quality: entry.quality,
              safetyTier: entry.qualitySafetyTier,
              blockers: entry.qualityBlockers,
              timesUsed: entry.timesUsed,
              band: entry.band,
              distance: entry.distance,
              dok: entry.dok,
            })),
          });
          return;
        }
        issued.push(choice.question.id);
        usage = recordFamilyUse(usage, choice.question.id, question + 1);
      }
      if (new Set(issued).size !== 5) failures.push({ code, courseLevel, reason: 'repeated_within_session', issued });
    });
  });

  assert.deepEqual(failures, [], `standards that could not launch:\n${JSON.stringify(failures.slice(0, 20), null, 2)}`);
});

test('nothing a student receives carries the answer', () => {
  const forbidden = ['expected', 'accepted', 'privateGrading', 'grading', 'answerKey', 'seedMetadata'];
  const collectKeys = (value, found = new Set()) => {
    if (Array.isArray(value)) { value.forEach((entry) => collectKeys(entry, found)); return found; }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => { found.add(key); collectKeys(entry, found); });
    }
    return found;
  };

  SEED.forEach((entry) => {
    const sanitized = mathPath.buildSanitizedQuestion(entry, {
      questionInstanceId: 'qi', attemptsAllowed: 3, attemptsUsed: 0, toolPayload: PLANS[entry.id].toolPayload,
    });
    const keys = collectKeys(sanitized);
    forbidden.forEach((key) => assert.ok(!keys.has(key), `${entry.id} leaked "${key}" to the browser`));

    // The expected VALUES too, wherever they might have been copied. Checked as
    // values rather than by scanning for the word "answer", which is a
    // legitimate response-field id in this bank.
    // The expected VALUES too, wherever they might have been copied — but
    // scanned over the parts of the payload that describe the TASK, not the
    // parts that describe the MATERIAL.
    //
    // Two exclusions, and both are the difference between a leak and a
    // question. `stimulus` is what the student is meant to read: a table whose
    // whole point is "the intercept is the value at x = 0" necessarily contains
    // the intercept. And a choice item's expected value is an option id, which
    // has to travel because it is the answer SPACE — the payload says which
    // options exist and never which one is right.
    const { stimulus, ...taskPayload } = sanitized;
    const blob = JSON.stringify(taskPayload);
    (entry.responseFields || []).forEach((field) => {
      if (field.expected === undefined || String(field.expected).length < 2) return;
      if (field.inputProfile === 'choice') return;
      assert.ok(!blob.includes(JSON.stringify(field.expected)), `${entry.id} leaked its expected value`);
    });
    // And nothing inside the stimulus may name itself an answer.
    const stimulusKeys = collectKeys(stimulus || {});
    ['expected', 'accepted', 'correct', 'answer'].forEach((key) => {
      assert.ok(!stimulusKeys.has(key), `${entry.id} put "${key}" inside its stimulus`);
    });
  });
});

const ASSESSMENT_BANK_EXPECTATIONS = Object.freeze({
  digitalSAT: { documents: 664, direct: 415, challenge: 249, standards: 110 },
  act: { documents: 136, direct: 85, challenge: 51, standards: 225 },
  tsia2: { documents: 200, direct: 125, challenge: 75, standards: 224 },
  // Both tiers are authored per subtest across 147 standard-subtest pairs:
  // 147 x 5 direct and 147 x 3 challenge. A2.6L is assessed in both ASVAB
  // subtests and is authored separately in each, which is why the counts are
  // 735 and 441 rather than 146 x 5 and 146 x 3.
  asvab: { documents: 1176, direct: 735, challenge: 441, standards: 146 },
});

Object.entries(ASSESSMENT_BANK_EXPECTATIONS).forEach(([framework, expected]) => {
  test(`${framework} ships complete direct and challenge family sets and stays out of course selection`, () => {
    const items = SEED.filter((entry) => entry?.assessmentContext?.framework === framework && entry?.assessmentContext?.examStyle === true);
    assert.equal(items.length, expected.documents);
    assert.equal(items.filter((entry) => entry.ccmrFamilyRole === 'direct').length, expected.direct);
    assert.equal(items.filter((entry) => entry.ccmrFamilyRole === 'challenge').length, expected.challenge);
    const byCode = new Map();
    items.forEach((entry) => {
      (entry.alignmentKeys || []).forEach((key) => {
        const code = String(key).replace(/^texas:/i, '').toUpperCase();
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code).push(entry);
      });
    });
    assert.equal(byCode.size, expected.standards);
    byCode.forEach((families, code) => {
      // Whole sets of five direct and three challenge, never a partial set, and
      // always as many direct sets as challenge sets. A code that routes into
      // more than one assessment domain is authored once per domain and so
      // ships several complete sets — see ccmrFidelityV2.test.mjs.
      const direct = new Set(families.filter((entry) => Number(entry.ccmrChallengeTier || 1) === 1 && entry.ccmrFamilyRole === 'direct').map((entry) => entry.familyId)).size;
      const challenge = new Set(families.filter((entry) => Number(entry.ccmrChallengeTier || 1) >= 2 && entry.ccmrFamilyRole === 'challenge').map((entry) => entry.familyId)).size;
      assert.ok(direct > 0 && direct % 5 === 0, `${code} has ${direct} direct ${framework} families, not whole sets of five`);
      assert.ok(challenge > 0 && challenge % 3 === 0, `${code} has ${challenge} challenge ${framework} families, not whole sets of three`);
      assert.equal(direct / 5, challenge / 3, `${code} has ${direct / 5} direct sets but ${challenge / 3} challenge sets`);
      assert.ok(families.every((entry) => entry.assessmentContext.framework === framework));
      assert.ok(families.every((entry) => !candidatesFor(code).includes(entry)), `${code} leaked ${framework} content into course candidates`);
    });
  });
});

// --- The package's own manifest agrees with the documents ------------------------------

test('the shipped manifest matches what the documents actually contain', async () => {
  const manifest = JSON.parse(await readFile(new URL('PATH_BANK_COVERAGE_MANIFEST.json', SEED_DIR), 'utf8'));
  const counted = {};
  SEED.forEach((entry) => {
    (entry.alignmentKeys || []).forEach((key) => {
      const code = String(key).replace(/^texas:/i, '').toUpperCase();
      counted[code] = (counted[code] || 0) + 1;
    });
  });
  // The manifest is generated by the build, so this asserts they cannot drift:
  // a hand-maintained manifest is a second claim about the bank that can
  // disagree with the bank.
  assert.equal(manifest.totals.documents, SEED.length);
  assert.equal(manifest.totals.standards, Object.keys(counted).length);
  Object.entries(counted).forEach(([code, count]) => {
    assert.ok(count >= MINIMUM_ISSUABLE_FAMILIES, `${code} has only ${count} families`);
    assert.equal(manifest.standards[code].familyCount, count, `${code} is miscounted in the manifest`);
  });
});

// --- The interaction gate ------------------------------------------------------
//
// The starter bank had 0 of 515 items on a real interaction: a student asked to
// "graph the parent function" typed a letter into a box. These tests pin the
// repair. They are deliberately about the STANDARDS that are an interaction,
// not about a raw count — a bank can hit any count by bolting graphs onto
// arithmetic, and that would be worse content, not better.

test('standards whose mathematics IS an interaction actually use the interaction', async () => {
  const { ALL_AUTHORED_STANDARDS } = await import('../../seed/pathQuestionBank/authoring/index.mjs');
  // Same list the build gate enforces, restated here so a silent edit to the
  // build script cannot quietly drop a standard out of the requirement.
  const required = [
    '8.4C', '8.5I', 'A.2C', 'A.2G', 'A.3A', 'A.3B', 'A.3C', 'A.6B', 'A.6C', 'A.7A', 'A.7C',
    'A.9D', 'A2.2A', 'A2.2B', 'A2.4C', 'A2.4D', 'A2.5A', 'A2.6A', 'A2.6C', 'A2.6G',
    '7.11A', 'A.2A', 'A.3D', 'A.5B', 'A.6A', 'A.9A', 'A2.4G', 'A2.4H', 'A2.6D', 'A2.6F',
    'A2.6K', 'A2.7I',
    '8.9', 'A.3F', 'A.3G', 'A.5C',
    '8.5G', 'A.12A', 'A2.2C',
    '8.8C', 'A.5A',
  ];
  const byCode = new Map(ALL_AUTHORED_STANDARDS.map((entry) => [entry.code, entry]));
  const missing = required.filter((code) => {
    const entry = byCode.get(code);
    return !entry || !entry.families.some((family) => Boolean(family.type));
  });
  assert.deepEqual(missing, [], 'these standards ask a student to type an answer the platform could have them build');
});

test('every tool-backed item declares a tool the server can actually grade', async () => {
  const { PATH_TOOL_IDS } = await import('../../functions/shared/pathToolContracts.mjs');
  const supported = new Set(PATH_TOOL_IDS);
  // functionGraph is a documented alias for functionInvestigation.
  supported.add('functionGraph');
  const { ALL_AUTHORED_STANDARDS } = await import('../../seed/pathQuestionBank/authoring/index.mjs');
  const unsupported = [];
  ALL_AUTHORED_STANDARDS.forEach((entry) => {
    entry.families.forEach((family) => {
      if (family.type && !supported.has(family.type)) unsupported.push(`${entry.code}/${family.id}: ${family.type}`);
    });
  });
  assert.deepEqual(unsupported, [], 'a tool with no contract must fail closed, so it must never be authored into the bank');
});

test('a tool-backed item never ships the answer inside its public payload', async () => {
  const { buildPublicToolPayload } = await import('../../functions/shared/pathToolContracts.mjs');
  const { ALL_AUTHORED_STANDARDS } = await import('../../seed/pathQuestionBank/authoring/index.mjs');
  const leaks = [];
  ALL_AUTHORED_STANDARDS.forEach((entry) => {
    entry.families.filter((family) => family.type).forEach((family) => {
      const payload = buildPublicToolPayload(family);
      if (!payload) return;
      const serialized = JSON.stringify(payload);
      // A number-line key, a systems solution, and a balance answer are the
      // three shapes that would give the whole question away.
      ['expectedIntervals', 'expectedNotation', 'expectedInequality', 'acceptedAnswers', '"answer"', '"solution"']
        .forEach((key) => { if (serialized.includes(key)) leaks.push(`${family.id}: ${key}`); });
    });
  });
  assert.deepEqual(leaks, [], 'the public tool payload is what the browser receives — no answer key belongs in it');
});
