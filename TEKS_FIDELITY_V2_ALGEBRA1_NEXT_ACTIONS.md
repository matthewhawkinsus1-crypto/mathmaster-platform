# Algebra I TEKS Fidelity V2 — Next Actions

## Audit status

The shipping Algebra I seed has now been classified across all 49 content standards.

Current matrix:
- **KEEP: 12**
- **ENHANCE: 17**
- **REBUILD: 20**

The audit remains isolated on `audit/teks-fidelity-v2-algebra1`. No student content has been deployed.

## Phase 0 — architecture blockers

Do these before large-scale family authoring.

1. **Choose one source of truth.**
   - Shipping seed and old source modules are two different 245-family banks.
   - Retire/deprecate the stale executable authoring path or migrate the shipping generators into a reproducible canonical source.

2. **Fix multiple-choice public IDs.**
   - 11/11 Algebra I choice families use `opt-1` as the correct private id while ids travel publicly.
   - Adopt opaque/non-predictive IDs before certifying any choice family.

3. **Add semantic-honesty gates.**
   - `errorAnalysis` must contain an error/claim to analyze.
   - `table` must render a table.
   - DOK must be verified separately from difficulty.
   - Writing standards must require construction in a meaningful share of evidence families.

4. **Keep open-construction predicate grading as a future authoring rule.**
   - This is not currently a shipping-bank defect, but any future “many valid answers” family must use constraint grading rather than a finite whitelist.

## Phase 1 — Path capability gaps

Before rebuilding these standards, add or make Path-eligible the authentic interaction:

- **A.3D** — graph one linear inequality in two variables.
- **A.3H** — graph a system of linear inequalities and identify the overlap region.
- **A.4A / A.4C / A.8B / A.9E** — data/regression/model-fitting technology.

Prefer reusing existing MathMaster graph/data tools with server-authoritative Path contracts rather than inventing separate UI.

## Phase 2 — rebuild standards

Rebuild the 20 standards from the decision matrix, starting with standards that currently create the least defensible mastery evidence:

1. A.3D, A.3H
2. A.4A, A.4C, A.8B, A.9E
3. A.8A
4. A.10A–F
5. A.11B
6. A.12A, A.12D
7. A.2C, A.2H, A.2I, A.9C

Current component questions may be retained as bridge/remediation content, but should not remain the five production evidence families when they do not perform the TEKS action.

## Phase 3 — enhance standards

For the 17 ENHANCE standards:
- preserve useful generators;
- replace one or two weak families;
- add real missing representations;
- create authentic misconception/error tasks;
- independently set DOK and difficulty;
- add progression metadata.

## Phase 4 — certify KEEP standards

For the 12 KEEP standards:
- keep the core mathematics;
- correct metadata;
- harden choice IDs where relevant;
- run generator health and generated-prompt reading;
- verify misconceptions and repeat-session durability.

## Required verification before merge/release

- semantic Fidelity V2 audit
- existing Path production-quality gate
- generator health
- DOK/difficulty audit
- answer acceptance audit
- full platform suite
- build/lint
- manual generated-prompt inspection for every changed standard
- no Firestore refresh until the completed bank release is reviewed

## My Path dependency

Only after the content metadata is trustworthy should My Path expose a richer progression such as:
`recognize -> construct -> table -> graph -> equation -> apply/transfer`.

The UI should visualize verified mathematics, not the current mechanically stamped labels.
