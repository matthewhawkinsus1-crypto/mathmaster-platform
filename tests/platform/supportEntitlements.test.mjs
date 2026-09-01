// Accommodations have to reach the student.
//
// WHAT THIS REPLACED. The repository contained nine different representations
// of a student's supports. The two that mattered could not read each other:
// the flat kebab-case shape the teacher UI writes and actually persists, and
// the structured SIS/IEP shape where extended time and extra attempts were the
// ONLY place those numbers existed. The structured resolver had zero callers.
// The My Math Path server read no support profile at all — it loaded the
// roster document and used one string from it. So on the Path, every
// accommodation was browser-side decoration, extra attempts could not be
// granted, and every evidence event carried zero "presented" telemetry.
//
// These tests pin the repair: one adapter over both stored shapes, resolved on
// the server, with delivery reconciled rather than assumed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SUPPORT, ACCESS_SUPPORTS, CONSTRUCT_AFFECTING_SUPPORTS,
  applicableSupports, attemptsWithEntitlements, isSupportAuthorized,
  reconcileSupportDelivery, reducesMathematicalIndependence, resolveSupportEntitlements,
} from '../../functions/shared/supportEntitlements.mjs';

const serverSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const mathPathSource = readFileSync(new URL('../../functions/lib/mathPath.js', import.meta.url), 'utf8');

// --- One model over both stored shapes ---------------------------------------

test('the flat profile the teacher UI writes resolves to real entitlements', () => {
  const entitlements = resolveSupportEntitlements({
    inclusionStatus: false,
    accommodations: ['text-to-speech', 'large-text', 'calculator'],
    translationLanguage: 'es',
  });
  assert.equal(entitlements.sourceShape, 'legacy');
  assert.ok(isSupportAuthorized(entitlements, SUPPORT.TEXT_TO_SPEECH));
  assert.ok(isSupportAuthorized(entitlements, SUPPORT.LARGE_TEXT));
  assert.ok(isSupportAuthorized(entitlements, SUPPORT.CALCULATOR));
  assert.ok(isSupportAuthorized(entitlements, SUPPORT.TRANSLATION));
  assert.equal(entitlements.translationLanguage, 'es');
});

test('the structured SIS profile resolves to the same vocabulary', () => {
  const entitlements = resolveSupportEntitlements({
    programEligibility: { sped: true, emergentBilingual: true, ebLanguage: 'es' },
    accommodations: {
      textToSpeech: true, spanishTranslation: true, calculator: true,
      extendedTimeMultiplier: 1.5, extraAttempts: 2,
    },
  });
  assert.equal(entitlements.sourceShape, 'structured');
  assert.ok(isSupportAuthorized(entitlements, SUPPORT.TEXT_TO_SPEECH));
  assert.ok(isSupportAuthorized(entitlements, SUPPORT.TRANSLATION));
  assert.equal(entitlements.extraAttempts, 2);
  assert.equal(entitlements.extendedTimeMultiplier, 1.5);
  assert.equal(entitlements.programEligibility.emergentBilingual, true);
});

test('a student does not lose an accommodation by changing which shape stored it', () => {
  const flat = resolveSupportEntitlements({ accommodations: ['text-to-speech', 'high-contrast'] });
  const structured = resolveSupportEntitlements({ accommodations: { textToSpeech: true, highContrast: true } });
  assert.deepEqual(flat.authorized.sort(), structured.authorized.sort(),
    'the same authorizations must resolve identically whichever shape the district wrote');
});

test('inclusion status grants presentation supports but never an algebra shortcut', () => {
  const entitlements = resolveSupportEntitlements({ inclusionStatus: true });
  assert.ok(isSupportAuthorized(entitlements, SUPPORT.LARGE_TEXT));
  assert.ok(isSupportAuthorized(entitlements, SUPPORT.HIGH_CONTRAST));
  assert.equal(isSupportAuthorized(entitlements, SUPPORT.ALGEBRA_AUTO_APPLY), false,
    'a student with large text must not silently acquire an algebra shortcut nobody assigned');
});

test('a missing or malformed profile grants nothing and does not throw', () => {
  [null, undefined, 'nonsense', 42, [], { accommodations: 'not-an-array' }].forEach((input) => {
    const entitlements = resolveSupportEntitlements(input);
    assert.deepEqual(entitlements.authorized, [], `${JSON.stringify(input)} must grant nothing`);
    assert.equal(entitlements.hasProfile, false);
  });
});

test('numeric supports are clamped so a bad import cannot distort a session', () => {
  const huge = resolveSupportEntitlements({ accommodations: { extendedTimeMultiplier: 99, extraAttempts: 500 } });
  assert.ok(huge.extendedTimeMultiplier <= 4);
  assert.ok(huge.extraAttempts <= 10);
  const backwards = resolveSupportEntitlements({ accommodations: { extendedTimeMultiplier: 0.25 } });
  assert.ok(backwards.extendedTimeMultiplier >= 1, 'a multiplier below 1 would take time away from a student');
});

// --- Attempts -----------------------------------------------------------------

test('an authorized extra attempt is added to the pedagogical figure', () => {
  const entitlements = resolveSupportEntitlements({ accommodations: { extraAttempts: 2 } });
  assert.equal(attemptsWithEntitlements(3, entitlements), 5);
});

test('extra attempts do not extend a one-attempt diagnostic', () => {
  // A diagnostic asks what the student can do unaided right now. Extending it
  // changes what is being measured rather than how it is accessed.
  const entitlements = resolveSupportEntitlements({ accommodations: { extraAttempts: 3 } });
  assert.equal(attemptsWithEntitlements(1, entitlements), 1);
  assert.equal(attemptsWithEntitlements(1, entitlements, { allowOnDiagnostic: true }), 4);
});

test('a student with no entitlements gets exactly the base attempts', () => {
  assert.equal(attemptsWithEntitlements(3, resolveSupportEntitlements(null)), 3);
  assert.equal(attemptsWithEntitlements(1, resolveSupportEntitlements(null)), 1);
});

// --- Applicable is not the same as authorized ---------------------------------

test('a calculator accommodation does not apply where the computation IS the construct', () => {
  const entitlements = resolveSupportEntitlements({ accommodations: ['calculator'] });
  const ordinary = applicableSupports(entitlements, { assessedConstruct: 'interpreting slope' });
  const computational = applicableSupports(entitlements, { assessedConstruct: 'multi-digit computation' });
  assert.ok(ordinary.includes(SUPPORT.CALCULATOR));
  assert.ok(!computational.includes(SUPPORT.CALCULATOR),
    'an accommodation may provide access but may not replace the thing being assessed');
});

test('reduced choices do not apply to a question with nothing to reduce', () => {
  const entitlements = resolveSupportEntitlements({ accommodations: ['reduced-choices'] });
  assert.ok(!applicableSupports(entitlements, {}).includes(SUPPORT.REDUCED_CHOICES));
  assert.ok(applicableSupports(entitlements, { choices: [1, 2, 3, 4] }).includes(SUPPORT.REDUCED_CHOICES));
});

// --- Delivery is reconciled, not assumed --------------------------------------

test('presented means it rendered, not that the profile contained it', () => {
  const entitlements = resolveSupportEntitlements({ accommodations: ['text-to-speech', 'high-contrast'] });
  const delivery = reconcileSupportDelivery({
    entitlements,
    applicable: entitlements.authorized,
    clientPresented: [SUPPORT.TEXT_TO_SPEECH], // the contrast toggle never rendered
    clientUsed: [SUPPORT.TEXT_TO_SPEECH],
  });
  assert.deepEqual(delivery.presented, [SUPPORT.TEXT_TO_SPEECH]);
  assert.ok(delivery.authorizedButNotPresented.includes(SUPPORT.HIGH_CONTRAST),
    'a support that could not render is a compliance signal, not a silent absence');
});

test('a client cannot report a support the student was never authorized for', () => {
  const entitlements = resolveSupportEntitlements({ accommodations: ['text-to-speech'] });
  const delivery = reconcileSupportDelivery({
    entitlements,
    applicable: entitlements.authorized,
    clientPresented: [SUPPORT.TEXT_TO_SPEECH, SUPPORT.CALCULATOR],
    clientUsed: [SUPPORT.CALCULATOR],
  });
  assert.ok(!delivery.presented.includes(SUPPORT.CALCULATOR));
  assert.ok(!delivery.used.includes(SUPPORT.CALCULATOR));
  assert.ok(delivery.rejectedClaims.includes(SUPPORT.CALCULATOR),
    'an unauthorized claim is recorded, because it means a bug or a tampered client');
});

test('a support cannot be reported used without being reported presented', () => {
  const entitlements = resolveSupportEntitlements({ accommodations: ['text-to-speech'] });
  const delivery = reconcileSupportDelivery({
    entitlements,
    applicable: entitlements.authorized,
    clientPresented: [],
    clientUsed: [SUPPORT.TEXT_TO_SPEECH],
  });
  assert.deepEqual(delivery.used, [], 'a student cannot use a button that was never on screen');
});

// --- Access supports must not cost a student their independence ----------------

test('every access accommodation leaves mathematical independence alone', () => {
  ACCESS_SUPPORTS.forEach((supportId) => {
    assert.equal(reducesMathematicalIndependence(supportId), false,
      `${supportId} is access, not mathematical help — it must not reduce mastery credit`);
  });
});

test('an algebra auto-apply does affect independence, because it does a step', () => {
  assert.ok(CONSTRUCT_AFFECTING_SUPPORTS.has(SUPPORT.ALGEBRA_AUTO_APPLY));
  assert.equal(reducesMathematicalIndependence(SUPPORT.ALGEBRA_AUTO_APPLY), true);
});

// --- The server is the authority ------------------------------------------------

test('the Path server resolves entitlements rather than ignoring the profile', () => {
  assert.ok(serverSource.includes('mathPath.resolveEntitlements(rosterSnapshot.data()?.profile'),
    'issueNextQuestion must read the profile it was already loading');
  assert.ok(serverSource.includes('await mathPath.attemptsForQuestion(issued, baseAttempts, entitlements)'),
    'attempts must be resolved through the server-side question-aware entitlement policy, not hardcoded');
  assert.ok(!/const attemptsAllowed = session\.sessionKind === "retentionProbe"/.test(serverSource),
    'the old hardcoded 1-or-3 ternary must be gone');
});

test('Path evidence records what was presented, not what was authorized', () => {
  assert.ok(serverSource.includes('accommodationsPresented: delivery.presented'));
  assert.ok(serverSource.includes('accommodationsNotDelivered: delivery.authorizedButNotPresented'));
  assert.ok(serverSource.includes('mathPath.reconcileSupports'),
    'delivery must be reconciled against the authorized set on the server');
});

test('access accommodations do not reduce independence in the server predicate', () => {
  assert.ok(mathPathSource.includes("String(entry) === 'algebraAutoApply'"),
    'only the construct-affecting support may reduce independence');
  // The predicate must not simply disqualify anyone who used any accommodation.
  assert.ok(!/!supportUsage\.accommodations\?\.length/.test(mathPathSource),
    'using an access accommodation must never make evidence look dependent');
});

test('an unfulfilled authorization becomes its own telemetry stage', () => {
  assert.ok(mathPathSource.includes("stage: 'authorizedNotPresented'"),
    'a tool that cannot honour an authorized support must be discoverable');
});

// --- A student must not lose a support by changing screens ---------------------

test('the calculator resolver accepts every profile shape that reaches it', async () => {
  // THE TRAP THIS CLOSES. Four call sites read `student.supportProfile` FIRST —
  // a key the teacher UI never writes, because it stores the profile at
  // `profile`. A caller passing a whole student record therefore fell through
  // to an empty accommodation list and the calculator silently disappeared.
  const { resolveCalculatorPolicy } = await import('../../src/platform/policies/calculatorPolicy.js');
  const shapes = [
    ['a bare profile', { accommodations: ['calculator'] }],
    ['the key nothing writes', { supportProfile: { accommodations: ['calculator'] } }],
    ['a whole student record', { profile: { accommodations: ['calculator'] } }],
  ];
  const policies = shapes.map(([, studentSupportProfile]) => resolveCalculatorPolicy({
    questionSpec: { assessedConstruct: 'interpreting slope' },
    activityPolicy: { calculatorDefault: 'none' },
    studentSupportProfile,
  }));
  policies.forEach((policy, index) => {
    assert.equal(policy.available, true,
      `${shapes[index][0]}: an authorized calculator must survive this shape`);
  });
});

test('an unauthorized student still gets no calculator from any shape', () => {
  // The inverse: the leniency about SHAPE must not become leniency about
  // AUTHORIZATION.
  const entitlements = resolveSupportEntitlements({ accommodations: [] });
  assert.equal(isSupportAuthorized(entitlements, SUPPORT.CALCULATOR), false);
});
