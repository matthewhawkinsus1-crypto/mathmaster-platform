# MathMaster Local Persistence, Resume, Snapping, and Solution Review

## 1. Browser-local question drafts

Each student response is saved to `localStorage` under a versioned key containing:

- student ID
- assignment ID
- question index
- deterministic replacement variant
- student or teacher-preview session bucket

Graded work and post-deadline Practice Mode share the same student draft bucket. This prevents an unfinished response from disappearing merely because the due date passes. Teacher Preview remains isolated.

Stored draft data can include typed responses, table blanks, ordered pairs, multipart fields, plotted graph points, chosen x-values, freehand graph strokes, snapped curves, endpoint symbols, graph-analysis selections, and the current step-algebra equation. Drafts expire locally after 45 days.

The local draft is a continuity aid, not the authoritative grade record. Grades, partial-credit records, and assignment state continue to use Firebase.

## 2. Practice Mode continuity

When an assignment expires, the Practice Mode tracker is stored locally. Its initial replacement-variant numbers are copied from the frozen graded tracker so the student sees the same deterministic problem version and can recover the matching local draft. Practice attempts never update the recorded grade.

## 3. Resume Action banner

Whenever a student is working in an assignment, MathMaster records the assignment ID, title, exact question index, due date, and Practice Mode state in local browser storage. On the next login, the dashboard displays a large Resume Action banner that opens the saved assignment at the exact question.

The banner is shown only when the assignment still exists in the teacher's live assignment list. Deleted assignments are not resumed.

## 4. Locked-question solution review

After the third unsuccessful attempt, the problem version is locked. The original response remains visible but disabled, and a Solution Review appears beneath it.

Depending on the question type, the review can show:

- two or three equivalent answer representations
- a completed graph
- a marked system intersection
- exact and sample function points
- table cell answers
- multipart field answers
- graph-analysis domain, range, interval, intercept, and extrema results
- symbolic or numeric step-algebra solutions

The student can then request a new deterministic problem at the same difficulty. The prior draft remains isolated under its old variant key.

## 5. Coordinate-plane snapping

Point placement snaps to the visible coordinate lattice:

- ordinary grids: vertical and horizontal grid lines
- skip-count grids: grid lines and the halfway positions between adjacent grid lines

When either axis is skip-counting, coordinate tooltips are automatically enabled even when the JSON requests hidden coordinates. Bright horizontal and vertical guides and a point halo show the exact snapped release location.

For advanced student-selected x-values, the graph window anticipates the function's suggested outer points and key point before the student chooses values. This prevents an overly tight initial scale. The point dispenser does not reveal the key-point or center x-value.

## 6. End-behavior response cycle

Endpoint symbols are multipart responses. Placement and symbol type are graded independently, and an incorrect symbol does not block submission.

Before placement, the graph end has a yellow guidance glow. The glow disappears when a symbol is placed. If the submitted placement or symbol is incorrect, MathMaster removes that response without revealing the answer and restores the yellow guidance glow for another attempt.

## 7. Constant intervals

Constant-interval analysis includes a dedicated **Does not exist** response, matching the existing optional-response behavior for intercepts, extrema, and other graph features.

## 8. Performance considerations

The browser stores one compact draft per student, assignment, question, and variant. It does not store dense generated question copies or canvas screenshots for function graphs. Freehand graph strokes are committed only when a stroke ends, rather than on every pointer movement.

Undo history remains in memory for responsiveness; only the current response state is persisted. This keeps refresh recovery useful without continuously expanding browser storage.
