/*
 * NO STYLESHEET QUOTES A WORD THE LEAK GATE REFUSES.
 *
 * In development Vite serves every stylesheet a screen imports as a <style>
 * in the page, comments included. tests/browser/assessmentLeakGates.mjs reads
 * an exit ticket's or a test's whole document for the feedback ladder's words
 * (tests/browser/support/assessmentLadderWords.mjs), so a CSS comment that
 * names the hint button by its words fails that gate on a correct page. It
 * happened in WorkViewShell.css twice (ff163f9b, 9feae163) and in App.css's
 * one-try rule (HELP-18), and each time only a browser job found it, after a
 * push. This reads the same list against every stylesheet and the page shell,
 * so the next one fails here, naming its file and line.
 *
 * A production build strips comments, but a `content:` string would reach a
 * student there too, so the rule is the same for both.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSESSMENT_LEAK_TEXTS, LADDER_WORDS } from '../browser/support/assessmentLadderWords.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const SHEETS = [...walk(path.join(ROOT, 'src')).filter((file) => file.endsWith('.css')), path.join(ROOT, 'index.html')]
  .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
  .sort();

const quotes = (text, words) => words.flatMap((word) => {
  const found = [];
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    found.push({ word, line: text.slice(0, at).split('\n').length });
  }
  return found;
});

test("the words are the leak gate's, and there are stylesheets to read", () => {
  assert.ok(LADDER_WORDS.includes('Show a hint'), 'the ladder words include the hint button');
  assert.ok(ASSESSMENT_LEAK_TEXTS.length >= 60, `${ASSESSMENT_LEAK_TEXTS.length} texts to look for`);
  assert.ok(SHEETS.includes('src/App.css') && SHEETS.length >= 20, `${SHEETS.length} stylesheets to read`);
});

test('no stylesheet, comments included, quotes a word the leak gate refuses on an exit ticket or a test', () => {
  const found = SHEETS.flatMap((sheet) => quotes(readFileSync(path.join(ROOT, sheet), 'utf8'), ASSESSMENT_LEAK_TEXTS)
    .map(({ word, line }) => `${sheet}:${line} quotes ${JSON.stringify(word)}`));
  assert.deepEqual(found, [], `In development Vite serves these in the page, where assessmentLeakGates refuses them on an exit ticket or a test. Say what the words do instead of quoting them:\n${found.join('\n')}`);
});
