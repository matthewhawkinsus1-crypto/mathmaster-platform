// "EXTRA ATTEMPTS" IS A MY MATH PATH SUPPORT, AND EVERYTHING THAT SAYS SO AGREES.
//
// FB13 (audit A3-90). A case manager who reads "Extra attempts" in a support
// plan may expect it on classroom work. It is not wired there, on purpose
// (the reasons and what building it would take are written at
// functions/shared/attemptPolicy.mjs resolveQuestionMaximumAttempts): an
// assignment's attempt limit is worked out at fifteen call sites that must
// agree to the last try, and the classes with one try are where a standing
// extra try needs a flow of its own.
//
// What this file pins is that the words match the behaviour. The label a
// teacher ticks says "My Math Path", the support report says "not recorded in
// assignments", the gradebook's DOL row tells the teacher when a plan lists
// the support, and only My Math Path code asks for the extra try. Wire it
// anywhere else and these fail together, so the label, the report and the row
// change with the behaviour instead of staying behind it.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { supportById, supportLabel } from '../../functions/shared/supportCatalog.mjs';
import { NOT_RECORDED_IN_ASSIGNMENTS, supportHeadline } from '../../src/platform/supportEvidence/supportEvidenceReport.js';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);

let vite;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const sourceFiles = (relativeDir) => {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(`${dir}/`, ROOT), { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (/\.(?:js|jsx|mjs)$/.test(entry.name)) out.push(child);
    }
  };
  walk(relativeDir);
  return out;
};

// --- the words a teacher and a report use ------------------------------------

test('the support a teacher ticks is labelled for My Math Path, and the report says it is not recorded in assignments', () => {
  const entry = supportById('extra-attempts');
  assert.ok(entry, 'the catalog still has the support');
  assert.match(supportLabel('extra-attempts'), /My Math Path/);
  assert.ok(
    NOT_RECORDED_IN_ASSIGNMENTS.has('extra-attempts'),
    'the support report treats extra attempts as having no assignment record',
  );
  assert.equal(
    supportHeadline({ supportId: 'extra-attempts', automation: 'automatic', measurable: ['provided'], recordedInAssignments: !NOT_RECORDED_IN_ASSIGNMENTS.has('extra-attempts') }),
    'Not recorded in assignments (My Math Path)',
  );
});

// --- only My Math Path asks for the extra try --------------------------------

test('only My Math Path code asks a plan for the extra try', () => {
  // Who names the plan's attempt count: functions/shared/supportEntitlements.mjs
  // defines it; the Path server issues questions with it (mathPath.js adds it
  // to a Path question's tries, index.js records it on the Path question);
  // toolSupportMatrix.js says which tools it reaches. Nothing that counts a
  // classroom assignment's attempts is on this list.
  const expected = [
    'functions/index.js',
    'functions/lib/mathPath.js',
    'functions/shared/supportEntitlements.mjs',
    'src/platform/supports/toolSupportMatrix.js',
  ];
  const asksForIt = /\battemptsWithEntitlements\b|\bSUPPORT\.EXTRA_ATTEMPTS\b|\bentitlements\??\.extraAttempts\b/;
  const askers = [...sourceFiles('src'), ...sourceFiles('functions')]
    .filter((file) => asksForIt.test(executableSource(readFileSync(new URL(file, ROOT), 'utf8'))))
    .sort();
  const stray = askers.filter((file) => !expected.includes(file));
  assert.deepEqual(
    stray,
    [],
    `${stray.join(', ')} asks a support plan for extra attempts. That support is My Math Path only (FB13). `
    + 'If classroom attempts are meant to read it now, follow "what it would take" at '
    + 'functions/shared/attemptPolicy.mjs resolveQuestionMaximumAttempts, and change the catalog label, '
    + 'NOT_RECORDED_IN_ASSIGNMENTS, toolSupportMatrix.js and this test together.',
  );
  // The list is not stale: each file on it really does ask, so a file added
  // to it later has to earn its place.
  assert.deepEqual(askers, expected, 'every file on the list still asks for the extra try');
});

test('the classroom attempt limit takes no profile: it is the role plus a teacher grant', () => {
  const source = executableSource(readFileSync(new URL('functions/shared/attemptPolicy.mjs', ROOT), 'utf8'));
  const limit = source.slice(source.indexOf('export const resolveQuestionMaximumAttempts'), source.indexOf('export const resolveQuestionReplacementAllowed'));
  assert.ok(limit.length > 200, 'found the limit function');
  assert.doesNotMatch(limit, /profile|entitlement|accommodation/i);
  assert.doesNotMatch(source, /from '\.\/supportEntitlements\.mjs'/);
});

// --- the teacher is told where it matters -------------------------------------

const dolAssignment = { id: 'A1', dol: { enabled: true } };
const render = async (student, assignment = dolAssignment) => {
  const Row = (await vite.ssrLoadModule('/src/components/teacher/StudentDolRecoveryRow.jsx')).default;
  return renderToStaticMarkup(React.createElement(Row, { assignment, student, classId: 'C1' }));
};

test('the gradebook DOL row tells the teacher when the plan lists extra attempts, and that the DOL try is theirs to give', async () => {
  const html = await render({ id: 'S1', profile: { accommodations: ['text-to-speech', 'extra-attempts'] } });
  assert.match(html, /data-dol-plan-extra-attempts="S1"/);
  assert.match(html, /support plan lists extra attempts/);
  assert.match(html, /My Math Path only/);
  assert.match(html, /Grant \+1 DOL attempt/, 'the grant button the note points at is on the row');
  const structured = await render({ id: 'S2', profile: { accommodations: { extraAttempts: 2 } } });
  assert.match(structured, /data-dol-plan-extra-attempts="S2"/);
});

test('the row says nothing when the plan has no extra attempts, or no plan', async () => {
  const withoutIt = await render({ id: 'S1', profile: { accommodations: ['text-to-speech', 'large-text'] } });
  assert.doesNotMatch(withoutIt, /data-dol-plan-extra-attempts/);
  assert.match(withoutIt, /Grant \+1 DOL attempt/, 'the row itself still renders');
  const zero = await render({ id: 'S2', profile: { accommodations: { extraAttempts: 0, textToSpeech: true } } });
  assert.doesNotMatch(zero, /data-dol-plan-extra-attempts/);
  const none = await render({ id: 'S3' });
  assert.doesNotMatch(none, /data-dol-plan-extra-attempts/);
  const noDol = await render({ id: 'S1', profile: { accommodations: ['extra-attempts'] } }, { id: 'A2', dol: { enabled: false } });
  assert.equal(noDol, '', 'an assignment without a DOL has no row, so no note');
});
