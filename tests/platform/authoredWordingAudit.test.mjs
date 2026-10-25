/*
 * THE AUTHORED-WORDING AUDIT (CT17; VH-14 and VH-35).
 *
 * scripts/audit-authored-wording.mjs reads every string in the authored content
 * (lesson imports, assignment documents, shipped question banks) and counts two
 * things the VPAT had to call "not audited": a colour that names which part of a
 * figure to look at ("the red line", WCAG 1.3.3) and a passage in another
 * language that nothing marks (WCAG 3.1.2).
 *
 * What this holds:
 *   - each detector reads what it should and leaves alone what it should, on
 *     written strings (a colour in a word problem is data, not a reference; a
 *     café is not Spanish; mathematics is not read);
 *   - text under a `translations` key is marked, so it may hold another
 *     language, and the same text in the item's own field may not;
 *   - the scan reports a finding where it is, and the command exits 1 for a
 *     defect and 0 for clean content, and prints every class;
 *   - the shipped content has none of the certain defects. That is the part that
 *     stops new content from relying on colour: it goes red the day someone
 *     writes "the red line" in a lesson or a bank. The scan must really read the
 *     content (files, strings, and the word-problem colours it classes as data),
 *     and the folders it reads are listed here by hand, so a folder dropped from
 *     the audit cannot pass by never being looked at.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDIT_CLASSES,
  AUTHORED_CONTENT_SOURCES,
  accentedWords,
  auditContent,
  findWordingProblems,
  proseOf,
  spanishEvidence,
  stringsOf,
} from '../../scripts/lib/authoredWordingAudit.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const classesIn = (text) => Object.keys(findWordingProblems(text)).sort();
const snippets = (text, classId) => findWordingProblems(text)[classId] || [];

test('the audit knows its classes, and which are certain defects', () => {
  assert.deepEqual(AUDIT_CLASSES.map((entry) => entry.id), [
    'colourOnlyReference', 'shapeOnlyReference', 'positionOnlyReference', 'otherScript', 'spanishPassage', 'accentedWord',
  ]);
  assert.deepEqual(AUDIT_CLASSES.filter((entry) => entry.certain).map((entry) => entry.id), ['colourOnlyReference', 'otherScript', 'spanishPassage']);
});

test('a colour that names a part of a figure is read, in each way it is written', () => {
  assert.deepEqual(snippets('Which function is steeper, the red line or the blue line?', 'colourOnlyReference'), ['the red line', 'the blue line']);
  [
    'The slope of the dashed red line is 2.',
    'Find the intercept of the red dashed line.',
    'Each green point is a solution.',
    'Compare the red and the blue curves.',
    'Both the red and blue lines cross at one point.',
    'The points are drawn in orange.',
    'The region shaded in yellow is the solution set.',
    'This purple parabola opens up.',
    'Read the value off the black segment.',
  ].forEach((text) => assert.ok(classesIn(text).includes('colourOnlyReference'), text));
});

test('a colour in a word problem is data, not a reference, and a figure part without a colour is not read', () => {
  [
    'A bag holds 7 red markers and 5 blue markers. What is the probability that a marble is red?',
    'The ratio of red to blue markers is 3:2.',
    'Spinner A has 3 red sections and 5 nonred sections of equal size.',
    'A recipe uses 4 blue beads for every 6 red beads.',
    'There are 12 red tiles in the bag, and the red ones are drawn first.',
    'Draw a red line through the points.',
    'Find the slope of the line through the two points.',
    'What is the color of the next tile in the pattern?',
  ].forEach((text) => assert.ok(!classesIn(text).includes('colourOnlyReference'), text));
  // …and it is counted apart, so the two are not confused.
  assert.deepEqual(classesIn('A bag holds 7 red markers and 5 blue markers.'), ['colourAsData']);
  assert.deepEqual(classesIn('Find the slope of the line through the two points.'), []);
  assert.deepEqual(classesIn('the red line'), ['colourOnlyReference']);
});

test('a shape or a position that names a control or a figure is read as judgement', () => {
  assert.deepEqual(classesIn('Press the round button to start.'), ['shapeOnlyReference']);
  ['Use the graph on the left to find f(2).', 'Look at the table on the right.', 'Compare the left graph with the right graph.', 'Read the top panel.']
    .forEach((text) => assert.ok(classesIn(text).includes('positionOnlyReference'), text));
  ['Use the graph to find f(2).', 'The positive multiplier keeps the graph above $y=k$.', 'An open dot with the arrow to the left.']
    .forEach((text) => assert.ok(!classesIn(text).includes('positionOnlyReference'), text));
  assert.deepEqual(AUDIT_CLASSES.filter((entry) => !entry.certain).map((entry) => entry.id), ['shapeOnlyReference', 'positionOnlyReference', 'accentedWord']);
});

test('Spanish is read from its question marks and from two Spanish-only words, and a loanword, a name and English are not', () => {
  ['¿Cuál es la ecuación de la recta?', '¡Muy bien!', 'Resuelve la ecuación para x.', 'Encuentra el valor de cada variable.', 'Calcula la función para los números dados.']
    .forEach((text) => assert.ok(classesIn(text).includes('spanishPassage'), text));
  [
    'Find the equation of the line.',
    'A café sold 12 drinks on Saturday.',
    'El Niño is a weather pattern.',
    'de Moivre’s theorem',
    'Solve for y and for la in the formula.',
    'Find the value of each variable and write the answer in the box.',
  ].forEach((text) => assert.ok(!classesIn(text).includes('spanishPassage'), text));
  assert.deepEqual(spanishEvidence('Resuelve la ecuación'), ['resuelve', 'la', 'ecuación']);
});

test('another script is read, and Greek mathematics, symbols and a café are not', () => {
  ['解方程 x + 2 = 5', 'Найдите значение x', 'حل المعادلة', '次の式を解きなさい'].forEach((text) => assert.ok(classesIn(text).includes('otherScript'), text));
  ['Find θ if sin θ = 1/2.', 'The area is πr² and the change is Δx.', 'Compute 12 × 3 ÷ 4.', 'x₁ + x₂ = 7', 'A café sold 12 drinks.']
    .forEach((text) => assert.ok(!classesIn(text).includes('otherScript'), text));
  assert.deepEqual(accentedWords('A café sold 12 drinks, 3 × 4 ÷ 2, the résumé of Erdős and a piñata.'), ['piñata']);
  assert.deepEqual(classesIn('A café sold 12 drinks on Saturday, 3 × 4 ÷ 2.'), []);
});

test('mathematics and placeholders are not read as words', () => {
  assert.equal(proseOf('Find $\\text{la ecuación}$ and {{la}} of $$x$$.').replace(/\s+/g, ' ').trim(), 'Find and of .');
  assert.deepEqual(classesIn('Let $f$ be the $\\text{red line}$ and ${{red}}$ the point.'), []);
});

test('text under a translations key is marked, and the same text in the item itself is not', () => {
  const spanish = 'Resuelve la ecuación para x.';
  const item = { prompt: 'Solve the equation for x.', hints: ['Isolate x.'], translations: { es: { prompt: spanish, hints: ['Aísla x.'] } } };
  assert.deepEqual(stringsOf(item).filter((entry) => entry.marked).map((entry) => entry.path), ['.translations.es.prompt', '.translations.es.hints[0]']);
  const dir = mkdtempSync(path.join(tmpdir(), 'mm-wording-'));
  try {
    writeFileSync(path.join(dir, 'marked.json'), JSON.stringify(item));
    const marked = auditContent({ root: dir, targets: ['.'] });
    assert.equal(marked.classes.spanishPassage.strings, 0, 'Spanish under translations.es is marked');
    assert.equal(marked.classes.accentedWord.strings, 0);
    assert.equal(marked.markedStrings, 2);
    writeFileSync(path.join(dir, 'unmarked.json'), JSON.stringify({ prompt: spanish, hints: ['Aísla x.'] }));
    const unmarked = auditContent({ root: dir, targets: ['.'] });
    assert.equal(unmarked.classes.spanishPassage.strings, 1, 'the same sentence in the item\'s own field is not');
    assert.deepEqual(unmarked.classes.spanishPassage.findings.map((finding) => [finding.file, finding.path]), [['unmarked.json', '.prompt']]);
    assert.equal(unmarked.classes.accentedWord.strings, 2, 'and so are the accented words of the prompt and of the hint');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the scan reports each finding in its file and place, and the command says so with its exit code', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mm-wording-'));
  try {
    mkdirSync(path.join(dir, 'lessons'));
    writeFileSync(path.join(dir, 'lessons', 'bad.json'), JSON.stringify({
      sections: [{ questions: [
        { questionId: 'q1', prompt: 'Which function is steeper, the red line or the blue line?', hints: ['Compare the slopes of the two lines.'] },
        { questionId: 'q2', prompt: '¿Cuál es la ecuación de la recta?' },
        { questionId: 'q3', prompt: 'A bag holds 7 red markers and 5 blue markers.' },
      ] }],
    }));
    writeFileSync(path.join(dir, 'lessons', 'good.json'), JSON.stringify({ sections: [{ questions: [{ questionId: 'q1', prompt: 'Which line is steeper, line A or line B?' }] }] }));
    const result = auditContent({ root: dir, targets: ['lessons'] });
    assert.equal(result.files, 2);
    assert.deepEqual(result.classes.colourOnlyReference.findings.map((finding) => [finding.file, finding.path, finding.snippet]), [
      [path.join('lessons', 'bad.json'), '.sections[0].questions[0].prompt', 'the red line'],
    ]);
    assert.equal(result.classes.spanishPassage.strings, 1);
    assert.equal(result.classes.colourAsData.strings, 1, 'the word problem is data, not a finding');
    const run = (...args) => spawnSync(process.execPath, ['scripts/audit-authored-wording.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
    const bad = run('--path', path.join(dir, 'lessons', 'bad.json'));
    assert.equal(bad.status, 1, 'a certain defect fails the run');
    assert.match(bad.stdout, /colourOnlyReference: 1 strings in 1 files/);
    assert.match(bad.stdout, /spanishPassage: 1 strings in 1 files/);
    const good = run('--path', path.join(dir, 'lessons', 'good.json'));
    assert.equal(good.status, 0, good.stdout);
    ['colourOnlyReference', 'shapeOnlyReference', 'positionOnlyReference', 'otherScript', 'spanishPassage', 'accentedWord', 'colourAsData']
      .forEach((id) => assert.match(good.stdout, new RegExp(`${id}: 0 strings`), `the command prints ${id}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the shipped authored content has no colour-only reference and no unmarked passage in another language', () => {
  // The folders the audit reads, listed here by hand: one dropped from the audit fails this, not passes it.
  assert.deepEqual([...AUTHORED_CONTENT_SOURCES].sort(), ['docs/assignments', 'drafts/district-dol2', 'functions/seeds', 'teacher-import-jsons']);
  for (const folder of AUTHORED_CONTENT_SOURCES) {
    const alone = auditContent({ targets: [folder] });
    assert.ok(alone.files >= 1 && alone.strings >= 1000, `${folder}: ${alone.files} files, ${alone.strings} strings are really read`);
  }
  const shipped = auditContent();
  assert.ok(shipped.files >= 50, `${shipped.files} files`);
  assert.ok(shipped.strings >= 300000, `${shipped.strings} strings`);
  // The colours of word problems ("7 red markers") are found, and classed as data, so the colour detector is looking.
  assert.ok(shipped.classes.colourAsData.strings >= 30, `${shipped.classes.colourAsData.strings} word-problem colours`);
  for (const id of ['colourOnlyReference', 'otherScript', 'spanishPassage']) {
    assert.deepEqual(shipped.classes[id].findings.slice(0, 5).map((finding) => `${finding.file} ${finding.path}: ${finding.text.slice(0, 100)}`), [], `${id}: ${shipped.classes[id].label}`);
  }
});
