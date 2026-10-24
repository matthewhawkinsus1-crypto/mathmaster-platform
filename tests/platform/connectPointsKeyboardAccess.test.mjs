/*
 * "CONNECT MY POINTS" ON AN EXIT TICKET, QUIZ OR TEST: ONLY WITH THE
 * KEYBOARD-ACCESS SUPPORT (the owner, 2026-10-23, C1-120).
 *
 * The button draws the curve through the student's own points. Where outcomes
 * wait, the curve is marked through those points, so right points connected
 * made a right curve for everyone and the curve no longer measured sketching.
 * It stays for every student where outcomes are shown at once, and on an
 * assessment it is offered only to a student whose support plan has the
 * keyboard-access accommodation. That reaches the workspace the way every
 * accommodation reaches a tool: the profile, then the trusted
 * supportPresentation (src/studentSupport.js), then QuestionEngine's props.
 * The rendered route, by keyboard, is in tests/browser/graphKeyboardRoute.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  KEYBOARD_ACCESS_SUPPORT_ID, connectPointsOffered, connectPointsProvidedByPlan,
} from '../../src/platform/graph/connectPointsPolicy.js';
import {
  SUPPORT_AUTOMATION, SUPPORT_CLASSIFICATION, isAccommodation, studentFacingLabel, supportById, supportShortLabel,
} from '../../functions/shared/supportCatalog.mjs';
import { buildSupportProjection, normalizeSupportRevisionInput } from '../../functions/shared/supportProfileModel.mjs';
import { applyStudentSupportToQuestion, assessmentSupportProfile, getStudentSupportPresentation, normalizeStudentProfile } from '../../src/studentSupport.js';
import { editorGroups } from '../../src/platform/supportEvidence/supportProfileDraft.js';
import { launchSupportRecords, studentMayRecordSupport } from '../../src/platform/supportEvidence/studentSupportTelemetry.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-23T15:00:00Z');
const plan = (accommodations, { status = 'active' } = {}) => buildSupportProjection({
  revisions: [{ id: 'r1', revisionId: 'r1', revision: 1, status, effectiveStart: '2026-08-17', inclusionStatus: false, accommodations, modifications: [] }],
  todayKey: '2026-10-23',
});
const keyboard = { id: KEYBOARD_ACCESS_SUPPORT_ID, params: {}, appliesTo: [] };

test('Connect is offered wherever outcomes are shown, and where they wait only with the keyboard-access support', () => {
  assert.equal(connectPointsOffered({ outcomesWithheld: false, keyboardAccess: false }), true, 'practice, no plan');
  assert.equal(connectPointsOffered({ outcomesWithheld: false, keyboardAccess: true }), true, 'practice, with the plan');
  assert.equal(connectPointsOffered({ outcomesWithheld: true, keyboardAccess: false }), false, 'exit ticket, no plan');
  assert.equal(connectPointsOffered({ outcomesWithheld: true, keyboardAccess: true }), true, 'exit ticket, with the plan');
  assert.equal(connectPointsOffered(), true, 'no policy given: as before');
  // Only a real `true` grants it: a truthy stand-in does not.
  assert.equal(connectPointsOffered({ outcomesWithheld: true, keyboardAccess: 'yes' }), false);

  // It is the support provided only where the plan is what offers it.
  assert.equal(connectPointsProvidedByPlan({ outcomesWithheld: true, keyboardAccess: true }), true);
  assert.equal(connectPointsProvidedByPlan({ outcomesWithheld: false, keyboardAccess: true }), false, 'everyone has it there');
  assert.equal(connectPointsProvidedByPlan({ outcomesWithheld: true, keyboardAccess: false }), false);
});

test('keyboard access is an accommodation a teacher can record, applied by the platform, never a student tool', () => {
  const entry = supportById(KEYBOARD_ACCESS_SUPPORT_ID);
  assert.ok(entry, 'in the support catalog');
  assert.ok(isAccommodation(KEYBOARD_ACCESS_SUPPORT_ID));
  assert.equal(entry.classification, SUPPORT_CLASSIFICATION.ACCOMMODATION);
  assert.equal(entry.automation, SUPPORT_AUTOMATION.AUTOMATIC);
  assert.deepEqual([...entry.evidence], ['provided']);
  assert.equal(studentFacingLabel(KEYBOARD_ACCESS_SUPPORT_ID), null, 'nothing new in the student\'s Support tools');
  assert.equal(supportShortLabel(KEYBOARD_ACCESS_SUPPORT_ID), 'Keyboard access');

  const offered = editorGroups().platformAccommodations.flatMap((group) => group.items.map((item) => item.id));
  assert.ok(offered.includes(KEYBOARD_ACCESS_SUPPORT_ID), 'the profile editor offers it with the platform supports');
  const { errors, revision } = normalizeSupportRevisionInput({ effectiveStart: '2026-10-23', sourceLabel: 'IEP', accommodations: [KEYBOARD_ACCESS_SUPPORT_ID] });
  assert.deepEqual(errors, []);
  assert.deepEqual(revision.accommodations.map((item) => item.id), [KEYBOARD_ACCESS_SUPPORT_ID], 'a revision keeps it');
});

test('the support reaches a question as trusted presentation data, from a flat or a versioned profile', () => {
  assert.equal(getStudentSupportPresentation({ accommodations: [KEYBOARD_ACCESS_SUPPORT_ID] }).keyboardAccess, true, 'flat profile');
  assert.equal(getStudentSupportPresentation({ accommodations: ['text-to-speech'] }).keyboardAccess, false);
  assert.equal(getStudentSupportPresentation({ inclusionStatus: true }).keyboardAccess, false, 'inclusion status does not imply it');
  assert.equal(getStudentSupportPresentation(normalizeStudentProfile(plan([keyboard]), { nowValue: NOW })).keyboardAccess, true, 'versioned plan');
  assert.equal(getStudentSupportPresentation(normalizeStudentProfile(plan([keyboard], { status: 'inactive' }), { nowValue: NOW })).keyboardAccess, false, 'an ended plan');

  const graph = { type: 'functionGraph', prompt: 'Graph y = 2x + 1.' };
  assert.equal(applyStudentSupportToQuestion(graph, { accommodations: [KEYBOARD_ACCESS_SUPPORT_ID] }).question.supportPresentation.keyboardAccess, true);
  // Assignment JSON cannot grant it to a whole class.
  const selfGranted = { ...graph, supportPresentation: { keyboardAccess: true } };
  assert.equal(applyStudentSupportToQuestion(selfGranted, null).question.supportPresentation.keyboardAccess, false);
  // It is access, not a change to what is assessed: a secure test item keeps it.
  const secure = assessmentSupportProfile({ accommodations: [KEYBOARD_ACCESS_SUPPORT_ID, 'algebra-auto-apply'] });
  assert.deepEqual(secure.accommodations, [KEYBOARD_ACCESS_SUPPORT_ID]);
  assert.equal(getStudentSupportPresentation(secure).keyboardAccess, true);
});

test('it is recorded as provided from the question where it showed, never claimed at launch', () => {
  const profile = plan([keyboard]);
  const launch = launchSupportRecords({ profile, assignment: {}, roles: ['dol', 'classwork'], questions: [{ type: 'functionGraph' }], nowValue: NOW });
  assert.deepEqual(launch.records, [], 'configured is not provided');
  assert.equal(studentMayRecordSupport(profile, KEYBOARD_ACCESS_SUPPORT_ID, { nowValue: NOW }), true, 'the question\'s record is allowed');
  assert.equal(studentMayRecordSupport(plan([]), KEYBOARD_ACCESS_SUPPORT_ID, { nowValue: NOW }), false);
});

// ─── The screen is wired to the rule ───────────────────────────────────────

const workspace = executableSource(read('src/InteractiveGraphWorkspace.jsx'));
// The JSX condition that renders an element: from the `{` that opens it to the element.
const guardOf = (source, marker, element = '<FocusSafeButton') => {
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, `could not find ${marker}`);
  const start = source.lastIndexOf(element, at);
  return source.slice(source.lastIndexOf('{', start), start);
};

test('the workspace offers both Connect buttons, and names Connect, only where the rule offers it', () => {
  assert.match(workspace, /import \{[^}]*\bconnectPointsOffered\b[^}]*\} from '\.\/platform\/graph\/connectPointsPolicy\.js';/);
  assert.match(workspace, /const outcomesWithheld = !revealPointCorrectness;/);
  assert.match(workspace, /const connectOffered = connectPointsOffered\(\{ outcomesWithheld, keyboardAccess \}\);/);
  assert.match(region(workspace, 'export default function InteractiveGraphWorkspace({', '}) {', 'props'), /\n\s*keyboardAccess = false,\n\s*onSupportEvidence = null,\n/);

  for (const marker of ['data-graph-connect-points="construction"', 'data-graph-connect-points="inverse"']) {
    assert.match(guardOf(workspace, marker), /\bconnectOffered\b/, `${marker}: rendered only where Connect is offered`);
  }
  // The sentence that names the button is said only where the button is there.
  const sentences = [...workspace.matchAll(/Or press Connect my points/g)];
  assert.equal(sentences.length, 1);
  sentences.forEach(({ index }) => {
    assert.match(workspace.slice(workspace.lastIndexOf('{', index), index), /\bconnectOffered\s*\?/, 'the sentence is conditional on the offer');
  });
  // And the action itself refuses where it is not offered.
  assert.match(region(workspace, 'const connectMyPoints = () => {', '\n  };', 'connectMyPoints'), /^const connectMyPoints = \(\) => \{\s*if \(!connectOffered\) return;/);
});

test('the workspace reports the support provided only when the plan is what put the button on screen', () => {
  const report = region(workspace, 'const connectShownByPlan =', '}, [connectShownByPlan, onSupportEvidence]);', 'provided report');
  assert.match(report, /^const connectShownByPlan = connectPointsProvidedByPlan\(\{ outcomesWithheld, keyboardAccess \}\)\s*&&/);
  // The same two conditions that render the two buttons.
  assert.match(report, /stage === 'construct' && !pointOnly && pointsCommitted/);
  assert.match(report, /stage === 'analysis' && inverseReflectionEnabled && inversePointsCommitted/);
  assert.match(report, /if \(connectShownByPlan\) onSupportEvidence\?\.\(\{ supportId: KEYBOARD_ACCESS_SUPPORT_ID, eventType: 'provided' \}\);/);
});

test('QuestionEngine gives every graph workspace the student\'s keyboard-access support, the workflow\'s graph steps included', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const props = region(engine, 'const graphModuleProps = {', '\n  };', 'graphModuleProps');
  assert.match(props, /\n\s*revealPointCorrectness: showOutcomeFeedback,/);
  assert.match(props, /\n\s*keyboardAccess: supportPresentation\.keyboardAccess === true,/);
  assert.match(props, /\n\s*onSupportEvidence: reportToolEvidence,/);
  assert.match(engine, /const supportPresentation = useMemo\(\n\s*\(\) => processedQuestion\?\.supportPresentation \|\| getStudentSupportPresentation\(stableStudentProfile\),/);
  assert.match(engine, /const reportToolEvidence = useCallback\(\(evidence\) => onSupportEvidenceRef\.current\?\.\(evidence\), \[\]\);/);
  for (const module of ['FunctionGraphBuilder', 'GraphAnalysis']) {
    assert.match(engine, new RegExp(`return <${module} \\{\\.\\.\\.commonModuleProps\\} \\{\\.\\.\\.graphModuleProps\\} />;`), module);
  }
  const runnerElement = region(engine, '<WorkflowRunner\n', '/>', 'WorkflowRunner element');
  assert.match(runnerElement, /keyboardAccess=\{graphModuleProps\.keyboardAccess\}/);
  assert.match(runnerElement, /onSupportEvidence=\{graphModuleProps\.onSupportEvidence\}/);

  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  assert.match(region(runner, 'export default function WorkflowRunner({', '}) {', 'WorkflowRunner props'), /\n\s*keyboardAccess = false,\n\s*onSupportEvidence = null,\n/);
  const stageElement = region(region(runner, 'const renderStage = (stage, index', 'const promptAndScenario', 'renderStage'), '<StageBody', '/>', 'StageBody element');
  assert.match(stageElement, /keyboardAccess=\{keyboardAccess\}/);
  assert.match(stageElement, /onSupportEvidence=\{onSupportEvidence\}/);
  assert.match(region(runner, 'function StageBody(', 'switch (stage.kind)', 'StageBody'), /delegate\(\{[^}]*\bkeyboardAccess, onSupportEvidence\b[^}]*\}\)/);
  const delegates = region(region(runner, 'const DELEGATES = {', '\n};\n', 'DELEGATES'), '  coordinatePlot:', '  algebraWorkspace:', 'graph delegates');
  const workspaces = [...delegates.matchAll(/<InteractiveGraphWorkspace\b[\s\S]*?\/>/g)].map((match) => match[0]);
  assert.equal(workspaces.length, 2, 'both graph steps');
  workspaces.forEach((element) => {
    assert.match(element, /keyboardAccess=\{keyboardAccess\}/);
    assert.match(element, /onSupportEvidence=\{onSupportEvidence\}/);
  });
});
