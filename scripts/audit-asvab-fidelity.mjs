#!/usr/bin/env node
// ASVAB fidelity audit. Complements scripts/audit-asvab-drafts.mjs, which
// checks that items generate and grade; this one checks whether they behave
// like ASVAB items.
//
//   node scripts/audit-asvab-fidelity.mjs [drafts/asvab.json] [--samples 24] [--verdicts]
import { readFileSync } from 'node:fs';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';
import {
  ASVAB_DOMAINS, analyzeAnswerKeyBias, analyzeDistractors, analyzeFamilySet, analyzeRegister,
} from '../functions/shared/asvabFidelity.mjs';

const args = process.argv.slice(2);
const samplesAt = args.indexOf('--samples');
const samples = samplesAt >= 0 ? Number(args[samplesAt + 1]) || 24 : 24;
const positional = args.filter((entry, index) => !entry.startsWith('--') && index !== samplesAt + 1);
const file = positional[0] || 'drafts/asvab.json';
const showVerdicts = args.includes('--verdicts');

const documents = JSON.parse(readFileSync(file, 'utf8')).documents || [];
const codeOf = (q) => String(q?.alignmentKeys?.[0] || '').replace(/^texas:/i, '');
const domainOf = (q) => String(q?.assessmentContext?.domainId || q?.assessmentContext?.subtest || '');

const byCode = new Map();
const verdicts = [];
const tally = { keep: 0, revise: 0, replace: 0 };
const issueCounts = new Map();
const note = (code) => issueCounts.set(code, (issueCounts.get(code) || 0) + 1);

for (const question of documents) {
  const instances = samplePathInstances(question, samples).map((s) => s.question).filter(Boolean);
  const bias = analyzeAnswerKeyBias(instances);
  const register = analyzeRegister(question);
  const distractors = analyzeDistractors(question);
  const issues = [...bias.issues, ...register.issues, ...distractors.issues];
  issues.forEach((issue) => note(issue.code));

  // A key a student can find by magnitude, or a distractor set nobody can
  // justify, is not repairable by editing prose: the item has to be rebuilt.
  const mustReplace = issues.some((issue) => (
    issue.code === 'answerKeyMagnitudeBias' || issue.code === 'answerKeyExtremeBias' || issue.code === 'distractorUnexplained' || issue.code === 'choiceCount' || issue.code === 'keyMissing'
  ));
  const verdict = mustReplace ? 'replace' : (issues.length ? 'revise' : 'keep');
  tally[verdict] += 1;
  verdicts.push({ id: question.id, code: codeOf(question), domain: domainOf(question), verdict, issues: issues.map((i) => i.code) });

  const code = codeOf(question);
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push(question);
}

const setIssues = new Map();
for (const [code, questions] of byCode) {
  const analysis = analyzeFamilySet(code, questions);
  analysis.issues.forEach((issue) => note(issue.code));
  if (analysis.issues.length) setIssues.set(code, analysis);
}

const ar = documents.filter((q) => domainOf(q) === ASVAB_DOMAINS.ARITHMETIC_REASONING).length;
const mk = documents.filter((q) => domainOf(q) === ASVAB_DOMAINS.MATHEMATICS_KNOWLEDGE).length;

console.log(`file=${file}  families=${documents.length}  standards=${byCode.size}  AR=${ar}  MK=${mk}  samples/family=${samples}`);
console.log(`verdicts: keep=${tally.keep} revise=${tally.revise} replace=${tally.replace}`);
console.log('\nissues by kind:');
[...issueCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([code, count]) => console.log(`  ${String(count).padStart(5)}  ${code}`));

const clonedStandards = [...setIssues.values()].filter((a) => a.issues.some((i) => i.code === 'taskClone'));
console.log(`\nstandards containing task clones: ${clonedStandards.length} of ${byCode.size}`);
for (const analysis of clonedStandards.slice(0, 12)) {
  console.log(`  ${analysis.code}: ${analysis.distinctTasks} distinct task structures across ${analysis.families} families`);
  analysis.issues.filter((i) => i.code === 'taskClone').forEach((i) => console.log(`      ${i.detail}`));
}

if (showVerdicts) {
  console.log('\nper-family verdicts:');
  verdicts.forEach((v) => console.log(`  ${v.verdict.padEnd(8)} ${v.code.padEnd(8)} ${v.id}  ${v.issues.join(',')}`));
}

process.exit(tally.replace ? 1 : 0);
