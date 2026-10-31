/*
 * WHAT GOOGLE CLASSROOM'S SIGN-IN SENDS BACK, AND TAKING IT OUT OF THE ADDRESS (TT06).
 *
 * The OAuth callback (functions/index.js oauthCallback) redirects the teacher to
 * the app with `?classroomConnected=1` or `?classroomError=<reason>`. The app
 * lands on Home, and the Classroom screen shows the result the next time the
 * teacher opens it. Those two parameters are not launch parameters
 * (appUrl.js searchWithoutLaunch keeps them on purpose, so a teacher who opens
 * another screen first still gets the result), but nothing ever removed them:
 * they stayed in the address bar and in every address after it, and the screen
 * showed "reconnected successfully" (or the old failure) again each time it was
 * opened for the rest of the visit.
 *
 * So the screen that shows the result now takes it: it reads the parameters and
 * removes them from the address in the same step, once. Nothing is added to the
 * browser history, and the rest of the address (path, other parameters, hash)
 * stays as it was.
 */
const SIGN_IN_PARAMS = Object.freeze(['classroomConnected', 'classroomError']);

const paramsOf = (search) => new URLSearchParams(String(search || '').replace(/^\?/, ''));

/** What the sign-in sent back in `search`: { connected, error } (error is '' when there is none). */
export const classroomSignInReturn = (search = '') => {
  const params = paramsOf(search);
  return {
    connected: Boolean(params.get('classroomConnected')),
    error: params.get('classroomError') || '',
  };
};

/** `search` without the two sign-in parameters: '' or '?…' with the others in their order. */
export const searchWithoutClassroomSignIn = (search = '') => {
  const params = paramsOf(search);
  SIGN_IN_PARAMS.forEach((name) => params.delete(name));
  const text = params.toString();
  return text ? `?${text}` : '';
};

/**
 * Read the sign-in result from the page's address and remove it from there.
 * Returns what it read; a page with neither parameter is left alone.
 */
export const takeClassroomSignInReturn = (win = typeof window !== 'undefined' ? window : null) => {
  const location = win?.location;
  const returned = classroomSignInReturn(location?.search);
  if (!returned.connected && !returned.error) return returned;
  try {
    win.history.replaceState(
      win.history.state,
      '',
      `${location.pathname}${searchWithoutClassroomSignIn(location.search)}${location.hash || ''}`,
    );
  } catch {
    // An address that cannot be rewritten still shows the result this once.
  }
  return returned;
};
