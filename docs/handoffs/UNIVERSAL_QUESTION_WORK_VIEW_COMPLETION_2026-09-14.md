# Universal Question Work View completion — 2026-09-14

## Root cause

Earlier Universal Work View stages migrated registered tools and made their
tool-level shells preserve state. Ordinary QuestionEngine fixtures were still
allowed to own a legacy `EnlargeableFigure`, however. A graph inside a composed
or staged question could therefore open a graph-only shell while the current
answer control and stage navigation remained in the covered assignment page.

Assignment-chrome suppression had a second independent gap: it lived inside
compact/mobile media queries. Desktop and Chromebook layouts therefore kept
headers, question navigation, standards strips, task cards, and sticky actions
alive. A Chromebook viewed near 67% browser zoom has a particularly wide CSS
viewport, so it selected that exception while retaining the same physical
screen and let assignment chrome compete visually with Work View.

## Permanent boundary

`QuestionEngine` now mounts one `EnlargeableFigure` around the complete current
question interaction. The boundary includes the current workflow stage,
fixture, response control, stage navigation, Submit, Undo, Scratchpad,
Calculator, Task, Help, and Close. CSS changes only its presentation; React
does not clone, portal, key, or remount the mathematical subtree.

A nested `EnlargeableFigure` detects the parent's capability port. It publishes
its local camera/tool capabilities upward and renders its existing children
without another opener or host. Standalone figures with no surrounding question
retain their own Work View support.

The document-level open flag now suppresses assignment chrome at every viewport
width. The Work View host owns one explicit application-modal stacking layer;
individual assignment components do not participate in a z-index escalation.

## Certification and remaining paths

The browser matrix uses real `QuestionEngine` questions and now includes a
restricted-linear staged graph analysis. It covers 1366×768 Chromebook,
2039×1146 zoom-equivalent CSS viewport, 1920×1080 desktop, 390×844 portrait,
and 844×390 landscape, capturing every state and drawer phase in each cell.

Direct `EnlargeableFigure` uses remain intentionally supported for standalone
tools, previews, and fixtures outside QuestionEngine. Within QuestionEngine
they are inert nested boundaries and cannot create another fullscreen shell.
There are no known unmigrated assignment-question enlargement paths.
