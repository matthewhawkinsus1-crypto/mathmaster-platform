#!/usr/bin/env node
/**
 * THE REAL-ITEM GRADING PARITY AUDIT.
 *
 * Every gradable question in teacher-import-jsons (every section, every
 * Question Family slot on `--seats` seats), answered the way students answer
 * it, graded on the screen's path and on the server's, and both held to the
 * item's own key. See scripts/lib/gradingParityAudit/audit.mjs for what is
 * typed and how a verdict is judged, and
 * docs/audits/2026-11-28-grading-parity-real-items.md for the first run.
 *
 *   node scripts/audit-grading-parity-real-items.mjs [--seed S] [--seats 2]
 *        [--tool-cases 12] [--out report.json] [--markdown report.md]
 *
 * Exit 1 on any disagreement between the screen and the server, or on any
 * FIRM wrong verdict (a right answer the independent reading confirmed marked
 * wrong, or a wrong one marked right) that is not listed in
 * scripts/grading-parity-real-items-review.json, where each verdict the
 * owner is still to rule on is recorded with why it is left. The test
 * tests/platform/gradingParityRealItems.test.mjs runs a seeded slice of this
 * on every pull request.
 *
 * Read only: writes only --out and --markdown.
 */
import { writeFileSync } from 'node:fs';
import { groupBySignature, runRealItemAudit, runToolItemParity, signatureOf } from './lib/gradingParityAudit/audit.mjs';
import { readReviewList, unlistedFirm } from './lib/gradingParityAudit/reviewList.mjs';

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const seed = argOf('--seed', 'real-items');
const seats = Math.max(1, Number(argOf('--seats', '2')) || 2);
const toolCases = Math.max(0, Number(argOf('--tool-cases', '12')) || 0);
const out = argOf('--out', null);
const markdown = argOf('--markdown', null);

const started = performance.now();
const typed = runRealItemAudit({ seed, seats });
const tools = toolCases ? await runToolItemParity({ seed, seats, perItem: toolCases }) : { items: 0, cases: 0, bySurface: {}, findings: [] };
const ms = Math.round(performance.now() - started);

const toolFailures = tools.findings.filter((found) => found.severity === 'fail');
const toolParity = tools.findings.filter((found) => found.property === 'device-server-parity');
const review = readReviewList();
const firmUnlisted = unlistedFirm(typed.wrongVerdicts, review);

const summary = {
  seed,
  seats,
  ms,
  lessons: typed.counts.lessons,
  items: typed.counts.items,
  typedItems: typed.counts.typedItems,
  typedBoxes: typed.counts.boxes,
  typedAnswers: typed.counts.answers,
  answersByCategory: typed.counts.byCategory,
  itemsBySurface: typed.counts.bySurface,
  toolItems: tools.items,
  toolCases: tools.cases,
  disagreements: typed.disagreements.length + toolParity.length,
  wrongVerdicts: typed.wrongVerdicts.length,
  wrongVerdictsFirm: typed.wrongVerdicts.filter((row) => row.firm).length,
  wrongVerdictsFirmUnlisted: firmUnlisted.length,
  keyNotRight: typed.keyNotRight.length,
  toolFindingsFailing: toolFailures.length,
  lessonsThatDidNotCompile: typed.failures.length,
};

console.log(JSON.stringify(summary, null, 2));
for (const group of groupBySignature(typed.disagreements)) console.log(`DISAGREE ${group.count}  ${group.signature}\n  e.g. ${JSON.stringify(group.examples[0])}`);
for (const found of toolParity.slice(0, 20)) console.log(`DISAGREE (tool) ${found.signature}  ${found.message}`);
for (const group of groupBySignature(typed.wrongVerdicts)) console.log(`WRONG ${group.count}  ${group.signature}\n  e.g. ${group.examples[0].item} key ${JSON.stringify(group.examples[0].key)} typed ${JSON.stringify(group.examples[0].input)}`);
for (const row of firmUnlisted.slice(0, 40)) console.log(`UNLISTED FIRM  ${signatureOf(row)}  ${row.item} ${JSON.stringify(row.input)}`);

if (out) writeFileSync(out, `${JSON.stringify({ summary, typed, tools }, null, 1)}\n`);
if (markdown) {
  const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const code = (value) => `\`${cell(value) || ' '}\``;
  const lines = [
    `# Real-item grading parity: run of seed \`${seed}\``,
    '',
    `${summary.items} item instances from ${summary.lessons} lessons; ${summary.typedAnswers} typed answers in ${summary.typedBoxes} boxes; ${summary.toolCases} pieces of tool work on ${summary.toolItems} tool items.`,
    '',
    `Disagreements: ${summary.disagreements}. Wrong verdicts: ${summary.wrongVerdicts} (${summary.wrongVerdictsFirm} firm, ${summary.wrongVerdictsFirmUnlisted} firm and not on the review list).`,
    '',
    '| Type | Item | Box | Input | Expected | Screen | Server |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...[...typed.disagreements, ...typed.wrongVerdicts].map((row) => `| ${cell(row.type)} | ${cell(row.item)} | ${cell(row.box)} | ${code(row.input)} | ${row.expected} (key ${code(row.key)}) | ${cell(row.screen)} | ${cell(row.server)} |`),
    '',
  ];
  writeFileSync(markdown, lines.join('\n'));
}
process.exit(summary.disagreements || firmUnlisted.length || toolFailures.length ? 1 : 0);
