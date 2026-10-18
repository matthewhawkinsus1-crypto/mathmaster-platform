/*
 * NAV-19 (student pass 3): every wait line a student reads says WHEN, in one
 * set of words (src/platform/student/studentWhen.js): "2:15 PM" today,
 * "Wed, Oct 21, 2:15 PM" another day, "Wed, Oct 21" for a class day — never a
 * stored key ("2026-10-21"), never "Not set", and never "at the scheduled
 * time" when the time is known.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  describeWhen, formatWhenDateKey, opensWhenPhrase, whenDateTimeText,
} from '../../src/platform/student/studentWhen.js';
import { describeTestCycleForStudent } from '../../src/platform/student/testCycleDiscovery.js';
import { describeSectionAccess } from '../../src/platform/student/assignmentNavigator.js';
import { SECTION_STATE, describeSectionWait } from '../../src/platform/student/lessonSections.js';
import { executableSource } from './helpers/sourceContract.mjs';

const NOW = new Date(2026, 9, 18, 13, 30).getTime(); // Sun, Oct 18 2026, 1:30 PM local
const TODAY_215 = new Date(2026, 9, 18, 14, 15).getTime();
const WED_215 = new Date(2026, 9, 21, 14, 15).getTime();
const DAY_RE = /^Wed, Oct 21, 2:15\s?PM$/;

test('NAV-19: one formatter — the time alone today, the day and time otherwise, the year only when it differs', () => {
  assert.deepEqual(describeWhen(TODAY_215, { nowValue: NOW }).sameDay, true);
  assert.match(describeWhen(TODAY_215, { nowValue: NOW }).text, /^2:15\s?PM$/);
  assert.match(describeWhen(WED_215, { nowValue: NOW }).text, DAY_RE);
  assert.match(describeWhen(new Date(2027, 0, 6, 9, 0).getTime(), { nowValue: NOW }).text, /2027/);
  assert.match(opensWhenPhrase(TODAY_215, { nowValue: NOW }), /^at 2:15\s?PM$/);
  assert.match(opensWhenPhrase(WED_215, { nowValue: NOW }), /^on Wed, Oct 21, 2:15\s?PM$/);
  assert.equal(opensWhenPhrase(null, { nowValue: NOW }), '');
  assert.equal(formatWhenDateKey('2026-10-21', { now: new Date(NOW) }), 'Wed, Oct 21');
  assert.equal(whenDateTimeText(undefined), '', 'no date is no words, never "Not set"');
  assert.match(whenDateTimeText({ toMillis: () => WED_215 }), /Wed, Oct 21/);
});

const cycle = { id: 'tc', title: 'Unit 3 Test', assessmentPolicy: { mode: 'testCycle' }, sections: [] };

test('NAV-19: a Test Cycle before release says when Review and Test open', () => {
  const later = describeTestCycleForStudent({ assignment: { ...cycle, releaseAt: WED_215 }, nowValue: NOW });
  assert.equal(later.key, 'opensLater');
  assert.match(later.detail, /^Review and Test open on Wed, Oct 21, 2:15\s?PM\.$/);
  assert.doesNotMatch(later.detail, /scheduled time/);
  const today = describeTestCycleForStudent({ assignment: { ...cycle, releaseAt: TODAY_215 }, nowValue: NOW });
  assert.match(today.detail, /^Review and Test open at 2:15\s?PM\.$/);
});

test('NAV-19: the navigator and Home wait lines name the day with its month, never a bare weekday or a key', () => {
  const access = describeSectionAccess({ role: 'warmup', label: 'Warm-Up', nowValue: NOW, warmupState: { enabled: true, status: 'waiting', opensAt: new Date(WED_215) } });
  assert.match(access.short, /^Opens Wed, Oct 21, 2:15\s?PM$/, 'another day carries its date (was "Opens Wed 2:15 PM")');
  const key = describeSectionAccess({ role: 'dol', label: 'the Exit ticket (DOL)', timedDol: true, nowValue: NOW, dolState: { enabled: true, status: 'notToday', instructionDateKey: '2026-10-21' } });
  assert.equal(key.short, 'Opens Wed, Oct 21');
  assert.equal(describeSectionWait({ label: 'DOL', state: SECTION_STATE.OPENS_LATER, opensOn: '2026-10-21' }), 'DOL opens in class on Wed, Oct 21');
  assert.match(describeSectionWait({ label: 'DOL', state: SECTION_STATE.OPENS_LATER, opensAt: new Date(WED_215) }, { nowValue: NOW }), /^DOL opens Wed, Oct 21, 2:15\s?PM$/);
});

test('NAV-19: every student screen that prints an opening time uses the shared words', () => {
  const home = executableSource(readFileSync(new URL('../../src/components/student/StudentDashboardView.jsx', import.meta.url), 'utf8'));
  // The card behind earlier classwork: the shared formatter, and no clause when there is no date.
  assert.match(home, /const earlierWorkWaitLine = \(releaseAt\) => \{\s*const at = whenDateTimeText\(releaseAt\);\s*return at \?/);
  assert.match(home, /access\.open === false \? earlierWorkWaitLine\(assignment\.releaseAt\)/);
  assert.doesNotMatch(home, /or on \$\{formatDateTime/);
  const card = executableSource(readFileSync(new URL('../../src/components/student/TestCycleCard.jsx', import.meta.url), 'utf8'));
  assert.match(card, /Opens \{describeWhen\(availability\.opensAt\)\.text\}\./);
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{ whenDateTimeText \} from '\.\/platform\/student\/studentWhen\.js';/);
  assert.equal((app.match(/opensAtText: whenDateTimeText\(assignmentData\.releaseAt\)/g) || []).length, 2, 'both "not open yet" notices');
});
