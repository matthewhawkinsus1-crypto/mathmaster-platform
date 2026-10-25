/*
 * A REFERENCE SHEET FROM THE WORK BAR: THE SHELL (TL07, a STAAR sheet).
 *
 * The official STAAR Algebra I reference materials are the Texas Education
 * Agency's, and neither their wording nor whether MathMaster may reproduce them
 * is for this repository to guess. So the shell is built and NO SHEET IS
 * REGISTERED: a question can name `referenceSheet: "<id>"`, the work bar has a
 * button that opens the sheet, and every piece of it is proved here with a
 * FIXTURE (clearly not STAAR). What the owner must supply to turn the real one
 * on is written at the top of src/platform/assessment/referenceSheets.js.
 *
 * What these tests protect:
 *   - a sheet that is incomplete, has no source, has not been cleared for
 *     reuse, or has a formula with no spoken words is NEVER offered, and
 *     nothing unregistered can be offered at all (so, today, nothing is);
 *   - the registry itself can only ever hold complete, cleared sheets;
 *   - what a student sees is the sheet, each formula with the words a screen
 *     reader says for it, and where the sheet comes from;
 *   - the field survives the teacher import to the runtime;
 *   - the sheet and its data are not part of any student's first load.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { REFERENCE_SHEETS, resolveReferenceSheet, validateReferenceSheet } from '../../src/platform/assessment/referenceSheets.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');

// Test data. Not the STAAR sheet, and not meant to look like it.
const FIXTURE = Object.freeze({
  id: 'fixtureSheet',
  title: 'Fixture reference sheet',
  subtitle: 'Test data, not a real sheet',
  buttonLabel: 'Fixture sheet',
  source: { name: 'A test fixture', edition: '2026 edition' },
  clearance: { by: 'A test', on: '2026-10-25', note: 'Not a real clearance.' },
  notes: ['A plain note under the sections.'],
  sections: [
    {
      id: 'linear',
      title: 'Linear functions',
      items: [
        { id: 'slope-intercept', label: 'Slope-intercept form', latex: 'y=mx+b', spoken: 'y equals m x plus b' },
        { id: 'slope', latex: 'm=\\frac{y_2-y_1}{x_2-x_1}', spoken: 'm equals y two minus y one over x two minus x one', note: 'Slope of a line through two points' },
      ],
    },
    { id: 'quadratic', title: 'Quadratic functions', items: [{ id: 'standard', latex: 'f(x)=ax^2+bx+c', spoken: 'f of x equals a x squared plus b x plus c' }] },
  ],
});
const registry = (...sheets) => Object.fromEntries(sheets.map((sheet) => [sheet.id, sheet]));
const clone = () => JSON.parse(JSON.stringify(FIXTURE));
const without = (path, sheet = clone()) => {
  const keys = path.split('.');
  let node = sheet;
  keys.slice(0, -1).forEach((key) => { node = node[/^\d+$/.test(key) ? Number(key) : key]; });
  delete node[keys[keys.length - 1]];
  return sheet;
};

test('the registry can only ever hold complete, cleared sheets, and offers nothing it does not have', () => {
  Object.entries(REFERENCE_SHEETS).forEach(([id, sheet]) => {
    assert.equal(sheet.id, id, `${id}: registered under its own id`);
    assert.deepEqual(validateReferenceSheet(sheet).errors, [], `${id} is complete and cleared`);
  });
  assert.equal(Object.isFrozen(REFERENCE_SHEETS), true);
  // A question that names a sheet nobody registered shows nothing, however it is spelled.
  ['staarAlgebra1-not-registered', '', '   ', 'constructor', '__proto__', 'toString', 'hasOwnProperty'].forEach((id) => {
    assert.equal(resolveReferenceSheet({ referenceSheet: id }), null, JSON.stringify(id));
  });
  [undefined, null, 5, true, {}, [], ['fixtureSheet']].forEach((referenceSheet) => assert.equal(resolveReferenceSheet({ referenceSheet }, registry(FIXTURE)), null, JSON.stringify(referenceSheet)));
  assert.equal(resolveReferenceSheet(null, registry(FIXTURE)), null);
  assert.equal(resolveReferenceSheet(undefined, registry(FIXTURE)), null);
});

test('a complete, cleared sheet is offered to the question that names it, and only that one', () => {
  assert.deepEqual(validateReferenceSheet(FIXTURE).errors, []);
  assert.equal(resolveReferenceSheet({ referenceSheet: 'fixtureSheet' }, registry(FIXTURE)), FIXTURE);
  assert.equal(resolveReferenceSheet({ referenceSheet: '  fixtureSheet  ' }, registry(FIXTURE)), FIXTURE, 'stray spaces in an authored id do not hide it');
  assert.equal(resolveReferenceSheet({}, registry(FIXTURE)), null, 'a question that does not name one has none');
  assert.equal(resolveReferenceSheet({ referenceSheet: 'otherSheet' }, registry(FIXTURE)), null);
});

test('every missing piece is named, so an author knows what to supply', () => {
  const problems = (sheet) => validateReferenceSheet(sheet).errors.join('\n');
  assert.match(problems(null), /must be an object/);
  assert.match(problems([]), /must be an object/);
  assert.match(problems(without('id')), /needs an id/);
  assert.match(problems(without('title')), /needs a title/);
  assert.match(problems(without('source')), /needs its source \(source\.name\)/);
  assert.match(problems(without('source.name')), /needs its source/);
  assert.match(problems(without('clearance')), /has not been cleared for reuse/);
  assert.match(problems(without('clearance.by')), /has not been cleared for reuse/);
  assert.match(problems(without('clearance.on')), /has not been cleared for reuse/);
  ['10/25/2026', '2026-10', 'October 25, 2026', '', 20261025].forEach((on) => {
    const sheet = clone();
    sheet.clearance.on = on;
    assert.match(problems(sheet), /has not been cleared for reuse/, JSON.stringify(on));
  });
  assert.match(problems(without('sections')), /needs at least one section/);
  assert.match(problems({ ...clone(), sections: [] }), /needs at least one section/);
  assert.match(problems(without('sections.0.id')), /section 1 needs an id/);
  assert.match(problems(without('sections.0.title')), /section 1 needs a title/);
  assert.match(problems(without('sections.1.items')), /section 2 needs at least one item/);
  assert.match(problems(without('sections.0.items.0.id')), /section 1, item 1 needs an id/);
  assert.match(problems(without('sections.0.items.0.latex')), /section 1, item 1 needs its formula as LaTeX/);
  assert.match(problems(without('sections.0.items.1.spoken')), /section 1, item 2 needs the words a screen reader says/);
  const emptySpoken = clone();
  emptySpoken.sections[0].items[0].spoken = '   ';
  assert.match(problems(emptySpoken), /needs the words a screen reader says/);
  const twice = clone();
  twice.sections[1].items[0].id = 'slope';
  assert.match(problems(twice), /uses the item id "slope" more than once/);
  const sameSection = clone();
  sameSection.sections[1].id = 'linear';
  assert.match(problems(sameSection), /uses the section id "linear" more than once/);
  // Label, note, subtitle and the button's own name are optional.
  const bare = clone();
  ['subtitle', 'buttonLabel', 'notes', 'clearance.note', 'source.edition'].forEach((path) => without(path, bare));
  delete bare.sections[0].items[0].label;
  delete bare.sections[0].items[1].note;
  assert.deepEqual(validateReferenceSheet(bare).errors, []);
});

test('a sheet with any of those problems is not offered, and a sheet cannot be registered under another id', () => {
  [
    without('source'),
    without('clearance'),
    without('clearance.on'),
    without('sections.0.items.0.spoken'),
    { ...clone(), sections: [] },
  ].forEach((sheet, index) => assert.equal(resolveReferenceSheet({ referenceSheet: 'fixtureSheet' }, registry(sheet)), null, `broken sheet ${index}`));
  assert.equal(resolveReferenceSheet({ referenceSheet: 'someOtherName' }, { someOtherName: FIXTURE }), null, 'its id is its key');
  // Only the registry's own entries: one inherited from a prototype is not one.
  assert.equal(resolveReferenceSheet({ referenceSheet: 'fixtureSheet' }, Object.create({ fixtureSheet: FIXTURE })), null);
});

test('the sheet shows every section, each formula with the words a screen reader says, the notes and where it comes from', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { ReferenceSheetContent } = await server.ssrLoadModule('/src/components/assessment/AssignmentReferenceSheet.jsx');
    const markup = renderToStaticMarkup(React.createElement(ReferenceSheetContent, { sheet: FIXTURE }));
    assert.deepEqual([...markup.matchAll(/data-reference-sheet-section="([^"]+)"/g)].map((match) => match[1]), ['linear', 'quadratic']);
    assert.deepEqual([...markup.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]), ['Linear functions', 'Quadratic functions']);
    assert.deepEqual([...markup.matchAll(/data-reference-sheet-item="([^"]+)"/g)].map((match) => match[1]), ['slope-intercept', 'slope', 'standard']);
    // Each formula as LaTeX for the eye, and its words for the ear.
    FIXTURE.sections.flatMap((section) => section.items).forEach((item) => {
      assert.ok(markup.includes(`format="latex"`) && markup.includes(`>${item.latex}</math-span>`), `${item.id}: the formula is drawn`);
      assert.ok(markup.includes(`<span class="mm-math-spoken" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0">${item.spoken}</span>`), `${item.id}: its spoken words are there`);
      if (item.label) assert.ok(markup.includes(`>${item.label}</div>`), `${item.id}: label`);
      if (item.note) assert.ok(markup.includes(`>${item.note}</div>`), `${item.id}: note`);
    });
    assert.match(markup, /<li>A plain note under the sections\.<\/li>/);
    assert.match(markup, /<p data-reference-sheet-source="true"[^>]*>Source: A test fixture, 2026 edition<\/p>/);
    // Without an edition or notes: the source alone, no empty list.
    const bare = clone();
    delete bare.source.edition;
    delete bare.notes;
    const plain = renderToStaticMarkup(React.createElement(ReferenceSheetContent, { sheet: bare }));
    assert.match(plain, /Source: A test fixture<\/p>/);
    assert.doesNotMatch(plain, /<ul style="margin:0 0 14px/);
  } finally {
    await server.close();
  }
});

test('the question\'s field survives the teacher import, and resolves to the sheet at runtime', () => {
  const FILE = new URL('../../teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json', import.meta.url);
  const lesson = JSON.parse(readFileSync(FILE, 'utf8'));
  const named = (ids, value) => JSON.stringify({
    ...lesson,
    sections: lesson.sections.map((section) => ({
      ...section,
      questions: section.questions.map((question) => (ids.includes(question.questionId) ? { ...question, referenceSheet: value } : question)),
    })),
  });
  const compiled = compileTeacherImport(named(['l3-cw-1', 'l3-pr-10'], 'fixtureSheet'));
  assert.deepEqual(compiled.model.errors, []);
  const byId = (id) => compiled.questions.find((question) => question.questionId === id);
  assert.equal(byId('l3-cw-1').referenceSheet, 'fixtureSheet');
  assert.equal(byId('l3-pr-10').referenceSheet, 'fixtureSheet');
  assert.equal(byId('l3-cw-2').referenceSheet, undefined, 'a question that did not name one has none');
  assert.equal(resolveReferenceSheet(byId('l3-cw-1'), registry(FIXTURE)), FIXTURE);
  assert.equal(resolveReferenceSheet(byId('l3-cw-2'), registry(FIXTURE)), null);
  // The real registry has no such sheet, so the same question shows nothing today.
  assert.equal(resolveReferenceSheet(byId('l3-cw-1')), null);
  // The published lesson names none.
  assert.deepEqual(compileTeacherImport(readFileSync(FILE, 'utf8')).questions.filter((question) => question.referenceSheet !== undefined), []);
});

test('the work bar offers the button only for a sheet the question has, and loads the panel only then', () => {
  const engine = executableSource(componentSource('src/QuestionEngine.jsx'));
  // Resolved from the question, through the registry's own rule.
  assert.match(engine, /import \{ resolveReferenceSheet \} from '\.\/platform\/assessment\/referenceSheets';/);
  assert.match(engine, /const referenceSheet = useMemo\(\(\) => resolveReferenceSheet\(processedQuestion\), \[processedQuestion\]\);/);
  // The panel is a lazy chunk, never a static import.
  assert.match(engine, /const AssignmentReferenceSheet = lazy\(\(\) => import\('\.\/components\/assessment\/AssignmentReferenceSheet\.jsx'\)/);
  assert.doesNotMatch(engine, /^import [^\n]*AssignmentReferenceSheet[^\n]*from/m);
  // The button is in the work bar and only when there is a sheet.
  const bar = region(engine, 'const questionWorkBar = (', '    </>\n  );', 'the work bar');
  const button = bar.slice(bar.indexOf('{referenceSheet ? ('), bar.indexOf(') : null}', bar.indexOf('{referenceSheet ? (')));
  assert.match(button, /className="mathmaster-work-bar-tool"/);
  assert.match(button, /aria-haspopup="dialog"/);
  assert.match(button, /aria-expanded=\{referenceSheetOpen\}/);
  assert.match(button, /onClick=\{\(\) => setReferenceSheetOpen\(\(open\) => !open\)\}/);
  assert.match(button, /referenceSheet\.buttonLabel \|\| 'Reference sheet'/);
  // The panel renders only for a sheet, inside Suspense, in the question's own room.
  assert.match(engine, /\{referenceSheet \? \(\s*<Suspense fallback=\{null\}>\s*<AssignmentReferenceSheet sheet=\{referenceSheet\} open=\{referenceSheetOpen\} onOpenChange=\{setReferenceSheetOpen\} roomRef=\{questionEngineRef\} \/>\s*<\/Suspense>\s*\) : null\}/);
  // It closes with the question and when the question starts over, as the calculator does.
  assert.equal((engine.match(/setCalculatorOpen\(false\);\s*setReferenceSheetOpen\(false\);/g) || []).length, 2);
});
