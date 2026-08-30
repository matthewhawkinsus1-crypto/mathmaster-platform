# TEKS Fidelity V2 — Algebra I Phase 0 Implementation Plan

This plan is based on the shipping Adaptive V2 Algebra I bank, the actual secure Path runtime, and the existing MathMaster tools.

## 1. Safe content-release authority

For Algebra I, drafts/algebra1.json currently contains the same 245-document array as both deployable Algebra I seed mirrors. That gives us a usable current authoring package.

The danger is scripts/build-path-bank.mjs. It still compiles the older seven Algebra I authoring modules, whose 245 code+family slugs overlap the shipping Adaptive V2 bank 0/245, and it can write both deployable seed files.

The ordinary draft verifier is also not an in-place release verifier: all 245 Algebra I draft IDs are already published, so verify-path-drafts.mjs would classify them as id_already_published.

### Required Phase 0 release command

Add a bank-aware course release command such as:

    node scripts/promote-course-path-bank.mjs algebra1 --check
    node scripts/promote-course-path-bank.mjs algebra1

It should:
- load drafts/algebra1.json;
- allow IDs already owned by the current Algebra I bank;
- reject IDs that collide with another bank;
- run production issuability, rendering, generator-variety, alignment, semantic-fidelity, and answer-leakage gates;
- write nothing with --check;
- on a clean promotion, write both seed mirrors byte-identically and rebuild the coverage manifest;
- never refresh Firestore itself.

scripts/build-path-bank.mjs should no longer be allowed to overwrite Algebra I from the superseded source modules. The safest first change is to remove/guard Algebra I in that legacy compiler and point maintainers to the course-release command.

## 2. Fix multiple-choice IDs once in server issuance

This is wider than Algebra I:
- Algebra I: 11/11 choice families use opt-1 as the key.
- Algebra II: 133/133 choice families use opt-1.
- Grade 6 has correct IDs literally named correct.
- Grade 7 has correct IDs literally named right.

Option order is shuffled, but authored IDs are preserved in the public payload.

### Preferred fix

After generation/shuffling and before buildIssuePlan, replace authored choice IDs by current display order:

- first displayed option -> choice-1
- second -> choice-2
- etc.

Remap the private expected/accepted IDs to those same display IDs.

Putting this in or immediately after instantiateQuestion has four advantages:
1. authored IDs never reach the browser;
2. because display order is already seeded, the correct public ID varies with the generated instance;
3. reloads stay stable;
4. My Path, Secure Exam, Live Challenge, Simulator, and future consumers get the same behavior.

Required regression coverage:
- stable replay for the same seed;
- authored IDs absent from sanitized payload;
- exactly one remapped key;
- correct public ID varies across shuffled instances;
- My Path grading still accepts the correct remapped response;
- Live Challenge regeneration produces the same mapping;
- Secure Exam grading remains correct;
- ASVAB fidelity tests remain green.

## 3. Reuse existing inequality tools instead of building a second graph system

### A.3D — graph one linear inequality in two variables

Do not use intervalNumberLine. Extend Graphing2 with a linear-inequality mode where the student:
- constructs the boundary line;
- chooses solid/dashed;
- chooses the correct side/half-plane or a validating test point.

Add a server Path contract that recomputes the boundary and region conditions.

### A.3H — graph a system of linear inequalities

Systems Workspace already has an inequalities mode, feasible-region polygon math, test-point math, and a coordinate-plane display.

But today it draws the green overlap for the student, so that mode is suitable for learning/support, not mastery evidence for a graphing TEKS.

Add a Path/assessment construction mode that hides the completed region and requires the student to establish the boundaries and overlap. Extend the server systemsWorkspace contract beyond mode=linear to grade this raw work.

## 4. Reuse Data Modeling Lab for technology/data TEKS

Data Modeling Lab already has:
- linear regression;
- correlation;
- residuals;
- quadratic regression;
- exponential regression;
- model comparison;
- prediction;
- interpolation/extrapolation;
- association-vs-causation reasoning.

It is therefore the right platform asset for A.4A, A.4C, A.8B, and A.9E.

The missing piece is server authority. The component currently computes correctness in the browser. Under Path, the server should recompute expected results from the public dataset and grade only the student's raw response.

Recommended modes:
- association -> A.4A;
- lineFit -> A.4C;
- quadraticFit -> A.8B;
- exponentialFit -> A.9E;
- modelCompare -> transfer evidence, not a substitute for writing a model.

The pure regression math should be shared with the server or protected by explicit parity tests so browser and server cannot drift.

## 5. Semantic release gates

A standard should not be Fidelity V2 production-ready unless all of these hold:

1. TEKS action coverage — writing means the student writes; graphing means the student graphs; technology/model fitting uses data/modeling.
2. Representation honesty — table means a real rendered table; graph means a real graph/tool/stimulus.
3. Task honesty — errorAnalysis requires erroneous work or a claim to critique.
4. DOK independence — DOK is justified independently from difficulty.
5. Family durability — repeated sessions change meaningful mathematics, not only decorative numbers.
6. Answer-key security — no public ID/rank/format pattern reveals the key.
7. Generated semantic correctness — the answer derives from the same generated information shown to the student.
8. Server-authoritative interaction grading — browser verdicts never create Path mastery.

## 6. What should not happen yet

- Do not refresh Firestore.
- Do not change the Path release marker.
- Do not redesign My Path navigation from the current task/DOK/representation metadata.
- Do not mass-rewrite all 245 Algebra I families before the Phase 0 release path and missing tool contracts exist.
- Do not delete useful component questions from REBUILD standards; many should become bridge/remediation families rather than production mastery evidence.

Once Phase 0 is in place, the 20 REBUILD standards can be authored against the correct platform capabilities once instead of being rewritten twice.
