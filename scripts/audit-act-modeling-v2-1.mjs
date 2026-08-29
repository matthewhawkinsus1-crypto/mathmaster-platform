#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.MATHMASTER_ROOT || path.join(here, '..'));
const sourceRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'act');
const outPath = path.join(root, 'drafts', 'ccmr-v2.1', 'audit-results', 'act-modeling-latest.json');
const RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';
const REQUIRED_DOMAINS = ['preparingHigherMath', 'essentialSkills'];
const MIN_MODELING_RATE = 0.20;

const walk = (dir) => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const failures = [];
const warnings = [];
const documents = [];

if (!existsSync(sourceRoot)) {
  throw new Error(`Missing ACT V2.1 authoring root: ${path.relative(root, sourceRoot)}`);
}

for (const file of walk(sourceRoot).filter((entry) => entry.endsWith('.v2.1.json')).sort()) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${path.relative(root, file)}: invalid JSON: ${error.message}`);
    continue;
  }

  if (parsed?.framework !== 'act' || !Array.isArray(parsed?.documents)) continue;
  if (parsed?.releaseTarget !== RELEASE_TARGET) {
    failures.push(`${path.relative(root, file)}: wrong releaseTarget`);
    continue;
  }

  for (const doc of parsed.documents) {
    documents.push({
      ...doc,
      __file: path.relative(root, file),
      __domainId: parsed.domainId || doc?.assessmentContext?.domainId || 'unknown',
      __scopeId: parsed.nativeSkillId || parsed.standard || doc?.assessmentContext?.nativeSkillId || 'unknown',
    });
  }
}

const modeling = documents.filter((doc) => doc?.assessmentContext?.modeling === true);
const modelingRate = documents.length ? modeling.length / documents.length : 0;
const minimumRequired = Math.ceil(documents.length * MIN_MODELING_RATE);

const byDomain = {};
const modelingByDomain = {};
const modelingByScope = {};
const modelingTaskTypes = {};

for (const doc of documents) {
  const domain = doc.__domainId;
  byDomain[domain] = (byDomain[domain] || 0) + 1;
}

for (const doc of modeling) {
  const domain = doc.__domainId;
  const scopeKey = `${domain}:${doc.__scopeId}`;
  const taskType = String(doc?.taskType || 'unspecified');
  modelingByDomain[domain] = (modelingByDomain[domain] || 0) + 1;
  modelingByScope[scopeKey] = (modelingByScope[scopeKey] || 0) + 1;
  modelingTaskTypes[taskType] = (modelingTaskTypes[taskType] || 0) + 1;

  if (!REQUIRED_DOMAINS.includes(domain)) {
    failures.push(`${doc.id}: Modeling must overlap Preparing for Higher Math or Integrating Essential Skills; found domain ${domain}`);
  }
}

if (!documents.length) failures.push('No ACT V2.1 bank documents were found.');
for (const domain of REQUIRED_DOMAINS) {
  if (!byDomain[domain]) failures.push(`${domain}: no ACT V2.1 content found`);
  if (!modelingByDomain[domain]) failures.push(`${domain}: no Modeling-tagged ACT V2.1 families found`);
}
if (modeling.length < minimumRequired) {
  failures.push(`ACT Modeling coverage is ${(modelingRate * 100).toFixed(1)}%; at least ${(MIN_MODELING_RATE * 100).toFixed(0)}% is required (${minimumRequired} of ${documents.length} families).`);
}

// Modeling is a cross-cutting reporting category. These are diagnostic warnings,
// not invented blueprint quotas: they help us spot a bank where one skill area
// is carrying nearly all of the modeling work even though the total percentage passes.
const scopesWithModeling = Object.keys(modelingByScope).length;
if (scopesWithModeling < 4) {
  warnings.push(`Modeling appears in only ${scopesWithModeling} ACT skill areas; review breadth across mathematical topics.`);
}

const summary = {
  schemaVersion: 1,
  releaseTarget: RELEASE_TARGET,
  framework: 'act',
  audit: 'cross-cutting-modeling',
  officialBlueprint: {
    minimumRate: MIN_MODELING_RATE,
    relationship: 'Modeling overlaps Preparing for Higher Math and Integrating Essential Skills; it is not a separate content silo.',
    constructs: ['producing models', 'interpreting models', 'understanding models', 'evaluating models', 'improving models'],
  },
  documents: documents.length,
  modelingTagged: modeling.length,
  modelingRate,
  minimumRequired,
  domains: byDomain,
  modelingByDomain,
  modelingByScope,
  modelingTaskTypes,
  scopesWithModeling,
  failures,
  warnings,
};

writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
