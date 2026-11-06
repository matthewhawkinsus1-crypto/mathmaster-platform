/*
 * THE GRAPH THE LINE AND CLASSIC REPORTS, READ BY A SCREEN READER (teacher features walk, item 11).
 *
 * "After the game" on the teacher's console holds every game's report: the classic game's totals
 * and "By standard, hardest first", and, after a Graph the Line game, its breakdown by form, by
 * what students do, by difficulty, the class's mistakes and by student. Each block was a styled
 * line of text over styled lines, as the rush report's were (rushReportAccessibility.test.mjs): a
 * screen reader could not move from block to block by heading, nor along a row, and the totals ran
 * into one another.
 *
 * Rendered here (Vite's SSR loader compiles the .jsx) from reports the server's own builders write
 * (buildLineGraphReport, buildChallengeReport):
 *   - each breakdown's title is a heading, and its rows a table named by it: a row header for what
 *     the row counts, then its numbers, under column names a screen reader reads (their row has no
 *     height on screen);
 *   - the totals are a list, and so are the students under "By student", whose entries can carry
 *     a second line (the mistake a student made most), which is no column;
 *   - what the teacher sees is unchanged: the same words and numbers, in the same order.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { buildLineGraphReport } from '../../functions/shared/lineGraphAttempts.mjs';
import { buildChallengeReport } from '../../functions/shared/liveChallengeReport.mjs';

// One SSR server for the file: the components' imports start the app's Firestore once per process,
// and a second server would start it again.
let server = null;
let LineGraphReport = null;
let ChallengeReport = null;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ({ LineGraphReport } = await server.ssrLoadModule('/src/components/liveChallenge/LineGraphHost.jsx'));
  ({ ChallengeReport } = await server.ssrLoadModule('/src/components/liveChallenge/LiveChallengeTeacher.jsx'));
});
after(async () => { await server?.close(); });

const decode = (text) => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// What a sighted teacher sees: the markup's text, without the column names kept for a screen reader.
const SCREEN_READER_ONLY = /<span style="[^"]*clip:rect\(0 0 0 0\)[^"]*">[^<]*<\/span>/g;
const seen = (html) => decode(html.replace(SCREEN_READER_ONLY, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (html, pattern) => (html.match(pattern) || []).length;

// A block: its heading, and a table named by that heading, with column names and one row header per row.
// Returns the block's markup, from the box that holds it to the end of the box.
const assertBlock = (html, { title, columns, rows }) => {
  const named = html.match(new RegExp(`<h4 id="([^"]+)"[^>]*>${escapeRegExp(title)}</h4><table aria-labelledby="([^"]+)"`));
  assert.ok(named, `"${title}" is a heading, and the table after it is named by it`);
  assert.equal(named[2], named[1], `"${title}": the table's name is its heading`);
  const table = html.slice(named.index, html.indexOf('</table>', named.index));
  const headers = [...table.matchAll(/<th scope="col"[^>]*><span[^>]*>([^<]*)<\/span><\/th>/g)].map((match) => decode(match[1]));
  assert.deepEqual(headers, columns, `"${title}": a screen reader hears the columns' names`);
  const body = [...table.matchAll(/<tr><th scope="row"[^>]*>([^<]*)<\/th><td[^>]*>([^<]*)<\/td><\/tr>/g)].map((match) => [decode(match[1]), decode(match[2])]);
  assert.deepEqual(body, rows, `"${title}": each row is headed by what it counts, then its numbers`);
  const box = html.lastIndexOf('<div', named.index);
  return html.slice(box, html.indexOf('</div>', named.index) + '</div>'.length);
};

/* ------------------------------ Graph the Line ----------------------------- */

const bucket = (questions, completed, attempts, hits) => ({ questions, completed, attempts, hits });
const standing = (studentId, alias, joined, summary) => ({ studentId, alias, joined, rank: 1, score: 0, questionSetSummary: summary });

// One class's Graph the Line game, as the server reports it: two forms, both kinds of item, two
// difficulties, nine kinds of wrong line (the report names eight), and a student who never joined.
const lineReport = buildLineGraphReport({
  standings: [
    standing('s1', 'Comet', true, {
      questions: 6, completed: 4, skipped: 1, attempts: 9, hits: 5, extraTimeCompleted: 1,
      byTag: { form: { slopeIntercept: bucket(4, 3, 5, 3), standard: bucket(2, 1, 4, 2) }, itemType: { graph: bucket(4, 3, 6, 3), name: bucket(2, 1, 3, 2) } },
      byTier: { easy: bucket(3, 3, 3, 3), standard: bucket(3, 1, 6, 2) },
      mistakes: { slopeSign: 3, interceptSign: 1, slopeReciprocal: 1, rightSlope: 1, rightAnchor: 1, pointSign: 1, pointSwapped: 1, xInterceptAsB: 1 },
    }),
    standing('s2', 'Nova', true, {
      questions: 5, completed: 5, skipped: 0, attempts: 6, hits: 5,
      byTag: { form: { slopeIntercept: bucket(5, 5, 6, 5) }, itemType: { graph: bucket(5, 5, 6, 5) } },
      byTier: { easy: bucket(5, 5, 6, 5) },
      mistakes: { offTrack: 2, slopeSign: 1 },
    }),
    standing('s3', 'Delta', false, {}),
  ],
});
const renderLine = (lineGraph) => renderToStaticMarkup(React.createElement(LineGraphReport, { report: { lineGraph } }));

const NOTE = 'A mistake is named only when the line could have come from nothing else; the rest are described by what was true of the line.';
const LINE_BLOCKS = [
  {
    hook: 'byForm', title: 'By form, hardest first', columns: ['Form of equation', 'Results'],
    rows: [['Standard form', '1/2 right · 50% of checks right'], ['Slope-intercept form', '8/9 right · 73% of checks right']],
  },
  {
    hook: 'byItemType', title: 'Graph it and Name it', columns: ['What students do', 'Results'],
    rows: [['Name it', '1/2 right · 67% of checks right'], ['Graph it', '8/9 right · 67% of checks right']],
  },
  {
    hook: 'byTier', title: 'By difficulty', columns: ['Difficulty', 'Results'],
    rows: [['Standard', '1/3 right · 33% of checks right'], ['Easy', '8/8 right · 89% of checks right']],
  },
  {
    hook: 'mistakes', title: 'The mistakes the class made, most first', columns: ['Mistake', 'Wrong lines'],
    rows: [
      ['Slope sign flipped', '4 wrong lines'], ['Other wrong lines', '2 wrong lines'], ['y-intercept sign flipped', '1 wrong line'],
      ['Point-slope: both signs flipped', '1 wrong line'], ['Point coordinates swapped', '1 wrong line'], ['Right point, wrong slope', '1 wrong line'],
      ['Right slope, wrong place', '1 wrong line'], ['Rise and run swapped', '1 wrong line'],
    ],
  },
];

test('a Graph the Line report: headed blocks, real tables, lists for the totals and the students, and nothing new on screen', () => {
  const html = renderLine(lineReport);
  const boxes = LINE_BLOCKS.map((block) => assertBlock(html, block));
  // Each block keeps the hook it was found by, on the box that holds its heading and its table.
  LINE_BLOCKS.forEach((block, at) => assert.match(boxes[at], new RegExp(`^<div data-mm-line-report="${block.hook}"`), `${block.hook}: the block's hook`));
  assert.match(html, /^<section [^>]*data-mm-line-report="summary"/, 'and the report its own');
  // The note on how a mistake is named is read after that block's table, inside its block.
  assert.ok(boxes[3].indexOf(`>${NOTE}</p>`) > boxes[3].indexOf('</table>'), 'the note follows the mistakes table');
  assert.equal(count(html, /<h4 /g), 4, 'one heading for each block, and no other');
  assert.equal(count(html, /<th scope="row"/g), 14, 'every row of every block is a row of a table');
  // The console sits in the dashboard's content, whose stylesheet gives a table a 640px floor (App.css):
  // these two columns are as wide as the report, so they fit a phone.
  assert.equal(count(html, /<table [^>]*style="width:100%;min-width:0;/g), 4);
  // The totals are a list: one item each.
  const totals = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'));
  assert.equal(count(totals, /<li>/g), 3);
  assert.match(totals, /^<ul style="[^"]*list-style:none/, 'drawn as the line of totals it was');
  // The students who joined are a list inside "By student": one entry each, and the student who never joined is not one.
  const byStudent = html.slice(html.indexOf('<details>'), html.indexOf('</details>'));
  assert.match(byStudent, /^<details><summary [^>]*>By student \(game names\)<\/summary><ul [^>]*>/);
  assert.equal(count(byStudent, /<li /g), 2);
  assert.doesNotMatch(byStudent, /Delta/);
  // What a sighted teacher reads is what the report always showed, in the same order.
  assert.equal(seen(html), [
    '9 of 11 lines right', 'Accuracy 67% of checks', '1 shown or skipped',
    ...LINE_BLOCKS.flatMap((block) => [block.title, ...block.rows.flat()]), NOTE,
    'By student (game names)',
    'Comet', '4 right · 56% · 1 in extra time', 'Most often: Slope sign flipped',
    'Nova', '5 right · 83%', 'Most often: Other wrong lines',
  ].join(' '));
});

test('a Graph the Line game of one kind of item at one difficulty shows neither of those blocks, as before', () => {
  const html = renderLine(buildLineGraphReport({
    standings: [standing('s2', 'Nova', true, {
      questions: 2, completed: 1, skipped: 1, attempts: 2, hits: 1,
      byTag: { form: { standard: bucket(2, 1, 2, 1) }, itemType: { graph: bucket(2, 1, 2, 1) } },
      byTier: { easy: bucket(2, 1, 2, 1) },
    })],
  }));
  assertBlock(html, { title: 'By form, hardest first', columns: ['Form of equation', 'Results'], rows: [['Standard form', '1/2 right · 50% of checks right']] });
  assert.equal(count(html, /<h4 /g), 1, 'no "Graph it and Name it", no "By difficulty" and no mistakes');
  assert.equal(count(html, /<table /g), 1);
  assert.equal(seen(html), '1 of 2 lines right Accuracy 50% of checks 1 shown or skipped By form, hardest first Standard form 1/2 right · 50% of checks right By student (game names) Nova 1 right · 50%');
});

/* --------------------------------- classic --------------------------------- */

// One class's classic game, as the server reports it: two standards, one far harder than the other.
const classicReport = buildChallengeReport({
  room: { title: 'P3 Challenge', className: 'Period 3', roundSeconds: 45, standardCode: 'mixed' },
  scheduledRoundCount: 3,
  playedRoundCount: 3,
  roundMisses: { 0: 2, 1: 8, 2: 0 },
  roundStandards: { 0: 'A.2A', 1: 'A.7A', 2: 'A.2A' },
  answeredCounts: { 0: 10, 1: 10, 2: 9 },
  players: [
    { studentId: 's1', alias: 'Prime Fox 12', joined: true, score: 3200, correctCount: 3, roundsAnswered: 3 },
    { studentId: 's2', alias: 'Nova Owl 20', joined: true, score: 900, correctCount: 1, roundsAnswered: 3 },
    { studentId: 's3', alias: 'Delta Hawk 44', joined: false },
  ],
});
const renderClassic = (report) => renderToStaticMarkup(React.createElement(ChallengeReport, { report }));

test('a classic game\'s report: "By standard, hardest first" is a headed table, the totals a list, and nothing new on screen', () => {
  const html = renderClassic(classicReport);
  const box = assertBlock(html, {
    title: 'By standard, hardest first',
    columns: ['Standard', 'Results'],
    rows: [['A.7A', '2/10 correct · 20%'], ['A.2A', '17/19 correct · 89%']],
  });
  // Under "After the game", the report's own heading.
  assert.ok(html.indexOf('<h3 ') >= 0 && html.indexOf('<h3 ') < html.indexOf('<h4 '), 'the block\'s heading is under "After the game"');
  assert.equal(count(html, /<h4 /g), 1);
  // Its rows are ruled as they always were, and it keeps its room below.
  assert.match(box, /^<div style="margin-bottom:14px">/);
  assert.equal(count(box, /<th scope="row" style="[^"]*border-bottom:1px solid var\(--mm-border-soft\)/g), 2);
  assert.match(box, /<table [^>]*style="width:100%;min-width:0;/, 'as wide as the report, so it fits a phone');
  // The totals are a list: one item each.
  const totals = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'));
  assert.equal(count(totals, /<li>/g), 3);
  assert.match(totals, /^<ul style="[^"]*margin:0 0 14px;[^"]*list-style:none/, 'drawn as the line of totals it was');
  // What a sighted teacher reads is what the report always showed, in the same order.
  assert.equal(seen(html), [
    'After the game', 'Hardest for this class', 'A.7A — 20% correct',
    `${classicReport.playedCount} of ${classicReport.eligibleCount} played`, `Class accuracy ${classicReport.classAccuracyPercent}%`, '3 rounds',
    'By standard, hardest first', 'A.7A', '2/10 correct · 20%', 'A.2A', '17/19 correct · 89%',
    'Did not join: 1 student. A student can be absent, on paper, or have lost their connection — this is a roster fact, not a finding.',
  ].join(' '));
});

test('a classic game ended early says so in its list of totals', () => {
  const html = renderClassic({ ...classicReport, playedRoundCount: 2, scheduledRoundCount: 3, secondChanceRoundCount: 1 });
  const totals = html.slice(html.indexOf('<ul'), html.indexOf('</ul>'));
  assert.equal(count(totals, /<li>/g), 3);
  assert.match(seen(totals), /2 of 3 rounds played \+ 1 second chance$/);
});
