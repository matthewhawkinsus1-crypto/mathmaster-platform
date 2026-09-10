import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/*
 * SOME VERSIONS NAME A CONTRACT. OTHERS ARE COUNTERS. ONLY ONE KIND MAY BE PINNED.
 *
 * `schemaVersion === 5` is a contract assertion and belongs in tests: V5 is the
 * assignment format, V4 and earlier are refused on purpose, and if that ever
 * becomes V6 these tests SHOULD fail, because that is a migration someone must
 * look at.
 *
 * ASSIGNMENT_RUNTIME_REPAIR_VERSION is the opposite. It exists to be
 * incremented — that is the mechanism by which assignments stamped by an
 * earlier release get evaluated again — and it moved three times in three
 * consecutive PRs (#167, #169, #173). Every test that hardcoded its value broke
 * on every bump, always with correct code underneath, and one of them ended up
 * asserting the opposite of its own name: a fixture that meant "a current
 * stamp" silently became a stale one.
 *
 * A blanket sweep of every numeric version assertion would destroy the first
 * kind to protect against the second. So this guards only the constants that
 * are designed to move, and only against the specific mistake: freezing the
 * value they currently hold.
 *
 * If you are adding a monotonic constant, add it here. If this test fails, do
 * not change the number — use the constant, or CURRENT - 1 for a deliberately
 * stale fixture. See docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md.
 */

const MONOTONIC = [
  { name: 'ASSIGNMENT_RUNTIME_REPAIR_VERSION', file: 'src/platform/assignments/assignmentRuntimeRepair.js' },
];

const root = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), 'utf8');

const currentValueOf = ({ name, file }) => {
  const match = new RegExp(`export const ${name} = (\\d+)`).exec(read(file));
  assert.ok(match, `${name} is no longer declared in ${file}; update MONOTONIC in this test`);
  return Number(match[1]);
};

const testFiles = readdirSync(new URL('./', import.meta.url))
  .filter((entry) => entry.endsWith('.test.mjs') && entry !== 'monotonicConstantsNotPinned.test.mjs');

MONOTONIC.forEach((constant) => {
  test(`no test freezes ${constant.name} at its current value`, () => {
    const current = currentValueOf(constant);
    const offenders = [];

    testFiles.forEach((entry) => {
      const source = read(`tests/platform/${entry}`);
      if (!source.includes(constant.name) && !/repairVersion|runtimeRepairVersion/.test(source)) return;

      source.split('\n').forEach((line, index) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        // Asserting the constant itself against a literal.
        const direct = new RegExp(`assert\\.(equal|strictEqual)\\([^,]*${constant.name}[^,]*,\\s*${current}\\s*\\)`);
        // A fixture freezing the value the constant currently holds.
        const fixture = new RegExp(`\\b(repairVersion|runtimeRepairVersion|assignmentRuntimeRepairVersion)\\s*:\\s*${current}\\b`);
        if (direct.test(line) || fixture.test(line)) {
          offenders.push(`${entry}:${index + 1}  ${line.trim()}`);
        }
      });
    });

    assert.deepEqual(
      offenders,
      [],
      `${constant.name} is currently ${current} and is designed to be incremented. These pin it, so they will fail on the next bump `
      + `with correct code underneath — and a fixture meaning "current" silently becomes "stale".\n\n`
      + `Use the constant, or ${constant.name} - 1 for a deliberately old value:\n\n${offenders.join('\n')}\n`,
    );
  });
});
