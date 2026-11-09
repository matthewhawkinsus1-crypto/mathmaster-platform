// The emulator browser drivers of the Live Challenge CI jobs use an emulator
// already answering at FIRESTORE_EMULATOR_HOST, and start one only when none
// does. So each runs beside another suite on ports of its own. The class
// rewards driver started one from the fixed config whatever the host said: it
// bound the default port beside another suite's emulator, or failed on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executableSource } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DRIVERS = [
  'classRewardsQa.mjs',
  'liveChallengeTeachingQa.mjs',
  'liveChallengeProjectorPrivacyQa.mjs',
  'liveChallengeShellQa.mjs',
  'graphFeatureRushGame.mjs',
  'lineGraphGame.mjs',
];
// The start sits inside the block that first asked whether an emulator answers
// at the host (no closing brace at the start of a line between the two).
const startsOnlyWhenNoneAnswers = /if \(!await waitForHttp\(`http:\/\/\$\{EMULATOR\}\/`, 2\)\) \{\n(?:(?!\n\})[\s\S])*?'emulators:start'/;

for (const driver of DRIVERS) {
  test(`${driver} starts an emulator only when none answers at FIRESTORE_EMULATOR_HOST`, () => {
    const source = executableSource(readFileSync(path.join(repo, 'tests/browser', driver), 'utf8'));
    assert.match(source, /const EMULATOR = process\.env\.FIRESTORE_EMULATOR_HOST \|\| 'localhost:8182';/, `${driver} reads the host from FIRESTORE_EMULATOR_HOST`);
    assert.equal(source.split("'emulators:start'").length - 1, 1, `${driver} has one place that starts an emulator`);
    assert.match(source, startsOnlyWhenNoneAnswers, `${driver} starts it only when none answers there`);
  });
}
