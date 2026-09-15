import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIVITY_POLICIES, ACTIVITY_ROLES } from '../../src/platform/policies/activityPolicies.js';
import { CALCULATOR_MODES, resolveCalculatorPolicy } from '../../src/platform/policies/calculatorPolicy.js';

test('calculator is available by default for ordinary questions regardless of tool type', () => {
  for (const type of ['algebra', 'fraction', 'numberLine', 'stepAlgebra', 'graphing', 'graphing2', 'stepAlgebra2']) {
    const policy = resolveCalculatorPolicy({
      questionSpec: { type, assessedConstruct: 'computation' },
      activityPolicy: { calculatorDefault: 'questionSpecific' },
    });
    assert.equal(policy.available, true, type);
    assert.equal(policy.mode, CALCULATOR_MODES.BASIC, type);
    assert.equal(policy.source, 'platformDefault', type);
  }
});

test('warm-ups use the same question-specific calculator policy as other assignments', () => {
  assert.equal(ACTIVITY_POLICIES[ACTIVITY_ROLES.WARMUP].calculatorDefault, 'questionSpecific');
});

test('an explicit skill or question no-calculator rule still blocks the calculator', () => {
  const direct = resolveCalculatorPolicy({
    questionSpec: { calculatorPolicy: CALCULATOR_MODES.NONE },
    activityPolicy: { calculatorDefault: 'questionSpecific' },
  });
  assert.equal(direct.available, false);
  assert.match(direct.reason, /No calculator is allowed for this skill/);

  const embedded = resolveCalculatorPolicy({
    questionSpec: { rawSpec: { calculatorMode: CALCULATOR_MODES.NONE } },
    activityPolicy: { calculatorDefault: 'questionSpecific' },
  });
  assert.equal(embedded.available, false);
  assert.match(embedded.reason, /No calculator is allowed for this skill/);
});

test('assessment contexts that truly prohibit calculators remain authoritative', () => {
  const policy = resolveCalculatorPolicy({
    questionSpec: {},
    activityPolicy: { calculatorDefault: 'questionSpecific' },
    assessmentContext: 'asvab',
  });
  assert.equal(policy.available, false);
  assert.equal(policy.source, 'assessmentContext');
});

test('student UI keeps a visible prohibited calculator control when calculator use is blocked', () => {
  const questionEngine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  const calculatorPanel = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');

  assert.match(questionEngine, /🚫 🧮 Calculator/);
  assert.match(questionEngine, /toastInfo\('Calculator unavailable'/);
  assert.match(questionEngine, /aria-disabled=\{!calculatorPolicy\?\.available\}/);
  assert.match(calculatorPanel, /Calculator unavailable/);
  assert.match(calculatorPanel, /🚫 🧮 Calculator/);
});


test('assignment tool policy supplies the calculator mode when the question does not override it', () => {
  const policy = resolveCalculatorPolicy({
    questionSpec: { type: 'regressionCalculator' },
    activityPolicy: { calculatorDefault: 'questionSpecific' },
    assignmentCalculatorMode: CALCULATOR_MODES.GRAPHING,
  });
  assert.equal(policy.available, true);
  assert.equal(policy.mode, CALCULATOR_MODES.GRAPHING);
  assert.equal(policy.source, 'assignmentToolPolicy');

  const explicitlyBlocked = resolveCalculatorPolicy({
    questionSpec: { type: 'regressionCalculator', calculatorPolicy: CALCULATOR_MODES.NONE },
    activityPolicy: { calculatorDefault: 'questionSpecific' },
    assignmentCalculatorMode: CALCULATOR_MODES.GRAPHING,
  });
  assert.equal(explicitlyBlocked.available, false);
  assert.equal(explicitlyBlocked.mode, CALCULATOR_MODES.NONE);
});

test('student assignment runtime forwards toolPolicy calculator mode into QuestionEngine', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

  assert.match(app, /assignmentCalculatorMode=\{assignment\?\.toolPolicy\?\.calculator \|\| null\}/);
  assert.match(engine, /assignmentCalculatorMode,\s*assessmentContext/);
});

test('calculator panel layers above the full-screen Work View host', () => {
  const calculatorPanel = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');
  const workViewCss = readFileSync(new URL('../../src/components/common/WorkViewShell.css', import.meta.url), 'utf8');

  const calculatorLayer = Number(calculatorPanel.match(/CALCULATOR_LAYER_Z_INDEX\s*=\s*(\d+)/)?.[1]);
  const workViewLayer = Number(workViewCss.match(/mathmaster-work-view-host\[data-open="true"\][\s\S]*?z-index:\s*(\d+)/)?.[1]);

  assert.ok(Number.isFinite(calculatorLayer));
  assert.ok(Number.isFinite(workViewLayer));
  assert.ok(calculatorLayer > workViewLayer, `calculator layer ${calculatorLayer} must stay above Work View ${workViewLayer}`);
  assert.match(calculatorPanel, /zIndex:\s*CALCULATOR_LAYER_Z_INDEX \+ 1/);
});
