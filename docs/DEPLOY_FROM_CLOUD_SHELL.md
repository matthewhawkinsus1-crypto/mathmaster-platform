# Deploying MathMaster from Google Cloud Shell

> **This site is live and holds real student records.** Deploys land in front of
> real classes, and the Administration tab's **Pre-production reset** permanently
> deletes student accounts, grades, attempts and Path history. Once the roster is
> real, close that door for good with **Lock reset for production** — the lock is
> one-way and cannot be undone.

## Assignment V5 pre-production release

Assignment V5 now includes built-in AI assignment authoring. Before the first deploy of this release, create the Firebase server secret once:

```
firebase functions:secrets:set OPENAI_API_KEY --project mathmaster-aleks
```

When Firebase prompts for the value, paste the OpenAI key created for **MathMaster Assignment AI**. The key stays in Firebase Secret Manager and is not placed in browser code or the repository.

The API project behind that key also needs available billing credit and access to
the configured model. A key that is valid but out of credit is the single most
common reason the built-in AI stops working, and it is not something a deploy can
fix.

### Checking the AI after a deploy

Sign in as the root administrator and open **Administration → Assignment AI
health → Run AI connection check**. It makes one tiny real request and names the
cause directly — credential, model entitlement, billing quota, or network egress
— instead of the generic "AI is unavailable". Every teacher-facing AI failure is
also written to Cloud Logging under `Integrated assignment AI failed` and to the
`assignmentAiAudit` collection, with provider status and token counts but no
prompt, no assignment content, and nothing student-identifying.

Two optional Functions environment values tune the authoring model:

| Variable | Default | Use it when |
| --- | --- | --- |
| `OPENAI_ASSIGNMENT_MODEL` | `gpt-5` | The API project should author with a different model. |
| `OPENAI_ASSIGNMENT_REASONING_EFFORT` | `medium` (`low` for repairs) | Builds are timing out or exhausting the output budget. |

To ship only the AI surfaces after a change to them, use the focused helper
instead of a full deploy — it pushes Hosting plus `authorAssignmentWithAI`,
`repairAssignmentQuestionWithAI`, `assignmentAiSelfTest` and
`hydrateAssignmentCcmr`:

```
bash scripts/deploy-assignment-v5-followup.sh
```

For a full release, the preferred deployment is the guarded one-command helper:

```
cd ~ && { [ -d mathmaster-platform ] || git clone https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git; } && cd mathmaster-platform && git checkout main && git pull origin main && bash scripts/deploy-v5-preproduction.sh
```

The helper updates `main`, verifies `OPENAI_API_KEY`, installs exact dependencies, runs the permanent Assignment V5 gates, builds Firebase Hosting in production mode, deploys Firestore rules/Hosting, deploys Functions in quota-safe groups, and verifies the live site returns HTTP 200. If any gate fails, deployment stops.

- **Project:** `mathmaster-aleks`
- **Repository:** `matthewhawkinsus1-crypto/mathmaster-platform`, branch `main`
- **Everything lives in Firebase.** Hosting, Cloud Functions and Firestore
  rules all go out in one command. There is no Vercel and no second server —
  older code comments that mention one are out of date.

Open **https://console.cloud.google.com**, click the terminal icon (`>_`) top
right, and wait for the `$` prompt.

---

## Block 1 — sign in (first time, or if a deploy says you are not authorised)

```
firebase login --no-localhost
```

Copy the link it prints, open it in a new tab, allow access, copy the code it
gives you and paste it back.

---

## Block 2 — the whole deploy, one paste

Use the guarded helper. It pulls the exact latest `main`, verifies the required
server secret, installs exact dependencies, runs the release gates, builds the
Firebase production web runtime, deploys **Cloud Functions first**, then
Firestore rules + Hosting, and finally checks the live site.

```
cd ~ && { [ -d mathmaster-platform ] || git clone https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git; } && cd mathmaster-platform && git checkout main && git pull --ff-only origin main && bash scripts/deploy-v5-preproduction.sh
```

The Functions-first order is intentional. Digital SAT / ACT / TSIA2 and ASVAB
now use release-aware Path sessions, so the new callable/runtime protections
must be live before any release-managed bank is activated.

### Hosting-only deploys

Do not use a raw `firebase deploy --only hosting` from Cloud Shell. Firebase
Tools defaults Hosting file uploads to very high concurrency, which can exhaust
Cloud Shell's outbound connection budget and produce repeated
`ConnectTimeoutError` / `retries exhausted` failures against
`upload-firebasehosting.googleapis.com`.

Use the repository helper instead:

```
cd ~/mathmaster-platform && git checkout main && git pull --ff-only origin main && npm run deploy:hosting
```

The helper keeps Hosting upload concurrency at 4 by default and automatically
retries only transient network/upload failures with backoff. Real build,
authorization, configuration, or Firebase errors stop immediately instead of
being hidden by retries. To override the defaults for an unusually weak
connection:

```
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 FIREBASE_HOSTING_DEPLOY_ATTEMPTS=8 npm run deploy:hosting
```

All MathMaster release helpers route Hosting through this same safe path, so
Functions and Firestore rules are not repeatedly redeployed when only the
Hosting upload transport is flaky.

Finish line:

```
=== MathMaster production deploy completed ===
HTTP 200
```

---

## Block 3 — confirm it landed

```
cd ~/mathmaster-platform && echo "--- deployed commit ---" && git log --oneline -1 && echo "--- site ---" && curl -s -o /dev/null -w "HTTP %{http_code}\n" https://mathmaster-aleks.web.app && echo "--- functions ---" && firebase functions:list --project mathmaster-aleks 2>/dev/null | head -12
```

Expect `HTTP 200` and a list of functions. To see which **commit** each part
is running, use `--whats-live` (next section).

---

## Which commit is live — Hosting and Functions

Hosting has always published the commit it was built from
(`https://mathmaster-aleks.web.app/mathmaster-build.json`). Cloud Functions now
carry theirs too.

```
cd ~/mathmaster-platform && node scripts/release-firebase.mjs --whats-live
```

prints your local HEAD, the Hosting commit, the Functions commit (asked of
`platformBuildInfo`), and — when `gcloud` is on PATH, as it is in Cloud Shell —
every deployed function grouped by its `mm-git-sha` label. It deploys nothing.
Without `gcloud` it says so and prints the rest.

How it works:

- **A stamp in every upload.** The first predeploy step of both Functions
  codebases in `firebase.json` is
  `node scripts/write-functions-provenance.mjs --codebase <name> --dir <source>`.
  It writes `deploy-provenance.json` — `{ codebase, gitSha, gitShaShort,
  treeClean, writtenAt }` — into `functions/` and `functions-path-admin/` just
  before the CLI uploads them. It runs however you deploy: the release tool,
  `deploy-functions-in-groups.sh`, or a raw `firebase deploy`. The file is
  gitignored, and still uploaded, because the CLI packages by the `ignore` list
  in `firebase.json`, not by `.gitignore`. It is only rewritten when the commit
  or the clean/dirty state changes, so re-running a deploy of the same commit
  still lets the CLI skip functions that already landed. No git → `unknown`.
- **Labels on every function.** Both codebases read that file and label every
  function they deploy: `mm-git-sha` = the full commit (or `unknown`),
  `mm-tree` = `clean` or `dirty`. A function with no `mm-git-sha` label was last
  deployed before this existed; its next deploy labels it.
- **`platformBuildInfo`.** A read-only callable in the default codebase that
  returns the stamp to anyone — no sign-in, nothing secret (the Hosting commit
  is already public). By hand:
  ```
  curl -s -X POST -H 'Content-Type: application/json' -d '{"data":{}}' https://us-central1-mathmaster-aleks.cloudfunctions.net/platformBuildInfo
  ```
  answers `{"result":{"codebase":"default","gitSha":"…","treeClean":true,…}}`.
- **The release tool checks it.** Every release that deploys default-codebase
  functions (`node scripts/release-firebase.mjs`) also redeploys
  `platformBuildInfo`, in its last group, and then runs a **verify step**: it
  calls `platformBuildInfo` and requires the commit it reports to be your HEAD.
  It asks up to three times (`--max-attempts`), waiting 15–40 seconds between
  tries, because a function created a moment ago can answer 403/404 briefly.
  A different commit, `unknown`, or no answer is treated exactly like a
  function that failed to deploy: path-admin, rules and Hosting are **not**
  deployed, the report in `release-reports/`
  records what it saw under `verification`, and it prints the command that
  finishes the release (`--functions platformBuildInfo`, which re-runs the
  check, then the held-back targets). `--continue-after-function-failure`
  overrides it, as it does for a failed function. A release with no
  default-codebase functions has no verify step; the path-admin codebase is
  covered by its labels, not by a ping.

---

## Block 4 — activate the production Path banks in the browser

Deploying updates the certified seed packages inside Cloud Functions. Existing
Firestore bank records stay unchanged until the root administrator activates
the corresponding release.

1. Open **https://mathmaster-aleks.web.app**
2. Sign in with the MathMaster root-administrator account.
3. Go to **Administration → My Math Path content coverage**.
4. Confirm **Web release** and **Server release** match.
5. On an existing installation, run these three buttons in order:
   - **Refresh course Path bank** — Grade 6/7/8 + Algebra I/II only.
   - **Refresh ASVAB release** — independent ASVAB release; does not touch SAT/ACT/TSIA2.
   - **Refresh SAT / ACT / TSIA2 release** — coordinated atomic V2.1 release; preserves ASVAB.
6. Confirm each operation reports success and the assessment release manifest is active.
7. Run **Recompute from bank** only if coverage needs to be refreshed manually; the course refresh already rebuilds it.

**Do not use “Fresh installation only” on the existing production database.**
The server intentionally refuses fresh initialization when the secure bank is
already populated.

The generic JSON importer is also **not** a substitute for the release buttons.
Release-managed Digital SAT, ACT, TSIA2, and ASVAB content is blocked from that
route.


---

## Block 5 — student privacy on assignments (once, after the release that adds it)

Every student's device can read an assignment, and attendance extensions
granted before this release stored the student's absence dates, meeting counts
and the granting teacher on it (PR #407 deep dive, F-PRIV-1). The release that
fixes it ships with nothing switched on: new extensions already keep their
details private, but existing ones stay where they are until you move them, and
students' devices keep their old read access until you turn it off.

**Step 1 — move the existing extension details (any time after the release).**

1. Sign in as the root administrator → **Administration → Classes** →
   **Student privacy on assignments**.
2. **Check without changing anything.** It pages through every assignment and
   reports how many extensions would move. Nothing is written.
3. **Move extension details.** Each extension's original details are copied,
   unchanged, into the student's private record
   (`grades/{student}/attendanceExtensionGrants/legacy__{assignment}`, field
   `legacyExtension`) in the same transaction that leaves only the deadline
   (`lateDueAt`) and `{dateKey, grantedAt}` on the assignment. Deadlines do not
   move. Expect **Could not finish: 0**; anything listed there was left exactly
   as it was and can be retried.
4. **Check without changing anything** again: the card turns green when no
   assignment carries extension details any more. Running it twice is safe —
   the second run changes nothing and creates no duplicates.

**Step 2 — class-scoped assignment lists (the next school day).**

Open tabs from the previous release still list every assignment. Once every
student device has loaded this release — after a full school day — use
**Class-scoped assignment lists → Turn on**. From then on a student's device may
list only its own class's assignments (it can still open one by id, which is
how work from an earlier class keeps loading).

**Rollback.**

- **Turn off** the class-scoped lists on the same card. It takes effect at
  once and needs no deploy.
- Rolling the code back does **not** require undoing Step 1. Deadlines and the
  `{dateKey, grantedAt}` stub that attendance reconciliation reads stay on the
  assignment; the only earlier screen that showed more was the case review's
  "N class meetings" note on an extension. The originals stay in the private
  records — never delete `attendanceExtensionGrants`; it is also where every
  new grant is kept, one record per grant.

---

## Block 6 — students' own assignment controls (once, after the release that adds it)

A student's extension, excusal, reopen and extra DOL attempts used to be stored
on the shared assignment, where every student's device can read them. This
release adds a private record per student and assignment
(`studentAssignmentOverrides`, readable only by that student, their teacher and
you). The server now decides deadlines and attempts from it. Design and stages:
`docs/architecture/student-assignment-overrides.md`.

**Deploy as usual (Block 2), plus the indexes.** Block 2 deploys Functions,
then rules, then Hosting. This release also adds two composite indexes for
the next release's teacher screens. Nothing queries them yet, so deploy them
now and they will be built in advance:

```
cd ~/mathmaster-platform && firebase deploy --only firestore:indexes --project mathmaster-aleks
```

(`node scripts/release-firebase.mjs --execute` does this for you: it deploys
indexes first.) Every step works with previous-release tabs still open:

- the new functions keep the shared copy **in step** with the private records
  (the "mirror"), so an old screen reads exactly what it read before;
- a teacher's old tab may still grant a DOL attempt the old way: it is copied
  into the private record within seconds;
- the new rules only add the private collections; nothing that worked is
  refused while the shared copy is kept in step.

No student or teacher screen changes in this release.

**Step 1 — copy existing controls into private records (any time after the deploy).**

1. Sign in as the root administrator → **Administration → Classes** →
   **Students' own assignment controls**.
2. **Check without changing anything.** It pages through every assignment and
   reports how many private records it would create. Nothing is written.
3. **Copy into private records.** Each student's controls become their
   private record, with a history entry naming the value it came from.
   Extension reasons still on an assignment move into the student's private
   grant record, as in Block 5. The assignments are not changed. Expect
   **Could not finish: 0**; anything listed was left exactly as it was. If the
   page closes part-way, press it again: it carries on from where it stopped.
4. **Check without changing anything** again. The card turns green when there
   is nothing left to copy. Running it twice is safe: the second run writes
   nothing.
5. **Check status** should say *kept in step for older screens* and *Last full
   copy: finished*.

**Step 2 — nothing else in this release.** Removing the shared copy (so
students stop receiving classmates' controls at all) needs the next release,
whose screens read the private records: Block 7.

**Rollback.** Redeploy the previous release. The shared copy is still
complete, so it behaves exactly as before; the private records are simply not
read. After returning to this release, run Step 1 again: it picks up anything
granted while the previous release was live.

---

## Block 7 — students' controls: the client cutover, then Stage 4 (once)

The release after Block 6 makes every student and teacher screen read the
private records: a student's device keeps one listener for its own controls
and holds no classmate's; a teacher's keeps one for the classes on screen; the
"+1 DOL attempt" goes through the server. It also adds the Stage 4 controls to
the card — each a separate, deliberate step that the server refuses until its
conditions hold. Design: `docs/architecture/student-assignment-overrides.md`
§9, §11, §15. **Nothing in this block runs by itself; nothing deletes data.**

**Deploy (Block 2), and check three things.**

1. The teacher screens' index (added by Block 6's release) exists and is
   built. If Block 6's index step was skipped, deploy it now and wait until it
   says READY:

   ```
   cd ~/mathmaster-platform && firebase deploy --only firestore:indexes --project mathmaster-aleks
   gcloud firestore indexes composite list --project mathmaster-aleks --format="table(collectionGroup,state)" | grep studentAssignmentOverrides
   ```

   Until it is READY a teacher's screen quietly uses the shared copy, which is
   still kept in step — never retire before it is.
2. Block 2 deploys Functions first, then rules, then Hosting. No rules change
   in this release.
3. The live site declares the new client:

   ```
   curl -s "https://mathmaster-aleks.web.app/mathmaster-build.json?ts=$(date +%s)" | grep -E '"gitSha"|privateAssignmentControlsClient'
   ```

   Expect this release's commit and `"privateAssignmentControlsClient": 1`.

**The same day — record the release as live.** As the root administrator:
**Administration → Classes & rosters → Students' own assignment controls.**

1. **Check status.** The stage reads *Backfill incomplete* until a full pass
   is counted by this release's server — passes run before it are not, so run
   it again:
2. **Check without changing anything**, then **Copy into private records.**
   Expect *Could not finish: 0* and *Last full pass: finished … 0 failures*.
   If the page closes part-way, press **Copy into private records** again: it
   resumes the same pass.
3. **Record this release as live.** MathMaster reads the live build itself.
   If it says it could not, tick *I confirm this release's Hosting is
   deployed and live for everyone* (only if Step 3 above showed the new
   commit) — that statement is recorded with your name. The school-day clock
   starts now, stamped by the server.
4. The card now reads *Backfill complete — waiting for the safety period* and
   names the first full school day by the district calendar.

**After that full school day has ended — Stage 4.**

1. Make sure no older screen can still be open: the release has been live a
   whole school day (every Chromebook has reloaded), and no one has rolled
   Hosting back since (Block 3's `--whats-live` shows this release).
2. **Check status.** All four conditions show ✓ and the stage reads *Ready to
   retire*. If one does not, the card says which and why; fix that first.
3. Tick *Students used this release for a full school day* (only if true —
   MathMaster cannot see holidays or staff days), type `RETIRE SHARED COPY`,
   press **Retire the shared copy.** The stage reads *Retired*; the shared
   copy is no longer kept in step and the rules lock per-student data off
   shared assignments.
4. **Strip dry run.** Read the six numbers: assignments scanned, with shared
   student data, records confirmed private, awaiting absorption (the strip
   copies those in first), failures (expect 0), archives that would be
   written. Nothing is changed.
5. Type `STRIP SHARED COPIES`, press **Strip shared copies.** Every shared
   assignment loses its per-student data only after MathMaster confirms each
   student's private record says the same, and only after archiving it
   verbatim. If it reports any *to run again*, run the dry run and the strip
   again.
6. **Strip dry run** once more: *Assignments with shared student data: 0*. The
   card's *30-day condition* now shows *Clean since …*: the clock in
   `docs/architecture/student-assignment-overrides.md` §13 has started.

**Rollback.**

- *Before Stage 4:* redeploy the previous release (Block 2 from its commit).
  The shared copy is still complete, so older screens read exactly what they
  did. Then run the backfill again when this release is back.
- *After retiring (with or without the strip):* tick *Turn retirement off
  (rollback)* → **Keep the shared copy in step again** (never refused). Then
  **Restore dry run** → type `RESTORE SHARED COPIES` → **Restore shared
  copies**: every private record is written back onto the shared assignments,
  so an older screen reads the same controls again. Only then redeploy an
  older release, if you need to. Retiring again later starts over: record the
  release as live again and wait one more full school day.
- Never redeploy a release older than Block 6's after the strip without the
  restore first: it reads only the shared copy.

---

## Nothing else needs updating

No Vercel deploy and no manual database work beyond Blocks 4, 5, 6 and 7. Composite indexes
do exist (`firestore.indexes.json`); a release that changes them deploys them
first — `node scripts/release-firebase.mjs` does that for you.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| The chain stops at `npm install` | Run Block 2 again — usually a network hiccup. |
| The chain stops at `npm run build` | Send me the error. Do not deploy; the chain already stopped for you. |
| `Failed to get Firebase project` / `permission denied` | Run Block 1, then Block 2. |
| Path screens say "not configured on this deployment" | The build ran without the setting. Run Block 2 again — it writes it. |
| Teacher sees "restricted to the root administrator" | Wrong account. The message names the one to use. |
| Website looks unchanged | Hard refresh: **Ctrl+Shift+R**. |
| Students still see old questions | Re-run the matching Block 4 release button: course, ASVAB, or coordinated SAT/ACT/TSIA2. |
| **"Functions deploy had errors"** / several functions failed | See the section below — this one is expected occasionally and is not a code problem. |
| **Hosting upload `ConnectTimeoutError` / `retries exhausted`** | Run `npm run deploy:hosting`. The helper throttles Firebase's upload concurrency and retries transient upload failures automatically. |
| **`Functions NOT verified (sha-mismatch)`** at the end of a release | The functions are not serving your commit — or report `unknown`, meaning the stamp did not reach the upload (check the first predeploy step and the `ignore` list in `firebase.json`). Run the `Finish with:` command it printed. Rules and Hosting were held back on purpose. |
| **`Functions NOT verified (unreachable)`** | `platformBuildInfo` did not answer. Check with `node scripts/release-firebase.mjs --whats-live`; if it answers there, run the `Finish with:` command. |
| **A button says "did not go through: the server did not answer (Cloud Function "…")"**, or a callable fails with `internal` while the rest of the app works | That function is most likely closed to browsers. Run `node scripts/verify-callable-access.mjs --fix`. See "A callable that answers nothing" below. |
| **`Browser access NOT verified`** at the end of a release | A callable is still closed to browsers, or `gcloud` could not check. Run the `Finish with:` command it printed. Rules and Hosting were held back on purpose. |
| Hosting refuses with uncommitted `coursePathReleaseV2.manifest.json` / `pathReleaseManifest.generated.js` | The course Path content changed and the rebuilt release was not committed. Commit both files (the build only rewrites them when the certified release changed), then deploy again. |

---

## A callable that answers nothing ("internal")

A teacher presses a button and sees *"… did not go through: the server did not
answer (Cloud Function "teacherTestCycleAction")"*, every time, on a working
connection, while the rest of the app works. The same callable works in the
emulator.

The most likely cause is that the function's Cloud Run service does not let
browsers in. A browser can only call a callable when its service grants `allUsers` the
`roles/run.invoker` role. MathMaster still checks who is calling inside every
function, so this binding only lets the request in to be asked. The Firebase
CLI grants it **once, when it creates the function**, and never on a later
deploy. If that one grant failed (Google throttles IAM changes during a big
deploy), the function is deployed and healthy and every browser gets a 403.
The browser cannot read that 403, so the Firebase client reports `internal`.
Redeploying the function reports success and changes nothing.

Check every callable, and open the ones that are closed:

```
cd ~/mathmaster-platform && node scripts/verify-callable-access.mjs --fix
```

It lists every callable that is closed, not deployed, or whose last deploy did
not finish. For a closed one, `--fix` grants the binding and reads it back.
That is the only change it ever makes. It never deploys: for a function that
needs a deploy, it prints the command. It never touches the schedulers, which
stay private on purpose. Without `--fix` it only reports. To check one function
the way a browser does, add `--functions teacherTestCycleAction --probe`. If
that passes and the button still fails, the function itself is failing. The
script prints the `gcloud functions logs read …` command to read its log.

`node scripts/release-firebase.mjs --execute` now runs the same check, with
`--fix`, after every functions deploy. A callable that is still closed holds
back rules and Hosting, like a function that did not deploy.

## If several functions fail to deploy

This is the common one, and it usually means nothing is wrong with the code.

The project ships **about 160 Cloud Functions from one codebase** (166 on 2026-10-01, after PR #410; `node scripts/lib/functionsInventory.mjs | wc -l` prints today's number). `firebase deploy`
pushes them in big parallel batches, and Google rate-limits how many function
updates a project may make per minute. Past that ceiling the extra ones come
back as failures. Hosting and Firestore rules still went out fine; only some
functions are stale.

The giveaway is that the failures name *different* functions each time you try,
or the error text mentions **quota**, **rate**, **429**, **too many requests**
or **operation timed out**. If the same one or two functions fail every single
time with the same message, that is a real error — jump to step 3.

### Step 1 — retry exactly what the CLI told you to

When it fails, the CLI prints a ready-made command near the bottom, like:

```
To try redeploying those functions, run:
    firebase deploy --only "functions:listClasses,functions:saveClass"
```

Copy that line, add the project, and run it:

```
cd ~/mathmaster-platform && firebase deploy --only "functions:PASTE_THE_NAMES_HERE" --project mathmaster-aleks
```

Most of the time this finishes clean, because you are now deploying a handful
instead of all of them.

### Step 2 — if it keeps failing, let the release script pace it

```
cd ~/mathmaster-platform && git pull origin main && node scripts/release-firebase.mjs --only functions
```

That prints the plan — every function, in groups of eight, 45 seconds apart.
Add `--execute` to run it (it asks you to type the project id). A group that
hits the quota waits and retries; a group that keeps failing is split in half
until the one function that is really broken is named, and the rest still
ship. Then it asks `platformBuildInfo` which commit is live and refuses to go
on unless it is yours (see "Which commit is live"). It finishes with the exact
command to retry what is left, and writes a report under `release-reports/`.
`--functions name1,name2` deploys only those (plus `platformBuildInfo`).

### Step 2 (older script) — deploy them a few at a time

This walks the whole list in groups of ten, waits between groups so the
per-minute quota refills, and retries a group that fails. It takes roughly
20–30 minutes and needs no babysitting.

```
cd ~/mathmaster-platform && git pull origin main && bash scripts/deploy-functions-in-groups.sh
```

It prints `All N functions deployed.` at the end (N is every function the entry point exports, about 150). If some still fail it lists
them by name and prints the exact command to retry just those.

Smaller groups if the network is unhappy:

```
cd ~/mathmaster-platform && GROUP_SIZE=5 bash scripts/deploy-functions-in-groups.sh
```

### Step 3 — if the same functions fail every time

Then it is a real error and I need to see it. Run this and send me everything
it prints:

```
cd ~/mathmaster-platform && firebase deploy --only functions --project mathmaster-aleks 2>&1 | tail -60
```

Two causes worth knowing about:

- **Missing secrets.** The Google Classroom functions need three secrets to
  exist. Check with `firebase functions:secrets:access GOOGLE_OAUTH_CLIENT_ID --project mathmaster-aleks`
  (repeat for `GOOGLE_OAUTH_CLIENT_SECRET` and `LINK_ENCRYPTION_KEY`). If one is
  missing, every Classroom function fails and nothing else does.
- **A disabled API.** A first-time deploy needs Cloud Build, Artifact Registry
  and Cloud Run enabled. The error names the API and gives a link that turns it
  on.

### Checking what actually landed

```
cd ~/mathmaster-platform && firebase functions:list --project mathmaster-aleks | wc -l
```

About 150 functions plus a header row or two (compare with `node scripts/lib/functionsInventory.mjs | wc -l`). Far fewer means the retry is still owed.

### Starting over

Nothing here is destructive. If the Cloud Shell copy gets into a strange state,
throw it away — the code is on GitHub — then run Block 2, which re-clones:

```
cd ~ && rm -rf mathmaster-platform
```
