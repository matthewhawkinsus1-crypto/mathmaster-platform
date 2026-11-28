# CI throughput, 2026-11-28

Why a pull request's CI took one to three hours tonight, what this change does
about it, and what is left for a decision. Every figure is marked **measured**
(from the GitHub Actions API: runs, jobs and steps of `ci.yml`, and one job's
log) or **estimated** (worked out from measured figures, with the working
shown).

## Summary

- **CI is bound by its runners, not by any one job.** The account runs at most
  **20 jobs at once** (measured: peak concurrency across six overlapping runs
  was exactly 20, and the pool sat at 20 for 92 of the 263 minutes sampled).
  A full run asks for about **630–660 job-minutes** (measured, five runs), so
  it occupies the whole pool for about 32 minutes. Its longest job is 26–29
  minutes (measured), so with an empty pool a run would take about 30 minutes;
  tonight they took 69–179.
- **So a run's wall time is set by how much work is queued ahead of it.**
  Every job-minute cut from a run shortens every queued run behind it. Cutting
  the longest job, or sharding further, does not help while the pool is full.
- **This change cuts about 34 job-minutes from every full run (about 5%,
  estimated).** It caches the installed dependencies and Playwright's
  browser builds, and removes one duplicated audit. No test is skipped,
  removed or loosened, and the CI gate is unchanged.
- **The larger levers need a decision** (below): runs superseded by a new
  push hold the next run for about half an hour; every merge re-runs the
  whole suite on main; and the pool size itself.

## Where the time goes (measured)

The last 30 completed `ci.yml` runs (2026-11-27 04:43 to 2026-11-28 01:18 UTC):

| | Runs | Wall time |
|---|---|---|
| Succeeded | 10 | 16–179 min (median about 72) |
| Failed | 3 | 53–69 min |
| Cancelled | 17 | 0.2–192 min |

Seventeen of thirty were cancelled: fifteen pull-request runs, most
replaced by a newer push to the same pull request (`cancel-in-progress`), and
two runs on main.

Five full runs, job by job:

| Run | Jobs | Job-minutes | Minutes jobs waited for a runner | CI gate's own wait | Longest job | Wall |
|---|---|---|---|---|---|---|
| discipline-tracker | 63 | 632 | 666 | 12.6 | 28.0 | 69 |
| schoolstatus-family-message | 63 | 638 | 1,073 | 23.4 | 28.3 | 115 |
| main (push) | 74 | 661 | 3,580 | 53.2 | 26.6 | 158 |
| sp-4b | 74 | 664 | 3,608 | 34.6 | 29.4 | 163 |
| correctness-bundle | 63 | 629 | 2,516 | 64.2 | 29.1 | 179 |

In the 179-minute run, the work itself would fit in about 30 minutes. The
rest is queueing: 2,516 job-minutes of waiting, and the CI gate, a 15-second
job, waited 64 minutes for a runner after everything else had finished.

Inside a job (measured, correctness-bundle run and one job's log):

| | Job-minutes per full run | Share |
|---|---|---|
| Tests themselves | about 568 | 90% |
| Fixed steps (set up job, checkout, `.github/actions/setup`, post steps) | 61 | 10% |

The setup step, from the log of one browser job (`district-id`):

| Step | Seconds |
|---|---|
| `npm ci` (downloads already restored from the npm cache) | 32 |
| Chromium, its headless shell and ffmpeg, downloaded | 14 |
| checkout | 7 |
| Playwright added and checked against the lockfile | 4 |
| setup-node and the npm cache | 2.5 |
| Chromium's system packages (already cached) | 1 |

Fifteen jobs do under four minutes of test work, so their fixed minute is a
third or more of their cost.

Checked and **not** a cost (measured):

- The Vite harness servers start in about a second. A cold first page load is
  5.3 s and 3.0 s with Vite's dependency cache (local, teacher harness), so
  caching it would save about 2 s a job.
- The production build runs once per run, in "Tool tests, audits, builds and
  lint" (5 s each, standard and Firebase). Emulator start-ups are inside their
  own test steps, a few seconds each.
- npm's download cache is already used (`setup-node` with `cache: npm`), and
  superseded pull-request runs are already cancelled (`concurrency` with
  `cancel-in-progress` for pull requests).

## What this change does

### 1. `node_modules` from a cache, checked against the lockfile

`.github/actions/setup/action.yml` restores `node_modules` as `npm ci` left
it.

- **The key** is the hash of `package.json` and the lockfile, the exact Node
  version, the OS image and the architecture: everything that decides what
  `npm ci` does. `package.json` is in it because `npm ci` refuses a lockfile
  that does not match it: a pull request that changes `package.json` alone
  misses the cache, so that refusal still happens in every job. It is an exact
  match only; a tree for another lockfile is never a starting point.
- **A restored tree is used only after `scripts/check-lockfile-install.mjs`**
  (the check the browser jobs already run after adding Playwright) finds every
  package at the lockfile's version, read from git HEAD. Anything else is
  deleted and installed with `npm ci`, exactly as before.
- **On a miss, `npm ci` runs as before**, and the tree is saved straight
  after it, before Playwright is added on top. The save is best effort: when
  several jobs miss at once, the first save wins.

Measured locally: the tree packs to 152 MB, unpacks in 4.7 s, and the check
takes 0.13 s. Estimated: a restore takes about 6 s against `npm ci`'s 32, so
about **26 s saved in each of about 60 jobs, about 26 job-minutes per full
run**.

### 2. Playwright's browser builds from a cache

The browser jobs restore `~/.cache/ms-playwright` (Chromium, its headless
shell and ffmpeg) under the Playwright version, the OS image and the
architecture: one Playwright version names exactly one build of each. They
then run `install-chromium.sh` as before, which still ends with
`npx playwright install chromium` and fetches anything missing. On a miss the
folder is saved after that install.

Estimated: **about 8 s saved in each of about 55 browser jobs, about 7
job-minutes per full run** (14 s to download, about 6 s to restore about
280 MB).

### 3. One duplicated audit removed

"Correct Answer Acceptance Audit" re-ran `npm run audit:answer-acceptance`
and eight `tests/platform` files. `full-platform-suite.yml` runs both on
every pull request and every push to main, on the same checkout: the files in
its four platform shards, the audit in "Tool tests, audits, builds and lint".
The workflow keeps the one check only it runs: a field asked as another kind
of answer must move its `familyVersion`.

Estimated: **about 2 job-minutes per run that touches that area.**

### Not changed

- No test is skipped, removed, moved or loosened. The CI gate and
  `scripts/ci-gate.mjs` are untouched, and so are the change-area routing,
  sharding, timeouts and concurrency.
- The new caches are keyed so that a restore is either exactly what `npm ci`
  (or Playwright) would have produced, or is checked and thrown away.

### Before and after, per full run

| | Before (measured) | After (estimated) |
|---|---|---|
| Job-minutes | about 630 | about 596 (−34, −5%) |
| Whole-pool minutes (job-minutes ÷ 20) | about 32 | about 30 |
| `npm ci` in a job | 32 s | about 6 s on a cache hit |
| Browser builds in a browser job | 14 s | about 6 s on a cache hit |

The first run after this merges, and the first run after each lockfile or
Playwright change, misses and saves. Its jobs cost as before.

**How to measure the after:** compare `Run ./.github/actions/setup` step
durations, and job-minutes per run, for the ten runs after the merge with the
five above.

## Decisions this leaves (not changed here)

Each of these is larger than everything above, and each changes what a check
means or what CI costs, so none is made here.

1. **A superseded run holds its replacement for about half an hour.** With
   `cancel-in-progress`, the new run waits until the cancelled one has
   finished. The cancelled run's CI gate runs on `if: always()`, so it must
   first wait for a runner like any other job. Measured on #624: the run
   superseded at about 00:05 finished at 00:38:53 (its gate had waited for a
   runner), and the new run's first jobs started at 00:38:54, about **34
   minutes** of dead wait.

   The obvious fix, skipping the gate when the run is cancelled, is not safe:
   GitHub reads a skipped required check as passed. A human cancelling the run
   on a pull request's head would then make it mergeable without CI. A real
   fix means moving `concurrency` from the workflow to its jobs, so that a new
   run starts at once and each job replaces its own predecessor. That
   restructures `ci.yml`, and `tests/platform/ciWorkflow.test.mjs` holds its
   shape.
2. **Every merge runs the whole suite again on main** (measured: 661 and
   about 660 job-minutes for the main runs above, as much as a pull request).
   `scripts/release-firebase.mjs` deploys only a commit whose run on main
   passed. Skipping a main run whose tree a pull request's run has already
   passed would roughly halve the load from merged work, but it changes the
   deploy gate.
3. **The pool itself.** A plan or runner group with more concurrent jobs, or
   larger runners for the longest browser jobs, would move the floor directly.
   That is a cost decision.
4. **Fifteen jobs do under four minutes of test work**, mostly in "Student and
   Teacher Journeys" and "Student Pass 3 Emulator Journeys". Folding several
   into one job would save about a minute of fixed cost each. Many were split
   on purpose ("its own job": an emulator, a harness, isolation), so this is
   for the people who split them.
5. **Change-area routing.** `src/**` sends every browser certification on
   any source change. Narrowing that would save the most on small pull
   requests, but would also drop coverage, which this change does not do.
