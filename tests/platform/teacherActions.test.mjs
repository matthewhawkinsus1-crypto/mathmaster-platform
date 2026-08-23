// "DO NOT AUTOMATICALLY ALTER STUDENT PLANS SIMPLY BECAUSE THE TEACHER OPENED
//  AN ALERT."
//
// The rule sounds obvious and is broken constantly, because the convenient
// design is so nearly reasonable: the platform found the gap, the platform
// knows the repair, the teacher clicked the alert — why not queue the work?
//
// Because "the teacher looked at it" is not consent, a plan that changes on
// being READ cannot be reasoned about afterwards, and a teacher who discovers
// that opening alerts silently reassigns work stops opening alerts. These tests
// pin the gap between looking and deciding.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACTION, NAVIGATION_ONLY,
  actionsForAlert, buildOverrideFromConfirmation, describeDecision,
} from '../../src/platform/teacher/teacherActions.js';
import { ALERT_KIND, URGENCY } from '../../src/platform/teacher/needsAttention.js';

const studentAlert = {
  id: 'belowLevel:s1', rule: 'belowLevel', kind: ALERT_KIND.ACADEMIC,
  urgency: URGENCY.THIS_WEEK, classId: 'c-1', studentId: 's1', studentName: 'Rivera, Ana',
  headline: 'Working below the course expectation', detail: '…',
};

const classAlert = {
  id: 'class:belowLevel::c-1', rule: 'belowLevel', kind: ALERT_KIND.ACADEMIC,
  urgency: URGENCY.THIS_WEEK, classId: 'c-1', studentId: null,
  students: [{ studentId: 's1', studentName: 'A' }, { studentId: 's2', studentName: 'B' }],
  headline: '12 of 30 students · working below the course expectation', detail: '…',
};

// --- nothing changes on being opened -------------------------------------------

test('the module has no way to write anything', () => {
  // Structural, deliberately: the guarantee is that no such code path exists,
  // not that the cases I thought of happen to be read-only.
  const source = readFileSync('src/platform/teacher/teacherActions.js', 'utf8');
  assert.ok(!/from '.*firebase/.test(source));
  assert.ok(!/setDoc|updateDoc|httpsCallable|fetch\(/.test(source));
});

test('opening an alert offers looking before it offers changing', () => {
  // The default next move is always to look, and changing a plan is never the
  // thing nearest the cursor.
  const proposals = actionsForAlert({ alert: classAlert, classId: 'c-1' });
  assert.ok(proposals.length > 0);
  assert.equal(proposals[0].changesPlans, false);
  const firstChanging = proposals.findIndex((proposal) => proposal.changesPlans);
  assert.ok(firstChanging === -1 || firstChanging === proposals.length - 1, 'plan changes come last');
});

test('every plan-changing proposal requires confirmation', () => {
  const proposals = actionsForAlert({ alert: classAlert, classId: 'c-1' });
  proposals.filter((proposal) => proposal.changesPlans).forEach((proposal) => {
    assert.equal(proposal.requiresConfirmation, true);
    assert.ok(proposal.confirm, `${proposal.action} has no confirmation payload`);
  });
});

test('navigation proposals change nothing and say so', () => {
  const proposals = actionsForAlert({ alert: studentAlert, classId: 'c-1' });
  proposals.filter((proposal) => NAVIGATION_ONLY.has(proposal.action)).forEach((proposal) => {
    assert.equal(proposal.changesPlans, false);
    assert.equal(proposal.requiresConfirmation, false);
    assert.match(proposal.reversal, /Nothing changes/);
  });
});

// --- reversibility is part of the offer ----------------------------------------

test('every proposal says how it is undone', () => {
  // A teacher deciding whether to pin a skill is really deciding how much it
  // costs to be wrong. An action that cannot say how to reverse it is one a
  // careful teacher declines — so it has to say.
  [studentAlert, classAlert].forEach((alert) => {
    actionsForAlert({ alert, classId: 'c-1' }).forEach((proposal) => {
      assert.ok(proposal.reversal && proposal.reversal.length > 20, `${proposal.action} has no reversal`);
    });
  });
});

test('the class proposal promises not to remove existing work', () => {
  const proposal = actionsForAlert({ alert: classAlert, classId: 'c-1' })
    .find((entry) => entry.action === ACTION.RECOMMEND_SKILL);
  assert.match(proposal.description, /existing work is not removed/);
  assert.match(proposal.reversal, /keep the evidence they earned/);
});

// --- the platform does not choose --------------------------------------------

test('the proposal does not pre-select a skill', () => {
  // A proposal that picked the skill would be a decision wearing a suggestion's
  // clothes: the teacher would be confirming something they never chose.
  const proposal = actionsForAlert({ alert: classAlert, classId: 'c-1' })
    .find((entry) => entry.action === ACTION.RECOMMEND_SKILL);
  assert.equal(proposal.confirm.skillId, null);
});

test('an incomplete confirmation builds nothing rather than filling in a default', () => {
  // A half-specified change quietly completed with a default is the platform
  // choosing while appearing to obey.
  assert.equal(buildOverrideFromConfirmation({ confirm: { kind: ACTION.RECOMMEND_SKILL, classId: 'c-1', skillId: null } }), null);
  assert.equal(buildOverrideFromConfirmation({ confirm: { kind: ACTION.RECOMMEND_SKILL, classId: '', skillId: 'A.5C' } }), null);
  assert.equal(buildOverrideFromConfirmation({ confirm: null }), null);
});

test('a complete confirmation builds exactly the override, and nothing more', () => {
  const override = buildOverrideFromConfirmation({
    confirm: { kind: ACTION.RECOMMEND_SKILL, classId: 'c-1', skillId: 'A.5C' },
    note: 'From the below-level pattern on 20 Aug.',
  });
  assert.deepEqual(override, {
    classId: 'c-1', skillId: 'A.5C', action: 'recommend', expiresAt: null,
    note: 'From the below-level pattern on 20 Aug.',
  });
});

test('an unknown action kind is refused rather than guessed at', () => {
  assert.equal(buildOverrideFromConfirmation({ confirm: { kind: 'deleteEverything', classId: 'c-1', skillId: 'A.5C' } }), null);
});

// --- the audit trail can tell looking from deciding ----------------------------

test('a decision record carries what it responded to and how to undo it', () => {
  // A history that cannot tell "looked" from "decided" cannot answer the only
  // question anyone asks of it later.
  const proposal = actionsForAlert({ alert: classAlert, classId: 'c-1' })
    .find((entry) => entry.action === ACTION.RECOMMEND_SKILL);
  const record = describeDecision({
    proposal,
    confirm: { ...proposal.confirm, skillId: 'A.5C' },
    teacherEmail: 'teacher@example.edu',
  });
  assert.equal(record.inResponseTo, classAlert.id);
  assert.equal(record.skillId, 'A.5C');
  assert.equal(record.decidedBy, 'teacher@example.edu');
  assert.ok(record.rationale);
  assert.ok(record.reversal);
});

test('no decision record exists without a confirmation', () => {
  const proposal = actionsForAlert({ alert: classAlert, classId: 'c-1' })[0];
  assert.equal(describeDecision({ proposal, confirm: null }), null);
});

// --- system alerts -------------------------------------------------------------

test('a system alert offers only a way to go and fix it', () => {
  const proposals = actionsForAlert({
    alert: { id: 'unplaceableStudents', rule: 'unplaceableStudents', kind: ALERT_KIND.SYSTEM, urgency: URGENCY.TODAY },
  });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].action, ACTION.OPEN_ADMINISTRATION);
  assert.equal(proposals[0].changesPlans, false);
});

test('a per-student alert never offers a class-wide plan change', () => {
  // One struggling student is not a reason to move thirty students' work.
  const proposals = actionsForAlert({ alert: studentAlert, classId: 'c-1' });
  assert.ok(!proposals.some((proposal) => proposal.changesPlans));
});
