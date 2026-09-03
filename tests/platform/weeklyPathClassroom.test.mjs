import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  WEEKLY_PATH_MARKER_PREFIX,
  weeklyPathMarker,
  weeklyPathTitle,
  weeklyPathDescription,
  weeklyPathCourseWork,
  weeklyPathPoints,
  weeklyPathPublishDecision,
} = require('../../functions/lib/weeklyPathClassroom.js');

test('one class-week has exactly one identity, and it lives in the post', () => {
  // The scheduled job is retried, overlaps itself, and gets re-run by hand. If
  // the weekly post cannot be recognised, every one of those creates another.
  const marker = weeklyPathMarker({ classId: 'c1', weekKey: '2026-W36' });
  assert.ok(marker.startsWith(WEEKLY_PATH_MARKER_PREFIX));
  assert.equal(marker, weeklyPathMarker({ classId: 'c1', weekKey: '2026-W36' }));

  assert.notEqual(marker, weeklyPathMarker({ classId: 'c2', weekKey: '2026-W36' }));
  assert.notEqual(marker, weeklyPathMarker({ classId: 'c1', weekKey: '2026-W37' }));

  // The marker is embedded in the description, so it survives a teacher
  // deleting and recreating our Firestore record.
  const description = weeklyPathDescription({ classId: 'c1', weekKey: '2026-W36', goalSessions: 4 });
  assert.ok(description.includes(marker));
});

test('incomplete identity produces nothing rather than an anonymous post', () => {
  assert.equal(weeklyPathMarker({ classId: '', weekKey: '2026-W36' }), null);
  assert.equal(weeklyPathMarker({ classId: 'c1' }), null);
  assert.equal(weeklyPathMarker({}), null);
  assert.equal(weeklyPathDescription({ classId: 'c1' }), null);
  assert.equal(weeklyPathCourseWork({ weekKey: '2026-W36' }), null);
});

test('what the student reads in Classroom matches what the Path tells them', () => {
  // A student who opens Classroom and reads something stricter than the app
  // would reasonably conclude the app was lying to them.
  const description = weeklyPathDescription({
    classId: 'c1', weekKey: '2026-W36', goalSessions: 4, launchUrl: 'https://mathmaster-aleks.web.app',
  });
  assert.match(description, /4 practice sessions/);
  assert.match(description, /any order/i);
  assert.match(description, /swap in a different skill/i);
  assert.match(description, /https:\/\/mathmaster-aleks\.web\.app/);

  assert.match(weeklyPathDescription({ classId: 'c1', weekKey: 'w', goalSessions: 1 }), /1 practice session\b/);
});

test('the coursework request is complete and titled for a human', () => {
  const work = weeklyPathCourseWork({
    classId: 'c1', weekKey: '2026-W36', weekLabel: 'Sep 1', goalSessions: 4,
    launchUrl: 'https://mathmaster-aleks.web.app', maxPoints: 50,
  });
  assert.equal(work.title, 'Math Path — week of Sep 1');
  assert.equal(work.maxPoints, 50);
  assert.ok(work.description.includes(work.marker));

  assert.equal(weeklyPathTitle({}), 'Math Path — weekly practice');
  assert.equal(weeklyPathCourseWork({ classId: 'c1', weekKey: 'w' }).maxPoints, 100);
});

test('a 0-100 score converts onto the coursework scale without drifting', () => {
  assert.equal(weeklyPathPoints({ score: 100 }), 100);
  assert.equal(weeklyPathPoints({ score: 85 }), 85);
  assert.equal(weeklyPathPoints({ score: 85, maxPoints: 50 }), 42.5);
  assert.equal(weeklyPathPoints({ score: 0 }), 0);

  // Out-of-range input is clamped, never sent through as a wild grade.
  assert.equal(weeklyPathPoints({ score: 140 }), 100);
  assert.equal(weeklyPathPoints({ score: -20 }), 0);
  // Number(null) and Number('') are both 0. Without a strict guard, "this
  // student has no score" published to their family as a zero.
  assert.equal(weeklyPathPoints({ score: null }), null);
  assert.equal(weeklyPathPoints({ score: undefined }), null);
  assert.equal(weeklyPathPoints({ score: '' }), null);
  assert.equal(weeklyPathPoints({ score: false }), null);
  assert.equal(weeklyPathPoints({ score: 'nope' }), null);
  assert.equal(weeklyPathPoints({}), null);
  // A real zero is still a real zero.
  assert.equal(weeklyPathPoints({ score: 0 }), 0);
});

test('automatic publishing refuses every case a reviewing teacher would have caught', () => {
  const base = { enabled: true, linked: true, weekEnded: true, score: 88 };
  assert.deepEqual(weeklyPathPublishDecision(base), { publish: true, reason: null });

  // Publishing is off for the class until someone turns it on.
  assert.equal(weeklyPathPublishDecision({ ...base, enabled: false }).publish, false);
  assert.match(weeklyPathPublishDecision({}).reason, /not_enabled/);

  // No Classroom account to write to.
  assert.match(weeklyPathPublishDecision({ ...base, linked: false }).reason, /not_linked/);

  // Mid-week grades would tell a parent a student is failing a week they still
  // have days left to finish.
  assert.match(weeklyPathPublishDecision({ ...base, weekEnded: false }).reason, /not_over_yet/);

  // Nothing to publish is not the same as a zero, for every shape of "nothing".
  for (const empty of [null, undefined, '', false]) {
    const decision = weeklyPathPublishDecision({ ...base, score: empty });
    assert.equal(decision.publish, false, `score ${String(empty)} must not publish`);
    assert.match(decision.reason, /no_weekly_score/);
  }
  // A student who genuinely earned zero is a different case and does publish.
  assert.equal(weeklyPathPublishDecision({ ...base, score: 0 }).publish, true);
});

test('a teacher edit in Classroom outranks the platform, permanently', () => {
  const base = { enabled: true, linked: true, weekEnded: true, score: 88 };
  const decision = weeklyPathPublishDecision({ ...base, teacherEdited: true });
  assert.equal(decision.publish, false);
  assert.match(decision.reason, /teacher_already_changed/);
});

test('re-running the job does not rewrite a score that is already there', () => {
  const base = { enabled: true, linked: true, weekEnded: true, score: 88 };
  assert.equal(weeklyPathPublishDecision({ ...base, alreadyPublishedScore: 88 }).publish, false);
  // A genuinely changed score still goes out — a student who finished late must
  // not be frozen at their mid-week number.
  assert.equal(weeklyPathPublishDecision({ ...base, alreadyPublishedScore: 60 }).publish, true);
  assert.equal(weeklyPathPublishDecision({ ...base, alreadyPublishedScore: null }).publish, true);
});

test('the module stays pure so grade writes can be tested without a live course', () => {
  const source = require('node:fs').readFileSync('functions/lib/weeklyPathClassroom.js', 'utf8');
  assert.doesNotMatch(source, /require\("googleapis"\)|firebase-admin|getFirestore|fetch\(/);
});
