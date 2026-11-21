#!/usr/bin/env node
/*
 * WHICH CLASSWORK QUESTIONS HAVE A WORKED EXAMPLE. A READ-ONLY REPORT (WE-B).
 *
 *   node scripts/report-classwork-example-coverage.mjs           # per lesson, then the totals
 *   node scripts/report-classwork-example-coverage.mjs --list    # and each uncovered question, with what would cover it
 *   node scripts/report-classwork-example-coverage.mjs --json    # the whole measurement as JSON
 *
 * It reads the lesson files in teacher-import-jsons/ and nothing else: no
 * Firestore, no network, no write. Each Classwork question is checked as
 * QuestionEngine receives it, by the rules of
 * src/platform/supports/workedExample/classworkCoverage.js (WORKED_EXAMPLES.md
 * section 6): its own example, a built-in one, an earlier question on the same
 * skill, exempt, or uncovered with what would cover it (a generator, or an
 * example the lesson writes). Existing lessons are not back-filled (the
 * owner's scope): this is information, so the gaps are known.
 */
import process from 'node:process';
import { measureClassworkExampleCoverage } from './lib/classworkExampleCoverageReport.mjs';
import { fillWithText } from '../src/platform/supports/workedExample/classworkCoverage.js';

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((arg) => !['--list', '--json', '--help'].includes(arg));
if (args.has('--help') || unknown.length) {
  console.log('Usage: node scripts/report-classwork-example-coverage.mjs [--list] [--json]');
  process.exit(unknown.length ? 2 : 0);
}

const measured = measureClassworkExampleCoverage({ root: process.cwd() });

if (args.has('--json')) {
  console.log(JSON.stringify(measured, null, 2));
  process.exit(0);
}

const pad = (value, width) => String(value).padStart(width);
console.log('Classwork worked-example coverage (read-only; teacher-import-jsons/)\n');
console.log(`${'own'.padStart(4)} ${'built-in'.padStart(8)} ${'earlier'.padStart(7)} ${'exempt'.padStart(6)} ${'uncovered'.padStart(9)}  covered  lesson`);
for (const lesson of measured.lessons) {
  const { byStatus, covered, total, exempt } = lesson.summary;
  console.log(`${pad(byStatus.own, 4)} ${pad(byStatus.builtIn, 8)} ${pad(byStatus.earlierSameSkill, 7)} ${pad(byStatus.exempt, 6)} ${pad(byStatus.uncovered, 9)}  ${pad(`${covered}/${total - exempt}`, 7)}  ${lesson.file}`);
  if (args.has('--list')) {
    lesson.questions.filter((entry) => entry.status === 'uncovered').forEach((entry) => {
      console.log(`        Question ${entry.questionNumber} (${entry.questionId || 'no id'}, ${entry.skill || 'no skill'}): ${fillWithText(entry.fillWith)}${entry.missingExample ? `; names example "${entry.missingExample}", which the lesson does not have` : ''}`);
    });
  }
}

const { summary } = measured;
console.log('\nTotals');
console.log(`  Lessons with a Classwork section: ${measured.lessonsWithClasswork}`);
console.log(`  Classwork questions: ${summary.total}`);
console.log(`  With a built-in example: ${summary.byStatus.builtIn} of ${summary.total}`);
console.log(`  Lessons with no built-in example on any Classwork question: ${measured.lessonsWithNoBuiltIn} of ${measured.lessonsWithClasswork}`);
console.log(`  Covered (own ${summary.byStatus.own}, built-in ${summary.byStatus.builtIn}, earlier question on the same skill ${summary.byStatus.earlierSameSkill}): ${summary.covered}`);
console.log(`  Exempt: ${summary.exempt}`);
console.log(`  Uncovered: ${summary.uncovered} (a generator could cover ${summary.byFill.generator}; ${summary.byFill.authoredExample} need an authored example)`);
console.log('  Uncovered by kind:');
Object.entries(summary.byKind).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([kind, count]) => console.log(`    ${kind} ${count}`));
