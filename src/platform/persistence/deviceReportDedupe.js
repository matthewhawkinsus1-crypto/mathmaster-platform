/*
 * A DEVICE REPORT THE SERVER ALREADY HOLDS IS NOT SENT AGAIN.
 *
 * The student runtime asks for a device report on hydration, reconnect,
 * pageshow, visibility return, new queued work, and before and after every
 * drain — and it retries its drain every ten seconds. An idle Chromebook with
 * an empty queue therefore sent the same "0 queued" snapshot about a dozen
 * times a minute, each one a callable, a Firestore transaction and a read of
 * the student's grade document.
 *
 * WHAT THE SERVER DOES WITH ONE (`reportStudentDeviceQueue`, functions/index.js).
 * It replaces this device's snapshot document for the student, if the report's
 * generation is newer than the stored one; stamps `reportedAt` with server
 * time; carries `firstReportedAt` forward; re-reads the student's `classId`;
 * and, when an assignment's queued count falls to zero, wakes the Classroom
 * passback. Nothing on the server reads `reportedAt` to decide anything:
 * `persistencePending` and final passback read the COUNTS. The one reader of
 * `reportedAt` is the teacher's recovery panel, which prints it beside each
 * device's count, to the minute.
 *
 * So a report may be skipped only when sending it would change nothing but
 * `reportedAt`, which means ALL of:
 *
 *   1. its content is exactly what the server last ACKNOWLEDGED applying, for
 *      this student, from this device — acknowledged, not merely sent;
 *   2. no report has been started on this device since that one, from any tab.
 *      A report that failed, timed out or is still in flight may have changed
 *      the server's document without this device ever hearing back, so after
 *      one, nothing is known and the next report always goes;
 *   3. that acknowledged report is younger than the heartbeat.
 *
 * Anything else sends: a changed state, a report this device cannot read its
 * own records for, a clock that moved backwards. This runs inside the detached
 * report (`deviceReportCoordinator.js`), so it can neither delay nor block a
 * delivery — delivery is still gated on nothing but delivery.
 *
 * Condition 2 is what makes condition 1 sound. Generations are allocated from
 * a durable per-device counter BEFORE a report is sent, and the server applies
 * only a generation newer than the one it holds. If the acknowledged report's
 * generation is still the newest this device has allocated, no later report
 * exists that the server could have applied instead, so the server's document
 * is the acknowledged one.
 */
import { indexedDbOutboxStorage, summarizeDurableOutbox } from '../performance/durableActionOutbox.js';
import {
  nextDeviceReportGeneration,
  readDeviceReportState,
  recordDeviceReportAcknowledgement,
} from './deviceIdentity.js';

/*
 * THE HEARTBEAT: FIVE MINUTES.
 *
 * An unchanged report is still sent once this long has passed since the last
 * acknowledged one. Five minutes keeps the "reported at" time a teacher sees
 * within a few minutes of the last time the device checked in while it is
 * open, which is the only thing that time is used for; it bounds how long a
 * class move (`classId`, re-read on every report) or a server-side change in
 * what a report stores can take to reach this device's row; and it still
 * removes nearly all of the traffic — an idle device goes from about twelve
 * calls a minute to one every five.
 */
export const DEVICE_REPORT_HEARTBEAT_MS = 5 * 60 * 1000;

/*
 * WHAT A REPORT SAYS, AS TEXT THAT IS EQUAL ONLY WHEN THE CONTENT IS.
 *
 * Keys are sorted, so two summaries that differ only in the order a count map
 * happened to be built in are one state. `undefined` reads as `null` because
 * that is what the callable puts on the wire. Nothing is hashed: the canonical
 * text itself is stored and compared, so a changed state cannot collide with
 * an unchanged one.
 *
 * There is nothing volatile in a summary to leave out: it holds counts,
 * reasons and the capture times of queued rows, all of which change only when
 * the queue does. The volatile parts of a report — its generation and when it
 * went out — travel beside the summary and are never part of the fingerprint.
 */
const canonicalText = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value) ?? 'null';
};

export const deviceReportFingerprint = (summary) => canonicalText(summary ?? null);

/**
 * Send this report, or skip it? Pure: everything it knows is in its argument.
 *
 * `acknowledged` is the last report the server acknowledged applying
 * (`{ studentId, deviceId, fingerprint, generation, capturedAt }`) or null;
 * `latestGeneration` is the newest generation this device has allocated, or
 * null when that is unknown.
 */
export const decideDeviceReport = ({
  studentId,
  deviceId,
  fingerprint,
  now,
  acknowledged = null,
  latestGeneration = null,
  heartbeatMs = DEVICE_REPORT_HEARTBEAT_MS,
} = {}) => {
  const send = (reason) => ({ send: true, reason });
  if (!acknowledged || typeof acknowledged !== 'object') return send('never-acknowledged');
  if (!studentId || acknowledged.studentId !== studentId) return send('different-student');
  if (!deviceId || acknowledged.deviceId !== deviceId) return send('different-device');
  if (typeof fingerprint !== 'string' || acknowledged.fingerprint !== fingerprint) return send('state-changed');
  const generation = Number(acknowledged.generation);
  if (!Number.isFinite(generation) || generation <= 0 || generation !== Number(latestGeneration)) {
    return send('report-since-unacknowledged');
  }
  const age = Number(now) - Number(acknowledged.capturedAt);
  if (!Number.isFinite(age) || age < 0) return send('clock-unreliable');
  if (!(age < heartbeatMs)) return send('heartbeat-due');
  return { send: false, reason: 'unchanged-within-heartbeat' };
};

/**
 * Report what this device holds for `studentId`, unless the server already
 * holds exactly that.
 *
 * `transport({ deviceId, generation, summary })` sends one report and resolves
 * with the server's answer. Only an answer of `applied: true` is remembered as
 * acknowledged; a report the server ignored as superseded, or one that failed,
 * leaves the next report to go out whatever it says.
 *
 * Resolves with the server's answer, or `{ skipped: true, reason }`.
 */
export const reportDeviceQueueUnlessUnchanged = async ({
  studentId,
  transport,
  summary = null,
  storage = indexedDbOutboxStorage,
  now = Date.now,
  heartbeatMs = DEVICE_REPORT_HEARTBEAT_MS,
} = {}) => {
  if (!studentId) return null;
  const capturedAt = Number(now());
  const [payload, state] = await Promise.all([
    summary || summarizeDurableOutbox({ storage, studentId }),
    // Records this device cannot read are a reason to send, never to fail.
    readDeviceReportState({ storage }).catch(() => null),
  ]);
  const fingerprint = deviceReportFingerprint(payload);
  const decision = decideDeviceReport({
    studentId,
    deviceId: state?.deviceId ?? null,
    fingerprint,
    now: capturedAt,
    acknowledged: state?.acknowledged ?? null,
    latestGeneration: state?.latestGeneration ?? null,
    heartbeatMs,
  });
  if (!decision.send) return { skipped: true, reason: decision.reason };

  // Stamped now, after the summary was read and before the request goes out:
  // what the server orders by is when the queue was observed.
  const { deviceId, generation, durable } = await nextDeviceReportGeneration({ storage, now });
  const response = await transport({ deviceId, generation, summary: payload });
  if (durable && response?.applied === true) {
    // Failing to remember only means the next report is sent anyway.
    await recordDeviceReportAcknowledgement({
      storage,
      acknowledgement: { studentId, deviceId, fingerprint, generation, capturedAt },
    }).catch(() => null);
  }
  return response;
};
