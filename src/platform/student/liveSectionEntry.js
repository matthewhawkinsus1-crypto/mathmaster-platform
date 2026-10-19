/*
 * WHERE "START WARM-UP" / "START DOL" LANDS.
 *
 * A live Warm-Up or DOL card names the section's question indices and this
 * student's records for them, in the same order (studentDashboardModel
 * activeWarmups / activeDols). The button must open the first one the student
 * still has to do — never the first index, which may already be finished.
 *
 *   warm-up: unfinished = not correct and not out of tries
 *   DOL:     unfinished = not attempted yet (each DOL try is timed)
 *
 * When the records do not line up with the indices (an accommodation removed
 * some items from the records only), the first index is returned unchanged:
 * App's entry still steps past finished work, and guessing a position could
 * open an item the student is not responsible for.
 */
const DONE_STATUSES = new Set(['correct', 'expired']);

const validIndices = (indices) => (Array.isArray(indices) ? indices : [])
  .filter((index) => Number.isInteger(index) && index >= 0);

export const firstOpenLiveQuestionIndex = ({ indices = [], records = [], section = 'warmup' } = {}) => {
  const list = validIndices(indices);
  if (!list.length) return null;
  const recs = Array.isArray(records) ? records : [];
  if (recs.length !== list.length) return list[0];
  const unfinished = section === 'dol'
    ? (record) => !(Number(record?.totalAttempts) > 0)
    : (record) => !DONE_STATUSES.has(String(record?.status || ''));
  const position = recs.findIndex(unfinished);
  return position === -1 ? list[0] : list[position];
};

export default firstOpenLiveQuestionIndex;
