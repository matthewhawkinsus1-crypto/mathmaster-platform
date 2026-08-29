# MathMaster — My Math Path Runtime + Content Coverage Repair

Date: 2026-08-23
Target: current MathMaster `main` / Firebase project `mathmaster-aleks`

## What this repair addresses

This pass was triggered by a live student account reaching My Math Path but every skill launch ending with `internal`, plus the Administration → My Math Path content coverage screen still carrying older assumptions and opaque seed/import failures.

### 1. Coverage is now server-authoritative

Coverage no longer accepts a browser-supplied wheel/TEKS map. The server derives course standards directly from the canonical Texas standards registry and combines that with:

1. the secure `pathQuestionBank`, and
2. the same production issuer/grader that prepares student questions.

Teacher assignments do not create, remove, or map Path coverage.

The five active Path courses are now first-class coverage courses:

- Grade 6
- Grade 7
- Grade 8
- Algebra I
- Algebra II

The old server rule that treated every non-`A2.*` standard as Algebra I is removed. Grade 6/7/8 standards now resolve to their own course coverage documents.

### 2. The Grade 6–8 browser wheel fallback is fixed

`strandConfig.js` previously had only Algebra I/II strands. Asking it for Grade 6, Grade 7, or Grade 8 silently returned Algebra I. That was a real mapping defect.

Grade 6–8 now get their own canonical content standards and `courseIdForTeks()` correctly recognizes `6.*`, `7.*`, and `8.*`.

### 3. Built-in bank refresh is authoritative instead of `merge:true`

The old seed write used Firestore `merge:true`. That meant if a question changed type or stopped using an old tool field, the old field could survive in Firestore even though the new seed no longer contained it. A refresh could therefore appear to update a document while stale grader/tool metadata remained.

Built-in/custom seed writes now replace each question document instead of merging old and new question shapes.

This is especially important for the reported “types refuse to update” behavior.

### 4. The initializer no longer rebuilds coverage twice

The server initializer already:

- validates the bundled bank,
- writes it,
- removes superseded built-in questions, and
- rebuilds coverage.

The browser then called `rebuildPathCoverage()` a second time. That meant a successful initialization could do a second expensive full validation and then surface that later failure as if initialization itself failed.

The browser now uses the coverage returned by the initializer and does not launch a redundant rebuild.

### 5. Seed/import failures are actionable

Rejected documents now report:

- question ID
- family ID
- standard
- course
- assessment framework
- question type
- Path tool/interaction
- rejection reason
- diagnostic ID when the validator itself threw

The admin screen groups failures by:

- reason
- question type
- tool/interaction
- course

Common reasons are translated into plain English instead of only showing raw identifiers such as `no_server_grader_for_this_tool`.

### 6. One bad bank record no longer turns the whole Path into `internal`

Template validation is now guarded per document. If one malformed/stale bank record makes the validator throw, that record is treated as non-issuable, logged with a diagnostic ID, and the rest of the bank continues to be evaluated.

This guard is used by:

- seed validation
- coverage rebuild
- live coverage verification
- assessment-framework checks
- question selection
- targeted skill diagnostics

### 7. Student runtime errors now carry a useful diagnosis

Unexpected failures in `startMyMathPathSession` and `issueNextQuestion` are logged server-side with a diagnostic ID and returned as a safe Firebase callable error containing:

- operation
- reason
- diagnostic ID

The student client converts bare `functions/internal` into a useful service message instead of displaying only `internal`.

### 8. Administration now has “Why won’t this skill start?”

A new root-admin callable, `diagnosePathSkill`, diagnoses a standard directly against the live secure bank without returning prompts, expected answers, generator parameters, or private grading definitions.

The admin screen can show:

- bank matches
- active matches
- format matches
- issuable documents
- distinct issuable families
- live launchability
- saved coverage vs live-bank disagreement
- rejection groups
- rejected IDs/types/tools/reasons/diagnostic IDs

Each coverage row also has a **Check** button.

### 9. Legacy assignment → Path promotion is retired

The teacher UI no longer offers **Add to Path Bank…**. The old callable remains only as a compatibility endpoint that explicitly refuses the operation and explains that Path coverage is bank-managed now.

Existing custom/previously promoted bank records are not deleted by this repair; they remain secure bank content unless separately withdrawn.

## Bank validation performed in this pass

The complete bundled bank was checked locally with the production `buildTemplateIssuePlan` logic:

- Total bundled templates: **5,186**
- Passed production template validation: **5,186**
- Rejected: **0**

The live student example standard `A.5A` was checked specifically:

- course families found: **5**
- issuable: **5 / 5**

`A.2A`, `A.2B`, and `A.2C` were also checked at **5 / 5 issuable** each.

This means the bundled source itself is not the explanation for the current Algebra I `internal` launch. The repair targets the two concrete runtime/storage risks found in the code: partially deployed Path functions and stale Firestore question fields surviving seed merges.

## Honest canonical middle-school coverage after this repair

Because the old coverage map was derived from what happened to exist in the seed, it could hide standards that had no bank content. Canonical coverage now exposes those gaps instead of pretending they are outside the course.

With the current bundled course bank:

- Algebra I: **49 / 49** content standards launchable
- Algebra II: **48 / 48** launchable
- Grade 8: **43 / 45** launchable — missing `8.12E`, `8.12F`
- Grade 7: **40 / 43** launchable — missing `7.13B`, `7.13C`, `7.13D`
- Grade 6: **45 / 52** launchable — missing `6.14A`, `6.14B`, `6.14D`, `6.14E`, `6.14F`, `6.14G`, `6.14H`

Those 12 middle-school standards are now visible as real content gaps. This repair does not invent filler questions to make the report green.

## Validation completed

Source syntax:

- Native JS/MJS syntax: **519 / 519 passed**
- JSX parse: **156 / 156 passed**

Regression suite:

- Tests discovered: **1,785**
- Passed: **1,743**
- Environment-blocked: **42**
- Runnable assertion failures: **0**

The 42 blocked tests are the same dependency-only class seen in the prior completion validation: this extracted workspace does not have `mathjs`, `firebase`, or `@firebase/rules-unit-testing` installed. No runnable test assertion failed.

New regression coverage includes:

- all 5,186 built-in templates pass the production issuer
- browser no longer supplies coverage maps
- all five course IDs map to their own canonical standards
- initializer does not launch a second coverage rebuild
- seed refresh uses replacement writes rather than merge writes
- assignment promotion is retired
- skill diagnosis is present
- Cloud Functions `mathPath.*` references all exist in the runtime module
- startup dependency ordering remains fixed

## Files changed

- `functions/index.js`
- `functions/shared/rolePolicy.mjs`
- `src/App.jsx`
- `src/components/teacher/PathCoverageAudit.jsx`
- `src/platform/mastery/strandConfig.js`
- `src/platform/path/pathCoverageService.js`
- `src/platform/path/pathRelease.js`
- `src/services/pathSessionService.js`
- `tests/platform/appStartupOrdering.test.mjs`
- `tests/platform/pathBuiltInBankValidation.test.mjs`
- `tests/platform/pathCoverageArchitectureV2.test.mjs`
- `tests/platform/pathRuntimeExportCompatibility.test.mjs`

## Deployment

Apply these files on top of the current GitHub `main`, build, commit, and push.

Because the project recently hit Cloud Functions mass-update failures, deploy only the Path functions affected by this repair in two small batches.

### Function batch 1 — bank/admin

- `getPathRuntimeStatus`
- `seedPathQuestionBank`
- `initializeStarterPathQuestionBank`
- `rebuildPathCoverage`
- `diagnosePathSkill`

### Function batch 2 — student/runtime + retired compatibility actions

- `startMyMathPathSession`
- `issueNextQuestion`
- `submitPathResponse`
- `withdrawQuestionFromPathBank`
- `promoteQuestionToPathBank`

Then deploy Firebase Hosting from the same commit.

No Firestore rules change is part of this repair.

## Required post-deploy browser action

Sign in as the root administrator and open:

**Administration → My Math Path content coverage**

1. Confirm web/server release IDs match.
2. Press **Initialize / refresh built-in starter bank** once. This replacement-write refresh is what removes stale old question fields from Firestore.
3. Wait for **Import complete**.
4. Select Algebra I and confirm 49 / 49 are student-ready.
5. Use **Why won’t this skill start?** and diagnose `A.5A` as Course practice. It should report 5 issuable families and **LIVE BANK CAN LAUNCH**.
6. Re-test the student account.

If a student still gets a service error, the new message will include a diagnostic ID. Use that ID in the admin diagnostic/Cloud Functions logs rather than receiving only `internal`.
