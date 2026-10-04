#!/usr/bin/env node
/*
 * THE QUESTION FAMILY CAPABILITY REPORT — CHECK OR REGENERATE IT.
 *
 *   node scripts/report-question-family-capabilities.mjs           # check (exit 1 if stale)
 *   node scripts/report-question-family-capabilities.mjs --write   # regenerate docs/question-families/
 *
 * The report is computed from every registered family version
 * (functions/shared/questionFamilyCapabilities.mjs); see
 * scripts/lib/questionFamilyCapabilityDocument.mjs for what is written where.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildQuestionFamilyCapabilityReport } from '../functions/shared/questionFamilyCapabilities.mjs';
import {
  CAPABILITY_JSON_PATH,
  CAPABILITY_MARKDOWN_PATH,
  renderQuestionFamilyCapabilityJson,
  renderQuestionFamilyCapabilityMarkdown,
} from './lib/questionFamilyCapabilityDocument.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = buildQuestionFamilyCapabilityReport();
const outputs = [
  [CAPABILITY_MARKDOWN_PATH, renderQuestionFamilyCapabilityMarkdown(report)],
  [CAPABILITY_JSON_PATH, renderQuestionFamilyCapabilityJson(report)],
];

if (process.argv.includes('--write')) {
  outputs.forEach(([relative, text]) => {
    const target = path.join(ROOT, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    console.log(`wrote ${relative}`);
  });
} else {
  const stale = outputs.filter(([relative, text]) => {
    const target = path.join(ROOT, relative);
    return !fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text;
  });
  if (stale.length) {
    stale.forEach(([relative]) => console.error(`${relative} is stale. Run: node scripts/report-question-family-capabilities.mjs --write`));
    process.exitCode = 1;
  } else {
    report.families.forEach((family) => {
      console.log(`${family.id} v${family.version}: ${family.tools.map((tool) => tool.tool).join(', ')} · recovery ${family.recovery.ready ? 'ready' : 'not ready'} · ${family.capacity[0].exact ? '' : 'about '}${family.capacity[0].capacity} distinct`);
    });
  }
}
