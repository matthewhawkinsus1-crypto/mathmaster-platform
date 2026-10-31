# TEKS Fidelity V2 — Master Continuation Checkpoint

Last updated: 2026-08-30

## Purpose

This is the durable continuation point for the TEKS/CCMR/Path sweep. New chats should resume from this file rather than re-auditing completed banks.

## Fixed work order

1. Finish current TEKS pathway banks.
2. Then audit/upgrade the remaining CCMR banks.
3. Then upgrade the student Path experience and access/navigation model.

Do not return to a completed bank unless a verification gate reports a specific regression.

## Completed: Algebra I

Status: **CERTIFIED ON AUDIT BRANCH**

- 49 / 49 Algebra I TEKS staged in Fidelity V2.
- 5 families per standard.
- 245 / 245 candidate families.
- Full replacement candidate gate is locked to all 49 standards.
- Secure Path adapters added/strengthened where the TEKS required authentic student action rather than answer-box substitutes.
- Key fidelity fixes included:
  - two-variable inequality graph construction;
  - systems-of-inequalities overlap construction;
  - technology-calculated correlation coefficient;
  - linear, quadratic, and exponential regression equation writing plus fixed-target prediction;
  - true exponential growth and decay;
  - quadratic graph construction before attribute analysis;
  - correction of overstated DOK / fake error-analysis labels in KEEP families;
  - server-authoritative grading for the Path tool modes used by the rebuilt standards.

### Algebra I verification gates

At branch head 825ba9df7cd6c4f421913695d0e439259f442c16:

- Algebra I Fidelity V2 Certification — PASS
- Correct Answer Acceptance Audit — PASS
- Path Tool Browser Contract — PASS
- Full Platform Test Suite — PASS
- Assignment V5 Foundation — PASS

External deployment note:
- Vercel was red only because of its build-rate-limit. This is not an Algebra I or platform-test failure.

## NEXT UNFINISHED BANK

### Algebra II

Resume here. Do **not** spend time rechecking Algebra I.

Use the same standard-by-standard Fidelity V2 method:
- verify exact TEKS verb and assessed construct;
- separate DOK from difficulty;
- ensure representations actually exist in the student UI;
- require the student to perform the TEKS action (graph/model/write/solve/analyze), not merely recognize a supplied answer;
- preserve secure server grading and fail closed when a tool adapter is not proved;
- five strong families per standard with controlled generators;
- honest misconception/error-analysis families;
- generated-instance and answer-key verification;
- final course-wide certification gate before leaving the bank.

## After Algebra II

Continue through any remaining Grade 6, Grade 7, and Grade 8 TEKS banks that have not received the same Fidelity V2 sweep.

Then move to remaining CCMR banks.

Then redesign the Path student experience/navigation/access model.

## Grade 6, 7 and 8: where it stands (2026-10-25, MP04)

The owner chose to rebuild the Grade 6–8 Path banks to the Fidelity V2 standard. Nothing has been rebuilt yet. This is
the measured starting point, so the next session does not count it again.

- **What the seeds hold** (`seed/pathQuestionBank/grade{6,7,8}_pathQuestionBank_seed.json`, with copies in
  `functions/seeds/`, `drafts/` and the release manifest): Grade 6 has 45 standards in 237 documents, Grade 7 40 in 212,
  Grade 8 43 in 227. Every one still says it comes from "MathMaster generative Path authoring +
  scripts/verify-path-drafts.mjs" (Algebra I and II say "certified Fidelity V2 source"). All are generator-backed practice
  items; 12 a grade are multiple choice and the rest are answer boxes, mostly number and choice fields.
- **The 29 standards named above** (Grade 8: 23, Grade 7: 4, Grade 6: 2) are exactly the middle-school standards the
  Algebra I and II prerequisite graphs name (`getSkillGraph('algebra1' | 'algebra2')`). Grade 6: 6.7A, 6.7D. Grade 7:
  7.3A, 7.3B, 7.7, 7.11A. Grade 8: 8.2B, 8.2C, 8.4A–C, 8.5A–I, 8.7C, 8.8A, 8.8C, 8.9, 8.10A, 8.10C, 8.11A, 8.12C, 8.12D.
  They hold 158 of the 676 documents, 13 of them at DOK 3 (8%; 58 at DOK 1). They feed the Foundation Bridge slots and
  Strengthen doors a struggling Algebra student meets. The other 99 standards serve students whose own course is
  Grade 6, 7 or 8.
- **What a mechanical audit says.** The Algebra I audit's checks (`scripts/audit-algebra1-teks-fidelity-v2.mjs`, pointed
  at each seed) find no structural gap: five or six generator-backed families a standard, three or more task types, four
  difficulty bands. Its "answer-leakage-marker" flag fires on 35, 36 and 43 standards, but that is a false alarm: it
  matches the field label "Choose the correct answer", which the student reads, not a key. Do not read it as a REBUILD
  verdict. A mechanical pass is not Fidelity V2 (the rubric says so).
- **What remains, and who.** Every verdict in the rubric. A person who knows the TEKS reads each standard's families
  against its verb and classifies it KEEP, ENHANCE or REBUILD (`TEKS_FIDELITY_V2_ALGEBRA1_REVIEW_RUBRIC.md`); a content
  author rebuilds the ENHANCE and REBUILD ones, with a secure Path adapter and its server-grading proof wherever the verb
  needs a graph, table or model rather than an answer box. Start with the 29, Grade 8 first. After the content, keep every
  copy in step (`functions/seeds`, `seed/`, `drafts/`, `drafts/fidelity-v2`), run `npm run release:path:build`, and
  commit the manifest and `src/platform/path/pathReleaseManifest.generated.js`. None of it was started here: it needs a
  content review, not code.

## Continuation rule

When chat space runs out:
1. Read this checkpoint.
2. Read only the current unfinished bank's own checkpoint/matrix.
3. Resume at the first unfinished standard.
4. Do not reconstruct or re-review completed standards unless a failing gate names one.
