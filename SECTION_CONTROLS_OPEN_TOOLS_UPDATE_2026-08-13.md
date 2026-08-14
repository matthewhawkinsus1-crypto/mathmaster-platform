# MathMaster — Section Controls + Open Construction Tools

Date: 2026-08-13

## 1. Optional teacher Open / Close controls

Classwork and Practice now have independent teacher-controlled availability.

### Assignment authoring / Preflight
For each authored section, the teacher can choose:

- **Open automatically with assignment** — backward-compatible default.
- **Start locked until teacher opens it** — useful when instruction should happen before students begin that section.

Warm-Up and DOL keep their own special timing systems and are not replaced by this generic control.

### Live controls
The teacher can Open / Close / Reopen Classwork or Practice for one class period from:

- Teacher Home / Live Class Monitor
- Classes Workspace

The override is stored as **assignment + class period + section**. Changing Period 3 does not change Period 5.

When a section is closed:

- existing student work remains visible;
- new graded submissions in that section are blocked;
- navigation skips the locked section when moving Previous / Next;
- the question picker labels the section questions as locked.

After the final cutoff, the assignment becomes ungraded Practice Mode. Teacher section locks are intentionally ignored so students can revisit all content for practice.

Data shape:

```json
"sectionAccess": {
  "classwork": {
    "defaultState": "open",
    "overridesByClassPeriod": {
      "Period 3": {
        "state": "closed",
        "changedAt": "...",
        "changedBy": "..."
      }
    }
  },
  "practice": {
    "defaultState": "closed",
    "overridesByClassPeriod": {}
  }
}
```

No Firestore rules change or data migration is required. Older assignments without `sectionAccess` behave as open.

---

## 2. Open Sort Board

New tool id: `openSortBoard`

V5 authoring action: `sortIntoOwnGroups`

### Student experience

Students:

1. see all graph cards visually;
2. tap a card;
3. place it into a student-created group;
4. add more groups when needed;
5. name each group;
6. write a rationale for the mathematical feature shared by the group;
7. submit the full partition.

The interface is tap-based rather than drag-only so it works on phones, touchscreens, Chromebooks, keyboard/mouse, and trackpads.

### Self-grading model

The platform does **not** grade the prose explanation by pretending that keyword matching can judge mathematical reasoning. It grades the mathematical partition against one or more authored valid schemes. Group names and group order do not matter.

An author can provide many legitimate schemes for the same cards. The included Lesson 1–2 bundle accepts, among others:

- continuous vs. discrete;
- straight vs. smooth-curve vs. isolated points;
- function vs. non-function;
- left-to-right behavior.

The written rationale is saved in the response for teacher review.

Incomplete/incorrect sorting receives pairwise partial credit rather than an all-or-nothing zero.

### Authoring shape

```json
{
  "studentActions": ["sortIntoOwnGroups"],
  "items": [
    {
      "id": "A",
      "label": "Graph A",
      "graphSpec": { "type": "linear", "a": 1, "k": 0 }
    }
  ],
  "validSchemes": [
    {
      "id": "continuity",
      "groups": [
        { "name": "Continuous", "itemIds": ["A", "B"] },
        { "name": "Discrete", "itemIds": ["C", "D"] }
      ]
    }
  ]
}
```

Discrete point cards use Firestore-safe `{ "x": ..., "y": ... }` objects rather than arrays inside arrays.

---

## 3. Constraint-Based Function Builder

New tool id: `constraintFunctionBuilder`

V5 authoring action: `buildFunctionFromConstraints`

### Why it exists

Many construction prompts have many correct answers. Grading one hidden equation is mathematically wrong. This tool grades the **properties of the student's constructed relation** instead.

### Student experience

Students can:

- choose an allowed family;
- choose continuous or discrete;
- adjust parameters while the graph updates live;
- see their equation;
- use a live constraint checklist;
- submit any model satisfying all constraints.

Current families:

- linear;
- quadratic;
- exponential;
- absolute value;
- vertical line / non-function relation.

Supported constraints include:

- family;
- continuous/discrete;
- increasing/decreasing/constant;
- maximum/minimum;
- function/non-function;
- straight line;
- passes through a required point;
- vertex;
- x-intercept;
- y-intercept.

`passesThrough` and `vertex` accept Firestore-safe point objects such as `{ "x": 2, "y": 3 }`.

### Examples now used in the Lesson 3–4 bundle

- any continuous decreasing exponential;
- any continuous quadratic with an absolute maximum;
- any discrete quadratic with a minimum;
- any discrete increasing linear function;
- a continuous straight-line relation that is not a function.

This is deliberately not a multiple-choice substitute. Students actually construct the mathematics.

---

## 4. Firestore-safe authoring cleanup

While validating the new lesson bundles, the platform's V5 authoring guidance still showed relation coordinate pairs as nested arrays even though the assignment save guard correctly rejects arrays directly inside arrays for Firestore.

The V5 authoring contract has been corrected to prefer:

```json
"relation": [
  { "x": -2, "y": 3 },
  { "x": 1, "y": 2 }
]
```

and table rows as keyed objects. The shared coordinate-plane renderer now accepts both legacy `[x,y]` points and Firestore-safe `{x,y}` points, preserving backward compatibility while allowing new content to be stored safely.

The two updated Algebra I merged JSONs were normalized so they contain **zero arrays directly inside arrays**, and the compiled V5 output also passes a nested-array safety scan.

---

## 5. Validation performed

- 13 focused automated tests passed for section access, open sorting, and constraint-function grading.
- All 269 source `.js/.jsx/.mjs` files passed TypeScript syntax/JSX transpile parsing with zero syntax errors.
- Updated Algebra I V5 bundles compile to 23 and 26 runtime questions respectively.
- New-tool schema validation passes.
- Both updated bundles pass a Firestore nested-array safety scan after V5 compilation.

A full Vite production build could not run in this sandbox because the extracted project has no installed `node_modules`, and an offline `npm ci` could not recover every package from cache. The deployment build remains the final browser/bundler integration check.

---

## 6. Embedded Kahoot/Blooket-style mode — recommended architecture

A classroom game **does not need to bloat MathMaster** if it is a separate lazy-loaded experience that reuses MathMaster's existing question engine, classes, standards, and grading logic.

Recommended first version: **MathMaster Live Challenge**.

### Core experience

- Teacher launches from a class, assignment section, skill, or standard.
- Students already signed in to that class automatically see a Join button.
- Teacher can choose 5–20 questions and an approximate round time.
- Solo and team modes.
- Projector view shows the current round and leaderboard.
- Students answer on their own devices using existing MathMaster self-graded question/tool types.
- Correctness drives the score; speed should be only a modest bonus so fast guessing does not beat thoughtful mathematics.
- Optional anonymous/initials leaderboard and a teacher option to hide ranking entirely.

### Data policy

Live games should be **practice evidence by default**, not a formal DOL/test grade. The teacher could later explicitly opt into another policy, but competition should not silently become high-stakes assessment evidence.

### Architecture to avoid bloat

- `React.lazy()` / route-level code splitting: no game UI code loads during normal assignments.
- Reuse the existing question bank and QuestionEngine rather than create a second question format.
- Reuse existing tool grading rather than create a second answer checker.
- Store only lightweight live-session state: room, round, student response, score snapshot.
- Do not write timer ticks or animation frames to Firestore.
- One response write per student per round is enough; leaderboard state can be aggregated efficiently.
- Keep animations/themes as optional modules/assets loaded only when a game mode uses them.

### What would create bloat

The Blooket-like metagame is the expensive part: inventories, collectible characters, currencies, shops, randomized rewards, dozens of game modes, persistent cosmetics, and extra real-time state. None of that is necessary to get the instructional benefit of live competition.

Recommendation: build **Live Challenge** first as a clean competitive wrapper around existing MathMaster questions. If students use it heavily, add separate game themes/power-up modes later as plugins rather than putting them in the assignment runtime.
