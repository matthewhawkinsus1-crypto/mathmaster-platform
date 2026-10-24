/*
 * THE SPOKEN COPY OF A FORMULA IS IN THE LANGUAGE IT SITS IN (AX06; WCAG 3.1.2).
 *
 * MathDisplay hides its typeset math from assistive technology and renders ONE
 * spoken copy beside it (accessibleMathSpeech.test.mjs). That copy was always
 * English, so inside a Spanish translation a screen reader said "x squared" in
 * the middle of a Spanish sentence. A translation now hands its language down
 * (MathText `language`, MathDisplay `language`) and the copy is said in it.
 *
 * These render the real components on the server (vite ssrLoadModule +
 * renderToStaticMarkup) and read the hidden spoken copies — the text a screen
 * reader is given. The same on the real Translate button, in Chromium:
 * tests/browser/mathSpeech.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { executableSource, region } from './helpers/sourceContract.mjs';

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

// The hidden spoken copies in the markup, in order.
const spokenCopies = (html) => [...html.matchAll(/<span class="mm-math-spoken"[^>]*>([^<]*)<\/span>/g)].map((match) => match[1]);

const SLOPE = 'y = -\\frac{2}{3}x + 4';
const SLOPE_EN = 'y equals negative 2 over 3 x plus 4';
const SLOPE_ES = 'y es igual a negativo 2 sobre 3 x más 4';

test('MathDisplay says its formula in the language it is given; English is the default', async () => {
  const MathDisplay = await load('/src/MathDisplay.jsx');
  const say = (props) => spokenCopies(renderToStaticMarkup(React.createElement(MathDisplay, { value: SLOPE, ...props })));
  assert.deepEqual(say({}), [SLOPE_EN], 'nothing passed: English, as before');
  assert.deepEqual(say({ language: 'en' }), [SLOPE_EN]);
  assert.deepEqual(say({ language: 'es' }), [SLOPE_ES]);
  assert.deepEqual(say({ language: 'es-MX' }), [SLOPE_ES], 'a regional tag speaks its base language');
  assert.deepEqual(say({ language: 'es', inline: true }), [SLOPE_ES], 'inline too');
  assert.deepEqual(say({ language: 'vi' }), [SLOPE_EN], 'a language with no spoken-math words stays English rather than going silent');
  // A label the author wrote is what is said, in either language.
  assert.deepEqual(say({ language: 'es', value: 'x^2', ariaLabel: 'x squared, authored' }), ['x squared, authored']);
});

test('MathText says every formula in a translation in its language: delimited maths and a raw fraction in the prose', async () => {
  const MathText = await load('/src/components/common/MathText.jsx');
  const text = 'Resuelve $x^2 - 5x + 6 = 0$ y simplifica 2/3.';
  const say = (props) => spokenCopies(renderToStaticMarkup(React.createElement(MathText, props, text)));
  assert.deepEqual(say({ language: 'es' }), ['x al cuadrado menos 5x más 6 es igual a 0', '2 sobre 3']);
  assert.deepEqual(say({}), ['x squared minus 5x plus 6 equals 0', '2 over 3'], 'without a language it is English, as before');
  // Display maths (a $$ block) is a MathDisplay of its own.
  const block = spokenCopies(renderToStaticMarkup(React.createElement(MathText, { language: 'es' }, 'La pendiente es $$\\frac{3}{4}$$')));
  assert.deepEqual(block, ['3 sobre 4']);
});

// Both Translate panels draw their sentences with MathText. A translated
// sentence's formulas are said in the panel's language; a sentence the pack
// could not translate is English, so its formulas — and the row — are English.
const SENTENCES = [
  { source: 'Solve $x^2 = 9$.', text: 'Resuelve $x^2 = 9$.', translated: true },
  { source: 'Subtract 3 from both sides of $x + 3 = 9$.', text: 'Subtract 3 from both sides of $x + 3 = 9$.', translated: false },
];

const rows = (html) => [...html.matchAll(/<div (?:lang="en" )?data-translated="(true|false)">[\s\S]*?(?=<div (?:lang="en" )?data-translated=|$)/g)];
const rowFor = (html, translated) => rows(html).map((match) => match[0]).find((row) => row.includes(`data-translated="${translated}"`));

test('the support tray\'s Translate panel: translated rows speak Spanish, an untranslated row speaks English and is marked so', async () => {
  const TranslatePanel = await load('/src/components/student/supportTools/SupportToolsTray.jsx', 'TranslatePanel');
  const html = renderToStaticMarkup(React.createElement(TranslatePanel, {
    tool: { coverage: 'partial', translation: { provider: 'curated', language: 'es', sentences: SENTENCES } },
  }));
  assert.match(html, /<div data-support-panel="translate" lang="es">/);
  assert.deepEqual(spokenCopies(rowFor(html, 'true')), ['x al cuadrado es igual a 9']);
  const untranslated = rowFor(html, 'false');
  assert.match(untranslated, /^<div lang="en" data-translated="false">/, 'an English sentence is marked English inside the Spanish panel');
  assert.deepEqual(spokenCopies(untranslated), ['x plus 3 equals 9']);
  assert.match(untranslated, /\(English\)/);
});

test('the support tray: a lone formula is the panel\'s language, not English', async () => {
  const TranslatePanel = await load('/src/components/student/supportTools/SupportToolsTray.jsx', 'TranslatePanel');
  const html = renderToStaticMarkup(React.createElement(TranslatePanel, {
    tool: { coverage: 'full', translation: { provider: 'curated', language: 'es', sentences: [{ source: '$y = 2x$', text: '$y = 2x$', translated: false, mathOnly: true }] } },
  }));
  assert.deepEqual(spokenCopies(html), ['y es igual a 2x']);
  assert.doesNotMatch(html, /lang="en"|\(English\)/, 'a formula has no English words to mark');
});

// The Translate button beside a hint, a miss message or a worked solution
// shows its translation only after a press, so it cannot be rendered here; the
// press itself is driven in tests/browser/mathSpeech.mjs. This holds the wiring
// to the one place that draws the translated text.
test('Translate beside feedback, a hint or a worked solution gives its formulas the translation\'s language', () => {
  const source = executableSource(readFileSync(new URL('../../src/platform/supports/SupportedText.jsx', import.meta.url), 'utf8'));
  const shown = region(source, 'data-translated-text=""', '</MathText>', 'the translated text');
  assert.match(shown, /<MathText language=\{language\}>\{translated\.text\}$/, 'the language of the pack that translated it');
  assert.match(source, /const language = translation\?\.language \|\| null;/, 'and that is the student\'s translation language');
});

test('the secure test\'s Translate panel does the same', async () => {
  const TranslatePanel = await load('/src/components/assessment/SecureSupportToolsTray.jsx', 'TranslatePanel');
  const partial = renderToStaticMarkup(React.createElement(TranslatePanel, {
    translation: { coverage: 'partial', provider: 'curated', language: 'es', sentences: SENTENCES },
  }));
  assert.match(partial, /<div data-support-panel="translate" lang="es">/);
  assert.deepEqual(spokenCopies(rowFor(partial, 'true')), ['x al cuadrado es igual a 9']);
  const untranslated = rowFor(partial, 'false');
  assert.match(untranslated, /^<div lang="en" data-translated="false">/);
  assert.deepEqual(spokenCopies(untranslated), ['x plus 3 equals 9']);
  // An authored translation is one line, all in the student's language.
  const authored = renderToStaticMarkup(React.createElement(TranslatePanel, {
    translation: { coverage: 'full', provider: 'authored', language: 'es', text: 'Resuelve $x^2 = 9$.' },
  }));
  assert.deepEqual(spokenCopies(authored), ['x al cuadrado es igual a 9']);
});
