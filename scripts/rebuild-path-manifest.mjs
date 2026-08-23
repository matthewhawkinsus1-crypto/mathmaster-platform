#!/usr/bin/env node
// Rebuild the Path coverage manifest from the seed files that actually ship.
// Assessment banks live beside course banks, so the manifest records the two
// separately and cannot let exam-style content inflate ordinary course coverage.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const seedDir = path.join(root, 'seed', 'pathQuestionBank');
const outFile = path.join(seedDir, 'PATH_BANK_COVERAGE_MANIFEST.json');
const frameworkIds = ['course', 'digitalSAT', 'act', 'tsia2', 'asvab'];
const documentsIn = (p) => Array.isArray(p) ? p : (p.documents || p.items || p.questions || []);
const codeOf = (q) => String((q.alignmentKeys || []).find((k) => /^texas:/i.test(k)) || '').replace(/^texas:/i, '').toUpperCase();

const files = readdirSync(seedDir).filter((n) => n.endsWith('_pathQuestionBank_seed.json')).sort();
const docs = files.flatMap((name) => documentsIn(JSON.parse(readFileSync(path.join(seedDir, name), 'utf8'))));
const seen = new Set();
for (const q of docs) {
  if (!q?.id || seen.has(q.id)) throw new Error(`Missing or duplicate Path id: ${q?.id || '(blank)'}`);
  seen.add(q.id);
}

const frameworkOf = (q) => {
  const value = String(q?.assessmentContext?.framework || 'course');
  return frameworkIds.includes(value) ? value : 'course';
};
const frameworkStats = Object.fromEntries(frameworkIds.map((id) => [id, { documents: 0, standards: new Set() }]));
const standards = {};
for (const q of docs) {
  const code = codeOf(q);
  if (!code) throw new Error(`${q.id}: no Texas alignment`);
  const framework = frameworkOf(q);
  frameworkStats[framework].documents += 1;
  frameworkStats[framework].standards.add(code);
  standards[code] ||= { familyCount: 0, authored: 0, upgradedStarter: 0, courseFamilies: 0, assessmentFamilies: {} };
  const row = standards[code];
  row.familyCount += 1;
  if (q.authoring?.upgraded) row.upgradedStarter += 1;
  else row.authored += 1;
  if (framework === 'course') row.courseFamilies += 1;
  else row.assessmentFamilies[framework] = (row.assessmentFamilies[framework] || 0) + 1;
}

const courseStandards = frameworkStats.course.standards.size;
const assessmentDocuments = docs.length - frameworkStats.course.documents;
const manifest = {
  schemaVersion: 3,
  generatedBy: 'scripts/rebuild-path-manifest.mjs from actual bundled seed contents',
  totals: {
    documents: docs.length,
    standards: Object.keys(standards).length,
    courseDocuments: frameworkStats.course.documents,
    assessmentDocuments,
    authoredStandards: courseStandards,
    productionQualityStandards: courseStandards,
    upgradedStarterStandards: Object.values(standards).filter((row) => row.upgradedStarter > 0).length,
  },
  frameworks: Object.fromEntries(frameworkIds.map((id) => [id, {
    documents: frameworkStats[id].documents,
    standards: frameworkStats[id].standards.size,
  }])),
  standards: Object.fromEntries(Object.entries(standards).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))),
};
writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, outFile)} from ${docs.length} documents.`);
console.log(JSON.stringify(manifest.frameworks, null, 2));
