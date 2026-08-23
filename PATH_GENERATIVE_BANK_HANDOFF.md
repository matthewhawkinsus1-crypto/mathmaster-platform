# MathMaster My Math Path — Generative Bank Handoff

Date: 2026-08-21
Release: `path-bank-2026-08-21-r9-asvab`

## Final bank

The built-in secure Path bank contains **5,150 generator-backed templates**.
There are no fixed questions in the nine course/assessment seed files listed below.

| Bank | Standards | Generator templates |
|---|---:|---:|
| Grade 6 | 45 | 225 |
| Grade 7 | 40 | 200 |
| Grade 8 | 43 | 215 |
| Algebra I | 49 | 245 |
| Algebra II | 48 | 240 |
| Digital SAT | 209 | 1,045 |
| ACT | 225 | 1,125 |
| TSIA2 | 225 | 1,125 |
| ASVAB | 146 | 730 |
| **Total** | — | **5,150** |

Course layer: **1,125** templates across **225** course standards.
Assessment-specific CCMR layer: **4,025** templates.

## Seed files and exact destinations

Each seed JSON is intentionally stored twice. Keep the copies identical.

### Course banks

- `grade6_pathQuestionBank_seed.json`
- `grade7_pathQuestionBank_seed.json`
- `grade8_pathQuestionBank_seed.json`
- `algebra1_pathQuestionBank_seed.json`
- `algebra2_pathQuestionBank_seed.json`

Place each in both:

- `functions/seeds/pathQuestionBank/`
- `seed/pathQuestionBank/`

### Assessment-specific CCMR banks

- `digitalSAT_pathQuestionBank_seed.json`
- `act_pathQuestionBank_seed.json`
- `tsia2_pathQuestionBank_seed.json`
- `asvab_pathQuestionBank_seed.json`

Place each in both:

- `functions/seeds/pathQuestionBank/`
- `seed/pathQuestionBank/`

### Manifest

- `seed/pathQuestionBank/PATH_BANK_COVERAGE_MANIFEST.json`

Current manifest totals:

- 5,150 total documents
- 1,125 course documents
- 4,025 assessment documents
- 225 course standards

## Draft/source packages

The authoring copies live in `drafts/`:

- `drafts/grade6.json`
- `drafts/grade7.json`
- `drafts/grade8.json`
- `drafts/algebra1.json`
- `drafts/algebra2.json`
- `drafts/digitalSAT.json`
- `drafts/act.json`
- `drafts/tsia2.json`
- `drafts/asvab.json`

Each draft's `documents` array matches the corresponding installed seed.

## Runtime changes included in this platform ZIP

The updated `functions/index.js` supports generator-backed secure Path issuance and framework-specific sessions. The selected framework is stored on a Path session, course sessions exclude exam-style content, and SAT/ACT/TSIA2/ASVAB sessions select only directly authored exam-style families for that framework.

Generator-backed questions are instantiated server-side before secure grading definitions are built. Choice ordering is deterministically shuffled server-side so a correct option does not remain in a predictable position while session reloads remain stable.

The Teacher Path Simulator instantiates templates rather than displaying raw `{{placeholders}}`, and Live Challenge supports generator-backed Path questions.

Course coverage audits explicitly ignore exam-style questions so assessment content cannot inflate ordinary course Path coverage.

The release markers are:

- `functions/index.js`: `PATH_RUNTIME_RELEASE = "path-bank-2026-08-21-r9-asvab"`
- `src/platform/path/pathRelease.js`: `PATH_WEB_RELEASE = 'path-bank-2026-08-21-r9-asvab'`

## Build/audit scripts added

- `scripts/rebuild-path-manifest.mjs`
- `scripts/build-digital-sat-drafts.mjs`
- `scripts/build-act-drafts.mjs`
- `scripts/build-tsia2-drafts.mjs`
- `scripts/build-asvab-drafts.mjs`
- `scripts/audit-asvab-drafts.mjs`

Existing boundary verification remains:

```bash
node scripts/verify-path-drafts.mjs drafts/grade6.json
```

Use the corresponding draft filename for each bank.

## Final validation

The broad Path/CCMR test run executed **388 tests**:

- **387 passed**
- **1 failed only because the extracted ZIP does not have the `firebase` npm package installed**

The failing file is `tests/platform/pathWiring.test.mjs`, which cannot import `firebase` from `src/platform/path/pathStore.js` in this dependency-less extracted environment. This is not a generator-bank, grading, routing, security, tool, coverage, or CCMR test failure.

A focused integrated bank/framework/security/session suite also passed cleanly before packaging.

## Authoring safeguards retained

Generated answers are derived from the same parameters that generate each question. `accepted` is not padded with spelling/formatting variants already handled by the grader. Each standard has five distinct families, and the authoring audits check generated variety and, for multiple-choice assessment items, distinct answer choices across sampled draws.
