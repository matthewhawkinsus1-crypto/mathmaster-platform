// The verdict of .github/workflows/ci.yml's "CI gate", the one check branch
// protection requires.
//
// It reads `needs` (every job the gate waited on, with its result). A job
// either passed or was skipped because its files did not change; anything
// else fails the gate. If the changed-areas job itself did not succeed, no
// workflow can be shown to have run where it should, so that fails it too.
// "Skipped" never stands in for a check that should have run: the gate runs
// even when the run is cancelled (`if: always()`), and then fails.

const PASSING = new Set(['success', 'skipped']);

/** needs: ci.yml's `toJSON(needs)`, parsed. */
export const gateVerdict = (needs = {}) => {
  const rows = Object.entries(needs).map(([job, value]) => ({ job, result: value?.result ?? 'unknown' }));
  const problems = [];
  if (needs.changes?.result !== 'success') {
    problems.push(`changes: ${needs.changes?.result ?? 'missing'} — which workflows had to run is unknown`);
  }
  rows.filter(({ job, result }) => job !== 'changes' && !PASSING.has(result))
    .forEach(({ job, result }) => problems.push(`${job}: ${result}`));
  if (!rows.some(({ job, result }) => job !== 'changes' && result === 'success')) {
    problems.push('no workflow ran at all');
  }
  return { ok: problems.length === 0, rows, problems };
};
