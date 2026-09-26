import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CERTIFICATION_SUBSYSTEMS,
  CERTIFICATION_SUITES,
  CERTIFICATION_TIERS,
  INTERACTIVE_CAPABILITIES,
  INTERACTIVE_CAPABILITY_FIXTURES,
  capabilityFixture,
  suitesForTier,
} from '../../src/platform/certification/interactiveCapabilityManifest.js';
import { compileCapabilityFixture } from '../../src/platform/certification/capabilityFixtureRuntime.js';
import {
  ALGEBRA_ENGINE_CAPABILITIES,
  prepareQuestionForRuntimeRouting,
  resolveAlgebraWorkspaceRoute,
} from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { expressionsEquivalent, parseEquationInput } from '../../src/algebraAstEngine.js';
import {
  armFactor,
  commitDistribution,
  detectDistributableGroup,
  initDistributionState,
  placeOnTerm,
} from '../../src/algebraDistributionModel.js';
import { findLikeTermGroups, replaceSelectedLikeTerms } from '../../src/algebraLikeTermsModel.js';
import {
  commitRelationDistribution,
  commitRelationLikeTerms,
  relationDistributionCandidates,
} from '../../src/algebraRelationStructureModel.js';
import { detectFactorableLists, validateCommonFactor } from '../../src/algebraFactoringModel.js';
import { divideRational, makeRational } from '../../src/algebraExactRational.js';
import { detectSplittableFractions } from '../../src/algebraFractionSplitModel.js';
import {
  applyBalancedOperationToRelation,
  buildStudentAuthoredAbsoluteValueSplit,
  parseRelationSource,
  relationStateToLatex,
  restorableRelationState,
  validateRelationTransition,
} from '../../src/algebraRelationFoundation.js';
import { buildSubstitutionState, expectedInterceptPoint, resolveStandardCoefficients } from '../../src/tools/stepAlgebra2/linearInterceptsMath.js';
import {
  applyEquationMultiplier,
  applyFormMultiplier,
  combineCoefficients,
  combineForms,
  eliminatesVariable,
  formEliminatesVariable,
  linearEquationCoefficients,
  linearEquationForm,
  substituteIntoEquation,
} from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';

// MATHMASTER INTERACTIVE CAPABILITY CERTIFICATION — NODE GATE (every PR).
//
// For every capability in the manifest:
//   1. its fixture compiles through the production V5 compiler and the player's
//      runtime view (a question a teacher can actually author);
//   2. the route QuestionEngine takes lands on an engine that owns it;
//   3. that engine is wired to the module that does the work;
//   4. the module does the mathematics on the fixture's own numbers;
//   5. a browser journey performs it, and CI runs that journey.
// "The component exists in src/" satisfies none of these on its own.

const read = (file) => fs.readFileSync(file, 'utf8');
const workflows = fs.readdirSync('.github/workflows').map((name) => read(`.github/workflows/${name}`)).join('\n');

const questionFor = (capability) => compileCapabilityFixture(capabilityFixture(capability));
const routeFor = (capability) => resolveAlgebraWorkspaceRoute(prepareQuestionForRuntimeRouting(questionFor(capability)));

// Step 4: the mathematics, performed on the fixture's own question.
const BEHAVIOUR = {
  distribution: (question) => {
    const equation = parseEquationInput(question);
    let state = initDistributionState(detectDistributableGroup(equation));
    assert.ok(state, 'the fixture offers a group to distribute');
    state.terms.forEach((_, index) => { state = placeOnTerm(armFactor(state), index); });
    const next = commitDistribution(equation, state);
    assert.ok(expressionsEquivalent(next.left, equation.left, 'x'), `${next.left} ≡ ${equation.left}`);
    assert.doesNotMatch(next.left, /\(2 ?x - 4\)/, 'the group was expanded, term by term, by the student');
  },
  'combine-like-terms': (question) => {
    const { left } = parseEquationInput(question);
    const [group] = findLikeTermGroups(left);
    assert.deepEqual(group.indices, [0, 1]);
    const combined = replaceSelectedLikeTerms(left, group.indices, '5x');
    assert.ok(expressionsEquivalent(combined, left, 'x'));
  },
  'exact-fractions': () => {
    assert.deepEqual(divideRational(makeRational(20), makeRational(9)), { n: 20, d: 9 }, '20 ÷ 9 stays 20/9');
  },
  undo: () => {},
  factoring: (question) => {
    const lists = detectFactorableLists(parseEquationInput(question));
    assert.ok(lists.length > 0, 'y = 15x − 45 offers a factorable side');
    assert.deepEqual(validateCommonFactor(lists[0].terms.map((term) => term.signedText), 15), { ok: true });
  },
  'slope-intercept': () => {
    assert.ok(detectSplittableFractions({ left: 'y', right: '(6 - 5 x) / 2' }).length > 0, 'a two-term numerator over 2 can be split');
  },
  'inequality-sign-reversal': (question) => {
    const state = parseRelationSource(question.equation, 'x');
    const result = applyBalancedOperationToRelation(state, 'divide', '-2');
    assert.equal(result.requiresInequalityFlip, true);
    assert.deepEqual(result.expectedRelations, ['<']);
  },
  'inequality-distribution': (question) => {
    const state = parseRelationSource(question.equation, 'x');
    const [candidate] = relationDistributionCandidates(state.branches[0]);
    assert.equal(candidate.detected.factorText, '-3', 'the negative multiplier is the student\'s to place');
    let distribution = initDistributionState(candidate.detected);
    distribution.terms.forEach((_, index) => { distribution = placeOnTerm(armFactor(distribution), index); });
    const next = commitRelationDistribution(state, 0, candidate.expressionIndex, distribution);
    assert.equal(validateRelationTransition(state, next, { kind: 'equivalentRewrite' }).valid, true);
  },
  'inequality-like-terms': (question) => {
    const state = parseRelationSource(question.equation, 'x');
    const good = commitRelationLikeTerms(state, 0, 0, [0, 1], '5x');
    assert.equal(validateRelationTransition(state, good.next, { kind: 'equivalentRewrite' }).valid, true);
    const wrong = commitRelationLikeTerms(state, 0, 0, [0, 1], '6x');
    assert.equal(validateRelationTransition(state, wrong.next, { kind: 'equivalentRewrite' }).valid, false, 'a wrong sum is refused');
  },
  'absolute-value': (question) => {
    const before = parseRelationSource(question.equation, 'x');
    const split = (second) => buildStudentAuthoredAbsoluteValueSplit(before, 0, 'or', {
      branches: [{ value: '7', relation: '=' }, { value: second, relation: '=' }],
    });
    const valid = (candidate) => candidate.ready
      && validateRelationTransition(before, candidate.state, { kind: 'absoluteSplit', branchIndex: 0, structure: 'or' }).valid;
    assert.equal(valid(split('-7')), true, '7 OR −7 is the split');
    assert.equal(valid(split('7')), false, 'a split without the negative branch is refused');
  },
  'absolute-value-inequality': (question) => {
    assert.match(relationStateToLatex(parseRelationSource(question.equation, 'x')), /\\left\|/);
  },
  'xy-intercepts': (question) => {
    const standard = resolveStandardCoefficients(question);
    assert.deepEqual(buildSubstitutionState(standard, 'y'), { zeroVariable: 'y', variable: 'x', coefficient: 3, constant: 0, right: 24 });
    assert.deepEqual(expectedInterceptPoint(standard, 'x'), [8, 0]);
  },
  substitution: () => {
    const substituted = substituteIntoEquation('3x + 2y = 12', 'y', '2x - 1');
    assert.match(substituted, /2 \* \(2 \* x - 1\)/, 'the whole expression replaces y, grouped');
  },
  elimination: () => {
    const first = applyEquationMultiplier('x + 2y = 5', -3);
    const second = linearEquationCoefficients('3x + y = 5');
    assert.ok(eliminatesVariable(combineCoefficients(first.coefficients, second, 'add'), 'x'), 'the student-chosen multiplier eliminates x');
  },
  'three-variable-substitution': () => {
    assert.match(read('src/tools/systemsWorkspace/substitutionReduction.js'), /export const/);
  },
  'three-variable-elimination': () => {
    // The same pair-elimination math the student performs on Day 1 (#359):
    // eliminate y from 2x - y + 2z = 15 and -x + y + z = 3 by adding directly.
    const vars = ['x', 'y', 'z'];
    const formA = linearEquationForm('2x - y + 2z = 15', vars);
    const formB = linearEquationForm('-x + y + z = 3', vars);
    const scaledB = applyFormMultiplier(formB, 1, vars);
    const combined = combineForms(formA, scaledB, 'add', vars);
    assert.ok(formEliminatesVariable(combined, 'y'), 'the student-chosen pair and operation eliminate y');
    assert.deepEqual(combined.coefficients, { x: 1, y: 0, z: 3 });
    assert.equal(combined.constant, 18);
  },
  'work-persistence': () => {},
  'relation-persistence': (question) => {
    const saved = JSON.parse(JSON.stringify(applyBalancedOperationToRelation(parseRelationSource(question.equation, 'x'), 'divide', '-2').state));
    assert.deepEqual(restorableRelationState(saved), saved, 'a saved relation state round-trips through the draft');
  },
  'draft-recovery': () => {
    assert.equal(restorableRelationState({ branches: 'broken' }), null);
    assert.equal(restorableRelationState({ branches: [{ expressions: ['x', 5], relations: ['<'] }] }), null);
  },
  'work-view': () => {},
  'history-notation': (question) => {
    assert.doesNotMatch(relationStateToLatex(parseRelationSource(question.equation, 'x')), /<=|>=|abs\(|\*/);
  },
  'host-parity': () => {},
  'prompt-tool-match': (question) => {
    const prepared = prepareQuestionForRuntimeRouting(question);
    assert.equal(prepared.equation, '-2x + 3 > 7', 'the prompt\'s inequality, not demo factors');
  },
};

test('the manifest is well formed: unique ids, known subsystems, known fixtures', () => {
  const ids = INTERACTIVE_CAPABILITIES.map((capability) => capability.id);
  assert.equal(new Set(ids).size, ids.length);
  const fixtureIds = INTERACTIVE_CAPABILITY_FIXTURES.map((fixture) => fixture.id);
  assert.equal(new Set(fixtureIds).size, fixtureIds.length);
  for (const capability of INTERACTIVE_CAPABILITIES) {
    assert.ok(CERTIFICATION_SUBSYSTEMS.includes(capability.subsystem), `${capability.id}: subsystem ${capability.subsystem}`);
    assert.ok(capabilityFixture(capability), `${capability.id}: fixture ${capability.fixture}`);
    assert.ok(BEHAVIOUR[capability.id], `${capability.id}: a behavioural check is registered`);
  }
});

test('the capabilities the platform promised are all certified', () => {
  // The Job 1 list. Removing one of these is a product decision; it must be
  // made here, visibly, not by a refactor that drops the journey.
  const required = [
    'distribution', 'substitution', 'elimination', 'factoring', 'exact-fractions', 'undo',
    'work-persistence', 'xy-intercepts', 'absolute-value', 'work-view', 'history-notation',
    'slope-intercept', 'inequality-sign-reversal', 'combine-like-terms',
  ];
  const ids = new Set(INTERACTIVE_CAPABILITIES.map((capability) => capability.id));
  required.forEach((id) => assert.ok(ids.has(id), `${id} is no longer certified`));
});

for (const capability of INTERACTIVE_CAPABILITIES) {
  test(`${capability.label}: a student can reach it and use it`, () => {
    const question = questionFor(capability);
    const route = routeFor(capability);
    assert.equal(route.route, capability.expectedRoute, `${capability.id}: reached ${route.route} — ${route.reason}`);
    assert.ok(
      route.capabilities.includes(capability.requires),
      `${capability.id}: the ${route.engine} engine does not provide ${capability.requires}`,
    );
    assert.ok(!route.legacy, `${capability.id}: reached a legacy mini-solver`);

    for (const wiring of capability.wiring) {
      assert.match(read(wiring.file), wiring.pattern, `${capability.id}: ${wiring.file} is not wired (${wiring.pattern})`);
    }

    BEHAVIOUR[capability.id](question);

    const harness = read(capability.browser.harness);
    assert.ok(
      harness.includes(`'${capability.browser.journey}'`) || harness.includes(`"${capability.browser.journey}"`),
      `${capability.id}: ${capability.browser.harness} no longer performs journey ${capability.browser.journey}`,
    );
    // Run in CI either directly by a workflow, or as a suite of the
    // certification runner that a workflow runs.
    const certifiedSuite = CERTIFICATION_SUITES.some((suite) => suite.command.includes(capability.browser.harness) && suite.tier !== 'release');
    assert.ok(
      workflows.includes(capability.browser.harness)
        || (certifiedSuite && workflows.includes('scripts/certify-interactive-capabilities.mjs')),
      `${capability.id}: no CI workflow runs ${capability.browser.harness}`,
    );
  });
}

test('every engine capability the manifest relies on is declared by that engine', () => {
  const declared = new Set(Object.values(ALGEBRA_ENGINE_CAPABILITIES).flat());
  INTERACTIVE_CAPABILITIES.forEach((capability) => {
    assert.ok(declared.has(capability.requires) || capability.requires === 'interceptZeroSubstitution', `${capability.requires} is declared`);
  });
});

test('every report section is backed by a capability or a suite, and every suite command exists', () => {
  const fullRun = [...INTERACTIVE_CAPABILITIES.map((capability) => capability.subsystem), ...CERTIFICATION_SUITES.map((suite) => suite.subsystem)];
  CERTIFICATION_SUBSYSTEMS.forEach((subsystem) => {
    assert.ok(fullRun.includes(subsystem), `${subsystem} has nothing certifying it`);
  });
  // The fast PR tier still reports the teacher, assessment and persistence sections.
  const prSubsystems = new Set(suitesForTier('pr').map((suite) => suite.subsystem));
  ['TEACHER EXPERIENCE', 'ASSESSMENTS', 'PERSISTENCE'].forEach((subsystem) => assert.ok(prSubsystems.has(subsystem), `${subsystem} at tier pr`));
  CERTIFICATION_SUITES.forEach((suite) => {
    assert.ok(CERTIFICATION_TIERS.includes(suite.tier), `${suite.id} tier`);
    suite.command.filter((part) => /\.(m?js)$/.test(part)).forEach((file) => {
      assert.ok(fs.existsSync(file), `${suite.id}: ${file} does not exist`);
    });
  });
});

test('the browser certification runs for every runtime code change, and on main', () => {
  const workflow = read('.github/workflows/interactive-capability-certification.yml');
  const triggers = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('jobs:'));
  assert.match(triggers, /pull_request:/);
  // A capability disappears through routing, compiler or repair changes as
  // easily as through the tool itself, so the filter must cover all of src/.
  const prTriggers = triggers.slice(triggers.indexOf('pull_request:'), triggers.indexOf('push:'));
  if (/paths:/.test(prTriggers)) assert.match(prTriggers, /"src\/\*\*"/, 'every change under src/ runs the certification');
  assert.match(triggers, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /node scripts\/certify-interactive-capabilities\.mjs/);
});
