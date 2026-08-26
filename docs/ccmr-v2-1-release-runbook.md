# CCMR Fidelity V2.1 Release Runbook

## Purpose

This runbook is the controlled production procedure for the coordinated **CCMR Fidelity V2.1 — Authentic Language** release.

The coordinated release contains only:

- Digital SAT — **664** production question families
- ACT — **136** production question families
- TSIA2 — **200** production question families
- Coordinated total — **1,000** production question families

**ASVAB is not part of this release. Do not seed, refresh, withdraw, or otherwise modify ASVAB as part of this procedure.**

The release is designed so that students keep prior evidence and completed work, an already-issued question can be completed, and a stale or empty assessment session cannot begin issuing questions from a partially refreshed bank.

---

## Release prerequisites

Do not begin the production release unless all of the following are true:

1. The permanent `CCMR V2.1 Release Integration Audit` is green on the exact commit being released.
2. Digital SAT, ACT, and TSIA2 authoring release checks are green.
3. The unified production release coordinator reports the expected 664 / 136 / 200 inventory and matching production mirrors.
4. The web client includes the content-release rollover behavior.
5. The Functions runtime includes the atomic `pathContentReleases/current` manifest behavior.
6. No other assessment-bank release operation is intentionally in progress.
7. The person performing the bank refresh has root-admin access.

Do not use the generic Path seed importer, the starter initializer, or individual-question withdrawal as a substitute for the coordinated refresh.

---

## Production release order

### 1. Deploy Firebase Functions first

Deploy the Functions runtime before changing the live assessment banks.

The Functions deployment must include:

- atomic assessment release-manifest reads;
- hold behavior while a tracked release is updating;
- stale-session rollover behavior;
- same-operation / same-release retry protection;
- protection against individual withdrawal of released SAT, ACT, or TSIA2 questions; and
- the root-admin `refreshReleasedCcmrPathBanks` callable.

The Firebase Functions predeploy regenerates and checks the unified Digital SAT + ACT + TSIA2 production release files. **It does not itself refresh the live Firestore question bank.**

### 2. Deploy the web client

Deploy the student web client containing the release-rollover support before switching the live bank.

The client must be able to receive the server rollover response, restart the same assessment/week/slot launch configuration, and show the student a plain-language practice-updated notice.

### 3. Reconfirm the permanent release audit

Before the live bank switch, confirm that the permanent release integration audit is green for the code/content commit being released.

Expected production inventory:

| Framework | Expected families |
| --- | ---: |
| Digital SAT | 664 |
| ACT | 136 |
| TSIA2 | 200 |
| Total | 1,000 |

Also confirm that the root and Functions production mirrors are equal and that ASVAB is absent from the coordinated release package.

### 4. Run the root-admin coordinated bank refresh

Invoke the production `refreshReleasedCcmrPathBanks` callable as a root administrator.

Do not run three independent framework imports.

The callable performs the release in this order:

1. Loads the fixed Digital SAT, ACT, and TSIA2 release package.
2. Validates the complete package in dry-run mode **before** blocking new issuance.
3. Confirms the package contains exactly the coordinated frameworks and no ASVAB content.
4. Places the tracked assessment release manifest in `updating` state.
5. Writes the three released banks and removes superseded built-in records only inside those coordinated frameworks.
6. Activates the new manifest only after all bank writes finish successfully.

While the manifest is `updating`:

- a student who already has an issued question may finish that question;
- an empty tracked assessment session cannot receive a new question from the partially refreshed bank; and
- stale sessions are not allowed to mix old- and new-release questions.

### 5. Verify the live release

After the callable succeeds, verify:

- the manifest is `active`, not `updating`;
- Digital SAT has 664 released production families;
- ACT has 136 released production families;
- TSIA2 has 200 released production families;
- no coordinated framework has a mixed active release marker;
- the production mirrors still match the audited release files;
- ASVAB content is unchanged;
- a new SAT, ACT, and TSIA2 Path launch can issue a question;
- a stale empty pre-release assessment session rolls over rather than issuing an old-bank question; and
- previously recorded student evidence/history remains available.

---

## Failure recovery

### Failure before the manifest enters `updating`

If full-package validation fails before the manifest is held, correct the release package and rerun the normal verification. The live assessment release has not been switched.

### Failure after the manifest enters `updating`

If a bank write fails after the manifest has entered `updating`:

1. **Do not use the generic seed importer.**
2. **Do not use `initializeStarterPathQuestionBank`.** It is for a fresh empty installation, or recovery of its own `starter-initialization` operation only.
3. **Do not withdraw individual SAT, ACT, or TSIA2 questions.**
4. Leave the manifest held. This prevents new questions from being issued from a partial release.
5. Confirm the deployed release package has not changed.
6. Retry `refreshReleasedCcmrPathBanks` with the **same pending Digital SAT / ACT / TSIA2 release package**.

The runtime rejects a retry if the held operation is not `coordinated-refresh` or if the pending release map differs from the package being retried. This prevents a failed partial release from being silently replaced by a different release.

Students who already had a question issued before the failure may complete that issued question. Student evidence and history must not be deleted as part of recovery.

If a different release must be deployed instead of completing the held release, treat that as an explicit recovery event; do not bypass the manifest protections with manual Firestore edits or generic import tools.

---

## Operations that are intentionally blocked

For Digital SAT, ACT, and TSIA2 release-managed banks:

- generic live seed writes are blocked;
- one-question withdrawal is blocked;
- starter initialization cannot be used as a live-bank refresh;
- a coordinated refresh cannot overwrite another kind of held release operation; and
- a coordinated refresh retry cannot switch to a different pending release package.

These restrictions protect the guarantee that an `active` release is the same complete bank that passed the release audit.

---

## Rollback principle

Do not perform a destructive rollback by deleting student evidence or session history.

If a production rollback is ever required, prepare the previously approved SAT/ACT/TSIA2 package as another coordinated release package and run it through the same validation, manifest hold, coordinated write, and activation sequence. The release mechanism should move the active content version; historical evidence remains historical evidence.

---

## Release sign-off checklist

- [ ] Exact release commit identified
- [ ] Permanent CCMR V2.1 integration audit green
- [ ] Digital SAT full authoring release check green
- [ ] ACT full authoring release check green
- [ ] TSIA2 full authoring release check green
- [ ] Unified production release check green
- [ ] Counts are 664 SAT / 136 ACT / 200 TSIA2
- [ ] Root and Functions production mirrors match
- [ ] ASVAB confirmed excluded
- [ ] Functions deployed first
- [ ] Web rollover client deployed second
- [ ] Root-admin coordinated refresh completed
- [ ] Manifest confirmed `active`
- [ ] New SAT/ACT/TSIA2 issuance smoke-tested
- [ ] Stale-session rollover smoke-tested
- [ ] Existing evidence/history confirmed intact

Do not mark the release complete until every applicable item above has been verified.
