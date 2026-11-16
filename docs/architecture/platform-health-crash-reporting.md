# Platform health: crash counts the owner can see

A question that crashed on every reload kept students stuck for a class period,
and it was learned of from reports (PR #553). The device already kept a scrubbed
local log (`src/platform/runtime/clientDiagnostics.js`), but nothing left it
unless someone pressed "Copy details for your teacher".

This adds an optional report of **counts**. It is **off** until the root
administrator turns it on in Administration (the Platform health panel at the
top of Classes & rosters, the section Administration opens on).

## The switch

`platformFlags/crashReporting` holds `{ mode }`. A missing document is `off`.
Only the `managePlatformHealthReporting` callable (root administrator) writes it.

| Mode | What a device sends |
| --- | --- |
| `off` (default) | Nothing about a failure. See "What happens while it is off". |
| `family` | A count per build × kind × boundary × role × screen template × question family × module × error signature. |
| `question` | The same, plus the assignment id and question id. |

## Exactly what is sent

Defined in one place, `functions/shared/crashReport.mjs`, and used by the
browser, the callable and the view. Every field is a closed set or shape:

| Field | Shape |
| --- | --- |
| `build` | 7 to 12 hex digits, or `unknown` |
| `kind` | one of a fixed list (`question-module-error`, `render-error`, ...), or `other` |
| `source` | an identifier-shaped word the code passed (`question`, `app`), or `other` |
| `role` | `student` or `teacher`, set by the server from the sign-in |
| `screen` | a route template: `/assignments/:id/:id/:id`. Any segment that is not a known route word becomes `:id` |
| `family`, `questionType` | identifier-shaped; refused if it has a space, an `@` or five digits in a row |
| `signature` | the error message rebuilt from a fixed word list. Quoted text is removed whole, any word not on the list becomes `_`, any number `#` |
| `assignmentId`, `questionId` | `question` mode only |
| `count` | 1 to 25 per request |

Never sent: a student id, name, email, class, teacher, answer, draft, question
text, stack trace, the local log's message, a URL, or a time of day. The server
stores the UTC day and the first and last UTC hour a bucket was seen.

The callable rebuilds every bucket from these shapes, so a hand-built request
stores nothing the app could not have sent.

## What happens while it is off

A device does not know the mode without asking, and it must not read Firestore
to find out (cost). So after a failure, a signed-in device sends one empty
request, `{ probe: true }`, and gets `{ mode: "off" }` back. It then drops what
it had queued and does not ask again for 24 hours. That request carries nothing
about the failure, and the server reads and writes nothing for it beyond its
cached copy of the switch. A device that never fails never asks.

## What is not counted

A failure recorded while the device is offline, and a chunk that would not load
(a tab that outlived a deploy), are not reported. The reporter is itself a
lazily loaded chunk, so asking for it then is a second failed request on a
screen that is already recovering. Both still go in the device's local log.

## Where it is kept, and who can read it

| Collection | Holds | Read | Kept |
| --- | --- | --- | --- |
| `platformHealthDaily/{YYYY-MM-DD}` | one document of bucket counts per UTC day | root administrator only | 30 days |
| `platformHealthReporters/{day}_{hash}` | per-account daily rate limit: request count and bucket names | nobody (Admin SDK only) | 2 days |

The rate-limit record is named by a SHA-256 of the day and the account's
sign-in id. It exists so one account cannot write without bound, and so
"accounts" counts people rather than crashes. It is the only place an account
is represented at all, and it cannot be read from a browser, the root
administrator's included. Someone with direct database access and a list of
sign-in ids could recompute the hash; the two-day retention bounds that.

`prunePlatformHealth` (daily) deletes past retention. Each document also
carries `expireAt`, so a Firestore TTL policy can be added as a second net.

"Turn off and delete collected counts" in the view sets the mode to `off` and
deletes both collections.

## Cost

- Student hot paths (typing, Submit, Next): no reads, no writes. The reporter
  is a separate chunk loaded only after a failure, and it never reads Firestore.
- Off: zero Firestore operations per request (the switch is cached per
  function instance for two minutes).
- On: one report request is one transaction of 3 reads (the switch, the day,
  the account's limit) and 2 writes. The switch is read in the transaction so
  an instance that cached "on" cannot write after reporting is turned off or
  purged. An
  account may make 8 requests a day, touching at most 20 distinct buckets. A
  crash loop is merged on the device into one batch, with a growing gap
  between batches.
- A day's document holds at most 300 buckets; further reports are counted as
  `overflow`.
- The view: up to 14 reads when the root administrator opens or refreshes it.
  No listener.

## Signals in the view

An issue is one failure across builds and screens: kind + family + module +
signature (+ the question in `question` mode).

- **At least 5 accounts today**: the largest bucket of the issue has 5 or more accounts.
- **New today**: it has no count on any earlier day that is still kept.
- **Rising**: at least 10 today and at least 3 times its average over the earlier kept days.

## Deploying

- Functions: `reportClientCrashes`, `managePlatformHealthReporting`, `prunePlatformHealth` (new; the scheduler job is created with it).
- Firestore rules.
- Hosting.
- No composite index.

Rules before Hosting is the safe order: until the rules are live the view's
read is refused by the catch-all, which is the closed direction.
