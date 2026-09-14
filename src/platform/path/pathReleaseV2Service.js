import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { DEPLOYED_COURSE_PATH_RELEASE } from './pathReleaseManifest.generated.js';
import { RELEASE_PHASE_MESSAGES } from './pathReleaseV2Presentation.js';

// The browser half of the Path Release V2 control plane.
//
// Three things are deliberately true here:
//
//   * No question, answer or generator data ever crosses this boundary. The
//     browser sends the identity of the release ITS bundle was built from and
//     receives counts, phases and diagnostics back.
//   * Publishing is a loop, not a single call. A release runs until its server
//     time budget is spent and then says `continue: true`; calling again resumes
//     it at the next unwritten chunk. An interrupted release and a long one take
//     exactly the same path.
//   * A structured failure is a RESULT. The callable returns phase, document,
//     property path, machine code and a recommended next action so the admin
//     page can show them instead of sending someone to Cloud Functions logs.

export { RELEASE_PHASE_MESSAGES, describeReleaseDiagnostic } from './pathReleaseV2Presentation.js';

/** The certified release identity this Hosting bundle was built from. */
export const deployedBrowserRelease = () => ({
  releaseId: DEPLOYED_COURSE_PATH_RELEASE.releaseId,
  contentHash: DEPLOYED_COURSE_PATH_RELEASE.contentHash,
});

/**
 * Which release is deployed, which one production is serving, and whether a job
 * is running or failed.
 *
 * The browser manifest goes with the request so a Hosting bundle and a
 * path-admin deployment from different builds are reported as a mismatch rather
 * than silently publishing against stale assumptions.
 */
export const fetchCoursePathReleaseStatus = async () => {
  const call = httpsCallable(functions, 'getCoursePathReleaseStatusV2');
  const result = await call({ browserManifest: deployedBrowserRelease() });
  return result.data || {};
};

const runReleasePass = async (callableName, { onProgress = null, maxPasses = 12 } = {}) => {
  const call = httpsCallable(functions, callableName);
  let pass = 0;
  let last = null;
  // Bounded: a release that cannot finish in this many server passes is a
  // problem to report, not to retry forever.
  while (pass < maxPasses) {
    pass += 1;
    // eslint-disable-next-line no-await-in-loop
    last = (await call({})).data || {};
    onProgress?.({
      phase: last.phase || null,
      label: RELEASE_PHASE_MESSAGES[last.phase] || last.phase || '',
      completedChunks: last.completedChunks ?? null,
      totalChunks: last.totalChunks ?? null,
      counts: last.counts || null,
      pass,
    });
    if (!last.ok) return last;
    if (!last.continue) return last;
  }
  return { ...last, exhausted: true };
};

/** Publish the certified course Path release, resuming across server passes. */
export const publishCoursePathRelease = (options = {}) => runReleasePass('publishCoursePathReleaseV2', options);

/** Resume an interrupted release. Same engine; a distinct name for the audit. */
export const resumeCoursePathRelease = (options = {}) => runReleasePass('resumeCoursePathReleaseV2', options);

/** One release job, including its per-chunk state. */
export const fetchCoursePathReleaseJob = async (jobId) => {
  const call = httpsCallable(functions, 'getCoursePathReleaseJobV2');
  const result = await call({ jobId });
  return result.data || {};
};

export default fetchCoursePathReleaseStatus;
