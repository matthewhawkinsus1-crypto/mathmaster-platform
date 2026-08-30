# TEKS / CCMR / Path Fidelity Master Checkpoint

**Last updated:** 2026-08-30  
**Working branch:** `audit/teks-fidelity-v2-algebra1`  
**Primary PR:** #80  
**Current checkpoint head when written:** `8d8d06b1c885696df9612265cc11ca8e3c41a4d8`

## Mission

Continue the intensive pathway-fidelity sweep without lowering the standard when chats change:

1. Audit and upgrade **all TEKS Path banks** standard by standard.
2. Apply the same fidelity treatment to **CCMR banks**.
3. Only after the content/runtime evidence layer is trustworthy, redesign the **student Path experience** so students can see, choose, understand, and progress through TEKS/CCMR work clearly.

This is not a quantity-only rewrite. A standard is not considered complete merely because it has five templates. The student must perform the verb/representation required by the standard, the server must grade the actual evidence securely, generated values must be stable/reachable, and browser/mobile behavior must support the interaction.

---

## Current position

### Algebra I TEKS — CONTENT SWEEP COMPLETE, RELEASE VERIFICATION IN PROGRESS

- **49 / 49 Algebra I standards staged**
- **5 families per standard = 245 staged Algebra I families**
- Every Algebra I standard now has a Fidelity V2 package in:
  - `drafts/fidelity-v2/algebra1/<TEKS>.json`
- The staged-bank structural audit discovers all package files automatically so a newly staged standard cannot silently miss generic checks.
- Algebra I-specific CI was green immediately before the latest shared grading-contract patch:
  - **Algebra I Fidelity V2 Certification: PASS**
  - **Path Tool Browser Contract: PASS**
  - **Correct Answer Acceptance Audit: PASS**

### Important Algebra I upgrades made during this sweep

- Two-variable inequalities now require students to construct:
  - boundary points,
  - solid/dashed boundary type,
  - shaded side,
  - overlapping feasible region for systems.
- Data Modeling Lab now supports authentic:
  - correlation calculation entry,
  - linear regression function writing + fixed prediction,
  - quadratic regression function writing + fixed prediction,
  - exponential regression function writing + fixed prediction,
  - true exponential decay with `0 < b < 1`.
- Server grading now prevents the browser from changing an authored prediction target and being graded on the easier replacement input.
- Quadratic graph work now requires student point construction/sketch evidence before attribute analysis.
- Exponential graph standards now include real growth **and** real decay graph construction.
- Sequence work connects term number/domain, tables, and discrete graph points.
- KEEP standards were not rewritten blindly; their sound mathematics was preserved while mislabeled DOK/task types, fake error-analysis labels, missing representations, and drift from the TEKS verb were corrected.
- Systems classification no longer uses a fake numeric code for “infinitely many”; the workspace classifies the actual system.
- A.12B was refocused on evaluating functions rather than drifting into inverse solving.
- A.12E was refocused on literal rearrangement rather than substituting values after rearranging.

### Shared grading-contract regression found after Algebra I completion

The full platform suite exposed one unrelated Assignment V5 validator contradiction:

- Runtime `answerFields` correctly treats `answer + acceptedAnswers` as a union.
- Secure `responseFields` uses `accepted` with precedence over `expected`.
- The validator had incorrectly applied the secure-field precedence rule to both.
- Patch applied:
  - `src/platform/grading/gradingContract.js`
  - `tests/platform/gradingContractPreflight.test.mjs`
- Fresh CI is running from head `8d8d06b1c885696df9612265cc11ca8e3c41a4d8`.

Do **not** interpret a Vercel “build-rate-limit / upgradeToPro” failure as a code-quality failure. It is an external deploy-rate limit. Code CI must be read separately.

---

## TEKS sweep progress

The authored TEKS universe contains **126 standards**:

| Bank | Standards | Fidelity V2 status |
|---|---:|---|
| Algebra I | 49 | **49/49 staged** |
| Algebra II | 48 | **NEXT major bank** |
| Grade 8 | 23 | pending |
| Grade 7 | 4 | pending |
| Grade 6 | 2 | pending |
| **Total** | **126** | **49/126 course-standard sweep completed** |

Algebra I therefore represents the first complete course-level sweep, not the end of the TEKS project.

---

## Exact next work

### Gate A — close Algebra I cleanly

Before leaving Algebra I:

1. Confirm the fresh head passes:
   - Algebra I Fidelity V2 Certification
   - Path Tool Browser Contract
   - Correct Answer Acceptance Audit
   - Assignment V5 Foundation
   - Full Platform Test Suite
2. Investigate any code/test failure; do not waive it simply to move on.
3. Treat Vercel rate-limit failures separately from code CI.
4. Update this checkpoint with the final green head.
5. Keep PR #80 draft/unmerged until the Algebra I candidate is intentionally approved for merge.

### Gate B — Algebra II TEKS sweep

After Algebra I is green, start Algebra II with the same method:

1. Build a 48-standard decision matrix.
2. For each standard classify:
   - KEEP,
   - ENHANCE,
   - REBUILD.
3. Compare the standard’s actual verb/representation to what the student physically does.
4. Reuse the new secure adapters only where they truly satisfy the Algebra II construct.
5. Build five families per standard with honest representation, task type, DOK, and difficulty spread.
6. Generate boundary instances and self-grade the expected answer through the same server/runtime route.
7. Do not certify a graph/modeling standard because a static graph is displayed when the TEKS requires construction.
8. Finish all 48 before moving to Grade 8.

### Gate C — remaining TEKS banks

Order:
1. Grade 8 — 23 standards
2. Grade 7 — 4 standards
3. Grade 6 — 2 standards

Use the same course-complete checkpoint discipline.

### Gate D — CCMR sweep

Only after TEKS is complete, run the same fidelity method across:
- Digital SAT
- ACT
- TSIA2
- ASVAB

ASVAB already received intensive external work; it still gets a final parity/security/Path-issuability verification rather than being assumed correct because it was authored elsewhere.

### Gate E — Path student experience

Only after content/evidence quality is stable:
- make TEKS and CCMR topics visibly accessible from Path topic selection,
- show clickable TEKS/CCMR identity on questions,
- clearly distinguish required curriculum work vs CCMR transfer/enrichment,
- improve completed / next-pass / advanced-pass visual states,
- prevent dead-end “next question” states after completion,
- simplify navigation/back-out behavior,
- show why a topic is recommended,
- make weekly goals and progress understandable,
- ensure honors/high-performing students see more appropriate CCMR/higher-DOK work without hiding core TEKS mastery.

---

## Quality rules that must survive chat changes

- Never reduce “fidelity” to five templates per standard.
- DOK and difficulty are separate.
- Do not label routine computation DOK 3.
- Do not label a normal problem “errorAnalysis” unless a student is actually diagnosing/correcting an error.
- Tables must render as tables when table interpretation is the construct.
- Graph standards must require student graph evidence when the verb is graph/construct.
- Regression standards must require the student to produce the fitted equation when the standard says write/determine the model.
- Correlation calculation must not display `r` before asking the student to calculate it.
- Secure Path grading must recompute or hold the answer server-side; browser correctness claims are never authoritative.
- Generated answer keys must come from the same generated parameters as the question.
- Every new tool mode must be checked for:
  - sanitizer leakage,
  - private grading definition,
  - response-shape validation,
  - server grading,
  - browser response plumbing,
  - keyboard/mobile usability,
  - correct-answer self-acceptance.
- Do not merge a course-wide audit while known code CI is red.
- Infrastructure deploy-rate limits are not mathematical/code failures, but they must be reported distinctly.

---

## Chat-resume instruction

When a chat ends, resume from this file first. Do not restart the audit, re-ask what phase we were in, or jump to Path UX early.

**Current focus at this checkpoint:** finish the fresh Algebra I CI run, resolve anything real, lock the final green Algebra I head, then begin the 48-standard Algebra II Fidelity V2 matrix.
