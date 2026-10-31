/*
 * GOOGLE CLASSROOM'S SIGN-IN RESULT IS SHOWN ONCE AND LEAVES THE ADDRESS (TT06).
 *
 * The OAuth callback sends the teacher back with `?classroomConnected=1` or
 * `?classroomError=<reason>`. Those stayed in the address bar for the rest of
 * the visit, and the Classroom screen showed the same result every time it was
 * opened. The screen now takes the result out of the address as it reads it.
 *
 * The address logic is plain functions, run here against a stand-in for the
 * page's window; the screens are .jsx, so their wiring is asserted on source,
 * bound to the effect that does the work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classroomSignInReturn,
  searchWithoutClassroomSignIn,
  takeClassroomSignInReturn,
} from '../../src/platform/classroom/classroomSignInReturn.js';
import { searchWithoutLaunch } from '../../src/app/routes/appUrl.js';
import { componentSource, region } from './helpers/sourceContract.mjs';

// A stand-in for the page: an address, a history entry's state, and every
// replaceState call. A rewrite moves the stand-in's address, as a browser's does.
const pageAt = (address, { state = { route: 'home' }, failReplace = false } = {}) => {
  const url = new URL(address, 'https://mathmaster.test');
  const calls = [];
  const win = {
    location: {
      get pathname() { return url.pathname; },
      get search() { return url.search; },
      get hash() { return url.hash; },
    },
    history: {
      state,
      replaceState(nextState, title, next) {
        if (failReplace) throw new Error('blocked');
        calls.push({ state: nextState, title, url: next });
        const moved = new URL(next, 'https://mathmaster.test');
        url.pathname = moved.pathname;
        url.search = moved.search;
        url.hash = moved.hash;
      },
    },
  };
  return { win, calls, current: () => `${url.pathname}${url.search}${url.hash}` };
};

test('the sign-in result is read from the address', () => {
  assert.deepEqual(classroomSignInReturn('?classroomConnected=1'), { connected: true, error: '' });
  assert.deepEqual(classroomSignInReturn('?classroomError=access_denied'), { connected: false, error: 'access_denied' });
  assert.deepEqual(classroomSignInReturn('?reset=1&classroomConnected=1&x=y'), { connected: true, error: '' });
  assert.deepEqual(classroomSignInReturn(''), { connected: false, error: '' });
  assert.deepEqual(classroomSignInReturn(undefined), { connected: false, error: '' });
  assert.deepEqual(classroomSignInReturn('?reset=1'), { connected: false, error: '' });
});

test('removing the result leaves every other parameter, in its order', () => {
  assert.equal(searchWithoutClassroomSignIn('?classroomConnected=1'), '');
  assert.equal(searchWithoutClassroomSignIn('?classroomError=token_exchange_failed'), '');
  assert.equal(searchWithoutClassroomSignIn('?a=1&classroomConnected=1&b=2'), '?a=1&b=2');
  assert.equal(searchWithoutClassroomSignIn('?classroomError=x&classroomConnected=1&reset=1'), '?reset=1');
  assert.equal(searchWithoutClassroomSignIn('?reset=1'), '?reset=1');
  assert.equal(searchWithoutClassroomSignIn(''), '');
});

test('taking the result reads it and rewrites the address once, keeping the path, the rest of the query, the hash and the history state', () => {
  const page = pageAt('/teacher/classroom?classroomConnected=1&reset=1#top', { state: { route: 'classroom' } });
  assert.deepEqual(takeClassroomSignInReturn(page.win), { connected: true, error: '' });
  assert.equal(page.calls.length, 1, 'one rewrite');
  assert.deepEqual(page.calls[0].state, { route: 'classroom' }, 'the history entry keeps its state (replace, not a new entry)');
  assert.equal(page.current(), '/teacher/classroom?reset=1#top');

  // The screen opened again later in the visit: nothing to show, nothing rewritten.
  assert.deepEqual(takeClassroomSignInReturn(page.win), { connected: false, error: '' });
  assert.equal(page.calls.length, 1, 'taken once');

  const failure = pageAt('/?classroomError=access_denied');
  assert.deepEqual(takeClassroomSignInReturn(failure.win), { connected: false, error: 'access_denied' });
  assert.equal(failure.current(), '/');
});

test('a page with no sign-in result is left alone, and a blocked rewrite or no window never throws', () => {
  const plain = pageAt('/teacher/classroom?reset=1');
  assert.deepEqual(takeClassroomSignInReturn(plain.win), { connected: false, error: '' });
  assert.equal(plain.calls.length, 0);

  const blocked = pageAt('/?classroomConnected=1', { failReplace: true });
  assert.deepEqual(takeClassroomSignInReturn(blocked.win), { connected: true, error: '' }, 'the result is still shown this once');

  assert.deepEqual(takeClassroomSignInReturn(null), { connected: false, error: '' });
  assert.deepEqual(takeClassroomSignInReturn({}), { connected: false, error: '' });
});

test('the address still carries the result to a Classroom screen opened after other screens (the other half of the design)', () => {
  // appUrl.js drops launch parameters on arrival but keeps these two, so a
  // teacher who lands on Home and opens Classroom later still sees the result.
  assert.equal(searchWithoutLaunch('?classroomConnected=1'), '?classroomConnected=1');
  assert.equal(searchWithoutLaunch('?classroomError=access_denied&launch=a1'), '?classroomError=access_denied');
});

test('the Classroom screens take the result out of the address as they show it', () => {
  const manager = componentSource('src/ClassroomManagerV2.jsx');
  const mount = region(manager, "const signIn = takeClassroomSignInReturn();", 'refreshManagerData().catch', 'manager mount effect');
  assert.match(mount, /if \(signIn\.connected\) setStatus\(/);
  assert.match(mount, /if \(signIn\.error\) setError\(`Google Classroom connection failed: \$\{signIn\.error\}`\);/);
  assert.doesNotMatch(manager, /params\.get\('classroomConnected'\)/, 'the manager no longer reads the parameter and leaves it in the address');

  const legacy = componentSource('src/ClassroomSync.jsx');
  assert.match(legacy, /const signIn = takeClassroomSignInReturn\(\);/);
  assert.doesNotMatch(legacy, /params\.get\('classroomConnected'\)/);
});
