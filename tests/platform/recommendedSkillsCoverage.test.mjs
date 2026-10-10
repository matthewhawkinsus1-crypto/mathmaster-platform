/*
 * HOME'S "RECOMMENDED FOR YOU" OFFERS ONLY SKILLS A STUDENT CAN PRACTISE
 * (release-candidate QA m10, student push I).
 *
 * "Equations of perpendicular lines" was a YOUR CHOICE card while the Path map
 * said COMING SOON, and choosing it ended in a coverage error: the panel never
 * read the coverage index the map and the launcher read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { practisableOptions, skillIsPractisable } from '../../src/platform/path/recommendedCoverage.js';
import { curateStudentPanel } from '../../src/platform/path/studentPanel.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { coverageKey } from '../../functions/shared/pathCoverage.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const row = (code, extra = {}) => ({ skillId: teksSkillId(code), score: 1, reasons: [], ...extra });
const coverageFor = (codes) => ({ skills: Object.fromEntries(codes.map((code) => [coverageKey(code), { studentReady: true }])) });
const options = {
  required: [row('A.2A')],
  recommended: [row('A.2C'), row('A.2E')],
  priority: [],
  available: [row('A.2B'), row('A.3A')],
  extension: [row('A.2I')],
  remediation: [],
  locked: [row('A.5A', { remediationTarget: teksSkillId('A.2H') })],
  confidence: { level: 'high', message: '' },
};
const shown = (panel) => [panel.best, panel.strengthen, panel.challenge, ...panel.choices].filter(Boolean).map((card) => card.skillId);

test('a skill with no practice is never offered; a practisable one still is', () => {
  const coverage = coverageFor(['A.2C', 'A.2B', 'A.2H']);
  assert.equal(skillIsPractisable(coverage, teksSkillId('A.2E')), false);
  const panel = curateStudentPanel(practisableOptions(options, coverage));
  assert.deepEqual(new Set(shown(panel)), new Set([teksSkillId('A.2C'), teksSkillId('A.2B'), teksSkillId('A.2H')]));
  // Without the filter the uncovered skills were offered (the reported bug).
  const unfiltered = shown(curateStudentPanel(options));
  assert.ok(unfiltered.includes(teksSkillId('A.2E')) && unfiltered.includes(teksSkillId('A.2I')));
});

test('a repair card is offered only when the skill it repairs can be practised', () => {
  const panel = curateStudentPanel(practisableOptions(options, coverageFor(['A.2C'])));
  assert.equal(panel.strengthen, null);
});

test('no coverage index fails closed; the teacher\'s assigned skills stay', () => {
  const panel = curateStudentPanel(practisableOptions(options, null));
  assert.deepEqual(shown(panel), []);
  assert.deepEqual(panel.required.map((card) => card.skillId), [teksSkillId('A.2A')]);
});

test('the panel filters through coverage before it picks cards, and waits for the index', () => {
  const source = executableSource(readFileSync(new URL('../../src/components/student/RecommendedSkills.jsx', import.meta.url), 'utf8'));
  assert.match(source, /import \{ practisableOptions \} from '\.\.\/\.\.\/platform\/path\/recommendedCoverage\.js';/);
  assert.match(source, /import \{ fetchPathCoverage \} from '\.\.\/\.\.\/platform\/path\/pathCoverageService\.js';/);
  const options = region(source, 'const options = useMemo(() => {', '}, [coverage,', 'options');
  assert.match(options, /if \(coverage === undefined\) return null;/);
  assert.match(options, /return practisableOptions\(pathOptions \|\| buildStudentPathOptions\(/);
  assert.match(source, /fetchPathCoverage\(courseId\)\.then\(/);
  assert.match(source, /const panel = useMemo\(\(\) => \(options \? curateStudentPanel\(options\) : null\), \[options\]\);/);
});
