/*
 * EVERY PAGE PRINTS, EXCEPT A SECURE TEST IN PROGRESS (the owner, 2026-11-19).
 *
 * The support evidence report's print rule hid `body *`, and its sheet links on
 * every signed-in page (src/app/shell/leadingStyles.js). So every page but the
 * report and the case review printed blank, and App.css's print rules for class
 * lists never showed. It now holds only while the report is open
 * (body:has(.se-report)).
 *
 * A secure test's questions had been kept off paper only by that accident.
 * App.css now keeps them off on purpose, while the test's surface is on the
 * screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCss } from './helpers/cssRules.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const printRules = (file) => parseCss(read(file)).filter((rule) => rule.atRules.some((atRule) => /print/.test(atRule)));
const hides = (rule) => rule.declarations.visibility?.value === 'hidden' || rule.declarations.display?.value === 'none';
// The sheets with print rules a signed-in page can have linked.
const SHEETS = [
  'src/index.css',
  'src/App.css',
  'src/components/teacher/supportEvidencePrint.css',
  'src/components/teacher/supportEvidence.css',
  'src/components/teacher/caseReview/caseReview.css',
];

test('no print rule hides the whole page unless something on the page asks for it', () => {
  for (const file of SHEETS) {
    for (const rule of printRules(file).filter(hides)) {
      for (const selector of rule.selectors) {
        assert.doesNotMatch(selector.trim(), /^(?:html|body)\s*(?:>\s*)?\*$/, `${file}: "${selector}" hides every page in print`);
      }
    }
  }
});

test('the support report hides the rest of a printed page only while it is open', () => {
  const rules = printRules('src/components/teacher/supportEvidencePrint.css');
  assert.ok(rules.some((rule) => rule.selectors.includes('body:has(.se-report) *') && rule.declarations.visibility?.value === 'hidden'));
  // The report is the element the rule asks for.
  assert.match(read('src/components/teacher/SupportEvidenceReportView.jsx'), /className="se-report"/);
});

test('a secure test in progress prints nothing', () => {
  const rules = printRules('src/App.css');
  assert.ok(rules.some((rule) => rule.selectors.includes('body:has([data-secure-exam-surface]) *') && rule.declarations.visibility?.value === 'hidden'));
  // The attribute is on the surface a student takes the test in.
  assert.match(read('src/components/assessment/SecureExamContainer.jsx'), /data-secure-exam-surface=""/);
});
