# Math tool authoring guide

Assignment V5 authors describe the mathematics and student action; MathMaster owns renderer routing. The Algebra II rich-review routes currently verified by platform tests are:

- `deriveInverse` uses `inverseCompositionLab` for a nonconstant linear function. Students must swap `x` and `y`, preserve equation balance, and isolate `y`; unsupported nonlinear derivation fails validation.
- `constructGraph` remains available through `graphing2` for both Algebra I and Algebra II.
- A transformation `constructGraph` or `graphFunction` intent with authored `sourcePoints` routes to `transformationsLab` mode `plotTransform` when the author did not explicitly choose a compatible mode. Authored mode and geometry remain authoritative.
- `operateOnFunctions` (including `functionOperations` and `operationsOnFunctions` aliases) routes to `functionOperationsLab`. The workbench scores requested sum, difference, product, quotient, and optional composition panels separately.

## Quotient domain safety

Function operations always retain exclusions from the original denominator, including factors that disappear during simplification. Linear and quadratic polynomial denominator zeros are derived by the platform. A denominator above degree two must carry explicit `restrictions`/`excludedValues`; otherwise schema validation and the math engine fail closed rather than grade an incomplete domain.

## Curated content and CCMR

Curated and review authoring preserves authored question identity, count, order, and content by default. Integrated assignment AI performs audited CCMR replacement and the Practice coverage target only when its `ccmrEnrichment` option is explicitly `true`. Honors destination publication continues to request audited enrichment through the existing destination-aware hydration path; Standard destinations retain authored questions.
