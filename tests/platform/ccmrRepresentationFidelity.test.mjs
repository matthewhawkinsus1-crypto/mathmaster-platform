/*
 * AN AUDITED ITEM'S REPRESENTATIONS SURVIVE CONVERSION AND REACH THE STUDENT.
 *
 * The audited bank carries no structured visuals. A table item writes its
 * table into the prompt as a LaTeX array, or names a table and lists its
 * rows; a graph item describes its graph in words or by its equation.
 * Converted as plain prompt text, the table items read to MathMaster's own
 * check as "refers to a table in its prompt, but the question contains none".
 * bankDocumentToV5Intent now carries each such table across as a `table` the
 * multiAnswer renderer draws, with the item's own rows in its own order —
 * filled per student by the same generator that fills the prompt — and never
 * draws a graph the item only describes (that would let a student read off
 * what the item asks them to work out).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { WORDED_AS_IN_PRODUCTION } from './helpers/ccmrGraphPromiseFixtures.mjs';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const bankDocuments = new Map();
for (const framework of ['digitalSAT', 'act', 'tsia2']) {
  const payload = JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`, import.meta.url), 'utf8'));
  for (const document of payload.items || payload.documents || []) bankDocuments.set(document.id, document);
}
const documentOf = (id) => {
  const document = bankDocuments.get(id);
  assert.ok(document, `audited document ${id}`);
  return document;
};

const compileInPractice = (intent, courseId = 'algebra1') => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Representation fidelity', courseId },
  sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions: [intent] }],
}).package.sections[0].questions[0];

const errorsAbout = (question, kind) => validateQuestionSemantics(question, { label: 'Question 1' }).errors
  .filter((message) => new RegExp(`refers to a ${kind} in its prompt`).test(message));

test('a LaTeX table in an audited prompt becomes the table students see, row for row', () => {
  const document = documentOf('mm_sat_A_2C_1_table_to_equation_v21');
  assert.match(document.prompt, /\\begin\{array\}/, 'the bank writes this table as LaTeX');
  const intent = bank.bankDocumentToV5Intent(document);
  assert.doesNotMatch(intent.prompt, /\\begin\{array\}|\{\{y1\}\}/, 'the table leaves the prompt…');
  assert.equal(intent.prompt, 'The table gives three values of a linear function $f$. Which equation defines $f$?', '…and the audited words stay exactly as written');
  assert.deepEqual(intent.table.columns.map((column) => column.label), ['x', 'f(x)']);
  assert.deepEqual(intent.table.rows, [
    { x: '{{x1}}', fx: '{{y1}}' },
    { x: '{{x2}}', fx: '{{y2}}' },
    { x: '{{x3}}', fx: '{{y3}}' },
  ]);
  assert.equal(intent.ccmrSource.tableFrom, 'latexArray', 'provenance records that only the table’s presentation moved');

  const compiled = compileInPractice(intent);
  assert.deepEqual(errorsAbout(compiled, 'table'), [], 'MathMaster’s check now finds the table the prompt promises');

  // Every student's generated version: the table holds that student's numbers,
  // and they are the numbers the answer key was built from.
  for (const seed of ['student-a', 'student-b', 'student-c', 'student-d']) {
    const generated = generatePathInstance(compiled, seed);
    assert.ok(generated.question, generated.reason);
    const { table } = generated.question;
    const { x1, x2, x3, y1, y2, y3, m, b } = generated.parameters;
    assert.deepEqual(table.rows.map((row) => [row.x, row.fx]), [[x1, y1], [x2, y2], [x3, y3]]);
    table.rows.forEach((row) => assert.equal(row.fx, m * row.x + b, 'each row satisfies the keyed function'));
    assert.ok(!JSON.stringify(generated.question).includes('{{'), 'no placeholder reaches a student');
  }
});

test('every LaTeX-array table in the audited bank converts, and keeps its exact rows', () => {
  const withArrays = [...bankDocuments.values()].filter((document) => (
    document.active !== false
    && document.ccmrAuthenticLanguage?.authored === true
    && /\\begin\{array\}/.test(String(document.prompt))
  ));
  assert.ok(withArrays.length >= 4);
  for (const document of withArrays) {
    const intent = bank.bankDocumentToV5Intent(document);
    assert.ok(intent.table, `${document.id} keeps its table`);
    const cellTokens = new Set(intent.table.rows.flatMap((row) => Object.values(row)).filter((value) => /\{\{/.test(value)));
    // Side-by-side tables over the same inputs share their x row, so compare
    // the values each table holds, not how often the inputs are repeated.
    const arrayTokens = new Set((String(document.prompt).match(/\\begin\{array\}[\s\S]*\\end\{array\}/)[0].match(/\{\{[^}]+\}\}/g) || []));
    assert.deepEqual([...cellTokens].sort(), [...arrayTokens].sort(), `${document.id}: every templated cell survives`);
    assert.doesNotMatch(intent.prompt, /\\begin\{array\}/, `${document.id}: and is shown once, as the table`);
  }
});

test('a table an item names and lists becomes that table; a word that only sounds like one does not', () => {
  const pairs = bank.bankDocumentToV5Intent(documentOf('mm_sat_A_4C_2_select_linear_fit_v21'));
  assert.deepEqual(pairs.table.rows, [1, 2, 3, 4].map((n) => ({ x: `{{x${n}}}`, y: `{{y${n}}}` })));
  assert.equal(pairs.ccmrSource.tableFrom, 'listedPairs');
  assert.equal(pairs.prompt, documentOf('mm_sat_A_4C_2_select_linear_fit_v21').prompt, 'the prompt is untouched');

  const values = bank.bankDocumentToV5Intent(documentOf('mm_sat_A_9C_table-to-model_v21'));
  assert.deepEqual(values.table.columns.map((column) => column.label), ['x', 'f(x)']);
  assert.deepEqual(values.table.rows, [{ x: '0', fx: '{{A}}' }, { x: '1', fx: '{{v1}}' }, { x: '2', fx: '{{v2}}' }]);

  // "Each table requires {{woodT}} units of wood" is furniture. (CT01 reworded the
  // bank item to "A table requires …"; the sentence is kept here as it was, because
  // it is the converter's reading of it that this is about.)
  const furnitureWording = 'A workshop makes tables and shelves. Each table requires {{woodT}} units of wood and {{laborT}} hours of labor. Each shelf requires {{woodS}} units of wood and {{laborS}} hours of labor. At most {{woodMax}} units of wood and {{laborMax}} labor hours are available. Which system represents the possible nonnegative numbers $x$ of tables and $y$ of shelves?';
  const furniture = bank.bankDocumentToV5Intent({ ...documentOf('mm_sat_A2_3E_2_production-resources_v21'), prompt: furnitureWording });
  assert.equal(furniture.table, undefined);
  assert.equal(furniture.prompt, furnitureWording);
  // A graph described in words is not drawn: the student works it out. (The same,
  // for the item as it was worded when it promised "the graph of …".)
  const describedDocument = documentOf('mm_sat_A_3E_5_intercept-change_v21');
  const describedWording = WORDED_AS_IN_PRODUCTION[describedDocument.id];
  const described = bank.bankDocumentToV5Intent({ ...describedDocument, prompt: describedWording });
  assert.equal(described.graph, undefined);
  assert.equal(described.functionSpec, undefined);
  assert.equal(described.prompt, describedWording);
  // The repaired bank items are not drawn either: the line is named by its equation, nothing is plotted.
  const repaired = bank.bankDocumentToV5Intent(describedDocument);
  assert.equal(repaired.graph, undefined);
  assert.equal(repaired.functionSpec, undefined);
  assert.equal(repaired.prompt, describedDocument.prompt);
});

test('across the whole audited bank, conversion never loses an item MathMaster accepted before, and recovers every table item it can', () => {
  let recovered = 0;
  for (const document of bankDocuments.values()) {
    if (!(document.active !== false && document.assessmentContext?.examStyle === true && document.ccmrAuthenticLanguage?.authored === true)) continue;
    const intent = bank.bankDocumentToV5Intent(document);
    const compiled = compileInPractice(intent);
    const before = compileInPractice({ ...intent, prompt: document.prompt, table: undefined });
    const tableErrorsBefore = errorsAbout(before, 'table');
    const tableErrorsAfter = errorsAbout(compiled, 'table');
    if (!tableErrorsBefore.length) {
      assert.deepEqual(tableErrorsAfter, [], `${document.id} gained a table error`);
    } else if (!tableErrorsAfter.length) {
      recovered += 1;
    }
  }
  assert.ok(recovered >= 8, `table items made deliverable: ${recovered}`);
});

test('the student renderer draws the converted table with that student’s numbers', async () => {
  const compiled = compileInPractice(bank.bankDocumentToV5Intent(documentOf('mm_sat_A_2C_1_table_to_equation_v21')));
  // The same generation a student's assignment runs (problemGenerator.js).
  const instance = generateQuestion(compiled, 'assignment-1|student-1|q-24');
  assert.ok(Array.isArray(instance.table?.rows) && instance.table.rows.length === 3);
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { default: MultiAnswerGrader } = await server.ssrLoadModule('/src/MultiAnswerGrader.jsx');
    const html = renderToStaticMarkup(React.createElement(MultiAnswerGrader, { question: instance, onAttempt: () => {} }));
    const table = html.match(/<table[\s\S]*?<\/table>/)?.[0];
    assert.ok(table, 'the multiAnswer renderer draws a table');
    assert.match(table, /<th[^>]*>x<\/th>[\s\S]*<th[^>]*>f\(x\)<\/th>/);
    instance.table.rows.forEach((row) => {
      assert.match(table, new RegExp(`<td[^>]*>${String(row.x).replace('-', '\\-')}</td><td[^>]*>${String(row.fx).replace('-', '\\-')}</td>`));
    });
    assert.doesNotMatch(html, /\{\{|\\begin\{array\}/, 'no template or raw LaTeX table is shown');
  } finally {
    await server.close();
  }
});

test('an Honors candidate built from table items passes Pre-Flight as a whole assignment', () => {
  const questions = ['mm_sat_A_2C_1_table_to_equation_v21', 'mm_sat_A_2C_5_table_parameter_v21', 'mm_sat_A_2C_6_nonconsecutive_table_v21', 'mm_sat_A_2C_8_standard_form_parameter_from_table_v21']
    .map((id) => bank.bankDocumentToV5Intent(documentOf(id)));
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Tables', courseId: 'algebra1' },
    sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions }],
  }).package;
  const model = buildAssignmentV5PreflightModel(compiled);
  assert.deepEqual(model.errors.filter((message) => /refers to a table/.test(message)), []);
});
