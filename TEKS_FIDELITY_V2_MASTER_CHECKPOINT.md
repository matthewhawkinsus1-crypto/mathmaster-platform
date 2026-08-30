# MathMaster Path Fidelity V2 — Durable Master Checkpoint

Last updated: 2026-08-30
Working PR: #80
Working branch: `audit/teks-fidelity-v2-algebra1`

## Why this file exists

This is the durable handoff for long-running Path fidelity work. A new chat or coding session should read this file before changing the bank. Do not infer progress from chat history alone.

## Non-negotiable quality rules

1. A standard is not "covered" merely because five JSON rows exist.
2. The student must perform the verb in the standard:
   - graph => construct/plot the graph, not inspect a pre-drawn answer;
   - write/model => enter the complete equation/model;
   - calculate with technology => perform/enter the calculation, not read a supplied result;
   - solve => produce the complete solution set when the standard requires it.
3. Five families per standard must represent meaningfully different mathematical acts/representations, not five number swaps.
4. DOK and difficulty are separate. Do not inflate DOK because numbers are larger.
5. `errorAnalysis` must present an actual student claim/error to diagnose or correct.
6. Student-visible grading must be server-authoritative for Path tools. Never leak expected answers to the browser.
7. Correct equivalent student mathematics must be accepted when the requested form is preserved.
8. A five-question session must be able to issue five distinct families without repeating.
9. Do not weaken a quality gate to make a red build green when the content/runtime can be corrected instead.
10. Keep this PR draft/unmerged until Algebra I certification gates are green and the audit evidence is reviewed.

## Algebra I status

### Coverage

- Standards: **49 / 49 staged**
- Families: **245 / 245 staged**
- Every standard has exactly five Fidelity V2 families.
- The staged directory is `drafts/fidelity-v2/algebra1/`.
- `drafts/algebra1.json` and `seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json` have been advanced to the V2 candidate on this branch.

### Major fidelity upgrades completed

- Complete equation writing for linear, quadratic, exponential and polynomial-model standards where required.
- Authentic two-variable inequality graph construction for A.3D and A.3H.
- Technology-based correlation entry and interpretation for A.4A.
- Linear regression function writing + prediction for A.4C.
- Quadratic regression function writing + prediction for A.8B.
- Exponential regression growth/decay function writing + prediction for A.9E.
- Quadratic graph construction + connected attributes for A.7A.
- True exponential growth **and true 0 < b < 1 decay** graph evidence for A.9A and A.9D.
- Four required quadratic solution methods and complete solution sets for A.8A.
- Recursive/explicit sequence work tied to term-number domain and discrete points for A.12C/A.12D.
- KEEP standards were not rewritten blindly; their mathematics was preserved while fake table/error-analysis metadata, DOK inflation, and TEKS drift were corrected.

### Secure Path/runtime upgrades completed during the audit

- Path contracts for two-variable inequality construction.
- Path contracts for Data Modeling Lab.
- Correlation entry mode that does not reveal `r`.
- TEKS-specific linear/quadratic/exponential regression-entry modes.
- Fixed authored prediction target cannot be replaced by the client.
- Quality audit recognizes server-derived tool grading.
- Quality audit recognizes graph stimuli.
- Shared answer equivalence now accepts conventional implicit multiplication before numeric groups (example: `96(0.5)^(n-1)`).

## Current validation state

At the start of the latest validation pass, three red code/content gates were isolated:

1. Candidate ID test compared the final V2 branch source against itself as though it were the legacy bank.
   - Fixed: gate now enforces unique V2 namespaces/versioning and rejects legacy generator ids.
2. Correct-answer acceptance rejected implicit multiplication such as `96(0.5)^(n-1)`.
   - Fixed in the shared answer-equivalence layer with a direct regression test.
3. Five-question session launch repeated families for A.2G, A.6C and A.12A.
   - Root cause: quality ranking treated real stimulus graphs as unfinished and two classification items were bare text interactions.
   - Fixed: stimulus graphs count as graph representations; A.2G and A.12A classification items are real choices.

Latest head when this checkpoint was written: `58546671b777dba64e26d4f226601bd000956b42`.

The latest GitHub workflows were re-running at checkpoint time. **Do not mark Algebra I certified until the following are green:**

- Algebra I Fidelity V2 Certification
- Correct Answer Acceptance Audit
- Full Platform Test Suite
- Path Tool Browser Contract
- Assignment V5 Foundation

Vercel currently reports a **build-rate-limit** failure. Treat that separately from code/test failures; do not call a code regression from that status alone.

## Exact next actions

1. Read latest workflow results on PR #80.
2. If any Algebra I certification/code gate is red:
   - inspect the exact failing subtest/log;
   - fix root cause;
   - rerun;
   - do not broaden work until green.
3. When green, review the generated semantic and cognitive/DOK audit evidence.
4. Update the Algebra I certification record with the final green commit SHA and results.
5. Only then move to the remaining TEKS-bank sweep using the same rubric:
   - Algebra II;
   - Grade 8;
   - Grade 7;
   - Grade 6.
   Prioritize course/grade routing impact if runtime evidence suggests a different order.
6. After TEKS banks are certified, perform the same fidelity sweep on remaining CCMR banks:
   - Digital SAT;
   - ACT;
   - TSIA2;
   - verify the merged ASVAB bank against the same cross-bank quality gates rather than re-authoring it blindly.
7. After content banks are trustworthy, upgrade the student Path experience:
   - make TEKS/CCMR choices visually understandable;
   - expose completion/next-pass state;
   - make CCMR/TEKS labels visible/clickable in the task;
   - improve access/gating so students can see what Path topics and assessment routes are available;
   - then tune recommendation/adaptive behavior against the certified DOK + difficulty metadata.

## Handoff instruction for a new chat

Say: **"Read TEKS_FIDELITY_V2_MASTER_CHECKPOINT.md and PR #80, then continue from Exact next actions without restarting the audit or lowering the fidelity rules."**
