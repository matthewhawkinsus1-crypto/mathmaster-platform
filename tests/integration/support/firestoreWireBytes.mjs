/*
 * HOW MANY BYTES A BROWSER RECEIVES FOR ONE DELIVERED DOCUMENT.
 *
 * A student's browser listens over WebChannel, whose Listen responses carry
 * each changed document in the protobuf JSON mapping:
 *
 *   {"documentChange":{"document":{"name":"projects/…/documents/<path>",
 *     "fields":{"score":{"integerValue":"1200"},…},
 *     "createTime":"…","updateTime":"…"},"targetIds":[2]}}
 *
 * plus one targetChange (a resume token and a read time) per snapshot. The
 * node simulation's SDK speaks gRPC instead, so the profile ESTIMATES the
 * browser's bytes by encoding exactly that JSON for every document a device's
 * listener delivered. It is the same estimate for the old and the new
 * standings, so the comparison is fair; the browser profile measures the real
 * thing on the wire.
 */
const PROJECT_PREFIX = 'projects/mathmaster-aleks/databases/(default)/documents/';
const TIMESTAMP = '"2026-10-04T23:10:00.123456Z"';
// targetChange {"targetChange":{"targetChangeType":…,"targetIds":[2],"resumeToken":"…","readTime":"…"}}
export const SNAPSHOT_OVERHEAD_BYTES = 118;

const isTimestamp = (value) => value && typeof value === 'object' && (typeof value.toMillis === 'function' || (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number'));

const encodeValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (isTimestamp(value)) return { timestampValue: TIMESTAMP };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
};
const encodeFields = (data) => Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, encodeValue(value)]));

/** Estimated WebChannel bytes for one delivered document at `documentPath`. */
export const documentWireBytes = (documentPath, data) => JSON.stringify({
  documentChange: {
    document: {
      name: `${PROJECT_PREFIX}${documentPath}`,
      fields: encodeFields(data),
      createTime: TIMESTAMP,
      updateTime: TIMESTAMP,
    },
    targetIds: [2],
  },
}).length;
