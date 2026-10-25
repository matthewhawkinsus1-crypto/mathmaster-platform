/*
 * PRE-FLIGHT'S GENERATION AUDIT, KEPT PER CONTENT (found by the p3-ci batch:
 * the Review dialog rebuilt its whole model on every edit, about 5 seconds
 * per click for a 40-question review on a slow machine).
 *
 * A family's capacity and a slot's audit are pure functions of their content,
 * so they are kept, keyed by that content. These prove the kept audit is the
 * one a fresh run gives, that an unchanged rebuild measures nothing again, and
 * that an edited question is audited again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  CAPACITY_BUDGET,
  CAPACITY_CACHE_LIMIT,
  SLOT_AUDIT_CACHE_LIMIT,
  auditAssignmentQuestionGeneration,
  capacityCacheSize,
  clearCapacityCache,
  clearSlotAuditCache,
  measuredCapacity,
  slotAuditCacheSize,
} from '../../src/platform/preflight/questionGenerationPreflight.js';
import { measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { resolveQuestionFamilyDefinition } from '../../functions/shared/questionFamilyInstance.mjs';
import { familySlotKey } from '../../functions/shared/questionFamilySlot.mjs';
import { allRegisteredQuestionFamilies } from '../../functions/shared/questionFamilyRegistry.mjs';

const dir = new URL('../../teacher-import-jsons/algebra2-honors-dol2/', import.meta.url);
const file = readdirSync(dir).find((name) => name.endsWith('.json'));
const lesson = () => parseAssignmentBlueprintText(readFileSync(new URL(file, dir), 'utf8')).assignmentV5;
const clearAll = () => { clearCapacityCache(); clearSlotAuditCache(); };
// Everything the model holds: messages, per-question generation lines, the
// advisory counts and the readiness state a teacher reads.
const reading = (model) => JSON.stringify(model);

test('a rebuild from kept audits reads exactly as a fresh build', () => {
  clearAll();
  const fresh = reading(buildAssignmentV5PreflightModel(lesson(), { classSize: 30 }));
  assert.ok(capacityCacheSize() > 0 && slotAuditCacheSize() > 0, 'the review has family-backed questions');
  const kept = reading(buildAssignmentV5PreflightModel(lesson(), { classSize: 30 }));
  assert.equal(kept, fresh);
  clearAll();
  assert.equal(reading(buildAssignmentV5PreflightModel(lesson(), { classSize: 30 })), fresh, 'and as a build after the cache is emptied');
});

test('an unchanged rebuild audits nothing again; an edited question is audited again', () => {
  clearAll();
  const base = lesson();
  buildAssignmentV5PreflightModel(base, { classSize: 30 });
  const capacities = capacityCacheSize();
  const slots = slotAuditCacheSize();
  // A rebuild after an edit that touches no question (the assignment's title).
  buildAssignmentV5PreflightModel({ ...base, assignment: { ...base.assignment, title: `${base.assignment?.title || 'Review'} (edited)` } }, { classSize: 30 });
  assert.equal(capacityCacheSize(), capacities, 'no family measured again');
  assert.equal(slotAuditCacheSize(), slots, 'no slot audited again');
  // An edit to one family-backed question's words: that slot only is audited again.
  const edited = JSON.parse(JSON.stringify(base));
  const section = edited.sections.find((entry) => (entry.questions || []).some((question) => question.familyId || question.questionFamily || question.generator || question.template));
  assert.ok(section, 'a section with a family-backed question');
  const question = section.questions.find((entry) => entry.familyId || entry.questionFamily || entry.generator || entry.template);
  question.prompt = `${question.prompt || ''} `.trimEnd() + ' Show your reasoning.';
  buildAssignmentV5PreflightModel(edited, { classSize: 30 });
  assert.equal(slotAuditCacheSize(), slots + 1, 'one new slot audit for the edited question');
});

test('every slot reads its own family: capacities match a measurement made without the cache', () => {
  clearAll();
  const model = buildAssignmentV5PreflightModel(lesson(), { classSize: 30 });
  const assignmentId = 'cache-oracle';
  // Twice: the second pass reads every audit and capacity from the cache.
  for (const pass of [1, 2]) {
    const audit = auditAssignmentQuestionGeneration({ ...model.assignmentV5, id: assignmentId }, model.questions, { classSize: 30 });
    const familySlots = audit.slots.filter((slot) => slot.familyBacked && !slot.error);
    assert.ok(new Set(familySlots.map((slot) => `${slot.familyId}@${slot.familyVersion}`)).size > 1, 'the lesson uses more than one family');
    const capacities = new Set();
    familySlots.forEach((slot) => {
      const question = model.questions[slot.questionIndex];
      const slotKey = familySlotKey({ assignmentId, question, storageIndex: slot.questionIndex });
      const definition = resolveQuestionFamilyDefinition(question, { slotKey });
      assert.equal(slot.familyId, definition.family.id, `pass ${pass}, ${slot.label}: its own family`);
      assert.equal(slot.familyVersion, definition.family.version, `pass ${pass}, ${slot.label}: its own version`);
      const expected = measureFamilyCapacity(definition.family, definition.constraintValues, { budget: CAPACITY_BUDGET }).capacity;
      assert.equal(slot.capacity, expected, `pass ${pass}, ${slot.label}: its own capacity`);
      capacities.add(expected);
    });
    assert.ok(capacities.size > 1, 'the families differ in capacity, so a shared entry would show');
  }
});

test('a kept capacity cannot be changed by whoever reads it', () => {
  clearAll();
  const model = buildAssignmentV5PreflightModel(lesson(), { classSize: 30 });
  const index = model.questionGeneration.slots.find((slot) => slot.familyBacked && !slot.error).questionIndex;
  const question = model.questions[index];
  const { family, constraintValues } = resolveQuestionFamilyDefinition(question, { slotKey: familySlotKey({ assignmentId: 'frozen', question, storageIndex: index }) });
  const kept = measuredCapacity(family, constraintValues);
  assert.equal(measuredCapacity(family, constraintValues), kept, 'the same object is handed back');
  assert.ok(Object.isFrozen(kept) && Object.isFrozen(kept.rejections));
  assert.throws(() => { kept.capacity = 0; }, TypeError);
  // A stratified family's per-case counts are frozen too.
  const stratified = allRegisteredQuestionFamilies().find((candidate) => candidate.strata && measuredCapacity(candidate, {}).strata?.length > 0);
  assert.ok(stratified, 'a stratified family to read');
  const cases = measuredCapacity(stratified, {}).strata;
  assert.ok(Object.isFrozen(cases) && Object.isFrozen(cases[0]));
});

test('the caches are bounded', () => {
  assert.ok(CAPACITY_CACHE_LIMIT > 0 && CAPACITY_CACHE_LIMIT <= 1024);
  assert.ok(SLOT_AUDIT_CACHE_LIMIT > 0 && SLOT_AUDIT_CACHE_LIMIT <= 2048);
});
