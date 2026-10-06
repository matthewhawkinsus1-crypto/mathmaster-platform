import { stableStringify } from '../../utils/idUtils.js';
import { hasMeaningfulRawPathResponse } from '../../platform/path/pathToolResponses.js';
import { studentInputMark, studentInputSince } from '../../questionDraftStorage.js';

/*
 * Which of a Rich Tool's raw reports are sent to the secure autosave.
 *
 * A tool reports its raw construction (as its Path Tool Contract grades it)
 * whenever it changes. A report is sent when it is the student's work, or when
 * the screen shows work the server does not hold — never a tool's untouched
 * starting state:
 *
 *  - The tool's FIRST report of a construction is its mounted state: the Data
 *    Modeling Lab's default prediction x, Step Algebra the prompt's own
 *    equation, or the work restored on this device. The input mark is taken
 *    there, once the tool exists — a tap while the workspace is still loading
 *    is not work. (The engine reports `null` before a lazy tool has mounted;
 *    that is not the tool's state, and the mark waits for the real one.)
 *  - After it, a report that follows the student's input is their work.
 *  - At any point, work that differs from the server's copy of this item (a
 *    reload that restored a newer construction from this device's drafts) is
 *    sent, so the server never keeps a stale answer.
 *
 * Returns `(raw) => boolean`: true when this report should be saved.
 */
export const createToolWorkGate = ({
  serverRaw = null,
  inputMark = studentInputMark,
  inputSince = studentInputSince,
} = {}) => {
  let mark = null;
  let serverSignature = serverRaw && typeof serverRaw === 'object' ? stableStringify(serverRaw) : null;
  return (raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const firstReport = mark === null;
    if (firstReport) mark = inputMark();
    if (!hasMeaningfulRawPathResponse(raw)) return false;
    const studentWorked = !firstReport && inputSince(mark);
    const signature = stableStringify(raw);
    const differsFromServer = serverSignature !== null && signature !== serverSignature;
    if (!studentWorked && !differsFromServer) return false;
    serverSignature = signature;
    return true;
  };
};
