// UNIVERSAL DESIGN (product decision 8): Vocabulary and Read aloud for every
// student outside assessments; never recorded as a plan support; assessments
// and translation unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SUPPORT_TOOL, UNIVERSAL_ACTIVITY_ROLES, toolsEntitlementFromPath, toolsEntitlementFromProfile,
} from '../../src/platform/language/supportToolsEntitlement.js';
import { pathDeliveryOf, supportToolsForItem, toolEvidenceRecords } from '../../src/platform/language/supportToolsModel.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-10-06T15:00:00Z');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const PROMPT = 'Find the slope of the line through the two points. What is the y-intercept?';

test('every student has Vocabulary and Read aloud in warm-ups, classwork and practice', () => {
  for (const activityRole of UNIVERSAL_ACTIVITY_ROLES) {
    const entitlement = toolsEntitlementFromProfile(null, { nowValue: NOW, activityRole, universalDesignRole: activityRole });
    assert.deepEqual(entitlement.tools, [SUPPORT_TOOL.VOCABULARY, SUPPORT_TOOL.READ_ALOUD], activityRole);
    assert.deepEqual(entitlement.universal, [SUPPORT_TOOL.VOCABULARY, SUPPORT_TOOL.READ_ALOUD]);
    assert.equal(entitlement.language, null, 'translation stays profile-based');
  }
});

test('assessments, and an unknown activity, add nothing', () => {
  for (const activityRole of ['quiz', 'test', 'dol', null, undefined, '']) {
    assert.deepEqual(toolsEntitlementFromProfile(null, { nowValue: NOW, activityRole, universalDesignRole: activityRole }).tools, [], String(activityRole));
  }
  // My Math Path asks with no role until its own bar can host the tools (wave 2).
  assert.deepEqual(toolsEntitlementFromPath({ applicableSupports: [] }).tools, []);
});

test('a plan support stays a plan support: not marked universal, still evidence', () => {
  const profile = buildSupportProjection({
    revisions: [{
      id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', modifications: [],
      accommodations: [{ id: 'text-to-speech', params: {}, appliesTo: [] }],
    }],
    todayKey: '2026-10-06',
  });
  const entitlement = toolsEntitlementFromProfile(profile, { nowValue: NOW, activityRole: 'practice', universalDesignRole: 'practice' });
  assert.deepEqual(entitlement.universal, [SUPPORT_TOOL.VOCABULARY]);
  const model = supportToolsForItem({ entitlement, prompt: PROMPT, speech: true });
  const evidence = toolEvidenceRecords(model, { surface: 'assignment' });
  assert.deepEqual(evidence.map((record) => record.supportId), ['text-to-speech'], 'only the plan support is evidence');
  // On a test the plan support is offered and nothing universal is.
  assert.deepEqual(toolsEntitlementFromProfile(profile, { nowValue: NOW, activityRole: 'test', universalDesignRole: 'test' }).tools, [SUPPORT_TOOL.READ_ALOUD]);
});

test('a universal tool is shown but never reported', () => {
  const entitlement = toolsEntitlementFromProfile(null, { nowValue: NOW, activityRole: 'classwork', universalDesignRole: 'classwork' });
  const model = supportToolsForItem({ entitlement, prompt: PROMPT, speech: true });
  assert.ok(model.tools.every((tool) => tool.universal === true));
  assert.ok(model.tools.some((tool) => tool.state === 'available'), 'something to show');
  assert.deepEqual(toolEvidenceRecords(model, { surface: 'assignment' }), []);
  assert.deepEqual(pathDeliveryOf(model, []).presented, []);
  const tray = executableSource(read('src/components/student/supportTools/SupportToolsTray.jsx'));
  assert.match(region(tray, 'const recordUse = (tool) => {', '};', 'recordUse'), /if \(tool\.universal\) return;/, 'opening one is not "used" evidence');
});

// Coordinator review, PR #454: QuestionEngine defaults a missing role to
// 'practice', so universal tools failed OPEN for a host that omitted it.
test('universal tools need the role the host declared, never a defaulted one', () => {
  assert.deepEqual(toolsEntitlementFromProfile(null, { nowValue: NOW, activityRole: 'practice' }).tools, [], 'a defaulted role grants nothing');
  assert.deepEqual(toolsEntitlementFromProfile(null, { nowValue: NOW, activityRole: 'practice', universalDesignRole: null }).tools, []);
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /<QuestionEngineBody key=\{resolutionAttempt\} \{\.\.\.props\} explicitActivityRole=\{activityRole \?\? null\}/, 'the wrapper passes the role exactly as given');
  assert.match(engine, /toolsEntitlementFromProfile\(stableStudentProfile, \{ activityRole, universalDesignRole: explicitActivityRole \}\)/);
});

test('without the plan support the assignment tray carries Read aloud itself', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /includeReadAloud=\{supportPresentation\.textToSpeech \? surface === 'enlarged' && readAloudOffered : true\}/);
});

// PR #454 (stagedQuestion, graphPointCheck): a universal-only tray above the
// work pushed a Chromebook's first step off screen and, loading late, moved the
// plane under the student's first tap. On a laptop it now follows the work; on
// a phone it stays in the task panel (beside the work in landscape).
test('a universal-only tray follows the work on a laptop and never moves it', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /supportTrayAfterWork=\{languageTools\.tools\.length > 0 && \(languageTools\.universal\?\.length \|\| 0\) === languageTools\.tools\.length\}/);
  const container = executableSource(read('src/components/student/MobileViewportContainer.jsx'));
  assert.match(container, /\{!workspaceActive && supportTray && !supportTrayAfterWork && <div className="mathmaster-question-support-tray">/, 'not above the work on a laptop');
  assert.match(region(container, '<main className="math-tool-workspace">', '</main>\n', 'the workspace') + container.slice(container.indexOf('</main>\n'), container.indexOf('</main>\n') + 200),
    /<\/main>\s*\{supportTray && supportTrayAfterWork && !isMobile && <div className="mathmaster-question-support-tray mathmaster-question-support-tray--after">/, 'after it instead');
});
