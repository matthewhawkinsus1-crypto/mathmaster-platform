import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTexasStandardsForCourse } from '../../functions/shared/texasStandards.mjs';
import { getWheelTeksForCourse, courseIdForTeks } from '../../src/platform/mastery/strandConfig.js';

const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const coverageService = readFileSync(new URL('../../src/platform/path/pathCoverageService.js', import.meta.url), 'utf8');
const auditSource = readFileSync(new URL('../../src/components/teacher/PathCoverageAudit.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

test('coverage is server-authoritative and no longer accepts browser wheel mappings', () => {
  const rebuildStart = functionsSource.indexOf('exports.rebuildPathCoverage');
  const rebuildEnd = functionsSource.indexOf('exports.diagnosePathSkill', rebuildStart);
  const rebuildBlock = functionsSource.slice(rebuildStart, rebuildEnd);
  assert.match(rebuildBlock, /requireRootAdmin\(request\)/);
  assert.doesNotMatch(rebuildBlock, /wheelTeksByCourse/);
  assert.match(functionsSource, /canonicalPathStandardsForCourse/);
  assert.match(functionsSource, /getTexasStandardsForCourse/);
  assert.doesNotMatch(coverageService, /getWheelTeksForCourse/);
  assert.doesNotMatch(coverageService, /wheelTeksByCourse/);
});

test('all five active Texas Path courses use their own canonical content standards', () => {
  for (const courseId of ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2']) {
    const canonical = getTexasStandardsForCourse(courseId)
      .filter((standard) => standard.classification !== 'process')
      .map((standard) => standard.code);
    assert.deepEqual(getWheelTeksForCourse(courseId), canonical, `${courseId} wheel must use its own standards`);
  }
  assert.equal(courseIdForTeks('6.4A'), 'grade6');
  assert.equal(courseIdForTeks('7.6H'), 'grade7');
  assert.equal(courseIdForTeks('8.5I'), 'grade8');
  assert.equal(courseIdForTeks('A.5A'), 'algebra1');
  assert.equal(courseIdForTeks('A2.3A'), 'algebra2');
});

test('built-in initialization does not trigger a second client coverage rebuild', () => {
  const start = coverageService.indexOf('export const initializeBundledPathBankStarter');
  const end = coverageService.indexOf('/**\n * A predicate bound', start);
  const block = coverageService.slice(start, end);
  assert.doesNotMatch(block, /await rebuildPathCoverage/);
  assert.match(block, /raw\.coverage/);
});

test('starter refresh replaces bank documents instead of merging stale question shapes', () => {
  const start = functionsSource.indexOf('async function processPathSeedImport');
  const end = functionsSource.indexOf('exports.seedPathQuestionBank', start);
  const block = functionsSource.slice(start, end);
  assert.match(block, /replacementWrites/);
  assert.doesNotMatch(block, /batch\.set\([\s\S]*?\{ merge: true \}/);
});

test('legacy assignment-to-Path promotion is retired in both server and teacher UI', () => {
  const start = functionsSource.indexOf('exports.promoteQuestionToPathBank');
  const end = functionsSource.indexOf('async function processPathSeedImport', start);
  const block = functionsSource.slice(start, end);
  assert.match(block, /assignment-path-promotion-retired/);
  assert.doesNotMatch(appSource, /Add to Path Bank/);
  assert.doesNotMatch(appSource, /PromoteToPathBank/);
  assert.match(auditSource, /Teacher assignments do not create, remove, or map My Math Path coverage/);
});

test('Path audit includes targeted answer-safe skill diagnosis and human-readable rejection groups', () => {
  assert.match(functionsSource, /exports\.diagnosePathSkill/);
  assert.match(auditSource, /Why won’t this skill start\?/);
  assert.match(auditSource, /By question type/);
  assert.match(auditSource, /By interaction \/ tool/);
  assert.match(auditSource, /Diagnostic ID/);
});
