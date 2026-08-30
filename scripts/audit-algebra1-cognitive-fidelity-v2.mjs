#!/usr/bin/env node
// Algebra I TEKS Fidelity V2 — cognitive-label audit.
//
// The existing Path quality gate correctly requires task/DOK breadth, but it
// trusts the authored metadata. A bank can therefore look cognitively diverse
// if five routine calculations are labelled procedural, translation,
// application, errorAnalysis and reverseReasoning. This audit checks whether
// the STUDENT-FACING TASK carries evidence for the label being claimed.
//
// Read-only. It does not decide DOK automatically; it identifies contradictions
// and review queues that require human mathematical judgment.

import { readFileSync } from 'node:fs';

const BANK = 'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json';
const parsed = JSON.parse(readFileSync(BANK, 'utf8'));
const docs = (parsed.documents || []).filter((doc) => doc.active !== false);

const codeOf = (doc) => {
  const key = (doc.alignmentKeys || []).find((entry) => String(entry).startsWith('texas:')) || '';
  return String(key).replace(/^texas:/, '') || doc.assessedConstruct || 'unknown';
};

const familyOf = (doc) => String(doc.familyId || doc.id || '').split(':').pop();
const words = (doc) => `${doc.prompt || ''} ${doc.stimulus ? JSON.stringify(doc.stimulus) : ''}`.toLowerCase();
const reviewWords = (doc) => JSON.stringify(doc.solutionReview || {}).toLowerCase();

const ERROR_CUES = [
  'student', 'mistake', 'error', 'incorrect', 'wrong', 'first mistake',
  'claims', 'says', 'work shown', 'which step', 'what went wrong',
];
const STRATEGIC_CUES = [
  'justify', 'explain why', 'compare', 'design', 'create', 'construct',
  'which is more', 'most defensible', 'best evidence', 'why', 'multiple conditions',
];

const hasAny = (text, cues) => cues.some((cue) => text.includes(cue));
const isToolBacked = (doc) => Boolean(doc.type && doc.type !== 'response');
const fieldCount = (doc) => (doc.responseFields || doc.answerFields || []).length;

const findings = [];
const add = (doc, code, message, severity = 'review') => findings.push({
  code: codeOf(doc),
  family: familyOf(doc),
  dok: doc.dok,
  taskType: doc.taskType,
  severity,
  codeName: code,
  message,
});

for (const doc of docs) {
  const task = String(doc.taskType || '');
  const prompt = words(doc);
  const review = reviewWords(doc);

  if (task === 'errorAnalysis' && !hasAny(prompt, ERROR_CUES)) {
    add(
      doc,
      'error-analysis-without-error',
      'Metadata says errorAnalysis, but the student prompt presents no student work, claim, mistake, or error to analyze.',
      'high',
    );
  }

  // Reverse direction is useful, but reversing a one-step calculation is not
  // automatically strategic thinking. Flag the common pattern for review.
  if (task === 'reverseReasoning' && Number(doc.dok) >= 3) {
    const strategicSurface = hasAny(prompt, STRATEGIC_CUES);
    const multiPart = fieldCount(doc) > 1;
    if (!strategicSurface && !multiPart && !isToolBacked(doc)) {
      add(
        doc,
        'reverse-does-not-prove-dok3',
        'DOK 3 is claimed for a single-response reverse task with no visible justification, comparison, construction, or multi-constraint demand.',
      );
    }
  }

  // DOK 3 should not be assigned merely because the number is harder or the
  // problem is contextual. This is intentionally a review flag, not a blocker.
  if (Number(doc.dok) >= 3 && ['procedural', 'application'].includes(task)
      && !hasAny(prompt, STRATEGIC_CUES) && !isToolBacked(doc) && fieldCount(doc) <= 1) {
    add(
      doc,
      'dok3-routine-shape',
      'DOK 3 is attached to a single-response procedural/application shape without visible strategic demand.',
    );
  }

  // A solution review that calls an item error analysis does not make the task
  // error analysis. Keep this signal because it often reveals metadata written
  // from the explanation rather than from what the student is asked to do.
  if (task === 'errorAnalysis' && !hasAny(prompt, ERROR_CUES) && hasAny(review, ERROR_CUES)) {
    add(
      doc,
      'error-analysis-only-in-review',
      'The error-analysis language exists only after grading in solutionReview, not in the task the student performs.',
    );
  }
}

const byStandard = new Map();
for (const finding of findings) {
  if (!byStandard.has(finding.code)) byStandard.set(finding.code, []);
  byStandard.get(finding.code).push(finding);
}

console.log('# Algebra I cognitive-fidelity audit\n');
console.log(`Active families: ${docs.length}`);
console.log(`Standards: ${new Set(docs.map(codeOf)).size}`);
console.log(`Findings: ${findings.length}`);
console.log(`High-confidence label contradictions: ${findings.filter((f) => f.severity === 'high').length}\n`);

console.log('## Per-standard review queue');
for (const [code, list] of [...byStandard.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
  const high = list.filter((f) => f.severity === 'high').length;
  console.log(`${code}: ${list.length} finding(s), ${high} high-confidence`);
  list.forEach((f) => console.log(`  - ${f.family}: ${f.codeName} — ${f.message}`));
}

console.log('\n## Interpretation');
console.log('A high-confidence error-analysis contradiction means the taskType metadata is factually inconsistent with the student-facing task.');
console.log('Other DOK findings are review flags: DOK cannot be inferred reliably from keywords, so a human must decide whether the reasoning really reaches DOK 3.');

// This audit is evidence-producing during the fidelity project. Do not fail CI
// on review flags until the baseline is classified and an explicit release gate
// is adopted. High-confidence contradictions are still printed separately so
// they cannot disappear inside the larger review queue.
