# Assignment Content Versioning and Live V2 Swapper Design

## Goal

Give MathMaster an explicit, human-visible assignment content version system so a corrected assignment can be released as **Content V2**, found easily in the Library, and safely promoted onto an already-assigned live copy without breaking student history, MathMaster assignment links, or Google Classroom posts.

This is **content versioning**, not a new assignment schema. **schemaVersion remains 5 everywhere.**

## Why this is not redundant

This design builds on rather than recreates merged work:

- **PR #152 — Question Review & Repair Workspace:** reuse flagged-question review, immutable question IDs, revision/history checks, and its delivered-assignment safety boundary.
- **PR #117 / #123 — Safe Live Repair:** reuse response-entry safety analysis, protected question identity/index rules, and student tracker repair behavior.
- **PR #166 — Assignment runtime self-healing:** keep deterministic platform-only runtime repairs separate from authored content releases. A runtime repair version is not Content V2.
- **PR #175 — Full Assignment Audit:** reuse admin/designated-repairer authorization, whole-assignment classifications, approved replacements, stale-revision protection, audit history, and platform-issue separation.
- **PR #177 — Classroom section grade reconciliation:** reuse section-grade reconciliation after a content upgrade changes derived grades.

The repository does not currently have persistent assignment content-family identity, teacher-visible Content V1/V2 markers, current/superseded release relationships, Library version grouping, or a controlled V1 → V2 live assignment swapper. Those are the new pieces.

## Terminology

MathMaster must keep three version concepts separate:

1. **schemaVersion: 5** — the Assignment V5 contract. Never becomes 2.
2. **assignmentRevision** — the technical stale-write counter already used by repair workflows.
3. **contentVersion** — the human-facing authored release number: Content V1, Content V2, Content V3, and so on.

UI must say **Content V2** or **Assignment Content V2** so nobody confuses this with retired Assignment Schema V2.

## Content lineage model

Add one explicit lineage object to canonical stored assignments with these fields:

- familyId: stable opaque generated family identity
- version: integer content release number
- label: V1, V2, V3...
- releaseStatus: current or superseded
- supersedesVersion: previous integer version when applicable
- sourceAssignmentId: assignment used to create this release
- createdFromAuditId: originating Full Assignment Audit when applicable
- createdAt: server timestamp
- createdBy: actor UID

Rules:

- familyId is opaque and stable across releases; do not derive identity from title text.
- Existing assignments without lineage are treated as **Content V1** when version controls are relevant.
- No global backfill is required.
- The first time V2 is created from a legacy assignment, MathMaster mints one family ID and associates source + successor with that family.
- Library releaseStatus controls what is offered for new assignment creation.
- A live assigned copy may still be running Content V1 after Content V2 becomes current in the Library. The UI must distinguish **Current family release: V2** from **This assigned copy: V1 · Upgrade available**.

## Create Content V2 from Full Assignment Audit

After an elevated user imports and reviews a valid Full Assignment Audit response, add **Create Corrected Content V2**.

Behavior:

1. Use only teacher-approved assignmentIssue replacements.
2. platformIssue and unclear findings never mutate authored content.
3. Create a new unassigned Library assignment from the current source plus approved repairs.
4. Preserve canonical V5 sections and unchanged question IDs.
5. Increment contentVersion to the next family version.
6. Start the new Library release with assignmentRevision 1.
7. Do not silently mutate an already-delivered assignment while creating the release.
8. Mark the new Library release current and the previous Library release superseded for new use.
9. Record the originating Full Audit and before/after question set in version history.

If no lineage exists yet, the source is Content V1 and the successor is Content V2.

## Library behavior

Assignments sharing a familyId group together. Default Library results show only the current release.

Example card:

**Algebra I — Module 2 Topic 1 Lesson 1: Least Squares Regression**
**Content V2 · CURRENT**

A **Version History** control reveals older releases such as:

- Content V2 — Current
- Content V1 — Superseded

An assigned live copy running an older release displays **Content V1 · V2 available**.

## Live V1 → V2 swapper

Add **Upgrade Assigned Copy to Content V2** when a newer release exists in the same family.

The assigned Firestore document ID must remain unchanged. Therefore MathMaster links, Google Classroom CourseWork IDs, section post IDs, assigned classes, dates, accommodations, and publication settings remain unchanged.

Before commit, compare V1 and V2 by immutable question ID and protected storage index. The review shows current/target content version, total questions, unchanged questions, safe response-control changes, grading-expansion changes, clarification-only changes, structural/fundamental changes, retired/replacement questions, affected students, and whether grade reconciliation will run.

The teacher explicitly approves the upgrade.

## Swap change classes

### 1. Unchanged

No student or grader change.

### 2. Safe response-control repair

Examples include plain-language text → finite choice and current Safe Live Repair domain/range choice additions.

Action: reuse the existing Safe Live Repair analyzer and tracker repair behavior. Preserve question ID, protected index, attempts, responses, and prior credit.

Do not create a second validator for changes Safe Live Repair already understands.

### 3. Grading expansion

Examples:

- add equivalent accepted answers;
- widen numeric tolerance;
- add an accepted numeric range;
- replace an exact regression estimate with a reasonable visual-estimate window when the mathematical task itself is unchanged.

This is a new safe-live category. The new grading rule must be a **superset** of the previous rule. A live upgrade may make grading more forgiving, never stricter.

Action:

- preserve question ID/index;
- re-evaluate affected saved responses;
- credit may increase but never decrease;
- preserve original responses and attempt counts;
- give a repair retry only when corrected grading still leaves unresolved work;
- request existing Classroom section-grade reconciliation when MathMaster scores change.

Implement a focused pure analyzer such as analyzeLiveGradingExpansion(beforeQuestion, afterQuestion) instead of weakening the existing response-entry analyzer.

### 4. Clarification-only content change

Prompt/guidance wording may change in place only when MathMaster can prove the scored task, answer fields, grading meaning, graph/table/quantities, standards, and tool workflow are unchanged.

Preserve ID/index and student records; no historical regrade. Store the old question snapshot in version history. If equivalence cannot be proven, classify fundamental.

### 5. Fundamental / structural correction

Examples:

- original tool never collected what the prompt requested;
- answer-field count or IDs must change;
- mathematical task changes;
- graph/table meaning changes;
- tool family changes;
- malformed question must be rebuilt.

Do not overwrite the historical question under the same identity.

Reuse the existing safe **Throw Out Safely + Duplicate** model:

1. mark the flawed live question teacherExcluded true so it remains at the protected historical index;
2. preserve all student attempts/responses/evidence for that question;
3. append a corrected replacement with a **new questionId** plus supersedesQuestionId and introducedInContentVersion;
4. give the replacement a fresh attempt budget;
5. never lower an already-earned assignment score because the flawed question was retired.

For each fundamental correction the review requires an explicit teacher choice:

- **Retire flawed question only**
- **Retire + add corrected replacement**

## Student history and fairness

A V2 upgrade must never pretend a student answered a version they did not see.

Version history must retain assignment ID, family, before/after content version, historical question ID, replacement question ID when minted, protected tracker index, migration classification, timestamp, and whether prior credit was preserved or increased.

Existing immutable evidence stays immutable. Safe in-place changes retain historical question snapshots. Fundamental replacements keep the original question excluded at its historical index and give the replacement a new ID.

## Server authority

### Create release

Add a callable such as **createAssignmentContentVersion**.

Authorization: administrator or designated assignment repairer.

It must re-check source assignmentRevision, validate the reviewed Full Audit response, mint/reuse familyId, compute the next version, prevent duplicate-version races, create the unassigned Library release, update release-status metadata transactionally, and write an immutable version event.

### Commit live upgrade

Add a callable such as **commitAssignmentContentUpgrade**.

Authorization:

- assignment owner teacher may upgrade their own assigned copy to an already-approved family release;
- administrator may upgrade any assignment;
- designated repairer follows existing repair authority.

It re-checks live assignment identity, current assignmentRevision, current contentVersion, target family/version, protected IDs/indices, every change classification, Safe Live Repair proofs, grading-expansion proofs, and explicit teacher choices for fundamental corrections.

The commit reuses current live-correction tracker logic where possible instead of introducing a second grade-repair implementation. If the audience exceeds the supported transaction size, fail closed rather than partially migrate students.

## Version events

Add a private server-written collection such as **assignmentVersionEvents** recording:

- releaseCreated or liveUpgrade;
- familyId;
- source/target content versions;
- source/target assignment IDs where applicable;
- actor UID/role and timestamp;
- from/to assignmentRevision;
- counts by change classification;
- affected question IDs and replacement IDs;
- affected student count;
- whether grade reconciliation was requested;
- originating Full Audit ID when available.

Students cannot read this private operational collection.

## Google Classroom behavior

A live V1 → V2 upgrade is an in-place MathMaster content upgrade, not a repost.

- preserve CourseWork IDs and section post mappings;
- preserve due dates and max points;
- never create duplicate Classroom posts;
- if MathMaster grades change, request PR #177 section reconciliation;
- if no grades change, do not create unnecessary grade-passback writes.

## UI locations

### Assignment Library

- Content V# badge;
- Current/Superseded badge;
- Version History;
- hide superseded releases by default;
- V# available badge on older assigned copies.

### Full Assignment Audit

- **Create Corrected Content V2** after approved repairs;
- summary of selected repairs;
- warning that this creates a new release and does not silently rewrite live copies.

### Assigned assignment card/editor

- **Upgrade to Content V2**;
- comparison modal;
- affected-student warning;
- change classification summary;
- fundamental repair choices;
- final commit confirmation.

### Student experience

Do not expose versioning internals normally. If an assignment is upgraded while open, show a one-time message: **This assignment was corrected by your teacher. Your previous work was preserved.**

## Legacy compatibility

No bulk migration.

- legacy assignment without lineage resolves as Content V1 when relevant;
- lineage is minted only when creating a successor;
- existing Library copies remain usable;
- Safe Live Repair continues independently;
- runtime self-healing continues independently.

## Non-goals

- Do not change schemaVersion 5.
- Do not revive retired Assignment V1/V2/V3/V4 schemas.
- Do not replace Full Assignment Audit.
- Do not replace Safe Live Repair.
- Do not turn runtime self-healing into authored content versioning.
- Do not create new Google Classroom assignments during a content upgrade.
- Do not silently lower grades after correction.
- Do not apply a fundamental rewrite under an old question ID.
- Do not auto-upgrade every assigned copy without teacher review.

## TDD / acceptance coverage

Permanent tests must cover at least:

1. legacy assignment resolves as Content V1 without backfill;
2. Content V2 creation never changes schemaVersion 5;
3. first successor creation mints one stable family ID and V2;
4. concurrent/stale successor creation fails closed;
5. current/superseded Library grouping hides old releases by default;
6. assigned V1 displays V2 available;
7. live upgrade preserves assignment ID, classes, dates, Classroom publication IDs, and operational settings;
8. unchanged questions remain untouched;
9. Safe Live Repair-compatible changes reuse the existing analyzer;
10. grading expansions prove accepted-answer/tolerance superset semantics;
11. historical student credit never decreases after grading expansion;
12. clarification-only changes reject when scored meaning cannot be proven unchanged;
13. fundamental changes cannot reuse the historical question ID;
14. retire-only preserves historical tracker/evidence records and excludes the flawed question;
15. retire+replacement adds a new stable ID with fresh attempts;
16. stale assignmentRevision or contentVersion rejects the whole upgrade;
17. version events are written for release creation and live upgrade;
18. grade-affecting upgrades request Classroom section reconciliation;
19. students cannot read private version events;
20. Full Audit creates the release from approved assignmentIssue repairs only; platformIssue and unclear never mutate authored content.

## Release gate

Before merge run:

- focused content-version/live-upgrade tests;
- npm run test:platform;
- node --test tests/platform/*.test.mjs;
- npm run test:authoring-v5;
- npm run test:rules;
- npm run lint;
- npm run build;
- npm run build:firebase.

Because this feature adds server callables and a private Firestore collection, production deploy includes Hosting, Firestore rules, and only the Cloud Functions actually added or modified by this feature. Do not deploy all functions unless unrelated changes require it.
