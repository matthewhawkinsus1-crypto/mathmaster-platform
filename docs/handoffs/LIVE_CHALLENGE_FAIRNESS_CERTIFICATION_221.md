# Live Challenge fairness certification (Issue #221)

## Runtime design

Each public room now carries a server-authored `currentRound`, monotonically
increasing `roundVersion`, unguessable `roundToken`, `startsAt`, `endsAt`, and
explicit `phase`. A client accepts a snapshot only when its round/version/phase
is not older than what it has already rendered. Reconnection therefore catches
up to the existing deadline instead of manufacturing a new timer.

Students take five NTP-style callable samples on join and every 30 seconds. The
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
authority. The server bounds capture elapsed against its round start, arrival,
deadline, and a 1.5-second classroom transport window, then passes the accepted
elapsed into the existing `scoreChallengeRound` function.

Speed is quantized into five elapsed-percentage bands (100%, 80%, 60%, 40%,
20%; expired 0%) rather than raw arrival milliseconds. Existing room speed
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

No Firestore throughput limitation was measured by the deterministic model:
submissions retain the existing one-private-player/one-public-player write
distribution and do not create a room-document hot spot. Emulator execution in
the authoring environment was unavailable because Firebase's emulator JAR
download returned HTTP 403; CI remains the authoritative emulator measurement.

## Deployment boundary

This change requires **Hosting, Firestore rules, and Functions**. It does not
add a WebSocket service, collection readable by students, answer-bearing public
state, or deployment action. Production deployment is intentionally deferred
until after review.

