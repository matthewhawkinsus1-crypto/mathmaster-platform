# Algebra I and Algebra I Honors — Thanksgiving Break Packet

Two Assignment V5 teacher imports: a cumulative review of everything taught from the start of the year, for a student working alone over the break. Each is one assignment of ten Classwork sections, one for each unit in the order taught. In each unit the questions go from the building block to grade level.

| File | For | Questions |
|---|---|---|
| `Algebra1_Thanksgiving_Packet.json` | Algebra I classes | 54 |
| `Algebra1_Thanksgiving_Packet_Honors.json` | Algebra I Honors classes | The same 54, then 11 Honors questions (65) |

## Teacher setup

1. Import `Algebra1_Thanksgiving_Packet.json` for Algebra I classes and `Algebra1_Thanksgiving_Packet_Honors.json` for Algebra I Honors classes. Pre-Flight shows each one ready, with no errors and no warnings. Its one advice note is the note every lesson here gets: the hints and worked solutions have no Spanish version.
2. For an Honors class, Pre-Flight keeps every question. The packet has no Practice section, so no question is replaced by an exam item, and the Honors file supplies all four depth areas by itself.
3. Students get 3 tries on each question, with hints and immediate feedback. Every student gets the same numbers.
4. The sections are Classwork on purpose. A worked example opens by itself only on Classwork, and is never shown on a DOL, quiz or test.

## What is in it

| Unit | TEKS | Regular / Honors | What the student does |
|---|---|---|---|
| 1 Functions, domain and range | A.12A, A.2A, A.3C | 5 / 6 | Builds a mapping, sorts functions from non-functions, reads intercepts, then domain and range from a graph |
| 2 Rate of change and the forms of a line | A.3B, A.2C, A.3C, A.2B | 8 / 9 | Finds slope on a graph and in a table, graphs from y = mx + b and from intercepts, writes a line from a story, a table and two points |
| 3 Scatterplots and sequences | A.12C, A.4B, A.4C | 4 / 5 | Builds and plots recursive sequences, sorts causation from association, fits a line and predicts |
| 4 Transformations of linear functions | A.3E | 4 / 5 | Plots the images of f(x) = x under f(x) + d, f(x − c) and a·f(x), then maps a point under all three |
| 5 Parallel, perpendicular, horizontal and vertical lines | A.2G, A.2F | 4 / 5 | Graphs y = 4 and x = −5, then a parallel and a perpendicular line through a point |
| 6 Solving linear equations | A.5A | 7 / 8 | One step, two steps, distributing, variables on both sides, in Step Algebra |
| 7 Linear inequalities in one variable | A.5B | 6 / 7 | Graphs x ≥ −2, then solves and graphs five inequalities, two of which reverse the symbol |
| 8 Solving systems by graphing | A.3F, A.2I, A.3G | 5 / 6 | Graphs three systems (one has no solution), writes a system from a story, then graphs it |
| 9 Solving systems by substitution | A.5C, A.2I | 5 / 6 | Solves three systems, writes a system from a story, then solves it |
| 10 Inequalities in two variables and their systems | A.3D, A.2H, A.3H | 6 / 8 | Builds the boundary, chooses solid or dashed, shades and tests a point; models one from a story; graphs two systems |

52 of the 54 regular questions are worked in a rich tool. The other two are answer boxes that ask the student to write a system from a story, which no tool produces. In the Honors file, one more answer box asks for the equation of a perpendicular line, and its later parts follow through from its earlier ones.

The Honors questions are the last one or two of each section: an open endpoint, a fraction slope in three forms, a geometric sequence, a reflection with a shift, the equation of a perpendicular line, an equation and a system with no solution, a system that is one line, a fraction inequality, a modelled system of inequalities, and a bounded region with its corners.

Every question has three hints, a "Let's back up" step, a worked solution with steps, and a "Watch out" line.

## Worked examples

`lessonSupports.examples` holds 38 authored examples in the regular file and 42 in the Honors file. Each is a sibling problem (the same method with other numbers, never an item of the packet) written as a step card of 3 to 6 steps, each with its reason. The four Step Algebra examples that are solved with balanced moves alone also carry `moves`, the tool's own actions, for the replay.

The first question on each skill names its example. Every question that opens an example also carries one or two guided notes, which Classwork shows today. Later questions on the same skill are covered by that example or by the platform's own. The platform's coverage rule finds no uncovered question in either file.

## Verification

- `npm run validate:authoring-v5 -- <file>` prints `PASS` for both files, with no warnings.
- `tests/platform/thanksgivingPacketAlgebra1.test.mjs` holds, for both files:
  - Pre-Flight is valid with 0 errors and 0 warnings, and no hint is hidden.
  - The ten sections, their standards and their counts.
  - Every question is covered by a worked example, by the platform's own rule.
  - Every key is worked out in the test from what the student is shown (the points, the rows, the equation in the prompt, the numbers of the story). The platform's own graders mark it right, and mark at least one wrong response wrong.
  - No item is an item of a taught lesson.
  - For an Honors class, Pre-Flight replaces nothing in the Honors file.
  - Each committed file is exactly what the builder writes.

## Regenerating the files

The unit modules are the source. Edit one, then run:

```bash
node scripts/content/build-algebra1-thanksgiving-packet.mjs
```

| Module | Holds |
|---|---|
| `scripts/content/algebra1ThanksgivingPacket/units1to3.mjs` | Units 1–3 |
| `scripts/content/algebra1ThanksgivingPacket/units4to7.mjs` | Units 4–7 |
| `scripts/content/algebra1ThanksgivingPacket/units8to10.mjs` | Units 8–10 |
| `scripts/content/algebra1ThanksgivingPacket/examples.mjs` | The worked examples |
| `scripts/content/algebra1ThanksgivingPacket/shared.mjs` | The shape every question and example is written in |

The builder refuses to write a packet in which a question has no example before it, or an example no question opens.

## Known follow-ups (not changed here)

- The worked-example player is not live yet. Until it is, students see the guided notes on the first question of each skill, and "See a similar problem worked" where the platform has one.
- No Spanish version of the hints and worked solutions is written, as in every other lesson in this folder.
