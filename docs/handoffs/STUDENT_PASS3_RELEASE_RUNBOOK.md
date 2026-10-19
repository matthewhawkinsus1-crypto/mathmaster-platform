# Student pass 3 — release runbook

*For whoever runs the release: the owner, or a Claude Code session in a terminal that can deploy to the production
Firebase project `mathmaster-aleks`. Written by the pass-3 integrator (session_015ZWXaB2EL6j1zM63TBNeuN) on
2026-10-18.*

Pass 3 ships in **two releases, in this order**. Each release goes out from `main`, with the release planner.

| Release | What it is | How it reaches `main` | What it deploys |
| --- | --- | --- | --- |
| **1** | Batch 3 ("never lose work", PR #497, already merged) plus the step-state key (three small hunks, W5-5) | the PR from `claude/pass3-release-1` | the whole default function fleet, path-admin, Hosting (about an hour) |
| **2** | Everything else in pass 3: waves 1–6 | the PR from `claude/modest-pasteur-xzagn7` | Firestore rules, the whole default fleet, path-admin, Hosting (about an hour) |

Pass 3's handoffs are on the release-2 branch until release 2 merges; read them with
`git show origin/claude/modest-pasteur-xzagn7:docs/handoffs/<name>.md`.

Release 2 must never go out before release 1 is fully live (step 3). The reason: release 2's pages write step records
that only release 1's servers read correctly ("W5-5 must ship in two releases" in `docs/handoffs/STUDENT_PASS3_WAVE5_INTEGRATION.md`).

## Rules for the release (read first)

- **Outside class time only.** Weekends and evenings are fine. Before each `--execute`, show the owner the plan and wait
  for a clear "go".
- **Only the release planner deploys.** It is `node scripts/release-firebase.mjs`: the plan by default, and a deploy
  with `--execute`. Never run a raw `firebase deploy`, and never `firebase deploy --only hosting` (AGENTS.md). Do not
  pass `--yes`. The planner asks for the project id before it deploys; type `mathmaster-aleks`.
- **Stop and ask the owner** whenever:
  - a check below fails or prints something this runbook does not expect;
  - `--whats-live` shows a commit that is not on `main`;
  - a planner step fails after its retries;
  - the step-0 report exits non-zero.
  Do not improvise a fix on `main`.
- **Never** force-push, rewrite or delete `main` or any branch. Never merge any PR except the two named here.
- **While `manageAssignmentLifecycle` deploys**, nobody pauses or resumes a live Test.
- **After each release's Hosting step**, the owner asks teachers to have students reload.

## Before you start

```bash
gh auth status                                  # the GitHub CLI, signed in to the repository
gcloud auth list                                # an account with deploy rights on mathmaster-aleks
gcloud auth application-default login           # read-only reports use Application Default Credentials
git clone https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git && cd mathmaster-platform   # or use your checkout
node --version                                  # Node 22
```

The Firebase CLI comes from the repository (`npx firebase`), signed in as an account with deploy rights
(`npx firebase login` if it asks).

## Step 0 — what is live, and the read-only count

1. Check what is live:

   ```bash
   git fetch origin && git checkout --detach origin/main && npm ci && npm --prefix functions ci
   node scripts/release-firebase.mjs --whats-live
   ```

   Hosting and every function should report **`56a5a5b`** (main before PR #497). If any part reports a commit that is
   not on `main`, **stop**: a release from `main` would take that work off the site.
2. Run the step-key count, which is read-only. W5-5 decision 7 asks for it
   (`docs/handoffs/STUDENT_PASS3_MATH_DISPLAY.md`, "Owner's step"). The script ships in the
   release-1 PR, so run it from that branch:

   ```bash
   git checkout --detach origin/claude/pass3-release-1 && npm ci && npm --prefix functions ci
   node scripts/report-step-key-credit-changes.mjs --project mathmaster-aleks
   echo "exit $?"
   ```

   It reads only the `grades` collection, through a field mask. It writes nothing to Firestore and leaves one JSON
   file in `release-reports/` (gitignored).
   - **Exit 0, "OK: release 1 changes no recorded credit."** Go on to step 1.
   - **Exit 3, "STOP".** Some recorded step credits would fall to the value the server stored; none go below it.
     Show the owner the counts and the detail file, then wait. The owner chooses one of:
     - **(a) Accept:** those inflated credits fall to the server's own value. Go on to step 1.
     - **(b) Hold the push-Q rule back:** release 1 then carries only the tie rule. This needs a code change, which
       the integrator prepares; nothing in this runbook makes it. Stop here.
   - **Exit 1 or 2.** Stop and show the owner the message.

## Step 1 — release 1: Batch 3 and the step key

1. Merge the release-1 PR, the one from `claude/pass3-release-1`, with a merge commit:

   ```bash
   gh pr list --head claude/pass3-release-1            # its number
   gh pr checks <number>                               # all green before merging
   gh pr merge <number> --merge
   ```

2. Plan from `main`:

   ```bash
   git fetch origin && git checkout --detach origin/main && npm ci && npm --prefix functions ci
   node scripts/release-firebase.mjs
   ```

   **Expected plan:**
   - `functions` (25 groups of up to 8, `finalizeAbandonedSecureExams` among them, `platformBuildInfo` last);
   - verify `platformBuildInfo`;
   - browser access to callables;
   - `functions:path-admin`;
   - `hosting`.

   No rules and no indexes. About 56 minutes. If the plan names anything else, stop and show the owner.
3. Show the owner the plan. On "go":

   ```bash
   node scripts/release-firebase.mjs --execute          # type mathmaster-aleks when asked
   ```

   The deploy creates the Cloud Scheduler job for `finalizeAbandonedSecureExams`, which runs every 5 minutes. The
   planner writes a report to `release-reports/`: what shipped, what did not, how to finish, and how to roll back. If a
   step fails, stop and show the owner that report.
4. After Hosting, the owner asks teachers to have students reload.

## Step 2 — wait

```bash
node scripts/release-firebase.mjs --whats-live
```

Wait until **every** function reports release 1's commit, `path-admin` included, not just `platformBuildInfo`. Then
wait **10 to 15 minutes more** for old instances to drain. Note release 1's commit (`git rev-parse --short
origin/main`); step 3 needs it.

## Step 3 — release 2: pass 3, waves 1–6

1. **Is it ready?** The release-2 PR (from `claude/modest-pasteur-xzagn7`) must be marked ready for review (not a
   draft), its checks green, and GitHub must show it mergeable. If it shows a conflict, stop: the integrator merges
   `main` into it.
2. **The calculator-setting count**, read-only and for the owner's eyes
   (`docs/handoffs/STUDENT_PASS3_CALCULATOR_SETTING.md`, "Before Hosting goes out"). Release 2
   changes what a stored calculator setting does on live assignments. Run the block in that section from `functions/`,
   using the copy on the release-2 branch:
   `git show origin/claude/modest-pasteur-xzagn7:docs/handoffs/STUDENT_PASS3_CALCULATOR_SETTING.md`. Show the owner
   the table. **Do not release while any listed assignment has an exit ticket, quiz or test window open.** The owner
   confirms.
3. Merge the release-2 PR with a merge commit:

   ```bash
   gh pr list --head claude/modest-pasteur-xzagn7
   gh pr checks <number>
   gh pr merge <number> --merge
   ```

4. Plan from `main`, against release 1's commit:

   ```bash
   git fetch origin && git checkout --detach origin/main && npm ci && npm --prefix functions ci
   node scripts/release-firebase.mjs --since <release 1's commit>
   ```

   **Expected plan:**
   - `rules` (pass 3's Firestore rules);
   - `functions`: the whole default fleet, every function that loads the shared graders;
   - verify `platformBuildInfo`;
   - browser access to callables;
   - `functions:path-admin`;
   - `hosting`.

   No indexes. If the plan names `indexes` or `database`, or leaves out rules or Hosting, stop and show the owner.
5. Show the owner the plan. On "go":

   ```bash
   node scripts/release-firebase.mjs --since <release 1's commit> --execute
   ```

6. **After Hosting:**
   - A root admin publishes the Path release **`course-path-v2-01d45bb15d913284`** (Administration → My Math Path
     content coverage). It is a click in the app, for the owner; it needs no new code.
   - The owner asks teachers to have students reload.
   - `node scripts/release-firebase.mjs --whats-live` shows release 2's commit everywhere.
7. **What is left off on purpose.** D10's read-scope switches stay off. Turning them on is a separate owner decision
   (`docs/handoffs/STUDENT_PASS3_D10_PHASE0.md` §6).

## If something goes wrong

- **The planner stops with a failed step.** Its report in `release-reports/` says what shipped and how to finish or
  roll back. Show it to the owner, and do not run anything else first.
- **Rolling back.** Rolling back release 2 alone is safe: every server keeps both step renderings as one state. Release
  1 must stay live under release 2's pages. The owner decides any rollback.
- **Grades.** No grade is lowered by either release, except the step-0 credits the owner accepted in step 0 (a). Pass
  3's re-grades are upward only (decision D8).

## After both releases

Reply on the release-1 PR, or tell the owner:
- the two commits that are live;
- the step-0 report's counts;
- whether the Path release is published.

Wave 7, the next build wave, waits until both releases are live.
