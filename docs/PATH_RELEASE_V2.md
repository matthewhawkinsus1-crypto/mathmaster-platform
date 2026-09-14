# Path Release V2

How built-in **My Math Path course content** (Grade 6, Grade 7, Grade 8,
Algebra I, Algebra II) gets from an authored file into a classroom, and what
happens when something goes wrong.

There is an [OPERATIONS](#operations) section at the end written for an
administrator who does not read code. If you are here because a release failed,
start there.

---

## Why this exists

The old workflow was one button that did everything, every time:

* `refreshBuiltInCoursePathBank` validated the entire built-in package,
* `processPathSeedImport` validated it **again** during the write pass,
* `rebuildStoredPathCoverage` then read the live bank and validated every
  template a **third** time,
* every course document was rewritten whether or not it had changed,
* and if any of that stopped part way, there was no way to resume it — only to
  run the whole thing again and hope.

Three production failures came out of that shape:

| Symptom | Cause |
| --- | --- |
| `FUNCTIONS_DISCOVERY_TIMEOUT=60` needed to deploy | `platformEntry.js` → `entry.js` → `index.js`: Firebase loaded ~12,000 lines of the mature backend just to *discover* the functions |
| `HTTP 429 Per project mutation requests per minute per region` | changing one administrative Path function redeployed the whole default codebase, mutating hundreds of unrelated functions |
| `INVALID_ARGUMENT: Property array contains an invalid nested entity` | authored content reached production before anything proved its **final Firestore storage shape** was legal |

That last one is worth being precise about, because it was not one bad document.
Firestore cannot store an array directly inside another array. The built-in
course content authors several of those naturally:

```
stimulus.table.rows            [[ "x", "y" ], …]      Grade 6/7/8, Algebra I/II
variants[].stimulus.table.rows [[ "x", "y" ], …]      Algebra I/II
stimulus.graph.curves[].points [[ x, y ], …]          Algebra I
points                         [[ x, y ], …]          Algebra II
variants[].points              [[ x, y ], …]          Algebra II
matrix.rows                    [[ 1, 1, 1, c ], …]    Algebra II
```

The old sanitiser rewrote the first of those. PR #228 added the second. The
remaining four were still being sent to Firestore as illegal nested arrays, so
the batch containing them failed — and because a Firestore batch is atomic, one
bad document failed a whole chunk of a release with a message that named no
document, no property and no course.

---

## Architecture

```
   AUTHORED CONTENT                       functions/seeds/pathQuestionBank/*.json
   (2-D tables, coordinate pairs,         grade6 grade7 grade8 algebra1 algebra2
    matrix rows, optional fields)
           │
           │  scripts/build-course-path-release-v2.mjs        BUILD / CI
           ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │ COMPILE      functions/lib/pathContentCompiler.js                    │
   │              one boundary, one set of rules, used by everything      │
   │                                                                      │
   │   table rows   ->  [{ cells: [...] }]                                │
   │   point pairs  ->  [{ x, y }]                                        │
   │   undefined    ->  dropped (object) / null (array slot)              │
   │   anything else that nests an array  ->  FAILS with the exact path   │
   │                                                                      │
   │ CERTIFY      recursive Firestore-shape validator, run on the         │
   │              COMPILED output, independently of the compiler          │
   │              + the PRODUCTION ISSUER on sampled generated instances  │
   │                                                                      │
   │ HASH         stable content hash per document; the release is named  │
   │              by the hash of its documents                            │
   └──────────────────────────────────────────────────────────────────────┘
           │
           │  release artifact
           ▼
   functions-path-admin/release/
     coursePathReleaseV2.manifest.json    ids + hashes + counts   (committed)
     coursePathReleaseV2.documents.json   ANSWER-BEARING          (never committed,
                                                                   never on Hosting)
   src/platform/path/pathReleaseManifest.generated.js
     release id + hash + counts only                              (browser bundle)
           │
           │  firebase deploy --only functions:path-admin
           ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │ path-admin CODEBASE            functions-path-admin/                 │
   │   tiny entry point; requires only firebase-functions/v2/https and    │
   │   firebase-admin/app at discovery. Everything else is lazy.          │
   │                                                                      │
   │   getCoursePathReleaseStatusV2   publishCoursePathReleaseV2          │
   │   getCoursePathReleaseJobV2      resumeCoursePathReleaseV2           │
   └──────────────────────────────────────────────────────────────────────┘
           │
           │  Administration → My Math Path content coverage
           ▼
   VALIDATE ──► STAGE ──► ACTIVATE ──► COVERAGE ──► VERIFY ──► COMPLETE
      │            │          │            │           │
      │            │          │            │           └ re-read production:
      │            │          │            │             pointer, index size,
      │            │          │            │             sampled stored hashes
      │            │          │            └ rebuild ONLY the courses that
      │            │          │              changed, reusing the build-time
      │            │          │              issuer verdict for unchanged bytes
      │            │          └ flip pathReleaseState/course to active, write the
      │            │            document index, THEN delete superseded documents
      │            └ write only added + changed documents, in resumable chunks,
      │              recording each chunk in pathReleaseJobs/{jobId}/chunks
      └ manifest structure, schema support, hashes, Firestore-shape certification
        of the documents about to be written. Nothing is mutated in this phase.
```

### Firestore

| Path | What it holds |
| --- | --- |
| `pathQuestionBank/{id}` | unchanged. The student runtime reads exactly what it read before. Release documents gain `pathReleaseId`, `pathContentHash`, `pathReleaseSchemaVersion` |
| `pathReleaseState/course` | which release production is serving, and whether it is `active` or `updating` |
| `pathReleaseState/course/documentIndex/{shard}` | the active release's id → content-hash map, in shards of 400 |
| `pathReleaseJobs/{jobId}` | one resumable job per release: phase, actor, counts, chunk progress, last error |
| `pathReleaseJobs/{jobId}/chunks/{index}` | the durable write plan, one document per chunk |

**The job id is the release id.** That single decision is the whole idempotency
story: publishing the same release twice finds the same job, so it never creates
a second one, never rewrites a committed chunk, and never activates twice.

---

## What happens when content changes

1. An author edits a seed file under `functions/seeds/pathQuestionBank/`.
2. `npm run release:path:build` compiles and certifies everything, and writes a
   new manifest. Because the release id is derived from the content hash, a
   changed document produces a new release id; unchanged content produces the
   **same** release id it had before.
3. CI runs `npm run release:path:verify`, which rebuilds from the seeds and fails
   if the committed manifest disagrees with them.
4. `npm run deploy:path-admin` ships the certified package.
5. An administrator opens **Administration → My Math Path content coverage**. The
   page says *Activation required* and names the deployed and active release ids.
6. **Publish certified course Path release** compares the incoming manifest with
   the stored document index and reports four numbers: added, changed,
   unchanged, superseded. It writes only the added and changed documents.

A one-question change therefore writes **one document**, rebuilds **one course's**
coverage, and runs the issuer **zero** times — the build already proved those
exact bytes, and the verdict is pinned to the content hash.

---

## What happens when activation fails

Nothing is left ambiguous, and nothing is half-published:

* **During validation** — no live document has been touched. The release is
  refused with the question id, the family id, the property path, a machine code
  and a recommended next action.
* **During staging** — `pathReleaseState/course` says `updating`, not `active`.
  Committed chunks are recorded; uncommitted ones are not. Superseded documents
  are still there, because cleanup has not run.
* **During activation, coverage or verification** — every replacement document is
  already written. The job records the phase it failed in and resumes there.

In every case the job document holds a structured diagnostic:

```json
{
  "phase": "staging",
  "code": "path-release/stage-write-failed",
  "releaseId": "course-path-v2-605951fe94fedd2b",
  "jobId": "course-path-v2-605951fe94fedd2b",
  "questionId": "mm_A2_4E_v2_quadratic-regression-table",
  "propertyPath": "variants[2].stimulus.table.rows[1]",
  "recoverable": true,
  "nextAction": "Choose Resume release. Completed chunks are not rewritten."
}
```

The admin page renders those fields. An administrator should never need to open
Cloud Functions logs for a content or data-validation failure.

## How resume works

The write plan is **written down** when the job is created, one Firestore
document per chunk. Resuming reads that plan back rather than deriving a new one.

This matters more than it looks. Documents an interrupted attempt already wrote
are correctly seen as *unchanged* the next time a comparison runs — so a freshly
derived plan would contain fewer chunks, renumber them, and skip the wrong ones.
Following the recorded plan makes "continue at chunk N+1" mean what it says.

Resume is not a special path: **Publish** and **Resume release** call the same
engine. A release that runs out of its server time budget returns
`continue: true` and the admin page calls again, which is the same mechanism an
interrupted release uses to finish. The path that recovers from a failure is the
path that runs every time, so it cannot rot.

---

## Deploying

**The supported command:**

```bash
npm run deploy:path-admin
```

which is exactly:

```bash
npm run release:path:build     # compile + certify + write the artifact
npm run release:path:sync      # carry the shared Path runtime into the bundle
firebase deploy --only functions:path-admin
```

This deploys **four functions**. It does not touch the default codebase, so it
cannot trigger the per-project mutation rate limit, and it does not need
`FUNCTIONS_DISCOVERY_TIMEOUT`.

Other useful commands:

| Command | What it does |
| --- | --- |
| `npm run release:path:build` | compile, certify and write the release artifact |
| `npm run release:path:verify` | CI gate: fail if the committed manifest and the seeds disagree |
| `npm run test:path-release` | the Path Release V2 unit and contract suite |
| `npm run test:path-release:emulator` | interrupted multi-chunk release against real Firestore |
| `firebase deploy --only firestore:rules` | required once, for the new collections |

### Why there is a `vendor/` directory

Firebase packages a codebase's **own** source directory. `functions-path-admin/`
is uploaded; `functions/` is not. `scripts/sync-path-admin-runtime.mjs` copies
the shared Path runtime into `functions-path-admin/vendor/` at predeploy.

It is a copy, not a fork:

* `vendor/` is generated and gitignored,
* a platform test fails if any vendored file differs from its source,
* and in the repository the resolver prefers `functions/`, so tests, the
  emulator and local development always read the one real source.

---

## Rolling back

A release is a content hash, and the previous release is still a build of the
repository, so rollback is a normal publish of an older release:

1. `git checkout <commit before the change> -- functions/seeds/pathQuestionBank`
2. `npm run release:path:build` — this reproduces the **previous release id**
   exactly, because the id is derived from the content.
3. `npm run deploy:path-admin`
4. Publish it from the admin page.

The comparison runs in reverse: documents that the newer release changed are
changed back, documents it added are superseded, and everything else is left
alone. `pathReleaseState/course` records `previousReleaseId` at every activation,
so you can always see what production was serving before.

If you need to roll back only the control plane and not the content, redeploy the
previous `path-admin` build. The active release pointer is data, not code, so it
survives.

## Verifying production

From the admin page — **Re-check** reports:

* the deployed certified release id and hash,
* the active production release id and hash,
* whether activation is required,
* whether a job is running, interrupted or failed,
* whether this browser bundle matches the deployed package.

From a console, if you want to see it directly:

```
pathReleaseState/course                  status == "active", releaseId, contentHash
pathReleaseJobs/{releaseId}              phase == "complete", counts
pathCoverage/{courseId}                  summary, per-standard studentReady
```

`npm run test:path-release:emulator` reproduces the whole lifecycle, including an
interruption, against a real Firestore.

## Retiring the legacy flow

Nothing has been deleted. `refreshBuiltInCoursePathBank`, `seedPathQuestionBank`,
`rebuildPathCoverage`, the ASVAB refresh and the coordinated SAT/ACT/TSIA2
refresh are all still deployed and still work.

What changed is which one the admin page offers. The certified release control is
now the normal route for course content; the old one-shot refresh has moved into
a collapsed **Deprecated** block, marked as superseded and kept only as a
recovery route. It should be removed once V2 has been used through a few
production releases.

**ASVAB and SAT/ACT/TSIA2 are untouched by this project.** They keep their own
independent, coordinated release manifests and their own buttons. A course
release never reads, validates, writes or supersedes an assessment-framework
document, and a test asserts it.

---

## Measurements

Taken on the repository's real built-in course content (1,161 families), against
the Firestore emulator, with `scripts/build-course-path-release-v2.mjs` and the
release engine as they are committed. Firestore operations are counted at the
engine's own boundary.

| Measurement | Result |
| --- | --- |
| path-admin discovery-time module load | two Firebase modules (`firebase-functions/v2/https`, `firebase-admin/app`); everything else is lazy |
| path-admin release engine + store + coverage module load | **0.1 ms** (first call only; discovery never pays it) |
| Full compile + certify, 12 sampled instances per family | **1.27 s** for 1,161 documents |
| Release comparison against the stored index | **3 document reads** (one shard per 400 documents) |
| **Unchanged release** | **17 ms · 2 reads · 0 writes · 0 commits** — answered "already active" |
| **One-question change** | **1.07 s · 1 question-document write** (11 writes in total, the other 10 being the job, index and pointer bookkeeping) · 1 batch commit |
| Coverage after a one-question change | **1 course** rebuilt, 4 skipped · **0 issuer runs** (1,161 certified verdicts reused) |
| Full first activation, 1,161 documents, chunks of 200 | **5.4 s** · 1,161 question writes · **6 batch commits** · 0 issuer runs |
| Interrupted release: stage 1 of 3 chunks, resume, complete | **6.9 s** total; the committed chunk is not rewritten |

For comparison, the legacy `refreshBuiltInCoursePathBank` rewrote all 1,161
documents on every run whatever had changed, validated the package three times,
and ran the production issuer over the whole course bank during the coverage
rebuild.

The remaining ~1,161 reads in a one-question release are the coverage rebuild's
single metadata pass over the course bank. That pass reads documents; it does not
validate them, and it never reads, validates or rebuilds Digital SAT, ACT, TSIA2
or ASVAB content.

The "unchanged release performs approximately zero question-document writes"
target is met exactly: zero.

---

## OPERATIONS

*For the MathMaster administrator. No code required.*

### Publishing new course content

1. Open **Administration → My Math Path content coverage**.
2. Look at the **Course Path release** panel at the top. It tells you one of:

   | It says | What it means | What to do |
   | --- | --- | --- |
   | **Production is current** | Students are already getting this content. | Nothing. |
   | **Activation required** | New certified content is deployed but not live yet. | Press **Publish certified course Path release**. |
   | **Release in progress** | A release is running right now. | Wait. The phase list shows where it is. |
   | **Resume release** | A release stopped part way. | Press **Resume release**. It continues where it stopped. |
   | **Release failed** | Something was refused. | Read the red box. It names the problem and the next step. |
   | **Deployment mismatch** | This page and the server are from different deployments. | Reload. If it persists, ask for Hosting and path-admin to be deployed together. |
   | **No certified release is deployed** | The server has no release package. | Ask for `npm run deploy:path-admin` to be run. |

3. While it runs you will see each step tick over: *Certified release detected →
   Comparing with production → Staging 2 / 6 → Activating → Rebuilding coverage →
   Verifying → Complete.*
4. When it finishes it reports four numbers — **added, changed, unchanged,
   superseded** — and which courses had their coverage rebuilt.

### If it stops or fails

* **You can always press the button again.** Publishing a release that is already
  live answers *"Production is already serving this certified release"* and
  changes nothing. Resuming one that stopped continues from where it stopped. You
  never have to delete anything or start over.
* **Students are never shown a half-built release.** Until activation succeeds,
  the release status stays *updating* and the previous content is still what is
  being served. Old content is only removed after every replacement has been
  written.
* **The red box tells you which kind of problem it is.** If it says
  *Recoverable*, press **Resume release**. If it does not, the content itself
  needs fixing — send whoever authored it the question id and the property path
  from the message, for example
  `mm_A2_4E_v2_quadratic-regression-table` at `variants[2].stimulus.table.rows[1]`.

### What this control does NOT touch

The **ASVAB** and **SAT / ACT / TSIA2** releases are separate and have their own
buttons further down the page. Publishing a course release cannot change them.

### Who can do this

Only the MathMaster root administrator. A teacher or a student is refused, and
the refusal names the account that is allowed.
