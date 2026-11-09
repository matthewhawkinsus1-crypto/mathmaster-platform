// THE ACCESS SUPPORTS A SECURE ITEM KEEPS (src/platform/assessment/secureItemAccess.js).
//
// On a secure item a student keeps Read aloud, Translate and Vocabulary —
// only if their own plan grants them for a test, and only over the prompt.
// These tests hold both halves: who is entitled (the same resolution every
// screen uses, for the `test` activity role, never the two scaffolds), and
// what the supports are handed (the prompt and nothing else of the item).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECURE_ACCESS_TOOLS, SECURE_ACTIVITY_ROLE, releasedReviewAccessEntitlement, secureAccessEntitlement, secureFigureLanguage, securePromptOnly } from '../../src/platform/assessment/secureItemAccess.js';
import { loadFigureWords } from '../../src/platform/language/figureSay.js';
import { SUPPORT_TOOL } from '../../src/platform/language/supportToolsEntitlement.js';
import { assessmentSupportProfile } from '../../src/studentSupport.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const EVERYTHING = { accommodations: ['text-to-speech', 'glossary-lookup', 'chunked-directions', 'sentence-frames', 'extra-time'], translationLanguage: 'es' };
const plan = (accommodations, translationLanguage = null) => ({
  supportPlan: { windows: [{ effectiveStart: '2026-01-01', status: 'active', revision: 1, translationLanguage, accommodations }] },
});

test('a fully supported student gets Translate, Vocabulary and Read aloud on a secure item — never the two scaffolds', () => {
  const entitlement = secureAccessEntitlement(EVERYTHING);
  assert.deepEqual(entitlement.tools, [SUPPORT_TOOL.TRANSLATE, SUPPORT_TOOL.VOCABULARY, SUPPORT_TOOL.READ_ALOUD]);
  assert.equal(entitlement.language, 'es');
  assert.ok(!entitlement.tools.includes(SUPPORT_TOOL.BREAK_IT_DOWN), 'Break it down can carry authored steps');
  assert.ok(!entitlement.tools.includes(SUPPORT_TOOL.SAY_IT), 'sentence frames shape an explanation');
  assert.deepEqual([...SECURE_ACCESS_TOOLS].sort(), [SUPPORT_TOOL.READ_ALOUD, SUPPORT_TOOL.TRANSLATE, SUPPORT_TOOL.VOCABULARY].sort());
});

test('only what the student\'s plan grants: none without a profile, none under inclusion, each tool on its own', () => {
  for (const profile of [null, undefined, {}, 'text-to-speech', { accommodations: [] }, { inclusionStatus: true, accommodations: [] }]) {
    assert.deepEqual(secureAccessEntitlement(profile).tools, [], JSON.stringify(profile));
  }
  assert.deepEqual(secureAccessEntitlement({ accommodations: ['text-to-speech'] }).tools, [SUPPORT_TOOL.READ_ALOUD]);
  assert.deepEqual(secureAccessEntitlement({ accommodations: ['glossary-lookup'] }).tools, [SUPPORT_TOOL.VOCABULARY]);
  const translateOnly = secureAccessEntitlement({ accommodations: [], translationLanguage: 'vi' });
  assert.deepEqual(translateOnly, { tools: [SUPPORT_TOOL.TRANSLATE], language: 'vi' });
  assert.equal(secureAccessEntitlement({ accommodations: ['text-to-speech'], translationLanguage: 'en' }).language, null, 'English is not a translation');
  assert.deepEqual(secureAccessEntitlement({ accommodations: ['chunked-directions', 'sentence-frames'] }).tools, [], 'scaffolds alone give nothing');
});

test('a support the plan limits to practice is not offered on a test', () => {
  assert.equal(SECURE_ACTIVITY_ROLE, 'test');
  const practiceReadAloud = plan([{ id: 'text-to-speech', appliesTo: ['practice'] }, { id: 'glossary-lookup', appliesTo: [] }]);
  assert.deepEqual(secureAccessEntitlement(practiceReadAloud).tools, [SUPPORT_TOOL.VOCABULARY]);
  const testsOnly = plan([{ id: 'text-to-speech', appliesTo: ['quiz', 'test'] }]);
  assert.deepEqual(secureAccessEntitlement(testsOnly).tools, [SUPPORT_TOOL.READ_ALOUD]);
  // Why the component takes the student's OWN profile: the flattened
  // assessment profile has lost the plan, and with it this limit.
  assert.deepEqual(secureAccessEntitlement(assessmentSupportProfile(practiceReadAloud)).tools, [SUPPORT_TOOL.VOCABULARY, SUPPORT_TOOL.READ_ALOUD]);
});

test('the supports are handed the prompt and nothing else of the item', () => {
  const item = {
    questionInstanceId: 'q1',
    prompt: 'What is the slope?',
    choices: [{ id: 'a', label: 'CHOICE' }],
    responseFields: [{ id: 'answer', label: 'FIELD' }],
    stimulus: { text: 'STIMULUS' },
    context: { text: 'CONTEXT' },
    solution: 'SOLUTION',
    hint: 'HINT',
    translations: { es: { prompt: '¿Cuál es la pendiente?', choices: ['CHOICE-ES'], hint: 'HINT-ES' }, fr: { hint: 'only a hint' } },
  };
  const handed = securePromptOnly(item);
  assert.deepEqual(handed, { prompt: 'What is the slope?', translations: { es: { prompt: '¿Cuál es la pendiente?' } } });
  assert.doesNotMatch(JSON.stringify(handed), /CHOICE|FIELD|STIMULUS|CONTEXT|SOLUTION|HINT/);
  assert.deepEqual(securePromptOnly({ prompt: 'p' }), { prompt: 'p' });
  assert.deepEqual(securePromptOnly(null), { prompt: '' });
  assert.deepEqual(securePromptOnly({ prompt: 42 }), { prompt: '' });
});

test('the component gives the tray only the prompt, only for an entitled student, and reads nothing else of the item', () => {
  const source = readFileSync(new URL('../../src/components/assessment/SecureItemAccessSupports.jsx', import.meta.url), 'utf8');
  const component = region(source, 'export default function SecureItemAccessSupports', '\n}\n', 'the component');
  assert.match(component, /secureAccessEntitlement\(studentSupportProfile,/);
  assert.match(component, /const promptOnly = useMemo\(\(\) => securePromptOnly\(question\), \[question\]\);/);
  assert.match(component, /\n\s*if \(!entitlement\.tools\.length \|\| !promptOnly\.prompt\.trim\(\)\) return null;/, 'nothing at all for a student without a support');
  const tray = region(component, '<SecureSupportToolsTray', '/>', 'the tray');
  assert.match(tray, /entitlement=\{entitlement\}/);
  assert.match(tray, /prompt=\{promptOnly\.prompt\}/);
  assert.match(tray, /question=\{promptOnly\}/);
  assert.match(tray, /itemKey=\{itemKey\}/, 'a new item starts the tray clean');
  // The secure tray, lazily: a student without a support downloads none of it.
  assert.match(source, /^const SecureSupportToolsTray = lazy\(\(\) => import\('\.\/SecureSupportToolsTray\.jsx'\)\);$/m);
  const code = executableSource(source);
  assert.doesNotMatch(code, /(?<![A-Za-z])(?:StudentSupportTray|SupportToolsTray)\b/, 'not the assignment tray, which shows glossary examples');
  assert.doesNotMatch(code, /question\??\.(choices|responseFields|stimulus|context|solution|hint|explanation|feedback|answer)/, 'the component reads no other part of the item');
  assert.doesNotMatch(code, /isCorrect|grade|verdict/i);
});

// AX42: on a released Test's results the test is over. A plan that gives Read
// aloud for practice gave nothing there; the results follow the plan for a
// test or for practice, whichever gives more, and still only the three secure
// access tools.
test('a released Test\'s results follow the plan for a test or for practice', () => {
  const practiceReadAloud = plan([{ id: 'text-to-speech', appliesTo: ['practice'] }, { id: 'glossary-lookup', appliesTo: [] }]);
  assert.deepEqual(secureAccessEntitlement(practiceReadAloud).tools, [SUPPORT_TOOL.VOCABULARY], 'during the test: not offered');
  assert.deepEqual(releasedReviewAccessEntitlement(practiceReadAloud).tools, [SUPPORT_TOOL.VOCABULARY, SUPPORT_TOOL.READ_ALOUD], 'on the results: offered');
  const testsOnly = plan([{ id: 'text-to-speech', appliesTo: ['quiz', 'test'] }]);
  assert.deepEqual(releasedReviewAccessEntitlement(testsOnly).tools, [SUPPORT_TOOL.READ_ALOUD]);
  const translated = releasedReviewAccessEntitlement(plan([{ id: 'text-to-speech', appliesTo: ['practice'] }], 'es'));
  assert.deepEqual([translated.tools, translated.language], [[SUPPORT_TOOL.TRANSLATE, SUPPORT_TOOL.READ_ALOUD], 'es']);
  assert.deepEqual(releasedReviewAccessEntitlement(plan([{ id: 'chunked-directions', appliesTo: [] }, { id: 'sentence-frames', appliesTo: [] }])).tools, [], 'scaffolds give nothing');
  assert.deepEqual(releasedReviewAccessEntitlement(null).tools, []);
});

/*
 * AX05, slice 3: a secure field item's figures describe themselves in the
 * student's language where the item offers its authored translation — the
 * student's plan gives Translate in that language, and the item carries an
 * authored translation of its prompt that keeps the mathematics (the one the
 * Translate panel shows). Only the prompt and that translation decide it.
 */
test('a secure item\'s figures are described in the student\'s language only where it offers its authored translation', async () => {
  const item = {
    questionInstanceId: 'q1',
    prompt: 'What is the slope of the line through $(0, -2)$ and $(1, 0)$?',
    translations: { es: { prompt: '¿Cuál es la pendiente de la recta que pasa por $(0, -2)$ y $(1, 0)$?' } },
    stimulus: { graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, lines: [{ points: [[0, -2], [1, 0]] }] } },
    choices: [{ id: 'a', label: 'CHOICE' }],
  };
  const spanish = { accommodations: [], translationLanguage: 'es' };
  assert.equal(secureFigureLanguage(item, spanish), 'es');
  assert.equal(secureFigureLanguage(item, { accommodations: ['text-to-speech'], translationLanguage: 'es-MX' }), 'es-mx', 'a regional Spanish');
  assert.equal(secureFigureLanguage(item, plan([], 'es')), 'es', 'from a support plan');
  // No Translate on the plan, or English: no other language.
  for (const profile of [null, {}, { accommodations: ['text-to-speech', 'glossary-lookup'] }, { accommodations: [], translationLanguage: 'en' }]) {
    assert.equal(secureFigureLanguage(item, profile), null, JSON.stringify(profile));
  }
  // No authored translation of this prompt, a blank one, one in another
  // language, or one whose mathematics differs: the figures stay English.
  for (const translations of [undefined, {}, { es: { prompt: '   ' } }, { es: { hint: 'una pista' } }, { vi: { prompt: 'Độ dốc của đường thẳng qua $(0, -2)$ và $(1, 0)$ là bao nhiêu?' } },
    { es: { prompt: '¿Cuál es la pendiente de la recta que pasa por $(0, -3)$ y $(1, 0)$?' } }]) {
    assert.equal(secureFigureLanguage({ ...item, translations }, spanish), null, JSON.stringify(translations));
  }
  // What else the item carries never decides it.
  assert.equal(secureFigureLanguage({ ...item, stimulus: null, choices: [] }, spanish), 'es');
  // A language with an authored prompt but no figure words (French): its
  // language is offered, and with no words for it the figures stay English.
  const french = { ...item, translations: { fr: { prompt: 'Quelle est la pente de la droite qui passe par $(0, -2)$ et $(1, 0)$ ?' } } };
  assert.equal(secureFigureLanguage(french, { accommodations: [], translationLanguage: 'fr' }), 'fr');
  assert.equal(await loadFigureWords('fr'), null);
});
