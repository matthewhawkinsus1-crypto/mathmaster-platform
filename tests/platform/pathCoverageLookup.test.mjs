// READING A COVERAGE INDEX, FROM THE LOOKUP MODULE ALONE (PF01).
//
// functions/shared/pathCoverageLookup.mjs holds the lookups a student's Home
// makes of My Math Path's coverage index (is this skill open, is it open for
// this assessment), so the index builder in pathCoverage.mjs stays out of the
// first load (tests/platform/firstLoadPathCoverage.test.mjs). That is only safe
// while nothing about them changed. This holds them together: pathCoverage.mjs
// still exports every name, as the very same binding, so the server, My Math
// Path and the audit read what Home reads; and every answer the lookups give is
// the answer they gave as written in pathCoverage.mjs before the move (copied
// below, not read back from the module under test).

import test from 'node:test';
import assert from 'node:assert/strict';
import * as coverage from '../../functions/shared/pathCoverage.mjs';
import * as lookup from '../../functions/shared/pathCoverageLookup.mjs';

// The lookups exactly as they were in pathCoverage.mjs.
const AS_IT_WAS = (() => {
  const ASSESSMENT_COVERAGE_FRAMEWORKS = Object.freeze([
    'digitalSAT',
    'act',
    'tsia2',
    'asvab',
  ]);
  const coverageKey = (value) => String(value ?? '')
    .trim()
    .replace(/^texas:/i, '')
    .replace(/^teks:/i, '')
    .toUpperCase()
    .replace(/\s+/g, '');
  const normalizeAssessmentFramework = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw || raw.toLowerCase() === 'course') return null;
    const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (['digitalsat', 'sat'].includes(key)) return 'digitalSAT';
    if (key === 'act') return 'act';
    if (['tsia2', 'tsi2', 'tsi'].includes(key)) return 'tsia2';
    if (key === 'asvab') return 'asvab';
    return null;
  };
  const isSkillLaunchable = (index, teksCode) => {
    const key = coverageKey(teksCode);
    if (!key) return false;
    const record = index?.skills?.[key] || index?.offWheel?.[key];
    return record?.studentReady === true;
  };
  const frameworkCoverageKnown = (index, framework) => {
    const normalized = normalizeAssessmentFramework(framework);
    return Boolean(normalized && index?.frameworks && Object.prototype.hasOwnProperty.call(index.frameworks, normalized));
  };
  const frameworkCoverageRecord = (index, teksCode, framework) => {
    const normalized = normalizeAssessmentFramework(framework);
    const key = coverageKey(teksCode);
    if (!normalized || !key || !frameworkCoverageKnown(index, normalized)) return null;
    const frameworkIndex = index.frameworks[normalized];
    return frameworkIndex?.skills?.[key] || frameworkIndex?.offWheel?.[key] || null;
  };
  const isFrameworkSkillLaunchable = (index, teksCode, framework) => (
    frameworkCoverageRecord(index, teksCode, framework)?.published === true
  );
  return {
    ASSESSMENT_COVERAGE_FRAMEWORKS,
    coverageKey,
    normalizeAssessmentFramework,
    isSkillLaunchable,
    frameworkCoverageKnown,
    frameworkCoverageRecord,
    isFrameworkSkillLaunchable,
  };
})();

test('pathCoverage.mjs exports every lookup, and it is the one pathCoverageLookup.mjs holds', () => {
  const names = Object.keys(lookup).sort();
  assert.deepEqual(names, Object.keys(AS_IT_WAS).sort(), 'the lookup module gained or lost a name: compare it with the copy above');
  for (const name of names) {
    assert.ok(Object.hasOwn(coverage, name), `pathCoverage.mjs no longer exports ${name}: a server or audit caller would break`);
    assert.equal(coverage[name], lookup[name], `pathCoverage.mjs's ${name} is not the lookup module's: Home and the server could disagree`);
  }
  assert.deepEqual([...lookup.ASSESSMENT_COVERAGE_FRAMEWORKS], [...AS_IT_WAS.ASSESSMENT_COVERAGE_FRAMEWORKS]);
  assert.ok(Object.isFrozen(lookup.ASSESSMENT_COVERAGE_FRAMEWORKS));
});

const CODES = [
  'A.5A', 'a.5a', 'texas:A.5A', 'TEXAS:a.5a', 'teks:A2.4F', 'Teks:a2.4f', ' A2.4 F ', 'texas:teks:A.5A', 'teks:texas:A.5A',
  '8.5I', '6.4A', 'A.10E', '', '   ', null, undefined, 0, 7, 'constructor', '__proto__', 'toString',
];
const FRAMEWORKS = [
  'digitalSAT', 'SAT', 'sat', 'Digital SAT', 'digital_sat', 'digital-sat', 'ACT', ' act ', 'TSIA2', 'tsi-2', 'TSI', 'tsi_a2',
  'ASVAB', 'asvab', 'course', 'Course', '', null, undefined, 'psat', 'constructor', 0,
];
const INDEXES = [
  null,
  undefined,
  {},
  { skills: {}, offWheel: {} },
  {
    skills: { 'A.5A': { studentReady: true }, 'A2.4F': { studentReady: false }, '8.5I': { studentReady: 'true' } },
    offWheel: { 'A.10E': { studentReady: true }, '6.4A': { studentReady: 1 } },
  },
  {
    skills: { 'A.5A': { studentReady: true } },
    frameworks: {
      digitalSAT: { skills: { 'A.5A': { published: true }, 'A2.4F': { published: false } }, offWheel: { 'A.10E': { published: true } } },
      act: { skills: { 'A.5A': { published: 'yes' } } },
      tsia2: {},
      asvab: { offWheel: { '8.5I': { published: true } } },
    },
  },
  // A framework entry inherited, not stored: still "not known".
  { frameworks: Object.create({ digitalSAT: { skills: { 'A.5A': { published: true } } } }) },
];

test('every key and framework spelling reads as it did', () => {
  for (const code of CODES) assert.equal(lookup.coverageKey(code), AS_IT_WAS.coverageKey(code), `coverageKey(${JSON.stringify(code)})`);
  for (const framework of FRAMEWORKS) {
    assert.equal(lookup.normalizeAssessmentFramework(framework), AS_IT_WAS.normalizeAssessmentFramework(framework), `normalizeAssessmentFramework(${JSON.stringify(framework)})`);
  }
});

test('every launch answer over every index is the one it was', () => {
  let compared = 0;
  let open = 0;
  INDEXES.forEach((index, at) => {
    for (const code of CODES) {
      const launchable = lookup.isSkillLaunchable(index, code);
      assert.equal(launchable, AS_IT_WAS.isSkillLaunchable(index, code), `isSkillLaunchable(index ${at}, ${JSON.stringify(code)})`);
      if (launchable) open += 1;
      compared += 1;
      for (const framework of FRAMEWORKS) {
        assert.equal(lookup.frameworkCoverageKnown(index, framework), AS_IT_WAS.frameworkCoverageKnown(index, framework), `frameworkCoverageKnown(index ${at}, ${JSON.stringify(framework)})`);
        assert.equal(lookup.frameworkCoverageRecord(index, code, framework), AS_IT_WAS.frameworkCoverageRecord(index, code, framework), `frameworkCoverageRecord(index ${at}, ${JSON.stringify(code)}, ${JSON.stringify(framework)})`);
        const published = lookup.isFrameworkSkillLaunchable(index, code, framework);
        assert.equal(published, AS_IT_WAS.isFrameworkSkillLaunchable(index, code, framework), `isFrameworkSkillLaunchable(index ${at}, ${JSON.stringify(code)}, ${JSON.stringify(framework)})`);
        if (published) open += 1;
        compared += 1;
      }
    }
  });
  // The fixtures reach both answers, or the comparisons above prove little.
  assert.ok(open > 10 && open < compared, `${open} of ${compared} lookups were open`);
});
