#!/usr/bin/env node
/*
 * THE SERVER-GRADING COVERAGE MATRIX, BEFORE AND AFTER.
 *
 * docs/architecture/SERVER_GRADING_COVERAGE.md carries two generated tables:
 *
 *   BEFORE — the frozen Phase 1 audit (docs/architecture/server-grading-audit.json),
 *            one row per traced tool / type / mode on main before this work.
 *   AFTER  — the live grading manifest (functions/shared/serverGrading/
 *            gradingManifest.mjs), one row per surface and mode.
 *
 * The AFTER table is generated, never hand-edited, so the document cannot
 * claim a coverage the code does not declare. tests/platform/
 * serverGradingCoverageGate.test.mjs fails when the document is stale.
 *
 *   node scripts/report-server-grading-coverage.mjs           # check (exit 1 if stale)
 *   node scripts/report-server-grading-coverage.mjs --write   # regenerate the tables
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gradingCoverageSummary } from '../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../functions/shared/serverGrading/gradingAuthority.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COVERAGE_DOC = path.join(ROOT, 'docs/architecture/SERVER_GRADING_COVERAGE.md');
export const AUDIT_JSON = path.join(ROOT, 'docs/architecture/server-grading-audit.json');

const cell = (value) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .replace(/\|/g, '\\|')
  .trim();

// The first clause of a traced finding — the verdict, without the evidence.
const verdict = (value, limit = 90) => {
  const source = cell(Array.isArray(value) ? value.join('; ') : value);
  const [first] = source.split(/(?<=[.;])\s|\s—\s|\s-\s/);
  const clause = (first || source).replace(/[.;]$/, '');
  return clause.length > limit ? `${clause.slice(0, limit - 1).trimEnd()}…` : clause;
};

const AUTHORITY_LABEL = Object.freeze({
  [GRADING_AUTHORITY.SHARED_SERVER]: 'shared server grader',
  [GRADING_AUTHORITY.SPECIALIZED_SUBSYSTEM]: 'specialized server subsystem',
  [GRADING_AUTHORITY.CLIENT_GRADED]: 'client-graded (documented blocker)',
  [GRADING_AUTHORITY.NON_GRADED]: 'non-graded / read-only',
});

const BEFORE_LABEL = Object.freeze({
  'server-authoritative': 'server-authoritative',
  'server-authoritative-special-subsystem-only': 'special subsystem only',
  'server-rebuildable-question-family-only': 'Question Family only',
  'client-verdict-sanitized': 'client verdict, sanitized',
  'non-graded-read-only': 'non-graded / read-only',
});

const countBy = (rows, key) => rows.reduce((counts, row) => {
  counts[row[key]] = (counts[row[key]] || 0) + 1;
  return counts;
}, {});

/** The BEFORE matrix: the frozen audit, grouped the way it was traced. */
export const renderBeforeMatrix = (audit = JSON.parse(fs.readFileSync(AUDIT_JSON, 'utf8'))) => {
  const lines = [];
  const counts = countBy(audit.entries, 'classification');
  lines.push(`${audit.entries.length} traced entries on ${audit.snapshotOf}.`, '');
  lines.push('| Before | Entries |', '| --- | ---: |');
  Object.keys(BEFORE_LABEL).forEach((key) => lines.push(`| ${BEFORE_LABEL[key]} | ${counts[key] || 0} |`));
  Object.entries(audit.groups).forEach(([group, title]) => {
    const rows = audit.entries.filter((entry) => entry.auditGroup === group);
    if (!rows.length) return;
    lines.push('', `#### ${cell(title)}`, '');
    lines.push('| Entry | Before | Server-authoritative before? | Question Family | Deadline finalization | Recovery |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    rows.forEach((entry) => {
      lines.push(`| \`${cell(entry.id)}\` | ${BEFORE_LABEL[entry.classification] || cell(entry.classification)} | ${verdict(entry.serverAuthoritativeExists)} | ${verdict(entry.questionFamilyCompat, 60)} | ${verdict(entry.deadlineFinalizationCompat, 60)} | ${verdict(entry.recoveryCompat, 60)} |`);
    });
  });
  return lines.join('\n');
};

/** The AFTER matrix: every surface and mode the manifest declares. */
export const renderAfterMatrix = (summary = gradingCoverageSummary()) => {
  const rows = summary.flatMap((entry) => (entry.kind === 'tool'
    ? entry.modes.map((mode) => ({ surface: entry.surfaceId, kind: 'tool', mode: mode.mode, authority: mode.authority, note: mode.blocker }))
    : [{ surface: entry.surfaceId, kind: entry.kind, mode: '—', authority: entry.authority, note: entry.blocker || (entry.subsystem ? `Subsystem: ${entry.subsystem}` : '') }]));
  const counts = countBy(rows, 'authority');
  const lines = [];
  lines.push(`${summary.length} surfaces, ${rows.length} surface/mode rows.`, '');
  lines.push('| After | Surface/mode rows |', '| --- | ---: |');
  Object.keys(AUTHORITY_LABEL).forEach((key) => lines.push(`| ${AUTHORITY_LABEL[key]} | ${counts[key] || 0} |`));
  lines.push('', '| Surface | Kind | Mode | Authority | Reason / subsystem |', '| --- | --- | --- | --- | --- |');
  rows.forEach((row) => {
    lines.push(`| \`${cell(row.surface)}\` | ${cell(row.kind)} | ${row.mode === '—' ? '—' : `\`${cell(row.mode)}\``} | ${AUTHORITY_LABEL[row.authority] || cell(row.authority)} | ${cell(row.note)} |`);
  });
  return lines.join('\n');
};

const MARKERS = Object.freeze({
  before: ['<!-- grading-coverage:before:start (generated: node scripts/report-server-grading-coverage.mjs --write) -->', '<!-- grading-coverage:before:end -->'],
  after: ['<!-- grading-coverage:after:start (generated: node scripts/report-server-grading-coverage.mjs --write) -->', '<!-- grading-coverage:after:end -->'],
});

const replaceBetween = (document, [start, end], body) => {
  const from = document.indexOf(start);
  const to = document.indexOf(end);
  if (from < 0 || to < from) throw new Error(`Coverage document is missing the markers ${start} … ${end}`);
  return `${document.slice(0, from + start.length)}\n${body}\n${document.slice(to)}`;
};

/** The document as it should read now. */
export const renderCoverageDocument = (document = fs.readFileSync(COVERAGE_DOC, 'utf8')) => (
  replaceBetween(replaceBetween(document, MARKERS.before, renderBeforeMatrix()), MARKERS.after, renderAfterMatrix())
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const current = fs.readFileSync(COVERAGE_DOC, 'utf8');
  const next = renderCoverageDocument(current);
  if (process.argv.includes('--write')) {
    if (next !== current) fs.writeFileSync(COVERAGE_DOC, next);
    console.log(`${path.relative(ROOT, COVERAGE_DOC)} ${next === current ? 'already current' : 'regenerated'}.`);
  } else if (next !== current) {
    console.error(`${path.relative(ROOT, COVERAGE_DOC)} is stale. Run: node scripts/report-server-grading-coverage.mjs --write`);
    process.exitCode = 1;
  } else {
    console.log(`${path.relative(ROOT, COVERAGE_DOC)} is current.`);
  }
}
