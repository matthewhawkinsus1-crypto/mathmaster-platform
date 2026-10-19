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
import { SECURE_ACCESS_TOOLS, SECURE_ACTIVITY_ROLE, secureAccessEntitlement, securePromptOnly } from '../../src/platform/assessment/secureItemAccess.js';
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
