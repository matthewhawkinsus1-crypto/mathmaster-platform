#!/usr/bin/env node
// Compile the authored My Math Path families into the secure seed packages.
//
//   node scripts/build-path-bank.mjs            build and report
//   node scripts/build-path-bank.mjs --check    report only; write nothing
//
// WHAT THIS EXISTS TO PREVENT. The previous seed files were written by hand and
// checked by eye. Every one of the 515 documents was structurally valid, and
// the collection was still not a learning experience: no interactions, no
// solution reviews, and five near-identical items per standard. Neither the
// author nor the reviewer could see that from the JSON.
//
// So the build runs the SAME two gates production runs:
//
//   1. `buildIssuePlan` — would the server issue this at all? An item that
//      fails here would be silently dropped from coverage, so it fails the
//      build instead.
//   2. `analyzeStandardContent` — is the standard actually finished? Counts,
//      representations, kinds of thinking, DOK and difficulty spread, solution
//      reviews, duplicate families.
//
// The report prints one line per standard, so "97 standards ready" can never
// again mean "97 standards have five text boxes".

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { analyzeStandardContent, CONTENT_STATE, CONTENT_STATE_LABELS } from '../functions/shared/pathStandardQuality.mjs';
import { auditPathQuestionQuality, QUESTION_QUALITY } from '../functions/shared/pathQuestionQuality.mjs';
import { courseOf } from '../seed/pathQuestionBank/authoring/kit.mjs';
import { ALL_AUTHORED_STANDARDS } from '../seed/pathQuestionBank/authoring/index.mjs';
import { upgradeLegacyBank } from '../seed/pathQuestionBank/authoring/legacyUpgrade.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../functions/lib/mathPath.js');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SEED_DIRS = [join(root, 'seed', 'pathQuestionBank'), join(root, 'functions', 'seeds', 'pathQuestionBank')];

const checkOnly = process.argv.includes('--check');

const COURSE_FILES = {
  algebra1: 'algebra1_pathQuestionBank_seed.json',
  algebra2: 'algebra2_pathQuestionBank_seed.json',
  grade8: 'grade8_pathQuestionBank_seed.json',
  grade7: 'grade7_pathQuestionBank_seed.json',
  grade6: 'grade6_pathQuestionBank_seed.json',
};

const PROTECTED_CERTIFIED_COURSES = new Set(['algebra1', 'algebra2']);
// Algebra I/II are released only by
// scripts/build-algebra-fidelity-v2-production-seeds.mjs. This generic builder
// may audit/build the other courses, but it must never compile the legacy
// Algebra authoring modules back over the certified shipping banks.

const pad = (value, width) => String(value).padEnd(width, ' ');

async function main() {
  const byCourse = new Map();
  const problems = [];
  const standardRows = [];
  const seenIds = new Set();

// Standards whose mathematics IS an interaction the platform already renders.
//
// This list is not "standards where a tool would be nice". It is the set where
// typing a value into a box replaces the assessed act — graphing, placing a
// solution set on a line, finding an intersection, mapping a relation, or
// working an equation step by step. Everything else stays free to use whichever
// interaction fits the individual question.
const INTERACTION_REQUIRED = new Set([
  // Graph it.
  '8.4C', '8.5I', 'A.2C', 'A.2G', 'A.3A', 'A.3B', 'A.3C', 'A.6B', 'A.6C', 'A.7A', 'A.7C',
  'A.9D', 'A2.2A', 'A2.2B', 'A2.4C', 'A2.4D', 'A2.5A', 'A2.6A', 'A2.6C', 'A2.6G',
  // Place it on a number line.
  '7.11A', 'A.2A', 'A.3D', 'A.5B', 'A.6A', 'A.9A', 'A2.4G', 'A2.4H', 'A2.6D', 'A2.6F',
  'A2.6K', 'A2.7I',
  // Find where the lines meet.
  '8.9', 'A.3F', 'A.3G', 'A.5C',
  // Map the relation.
  '8.5G', 'A.12A', 'A2.2C',
  // Work the equation on the balance.
  '8.8C', 'A.5A',
]);

  for (const entry of ALL_AUTHORED_STANDARDS) {
    const { code, families } = entry;
    const entryCourseId = courseOf(code);
    if (PROTECTED_CERTIFIED_COURSES.has(entryCourseId)) continue;
    const plans = {};

    for (const question of families) {
      if (seenIds.has(question.id)) problems.push(`${code}: duplicate bank id ${question.id}`);
      seenIds.add(question.id);

      // Gate 1 — the production issuer.
      // eslint-disable-next-line no-await-in-loop
      const plan = await mathPath.buildIssuePlan(question);
      plans[question.id] = plan;
      if (!plan.issuable) {
        problems.push(`${code}/${question.id}: the server would refuse to issue this (${plan.reason}).`);
      }

      // Gate 2 — the question-level audit.
      const audit = auditPathQuestionQuality(question);
      audit.blockers.forEach((issue) => {
        problems.push(`${code}/${question.id}: ${issue.message}`);
      });
      if (audit.level !== QUESTION_QUALITY.PRODUCTION) {
        problems.push(`${code}/${question.id}: not production quality (${audit.warnings.map((issue) => issue.code).join(', ') || 'unknown'}).`);
      }
      // An expression answer with no alternate forms will fail a student who
      // wrote the same thing a different way. The server has no CAS, so this is
      // the author's responsibility and the build says so.
      (question.responseFields || []).forEach((field) => {
        if (['expression', 'equation'].includes(field.inputProfile) && !(field.accepted || []).length) {
          problems.push(`${code}/${question.id}: field "${field.id}" takes a written expression but lists no equivalent forms.`);
        }
      });

      const courseId = courseOf(code);
      if (!byCourse.has(courseId)) byCourse.set(courseId, []);
      byCourse.get(courseId).push(question);
    }

    const analysis = analyzeStandardContent({ displayCode: code, items: families, plans });
    standardRows.push({ code, analysis });
    if (analysis.state !== CONTENT_STATE.PRODUCTION_READY) {
      problems.push(`${code}: standard is ${CONTENT_STATE_LABELS[analysis.state]} — ${[...analysis.blockers, ...analysis.warnings].join(' ')}`);
    }

    // Gate 3 — the interaction gate.
    //
    // Some standards ARE the interaction. "Graph the parent function", "graph
    // the solution set", "estimate the intersection graphically", "identify
    // functions using mappings" — for these, asking a student to type an answer
    // into a box measures whether they can recall a rule, not whether they can
    // do the thing the standard names. The tool exists; a standard in this list
    // has to use it at least once.
    if (INTERACTION_REQUIRED.has(code) && analysis.toolBackedCount === 0) {
      problems.push(
        `${code}: this standard is about an interaction the platform already has a tool for, `
        + 'but every family asks for a typed answer. Convert at least one family to the real interaction.',
      );
    }
  }

  // --- Report -----------------------------------------------------------------
  console.log('\nMy Math Path authored content\n');
  console.log(`${pad('Standard', 10)}${pad('Fam', 5)}${pad('Prod', 6)}${pad('Reps', 6)}${pad('Tasks', 7)}${pad('Bands', 8)}${pad('DOK', 8)}${pad('Tools', 7)}State`);
  console.log('-'.repeat(96));
  standardRows.forEach(({ code, analysis }) => {
    console.log(
      pad(code, 10)
      + pad(analysis.issuableCount, 5)
      + pad(analysis.productionCount, 6)
      + pad(analysis.productionRepresentations.length, 6)
      + pad(analysis.productionTaskTypes.length, 7)
      + pad(analysis.bands.join(','), 8)
      + pad(analysis.dokLevels.join(','), 8)
      + pad(analysis.toolBackedCount, 7)
      + CONTENT_STATE_LABELS[analysis.state],
    );
  });

  // --- The starter bank, for standards nobody has authored yet -----------------
  //
  // Authored families REPLACE the starter items for their standard. Everywhere
  // else the starter items are carried forward in their upgraded form, so no
  // standard loses the content it had — but they are reported separately,
  // because "a session will run" and "a session is worth running" are not the
  // same claim.
  const authoredCodes = new Set(ALL_AUTHORED_STANDARDS.map((entry) => String(entry.code).toUpperCase()));
  const legacyRows = [];
  let carriedForward = 0;

  for (const [courseId, fileName] of Object.entries(COURSE_FILES)) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(root, 'seed', 'pathQuestionBank', 'legacy', fileName), 'utf8'));
    } catch {
      continue;
    }
    const upgraded = upgradeLegacyBank(raw.documents || []);
    const byStandard = new Map();
    upgraded.forEach((question) => {
      const code = String((question.alignmentKeys || [])[0] || '').replace(/^texas:/i, '').toUpperCase();
      if (!code || authoredCodes.has(code)) return;
      if (seenIds.has(question.id)) return;
      if (!byStandard.has(code)) byStandard.set(code, []);
      byStandard.get(code).push(question);
    });

    for (const [code, questions] of byStandard.entries()) {
      const plans = {};
      for (const question of questions) {
        // eslint-disable-next-line no-await-in-loop
        const plan = await mathPath.buildIssuePlan(question);
        plans[question.id] = plan;
        if (!plan.issuable) {
          problems.push(`${code}/${question.id}: upgraded starter item is not issuable (${plan.reason}).`);
          continue;
        }
        const audit = auditPathQuestionQuality(question);
        // A starter item is allowed to be unpolished. It is NOT allowed to still
        // be asking for a typed letter — that is what the upgrade exists to fix,
        // and a survivor means the parser missed a shape.
        audit.blockers.forEach((issue) => {
          problems.push(`${code}/${question.id}: upgraded starter item still has a blocker — ${issue.message}`);
        });
        seenIds.add(question.id);
        if (!byCourse.has(courseId)) byCourse.set(courseId, []);
        byCourse.get(courseId).push(question);
        carriedForward += 1;
      }
      legacyRows.push({ code, analysis: analyzeStandardContent({ displayCode: code, items: questions, plans }) });
    }
  }

  if (legacyRows.length) {
    console.log(`\nStarter standards carried forward (upgraded, not yet authored): ${legacyRows.length}`);
    const states = legacyRows.reduce((acc, row) => {
      acc[row.analysis.state] = (acc[row.analysis.state] || 0) + 1;
      return acc;
    }, {});
    Object.entries(states).forEach(([state, count]) => console.log(`  ${CONTENT_STATE_LABELS[state]}: ${count}`));
    console.log(`  ${carriedForward} starter questions kept so no standard loses its practice content.`);
  }

  // --- Is the correct option in a predictable place? ---------------------------
  //
  // The starter bank answered "yes": 460 of 472 choice items had the correct
  // option first. An item a student can answer by position measures nothing, so
  // this is a build gate rather than a note.
  const positions = new Map();
  let choiceItems = 0;
  [...byCourse.values()].flat().forEach((question) => {
    if (!(question.choices || []).length) return;
    const expected = String((question.responseFields || [])[0]?.expected ?? '');
    positions.set(expected, (positions.get(expected) || 0) + 1);
    choiceItems += 1;
  });
  if (choiceItems >= 20) {
    const worst = Math.max(...positions.values());
    const share = worst / choiceItems;
    console.log(`\nCorrect-option positions across ${choiceItems} choice items: ${[...positions.entries()].sort().map(([key, count]) => `${key}×${count}`).join(' · ')}`);
    if (share > 0.4) {
      problems.push(`${Math.round(share * 100)}% of multiple-choice items have the correct option in the same position. A student can answer those by position rather than by mathematics.`);
    }
  }

  const totals = [...byCourse.entries()].map(([courseId, items]) => `${courseId}: ${items.length}`).join(' · ');
  console.log(`\n${standardRows.length} standards · ${seenIds.size} questions · ${totals}`);
  const ready = standardRows.filter(({ analysis }) => analysis.state === CONTENT_STATE.PRODUCTION_READY).length;
  console.log(`${ready} of ${standardRows.length} authored standards are production quality.`);

  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    problems.slice(0, 80).forEach((line) => console.log(`  - ${line}`));
    if (problems.length > 80) console.log(`  … and ${problems.length - 80} more.`);
    process.exitCode = 1;
    if (!checkOnly) {
      console.log('\nNothing was written. A half-good bank is harder to fix than a missing one.');
      return;
    }
  }

  if (checkOnly) return;

  // --- Write ------------------------------------------------------------------
  // The middle-school prerequisite package is merged into the file the
  // installer already knows about, so an existing deployment does not need a
  // new import step to gain prerequisite content.
  for (const [courseId, documents] of byCourse.entries()) {
    const fileName = COURSE_FILES[courseId];
    if (!fileName) throw new Error(`No seed file mapped for course ${courseId}`);
    const payload = {
      schemaVersion: 1,
      targetCollection: 'pathQuestionBank',
      courseId,
      generatedBy: 'scripts/build-path-bank.mjs',
      documents: documents.sort((a, b) => a.id.localeCompare(b.id)),
    };
    SEED_DIRS.forEach((directory) => {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, fileName), `${JSON.stringify(payload, null, 2)}\n`);
    });
    console.log(`Wrote ${fileName} (${documents.length} documents) to both seed directories.`);
  }

  // The manifest travels with the package so a human importing it can see what
  // they are importing without parsing 600 documents. Generated, never
  // hand-maintained: a hand-maintained manifest is a second claim about the
  // bank that can disagree with the bank.
  const protectedCertifiedDocuments = [...PROTECTED_CERTIFIED_COURSES].flatMap((courseId) => {
    const fileName = COURSE_FILES[courseId];
    const current = JSON.parse(readFileSync(join(root, 'seed', 'pathQuestionBank', fileName), 'utf8'));
    return current.documents || [];
  });
  const allDocuments = [...byCourse.values()].flat().concat(protectedCertifiedDocuments);
  const perStandard = {};
  allDocuments.forEach((question) => {
    (question.alignmentKeys || []).forEach((key) => {
      const code = String(key).replace(/^texas:/i, '').toUpperCase();
      if (!perStandard[code]) perStandard[code] = { familyCount: 0, authored: 0, upgradedStarter: 0 };
      perStandard[code].familyCount += 1;
      if (question.authoring?.upgraded) perStandard[code].upgradedStarter += 1;
      else perStandard[code].authored += 1;
    });
  });
  const manifest = {
    schemaVersion: 2,
    generatedBy: 'scripts/build-path-bank.mjs',
    totals: {
      documents: allDocuments.length,
      standards: Object.keys(perStandard).length,
      authoredStandards: standardRows.length,
      productionQualityStandards: ready,
      upgradedStarterStandards: legacyRows.length,
    },
    standards: Object.fromEntries(Object.entries(perStandard).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))),
  };
  writeFileSync(
    join(root, 'seed', 'pathQuestionBank', 'PATH_BANK_COVERAGE_MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log('Wrote PATH_BANK_COVERAGE_MANIFEST.json.');

  // Keep the Cloud Functions loader's file list honest.
  const loaderPath = join(root, 'functions', 'index.js');
  const loader = readFileSync(loaderPath, 'utf8');
  [...byCourse.keys()].forEach((courseId) => {
    if (!loader.includes(COURSE_FILES[courseId])) {
      console.log(`\n⚠ functions/index.js does not list ${COURSE_FILES[courseId]} in STARTER_SEED_FILES. Add it, or the starter import will skip it.`);
      process.exitCode = 1;
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
