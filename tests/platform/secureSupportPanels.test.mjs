// WHAT THE TRANSLATE AND VOCABULARY PANELS SHOW BESIDE A SECURE ITEM
// (src/platform/assessment/secureSupportPanels.js, rendered by
// src/components/assessment/SecureSupportToolsTray.jsx).
//
// Two promises, each tested against the platform's REAL content rather than a
// fixture that could drift from it:
//
//   - Vocabulary shows a word and its definition, never the glossary's worked
//     example. Every entry has one ("…has slope 2", "…the residual is 2"),
//     and on a test item it can be the item worked for the student.
//   - Translate shows a translation. An authored translation is shown as the
//     translation — the secure prompt above it is never replaced by it, so
//     the assignment tray's "English original" view would repeat the English
//     while the evidence recorded a full translation as used.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MATH_GLOSSARY } from '../../src/platform/language/glossary/mathGlossaryEntries.js';
import { VOCABULARY_IDS, vocabularyForContext } from '../../src/platform/language/mathVocabulary.js';
import { TRANSLATION_PROVIDER, resolveTranslation } from '../../src/platform/language/translationProviders.js';
import { securePromptOnly } from '../../src/platform/assessment/secureItemAccess.js';
import { secureLanguageName, secureTranslationView, secureVocabularyEntries } from '../../src/platform/assessment/secureSupportPanels.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const TRAY = readFileSync(new URL('../../src/components/assessment/SecureSupportToolsTray.jsx', import.meta.url), 'utf8');

test('vocabulary on a secure item is the word and its definition — no glossary example reaches it, for any term', () => {
  const ids = [...VOCABULARY_IDS];
  assert.ok(ids.length > 50, 'the whole glossary index');
  for (const language of [null, 'en', 'es', 'es-MX', 'vi']) {
    const entries = secureVocabularyEntries(MATH_GLOSSARY, ids, { language });
    assert.equal(entries.length, ids.length, `every term has an entry (${language})`);
    for (const entry of entries) {
      assert.deepEqual(Object.keys(entry).sort(), ['definition', 'id', 'term', 'translation'], `${entry.id}: nothing but the word and its meaning`);
      const source = MATH_GLOSSARY[entry.id];
      assert.ok(source.example, `${entry.id} has an example in the glossary — the thing being left out`);
      const shown = JSON.stringify(entry);
      assert.ok(!shown.includes(source.example), `${entry.id}: its example "${source.example}" must not be shown on a test`);
      assert.equal(entry.definition, source.definition);
    }
  }
});

test('the verifier\'s examples — slope, y-intercept, residual, vertex, common difference, distribute — are not on the secure panel', () => {
  const prompt = 'A line has a slope of $\\frac{3}{4}$ and a y-intercept of $-2$. Find the residual, the vertex, the common difference, and distribute.';
  const termIds = vocabularyForContext({ text: prompt });
  for (const id of ['slope', 'y-intercept', 'residual', 'vertex', 'common-difference', 'distribute']) assert.ok(termIds.includes(id), id);
  const shown = JSON.stringify(secureVocabularyEntries(MATH_GLOSSARY, termIds, { language: 'es' }));
  for (const fragment of ['has slope 2', 'y-intercept 3', 'the residual is 2', 'vertex at (0, 0)', 'the common difference is 3', '3·x + 3·2', 'Example']) {
    assert.ok(!shown.includes(fragment), `"${fragment}" is a worked example`);
  }
});

test('a Spanish-language student gets the curated Spanish word and definition; nobody else gets a second language', () => {
  const [slope] = secureVocabularyEntries(MATH_GLOSSARY, ['slope'], { language: 'es-MX' });
  assert.deepEqual(slope.translation, { language: 'es', term: 'pendiente', definition: MATH_GLOSSARY.slope.es.definition });
  assert.equal(secureVocabularyEntries(MATH_GLOSSARY, ['slope'], { language: 'vi' })[0].translation, null);
  assert.equal(secureVocabularyEntries(MATH_GLOSSARY, ['slope'])[0].translation, null);
  assert.deepEqual(secureVocabularyEntries(MATH_GLOSSARY, ['not-a-term', 'toString', 42, 'slope']).map((entry) => entry.id), ['slope'], 'only real terms');
  assert.deepEqual(secureVocabularyEntries(null, ['slope']), []);
});

test('an authored translation is shown as the translation — the Spanish, never the English again', async () => {
  const item = {
    questionInstanceId: 'q-authored',
    prompt: 'What is the slope of the line through the two points shown?',
    translations: { es: { prompt: '¿Cuál es la pendiente de la recta que pasa por los dos puntos mostrados?' } },
  };
  const handed = securePromptOnly(item);
  const translation = await resolveTranslation({ question: handed, text: handed.prompt, language: 'es' });
  assert.equal(translation.provider, TRANSLATION_PROVIDER.AUTHORED);
  const view = secureTranslationView(translation);
  assert.deepEqual(view.lines.map((line) => line.text), [item.translations.es.prompt]);
  assert.ok(!JSON.stringify(view).includes(item.prompt), 'the English prompt is already on the screen');
  assert.equal(view.languageName, 'Spanish (Español)');
  assert.equal(view.partial, false);
});

test('a curated translation shows the prompt\'s sentences, translated where the pack covers them and marked where it does not', async () => {
  const prompt = 'A line has a slope of $\\frac{3}{4}$ and a y-intercept of $-2$. If $4x - 3 = 0$, what is the value of $x$?';
  const translation = await resolveTranslation({ question: securePromptOnly({ prompt }), text: prompt, language: 'es' });
  assert.equal(translation.provider, TRANSLATION_PROVIDER.CURATED);
  const view = secureTranslationView(translation);
  assert.ok(view.lines.some((line) => line.translated && /¿cuál es el valor de/i.test(line.text)), JSON.stringify(view.lines));
  assert.equal(view.partial, translation.coverage === 'partial');
  for (const line of view.lines) {
    for (const math of line.text.match(/\$[^$]+\$/g) || []) assert.ok(prompt.includes(math), `${math}: mathematics is carried through exactly`);
  }
});

test('nothing to show is nothing shown: no coverage, no text, no translation', () => {
  assert.equal(secureTranslationView(null), null);
  assert.equal(secureTranslationView({ coverage: 'none', language: 'es', sentences: [{ text: 'x', translated: false }] }), null);
  assert.equal(secureTranslationView({ coverage: 'not-applicable', language: 'es', provider: 'curated', sentences: [] }), null);
  assert.equal(secureTranslationView({ coverage: 'full', language: 'es', provider: TRANSLATION_PROVIDER.AUTHORED, text: '  ' }), null);
  assert.equal(secureLanguageName('es-MX'), 'Spanish (Español)');
  assert.equal(secureLanguageName('xx'), 'XX');
});

test('the secure tray renders its panels from these views, and never an entry\'s example or the English original', () => {
  const vocabulary = region(TRAY, 'function VocabularyPanel(', '\n}\n', 'the vocabulary panel');
  assert.match(vocabulary, /secureVocabularyEntries\(glossary, termIds, \{ language \}\)\.map\(/, 'entries come from the secure view');
  const translate = region(TRAY, 'function TranslatePanel(', '\n}\n', 'the translate panel');
  assert.match(translate, /const view = secureTranslationView\(translation\);/);
  const code = executableSource(TRAY);
  assert.doesNotMatch(code, /\.example\b/, 'no glossary example is rendered on a secure item');
  assert.doesNotMatch(code, /\.original\b/, 'no English original repeated under the English prompt');
  assert.doesNotMatch(code, /(?<![A-Za-z])(?:StudentSupportTray|SupportToolsTray)\b/, 'not the assignment tray, which shows both');
  assert.doesNotMatch(code, /question\??\.(choices|responseFields|stimulus|context|solution|hint|explanation|feedback|answer)/, 'the tray reads no other part of the item');
});

test('a new item starts the tray clean — nothing open, nothing being read, no Stop reading left over', () => {
  const component = region(TRAY, 'export default function SecureSupportToolsTray', '\n}\n', 'the tray');
  const reset = region(component, '  useEffect(() => {\n    setOpenTool(null);', '}, [itemKey]);', 'the per-item reset');
  for (const statement of ['setOpenTool(null);', 'setReadingStarted(false);', 'stopSpeaking();']) {
    assert.ok(reset.includes(statement), `a new item runs ${statement}`);
  }
  const press = region(component, 'const press = (tool) => {', '\n  };', 'press');
  assert.match(press, /if \(speakAloud\(prompt, \{ language: 'en' \}\)\) \{\s*recordUse\(tool\);\s*setReadingStarted\(true\);/, 'Stop reading appears once reading has started on this item');
  assert.match(component, /\{readingStarted && \(\s*<button/, 'and only then');
  assert.match(component, /\(entitlement\?\.tools \|\| \[\]\)\.filter\(\(tool\) => SECURE_ACCESS_TOOLS\.includes\(tool\)\)/, 'never a tool outside the secure three, whatever it is handed');
});
