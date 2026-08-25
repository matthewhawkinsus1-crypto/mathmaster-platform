#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fullDiagnostic = path.join(here, 'diagnose-digital-sat-v2-1-release.mjs');
const mode = process.argv[2] || '--summary';
const result = spawnSync(process.execPath, [fullDiagnostic], { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}
const report = JSON.parse(result.stdout);

if (mode === '--clones') {
  console.log(JSON.stringify({
    exactGrammarGroups: report.exactGrammarGroups,
    highSimilarityPairs: report.highSimilarityPairs,
  }, null, 2));
} else if (mode === '--spr-summary') {
  console.log(JSON.stringify({
    documents: report.documents,
    mcq: report.mcq,
    spr: report.spr,
    mcqRate: report.mcqRate,
    target75McqNeeded: report.target75McqNeeded,
    min68McqNeeded: report.min68McqNeeded,
    byDomainRoleFormat: report.byDomainRoleFormat,
    sprInventory: {
      byAnswerSource: report.sprInventory.byAnswerSource,
      withExistingChoices: report.sprInventory.withExistingChoices,
      groups: report.sprInventory.groups,
    },
  }, null, 2));
} else {
  console.log(JSON.stringify({
    documents: report.documents,
    mcq: report.mcq,
    spr: report.spr,
    mcqRate: report.mcqRate,
    target75McqNeeded: report.target75McqNeeded,
    min68McqNeeded: report.min68McqNeeded,
    exactGrammarGroups: report.exactGrammarGroups.length,
    highSimilarityPairs: report.highSimilarityPairs.length,
    sprByAnswerSource: report.sprInventory.byAnswerSource,
    sprWithExistingChoices: report.sprInventory.withExistingChoices,
  }, null, 2));
}
