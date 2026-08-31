#!/usr/bin/env node
// Build the shipping Algebra I and Algebra II Path seeds from the CERTIFIED
// Fidelity V2 standard packages.
//
// Source of truth:
//   drafts/fidelity-v2/algebra1/*.json
//   drafts/fidelity-v2/algebra2/*.json
//
// Mirrors written:
//   seed/pathQuestionBank/{algebra1,algebra2}_pathQuestionBank_seed.json
//   functions/seeds/pathQuestionBank/{algebra1,algebra2}_pathQuestionBank_seed.json
//
// Usage:
//   node scripts/build-algebra-fidelity-v2-production-seeds.mjs
//   node scripts/build-algebra-fidelity-v2-production-seeds.mjs --check
//
// The builder refuses to promote a bank unless every standard:
// - has exactly five Fidelity V2 families;
// - has unique family/question ids;
// - retains its Texas alignment and assessed construct;
// - contains the preferred adaptive cells 2/2, 2/3, 2/4, 3/3, 3/4
//   across the base family plus any authored variants.
//
// Qualitative Challenge depth is additionally enforced by
// scripts/audit-challenge-quality-v2.mjs --strict in the promotion workflow.

import {
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const checkOnly = process.argv.includes('--check');

const COURSES = [
  {
    courseId: 'algebra1',
    label: 'Algebra I',
    dir: path.join(root, 'drafts', 'fidelity-v2', 'algebra1'),
    expectedStandards: 49,
    expectedDocuments: 245,
    seedName: 'algebra1_pathQuestionBank_seed.json',
    compatibilityDraft: 'algebra1.json',
  },
  {
    courseId: 'algebra2',
    label: 'Algebra II',
    dir: path.join(root, 'drafts', 'fidelity-v2', 'algebra2'),
    expectedStandards: 48,
    expectedDocuments: 240,
    seedName: 'algebra2_pathQuestionBank_seed.json',
    compatibilityDraft: 'algebra2.json',
  },
];

const REQUIRED_CELLS = new Set(['2:2', '2:3', '2:4', '3:3', '3:4']);

const parse = (file) => JSON.parse(readFileSync(file, 'utf8'));
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

const cellOf = (dok, band) => {
  const d = Number(dok);
  const b = Number(band);
  if (!Number.isFinite(d) || !Number.isFinite(b)) return null;
  return `${d}:${b}`;
};

const authoredCells = (doc) => {
  const cells = new Set();
  const base = cellOf(doc.dok, doc.difficultyBand);
  if (base) cells.add(base);
  for (const variant of doc.variants || []) {
    const cell = cellOf(
      variant.dok ?? doc.dok,
      variant.difficultyBand ?? doc.difficultyBand,
    );
    if (cell) cells.add(cell);
  }
  return cells;
};

const loadCourse = (course) => {
  const files = readdirSync(course.dir)
    .filter((name) => name.endsWith('.json'))
    .sort(natural);

  if (files.length !== course.expectedStandards) {
    throw new Error(
      `${course.label}: expected ${course.expectedStandards} standard packages, found ${files.length}.`,
    );
  }

  const ids = new Set();
  const familyIds = new Set();
  const standards = new Set();
  const documents = [];

  for (const file of files) {
    const payload = parse(path.join(course.dir, file));
    const standard = String(payload.standard || '').trim();
    if (!standard) throw new Error(`${course.label}/${file}: missing standard code.`);
    if (standards.has(standard)) throw new Error(`${course.label}: duplicate standard package ${standard}.`);
    standards.add(standard);

    const families = Array.isArray(payload.documents) ? payload.documents : [];
    if (families.length !== 5) {
      throw new Error(`${standard}: expected exactly five Fidelity V2 families; found ${families.length}.`);
    }

    const cells = new Set();
    for (const doc of families) {
      if (!doc?.id) throw new Error(`${standard}: family missing id.`);
      if (!doc?.familyId) throw new Error(`${doc.id}: familyId missing.`);
      if (ids.has(doc.id)) throw new Error(`${course.label}: duplicate id ${doc.id}.`);
      if (familyIds.has(doc.familyId)) throw new Error(`${course.label}: duplicate familyId ${doc.familyId}.`);
      ids.add(doc.id);
      familyIds.add(doc.familyId);

      if (doc.assessedConstruct !== standard) {
        throw new Error(`${doc.id}: assessedConstruct ${doc.assessedConstruct} does not match ${standard}.`);
      }
      if (!(doc.alignmentKeys || []).includes(`texas:${standard}`)) {
        throw new Error(`${doc.id}: missing texas:${standard} alignment.`);
      }
      if (!String(doc.id).includes('_v2_') || !String(doc.familyId).includes(':v2-')) {
        throw new Error(`${doc.id}: shipping Fidelity V2 family lacks the V2 identity marker.`);
      }

      for (const cell of authoredCells(doc)) cells.add(cell);
      documents.push(doc);
    }

    const missing = [...REQUIRED_CELLS].filter((cell) => !cells.has(cell));
    if (missing.length) {
      throw new Error(`${standard}: missing preferred adaptive cells ${missing.join(', ')}.`);
    }
  }

  if (standards.size !== course.expectedStandards) {
    throw new Error(
      `${course.label}: expected ${course.expectedStandards} standards, found ${standards.size}.`,
    );
  }
  if (documents.length !== course.expectedDocuments) {
    throw new Error(
      `${course.label}: expected ${course.expectedDocuments} documents, found ${documents.length}.`,
    );
  }

  return { documents, standards };
};

let drift = 0;

for (const course of COURSES) {
  const { documents, standards } = loadCourse(course);
  const payload = {
    schemaVersion: 1,
    targetCollection: 'pathQuestionBank',
    courseId: course.courseId,
    generatedBy: `MathMaster ${course.label} certified Fidelity V2 source — drafts/fidelity-v2/${course.courseId}`,
    documents,
  };
  const rendered = `${JSON.stringify(payload, null, 2)}\n`;
  // drafts/algebra{1,2}.json predate the per-standard Fidelity V2 packages.
  // Keep them only as generated compatibility mirrors so older diagnostics and
  // scripts cannot disagree with the certified source of truth.
  const compatibilityPayload = { documents };
  const compatibilityRendered = `${JSON.stringify(compatibilityPayload, null, 2)}\n`;
  const compatibilityPath = path.join(root, 'drafts', course.compatibilityDraft);

  const mirrors = [
    path.join(root, 'seed', 'pathQuestionBank', course.seedName),
    path.join(root, 'functions', 'seeds', 'pathQuestionBank', course.seedName),
  ];

  if (checkOnly) {
    const compatibility = parse(compatibilityPath);
    if (JSON.stringify(compatibility.documents || []) !== JSON.stringify(documents)) {
      drift += 1;
      console.error(`✗ ${path.relative(root, compatibilityPath)} drifts from certified Fidelity V2 source`);
    } else {
      console.log(`✓ ${path.relative(root, compatibilityPath)} matches certified Fidelity V2 source`);
    }

    for (const mirror of mirrors) {
      const current = parse(mirror);
      const sameDocuments = JSON.stringify(current.documents || []) === JSON.stringify(documents);
      const correctCourse = current.courseId === course.courseId;
      if (!sameDocuments || !correctCourse) {
        drift += 1;
        console.error(`✗ ${path.relative(root, mirror)} drifts from certified Fidelity V2 source`);
      } else {
        console.log(`✓ ${path.relative(root, mirror)} matches certified Fidelity V2 source`);
      }
    }
  } else {
    writeFileSync(compatibilityPath, compatibilityRendered);
    console.log(`Wrote ${path.relative(root, compatibilityPath)} compatibility mirror`);
    for (const mirror of mirrors) {
      writeFileSync(mirror, rendered);
      console.log(`Wrote ${path.relative(root, mirror)}`);
    }
  }

  console.log(
    `${course.label}: ${documents.length} families · ${standards.size} standards · preferred adaptive cells complete`,
  );
}

if (checkOnly && drift) {
  console.error(`\n${drift} shipping seed mirror(s) are stale.`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log('\nAll Algebra I / Algebra II shipping seed mirrors match the certified Fidelity V2 source.');
}
