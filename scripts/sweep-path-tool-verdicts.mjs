#!/usr/bin/env node
/**
 * My Math Path tool verdicts: a base tree's Path contracts against this tree's,
 * on every live item.
 *
 * WHY. Moving a Path tool contract onto a shared grader's rule (MP07) changes
 * live Path verdicts, and the rule for that is the one the equivalence sweep
 * enforces for fields: a right answer must never become wrong. The unit tests
 * pin the cases someone thought of; this grades every live tool item.
 *
 * HOW. The corpus is scripts/lib/pathToolParity.mjs: every live family of the
 * course release whose tool MP07 names, drawn by the production generator and
 * issued as issueNextQuestion stores it, answered with the tool's own work
 * (right answers, near answers, wrong answers, shapes today's tool no longer
 * sends). Each probe is graded three ways:
 *
 *   before     the base tree's contract, on the definition the base issues;
 *   after      this tree's contract, on the definition this tree issues;
 *   in flight  this tree's contract, on the definition the BASE issued — a
 *              question issued before the change and answered after it,
 *              because the private grading is stored when a question is
 *              issued and read back when it is answered.
 *
 * OUTPUT. Every probe whose verdict moved, item by item, and a summary. Exit 1
 * when a probe built as a right answer moves from right to wrong, either way,
 * or when a live draw did not issue (it was not swept).
 *
 *   git archive <base-commit> functions/shared | tar -x -C /tmp/base
 *   ln -s "$PWD/node_modules" /tmp/base/node_modules
 *   node scripts/sweep-path-tool-verdicts.mjs --base /tmp/base [--draws 3] [--out moves.json]
 *
 * Read-only: it writes only the --out file.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { liveToolItems, pathVerdict, probesFor } from './lib/pathToolParity.mjs';

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const BASE = argOf('--base', null);
const DRAWS = Math.max(1, Number(argOf('--draws', '3')) || 3);
const OUT = argOf('--out', null);
if (!BASE) {
  console.error('usage: node scripts/sweep-path-tool-verdicts.mjs --base <directory holding the base commit\'s functions/shared> [--draws N] [--out file]');
  process.exit(2);
}

const base = await import(pathToFileURL(path.resolve(BASE, 'functions/shared/pathToolContracts.mjs')).href);
const current = await import(pathToFileURL(path.resolve('functions/shared/pathToolContracts.mjs')).href);

const verdictText = (verdict) => (verdict.rejected ? `refused (${verdict.reason})` : verdict.isCorrect ? 'right' : 'wrong');
const { items, skipped } = await liveToolItems({ draws: DRAWS });
const moves = [];
let graded = 0;
for (const item of items) {
  const baseDefinition = base.buildPrivateToolGrading(item.question);
  for (const probe of probesFor(item.toolId, item.question)) {
    graded += 1;
    const before = pathVerdict(baseDefinition, probe.raw, base);
    const after = pathVerdict(item.stored.privateGrading, probe.raw, current);
    const inFlight = pathVerdict(baseDefinition, probe.raw, current);
    const was = verdictText(before);
    if (was === verdictText(after) && was === verdictText(inFlight)) continue;
    moves.push({
      courseId: item.courseId,
      id: item.id,
      draw: item.draw,
      toolId: item.toolId,
      tag: probe.tag,
      intent: probe.intent,
      before: was,
      after: verdictText(after),
      inFlight: verdictText(inFlight),
    });
  }
}

const rightToWrong = moves.filter((move) => move.intent === 'right' && move.before === 'right' && (move.after !== 'right' || move.inFlight !== 'right'));
const byItem = new Map();
moves.forEach((move) => {
  const key = `${move.courseId} ${move.id} (${move.toolId})`;
  if (!byItem.has(key)) byItem.set(key, []);
  byItem.get(key).push(move);
});

console.log(`${items.length} live tool items (${DRAWS} draws per generated row), ${graded} probes graded, ${moves.length} verdicts moved.`);
for (const [item, entries] of byItem) {
  console.log(`\n${item}`);
  entries.forEach((move) => console.log(`  ${move.draw ?? 'fixed'}  [${move.intent}] ${move.tag}: ${move.before} -> ${move.after}${move.inFlight === move.after ? '' : ` (in flight: ${move.inFlight})`}`));
}
// A draw that did not issue was not swept, so the sweep cannot vouch for it.
skipped.forEach((entry) => console.log(`NOT SWEPT: ${entry.courseId} ${entry.id} ${entry.draw ?? 'fixed'} (${entry.reason})`));
console.log(`\nRight answers moved from right to wrong: ${rightToWrong.length}`);
if (OUT) writeFileSync(OUT, `${JSON.stringify({ draws: DRAWS, items: items.length, probes: graded, skipped, moves }, null, 2)}\n`);
process.exit(rightToWrong.length || skipped.length ? 1 : 0);
