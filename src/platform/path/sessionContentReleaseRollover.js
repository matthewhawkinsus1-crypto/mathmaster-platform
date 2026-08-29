export const CCMR_CONTENT_RELEASE_CHANGE_REASON = 'ccmr-content-release-changed';

const activeSessionFrom = (result) => {
  const session = result?.session || null;
  return session?.status === 'active' && session?.sessionId ? session : null;
};

/**
 * Ask for the next secure Path question, transparently replacing one stale
 * CCMR session when the server says the assessment bank release changed.
 *
 * The restart uses the exact launch configuration the student is already in —
 * including a frozen weekly slot — rather than trusting target/framework data
 * echoed back by the rollover response. Those launch inputs were already
 * validated by startMyMathPathSession and remain the client container's source
 * of truth for the current experience.
 *
 * This helper deliberately allows only one rollover. A second release change in
 * the same handoff means deployment/content is still moving underneath the
 * student; looping would hide that instability and could issue mixed content.
 */
export const fetchQuestionWithContentReleaseRollover = async ({
  session,
  sessionConfig,
  fetchNextSanitizedQuestion,
  startOrResumePathSession,
} = {}) => {
  if (!session?.sessionId) throw new Error('An active My Math Path session is required before loading a question.');
  if (typeof fetchNextSanitizedQuestion !== 'function' || typeof startOrResumePathSession !== 'function') {
    throw new Error('The My Math Path session runtime is incomplete.');
  }

  const first = await fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  if (!first?.rollover) {
    return {
      ...first,
      session,
      rollover: null,
      rolledOver: false,
    };
  }

  if (first.rollover.reason !== CCMR_CONTENT_RELEASE_CHANGE_REASON) {
    throw new Error(`Unknown session rollover reason: ${String(first.rollover.reason || 'missing')}.`);
  }

  const restarted = await startOrResumePathSession(sessionConfig || {});
  const replacement = activeSessionFrom(restarted);
  if (!replacement) {
    throw new Error('The replacement My Math Path session was not active after the assessment content update.');
  }

  const second = await fetchNextSanitizedQuestion({ sessionId: replacement.sessionId });
  if (second?.rollover) {
    throw new Error('The assessment content release changed again while the session was restarting. Return to My Math Path and try again.');
  }

  return {
    ...second,
    session: replacement,
    rollover: first.rollover,
    rolledOver: true,
  };
};
