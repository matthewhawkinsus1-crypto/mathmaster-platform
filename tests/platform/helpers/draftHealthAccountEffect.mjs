/*
 * APP'S "A SHARED CHROMEBOOK" EFFECT, RUN (pass 3, wave 7, review B3).
 *
 * App.jsx clears the draft-save problems when a signed-in account gives way,
 * never when one arrives (a reload keeps this student's kept notice). Node
 * cannot render App, so the effect's own body is pulled out of the source and
 * run as a function, with a ref and a counting clear, against one tab's life.
 */
import { executableSource, region } from './sourceContract.mjs';
import { accountChangeClearsDraftProblems } from '../../../src/platform/persistence/draftSaveHealth.js';

export const draftHealthAccountEffect = (appSource) => {
  const app = executableSource(appSource);
  const rule = region(app, 'const draftHealthAccountRef = useRef(null);', '}, [user?.id]);');
  const start = rule.indexOf('useEffect(() => {');
  if (start === -1) throw new Error('the account rule is not an effect body (a cleanup would run on every change)');
  const body = rule.slice(start + 'useEffect(() => {'.length);
  // eslint-disable-next-line no-new-func
  const run = new Function('draftHealthAccountRef', 'user', 'clearDraftSaveProblems', 'accountChangeClearsDraftProblems', body);
  return { app, rule, run };
};

/** One tab's life: `[from, to]` account ids per render, and the clears each caused. */
export const replayAccounts = (run, steps, ref = { current: null }) => steps.map((account) => {
  let clears = 0;
  run(ref, account ? { id: account } : null, () => { clears += 1; }, accountChangeClearsDraftProblems);
  return clears;
});
