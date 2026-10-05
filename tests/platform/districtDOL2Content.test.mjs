import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mathPath from '../../functions/lib/mathPath.js';
import { normalizeAssignmentV5, validateAssignmentV5 } from '../../src/platform/contract/assignmentSchemaV5.js';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildSecureIssuancePlan } from '../../functions/shared/testCycleIssuance.mjs';
import { preflightTestCycle } from '../../functions/shared/testCyclePreflight.mjs';
import { buildTemplateFamily } from '../../functions/shared/questionFamilyTemplate.mjs';
import { createFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { buildIngestedAttempt } from '../../functions/shared/submissionIngestion.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const assignment = read('../../drafts/district-dol2/assignment.json');
const bank = read('../../functions/seeds/secureAssessments/algebra1_district_dol2.json');
const familyMap = new Map(bank.documents.map(doc => [doc.id, doc]));
const keyMap = (question) => Object.fromEntries(question.responseFields.map(field => [field.id, field.expected]));
const numbers = (value) => String(value).replace(/[{}()]/g, '').split(',').map(Number).sort((a, b) => a - b);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} ≠ ${expected}`);

test('mastery review rejects a claimed correct submission without the server delivery pin', () => {
  const question = { ...assignment.sections[0].questions[0], activityRole: 'review' };
  const result = buildIngestedAttempt({
    envelope: { kind: 'ordinarySubmission', studentId: 's', assignmentId: 'dol2', questionIndex: 0, activityRole: 'review', variantIndex: 0,
      response: { kind: 'fields', fields: [{ id: 'association', value: 'anything' }] }, record: { status: 'correct', attemptCount: 1, totalAttempts: 1, bestRawPartialCredit: 100 } },
    assignment: { ...assignment, id: 'dol2' }, question, canonicalRecord: {}, gradeDocument: { classId: 'c' },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'mastery-review-requires-server-grading');
});

test('authoritative ordinary ingestion retains exact raw mastery on a concrete native review task', () => {
  const question = { ...assignment.sections[0].questions[0].variants[0], questionId: 'dol2-r01', activityRole: 'review' };
  const result = buildIngestedAttempt({
    envelope: { kind: 'ordinarySubmission', studentId: 's', assignmentId: 'dol2', questionIndex: 0, activityRole: 'review', variantIndex: 0,
      response: { kind: 'fields', fields: question.answerFields.map(field => ({ id: field.id, value: field.answer })) }, record: { bestRawPartialCredit: 0 } },
    assignment: { ...assignment, id: 'dol2' }, question, canonicalRecord: {}, gradeDocument: { classId: 'c' },
  });
  assert.equal(result.blocked, false, result.reason);
  assert.equal(result.gradedBy, 'server');
  assert.equal(result.record.bestRawPartialCredit, 100);
});

test('native package has seven review tasks, thirteen complete secure targets, and no retest keys in the assignment', () => {
  const normalized = normalizeAssignmentV5(assignment);
  assert.deepEqual(validateAssignmentV5(normalized).errors, []);
  assert.equal(normalized.sections[0].questions.length, 7);
  assert.equal(normalized.testBlueprint.totalQuestions, 13);
  assert.ok(Buffer.byteLength(JSON.stringify(assignment)) < 850_000, 'leave room below the Firestore 1 MiB document limit');
  assert.equal(assignment.sections.length, 1);
  assert.deepEqual(assignment.testBlueprint.targets.flatMap(target => target.familyIds), bank.documents.map(doc => doc.id));
  assert.ok(!JSON.stringify(assignment.testBlueprint).includes('expected'));
});

test('all 832 retest variants agree with the visible math and privately grade their own correct responses', async () => {
  for (const [index, family] of bank.documents.entries()) {
    assert.equal(family.variants.length, 64);
    for (const variant of family.variants) {
      const question = { ...family, ...variant };
      const keys = keyMap(question);
      const stimulus = question.stimulus;
      const graph = stimulus.graph;
      const rows = stimulus.table?.rows.map(row => row.cells);
      if ([2, 3, 7].includes(index)) {
        const [a, b] = graph.lines[0].points;
        const slope = (b.y - a.y) / (b.x - a.x);
        const intercept = a.y - slope * a.x;
        if (index === 2) {
          const parsePair = value => String(value).replace(/[()]/g, '').split(',').map(Number);
          const [xx, xy] = parsePair(keys.xIntercept); const [yx, yy] = parsePair(keys.yIntercept);
          near(xx, -intercept / slope); near(xy, 0); near(yx, 0); near(yy, intercept);
        }
        if (index === 3) near(Number(keys.yIntercept), intercept);
        if (index === 7) near(Number(keys.zero), -intercept / slope);
      }
      if (index === 1) {
        const terms = stimulus.expressions[0].split(',').map(Number);
        near(keys.coefficient, terms[1] - terms[0]); near(keys.constant, terms[0] - keys.coefficient);
      }
      if (index === 4) {
        const match = question.prompt.match(/a₁ = ([\d.]+).*aₙ₋₁ \+ ([\d.]+)/);
        assert.ok(match);
        for (const n of [2, 3, 4]) near(keys[`a${n}`], Number(match[1]) + (n - 1) * Number(match[2]));
      }
      if (index === 5) assert.deepEqual(numbers(keys.range), rows.map(row => row[1]).sort((a, b) => a - b));
      if (index === 6) {
        assert.equal(keys.variable, 'y'); assert.equal(keys.leftComparison, '≤'); assert.equal(keys.rightComparison, '≤');
        near(keys.lower, Math.min(...graph.points.map(point => point.y))); near(keys.upper, Math.max(...graph.points.map(point => point.y)));
      }
      if (index === 8) {
        const rate = Number(question.prompt.match(/\$(\d+) per hour/)[1]);
        const durations = question.prompt.match(/durations: ([\d, ]+)\./)[1].split(',').map(Number);
        assert.deepEqual(numbers(keys.domain), durations);
        assert.deepEqual(numbers(keys.range), durations.map(n => n * rate));
      }
      if (index === 9) {
        const zeros = graph.curves[0].points.filter(point => Math.abs(point.y) < 1e-6).map(point => point.x).sort((a, b) => a - b);
        assert.deepEqual(numbers(keys.zeros), zeros);
      }
      if (index === 10) {
        const points = graph.curves[0].points;
        near(keys.value, points.reduce((best, point) => point.y > best.y ? point : best).x); assert.equal(keys.variable, 'x');
      }
      if (index === 11) {
        for (const panel of stimulus.panels) {
          const pairs = panel.graph?.points.map(point => [point.x, point.y]) || panel.table.rows.map(row => row.cells);
          const conflicts = pairs.filter(([x, y]) => pairs.some(([xx, yy]) => x === xx && y !== yy));
          const relation = panel.title.slice(-1);
          assert.equal(keys[relation], conflicts.length ? 'Not a function' : 'Function');
          if (conflicts.length) assert.equal(keys.conflictInput, conflicts[0][0]);
        }
      }
      if (index === 12) {
        const avg = values => values.reduce((s, n) => s + n, 0) / values.length;
        const mx = avg(rows.map(row => row[0])); const my = avg(rows.map(row => row[1]));
        const m = rows.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / rows.reduce((s, [x]) => s + (x - mx) ** 2, 0);
        const prices = [...question.prompt.matchAll(/\$(\d+(?:\.\d{2})?)/g)].map(match => Number(match[1]));
        assert.equal(keys.prediction1, Math.round(my + m * (prices[0] - mx)));
        assert.equal(keys.prediction2, Math.round(my + m * (prices[1] - mx)));
      }
      const grading = mathPath.privateGradingDefinition(question);
      const result = await mathPath.gradeResponse(grading, { responses: Object.fromEntries(grading.fields.map(field => [field.id, field.expected])) });
      assert.equal(result.isCorrect, true, family.id);
      assert.equal(result.score, 1);
      const publicQuestion = mathPath.buildSanitizedQuestion(question);
      assert.doesNotMatch(JSON.stringify(publicQuestion), /"(?:expected|accepted|variants|generator|privateMath|grading)"\s*:/);
      assert.equal(publicQuestion.stimulus.panels?.length || 0, stimulus.panels?.length || 0);
    }
  }
});

test('native review variants have capacity for a class and grade correctly through the ordinary runtime', () => {
  for (const question of assignment.sections[0].questions) {
    const family = buildTemplateFamily(question, { slotKey: question.questionId });
    const { instances, complete } = createFamilyInstanceSequence(family, {}, 'dol2-review').exhaust();
    assert.equal(complete, true);
    assert.ok(instances.length >= 35, `${question.questionId}: only ${instances.length} variants`);
    for (const variant of question.variants) {
      const result = gradeMultiAnswerResponse(variant, Object.fromEntries(variant.answerFields.map(field => [field.id, field.answer])));
      assert.equal(result.isCorrect, true, question.questionId);
    }
  }
});

test('server preflight approves the real native families and issuance is deterministic and varied', async () => {
  const verdicts = {};
  for (const family of bank.documents) verdicts[family.id] = await mathPath.buildTemplateIssuePlan(family, { samples: 4 });
  const result = preflightTestCycle({ assignment, families: bank.documents, familyIssuability: verdicts });
  assert.equal(result.blocked, false, JSON.stringify(result.errors));
  const forms = new Set();
  for (let i = 0; i < 35; i++) {
    const input = { blueprint: assignment.testBlueprint, families: bank.documents, assignmentId: 'dol2', studentId: `student-${i}`, stage: 'test', attempt: 1 };
    const plan = buildSecureIssuancePlan(input);
    assert.equal(plan.entries.length, 13);
    assert.deepEqual(plan, buildSecureIssuancePlan(input));
    const questions = plan.entries.map(entry => generatePathInstance(familyMap.get(entry.familyId), entry.seedKey).question);
    forms.add(JSON.stringify(questions.map(question => question.prompt + JSON.stringify(question.stimulus))));
  }
  assert.equal(forms.size, 35);
});
