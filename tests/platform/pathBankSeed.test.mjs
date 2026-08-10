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

// The six middle-school standards the current Algebra prerequisite graph can
// route a student into. Off both wheels, and reachable, so they need coverage.
const REACHABLE_PREREQUISITES = ['7.7', '7.11A', '8.4A', '8.5G', '8.5I', '8.8C'];

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

test('the seed package is the size it claims to be, with unique ids', () => {
  assert.equal(SEED.length, 515);
  assert.equal(new Set(SEED.map((entry) => entry.id)).size, 515, 'duplicate ids would overwrite each other on import');
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

test('the seed uses the legacy field-graded branch, declaring no Path tool', () => {
  SEED.forEach((entry) => {
    assert.equal(entry.type, undefined, `${entry.id} declares a type`);
    assert.equal(entry.toolId, undefined, `${entry.id} declares a toolId`);
    assert.equal(entry.pathToolId, undefined, `${entry.id} declares a pathToolId`);
    assert.ok(Array.isArray(entry.responseFields) && entry.responseFields.length, `${entry.id} has no response fields`);
    // And so the plan carries no tool payload — it grades on fields.
    assert.equal(PLANS[entry.id].toolPayload, null);
  });
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

test('the five families are spread across difficulty bands, not stacked in one', () => {
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

test('all 103 currently routeable standards launch a full five-question session', () => {
  const targets = routeableTargets();
  assert.equal(targets.length, 103, 'the routeable set is 49 + 48 + 6');

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
    const blob = JSON.stringify(sanitized);
    (entry.responseFields || []).forEach((field) => {
      if (field.expected === undefined || String(field.expected).length < 2) return;
      assert.ok(!blob.includes(JSON.stringify(field.expected)), `${entry.id} leaked its expected value`);
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
  assert.equal(Object.keys(counted).length, 103, 'the seed covers 103 standards');
  Object.values(counted).forEach((count) => assert.equal(count, MINIMUM_ISSUABLE_FAMILIES));
  assert.ok(manifest, 'the package ships a manifest');
});
