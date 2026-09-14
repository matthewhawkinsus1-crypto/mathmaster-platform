import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { RELEASE_STATUS_LABELS, PATH_RELEASE_PHASE_LABELS } from '../../functions/shared/pathReleasePlan.mjs';
import { describeReleaseCounts, describeReleaseDiagnostic, RELEASE_PHASE_MESSAGES } from '../../src/platform/path/pathReleaseV2Presentation.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const panel = read('src/components/teacher/PathReleaseV2Panel.jsx');
const service = read('src/platform/path/pathReleaseV2Service.js');
const admin = read('src/components/teacher/PathCoverageAudit.jsx');

// Administration -> My Math Path content coverage. The contract is that an
// administrator can see what is deployed, what production is serving, what a
// running release is doing, and — when something fails — which document and
// which property, without opening Cloud Functions logs.

test('the admin page renders the release control and imports what it renders', () => {
  // A call with no import is a runtime ReferenceError that every other check
  // here would pass, so assert the import next to the use.
  assert.match(admin, /import PathReleaseV2Panel from '\.\/PathReleaseV2Panel\.jsx';/);
  assert.match(admin, /<PathReleaseV2Panel \/>/);

  assert.match(panel, /from '\.\.\/\.\.\/platform\/path\/pathReleaseV2Service\.js'/);
  assert.match(panel, /publishCoursePathRelease/);
  assert.match(panel, /resumeCoursePathRelease/);
  assert.match(panel, /fetchCoursePathReleaseStatus/);
});

test('the release workflow shows every phase it can be in', () => {
  const expected = [
    'Certified release detected',
    'Comparing with production',
    'Staging',
    'Activating',
    'Rebuilding coverage',
    'Verifying',
    'Complete',
  ];
  expected.forEach((label) => {
    assert.ok(Object.values(RELEASE_PHASE_MESSAGES).includes(label), `${label} is a phase the UI can name`);
    assert.ok(Object.values(PATH_RELEASE_PHASE_LABELS).includes(label), `${label} matches the server's own phase label`);
  });

  // The panel walks the phases in order rather than printing one opaque status.
  const progress = region(panel, 'PHASE_ORDER.map', '</ol>', 'phase progress list');
  assert.match(progress, /RELEASE_PHASE_MESSAGES\[phase\]/);
  assert.match(progress, /completedChunks/);
  assert.match(progress, /totalChunks/);
});

test('the four states an administrator acts on are all distinguishable', () => {
  assert.equal(RELEASE_STATUS_LABELS.current, 'Production is current');
  assert.equal(RELEASE_STATUS_LABELS.interrupted, 'Resume release');
  assert.equal(RELEASE_STATUS_LABELS['activation-required'], 'Activation required');
  assert.equal(RELEASE_STATUS_LABELS.failed, 'Release failed');

  assert.match(panel, /Publish certified course Path release/);
  assert.match(panel, /Resume release/);
  assert.match(panel, /Production is current\./);
  assert.match(panel, /already serving this certified release/);

  // Publishing is refused when there is nothing to publish or nothing to trust.
  const publishButton = region(panel, "onClick={() => run('publish')}", '</button>', 'publish button');
  assert.match(publishButton, /status === 'current'/);
  assert.match(publishButton, /status === 'no-artifact'/);
  assert.match(publishButton, /status === 'deployment-mismatch'/);

  // Resume is offered exactly when a release stopped or failed.
  const resume = region(panel, "status === 'interrupted'", 'Resume release', 'resume control');
  assert.match(resume, /status === 'failed'/);
});

test('a deployment mismatch says exactly what differs rather than "out of date"', () => {
  const mismatch = region(panel, "status === 'deployment-mismatch'", 'Deploy Hosting and the path-admin codebase', 'mismatch panel');
  assert.match(mismatch, /browserReleaseId/);
  assert.match(mismatch, /serverReleaseId/);
  assert.match(mismatch, /differs/);
});

test('a failure surfaces phase, document, property path and the next action', () => {
  const diagnostic = describeReleaseDiagnostic({
    phase: 'staging',
    code: 'path-release/document-uncertified',
    message: 'A compiled Path document is not storable.',
    questionId: 'mm_A2_4E_v2_quadratic-regression-table',
    familyId: 'A2.4E-regression',
    propertyPath: 'variants[2].stimulus.table.rows[1]',
    diagnosticId: 'path-release-9f2c',
    recoverable: false,
    nextAction: 'Fix the authored content at the reported property path.',
  });

  assert.equal(diagnostic.headline, 'A compiled Path document is not storable.');
  assert.match(diagnostic.where, /phase staging/);
  assert.match(diagnostic.where, /question mm_A2_4E_v2_quadratic-regression-table/);
  assert.match(diagnostic.where, /family A2\.4E-regression/);
  assert.match(diagnostic.where, /at variants\[2\]\.stimulus\.table\.rows\[1\]/);
  assert.match(diagnostic.where, /diagnostic path-release-9f2c/);
  assert.equal(diagnostic.recoverable, false);
  assert.equal(describeReleaseDiagnostic(null), null);

  // And the panel renders those fields rather than a generic message.
  const failureBlock = region(panel, 'diagnostic ? (', 'error ? (', 'diagnostic block');
  assert.match(failureBlock, /diagnostic\.headline/);
  assert.match(failureBlock, /diagnostic\.where/);
  assert.match(failureBlock, /diagnostic\.code/);
  assert.match(failureBlock, /diagnostic\.nextAction/);
  assert.match(failureBlock, /Recoverable\./);
});

test('the change plan is reported in all four categories', () => {
  assert.equal(
    describeReleaseCounts({ added: 3, changed: 1, unchanged: 1157, removed: 2 }),
    '3 added · 1 changed · 1157 unchanged · 2 superseded',
  );
  assert.equal(describeReleaseCounts(null), null);
  assert.match(panel, /describeReleaseCounts/);
});

test('publishing resumes across server passes instead of one long call', () => {
  const runner = region(service, 'const runReleasePass', 'export const publishCoursePathRelease', 'release runner');
  assert.match(runner, /while \(pass < maxPasses\)/);
  assert.match(runner, /if \(!last\.continue\) return last;/);
  assert.match(runner, /if \(!last\.ok\) return last;/);
  assert.match(runner, /onProgress\?\.\(/);
});

test('the browser sends the release identity its own bundle was built from', () => {
  assert.match(service, /import \{ DEPLOYED_COURSE_PATH_RELEASE \} from '\.\/pathReleaseManifest\.generated\.js'/);
  const status = region(service, 'export const fetchCoursePathReleaseStatus', '};', 'status call');
  assert.match(status, /browserManifest: deployedBrowserRelease\(\)/);
});

test('no question or answer content crosses the client boundary', () => {
  const code = executableSource(service);
  ['responseFields', 'expected', 'privateGrading', 'solutionReview', 'generator'].forEach((forbidden) => {
    assert.doesNotMatch(code, new RegExp(`\\b${forbidden}\\b`), `${forbidden} must never be read in the browser`);
  });
  assert.doesNotMatch(executableSource(panel), /\bresponseFields\b|\bprivateGrading\b/);
});

test('the legacy one-shot course refresh is deprecated and no longer the normal route', () => {
  const deprecated = region(admin, 'Deprecated: one-shot course refresh', '</details>', 'deprecated course refresh');
  assert.match(deprecated, /Superseded by the certified course Path release/);
  assert.match(deprecated, /Refresh course Path bank/);
  assert.match(deprecated, /cannot be resumed/);
  // It is a quiet, collapsed fallback — not one of the page's primary actions.
  assert.match(deprecated, /style=\{quiet\}/);
  assert.doesNotMatch(deprecated, /style=\{primary\}/);
});

test('the specialised ASVAB and SAT/ACT/TSIA2 releases keep their own controls', () => {
  assert.match(admin, /Refresh ASVAB release/);
  assert.match(admin, /Refresh SAT \/ ACT \/ TSIA2 release/);
  assert.match(admin, /refreshReleasedAsvabPathBank/);
  assert.match(admin, /refreshReleasedCcmrPathBanks/);
  assert.match(admin, /atomic and preserves the independently tracked ASVAB release/);

  // The V2 control is for course content only and must not claim otherwise.
  assert.match(panel, /Grade 6, Grade 7, Grade 8, Algebra I and Algebra II/);
  assert.doesNotMatch(executableSource(panel), /asvab|digitalSAT|tsia2/i);
});
