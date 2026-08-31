#!/usr/bin/env node
// Certified Algebra I/II Path release-authority audit.
//
// The per-standard Fidelity V2 packages are the only authoring source of truth.
// drafts/algebra1.json and drafts/algebra2.json are generated compatibility
// mirrors. The two shipping seed locations must match the packages exactly.
// Legacy/general builders are allowed to exist only if they cannot overwrite
// the certified Algebra banks.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const stable = (docs) => JSON.stringify(docs || []);

const courses = [
  {
    id: 'algebra1',
    dir: 'drafts/fidelity-v2/algebra1',
    compatibility: 'drafts/algebra1.json',
    primary: 'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json',
    mirror: 'functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json',
    expectedStandards: 49,
    expectedDocs: 245,
  },
  {
    id: 'algebra2',
    dir: 'drafts/fidelity-v2/algebra2',
    compatibility: 'drafts/algebra2.json',
    primary: 'seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json',
    mirror: 'functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json',
    expectedStandards: 48,
    expectedDocs: 240,
  },
];

const loadCertified = (course) => {
  const files = readdirSync(course.dir)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const docs = files.flatMap((name) => readJson(join(course.dir, name)).documents || []);
  return { files, docs };
};

const redFlags = [];
console.log('# Certified Algebra I/II Path release authority audit\n');

for (const course of courses) {
  const { files, docs } = loadCertified(course);
  const compatibility = readJson(course.compatibility);
  const primary = readJson(course.primary);
  const mirror = readJson(course.mirror);

  const standardCountOk = files.length === course.expectedStandards;
  const docCountOk = docs.length === course.expectedDocs;
  const compatibilityOk = stable(compatibility.documents) === stable(docs);
  const primaryOk = stable(primary.documents) === stable(docs);
  const mirrorOk = stable(mirror.documents) === stable(docs);
  const mirrorsMatch = stable(primary.documents) === stable(mirror.documents);

  console.log(`## ${course.id}\n`);
  console.log(`Certified packages: ${files.length}/${course.expectedStandards}`);
  console.log(`Certified families: ${docs.length}/${course.expectedDocs}`);
  console.log(`Compatibility draft matches certified packages: ${compatibilityOk ? 'YES' : 'NO'}`);
  console.log(`Web seed matches certified packages: ${primaryOk ? 'YES' : 'NO'}`);
  console.log(`Functions seed matches certified packages: ${mirrorOk ? 'YES' : 'NO'}`);
  console.log(`Web and Functions seed mirrors match: ${mirrorsMatch ? 'YES' : 'NO'}\n`);

  if (!standardCountOk) redFlags.push(`${course.id}_standard_package_count`);
  if (!docCountOk) redFlags.push(`${course.id}_family_count`);
  if (!compatibilityOk) redFlags.push(`${course.id}_compatibility_drift`);
  if (!primaryOk) redFlags.push(`${course.id}_web_seed_drift`);
  if (!mirrorOk) redFlags.push(`${course.id}_functions_seed_drift`);
  if (!mirrorsMatch) redFlags.push(`${course.id}_seed_mirror_drift`);
}

const legacyAlgebraBuilder = readFileSync('scripts/build-algebra1-fidelity-v2-bank.mjs', 'utf8');
const genericBuilder = readFileSync('scripts/build-path-bank.mjs', 'utf8');
const certifiedBuilder = readFileSync('scripts/build-algebra-fidelity-v2-production-seeds.mjs', 'utf8');

const legacyDelegates = legacyAlgebraBuilder.includes('build-algebra-fidelity-v2-production-seeds.mjs')
  && !legacyAlgebraBuilder.includes("SOURCE = 'drafts/algebra1.json'");
const genericProtectsBoth = genericBuilder.includes("PROTECTED_CERTIFIED_COURSES = new Set(['algebra1', 'algebra2'])")
  && genericBuilder.includes('PROTECTED_CERTIFIED_COURSES.has(entryCourseId)');
const certifiedDeclaresPackages = certifiedBuilder.includes("drafts', 'fidelity-v2', 'algebra1")
  && certifiedBuilder.includes("drafts', 'fidelity-v2', 'algebra2")
  && certifiedBuilder.includes('compatibilityDraft');

console.log('## Builder authority\n');
console.log(`Legacy Algebra I command delegates to certified builder: ${legacyDelegates ? 'YES' : 'NO'}`);
console.log(`Generic Path builder protects both certified Algebra banks: ${genericProtectsBoth ? 'YES' : 'NO'}`);
console.log(`Certified builder declares per-standard package authority: ${certifiedDeclaresPackages ? 'YES' : 'NO'}\n`);

if (!legacyDelegates) redFlags.push('legacy_algebra1_builder_has_authority');
if (!genericProtectsBoth) redFlags.push('generic_path_builder_can_overwrite_algebra');
if (!certifiedDeclaresPackages) redFlags.push('certified_builder_source_not_explicit');

console.log('Red flags: ' + (redFlags.length ? redFlags.join(', ') : 'none'));
if (process.argv.includes('--strict') && redFlags.length) process.exitCode = 1;
