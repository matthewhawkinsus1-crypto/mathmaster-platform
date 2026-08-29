# TSIA2 V2.1 Authentic Language Design

Date: 2026-08-24
Branch: `ccmr-fidelity-v2-1-authentic-language`
Release target: `ccmr-fidelity-v2.1-authentic-language`

## Goal

Replace the current TEKS-first TSIA2 adaptations with an independently authored TSIA2 Mathematics V2.1 bank whose content, language, response format, calculator availability, CRC weighting, Diagnostic coverage, and adaptive difficulty structure reflect the published TSIA2 assessment rather than SAT/ACT/ordinary-course question grammar.

This work must preserve MathMaster's canonical curriculum graph for prerequisites and remediation. TSIA2-native items may later crosswalk to legitimate Texas standards, but the assessment bank itself must not fabricate a Texas alignment merely to fit the course model.

## Official sources

Primary sources:

- College Board, **TSIA2 Mathematics Test Specifications, Version 1.4**: https://accuplacer.collegeboard.org/accuplacer/pdf/tsia2-mathematics-test-specifications.pdf
- College Board, **TSIA2 Mathematics Sample Questions (2025)**: https://accuplacer.collegeboard.org/accuplacer/pdf/tsia2-mathematics-sample-questions.pdf
- THECB, **Texas Success Initiative** resource page: https://www.highered.texas.gov/texas-success-initiative/

The current official public sample packet confirms four-choice discrete multiple-choice items and item-level calculator availability using Basic, Square Root, or Graphing calculators.

## Assessment contract

### CRC Test

The College Readiness Classification test is adaptive, computer-delivered, untimed, and contains 20 discrete multiple-choice items:

- Quantitative Reasoning: 6 items / 30%
- Algebraic Reasoning: 7 items / 35%
- Geometric and Spatial Reasoning: 3 items / 15%
- Probabilistic and Statistical Reasoning: 4 items / 20%

The CRC score range is 910–990. MathMaster already records 950 as the college-readiness benchmark, with Diagnostic Level 6 as an alternate readiness path when CRC is below 950.

### Diagnostic Test

Students below the CRC readiness threshold are routed to a 48-item adaptive Diagnostic test. It contains 12 items in each of the four strands, so Diagnostic strand weighting is 25% each. It includes the CRC content plus seven diagnostic-only foundational skill areas.

### Item format

All CRC and Diagnostic math items are discrete four-choice multiple choice. V2.1 TSIA2 banks therefore must not contain student-produced-response items, classroom workflows, multi-part worksheets, or assessment-meta coaching in the student prompt.

### Calculator behavior

Calculator access is item-level, not global. Official sample materials mark items as Basic, Square Root, or Graphing.

MathMaster currently supports `none`, `basic`, `scientific`, and `graphing`. V2.1 will add a distinct `squareRoot` assessment calculator mode instead of silently treating a scientific calculator as equivalent. The Square Root mode must expose ordinary basic operations plus a square-root control and no additional scientific functions.

## Native content taxonomy

The V2.1 TSIA2 tree uses native skill ids under the four official strands. Each bank declares whether its skill is `crcAndDiagnostic` or `diagnosticOnly`.

### Quantitative Reasoning

CRC + Diagnostic:

1. `rationalIrrationalMagnitude` — compare magnitudes / operate with rational and irrational numbers
2. `ratioProportionPercent` — solve ratio, proportion, and percent problems
3. `proportionalContext` — solve proportional relationships in real-world financial/numeracy contexts
4. `linearExpressionsEquationsInterpretation` — identify, manipulate, and interpret linear equations, inequalities, and expressions

Diagnostic only:

5. `basicNumberOperations`
6. `roundingPlaceValue`
7. `numberFormsComparison`

### Algebraic Reasoning

CRC + Diagnostic:

1. `linearEquationsInequalitiesSystems`
2. `linearFunctions`
3. `quadraticExponentialContext`
4. `nonlinearExpressionsEquations`
5. `nonlinearEquationsFunctions`

### Geometric and Spatial Reasoning

CRC + Diagnostic:

1. `measurementConversion`
2. `perimeterAreaSurfaceVolume`
3. `transformationsCongruenceSimilaritySymmetry`
4. `rightTrianglesTrigonometry`
5. `geometryAlgebraConnections`

Diagnostic only:

6. `commonMeasurementUnits`
7. `angleTypesRelationships`

### Probabilistic and Statistical Reasoning

CRC + Diagnostic:

1. `probability`
2. `centerSpread`
3. `dataClassificationRepresentation`
4. `dataAnalysisConclusions`

Diagnostic only:

5. `sortCountData`
6. `simpleGraphsTables`

Total native skill areas: 25 (18 CRC-capable + 7 Diagnostic-only).

## Authoring architecture

Use the proven ACT V2.1 pattern, but make the TSIA2 contract independent:

- `drafts/ccmr-v2.1/tsia2/quantitativeReasoning/`
- `drafts/ccmr-v2.1/tsia2/algebraicReasoning/`
- `drafts/ccmr-v2.1/tsia2/geometricSpatial/`
- `drafts/ccmr-v2.1/tsia2/probabilisticStatistical/`

Each strand gets:

- one mapping ledger declaring official native skill areas and CRC/Diagnostic scope;
- one completion manifest;
- one bank file per native skill area;
- five direct families plus three independently authored challenge families per native skill area;
- exactly four answer choices per family;
- generator-backed variation with expected answers produced from the same parameters;
- V2.1 authorship metadata and explicit TSIA2 test-scope metadata.

At full coverage this produces 25 scope units × 8 families = 200 generative families.

Challenge families must remain inside the published mathematical construct. `challenge` means deeper synthesis, less direct representation, or an additional reasoning link; it must not mean introducing content outside the TSIA2 specification.

## Student-prompt language contract

The 2025 official sample packet establishes the grammar to emulate:

- direct stems such as “Which of the following…?”, “What is the value of…?”, “If …, which expression…?”, and compact real-world situations;
- ordinary mathematical vocabulary such as `equivalent`, `represents`, `greatest number`, `y-intercept`, `slope`, `not defined as a real number`, `average`, and `probability`;
- no sentences telling the student to demonstrate “placement-level mathematics”;
- no “TSIA2 reasoning,” “test taker,” “practice question,” DOK/difficulty labels, or coaching about choosing the best placement answer;
- no copied College Board prompt or underlying task. Official questions are style evidence, not templates to paraphrase.

The V2.1 audit must detect exact prompt skeleton clones, exact generator/underlying-task clones, high-similarity grammar within TSIA2, and high-similarity grammar against Digital SAT and ACT.

## Representation requirements

The bank must not collapse into symbolic algebra. The official sample set demonstrates compact context problems, pure symbolic items, functions, geometry diagrams, bar graphs, dot plots, probability contexts, and data summaries.

Per native skill area, the eight families should deliberately vary representation where the construct supports it. Across the full bank the audit should report representation breadth by strand and flag a strand that is overwhelmingly one representation.

## CRC vs Diagnostic metadata

Each document will carry:

```json
"assessmentContext": {
  "framework": "tsia2",
  "examStyle": true,
  "domainId": "quantitativeReasoning",
  "nativeSkillId": "ratioProportionPercent",
  "tsia2TestScope": "crcAndDiagnostic"
}
```

Diagnostic-only items use `"tsia2TestScope": "diagnosticOnly"`.

This enables My Math Path to keep one TSIA2 mathematics experience while distinguishing readiness practice from remediation/diagnostic depth.

## Weighting fix

The current `EXAM_DOMAIN_REGISTRY.tsia2` incorrectly stores all four strands as `weight: 0.25`. That matches the Diagnostic, not the CRC.

V2.1 will make the registry explicit:

- `weight` / `crcWeight`: 0.30, 0.35, 0.15, 0.20
- `diagnosticWeight`: 0.25 for every strand

Existing readiness-wheel consumers continue to use `weight`, which becomes the CRC readiness weight. Diagnostic-aware surfaces can read `diagnosticWeight`.

A regression test will assert the CRC weights sum to 1, Diagnostic weights sum to 1, and the four CRC counts are 6/7/3/4.

## Calculator-mode fix

Add `CALCULATOR_MODES.SQUARE_ROOT = "squareRoot"` as a concrete mode. TSIA2 item-level resolver accepts `none`, `basic`, `squareRoot`, or `graphing` for exam-authored items. The generic authoring system may still use scientific elsewhere.

The student calculator rendered for `squareRoot` must not expose scientific functions beyond square root. This is an assessment-fidelity requirement, not just a label change.

## Build and audit

Add `scripts/build-tsia2-v2-1.mjs` following the fail-closed ACT builder pattern. It must support:

- `--domain <domainId> --check`
- `--release --check`
- full release generation to `drafts/tsia2.v2.1.json` only when every declared scope is complete.

Fail conditions include:

- missing mapping/completion artifacts;
- a completed scope without a bank;
- anything other than 5 direct + 3 challenge families;
- anything other than four-choice multiple choice;
- fabricated `texas:` alignment in a native bank;
- missing or inconsistent `tsia2TestScope`;
- invalid calculator modes;
- meta/classroom language;
- missing V2.1 authorship markers;
- duplicate ids/family ids;
- exact prompt or underlying-task clones;
- exact cross-framework prompt clones;
- unresolved generator placeholders;
- nonunique distractors or invalid expected choice ids.

A TSIA2-specific CI workflow records the last audit log/status to `drafts/ccmr-v2.1/audit-results/` and fails the branch when the audit fails.

## Validation strategy

Each completed native skill area receives at least 2,000 randomized generated-instance checks. The semantic checks are construct-specific, not only schema checks: calculations, correct answer, distractor uniqueness, sign/rounding behavior, domain restrictions, geometry constraints, and probability bounds must be verified from generated parameters.

At full coverage: at least 50,000 randomized generated instances across 25 scope units.

The existing global V2.1 authentic-language audit remains the cross-framework backstop.

## Migration and release

The current `seed/pathQuestionBank/tsia2_pathQuestionBank_seed.json` stays unchanged while authoring is in progress. V2.1 drafts do not become production questions incrementally.

Release sequence:

1. finish all four TSIA2 strand ledgers and banks;
2. pass all domain checks;
3. pass full TSIA2 release check;
4. pass global authentic-language and anti-clone audits;
5. assemble the V2.1 TSIA2 release bank;
6. replace/upgrade the production TSIA2 seed as one versioned content release;
7. retire stale active TSIA2 sessions so students do not continue on pre-V2.1 item families.

## Alternatives considered

### A. Rewrite the existing TEKS-first TSIA2 seed in place

Rejected. It preserves the mistake V2.1 is trying to remove: assessment questions remain course-standard questions with TSIA2 wording layered on top. It also makes Diagnostic-only foundational content awkward because not every assessment construct needs a fabricated one-to-one TEKS identity.

### B. Copy the Digital SAT/ACT V2.1 families and adjust vocabulary

Rejected. This would improve surface language while leaving the underlying task grammar cloned. It undermines assessment transfer evidence and the anti-clone goal.

### C. Native TSIA2 scope ledger + independent banks + later curriculum crosswalk

Selected. It preserves the actual TSIA2 taxonomy and routing model, keeps course mastery canonical, permits honest diagnostic-only content, and lets MathMaster connect the same mathematics across frameworks without pretending the assessment is organized like Texas course standards.

## Success criteria

TSIA2 V2.1 is complete only when:

1. all 25 official native skill areas are represented;
2. all 200 families are generator-backed and independently authored;
3. all items are four-choice discrete multiple choice;
4. CRC and Diagnostic scope are distinguishable;
5. CRC weights are 30/35/15/20 and Diagnostic weights are 25/25/25/25;
6. item-level calculator modes include faithful Basic, Square Root, and Graphing behavior;
7. no native bank fabricates a Texas alignment;
8. no exact prompt/underlying-task clones remain within TSIA2 or against SAT/ACT;
9. randomized semantic validation passes across at least 50,000 generated instances;
10. the full TSIA2 V2.1 release and global CCMR authenticity audits pass.