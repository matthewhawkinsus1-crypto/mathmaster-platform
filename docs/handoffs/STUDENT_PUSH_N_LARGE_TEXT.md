# Student push — Job N: text that grows with the student's text-size setting

Branch `claude/student-push-n-large-text`, from `main @ 59e526e` (2026-10-15).
Finishes job H's item 7 ([`STUDENT_PUSH_H_TOOLS_ACCESS.md`](STUDENT_PUSH_H_TOOLS_ACCESS.md)):
H made the root follow the browser (`112.5%` / `100%`), defined `--mm-px`
(one CSS pixel at the default size) and wrote the codemod. This job runs the
sweep over the whole app, proves the default size did not move, proves 200%
works, and adds a ratchet so it can't regress. WCAG 2.1 SC 1.4.4 (Resize
text), with 1.4.10 (Reflow) and 1.4.12 (Text spacing) measured alongside.

## Deploy

**Hosting only.** Nothing under `functions/`, `functions-path-admin/`,
`firestore.rules` or the index files changed. No callable, rule, index, Path
publish, bank refresh or one-off script.

```bash
npm run build && npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

(or `node scripts/release-firebase.mjs` — its plan should name Hosting only.)

## What shipped

| # | Item | What changed | Proof |
| --- | --- | --- | --- |
| 1 | **The sweep** | `node scripts/codemods/px-to-rem.mjs --write` (2,688 values, 264 files) and `--write --include-app-shell src/App.jsx src/App.css src/app` (148 values, 3 files): every px font size and px line height in src/** is now `calc(N * var(--mm-px))`. Re-running the codemod changes nothing. Committed in slices: student screens (`5e4d09b`), tools and the question engine (`0928f68`), teacher workspace and the app shell (`26e131f`). | Default-size diff and 200% check below. |
| 2 | **What the codemod could not see** (by hand) | **Stylesheets in JS template literals** — Graph Feature Rush (`RUSH_CSS`, 14 sizes) and the challenge shell (`SHELL_CSS`, 1): the codemod now runs its CSS transform over a template literal assigned with a leading newline and no `${}` (`1a3e542`, tested). **Step Algebra's equation auto-fit** computed px in JS: it now sizes in `--mm-px` units (`data-fit-size`), so the equation grows with the setting; fitting still wins, and the 17 CSS-px floor is kept (a long equation on a phone at 200% shrinks to fit rather than clip). **The Live Challenge projector prompt**, held in a variable, and **the standings rows' `size:` look keys** (read as `fontSize: style.size` in the challenge shell and Graph Feature Rush host; found by the adversarial review): converted, and the ratchet now counts a px `size:` in any file that reads one as a font size. **Five HTML controls the codemod skipped** because their file also draws SVG text (graph zoom buttons ×2, the data-table toggle, Relation Mapping's coordinate inputs and keyboard help): converted. | Ratchet (item 4) finds none left. |
| 3 | **Skipped reports, reviewed** | Of 11 "skipped" reports, 5 were the HTML controls above. The 6 left are SVG `<text>` labels inside the My Math Path and CCMR wheels: SVG text scales with its drawing, which is correct. **One codemod rewrite reverted**: the graphing calculator's JSXGraph tick-label `fontSize` (JSXGraph appends its own `px`, so `calc()` would be invalid CSS); kept as `11` with a `px-to-rem-ignore` pragma and a comment. | Allow-listed by file, count and reason in the ratchet. |
| 4 | **Ratchet** | `tests/platform/pxFontSizeRatchet.test.mjs`: runs the codemod over src/** in dry-run (app shell included, PDF generators excluded): anything it would rewrite fails, naming the command that fixes it. Also counts the residual forms the codemod cannot rewrite (template-literal `px` font sizes, px sizes held in a `*Size` variable, `.style.fontSize = '…px'`, the `font:` shorthand), SVG-text skips and pragmas, each against an **exact** allow-list (an exception that disappears must be removed). Allow-list: the two wheels (SVG text), the JSXGraph pragma, the 3·2·1·GO countdown digit (aria-hidden, already 88–260px; the live region under it carries the text and scales). A fourth test asserts CI runs `--check=text` over the extended scenes. | Mutation-checked: adding `fontSize: 14`, a template `${s}px`, a CSS `font-size: 13px`, or dropping the JSXGraph pragma each fail; dropping the CI step or reverting `runScenes` to the old list fails. |
| 5 | **Source contracts repointed** (none deleted) | `classPointsStudentWallet` — was `fontSize: 15` / `fontSize: 12` anywhere in the file; now: the name's size (on `strong.mm-identity-name`) is larger than the points chip's, both in `--mm-px`. `toolShellChrome` — `doesNotMatch(/fontSize: 24/)` had become vacuous; now: the tool `<h2>{title}` is ≤16 in `--mm-px`; the phone label asserts `calc(13 * var(--mm-px)) !important`. `liveChallengeStudentScreen` — the "never the big place" `doesNotMatch(clamp(40px` had become vacuous; now it asserts the big-place size is in the podium branch and not in the effort branch. `pxToRemCodemod` — a template-literal stylesheet case. | Each rewritten assertion mutation-checked (swap the sizes, set the title to 24, change 13 → 18, inject the big size into the effort branch: all red). |
| 6 | **Default size unchanged** | `studentShellLargeText.mjs --check=default --shots=<dir> [--compare=<dir>]`: every scene at 100% text, 1366×768 and 390×844, on a fixed clock (the teacher harness writes "closes 2:44 PM" from the clock), diffed pixel by pixel in the browser. | Before the sweep (two runs) vs after: **34/34 scene-viewports pixel-identical** — student Home, Assignments, Grades, the assignment tools (step algebra, graphing, table workbench, multiple responses, representation match), My Math Path, the secure exam (start, question), Live Challenge (lobby, round), Recovery (Home, Assignments Center), the teacher workspace (Home, a class). Two phone tool scenes flicker by 16–72 px (caret/anti-aliasing) between runs on *either* side; a rerun after the sweep matched the pre-sweep shot exactly. No harness font 404s this time. |
| 7 | **200% works, in CI** | `--check=text` scenes now also cover more tools, Recovery and the teacher workspace. Off-screen check: text inside a sideways-scrolling box that is itself on screen (the teacher's nav strip on a phone, `nav.mm-dashboard-nav`, `overflow-x: auto`) is reachable by scrolling that box, matching what the clipped check already allowed; the box itself sticking out still fails. New CI step "Large text, reflow and text spacing" in `accessibility-certification.yml` (job timeout 40 → 60 min; the step took 8m42s locally). | Locally **90/90** scene-settings pass after row 8 (18 scenes with the Rush round; 85/85 before it, 17 scenes × 200% at both viewports, 320px reflow, 1.4.12 spacing at both viewports): 0 clipped, 0 off screen, 0 unscaled, no horizontal scroll. Mutation: restoring `fontSize: 15` on the identity-bar name fails "did not grow at 200%" at both viewports. Before the scroller fix the teacher's nav failed at **default** size too (320px, spacing), i.e. a harness gap, not the sweep. |
| 8 | **Fluid font sizes** (Codex P1 on #487, via the coordinator) | In `clamp(A, 4.2vmin, B)` the sweep had converted only the bounds, so the preferred term ignored the setting: Graph Feature Rush's prompt was 32.3px on a 1366×768 Chromebook and only 42px (1.3×) at 200%. Now: `src/platform/layout/textScale.js` sets `--mm-text-scale` on the root from a hidden probe `calc(100 * var(--mm-px))` wide (1 at the default size, 2 at 200%; a ResizeObserver follows changes; within 0.5% of 1 snaps to 1), installed in `src/main.jsx` and defaulting to 1 in `index.css`. The codemod rewrites a font-size clamp's bare viewport term (`vw/vh/vmin/vmax/dvh/…/cq*`) to `calc(4.2vmin * var(--mm-text-scale, 1))`: 78 values in 21 files, plus 2 held in variables by hand (projector `promptSize`, the projector standings `size:`). Font sizes only: padding and line-height clamps are untouched. The countdown digit stays allow-listed. | `textScale.test.mjs` (scale maths, install/observe/uninstall, the `main.jsx` import and call; mutation: no snap, no install → red). Codemod tests for clamps (rem bounds, ternaries, not padding/line-height, idempotent). Ratchet: a bare viewport term in a font size, a `*Size` variable or a `size:` key fails (mutation: unwrapping one in Grades, Rush, the projector → red). New `--check=text` scene **graph-feature-rush/round** (the Rush round's Loading card, `clamp(28px, 7vmin, 56px)`): passes with the probe; with the `main.jsx` install removed it fails "did not grow" on the Chromebook. The three standalone harness pages the scenes use install the probe as `main.jsx` does. |
| 9 | **Graph Feature Rush on a phone** (found by the new scene) | The phone bar was forced `flex-wrap: nowrap` and the shell's implicit column grew to fit it, so the "Reconnecting… your taps are saved" state pushed the clock, Exit and Skip off a 390px screen — **at the default size too**, and at 200%, 320px and with text spacing. Now the shell's column is `minmax(0, 1fr)`, the phone bar may wrap and the reconnect label may wrap. A normal round's bar still fits on one row, so nothing moves there. | The scene passes at all five settings; the default-size shot changes only in that reconnecting state (now fits; checked by eye). |

**200% clipping found by the sweep that needed a component fix:** only the
Graph Feature Rush phone bar (row 9). Every other student and teacher scene
passes without a layout change (job H's two fixes, the phone action bar and
Live Challenge's answer card, still hold).

## Decisions (conservative calls, recorded)

- **Equation auto-fit floor stays 17 CSS px** at every setting: fitting to the
  visible width beats size (the anchor has `overflow: hidden`, so a floor that
  grew would clip long equations on a phone).
- **Countdown digits** (3·2·1·GO) stay as they were: aria-hidden, already
  ≥88px; doubling them would overflow a projector or phone.
- **SVG text** (wheels, graphs, worksheet visuals) scales with its drawing,
  not the text setting; the 1.4.4 checks exempt graphics as 1.4.10 does.
- **The teacher's phone nav strip** scrolling sideways is accepted (a
  component that scrolls on its own, labels reachable); not redesigned.
- **Projector screens** were converted like everything else; a projector
  normally runs at the default text size, where nothing changed.

## Left (and why)

- **Identity bar over the Graph Feature Rush bar** (found by the new scene,
  default size, both viewports): in the real app the student identity bar
  draws on top of the full-screen Rush round's top row (alias, round, count;
  on a phone the clock too once the bar wraps). Not a text-size defect and
  outside this job; reported to the coordinator, not fixed.
- **Fluid sizes in a state no harness reaches** (Rush prompts during play,
  the projector): converted and ratcheted, measured only through the
  Loading card.

- **Screen-reader and real-user testing** (NVDA, JAWS, VoiceOver, ChromeVox;
  students who use large text) — needs people. Everything here was measured in
  Chromium only.
- **Other browsers' text-size settings** (Safari, Firefox "zoom text only",
  ChromeOS system font size) — not measured; Chromium's default font size is
  what the harness changes.
- **Screens with no harness scene** (teacher gradebook, editors, admin,
  Graph Feature Rush rounds, the graphing calculator panel, Path session player
  beyond My Math Path): swept and covered by the ratchet and the default-size
  arithmetic (`calc(N * var(--mm-px))` is N px at default), but not measured
  at 200% in a browser.
- **Wheel and graph labels** stay drawing-sized (see decisions).
- **Case-review print sheet** (`caseReview.css`, `@media print`) stays 11.5px:
  paper, pragma'd and allow-listed (adversarial review).
- **Worksheet PDF visuals** (`assignmentWorksheetVisuals.js`) stay in px: they are paper, rendered only by the PDF generator; added to the codemod's `PRINT_ONLY` after the coordinator's review of #487, pinned in `pxToRemCodemod.test.mjs`.

## Files outside src/** and this job's tests

- `.github/workflows/accessibility-certification.yml` — one new step, the job
  timeout, two paths. Shared with every accessibility job; small hunk.
- `scripts/codemods/px-to-rem.mjs` — job H's codemod, the template-literal
  pass.
- Source-contract tests owned by earlier jobs (E, H, wallet), repointed as
  above.

No file in jobs O or P's lanes (test-prep content, graders/answer
equivalence) was touched beyond font-size values the sweep rewrote.

## Running the checks

```bash
npm run test:platform && npm run lint && npm run build
npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
node tests/browser/studentShellLargeText.mjs --check=targets,s5,text
# default-size proof: shots on the old tree, then on the new one
git stash; node tests/browser/studentShellLargeText.mjs --check=default --shots=/tmp/before; git stash pop
node tests/browser/studentShellLargeText.mjs --check=default --shots=/tmp/after --compare=/tmp/before
```
