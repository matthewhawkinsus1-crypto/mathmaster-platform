# Response checkpoint compatibility

Ordinary assignment work is checkpointed from `QuestionEngine`'s normalized
`answerState`; secure Test Cycle and server-private Path sessions are excluded.
Only `isComplete: true` states with a non-empty response identity are eligible.

| Runtime family | Local draft | Complete contract | Deadline support |
|---|---:|---:|---|
| Numeric, literal, equation, fraction, ordered pair | Yes | Yes | Supported |
| Multiple choice / choice-only | Yes | Yes | Supported |
| Table, system, multi-answer | Yes | Yes, all required parts | Supported |
| Workflow/composed multi-part | Yes | Yes, workflow-owned | Supported |
| Graph line, number line, function graph and constructions | Yes | Yes, tool-owned | Supported |
| Relationship/context/graph interpretation families | Yes | Yes | Supported |
| Step Algebra | Committed steps use the existing durable step path | Only a tool-declared complete current response | Supported without synthesizing a step |
| Modeling Lab | Tool-specific canonical action | Not a normal Submit response | Excluded |
| Secure Test Cycle / secure exam | Dedicated server state | Dedicated server state | **Excluded** |
| My Math Path server-graded sessions | Dedicated server state | Server-owned | **Excluded** |

## Trust and offline boundary

Firestore stamps both capture acknowledgement fields with `request.time`.
Consequently a server-acknowledged response can finalize with no browser open,
while an entirely local response cannot be backdated across a close. The latter
remains in IndexedDB/local draft storage and can be submitted after a teacher
reopen; it does not silently affect the canonical grade.

The scheduled function queries bounded active checkpoint records, re-reads the
assignment, roster grade row, question identity, current extension/manual-close
state and canonical attempt count, then either reschedules, closes with a receipt,
or writes through the existing canonical grade document. Checkpoint writes are
in a separate collection and therefore never invoke Classroom passback; only a
successful canonical grade update does.
