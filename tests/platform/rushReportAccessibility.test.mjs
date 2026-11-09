/*
 * THE RUSH REPORT, READ BY A SCREEN READER (teacher features walk, items 5 and 11).
 *
 * "After the game" on the teacher's console breaks a Graph Feature Rush (or an
 * Inequality Graphing Rush) down by feature, by kind of graph, by the mistakes
 * wrong checks made and by where wrong taps landed. Each block was a styled
 * line of text over styled lines: a screen reader could not move from block to
 * block by heading, nor along a row, and the totals ran into one another. And
 * one press read "of 1 presses".
 *
 * Rendered here (Vite's SSR loader compiles the .jsx) from reports the
 * server's own buildRushReport writes:
 *   - each block's title is a heading, and its rows a table named by it: a row
 *     header for what the row counts, then its numbers, under column names a
 *     screen reader reads (their row has no height on screen);
 *   - the totals are a list;
 *   - what the teacher sees is unchanged: the same words and numbers, in the
 *     same order;
 *   - "of 1 press", "of 7 presses".
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { graphFamilyLabel } from '../../functions/shared/graphFeatureCatalog.mjs';
import { buildRushReport } from '../../functions/shared/graphFeatureRush.mjs';
import { INEQUALITY_REPORT_LABELS } from '../../functions/shared/inequalityRush.mjs';

// One SSR server for the file: the component's imports start the app's
// Firestore once per process, and a second server would start it again.
let server = null;
let RushReport = null;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ RushReport } = await server.ssrLoadModule('/src/components/liveChallenge/GraphFeatureRushHost.jsx'));
});
after(async () => { await server?.close(); });
const renderReport = (report) => renderToStaticMarkup(React.createElement(RushReport, { report }));

const bucket = (questions, completed, attempts, hits) => ({ questions, completed, attempts, hits });
const standing = (studentId, summary) => ({ studentId, alias: `Player ${studentId}`, joined: true, rank: 1, score: 0, questionSetSummary: summary });

// One class's rush, as the server reports it: one "Does Not Exist" press, seven "Off screen" ones.
const graphRush = buildRushReport({
  standings: [
    standing('a', {
      questions: 6, completed: 4, skipped: 1, attempts: 10, hits: 7,
      dnePresses: 1, dneCorrect: 1, offScreenPresses: 7, offScreenCorrect: 6,
      byFeature: { vertex: bucket(3, 1, 5, 2), yIntercept: bucket(3, 3, 5, 5) },
      byFamily: { quadratic: bucket(6, 4, 10, 7) },
      mistakes: { leftEnd: 2 },
      wrongTaps: { xIntercept: { yIntercept: 3 }, maximum: { minimum: 1 } },
    }),
  ],
});
const inequalityRush = buildRushReport({
  standings: [
    standing('b', {
      questions: 5, completed: 3, skipped: 2, attempts: 8, hits: 5, dnePresses: 3, dneCorrect: 2,
      byFamily: { linear: bucket(5, 3, 8, 5) },
      mistakes: { direction: 3, signFlip: 1 },
    }),
  ],
}, INEQUALITY_REPORT_LABELS);

const decode = (text) => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// What a sighted teacher sees: the markup's text, without the column names kept for a screen reader.
const SCREEN_READER_ONLY = /<span style="[^"]*clip:rect\(0 0 0 0\)[^"]*">[^<]*<\/span>/g;
const seen = (html) => decode(html.replace(SCREEN_READER_ONLY, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Each block: its heading, and a table named by that heading, with column names and one row header per row.
const assertBlock = (html, { title, columns, rows }) => {
  const named = html.match(new RegExp(`<h4 id="([^"]+)"[^>]*>${escapeRegExp(title)}</h4><table aria-labelledby="([^"]+)"`));
  assert.ok(named, `"${title}" is a heading, and the table after it is named by it`);
  assert.equal(named[2], named[1], `"${title}": the table's name is its heading`);
  const table = html.slice(named.index, html.indexOf('</table>', named.index));
  const headers = [...table.matchAll(/<th scope="col"[^>]*><span[^>]*>([^<]*)<\/span><\/th>/g)].map((match) => decode(match[1]));
  assert.deepEqual(headers, columns, `"${title}": a screen reader hears the columns' names`);
  const body = [...table.matchAll(/<tr><th scope="row"[^>]*>([^<]*)<\/th><td[^>]*>([^<]*)<\/td><\/tr>/g)].map((match) => [decode(match[1]), decode(match[2])]);
  assert.deepEqual(body, rows, `"${title}": each row is headed by what it counts, then its numbers`);
};

test('a Graph Feature Rush report: headed blocks, real tables, a list of totals, and nothing new on screen', () => {
  const html = renderReport({ graphFeatureRush: graphRush });
  const progress = (row) => `${row.completed}/${row.questions} completed · ${row.accuracyPercent}% of taps right`;
  const blocks = [
    { title: 'By feature, hardest first', columns: ['Feature', 'Results'], rows: graphRush.byFeature.map((row) => [row.label, progress(row)]) },
    { title: 'By kind of graph, hardest first', columns: ['Kind of graph', 'Results'], rows: [[graphFamilyLabel('quadratic'), progress(graphRush.byFamily[0])]] },
    { title: 'What wrong checks got wrong, most common first', columns: ['Mistake', 'Wrong checks'], rows: graphRush.mistakes.map((row) => [row.label, String(row.count)]) },
    { title: 'Where wrong taps landed, most common first', columns: ['Wrong tap', 'Taps'], rows: [['Tapped the y-intercept when asked for zeros (x-intercepts)', '3'], ['Tapped the minimum when asked for the maximum', '1']] },
  ];
  blocks.forEach((block) => assertBlock(html, block));
  assert.equal((html.match(/<h4 /g) || []).length, 4, 'one heading for each block, and no other');
  assert.equal((html.match(/<th scope="row"/g) || []).length, 6, 'every row of every block is a row of a table');
  // The totals are a list: one item each.
  const totals = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'));
  assert.equal((totals.match(/<li>/g) || []).length, 5);
  // What a sighted teacher reads is what the report always showed, in the same order.
  assert.equal(seen(html), [
    '4 graphs completed', 'Tap accuracy 70%', '1 skipped', '"Does Not Exist" right 100% of 1 press', '"Off screen" right 86% of 7 presses',
    'By feature, hardest first', ...blocks[0].rows.flat(),
    'By kind of graph, hardest first', ...blocks[1].rows.flat(),
    'What wrong checks got wrong, most common first', ...blocks[2].rows.flat(),
    'Where wrong taps landed, most common first', ...blocks[3].rows.flat(),
  ].join(' '));
  // The header row is for a screen reader: its names are visually hidden and it takes no room.
  assert.match(html, /<th scope="col" style="padding:0"><span style="position:absolute;width:1px;height:1px;[^"]*clip:rect\(0 0 0 0\)/);
  // The console sits in the dashboard's content, whose stylesheet gives a table a 640px floor (App.css):
  // these two columns are as wide as the report, so they fit a phone.
  assert.equal((html.match(/<table [^>]*style="width:100%;min-width:0;/g) || []).length, 4);
});

test('one press is "1 press"; any other number is "presses"', () => {
  const render = (rush) => seen(renderReport({ graphFeatureRush: rush }));
  const pressing = (dnePresses, offScreenPresses) => buildRushReport({ standings: [standing('c', { attempts: 1, hits: 1, dnePresses, dneCorrect: 0, offScreenPresses, offScreenCorrect: offScreenPresses })] });
  const one = render(pressing(1, 1));
  assert.match(one, /"Does Not Exist" right 0% of 1 press(?!e)/);
  assert.match(one, /"Off screen" right 100% of 1 press(?!e)/);
  assert.doesNotMatch(one, /\b1 presses/);
  const many = render(pressing(2, 7));
  assert.match(many, /of 2 presses/);
  assert.match(many, /of 7 presses/);
  assert.match(render(pressing(0, 0)), /"Does Not Exist" right — of 0 presses/, 'none pressed: "of 0 presses", and no "Off screen" line');
});

test('an Inequality Graphing Rush report has the same structure in its own words', () => {
  const html = renderReport({ inequalityRush });
  const row = inequalityRush.byFamily[0];
  assertBlock(html, {
    title: 'By kind of inequality, hardest first',
    columns: ['Kind of inequality', 'Results'],
    rows: [[row.label, `${row.completed}/${row.questions} completed · ${row.accuracyPercent}% of answers right`]],
  });
  assertBlock(html, {
    title: 'What wrong checks got wrong, most common first',
    columns: ['Mistake', 'Wrong checks'],
    rows: inequalityRush.mistakes.map((mistake) => [mistake.label, String(mistake.count)]),
  });
  assert.equal((html.match(/<h4 /g) || []).length, 2, 'no feature or tap block for an inequality game');
  assert.match(seen(html), /^3 inequalities completed Accuracy 63% 2 skipped "No Solution" right 67% of 3 presses By kind of inequality/);
});
