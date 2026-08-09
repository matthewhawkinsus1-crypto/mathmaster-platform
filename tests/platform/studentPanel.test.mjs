import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHOICES, curateStudentPanel, resolveChoiceState } from '../../src/platform/path/studentPanel.js';
import { getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { staticMapProvider } from '../../src/platform/path/curriculumPacing.js';
import { getSkillGraph, teksSkillId } from '../../src/platform/path/skillGraph.js';

const COURSE = 'algebra1';
const graph = getSkillGraph(COURSE);

test('the panel is a curation, not the whole engine output', () => {
  const options = getStudentPathOptions({ courseId: COURSE });
  const total = options.recommended.length + options.available.length;
  assert.ok(total > 10, 'the engine really does return a long list');

  const panel = curateStudentPanel(options);
  const shown = [panel.best, panel.strengthen, panel.challenge, ...panel.choices].filter(Boolean);
  assert.ok(shown.length <= 2 + MAX_CHOICES + 1, 'a student never sees the full list by default');
  assert.ok(panel.choices.length <= MAX_CHOICES);
  assert.ok(panel.moreCount > 0, 'and is told how much more there is');
});

test('the panel never shows the same skill twice', () => {
  const panel = curateStudentPanel(getStudentPathOptions({ courseId: COURSE }));
  const ids = [panel.best, panel.strengthen, panel.challenge, ...panel.choices].filter(Boolean).map((c) => c.skillId);
  assert.equal(new Set(ids).size, ids.length);
});

test('priority outranks a plain recommendation for the top slot', () => {
  const target = graph[3].skillId;
  const options = getStudentPathOptions({
    courseId: COURSE,
    teacherOverrides: [{ skillId: target, action: 'priority' }],
  });
  assert.equal(curateStudentPanel(options).best.skillId, target,
    'a skill the teacher flagged is the more useful "do this next"');
});

test('Strengthen appears only when there is a real repair to make', () => {
  const clean = curateStudentPanel(getStudentPathOptions({ courseId: COURSE }));
  assert.equal(clean.strengthen, null, 'no gap, no Strengthen card');

  const dependent = graph.find((skill) => skill.prerequisites.some((p) => p.required));
  const prereq = dependent.prerequisites.find((p) => p.required);
  const gapped = curateStudentPanel(getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: { [prereq.skillId]: { mastery: prereq.minimumMastery - 0.1, attempts: 8 } },
  }));
  assert.ok(gapped.strengthen, 'a real gap surfaces a Strengthen card');
  assert.ok(gapped.strengthen.remediationTarget, 'and it names what to repair');
});

test('Challenge is earned, never filler', () => {
  const plain = curateStudentPanel(getStudentPathOptions({ courseId: COURSE }));
  assert.equal(plain.challenge, null);

  const target = graph[5];
  const mastery = {};
  graph.forEach((skill) => {
    const entry = { mastery: 0.95, attempts: 20, evidenceStrength: 1 };
    mastery[skill.skillId] = entry;
    skill.prerequisites.forEach((p) => { mastery[p.skillId] = entry; });
  });
  delete mastery[target.skillId];
  const earned = curateStudentPanel(getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: mastery,
    pacingProvider: staticMapProvider({ windowMap: { [target.skillId]: { window: 2 } } }),
    pacing: { currentWindow: 1 },
  }));
  assert.ok(earned.challenge, 'strong prerequisites one window ahead earns a Challenge');
  assert.equal(earned.challenge.skillId, target.skillId);
});

test('required work suspends free choice, and says why', () => {
  const target = graph[4].skillId;
  const panel = curateStudentPanel(getStudentPathOptions({ courseId: COURSE, requiredSkillIds: [target] }));
  assert.equal(panel.required.length, 1);

  const state = resolveChoiceState(panel);
  assert.equal(state.choiceAllowed, false);
  assert.match(state.reason, /teacher assigned/i);
  assert.ok(!/_/.test(state.reason), 'the explanation is plain language');

  assert.equal(resolveChoiceState(curateStudentPanel(getStudentPathOptions({ courseId: COURSE }))).choiceAllowed, true);
});

test('every card carries a plain-language reason and no reason codes', () => {
  const panel = curateStudentPanel(getStudentPathOptions({ courseId: COURSE }));
  [panel.best, ...panel.choices].filter(Boolean).forEach((card) => {
    assert.ok(card.reason.length > 0);
    assert.ok(!/_/.test(card.reason), `"${card.reason}" leaks a reason code`);
    assert.ok(card.title && card.description);
  });
});

test('provisional pacing is surfaced so the panel does not overclaim', () => {
  const provider = staticMapProvider({ windowMap: {} });
  const honest = curateStudentPanel(getStudentPathOptions({ courseId: COURSE, pacingProvider: provider }));
  assert.equal(honest.pacingIsProvisional, false, 'authored pacing makes no such claim');
});

test('an empty result is reported as empty rather than rendering a hollow panel', () => {
  const panel = curateStudentPanel(getStudentPathOptions({ courseId: 'nope' }));
  assert.equal(panel.isEmpty, true);
});

test('hostile input never throws', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.doesNotThrow(() => curateStudentPanel(bad));
    assert.doesNotThrow(() => resolveChoiceState(bad));
  }
  assert.equal(curateStudentPanel(null).isEmpty, true);
  assert.equal(resolveChoiceState(null).choiceAllowed, true);
});

test('a severe gap still produces a Strengthen card, pointing at the prerequisite', () => {
  // Severe gaps land in `locked`, which students never see. Without a fallback
  // the student with the worst gap would be offered nothing to repair.
  const dependent = graph.find((skill) => skill.prerequisites.some((p) => p.required));
  const prereq = dependent.prerequisites.find((p) => p.required).skillId;

  const options = getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: { [prereq]: { mastery: 0.15, attempts: 10 } },
  });
  assert.equal(options.remediation.length, 0, 'this really is the severe-gap case, not the moderate one');
  assert.ok(options.locked.length > 0);

  const panel = curateStudentPanel(options);
  assert.ok(panel.strengthen, 'the student is still offered a repair');
  assert.equal(panel.strengthen.skillId, prereq,
    'and it points at the prerequisite, not at the skill the student cannot do yet');
  assert.match(panel.strengthen.reason, /unlock what comes next/i);
  assert.ok(!/_/.test(panel.strengthen.reason));
});

test('a skill that is both the best option and the weak one is shown once, as Strengthen', () => {
  const dependent = graph.find((skill) => skill.prerequisites.some((p) => p.required));
  const prereq = dependent.prerequisites.find((p) => p.required).skillId;
  const panel = curateStudentPanel(getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: { [prereq]: { mastery: 0.15, attempts: 10 } },
  }));

  assert.ok(panel.strengthen);
  assert.notEqual(panel.best?.skillId, panel.strengthen.skillId,
    'showing the same skill in two slots reads as a bug to a student');
  const ids = [panel.best, panel.strengthen, panel.challenge, ...panel.choices].filter(Boolean).map((c) => c.skillId);
  assert.equal(new Set(ids).size, ids.length, 'and nothing else duplicates either');
});
