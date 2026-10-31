#!/usr/bin/env node
/*
 * THE AUTHORED-WORDING AUDIT (CT17): does authored content point at a figure by
 * its colour alone ("the red line"), and does an English field hold a passage in
 * another language that nothing marks? Counts per class over the lesson imports,
 * the assignment documents and the question banks.
 *
 *   node scripts/audit-authored-wording.mjs                    counts per class
 *   node scripts/audit-authored-wording.mjs --items            and every finding, with its place
 *   node scripts/audit-authored-wording.mjs --path lesson.json  audit your own file or folder instead (before you import it)
 *   node scripts/audit-authored-wording.mjs --json out.json    the whole result
 *
 * Exit code 1 when a class that is certainly a defect has a finding (the others
 * are listed for a person to look at and never fail the run).
 * Read-only: it reads the files and writes nothing unless --json is given.
 * The classes and what each means are in scripts/lib/authoredWordingAudit.mjs.
 */
import { writeFileSync } from 'node:fs';

import { AUTHORED_CONTENT_SOURCES, auditContent } from './lib/authoredWordingAudit.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const showItems = args.includes('--items');
const jsonPath = option('--json');
const target = option('--path');

const result = auditContent({ targets: target ? [target] : AUTHORED_CONTENT_SOURCES });
console.log(`Authored-wording audit: ${result.files} files, ${result.strings} strings (${result.markedStrings} under a translation)\n`);
let failed = false;
for (const summary of Object.values(result.classes)) {
  const kind = summary.information ? '(information) ' : summary.certain ? '' : '(judgement) ';
  console.log(`${kind}${summary.id}: ${summary.strings} strings in ${summary.files.size} files`);
  console.log(`    ${summary.label}  [${summary.source}]`);
  if (summary.certain && summary.strings) failed = true;
  if (showItems || summary.certain) {
    summary.findings.slice(0, showItems ? undefined : 10).forEach((finding) => {
      console.log(`      ${finding.file} ${finding.path}  “${finding.snippet}” in: ${finding.text.replace(/\s+/g, ' ').slice(0, 140)}`);
    });
  }
}
if (jsonPath) {
  const plain = { ...result, classes: Object.fromEntries(Object.entries(result.classes).map(([id, summary]) => [id, { ...summary, files: [...summary.files] }])) };
  writeFileSync(jsonPath, `${JSON.stringify(plain, null, 2)}\n`);
  console.log(`\nWrote ${jsonPath}`);
}
process.exit(failed ? 1 : 0);
