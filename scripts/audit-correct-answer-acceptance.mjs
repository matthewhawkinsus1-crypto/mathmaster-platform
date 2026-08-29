#!/usr/bin/env node

/**
 * MathMaster Correct Answer Acceptance Audit
 *
 * Goal: catch FALSE NEGATIVES before students do.
 *
 * It does not ask "does the answer key grade itself?" only. That is too weak.
 * Generated keys are often machine-shaped:
 *
 *   y=1*x^2+(-6)*x+(1)
 *
 * while a student naturally writes:
 *
 *   y=x^2-6x+1
 *
 * Both are correct. This audit creates conservative, semantics-preserving
 * human spellings of every generated math answer and sends each one through
 * the REAL production field grader.
 *
 * Coverage:
 *   - every active production Path/CCMR bank
 *   - repeated generated draws per template
 *   - every non-choice/non-prose response field
 *   - teacher-import JSON response fields where an open answer is declared
 *   - existing Path tool-contract grader suite is run separately by the
 *     installer/CI workflow
 *
 * Exit code is nonzero if ANY known-correct spelling is rejected.
 */

import { createRequire } from 'node:module';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

import {
  generatePathInstance,
  hasPathGenerator,
} from '../functions/shared/pathQuestionGeneration.mjs';
import { gradeResponseField } from '../src/grading/fieldGrader.js';

const require = createRequire(import.meta.url);
const mathPath = require('../functions/lib/mathPath.js');

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const SAMPLES = Math.max(1, Number(argOf('--samples', '12')) || 12);
const MAX_FAILURES = Math.max(10, Number(argOf('--max-failures', '100')) || 100);

const documentsIn = (parsed) => (
  Array.isArray(parsed)
    ? parsed
    : (parsed.documents || parsed.items || parsed.questions || [])
);

const seedDir = path.resolve('functions/seeds/pathQuestionBank');

const safeHumanEquation = (input) => {
  let value = String(input ?? '');

  // Explicit multiplication beside an algebraic symbol/group -> implicit
  // multiplication. Numeric * numeric is deliberately left alone.
  value = value
    .replace(/([0-9A-Za-z)\]}])\s*\*\s*([A-Za-z(])/g, '$1$2')
    .replace(/([A-Za-z)\]}])\s*\*\s*([0-9A-Za-z(])/g, '$1$2');

  // Generator spellings such as +(-6) and +(1).
  value = value
    .replace(/\+\(\s*(-\d+(?:\.\d+)?)\s*\)/g, '$1')
    .replace(/\+\(\s*(\d+(?:\.\d+)?)\s*\)/g, '+$1')
    .replace(/-\(\s*-(\d+(?:\.\d+)?)\s*\)/g, '+$1')
    .replace(/-\(\s*(\d+(?:\.\d+)?)\s*\)/g, '-$1');

  // Parentheses around a coefficient/constant carry no mathematical meaning.
  value = value
    .replace(/\(\s*(-?\d+(?:\.\d+)?)\s*\)(?=[A-Za-z]|$|[+\-=])/g, '$1');

  // Human standard polynomial writing suppresses coefficient 1.
  value = value
    .replace(/(^|[=+\-])1(?=[A-Za-z])/g, '$1')
    .replace(/(^|[=+])-1(?=[A-Za-z])/g, '$1-');

  return value;
};

const exponentBraceVariant = (input) => String(input ?? '')
  .replace(/\^(-?\d+)(?![}\d])/g, '^{$1}');


const verifyAuditVariantGenerator = () => {
  const cases = [
    ['2/(x-(-5))', '2/(x+5)'],
    ['1/(x-(-1))', '1/(x+1)'],
    ['2/(x+(-5))', '2/(x-5)'],
    ['y=1*x^2+(-6)*x+(1)', 'y=x^2-6x+1'],
  ];

  const failures = cases
    .map(([input, expected]) => ({
      input,
      expected,
      actual: safeHumanEquation(input),
    }))
    .filter((entry) => entry.actual !== entry.expected);

  if (failures.length) {
    console.error('AUDIT VARIANT GENERATOR SELF-CHECK FAILED');
    failures.forEach((entry) => {
      console.error(`  input    ${JSON.stringify(entry.input)}`);
      console.error(`  expected ${JSON.stringify(entry.expected)}`);
      console.error(`  actual   ${JSON.stringify(entry.actual)}`);
    });
    process.exit(2);
  }
};

verifyAuditVariantGenerator();

const unicodeMinusVariant = (input) => String(input ?? '').replace(/-/g, '−');

const variantsFor = (expected, profile = '') => {
  const source = String(expected ?? '').trim();
  if (!source) return [];

  const out = new Set([source]);
  const p = String(profile || '').toLowerCase();

  if (['equation', 'formula', 'expression', 'symbolic', 'math'].includes(p)
      || source.includes('=')
      || /[A-Za-z]\^?\d/.test(source)) {
    const human = safeHumanEquation(source);
    out.add(human);
    out.add(exponentBraceVariant(human));
    out.add(unicodeMinusVariant(human));
    out.add(human.replace(/\s+/g, ''));
  }

  if (['orderedpair', 'ordered-pair', 'point', 'interval', 'inequality', 'set', 'setnotation'].includes(p)) {
    out.add(unicodeMinusVariant(source));
    if (source.startsWith('(') && source.endsWith(')')) {
      out.add(`\\left${source.slice(0, -1)}\\right)`);
    }
    if (source.startsWith('[') && source.endsWith(']')) {
      out.add(`\\left${source.slice(0, -1)}\\right]`);
    }
  }

  if (/^-?\d+(?:\.\d+)?$/.test(source)) {
    out.add(String(Number(source)));
  }

  return [...out].filter(Boolean);
};

const failures = [];
let templates = 0;
let instances = 0;
let pathFields = 0;
let variantsChecked = 0;

const recordFailure = (failure) => {
  if (failures.length < MAX_FAILURES) failures.push(failure);
};

const bankFiles = existsSync(seedDir)
  ? readdirSync(seedDir).filter((name) => name.endsWith('.json')).sort()
  : [];

for (const bankFile of bankFiles) {
  const parsed = JSON.parse(readFileSync(path.join(seedDir, bankFile), 'utf8'));
  for (const template of documentsIn(parsed)) {
    if (template?.active === false) continue;
    templates += 1;

    const draws = hasPathGenerator(template) ? SAMPLES : 1;
    for (let draw = 0; draw < draws; draw += 1) {
      const generated = hasPathGenerator(template)
        ? generatePathInstance(template, `answer-acceptance-${draw}`)
        : { question: template };

      if (!generated?.question) {
        recordFailure({
          area: 'path',
          bank: bankFile,
          id: template?.id,
          draw,
          reason: `generation_failed:${generated?.reason || 'unknown'}`,
        });
        continue;
      }

      instances += 1;
      const question = generated.question;
      const grading = mathPath.privateGradingDefinition(question);

      for (const field of question.responseFields || []) {
        const profile = String(field?.inputProfile || 'text').toLowerCase();
        if (['choice', 'multiplechoice', 'multiple-choice', 'select', 'text'].includes(profile)) continue;
        if (field?.expected === undefined || field?.expected === null) continue;

        pathFields += 1;
        for (const variant of variantsFor(field.expected, profile)) {
          variantsChecked += 1;
          // eslint-disable-next-line no-await-in-loop
          const result = await mathPath.gradeResponse(grading, {
            responses: { [field.id]: variant },
          });
          const fieldResult = result.fieldResults?.find((entry) => entry.id === String(field.id));
          if (!fieldResult?.isCorrect) {
            recordFailure({
              area: 'path',
              bank: bankFile,
              id: question.id || template.id,
              fieldId: field.id,
              profile,
              draw,
              expected: String(field.expected),
              rejectedCorrectVariant: variant,
            });
          }
        }
      }
    }
  }
}

// Teacher-import open-response audit. Choice questions are intentionally
// skipped because selecting a declared option is not an equivalence problem.
const walkJsonFiles = (dir, found = []) => {
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walkJsonFiles(full, found);
    else if (name.endsWith('.json')) found.push(full);
  }
  return found;
};

const visit = (node, callback, trail = []) => {
  if (Array.isArray(node)) {
    node.forEach((item, index) => visit(item, callback, [...trail, index]));
    return;
  }
  if (!node || typeof node !== 'object') return;
  callback(node, trail);
  Object.entries(node).forEach(([key, value]) => visit(value, callback, [...trail, key]));
};

let assignmentFields = 0;
const teacherRoot = path.resolve('teacher-import-jsons');
for (const file of walkJsonFiles(teacherRoot)) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue;
  }

  visit(parsed, (node, trail) => {
    if (!Object.prototype.hasOwnProperty.call(node, 'answer')) return;
    if (Array.isArray(node.options) || node.type === 'choice') return;
    if (node.answer === null || node.answer === undefined || typeof node.answer === 'object') return;

    const expected = String(node.answer);
    const profile = expected.includes('=') ? 'equation' : /[A-Za-z]/.test(expected) ? 'expression' : 'number';
    assignmentFields += 1;

    for (const variant of variantsFor(expected, profile)) {
      variantsChecked += 1;
      const verdict = gradeResponseField({ expected, inputProfile: profile }, variant);
      if (!verdict?.isCorrect) {
        recordFailure({
          area: 'assignment',
          file: path.relative(process.cwd(), file),
          location: trail.join('.'),
          expected,
          rejectedCorrectVariant: variant,
        });
      }
    }
  });
}

console.log('\n# MathMaster Correct Answer Acceptance Audit\n');
console.log(`Production bank files          : ${bankFiles.length}`);
console.log(`Active Path/CCMR templates     : ${templates}`);
console.log(`Generated/fixed instances      : ${instances}`);
console.log(`Path open-response fields      : ${pathFields}`);
console.log(`Teacher-import open responses  : ${assignmentFields}`);
console.log(`Known-correct variants checked : ${variantsChecked}`);
console.log(`False-negative findings        : ${failures.length}\n`);

if (failures.length) {
  failures.forEach((failure, index) => {
    console.log(`✗ ${index + 1}. ${failure.area.toUpperCase()} ${failure.id || failure.file || ''}`);
    if (failure.bank) console.log(`    bank      : ${failure.bank}`);
    if (failure.fieldId) console.log(`    field     : ${failure.fieldId} (${failure.profile})`);
    if (failure.expected !== undefined) console.log(`    expected  : ${JSON.stringify(failure.expected)}`);
    if (failure.rejectedCorrectVariant !== undefined) console.log(`    rejected  : ${JSON.stringify(failure.rejectedCorrectVariant)}`);
    if (failure.reason) console.log(`    reason    : ${failure.reason}`);
    if (failure.location) console.log(`    location  : ${failure.location}`);
  });
  console.log('\nBLOCKED: known-correct answers are still being rejected.');
  process.exit(1);
}

console.log('PASS: every conservative known-correct spelling checked by this audit is accepted.');
console.log('This is a regression gate: future bank/grader changes should keep this at zero.');
