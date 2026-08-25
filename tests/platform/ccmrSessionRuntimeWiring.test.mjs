import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

function indexOfOrFail(fragment, message) {
  const index = source.indexOf(fragment);
  assert.notEqual(index, -1, message || `Expected functions/index.js to contain: ${fragment}`);
  return index;
}

test('Path runtime imports the CCMR content release guard', () => {
  assert.match(source, /const\s+pathContentRelease\s*=\s*require\(["']\.\/lib\/pathContentRelease["']\)/);
});

test('session start resolves the target framework release and stamps new sessions', () => {
  indexOfOrFail('pathContentRelease.resolveAssessmentContentRelease(frameworkRecords, assessmentFramework)', 'startMyMathPathSession must resolve the current release from target-framework families');
  indexOfOrFail('assessmentContentRelease: assessmentReleaseState.tracked ? assessmentReleaseState.release : null', 'new assessment sessions must persist the server-owned content release marker');
  indexOfOrFail('pathContentRelease.planSessionContentReleaseAction(existing.data(), assessmentReleaseState)', 'active-lock reuse must check whether the existing session is stale');
  indexOfOrFail('pathContentRelease.supersedeSessionForContentRelease(existing.data(), assessmentReleaseState.release, now)', 'stale reusable sessions must be superseded rather than resumed');
});

test('question issue preserves an already-open stale question before checking release', () => {
  const issueStart = indexOfOrFail('exports.issueNextQuestion = onCall');
  const openQuestionReturn = source.indexOf('if (session.currentQuestion) {', issueStart);
  const releaseCheck = source.indexOf('pathContentRelease.resolveAssessmentContentRelease(targetFrameworkRecords, session.assessmentFramework)', issueStart);
  assert.notEqual(openQuestionReturn, -1, 'issueNextQuestion must preserve its existing open-question return');
  assert.notEqual(releaseCheck, -1, 'issueNextQuestion must resolve the current release before issuing a new question');
  assert.ok(openQuestionReturn < releaseCheck, 'an already-issued question must be returned before any stale-session rollover check');
});

test('question issue supersedes stale empty sessions and returns a domain rollover payload', () => {
  indexOfOrFail('pathContentRelease.planSessionContentReleaseAction(session, issueReleaseState)', 'issueNextQuestion must evaluate the session against the current target-framework release');
  indexOfOrFail('pathContentRelease.supersedeSessionForContentRelease(freshData, issueReleaseState.release, now)', 'issueNextQuestion must transactionally supersede a stale session with no open question');
  indexOfOrFail('reason: pathContentRelease.RELEASE_CHANGE_REASON', 'rollover payload must expose the stable release-change reason');
  indexOfOrFail('assessmentFramework: session.assessmentFramework', 'rollover payload must preserve assessment framework for restart');
  indexOfOrFail('targetAlignmentKey: session.target.alignmentKey', 'rollover payload must preserve the original target for restart');
});
