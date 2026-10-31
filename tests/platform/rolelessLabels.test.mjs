/*
 * A LABEL ON A BARE SPAN, STRONG OR DIV IS NOT READ (AX18; WCAG 1.3.1, 4.1.2).
 *
 * An aria-label on an element with no role (a span, a strong, a div) names
 * nothing: its role is "generic", which may not be named, and a screen reader
 * reads the element's own text instead — an arrow, "↑2", "T-2", a ✓, a dash —
 * or nothing at all. It was how the Systems elimination stack's sign and
 * "eliminated" mark, the Live Challenge ranks and movement arrows, My Math
 * Path's "to" between a skill's before and after, the worked-example check and
 * the Live Challenge status chips were labelled, about forty places in all.
 *
 * Each now carries the words a way a screen reader does read them: a role (a
 * group for a named set, an image for a mark that stands alone), or the glyph
 * hidden and its words in a visually hidden span.
 *
 * This file holds that two ways: no student or teacher screen in src/ puts a
 * label on a role-less generic element (a scan, with its own cases to prove it
 * can fail), and the pure components render the words a screen reader gets.
 * The same words, read from Chromium's accessibility tree:
 * tests/browser/accessiblePrimitives.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ------------------------------------------------------------------ the scan
// Elements whose implicit role is "generic" (or paragraph), which cannot be named.
const GENERIC = 'span|strong|em|b|i|u|small|mark|div|p|code|sup|sub|abbr|time';

/**
 * The opening tags of generic elements in JSX source that carry an aria-label
 * and no role. A tag runs to the first `>` outside braces and quotes, so an
 * arrow function or a template literal in an attribute does not end it early.
 */
const rolelessLabelSites = (source) => {
  const found = [];
  for (const match of source.matchAll(new RegExp(`<(${GENERIC})(?=[\\s>/])`, 'g'))) {
    let depth = 0;
    let quote = '';
    let index = match.index + match[0].length;
    let attributes = '';
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === '\\') index += 1;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
      if (char === '{') { depth += 1; continue; }
      if (char === '}') { depth -= 1; continue; }
      if (depth === 0 && char === '>') break;
      if (depth === 0) attributes += char;
    }
    if (/\saria-label\s*=/.test(attributes) && !/\srole\s*=/.test(attributes) && !/\{\.\.\./.test(source.slice(match.index, index))) {
      found.push({ tag: match[1], line: source.slice(0, match.index).split('\n').length });
    }
  }
  return found;
};

test('the scan finds a label on a bare generic element, and only that', () => {
  assert.equal(rolelessLabelSites('<span aria-label="to">→</span>').length, 1);
  assert.equal(rolelessLabelSites('<strong aria-label={row.place.spoken} style={{ a: 1 }}>x</strong>').length, 1);
  assert.equal(rolelessLabelSites('<div\n  className="a"\n  aria-label={`Round ${n} of ${m}`}\n  style={{ display: \'flex\' }}\n>').length, 1);
  assert.equal(rolelessLabelSites('<span className="a" aria-label="x" onClick={() => a > b}>').length, 1, 'a > inside braces does not end the tag');
  assert.equal(rolelessLabelSites('<span role="img" aria-label="minus">−</span>').length, 0, 'a role names it');
  assert.equal(rolelessLabelSites('<div aria-label="x" style={{ y: 1 }} role="group">').length, 0, 'wherever the role is written');
  assert.equal(rolelessLabelSites('<span aria-hidden="true">→</span>').length, 0);
  assert.equal(rolelessLabelSites('<button aria-label="x"><span>y</span></button>').length, 0, 'a button, an input and a section may be named');
  assert.equal(rolelessLabelSites('<section aria-label="x">').length, 0);
  assert.equal(rolelessLabelSites('<span {...props} aria-label="x">').length, 0, 'a spread may carry the role: not judged');
  assert.equal(rolelessLabelSites('<spanner aria-label="x">').length, 0, 'a component whose name merely starts like one');
  assert.deepEqual(rolelessLabelSites('a\nb\n<p aria-label="x">'), [{ tag: 'p', line: 3 }]);
});

const sourceFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const file = path.join(dir, name);
  if (statSync(file).isDirectory()) return sourceFiles(file);
  return name.endsWith('.jsx') ? [file] : [];
});

test('no screen puts an aria-label on a bare span, strong, div or paragraph', () => {
  const offenders = [];
  for (const file of sourceFiles(path.join(repo, 'src'))) {
    rolelessLabelSites(readFileSync(file, 'utf8')).forEach((site) => offenders.push(`${path.relative(repo, file)}:${site.line} <${site.tag}>`));
  }
  assert.deepEqual(
    offenders,
    [],
    'A label on an element with no role is not read. Give it a role (group for a named set, img for a mark that stands alone), or hide the glyph and put the words in a visually hidden span (src/ui/srOnly.js).',
  );
});

// --------------------------------------------------------- what is rendered
let server;
const load = async (file, name = 'default') => (await server.ssrLoadModule(file))[name];

test.before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
});
test.after(async () => { await server?.close(); });

// The words a screen reader reads from markup whose subtrees are plain: text,
// minus anything aria-hidden (none of these nest another element in one).
const readText = (html) => html
  .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

test('My Math Path says "to" between a skill\'s before and after, and draws the arrow', async () => {
  const SkillsMoved = await load('/src/components/student/MyMathPathSkillsMoved.jsx');
  const html = renderToStaticMarkup(React.createElement(SkillsMoved, {
    skillsMoved: {
      state: 'ready',
      moves: [
        { code: 'A.5A', label: 'Solving linear equations', estimateBefore: 62, estimateAfter: 71, statusBefore: 'Developing', statusAfter: 'Secure' },
        { code: 'A.3C', label: 'Graphing lines', estimateBefore: null, estimateAfter: 40, statusBefore: 'Developing', statusAfter: 'Developing' },
      ],
    },
  }));
  assert.match(readText(html), /Solving linear equations 62% to 71% · Developing to Secure/);
  assert.match(readText(html), /Graphing lines New to 40%/);
  assert.equal((html.match(/<span aria-hidden="true">→<\/span>/g) || []).length, 3, 'the arrow is still drawn, and only drawn');
  assert.doesNotMatch(html, /aria-label="to"/);
});

test('a Live Challenge board says each place and movement in words, and draws "T-2" and "↑2"', async () => {
  const { standingsRows } = await import('../../src/platform/liveChallenge/challengeStandingsModel.js');
  const { StandingsBoard, RoundResultsTable } = await server.ssrLoadModule('/src/components/liveChallenge/ChallengeShellParts.jsx');
  const rows = standingsRows([
    { playerKey: 'a', alias: 'Swift Otter', rank: 1, score: 120, correctCount: 3 },
    { playerKey: 'b', alias: 'Quick Fox', rank: 2, tied: true, score: 90, correctCount: 2 },
    { playerKey: 'c', alias: 'Calm Heron', rank: 2, tied: true, score: 90, correctCount: 2 },
    { playerKey: 'd', alias: 'Bold Crane', rank: 4, score: 10, correctCount: 1 },
  ], { movement: new Map([['a', 2], ['b', -1], ['c', 0], ['d', 1]]) });
  const html = renderToStaticMarkup(React.createElement(StandingsBoard, { rows, presentation: null, look: 'student', label: 'Standings' }));
  const items = html.split('<li ').slice(1).map((item) => readText(`<li ${item}`));
  assert.match(items[0], /^1st Swift Otter up 2 places 120 pts$/);
  assert.match(items[1], /^tied for 2nd Quick Fox down 1 place 90 pts$/);
  assert.match(items[2], /^tied for 2nd Calm Heron 90 pts$/, 'no change draws nothing');
  assert.match(items[3], /^4th Bold Crane up 1 place 10 pts$/);
  assert.match(html, /<span aria-hidden="true">T-2<\/span>/, 'the short form is what is drawn');
  assert.match(html, /<span aria-hidden="true">↑2<\/span>/);
  assert.doesNotMatch(html, /<(?:strong|span)[^>]*aria-label=/, 'no label on the cells');

  const results = renderToStaticMarkup(React.createElement(RoundResultsTable, {
    view: { rows: [
      { playerKey: 'a', alias: 'Swift Otter', participated: true, place: { short: '1', ordinal: '1st', spoken: '1st' }, roundPoints: 100, matchPointsAwarded: 0 },
      { playerKey: 'b', alias: 'Quick Fox', participated: true, place: { short: 'T-2', ordinal: 'T-2nd', spoken: 'tied for 2nd' }, roundPoints: 80, matchPointsAwarded: 0 },
    ] },
    presentation: { placementPoints: false },
    look: 'student',
  }));
  assert.match(readText(results), /1st Swift Otter 100 pts tied for 2nd Quick Fox 80 pts/);
  assert.match(results, /<span aria-hidden="true">T-2nd<\/span>/);
});

test('the elimination stack\'s sign and "eliminated" mark are images with their words', async () => {
  const { EliminationOperationSymbol, EliminationCombinationEntry } = await server.ssrLoadModule('/src/tools/systemsWorkspace/EliminationStack.jsx');
  const sign = (operation) => renderToStaticMarkup(React.createElement(EliminationOperationSymbol, { operation }));
  assert.match(sign('subtract'), /<span[^>]*role="img"[^>]*aria-label="minus"[^>]*>−<\/span>/);
  assert.match(sign('add'), /<span[^>]*role="img"[^>]*aria-label="plus"[^>]*>\+<\/span>/);
  assert.equal(sign(null), '');
  const entry = renderToStaticMarkup(React.createElement(EliminationCombinationEntry, {
    variables: ['x', 'y'], target: 'x', label: 'R₁', values: {}, onTerm() {}, onCheck() {}, entryId: 'r1',
  }));
  assert.match(entry, /<span[^>]*is-eliminated[^>]*role="img"[^>]*aria-label="x eliminated"[^>]*>—<\/span>/);
});
