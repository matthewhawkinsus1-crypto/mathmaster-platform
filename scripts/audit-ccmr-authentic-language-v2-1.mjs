#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..', '..');
const root = process.env.MATHMASTER_ROOT ? path.resolve(process.env.MATHMASTER_ROOT) : defaultRoot;
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
  /teks/i,
  /dok\s*[1-4]/i,
  /difficulty band/i,
];

const docsIn = (parsed) => Array.isArray(parsed) ? parsed : (parsed?.documents || parsed?.items || parsed?.questions || []);
const codeOf = (doc) => String((doc?.alignmentKeys || []).find((key) => /^texas:/i.test(key)) || '').replace(/^texas:/i, '').toUpperCase();
const domainOf = (doc, framework) => doc?.assessmentContext?.domainId || (doc?.alignments || []).find((entry) => entry?.framework === framework)?.domainId || null;
const roleOf = (doc) => doc?.ccmrFamilyRole || (Number(doc?.ccmrChallengeTier || 1) >= 2 ? 'challenge' : 'direct');
const fmtOf = (doc) => String(doc?.assessmentItemFormat || '').toLowerCase() === 'studentproducedresponse' ? 'studentProducedResponse' : 'multipleChoice';
const generatorSignature = (doc) => JSON.stringify(doc?.generator || null);

function promptOf(doc) {
  return String(doc?.prompt || doc?.stem || doc?.question?.prompt || '').trim();
}

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
  if (rep === 'context' || rep === 'verbal' || task === 'application' || task === 'modeling') return true;
  const p = promptOf(doc).toLowerCase();
  return /\b(dollars?|percent|hours?|minutes?|miles?|kilometers?|meters?|feet|inches|students?|people|sample|population|survey|experiment|company|store|school|theater|tank|rate|per\b)/i.test(p);
}

function sample(arr, limit = 50) {
  return arr.slice(0, limit);
}

const report = {
  schemaVersion: 1,
  releaseTarget: 'ccmr-fidelity-v2.1-authentic-language',
  generatedAt: new Date().toISOString(),
  root,
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
  const byDomain = {};
  for (const doc of docs) {
    const d = domainOf(doc, framework) || 'unknown';
    byDomain[d] = (byDomain[d] || 0) + 1;
  }
  const formats = {};
  for (const doc of docs) formats[fmtOf(doc)] = (formats[fmtOf(doc)] || 0) + 1;
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
    examples: {
      metaPromptIds: sample(metaPrompt.map((d) => d.id), 20),
      classroomPromptIds: sample(classroomPrompt.map((d) => d.id), 20),
      veryLongPromptIds: sample(veryLong.map((d) => d.id), 20),
    },
  };
  if (missingPrompt.length) report.failures.push(`${framework}: ${missingPrompt.length} documents have no prompt`);
  if (metaPrompt.length) report.failures.push(`${framework}: ${metaPrompt.length} prompts contain assessment/meta coaching language`);
  if (classroomPrompt.length) report.failures.push(`${framework}: ${classroomPrompt.length} prompts contain classroom/internal language`);
}

for (const [framework, docs] of Object.entries(all)) {
  const directByFamily = new Map(docs.filter((d) => roleOf(d) === 'direct').map((d) => [d.familyId, d]));
  const challenge = docs.filter((d) => roleOf(d) === 'challenge');
  const generatorClones = [];
  const choiceClones = [];
  const taskShapeClones = [];
  for (const q of challenge) {
    const sourceFamily = q?.ccmrFidelity?.sourceFamilyId;
    const source = directByFamily.get(sourceFamily);
    if (!source) continue;
    if (generatorSignature(q) === generatorSignature(source)) generatorClones.push({ challengeId: q.id, sourceId: source.id, sourceFamilyId: sourceFamily });
    if (JSON.stringify(q?.choices || null) === JSON.stringify(source?.choices || null)) choiceClones.push({ challengeId: q.id, sourceId: source.id });
    const shapeQ = [q.taskType, q.representation, fmtOf(q), stripMathAndValues(promptOf(q))].join('|');
    const shapeS = [source.taskType, source.representation, fmtOf(source), stripMathAndValues(promptOf(source))].join('|');
    if (shapeQ === shapeS) taskShapeClones.push({ challengeId: q.id, sourceId: source.id });
  }
  report.challengeCloneAudit[framework] = {
    challengeCount: challenge.length,
    identicalGeneratorCount: generatorClones.length,
    identicalChoiceSetCount: choiceClones.length,
    identicalTaskShapeCount: taskShapeClones.length,
    generatorCloneExamples: sample(generatorClones, 30),
  };
  if (generatorClones.length) report.failures.push(`${framework}: ${generatorClones.length}/${challenge.length} challenge families reuse the source generator unchanged`);
}

const pairs = [['digitalSAT','act'],['digitalSAT','tsia2'],['digitalSAT','asvab'],['act','tsia2'],['act','asvab'],['tsia2','asvab']];
for (const [a, b] of pairs) {
  const left = all[a] || [];
  const right = all[b] || [];
  const rightBuckets = new Map();
  for (const q of right) {
    const key = `${codeOf(q)}|${q.taskType || ''}|${q.representation || ''}|${fmtOf(q)}`;
    if (!rightBuckets.has(key)) rightBuckets.set(key, []);
    rightBuckets.get(key).push(q);
  }
  let compared = 0;
  const suspicious = [];
  for (const q of left) {
    const key = `${codeOf(q)}|${q.taskType || ''}|${q.representation || ''}|${fmtOf(q)}`;
    const candidates = rightBuckets.get(key) || [];
    const qTokens = tokenSet(promptOf(q));
    for (const other of candidates) {
      compared += 1;
      const score = jaccard(qTokens, tokenSet(promptOf(other)));
      if (score >= 0.82 && qTokens.size >= 5) suspicious.push({ aId: q.id, bId: other.id, score: Number(score.toFixed(3)) });
    }
  }
  suspicious.sort((x, y) => y.score - x.score);
  report.taskGrammarOverlap[`${a}__${b}`] = { compared, suspiciousCount: suspicious.length, examples: sample(suspicious, 40) };
  if (suspicious.length) report.warnings.push(`${a}/${b}: ${suspicious.length} high-similarity task-grammar pairings require review`);
}

if (all.digitalSAT?.length) {
  const sat = report.frameworks.digitalSAT;
  const mcq = sat.formats.multipleChoice || 0;
  const spr = sat.formats.studentProducedResponse || 0;
  const ratio = mcq / Math.max(1, mcq + spr);
  sat.mcqRate = ratio;
  if (ratio < 0.68 || ratio > 0.82) report.failures.push(`digitalSAT: MCQ rate ${(ratio * 100).toFixed(1)}% is too far from the approximately 75% test-form target`);
  const requiredDomains = ['algebra','advancedMath','problemSolvingData','geometryTrigonometry'];
  for (const domain of requiredDomains) if (!sat.domains[domain]) report.failures.push(`digitalSAT: missing ${domain} domain content`);
}

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
