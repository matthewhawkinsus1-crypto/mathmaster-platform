#!/usr/bin/env node
/*
 * DETERMINISTIC (NO-AI) HONORS COVERAGE — CHECK OR REGENERATE THE REPORT.
 *
 *   node scripts/report-honors-coverage.mjs           # check (exit 1 if stale)
 *   node scripts/report-honors-coverage.mjs --write   # regenerate docs/honors/
 *
 * The report is computed from the recipe registry and the Honors audit
 * (src/platform/rigor/honorsRecipeCoverage.js); see
 * scripts/lib/honorsCoverageDocument.mjs for what is written where.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHonorsCoverageReport } from '../src/platform/rigor/honorsRecipeCoverage.js';
import {
  COVERAGE_JSON_PATH,
  COVERAGE_MARKDOWN_PATH,
  renderHonorsCoverageJson,
  renderHonorsCoverageMarkdown,
} from './lib/honorsCoverageDocument.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = buildHonorsCoverageReport();
const outputs = [
  [COVERAGE_MARKDOWN_PATH, renderHonorsCoverageMarkdown(report)],
  [COVERAGE_JSON_PATH, renderHonorsCoverageJson(report)],
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
    stale.forEach(([relative]) => console.error(`${relative} is stale. Run: node scripts/report-honors-coverage.mjs --write`));
    process.exitCode = 1;
  } else {
    Object.values(report.courses).forEach((course) => {
      console.log(`${course.label}: ${Object.entries(course.familySummary).map(([status, count]) => `${status} ${count}`).join(' · ')} · ${course.concepts.length} concepts with no family`);
    });
  }
}
