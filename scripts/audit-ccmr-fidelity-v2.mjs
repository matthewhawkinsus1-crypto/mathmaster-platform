#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dir = path.join(root, 'seed', 'pathQuestionBank');
const configs = {
  digitalSAT: 'digitalSAT_pathQuestionBank_seed.json',
  act: 'act_pathQuestionBank_seed.json',
  tsia2: 'tsia2_pathQuestionBank_seed.json',
  asvab: 'asvab_pathQuestionBank_seed.json',
};
const docsIn = (p) => Array.isArray(p) ? p : (p.documents || []);
const codeOf = (q) => String((q.alignmentKeys || []).find((k) => /^texas:/i.test(k)) || '').replace(/^texas:/i, '').toUpperCase();
const normalizePrompt = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), frameworks: {}, crossFrameworkExactPromptOverlap: {}, failures: [] };
const byFrameworkCode = {};

for (const [framework, file] of Object.entries(configs)) {
  const docs = docsIn(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
  const byCode = new Map();
  docs.forEach((doc) => {
    const code = codeOf(doc);
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(doc);
  });
  byFrameworkCode[framework] = byCode;
  let direct = 0;
  let challenge = 0;
  for (const [code, rows] of byCode) {
    const directRows = rows.filter((q) => Number(q.ccmrChallengeTier || 1) === 1 && q.ccmrFamilyRole === 'direct');
    const challengeRows = rows.filter((q) => Number(q.ccmrChallengeTier || 1) >= 2 && q.ccmrFamilyRole === 'challenge');
    direct += directRows.length;
    challenge += challengeRows.length;
    if (new Set(directRows.map((q) => q.familyId)).size < 5) report.failures.push(`${framework} ${code}: fewer than 5 direct families`);
    if (new Set(challengeRows.map((q) => q.familyId)).size < 3) report.failures.push(`${framework} ${code}: fewer than 3 challenge families`);
    for (const q of rows) {
      if (q.ccmrFidelity?.version !== 2) report.failures.push(`${q.id}: missing ccmrFidelity v2`);
      if (!Array.isArray(q.ccmrFidelity?.officialReferenceIds) || !q.ccmrFidelity.officialReferenceIds.length) report.failures.push(`${q.id}: no official/framework reference`);
      if (q.assessmentContext?.framework !== framework || q.assessmentContext?.examStyle !== true) report.failures.push(`${q.id}: framework context mismatch`);
    }
    for (const q of challengeRows) {
      if (Number(q.difficultyBand || 0) < 4) report.failures.push(`${q.id}: challenge below difficulty band 4`);
      if (Number(q.dok || 0) < 2) report.failures.push(`${q.id}: challenge below DOK 2`);
    }
    if (framework === 'digitalSAT') {
      const formats = new Set(rows.map((q) => q.assessmentItemFormat));
      if (!formats.has('multipleChoice') || !formats.has('studentProducedResponse')) {
        // Some individual standards legitimately only use one format. Do not fail here;
        // corpus-level format coverage is checked below.
      }
    } else if (rows.some((q) => q.assessmentItemFormat !== 'multipleChoice')) {
      report.failures.push(`${framework} ${code}: non-MCQ item in a 4-choice bank`);
    }
    if (framework === 'asvab' && rows.some((q) => q.calculatorPolicy !== 'none' || q.examCalculatorMode !== 'none')) {
      report.failures.push(`asvab ${code}: calculator policy is not none`);
    }
  }
  const formats = Object.fromEntries([...new Set(docs.map((q) => q.assessmentItemFormat))].map((format) => [format, docs.filter((q) => q.assessmentItemFormat === format).length]));
  if (framework === 'digitalSAT' && (!formats.multipleChoice || !formats.studentProducedResponse)) report.failures.push('digitalSAT corpus must include both MCQ and SPR');
  report.frameworks[framework] = { documents: docs.length, standards: byCode.size, direct, challenge, formats };
}

const pairs = [['digitalSAT','act'],['digitalSAT','tsia2'],['act','tsia2'],['digitalSAT','asvab'],['act','asvab'],['tsia2','asvab']];
for (const [a,b] of pairs) {
  let compared = 0;
  let exact = 0;
  const codes = [...byFrameworkCode[a].keys()].filter((code) => byFrameworkCode[b].has(code));
  for (const code of codes) {
    const pa = new Set(byFrameworkCode[a].get(code).map((q) => normalizePrompt(q.prompt)));
    const pb = new Set(byFrameworkCode[b].get(code).map((q) => normalizePrompt(q.prompt)));
    for (const prompt of pa) { compared += 1; if (pb.has(prompt)) exact += 1; }
  }
  const rate = compared ? exact / compared : 0;
  report.crossFrameworkExactPromptOverlap[`${a}__${b}`] = { compared, exact, rate };
  if (rate > 0.10) report.failures.push(`${a}/${b}: exact prompt overlap ${(rate*100).toFixed(1)}% exceeds 10%`);
}

const out = path.join(root, 'CCMR_FIDELITY_V2_AUDIT.json');
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
