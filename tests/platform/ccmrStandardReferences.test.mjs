import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEKS_EXAM_CROSSWALK } from '../../src/platform/assessment/teksExamCrosswalk.js';
import {
  ACT_REFERENCES,
  getAssessmentStandardReferences,
  matchesAssessmentReferenceSearch,
  officialReferenceKindLabel,
} from '../../src/platform/ccmr/assessmentStandardReferences.js';

const practiceMenuSource = readFileSync(new URL('../../src/components/student/PracticeAsMenu.jsx', import.meta.url), 'utf8');
const hubSource = readFileSync(new URL('../../src/components/student/CCMRHub.jsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../../src/components/teacher/AssessmentSkillInspector.jsx', import.meta.url), 'utf8');
const simulatorSource = readFileSync(new URL('../../src/components/teacher/PathSimulator.jsx', import.meta.url), 'utf8');
const pathAppSource = readFileSync(new URL('../../src/components/student/MyMathPathApp.jsx', import.meta.url), 'utf8');

test('recursive sequences expose real ACT CCRS identifiers without inventing SAT or TSIA2 numbers', () => {
  const act = getAssessmentStandardReferences('A.12C', 'act');
  assert.deepEqual(act.map((entry) => entry.officialCode), ['F 502', 'F 603', 'F 703']);

  const sat = getAssessmentStandardReferences('A.12C', 'digitalSAT');
  assert.equal(sat.length, 1);
  assert.equal(sat[0].officialCode, null);
  assert.equal(sat[0].domainTitle, 'Advanced Math');

  const tsia = getAssessmentStandardReferences('A.12C', 'tsia2');
  assert.equal(tsia.length, 1);
  assert.equal(tsia[0].officialCode, null);
  assert.equal(tsia[0].domainTitle, 'Algebraic Reasoning');
});

test('domain-level fallbacks are labeled honestly instead of being called exact standards', () => {
  const sat = getAssessmentStandardReferences('A.12C', 'digitalSAT')[0];
  assert.equal(sat.mappingPrecision, 'domain');
  assert.match(officialReferenceKindLabel(sat), /domain/i);
  assert.doesNotMatch(officialReferenceKindLabel(sat), /Official SAT skill$/);
});

test('solving linear equations maps to specific official references students can search', () => {
  const act = getAssessmentStandardReferences('A.5A', 'act');
  assert.equal(act.some((entry) => entry.officialCode === 'A 403'), true);

  const sat = getAssessmentStandardReferences('A.5A', 'digitalSAT');
  assert.equal(sat.some((entry) => /Linear equations in one variable/i.test(entry.title)), true);

  const tsia = getAssessmentStandardReferences('A.5A', 'tsia2');
  assert.equal(tsia.some((entry) => /linear equations/i.test(`${entry.title} ${entry.descriptor}`)), true);
});

test('student search accepts official codes, official skill names, domains, subtests, and TEKS', () => {
  const actItem = { skillId: 'teks:A.12C', label: 'Recursive sequences', framework: 'act' };
  assert.equal(matchesAssessmentReferenceSearch(actItem, 'F 502'), true);
  assert.equal(matchesAssessmentReferenceSearch(actItem, 'F502'), true);
  assert.equal(matchesAssessmentReferenceSearch(actItem, 'recursive'), true);
  assert.equal(matchesAssessmentReferenceSearch(actItem, 'A.12C'), true);

  assert.equal(matchesAssessmentReferenceSearch({ skillId: 'teks:A.5A', label: 'Solving linear equations', framework: 'digitalSAT' }, 'SAT linear equations'), true);
  assert.equal(matchesAssessmentReferenceSearch({ skillId: 'teks:A.5A', label: 'Solving linear equations', framework: 'tsia2' }, 'Algebraic Reasoning'), true);

  const asvabRefs = getAssessmentStandardReferences('A.2A', 'asvab');
  if (asvabRefs.length) {
    assert.equal(['AR', 'MK'].includes(asvabRefs[0].officialCode), true);
  }
});

test('every authored TEKS assessment crosswalk has an explanatory official-reference layer', () => {
  const missing = [];
  for (const [code, mapping] of Object.entries(TEKS_EXAM_CROSSWALK)) {
    for (const framework of Object.keys(mapping)) {
      const refs = getAssessmentStandardReferences(code, framework);
      if (!refs.length) missing.push(`${code}:${framework}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('ACT reference codes returned by the mapper exist in the authored ACT CCRS registry', () => {
  const bad = [];
  for (const [code, mapping] of Object.entries(TEKS_EXAM_CROSSWALK)) {
    if (!mapping.act) continue;
    for (const reference of getAssessmentStandardReferences(code, 'act')) {
      if (reference.officialCode && !ACT_REFERENCES[reference.officialCode]) {
        bad.push(`${code}:${reference.officialCode}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('non-ACT frameworks preserve their real public identifier systems instead of fake standard numbers', () => {
  for (const [code, mapping] of Object.entries(TEKS_EXAM_CROSSWALK)) {
    for (const framework of ['digitalSAT', 'tsia2']) {
      if (!mapping[framework]) continue;
      for (const reference of getAssessmentStandardReferences(code, framework)) {
        assert.equal(reference.officialCode, null, `${code}:${framework} should not invent an official number`);
      }
    }
    if (mapping.asvab) {
      for (const reference of getAssessmentStandardReferences(code, 'asvab')) {
        assert.equal(['AR', 'MK'].includes(reference.officialCode), true, `${code}: ASVAB must use AR or MK`);
      }
    }
  }
});

test('path chooser, CCMR hub, teacher inspector, and simulator surface the same reference layer', () => {
  assert.match(practiceMenuSource, /See standard connection/);
  assert.match(practiceMenuSource, /referenceLabel\(primary\)/);
  assert.match(hubSource, /Find practice by CCMR standard or skill/);
  assert.match(hubSource, /Dig deeper into the standard connection/);
  assert.match(inspectorSource, /Official assessment reference/);
  assert.match(simulatorSource, /Search CCMR standards and official assessment skills/);
});

test('teacher read-only student view includes CCMR exploration without practice or goal mutation', () => {
  assert.match(pathAppSource, /const visibleTabs = TABS/);
  assert.match(pathAppSource, /readOnly=\{readOnly\}/);
  assert.match(hubSource, /disabled=\{readOnly\}/);
  assert.match(hubSource, /Student can practise this/);
  assert.match(hubSource, /if \(readOnly\) return/);
});
