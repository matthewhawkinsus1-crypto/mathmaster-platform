#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAssessmentStandardReferences } from '../src/platform/ccmr/assessmentStandardReferences.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const primaryDir = path.join(root, 'seed', 'pathQuestionBank');
const mirrorDir = path.join(root, 'functions', 'seeds', 'pathQuestionBank');

const CONFIG = Object.freeze({
  digitalSAT: { file: 'digitalSAT_pathQuestionBank_seed.json', short: 'sat', label: 'Digital SAT', calculator: 'graphing' },
  act: { file: 'act_pathQuestionBank_seed.json', short: 'act', label: 'ACT', calculator: 'graphing' },
  tsia2: { file: 'tsia2_pathQuestionBank_seed.json', short: 'tsi', label: 'TSIA2', calculator: 'basic' },
  asvab: { file: 'asvab_pathQuestionBank_seed.json', short: 'asvab', label: 'ASVAB', calculator: 'none' },
});

const docsIn = (parsed) => Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => /^texas:/i.test(key)) || '').replace(/^texas:/i, '').toUpperCase();
const directAlignment = (doc, framework) => (doc.alignments || []).find((entry) => entry?.framework === framework) || null;
const clone = (value) => JSON.parse(JSON.stringify(value));

const sourcePromptOf = (doc) => String(doc?.ccmrFidelity?.sourcePrompt || doc?.prompt || '').trim();

const responseMode = (doc) => String(doc.assessmentItemFormat || '').toLowerCase() === 'studentproducedresponse'
  ? 'studentProducedResponse'
  : 'multipleChoice';

const directPrompt = (framework, doc) => {
  const base = sourcePromptOf(doc);
  const mode = responseMode(doc);
  if (framework === 'digitalSAT') {
    return mode === 'studentProducedResponse'
      ? `${base} Enter your answer as a student-produced response.`
      : `${base} Select the best Digital SAT answer.`;
  }
  if (framework === 'act') return `${base} Select the best answer.`;
  if (framework === 'tsia2') return `${base} Select the answer that best demonstrates the required placement-level mathematics.`;
  if (framework === 'asvab') return `${base} Work without a calculator and select the best answer.`;
  return base;
};

const wrongChoiceLabel = (doc) => {
  const expected = (doc.responseFields || []).find((field) => field?.inputProfile === 'choice')?.expected;
  const wrong = (doc.choices || []).find((choice) => choice?.id && choice.id !== expected);
  return wrong?.label || null;
};

const challengePrompt = (framework, doc) => {
  const base = sourcePromptOf(doc);
  const wrong = wrongChoiceLabel(doc);
  const mode = responseMode(doc);
  if (mode === 'studentProducedResponse') {
    if (framework === 'digitalSAT') return `Challenge: solve independently, then verify that your response is mathematically consistent. ${base} Enter the final response.`;
    return `Challenge: solve independently and verify the result before submitting. ${base}`;
  }
  if (framework === 'digitalSAT') return wrong
    ? `A student selected ${wrong}. Recheck the mathematics, reject that misconception, and select the correct Digital SAT answer. ${base}`
    : `Challenge: solve and verify the mathematics before selecting the best Digital SAT answer. ${base}`;
  if (framework === 'act') return wrong
    ? `A test taker working quickly chose ${wrong}. Determine the correct result and select the ACT answer choice that should replace it. ${base}`
    : `Challenge: use an efficient ACT solution path, verify it, and select the best answer. ${base}`;
  if (framework === 'tsia2') return wrong
    ? `A placement response gave ${wrong}. Check the reasoning, correct the result, and select the best TSIA2 answer. ${base}`
    : `Challenge: show placement-ready reasoning by checking the result before selecting the best answer. ${base}`;
  if (framework === 'asvab') return wrong
    ? `Without using a calculator, a test taker chose ${wrong}. Rework the mathematics and select the correct ASVAB answer. ${base}`
    : `Challenge: work efficiently without a calculator, verify the result, and select the best ASVAB answer. ${base}`;
  return base;
};

const refsFor = (code, framework) => getAssessmentStandardReferences(code, framework);

const fidelityFor = ({ framework, code, doc, role, sourceFamilyId }) => {
  const refs = refsFor(code, framework);
  return {
    version: 2,
    variantKind: role === 'challenge' ? 'misconception-check-challenge' : 'direct-framework-adaptation',
    responseMode: responseMode(doc),
    officialReferenceIds: refs.map((reference) => reference.id),
    officialReferenceCodes: refs.map((reference) => reference.officialCode).filter(Boolean),
    officialReferencePrecision: refs.map((reference) => reference.precision),
    directAssessmentEvidence: true,
    sourceFamilyId: sourceFamilyId || doc.familyId,
    sourcePrompt: sourcePromptOf(doc),
  };
};

const normalizeFoundation = (framework, doc) => {
  const next = clone(doc);
  const code = codeOf(next);
  const alignment = directAlignment(next, framework);
  next.assessmentContext = {
    ...(next.assessmentContext || {}),
    framework,
    examStyle: true,
    domainId: alignment?.domainId || next.assessmentContext?.domainId || null,
  };
  next.calculatorPolicy = CONFIG[framework].calculator;
  if (framework === 'tsia2') next.examCalculatorMode = next.examCalculatorMode || 'basic';
  if (framework === 'asvab') next.examCalculatorMode = 'none';
  next.ccmrChallengeTier = 1;
  next.ccmrFamilyRole = 'direct';
  next.ccmrFidelity = fidelityFor({ framework, code, doc: next, role: 'direct' });
  next.prompt = directPrompt(framework, next);
  return next;
};

const challengeScore = (doc) => (Number(doc.difficultyBand || 1) * 10) + (Number(doc.dok || 1) * 4)
  + (String(doc.assessmentItemFormat || '').toLowerCase() === 'studentproducedresponse' ? 2 : 0);

const selectChallengeSources = (docs) => {
  const ranked = [...docs].sort((a, b) => challengeScore(b) - challengeScore(a));
  const picked = [];
  const signatures = new Set();
  for (const doc of ranked) {
    const signature = [doc.taskType, doc.representation, doc.assessmentItemFormat].join('|');
    if (signatures.has(signature) && ranked.length - picked.length > 3) continue;
    signatures.add(signature);
    picked.push(doc);
    if (picked.length === 3) return picked;
  }
  for (const doc of ranked) {
    if (picked.includes(doc)) continue;
    picked.push(doc);
    if (picked.length === 3) break;
  }
  return picked;
};

const makeChallenge = (framework, source, index) => {
  const next = clone(source);
  const code = codeOf(next);
  const suffix = `ccmr_challenge_${index + 1}`;
  next.id = `${source.id}_${suffix}`;
  next.familyId = `${source.familyId}:ccmr-challenge-${index + 1}`;
  next.familyVersion = Math.max(2, Number(source.familyVersion || 1) + 1);
  next.ccmrChallengeTier = 2;
  next.ccmrFamilyRole = 'challenge';
  next.difficultyBand = Math.min(5, Math.max(4, Number(source.difficultyBand || 3) + 1));
  // The challenge adds verification/misconception checking but does not falsely
  // relabel a procedural item as DOK 3. Preserve authored DOK and require at least 2.
  next.dok = Math.min(4, Math.max(2, Number(source.dok || 1)));
  next.prompt = challengePrompt(framework, source);
  next.ccmrFidelity = fidelityFor({ framework, code, doc: next, role: 'challenge', sourceFamilyId: source.familyId });
  next.attemptFeedback = [
    `This is a harder ${CONFIG[framework].label} set. Check the tempting answer against the mathematics before committing.`,
    ...(Array.isArray(source.attemptFeedback) ? source.attemptFeedback.slice(0, 1) : []),
  ];
  next.supportHints = [
    'Identify what the tempting answer would assume, then verify the governing relationship before solving.',
    ...(Array.isArray(source.supportHints) ? source.supportHints.slice(0, 1) : []),
  ];
  if (next.solutionReview?.headline) {
    next.solutionReview.headline = `${CONFIG[framework].label} challenge review: ${String(next.solutionReview.headline).replace(/^[^:]+:\s*/, '')}`;
  }
  return next;
};

let assessmentTotal = 0;
let challengeTotal = 0;
for (const [framework, cfg] of Object.entries(CONFIG)) {
  const file = path.join(primaryDir, cfg.file);
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const originals = docsIn(parsed);
  const foundation = originals
    .filter((doc) => Number(doc.ccmrChallengeTier || 1) <= 1 && doc.ccmrFamilyRole !== 'challenge')
    .map((doc) => normalizeFoundation(framework, doc));
  const byCode = new Map();
  for (const doc of foundation) {
    const code = codeOf(doc);
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(doc);
  }
  const challenges = [];
  for (const [code, group] of byCode) {
    if (group.length < 5) throw new Error(`${framework} ${code}: expected at least 5 direct families, found ${group.length}`);
    const refs = refsFor(code, framework);
    if (!refs.length) throw new Error(`${framework} ${code}: no official/framework reference resolved`);
    selectChallengeSources(group).forEach((source, index) => challenges.push(makeChallenge(framework, source, index)));
  }
  const documents = [...foundation, ...challenges];
  assessmentTotal += documents.length;
  challengeTotal += challenges.length;
  const out = { ...parsed, documents };
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  copyFileSync(file, path.join(mirrorDir, cfg.file));
  console.log(`${framework}: ${foundation.length} direct + ${challenges.length} challenge = ${documents.length}`);
}
console.log(`Assessment bank: ${assessmentTotal} documents (${challengeTotal} challenge families).`);
