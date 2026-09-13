# Live Challenge fairness certification (Issue #221)

## Runtime design

Each public room now carries a server-authored `currentRound`, monotonically
increasing `roundVersion`, unguessable `roundToken`, `startsAt`, `endsAt`, and
explicit phase. The runtime deliberately uses only the phases it can establish
authoritatively: lobby, answering, deadline-locked, and finished. Locked is
derived from the server deadline rather than waiting for another snapshot. A
client accepts a snapshot only when its round/version/phase
is not older than what it has already rendered. Reconnection therefore catches
up to the existing deadline instead of manufacturing a new timer.

Student and teacher/projector clients take five NTP-style callable samples on
join and every 30 seconds. The
median midpoint offset and median RTT make a single spike irrelevant; median
absolute RTT deviation identifies unstable links. The calibrated server epoch
anchors a `performance.now()` origin once per round. All subsequent human
elapsed capture and countdown rendering is monotonic, so changing the device
wall clock cannot affect them.

Submit immediately captures the response, monotonic elapsed time, round token,
version, connection category, and a random `submissionId`. It writes that exact
envelope to local storage, locks the controls, and announces pending status
before starting transport. A transient failure exposes retry of the same
envelope. Only a confirmed receipt clears it.

The callable validates membership, active round, version, token, deadline, and
the one-answer rule. Receipts are stored atomically with score on the private
player document. The same id returns the prior receipt; another id cannot earn a
second score. The existing secure Path grader remains the only correctness
authority. Scoring uses server-observed request arrival rather than the claimed
elapsed value. A fixed 750 ms delivery grace accepts captures that arrive just
after the deadline under realistic classroom latency; arrivals outside that
bound are rejected, and grace arrivals can receive only the final speed band.

Speed is quantized into five elapsed-percentage bands (100%, 80%, 60%, 40%,
20%; expired 0%) rather than raw arrival milliseconds. Server-observed band
boundaries carry the same 750 ms classroom tolerance as delivery, preventing a
small arrival difference from deciding a boundary tie without trusting a client
claim. Existing room speed
influence adjustment remains downstream of this scorer. Accuracy's 1,000-point
foundation, streak/comeback behavior, and second-chance no-speed rule are
unchanged.

Teacher-only diagnostic documents summarize synchronized, delayed/unstable,
and reconnecting devices. Firestore rules deny students this collection.
Private receipts retain dispute evidence without recording keystrokes.

## Deterministic certification result

The platform harness certifies 20, 75, 150, 300, and 600 ms one-way arrival
delays, a spike-resistant calibration sample, reconnect retry, simultaneous
submission, and 30 concurrent clients. Equal correct responses captured at the
same human elapsed time receive the same tier and points at every latency. A
genuinely faster response crosses a higher band; fast partial work remains
below full correctness. Thirty independently delayed clients converge on the
same room token and a duplicate retry leaves exactly thirty receipts.

The real emulator integration uses 24 concurrent authenticated callable
requests and verifies receipts, duplicate ids, same-student retry, token/version
advance, bounded late arrival, genuinely late rejection, and public/private
separation. This establishes transactional behavior in the emulator, not
production throughput: the emulator does not reproduce every production quota.
The 30-client deterministic model remains supplemental protocol stress coverage.

The browser harness additionally delays acknowledgement, interrupts transport,
reloads with a stored pending envelope, verifies automatic same-id recovery and
one score, advances the round, and verifies that expired state does not reopen.

## Deployment boundary

This change requires **Hosting, Firestore rules, and Functions**. It does not
add a WebSocket service, collection readable by students, answer-bearing public
state, or deployment action. Production deployment is intentionally deferred
until after review.
