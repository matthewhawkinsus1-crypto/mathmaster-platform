// THE JOURNEYS OF warmupReopenJourneys.mjs, BY THE NAME `ONLY=` TAKES.
//
// Their own file so the nightly's throttled run can be checked against the list:
// .github/workflows/student-teacher-journeys.yml runs the throttled Warm-Up
// close and reopen in several jobs, one `ONLY=` list each (CI11, issue #522),
// and tests/platform/nightlyWarmupShards.test.mjs reads the jobs against this
// list so a journey added to the driver cannot be left out of every shard.
// The driver refuses a run where this list and its own journeys differ.
//
// In the order they run.
export const WARMUP_REOPEN_JOURNEYS = Object.freeze([
  'inprogress',
  'submitted',
  'pristine',
  'corrupt',
  'cycles',
  'bridge',
  'bridge-corrupt',
  'server-expired',
  'server-attempted',
  'server-correct',
]);

// Minutes each takes on the throttled Chromebook (`--slow`), on a CI runner.
// Measured in the nightly of Oct 23 (run 39954965481), which was cancelled in
// bridge-corrupt: its five malformed drafts take 4.4 minutes each, one throttled
// reload apiece. The three server journeys were never reached there; theirs were
// timed running `--slow` on a development machine (8.5, 7.3 and 6.4), so a CI
// runner may take a little more or less. The driver prints what each took
// ("journey minutes:") so a nightly can replace them. The shards are sized from
// these.
export const WARMUP_REOPEN_SLOW_MINUTES = Object.freeze({
  inprogress: 6.1,
  submitted: 0.9,
  pristine: 0.3,
  corrupt: 20.8,
  cycles: 0.6,
  bridge: 6.0,
  'bridge-corrupt': 22.0,
  'server-expired': 8.5,
  'server-attempted': 7.3,
  'server-correct': 6.4,
});
