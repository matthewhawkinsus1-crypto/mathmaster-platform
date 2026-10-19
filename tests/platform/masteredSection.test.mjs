// Every mastered skill is reachable on the Path map.
//
// The map cut Mastered at six while the header counted all of them, so a
// student with eight mastered skills read "8 of 48" above six cards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEFAULT_LIMITS, buildPathMap } from '../../src/platform/path/pathMap.js';
import { getSkillGraph } from '../../src/platform/path/skillGraph.js';
import { MASTERED_PREVIEW_COUNT, masteredSectionView } from '../../src/platform/path/masteredSection.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const skills = getSkillGraph('algebra1');
const row = (skill, status) => ({ skillId: skill.skillId, status, score: 0.5, mastery: 0.95, reasons: [] });
const optionsWithMastered = (count) => ({
  courseId: 'algebra1',
  available: [row(skills[40], 'available')],
  mastered: skills.slice(0, count).map((skill) => row(skill, 'mastered')),
});

test('the map returns every mastered skill, so the header and the cards agree', () => {
  for (const count of [0, 1, 6, 7, 8, 20]) {
    const map = buildPathMap(optionsWithMastered(count));
    assert.equal(map.masteredCount, count);
    assert.equal(map.mastered.length, count, `${count} mastered skills must give ${count} cards' worth of nodes`);
  }
  assert.equal(DEFAULT_LIMITS.mastered, Infinity);
  // A caller that asks for fewer still gets fewer.
  assert.equal(buildPathMap(optionsWithMastered(8), { limits: { mastered: 3 } }).mastered.length, 3);
});

test('the section previews six and names the rest behind one control', () => {
  const nodes = buildPathMap(optionsWithMastered(8)).mastered;
  const folded = masteredSectionView(nodes);
  assert.equal(MASTERED_PREVIEW_COUNT, 6);
  assert.equal(folded.visible.length, 6);
  assert.deepEqual(folded.visible, nodes.slice(0, 6), 'the preview is the first six, in map order');
  assert.equal(folded.total, 8);
  assert.equal(folded.hiddenCount, 2);
  assert.equal(folded.collapsible, true);
  assert.equal(folded.expanded, false);
  assert.equal(folded.toggleLabel, 'Show all 8 mastered skills');

  const open = masteredSectionView(nodes, { expanded: true });
  assert.equal(open.visible.length, 8);
  assert.equal(open.hiddenCount, 0);
  assert.equal(open.expanded, true);
  assert.equal(open.toggleLabel, 'Show fewer mastered skills');
});

test('a section that already fits draws no control and hides nothing', () => {
  for (const count of [0, 1, 6]) {
    const nodes = buildPathMap(optionsWithMastered(count)).mastered;
    for (const expanded of [false, true]) {
      const view = masteredSectionView(nodes, { expanded });
      assert.equal(view.visible.length, count);
      assert.equal(view.hiddenCount, 0);
      assert.equal(view.collapsible, false);
      assert.equal(view.expanded, false);
      assert.equal(view.toggleLabel, null);
    }
  }
  assert.deepEqual(masteredSectionView(undefined).visible, []);
  assert.equal(masteredSectionView([null, { skillId: 'a' }]).total, 1);
  assert.equal(masteredSectionView(Array.from({ length: 5 }, (_, i) => ({ skillId: i })), { previewCount: 3 }).hiddenCount, 2);
});

/* ---------------------------------------------------------------- wiring */

const screen = readFileSync(new URL('../../src/components/student/StudentLearningPath.jsx', import.meta.url), 'utf8');
const code = executableSource(screen);

test('the Mastered section renders the view, not the raw map list', () => {
  assert.match(code, /import \{ masteredSectionView \} from '\.\.\/\.\.\/platform\/path\/masteredSection\.js';/);
  assert.match(code, /const \[showAllMastered, setShowAllMastered\] = useState\(false\);/);
  assert.match(code, /const masteredView = masteredSectionView\(map\?\.mastered, \{ expanded: showAllMastered \}\);/);

  const section = region(code, 'title="Mastered"', '/>\n    </div>', 'Mastered section');
  assert.match(section, /nodes=\{masteredView\.visible\}/);
  assert.doesNotMatch(section, /nodes=\{map\.mastered\}/);
  assert.match(section, /footer=\{<MasteredToggle view=\{masteredView\} onToggle=\{\(\) => setShowAllMastered\(\(current\) => !current\)\} \/>\}/);
});

test('the section draws its footer, and the toggle is a real, labelled 44px control', () => {
  const pathSection = region(code, 'function PathSection(', '\n}\n', 'PathSection');
  assert.match(pathSection, /footer = null/);
  assert.match(pathSection, /\{footer\}\s*<\/section>/);

  const toggle = region(code, 'function MasteredToggle(', '\n}\n', 'MasteredToggle');
  assert.match(toggle, /if \(!view\.collapsible\) return null;/);
  assert.match(toggle, /type="button"/);
  assert.match(toggle, /aria-expanded=\{view\.expanded\}/);
  assert.match(toggle, /onClick=\{onToggle\}/);
  assert.match(toggle, /minHeight: 44/);
  assert.match(toggle, /\{view\.toggleLabel\}/);
});
