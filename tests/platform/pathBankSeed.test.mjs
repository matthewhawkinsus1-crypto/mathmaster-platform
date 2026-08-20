import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  MINIMUM_ISSUABLE_FAMILIES, buildCoverageIndex, summarizeCoverage,
} from '../../functions/shared/pathCoverage.mjs';
import { recordFamilyUse, selectNextFamily } from '../../functions/shared/pathQuestionSelection.mjs';
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
    // eslint-disable-next-line no-await-in-loop
    plans[document.id] = await mathPath.buildIssuePlan(document);
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
  // The bank now contains both kinds. What must never happen is a third kind:
  // an item that names a tool with no contract, which would fail closed and be
  // silently dropped from coverage.
  SEED.forEach((entry) => {
    const plan = PLANS[entry.id];
    if (plan.toolPayload) {
      assert.ok(entry.type || entry.toolId || entry.pathToolId, `${entry.id} has a tool payload but declares no tool`);
      assert.ok(plan.privateGrading?.pathToolId, `${entry.id} has no server grader`);
    } else {
      assert.equal(entry.type, undefined, `${entry.id} declares a type with no contract`);
      assert.equal(entry.toolId, undefined, `${entry.id} declares a toolId with no contract`);
      assert.equal(entry.pathToolId, undefined, `${entry.id} declares a pathToolId with no contract`);
      assert.ok(Array.isArray(entry.responseFields) && entry.responseFields.length, `${entry.id} has no response fields`);
    }
  });
});

test('no document asks a student to type the letter of an option', () => {
  // The single worst defect in the original starter bank, and the one the
  // upgrade exists to remove. Checked over the WHOLE bank rather than the
  // authored part, because the starter items are what a student meets on any
  // standard nobody has authored yet.
  const offenders = SEED.filter((entry) => /type\s+(?:a|the letter)\b/i.test(entry.prompt || '')
    || /(^|\n)\s*[A-D]\s*\)\s+\S/m.test(entry.prompt || ''));
  assert.deepEqual(offenders.map((entry) => entry.id), []);
});

test('a multiple-choice item ships real selectable options', () => {
  const choiceItems = SEED.filter((entry) => (entry.responseFields || [])
    .some((field) => field.inputProfile === 'choice'));
  // Deliberately not a fixed count. As standards are authored, hand-written
  // families replace starter items and many of them are numeric, symbolic or
  // tool-backed rather than multiple choice — so this number FALLING is a sign
  // of progress, not a regression. What must hold is that every choice item is
  // answerable.
  assert.ok(choiceItems.length > 0, 'the bank should contain multiple-choice items');
  choiceItems.forEach((entry) => {
    assert.ok((entry.choices || []).length >= 2, `${entry.id} has a choice input but no options`);
    const expected = String(entry.responseFields[0].expected);
    assert.ok(entry.choices.some((choice) => choice.id === expected), `${entry.id}'s expected answer is not one of its options`);
  });
});

test('the correct option is not always in the same place', () => {
  // 460 of 472 starter items had the correct option first. A student learns
  // that in three questions, and from then on the item measures nothing.
  const counts = new Map();
  let total = 0;
  SEED.forEach((entry) => {
    if (!(entry.choices || []).length) return;
    const expected = String(entry.responseFields[0].expected);
    counts.set(expected, (counts.get(expected) || 0) + 1);
    total += 1;
  });
  const worstShare = Math.max(...counts.values()) / total;
  assert.ok(worstShare <= 0.4, `${Math.round(worstShare * 100)}% of choice items share one answer position`);
});

// --- Coverage, computed from the documents rather than from the manifest -------------

const coverageFor = (courseId) => buildCoverageIndex({
  courseId,
  wheelTeks: getWheelTeksForCourse(courseId),
  bankItems: SEED,
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

const candidatesFor = (code) => SEED.filter((entry) => (
  entry.active !== false
  && (entry.alignmentKeys || []).some((key) => String(key).replace(/^texas:/i, '').toUpperCase() === code.toUpperCase())
  && PLANS[entry.id]?.issuable
));

test('every routeable standard launches a full five-question session', () => {
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
        const choice = selectNextFamily(candidates, { preferredBand: rigor.preferredDifficultyBand, usage });
        if (!choice) { failures.push({ code, courseLevel, reason: 'selector_returned_nothing' }); return; }
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
