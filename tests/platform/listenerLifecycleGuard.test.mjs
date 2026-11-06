import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeListenerOwnership } from './helpers/listenerOwnership.mjs';
import { watchReportUntilWritten } from '../../src/platform/liveChallenge/challengeReportWatch.js';
import { watchClassMemory } from '../../functions/shared/liveChallengeClassMemory.mjs';

// EVERY REAL-TIME LISTENER HAS AN OWNER AND A CLEANUP (Job 5).
//
// A listener that is opened on navigation and never closed is how a dashboard
// grows to gigabytes: each visit adds another live query, another copy of the
// data, another callback re-rendering an unmounted screen. Today every
// Firestore listener in MathMaster is released by its owner. This guard keeps
// it that way (the rule, in full: helpers/listenerOwnership.mjs):
//
//   - a service opens a listener only to RETURN its unsubscribe from a
//     watch…/subscribe… function (the caller owns it, and its call is held to
//     this same rule), or keeps it in a local that its returned cleanup calls;
//   - a component opens one, directly or through a watch…/subscribe… service,
//     only as the return value of a useEffect, or into a local (or an array of
//     them) that the SAME effect's cleanup releases;
//   - a listener returned from a callback goes to a documented owner (below),
//     which keeps it and releases it.
//
// Names are resolved by scope: another effect's `unsubscribe()` later in the
// file does not release this effect's listener. The guard used to accept that.

const files = [];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) walk(full);
  else if (/\.(jsx?|mjs)$/.test(full)) files.push(full.split(path.sep).join('/'));
});
walk('src');

// A listener returned from a callback that one of these calls (`owner({ key:
// (…) => onSnapshot(…) })`). The owner keeps what the callback returns and
// releases it; the last test below checks each one does.
const DOCUMENTED_OWNERS = Object.freeze({
  'watchReportUntilWritten.listen': 'closes the report listener at the first report, or when the room is left (src/platform/liveChallenge/challengeReportWatch.js)',
  'watchClassMemory.listen': 'returns the class memory listener to watchClassGameMemory, whose cleanup calls it (functions/shared/liveChallengeClassMemory.mjs)',
});

const verdictOf = (source, name) => {
  const { calls } = analyzeListenerOwnership(source, { documentedOwners: DOCUMENTED_OWNERS });
  const call = calls.find((entry) => entry.name === name);
  assert.ok(call, `${name} is found`);
  return call;
};

test('every Firestore listener and subscription is released by its own effect or function, or returned to an owner', () => {
  const problems = [];
  const ownersUsed = new Set();
  let calls = 0;
  for (const file of files) {
    if (file.endsWith('.test.mjs')) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (!/onSnapshot\(|(?:watch|subscribe)[A-Z]\w*\(/.test(source)) continue;
    // Local event buses (subscribeToQuestionDrafts, watchReducedMotion) are
    // held to the same rule: a subscription is a subscription.
    for (const call of analyzeListenerOwnership(source, { documentedOwners: DOCUMENTED_OWNERS }).calls) {
      calls += 1;
      if (call.documentedOwner) ownersUsed.add(call.documentedOwner);
      if (!call.owned) problems.push(`${file}:${call.line} ${call.name}: ${call.why}`);
    }
  }
  assert.ok(calls >= 80, `the guard found the listeners (${calls})`);
  assert.deepEqual(problems, []);
  assert.deepEqual([...ownersUsed].sort(), Object.keys(DOCUMENTED_OWNERS).sort(), 'every documented owner is still in use');
});

test('the guard flags each listener its own cleanup does not release, even with a release later in the file', () => {
  const source = fs.readFileSync('tests/platform/fixtures/listenerOwnership.jsx', 'utf8');
  const marked = source.split('\n').flatMap((text, index) => (text.endsWith('// leak') ? [index + 1] : []));
  const { calls } = analyzeListenerOwnership(source);
  assert.equal(marked.length, 5, 'the fixture marks its five leaks');
  assert.deepEqual(calls.filter((call) => !call.owned).map((call) => call.line), marked);
  assert.equal(calls.filter((call) => call.owned).length, 9, 'and its nine owned listeners pass');
  const byLine = new Map(calls.map((call) => [call.line, call.why]));
  assert.match(byLine.get(marked[0]), /never released by its own effect's or function's cleanup: unsubscribe/, 'another effect\'s unsubscribe() releases nothing here');
  assert.match(byLine.get(marked[1]), /never released/, 'nor does a release in the listener\'s own error callback');
  assert.match(byLine.get(marked[2]), /returned from a callback passed to then\(\)/);
  assert.match(byLine.get(marked[3]), /an array of listeners that nothing keeps/);
  assert.match(byLine.get(marked[4]), /returned from roomListener\(\)/);
});

test('a subscription made through the teacher kit is owned only when it is returned', () => {
  const owned = `
    useEffect(() => {
      if (!teacherKit) return undefined;
      return teacherKit.subscribeStudentSupportEvents({ db, onChange: setEvents });
    }, [teacherKit]);
  `;
  assert.equal(verdictOf(owned, 'subscribeStudentSupportEvents').owned, true);
  const dropped = `
    useEffect(() => {
      teacherKit.subscribeStudentSupportEvents({ db, onChange: setEvents });
    }, [teacherKit]);
  `;
  assert.match(verdictOf(dropped, 'subscribeStudentSupportEvents').why, /unowned/);
});

test('the guard catches a listener opened and never released', () => {
  const leaked = `
    useEffect(() => {
      const unsubscribe = onSnapshot(doc(db, 'x', id), setX);
    }, [id]);
  `;
  assert.match(verdictOf(leaked, 'onSnapshot').why, /never released/);
  const fine = `
    useEffect(() => {
      const unsubscribe = onSnapshot(doc(db, 'x', id), setX);
      return () => unsubscribe();
    }, [id]);
  `;
  assert.equal(verdictOf(fine, 'onSnapshot').owned, true);
});

test('a local declared earlier and assigned after a lazy import is released only by a cleanup that calls it', () => {
  const kept = `
    export const watchThing = (id, onValue) => {
      let stop = null;
      import('./thing.mjs').then(({ watchThingNow }) => {
        stop = watchThingNow({ id, onValue });
      });
      return () => { stop?.(); };
    };
  `;
  assert.equal(verdictOf(kept, 'watchThingNow').owned, true);
  const dropped = `
    export const watchThing = (id, onValue) => {
      let stop = null;
      import('./thing.mjs').then(({ watchThingNow }) => {
        stop = watchThingNow({ id, onValue });
      });
      return () => {};
    };
  `;
  assert.match(verdictOf(dropped, 'watchThingNow').why, /never released by its own effect's or function's cleanup: stop/);
});

test('a listener returned from a callback is owned only by a documented owner', () => {
  const service = (owner) => `
    export const watchThing = (id, onValue) => {
      let stop = null;
      import('./thing.mjs').then((module) => {
        stop = module.${owner}({ onValue, listen: (next, fail) => onSnapshot(doc(db, 'things', id), next, fail) });
      });
      return () => { stop?.(); };
    };
  `;
  const documented = verdictOf(service('watchReportUntilWritten'), 'onSnapshot');
  assert.equal(documented.documentedOwner, 'watchReportUntilWritten.listen');
  assert.match(verdictOf(service('watchSomethingElse'), 'onSnapshot').why, /returned from listen\(\), where nothing releases it/);
});

test('each documented owner releases the listener its callback returns', () => {
  const open = new Set();
  const listen = () => {
    const listener = {};
    open.add(listener);
    return () => open.delete(listener);
  };
  const leaveReport = watchReportUntilWritten({ listen, onValue() {} });
  assert.equal(open.size, 1, 'the report watch opens its listener');
  leaveReport();
  assert.equal(open.size, 0, 'and leaving the room closes it');
  const stopMemory = watchClassMemory({ classId: 'class-1', game: 'rush', listen, onValue() {} });
  assert.equal(open.size, 1, 'the class memory watch opens its listener');
  stopMemory();
  assert.equal(open.size, 0, 'and hands back the function that closes it');
  assert.deepEqual(Object.keys(DOCUMENTED_OWNERS).sort(), ['watchClassMemory.listen', 'watchReportUntilWritten.listen'], 'a new documented owner gets its check here');
});
