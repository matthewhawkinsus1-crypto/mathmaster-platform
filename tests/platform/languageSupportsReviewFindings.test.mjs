// LANGUAGE SUPPORT TOOLS — THE CASES A REVIEW OF PR #419 FOUND.
//
// Each test pins one way the Support tools could show or record something
// that was not true for the student, and its fix. Synthetic profiles and
// items only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { preservesMath } from '../../src/platform/language/mathSafeText.js';
import { authoredTranslationEntry } from '../../src/platform/language/authoredTranslation.js';
import { authoredTranslationOf, resolveTranslation } from '../../src/platform/language/translationProviders.js';
import {
  SUPPORT_TOOL, foldPathDelivery, pathDeliveryFact, toolsEntitlementFromProfile,
} from '../../src/platform/language/supportToolsEntitlement.js';
import { applyStudentSupportToQuestion } from '../../src/studentSupport.js';
import { region, executableSource } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-10-06T15:00:00Z');
const source = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

// --- Activity-role scope ----------------------------------------------------------------------

test('a tool the profile limits to quizzes and tests is not offered in classwork or practice', () => {
  const profile = buildSupportProjection({
    revisions: [{
      id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', modifications: [],
      accommodations: [
        { id: 'glossary-lookup', params: {}, appliesTo: ['quiz', 'test'] },
        { id: 'chunked-directions', params: {}, appliesTo: [] },
      ],
      translationLanguage: 'es',
    }],
    todayKey: '2026-10-06',
  });
  const tools = (activityRole) => toolsEntitlementFromProfile(profile, { nowValue: NOW, activityRole }).tools;
  const universal = (activityRole) => toolsEntitlementFromProfile(profile, { nowValue: NOW, activityRole, universalDesignRole: activityRole }).universal;
  // Outside its scope the PLAN support is not offered. Since universal design
  // (job F, product decision 8) every student has Vocabulary in classwork and
  // practice anyway — as a universal tool, which is never recorded as the
  // plan's support (supportToolsModel.js toolEvidence).
  assert.ok(universal('classwork').includes(SUPPORT_TOOL.VOCABULARY));
  assert.ok(universal('practice').includes(SUPPORT_TOOL.VOCABULARY));
  assert.ok(tools('quiz').includes(SUPPORT_TOOL.VOCABULARY));
  assert.ok(!universal('quiz').includes(SUPPORT_TOOL.VOCABULARY), 'in scope it is the plan support itself');
  // Unscoped supports, and the language itself, apply everywhere.
  assert.ok(tools('classwork').includes(SUPPORT_TOOL.BREAK_IT_DOWN));
  assert.ok(tools('classwork').includes(SUPPORT_TOOL.TRANSLATE));
  // QuestionEngine asks with the item's own role.
  assert.match(source('src/QuestionEngine.jsx'), /toolsEntitlementFromProfile\(stableStudentProfile, \{ activityRole(?:, universalDesignRole: explicitActivityRole)? \}\)/);
});

// --- My Math Path: tool questions record what they showed -------------------------------------

test('on a Path tool question, what the tray showed and what was opened travel with the attempt — for that question only', () => {
  const applicableSupports = ['translation', 'glossary', 'chunkedDirections'];
  let delivery = { key: '', presented: [], used: [] };
  const fold = (record, key = 'q1') => { delivery = foldPathDelivery(delivery, record, { key, applicableSupports }); };
  fold({ supportId: 'translation', eventType: 'available' });
  fold({ supportId: 'chunked-directions', eventType: 'provided' });
  fold({ supportId: 'glossary-lookup', eventType: 'not-applicable' });
  fold({ supportId: 'translation', eventType: 'used' });
  fold({ supportId: 'translation', eventType: 'available' });
  // A support the server did not list never rides along.
  fold({ supportId: 'sentence-frames', eventType: 'available' });
  assert.deepEqual(delivery, { key: 'q1', presented: ['translation', 'chunkedDirections'], used: ['translation'] });
  // The next question starts clean.
  fold({ supportId: 'glossary-lookup', eventType: 'available' }, 'q2');
  assert.deepEqual(delivery, { key: 'q2', presented: ['glossary'], used: [] });
  assert.equal(pathDeliveryFact({ supportId: 'translation', eventType: 'unavailable' }, applicableSupports), null);

  const player = source('src/components/student/PathSessionPlayer.jsx');
  const engine = region(player, '<QuestionEngine', 'onGrade=', 'Path QuestionEngine mount');
  assert.match(engine, /supportEntitlement=\{engineSupportTools\}/, 'tools from the server list, not the profile');
  assert.match(engine, /onSupportEvidence=\{onEngineSupportEvidence\}/);
  // The server's list decides plan tools; wave 2 (job H) adds only the
  // universal role, which is never evidence (universalSupportTools.test.mjs).
  assert.match(player, /toolsEntitlementFromPath\(\{ applicableSupports, translationLanguage: supportLanguage(?:, activityRole: universalDesignRole)? \}\)/);
  assert.match(player, /foldPathDelivery\(current, record, \{ key: instanceId, applicableSupports \}\)/);
  // Both submit routes (secure payload and canonical grading) carry it.
  assert.equal((player.match(/supportsPresented: engineSupports\.presented,\s*supportsUsed: engineSupports\.used,/g) || []).length, 2);
});

// --- The tray never models one item with another's translation --------------------------------

test('a translation is kept with the item and language it was resolved for', () => {
  const tray = source('src/components/student/supportTools/SupportToolsTray.jsx');
  assert.match(tray, /const translationKey = `\$\{itemKey\}\|\$\{entitlement\?\.language \|\| ''\}`;/);
  assert.match(tray, /setResolved\(\{ key: translationKey, result \}\)/);
  assert.match(tray, /const translation = resolved\?\.key === translationKey \? resolved\.result : null;/);
  assert.doesNotMatch(tray, /setTranslation\(/, 'no unkeyed translation state');
});

// --- Mathematics written as capital-letter names ----------------------------------------------

test('a translation that renames a point, segment or figure changes the mathematics', async () => {
  assert.equal(preservesMath('Triangle ABC has side AB = 12.', 'El triángulo XYZ tiene lado XY = 12.', { language: 'es' }), false);
  assert.equal(preservesMath('Triangle ABC has side AB = 12.', 'El triángulo ABC tiene lado AB = 12.', { language: 'es' }), true);
  assert.equal(preservesMath('Name the image of AB′.', "Nombra la imagen de AB'.", { language: 'es' }), true, 'a prime is a prime');
  assert.equal(preservesMath('Name the image of AB′.', 'Nombra la imagen de AB.', { language: 'es' }), false);
  assert.equal(preservesMath('Name the image of AB′.', "Nombra la imagen de CD'.", { language: 'es' }), false, 'a renamed image');
  const question = { prompt: 'Triangle ABC has side AB = 12.', translations: { es: { prompt: 'El triángulo XYZ tiene lado XY = 12.' } } };
  const profile = { accommodations: [], modifications: [], translationLanguage: 'es' };
  assert.equal(applyStudentSupportToQuestion(question, profile).question.prompt, 'Triangle ABC has side AB = 12.');
  assert.notEqual((await resolveTranslation({ question, language: 'es' })).provider, 'authored');
});

// --- A regional language finds the same authored translation everywhere ----------------------

test('a student set to es-MX sees the "es" authored translation on the task, and Translate agrees', async () => {
  const question = { prompt: 'Solve x + 2 = 5.', translations: { es: { prompt: 'Resuelve x + 2 = 5.' } } };
  const profile = { accommodations: [], modifications: [], translationLanguage: 'es-mx' };
  const applied = applyStudentSupportToQuestion(question, profile).question;
  assert.equal(applied.prompt, 'Resuelve x + 2 = 5.', 'the task shows it');
  assert.equal(applied.authoredPrompt, 'Solve x + 2 = 5.');
  assert.equal(authoredTranslationOf(question, 'es-mx')?.text, 'Resuelve x + 2 = 5.');
  const translated = await resolveTranslation({ question, language: 'es-mx' });
  assert.deepEqual([translated.provider, translated.text], ['authored', 'Resuelve x + 2 = 5.']);
  // Exact tags win, case does not matter, and English is never a translation.
  assert.equal(authoredTranslationEntry({ translations: { es: { prompt: 'a' }, 'es-MX': { prompt: 'b' } } }, 'es-mx').prompt, 'b');
  const english = applyStudentSupportToQuestion({ prompt: 'Solve.', translations: { en: { prompt: 'Other.' } } }, { ...profile, translationLanguage: 'en-us' });
  assert.equal(english.question.prompt, 'Solve.');
});

test('the task and Translate apply one rule: a translation with no authored prompt to contradict is shown in both', async () => {
  // The item's mathematics is in its tool; the prompt is only authored in Spanish.
  const question = { type: 'literal', translations: { es: { prompt: 'Construye una parábola con vértice en el cuadrante IV.' } } };
  const profile = { accommodations: [], modifications: [], translationLanguage: 'es' };
  assert.equal(applyStudentSupportToQuestion(question, profile).question.prompt, 'Construye una parábola con vértice en el cuadrante IV.');
  assert.equal(authoredTranslationOf(question, 'es').keepsMath, true);
  // With an authored prompt, both refuse the same renamed figure.
  const renamed = { prompt: 'Triangle ABC has side AB = 12.', translations: { es: { prompt: 'El triángulo XYZ tiene lado XY = 12.' } } };
  assert.equal(authoredTranslationOf(renamed, 'es').keepsMath, false);
  assert.equal(applyStudentSupportToQuestion(renamed, profile).question.prompt, renamed.prompt);
});
