import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { region } from './helpers/sourceContract.mjs';

/*
 * EVERY FILE THAT MOVES SAYS WHAT IT DOES FOR A STUDENT WHO ASKED FOR LESS
 * (VH-20, CI01).
 *
 * Reduced motion had been checked at the sites someone knew of
 * (studentMotionAndDevices, studentA11yPolish), and a new unguarded site had
 * already appeared once (VH-19). This is the first inventory of the rest, and a
 * ratchet on it. It reads src/ as text and finds every place a file starts
 * motion: a CSS animation or @keyframes, an inline animation style, a Web
 * Animations call, a smooth scroll. A file that starts motion must say
 * something about the student's preference (a prefers-reduced-motion rule, the
 * reducedMotion helpers, scrollMotion()); a file that says nothing must be
 * listed below, with why.
 *
 * WHAT THIS CAN AND CANNOT TELL. It reads text. A file that names the
 * preference has a guard for something, which is not the same as a guard for
 * every site in it, and a motion that is a CSS transition (a hover, a colour) is
 * not looked for at all. It catches the new file with a new animation and no
 * word about reduced motion anywhere, which is how VH-19 got in.
 *
 * Inventory of 2026-10-25: 18 files start motion, 11 name the preference, and
 * the 7 that do not are the ones listed. Three of them are guarded in another
 * file (checked below), one is a colour-only outline fade that is meant to stay,
 * and four are teacher screens whose smooth scroll is still open (VPAT 2.2.2).
 */

const root = new URL('../../src/', import.meta.url);
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

const MOTION = /@keyframes|animation(-name)?\s*:|animation[A-Z]\w*\s*:|\.animate\(|behavior:\s*['"]smooth['"]|scrollIntoView\(\{[^}]*smooth/;
const GUARD = /prefers-reduced-motion|reducedMotion|prefersReducedMotion|watchReducedMotion|scrollMotion/;

const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const startsMotion = (text) => MOTION.test(withoutComments(text));
const namesPreference = (text) => GUARD.test(text);

const read = (relative) => readFileSync(new URL(relative, root), 'utf8');
const filesThatMove = () => walk(new URL(root).pathname)
  .filter((file) => /\.(css|jsx|js)$/.test(file))
  .filter((file) => startsMotion(readFileSync(file, 'utf8')))
  .map((file) => path.relative(new URL(root).pathname, file));

// Files that start motion and say nothing about the preference, each with why.
// `check` proves a claim that the guard lives in another file; `open` marks a gap.
const SAYS_NOTHING = {
  'components/liveChallenge/ChallengeShellParts.jsx': {
    why: 'the results confetti: its pieces are .mm-shell-confetti, which challengeShellCss.js hides under reduced motion',
    check: () => assert.match(region(read('components/liveChallenge/challengeShellCss.js'), '@media (prefers-reduced-motion: reduce) {', '\n}', 'the shell\'s reduced-motion rules'), /\.mm-shell-confetti \{ display: none; \}/),
  },
  'components/liveChallenge/LiveChallengeStudent.jsx': {
    why: 'the last-seconds pulse (challengePulse): App.css switches any element with that animation off under reduced motion',
    check: () => assert.match(region(read('App.css'), '@media (prefers-reduced-motion: reduce) {\n  [style*="challengePulse"]', '\n}', 'the pulse rule'), /\[style\*="challengePulse"\] \{ animation: none !important; \}/),
  },
  'tools/representationBridge/LinearMultipleRepresentationsBoard.css': {
    why: 'the outline that shows what Undo changed fades box-shadow colour only, with no movement, and says in the file that it stays under reduced motion',
    check: () => assert.match(read('tools/representationBridge/LinearMultipleRepresentationsBoard.css'), /a change of colour, not of position[\s\S]{0,40}stays under reduced motion/),
  },
  'App.jsx': { why: 'OPEN: a smooth scroll to the teacher\'s assignment card (VPAT 2.2.2 lists the teacher screens\' scrolls as still open)', open: true },
  'AssignmentQuestionEditorBase.jsx': { why: 'OPEN: two smooth scrolls in the teacher\'s question editor', open: true },
  'TeacherHome.jsx': { why: 'OPEN: a smooth scroll to the live-session card on the teacher\'s Home', open: true },
  'components/teacher/LessonPreflightModal.jsx': { why: 'OPEN: two smooth scrolls in the teacher\'s pre-flight review', open: true },
};

test('the scan can tell a moving file from a still one, and a guarded one from an unguarded one', () => {
  assert.equal(startsMotion('.a { animation: spin 1s linear infinite; }'), true);
  assert.equal(startsMotion('@keyframes spin { to { transform: rotate(1turn); } }'), true);
  assert.equal(startsMotion("el.scrollIntoView({ behavior: 'smooth' });"), true);
  assert.equal(startsMotion("el.scrollIntoView({ behavior: scrollMotion() });"), false, 'a scroll that asks the preference is not a smooth scroll');
  assert.equal(startsMotion('const style = { animationDuration: "2s" };'), true);
  assert.equal(startsMotion('// animation: none was the old rule\nconst x = 1;'), false, 'a comment moves nothing');
  assert.equal(startsMotion('.a { transition: color .2s; }'), false, 'a transition is not looked for');
  assert.equal(namesPreference('@media (prefers-reduced-motion: reduce) { .a { animation: none; } }'), true);
  assert.equal(namesPreference("behavior: scrollMotion()"), true);
  assert.equal(namesPreference('.a { animation: spin 1s; }'), false);
});

test('a file under src/ that starts motion names the reduced-motion preference, or is listed with why', () => {
  const unlisted = filesThatMove().filter((file) => !namesPreference(read(file)) && !SAYS_NOTHING[file]);
  assert.deepEqual(unlisted, [], `${unlisted.join(', ')} start motion and say nothing about prefers-reduced-motion. Guard the motion (a @media (prefers-reduced-motion: reduce) rule, or scrollMotion() for a scroll), or list the file in SAYS_NOTHING with why it is safe.`);
});

test('every file listed as saying nothing still moves and still says nothing, and each claim of a guard elsewhere holds', () => {
  const moving = new Set(filesThatMove());
  for (const [file, entry] of Object.entries(SAYS_NOTHING)) {
    assert.ok(moving.has(file), `${file} no longer starts motion: take it off the list`);
    assert.equal(namesPreference(read(file)), false, `${file} names the preference now: take it off the list`);
    if (entry.check) entry.check();
    else assert.equal(entry.open, true, `${file} has neither a check nor an OPEN mark`);
  }
});
