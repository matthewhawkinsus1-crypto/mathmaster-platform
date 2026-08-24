#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.MATHMASTER_ROOT || path.join(here, '..'));
const seedDir = path.join(root, 'seed', 'pathQuestionBank');
const outPath = path.join(root, 'CCMR_FIDELITY_V2_1_AUTHENTIC_LANGUAGE_AUDIT.json');

const CONFIG = Object.freeze({
  digitalSAT: 'digitalSAT_pathQuestionBank_seed.json',
  act: 'act_pathQuestionBank_seed.json',
  tsia2: 'tsia2_pathQuestionBank_seed.json',
  asvab: 'asvab_pathQuestionBank_seed.json',
});

const META_PROMPT_PATTERNS = [
  /select the best digital sat answer/i,
  /select the act answer choice/i,
  /best tsia2 answer/i,
  /placement[- ]level mathematics/i,
  /correct asvab answer/i,
  /without using a calculator,? a test taker/i,
  /^challenge:/i,
  /a student selected/i,
  /a test taker .* chose/i,
  /a placement response gave/i,
  /recheck the mathematics/i,
  /verify .* before (selecting|submitting)/i,
  /show placement-ready reasoning/i,
  /efficient act solution path/i,
];

const CLASSROOM_PROMPT_PATTERNS = [
  /show your work/i,
  /explain your reasoning/i,
  /use the workspace/i,
  /use the .* tool/i,
  /warm[- ]?up/i,
  /exit ticket/i,
  /practice question/i,
  /teacher/i,
  /\bteks\b/i,
  /\bdok\s*[1-4]\b/i,
  /difficulty band/i,
];

const docsIn = (parsed) => Array.isArray(parsed) ? parsed : (parsed?.documents || parsed?.items || parsed?.questions || []);
const codeOf = (doc) => String((doc?.alignmentKeys || []).find((key) => /^texas:/i.test(key)) || '').replace(/^texas:/i, '').toUpperCase();
const domainOf = (doc, framework) => doc?.assessmentContext?.domainId || (doc?.alignments || []).find((entry) => entry?.framework === framework)?.domainId || null;
const roleOf = (doc) => doc?.ccmrFamilyRole || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');
const fmtOf = (doc) => String(doc?.assessmentItemFormat || '').toLowerCase() === 'studentproducedresponse' ? 'studentProducedResponse' : 'multipleChoice';
const generatorSignature = (doc) => JSON.stringify(doc?.generator || null);
const promptOf = (doc) => String(doc?.prompt || doc?.stem || doc?.question?.prompt || '').trim();
const sample = (arr, limit = 50) => arr.slice(0, limit);

function stripMathAndValues(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\{\{[^}]+\}\}/g, '<value>')
    .replace(/\$[^$]+\$/g, '<math>')
    .replace(/\\\([^)]*\\\)/g, '<math>')
    .replace(/-?\d+(?:\.\d+)?/g, '<number>')
    .replace(/[a-z]\s*=\s*/g, '<var>=')
    .replace(/[^a-z<>\s'-]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  return new Set(stripMathAndValues(text).split(/\s+/).filter((token) => token.length > 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function contextLike(doc) {
  const rep = String(doc?.representation || '').toLowerCase();
  const task = String(doc?.taskType || '').toLowerCase();
  if (rep === 'context' || rep === 'verbal' || task === 'application' || task === 'modeling' || task === 'contextmodel') return true;
  return /\b(dollars?|percent|hours?|minutes?|miles?|kilometers?|meters?|feet|inches|students?|people|sample|population|survey|experiment|company|store|school|theater|tank|rate|per)\b/i.test(promptOf(doc));
}

const report = {
  schemaVersion: 2,
  releaseTarget: 'ccmr-fidelity-v2.1-authentic-language',
  generatedAt: new Date().toISOString(),
  root,
  seedDir,
  frameworks: {},
  challengeCloneAudit: {},
  taskGrammarOverlap: {},
  failures: [],
  warnings: [],
};

const all = {};
for (const [framework, filename] of Object.entries(CONFIG)) {
  const file = path.join(seedDir, filename);
  if (!existsSync(file)) {
    report.failures.push(`${framework}: missing ${path.relative(root, file)}`);
    continue;
  }

  const docs = docsIn(JSON.parse(readFileSync(file, 'utf8')));
  all[framework] = docs;
  const direct = docs.filter((doc) => roleOf(doc) === 'direct');
  const challenge = docs.filter((doc) => roleOf(doc) === 'challenge');
  const metaPrompt = docs.filter((doc) => META_PROMPT_PATTERNS.some((rx) => rx.test(promptOf(doc))));
  const classroomPrompt = docs.filter((doc) => CLASSROOM_PROMPT_PATTERNS.some((rx) => rx.test(promptOf(doc))));
  const veryLong = docs.filter((doc) => promptOf(doc).split(/\s+/).filter(Boolean).length > 95);
  const missingPrompt = docs.filter((doc) => !promptOf(doc));
  const missingV21 = docs.filter((doc) => String(doc?.ccmrAuthenticLanguage?.version || '') !== '2.1' || doc?.ccmrAuthenticLanguage?.authored !== true);
  const unmarkedChallenges = challenge.filter((doc) => doc?.ccmrAuthenticLanguage?.authoredChallenge !== true);

  const byDomain = {};
  const formats = {};
  for (const doc of docs) {
    const domain = domainOf(doc, framework) || 'unknown';
    byDomain[domain] = (byDomain[domain] || 0) + 1;
    formats[fmtOf(doc)] = (formats[fmtOf(doc)] || 0) + 1;
  }
  const contextual = docs.filter(contextLike).length;

  report.frameworks[framework] = {
    documents: docs.length,
    direct: direct.length,
    challenge: challenge.length,
    standards: new Set(docs.map(codeOf).filter(Boolean)).size,
    formats,
    domains: byDomain,
    contextLike: contextual,
    contextLikeRate: docs.length ? contextual / docs.length : 0,
    metaPromptCount: metaPrompt.length,
    classroomPromptCount: classroomPrompt.length,
    veryLongPromptCount: veryLong.length,
    missingPromptCount: missingPrompt.length,
    missingV21AuthorshipCount: missingV21.length,
    unmarkedChallengeCount: unmarkedChallenges.length,
    examples: {
      metaPromptIds: sample(metaPrompt.map((doc) => doc.id), 20),
      classroomPromptIds: sample(classroomPrompt.map((doc) => doc.id), 20),
      missingV21Ids: sample(missingV21.map((doc) => doc.id), 20),
      unmarkedChallengeIds: sample(unmarkedChallenges.map((doc) => doc.id), 20),
    },
  };

  if (missingPrompt.length) report.failures.push(`${framework}: ${missingPrompt.length} documents have no prompt`);
  if (metaPrompt.length) report.failures.push(`${framework}: ${metaPrompt.length} prompts contain assessment/meta coaching language`);
  if (classroomPrompt.length) report.failures.push(`${framework}: ${classroomPrompt.length} prompts contain classroom/internal language`);
  if (missingV21.length) report.failures.push(`${framework}: ${missingV21.length} documents are not marked as independently authored V2.1 content`);
  if (unmarkedChallenges.length) report.failures.push(`${framework}: ${unmarkedChallenges.length} challenge families are not marked authoredChallenge=true`);
}

for (const [framework, docs] of Object.entries(all)) {
  const directByFamily = new Map(docs.filter((doc) => roleOf(doc) === 'direct').map((doc) => [doc.familyId, doc]));
  const challenge = docs.filter((doc) => roleOf(doc) === 'challenge');
  const generatorClones = [];
  const sourceLinked = [];

  for (const item of challenge) {
    const sourceFamily = item?.ccmrFidelity?.sourceFamilyId;
    if (!sourceFamily) continue;
    const source = directByFamily.get(sourceFamily);
    if (!source) continue;
    sourceLinked.push(item.id);
    if (generatorSignature(item) === generatorSignature(source)) {
      generatorClones.push({ challengeId: item.id, sourceId: source.id, sourceFamilyId: sourceFamily });
    }
  }

  const byStandard = new Map();
  for (const item of docs) {
    const code = codeOf(item);
    if (!byStandard.has(code)) byStandard.set(code, []);
    byStandard.get(code).push(item);
  }
  const intraStandardGeneratorClones = [];
  for (const [code, group] of byStandard) {
    const seen = new Map();
    for (const item of group) {
      const signature = generatorSignature(item);
      if (signature === 'null') continue;
      const prior = seen.get(signature);
      if (prior) intraStandardGeneratorClones.push({ code, id: item.id, priorId: prior.id });
      else seen.set(signature, item);
    }
  }

  report.challengeCloneAudit[framework] = {
    challengeCount: challenge.length,
    legacySourceLinkedCount: sourceLinked.length,
    identicalSourceGeneratorCount: generatorClones.length,
    identicalGeneratorWithinStandardCount: intraStandardGeneratorClones.length,
    generatorCloneExamples: sample([...generatorClones, ...intraStandardGeneratorClones], 30),
  };
  if (generatorClones.length) report.failures.push(`${framework}: ${generatorClones.length} challenge families reuse their legacy source generator unchanged`);
  if (intraStandardGeneratorClones.length) report.failures.push(`${framework}: ${intraStandardGeneratorClones.length} exact generator duplicates exist within the same standard`);
}

const pairs = [
  ['digitalSAT', 'act'], ['digitalSAT', 'tsia2'], ['digitalSAT', 'asvab'],
  ['act', 'tsia2'], ['act', 'asvab'], ['tsia2', 'asvab'],
];
for (const [leftName, rightName] of pairs) {
  const left = all[leftName] || [];
  const right = all[rightName] || [];
  const rightBuckets = new Map();
  for (const item of right) {
    const key = `${codeOf(item)}|${item.taskType || ''}|${item.representation || ''}|${fmtOf(item)}`;
    if (!rightBuckets.has(key)) rightBuckets.set(key, []);
    rightBuckets.get(key).push(item);
  }
  let compared = 0;
  const suspicious = [];
  for (const item of left) {
    const key = `${codeOf(item)}|${item.taskType || ''}|${item.representation || ''}|${fmtOf(item)}`;
    const itemTokens = tokenSet(promptOf(item));
    for (const other of rightBuckets.get(key) || []) {
      compared += 1;
      const score = jaccard(itemTokens, tokenSet(promptOf(other)));
      if (score >= 0.82 && itemTokens.size >= 5) suspicious.push({ leftId: item.id, rightId: other.id, score: Number(score.toFixed(3)) });
    }
  }
  suspicious.sort((a, b) => b.score - a.score);
  report.taskGrammarOverlap[`${leftName}__${rightName}`] = { compared, suspiciousCount: suspicious.length, examples: sample(suspicious, 40) };
  if (suspicious.length) report.warnings.push(`${leftName}/${rightName}: ${suspicious.length} high-similarity task-grammar pairings require review`);
}

if (all.digitalSAT?.length) {
  const sat = report.frameworks.digitalSAT;
  const mcq = sat.formats.multipleChoice || 0;
  const spr = sat.formats.studentProducedResponse || 0;
  const mcqRate = mcq / Math.max(1, mcq + spr);
  sat.mcqRate = mcqRate;
  if (mcqRate < 0.68 || mcqRate > 0.82) report.failures.push(`digitalSAT: MCQ rate ${(mcqRate * 100).toFixed(1)}% is too far from the approximately 75% test-form target`);
  for (const domain of ['algebra', 'advancedMath', 'problemSolvingData', 'geometryTrigonometry']) {
    if (!sat.domains[domain]) report.failures.push(`digitalSAT: missing ${domain} domain content`);
  }
}

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
