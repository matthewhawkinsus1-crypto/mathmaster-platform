#!/usr/bin/env node
// Algebra I TEKS Fidelity V2 — course-wide forensic audit.
// Read-only. This script inspects the compiled student-facing bank rather than
// trusting authoring-source appearances. It supplements, rather than replaces,
// the existing Path quality gates.

import { readFileSync } from 'node:fs';

const BANK = 'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json';
const parsed = JSON.parse(readFileSync(BANK, 'utf8'));
const docs = (parsed.documents || []).filter((doc) => doc.active !== false);

const codeOf = (doc) => {
  const key = (doc.alignmentKeys || []).find((entry) => String(entry).startsWith('texas:')) || '';
  return String(key).replace(/^texas:/, '') || doc.assessedConstruct || 'unknown';
};

const groups = new Map();
for (const doc of docs) {
  const code = codeOf(doc);
  if (!groups.has(code)) groups.set(code, []);
  groups.get(code).push(doc);
}

const uniq = (values) => [...new Set(values.filter((v) => v !== null && v !== undefined && v !== ''))];
const text = (value) => String(value || '').toLowerCase();
const hasGenerator = (doc) => Boolean(doc.generator && (doc.generator.parameters || doc.generator.derived));
const hasChoice = (doc) => Array.isArray(doc.options) || Array.isArray(doc.choices);
const reviewDepth = (doc) => {
  const review = doc.solutionReview || {};
  return Array.isArray(review.reasoning) ? review.reasoning.length : 0;
};
const genericCoaching = (doc) => {
  const joined = [...(doc.attemptFeedback || []), ...(doc.supportHints || [])].join(' ').toLowerCase();
  const generic = [
    'use the given information to identify the relationship before computing',
    'name what each number represents',
    'choose the operation or relationship that connects them',
  ];
  return generic.some((phrase) => joined.includes(phrase));
};
const leakage = (doc) => {
  const raw = JSON.stringify(doc).toLowerCase();
  return /correct[-_ ]?answer|asvab-correct|choice-correct|option-correct/.test(raw);
};
const taskSignature = (doc) => [
  doc.taskType || 'unknown',
  doc.representation || 'unknown',
  doc.questionType || 'unknown',
].join('|');

const rows = [];
for (const [code, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
  const generators = items.filter(hasGenerator).length;
  const representations = uniq(items.map((d) => d.representation));
  const tasks = uniq(items.map((d) => d.taskType));
  const doks = uniq(items.map((d) => Number(d.dok)).filter(Number.isFinite)).sort();
  const bands = uniq(items.map((d) => Number(d.difficultyBand)).filter(Number.isFinite)).sort();
  const signatures = uniq(items.map(taskSignature));
  const shallowReviews = items.filter((d) => reviewDepth(d) < 2).length;
  const noHints = items.filter((d) => !(d.supportHints || []).length).length;
  const generic = items.filter(genericCoaching).length;
  const leaks = items.filter(leakage).length;
  const choices = items.filter(hasChoice).length;

  const flags = [];
  if (items.length < 5) flags.push('fewer-than-5-families');
  if (generators < Math.min(5, items.length)) flags.push('static-or-partly-static');
  if (representations.length < 3) flags.push('thin-representation');
  if (tasks.length < 3) flags.push('thin-task-diversity');
  if (doks.length < 2) flags.push('single-DOK');
  if (bands.length < 2) flags.push('single-band');
  if (signatures.length < Math.min(4, items.length)) flags.push('repeated-task-shape');
  if (generic >= Math.ceil(items.length / 2)) flags.push('generic-coaching-heavy');
  if (shallowReviews) flags.push('shallow-solution-review');
  if (noHints) flags.push('missing-hints');
  if (leaks) flags.push('answer-leakage-marker');

  // Mechanical classification only. Human review can upgrade/downgrade this.
  let verdict = 'KEEP-CANDIDATE';
  const severe = flags.filter((flag) => ['fewer-than-5-families', 'single-DOK', 'single-band', 'answer-leakage-marker'].includes(flag));
  if (severe.length >= 2 || leaks) verdict = 'REBUILD-CANDIDATE';
  else if (flags.length) verdict = 'ENHANCE-CANDIDATE';

  rows.push({
    code,
    families: items.length,
    generators,
    representations: representations.length,
    tasks: tasks.length,
    doks: doks.join('/'),
    bands: bands.join('/'),
    signatures: signatures.length,
    choices,
    generic,
    flags,
    verdict,
  });
}

const count = (v) => rows.filter((r) => r.verdict === v).length;
console.log('# Algebra I TEKS Fidelity V2 — mechanical baseline\n');
console.log(`Active families: ${docs.length}`);
console.log(`Standards: ${rows.length}`);
console.log(`KEEP candidates: ${count('KEEP-CANDIDATE')}`);
console.log(`ENHANCE candidates: ${count('ENHANCE-CANDIDATE')}`);
console.log(`REBUILD candidates: ${count('REBUILD-CANDIDATE')}\n`);
console.log('code | fam | gen | repr | task | DOK | band | shapes | MC | generic | verdict | flags');
console.log('-----|-----|-----|------|------|-----|------|--------|----|---------|---------|------');
for (const r of rows) {
  console.log(`${r.code} | ${r.families} | ${r.generators} | ${r.representations} | ${r.tasks} | ${r.doks || '-'} | ${r.bands || '-'} | ${r.signatures} | ${r.choices} | ${r.generic} | ${r.verdict} | ${r.flags.join(', ') || 'none'}`);
}

console.log('\n# Priority review queue');
rows
  .filter((r) => r.verdict !== 'KEEP-CANDIDATE')
  .sort((a, b) => {
    const score = (r) => (r.verdict === 'REBUILD-CANDIDATE' ? 100 : 0) + r.flags.length;
    return score(b) - score(a) || a.code.localeCompare(b.code, undefined, { numeric: true });
  })
  .forEach((r) => console.log(`${r.code}: ${r.verdict} — ${r.flags.join(', ')}`));
