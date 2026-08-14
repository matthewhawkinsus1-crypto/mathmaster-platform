# MathMaster — Current Main + Live Challenge Merge

Base: the `mathmaster-current-main.zip` exported from GitHub `main` on 2026-08-13.

This build merges the previously developed classroom-flow additions into that exact current-main base, preserving the newer Algebra II audit and Google Classroom work already on GitHub.

Included additions:
- MathMaster Live Challenge v1 with seven Cloud Functions and secure per-player leaderboard state.
- Teacher open/close controls for Classwork and Practice by class period.
- Warm-Up access window and teacher close/reopen controls.
- Bundled DOL section timing/teacher early unlock behavior.
- Section-local student question numbering and section-complete visual state.
- Mobile assignment/question navigation improvements.
- Interval-number-line endpoint/notation UX fixes.
- Open Sort Board self-grading tool.
- Constraint-Based Function Builder self-grading tool.
- V5 authoring support for the added tools and axis configuration.

Validation completed in the merge environment:
- Three-way merge completed with zero unresolved Git conflicts.
- All 56 Cloud Functions exported by the uploaded current-main build remain exported.
- Seven Live Challenge functions are added, for 63 total exports.
- No current-main tracked file is deleted by the merge.
- Changed JavaScript/MJS files pass Node syntax checking.
- Focused Live Challenge, section access, Warm-Up lifecycle, Open Sort Board, and Constraint Function Builder tests pass.

A complete Vite production build was not run in this artifact environment because the uploaded repository does not include `node_modules`. Run `npm install` and `npm run build` in Cloud Shell before deployment and push.
