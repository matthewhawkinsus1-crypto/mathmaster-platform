/*
 * WHAT AN AUTH OR CALLABLE FAILURE SAYS (moved out of authService.js so node
 * tests can run it; authService re-exports it). Read by the sign-in screen,
 * so students see these words (student pass 3, NAV-11).
 */
export const FRIENDLY_ERRORS = {
  'auth/invalid-email': 'That does not look like a valid email address.',
  'auth/invalid-credential': 'That email and password do not match an account.',
  'auth/wrong-password': 'That email and password do not match an account.',
  'auth/user-not-found': 'That email and password do not match an account.',
  'auth/user-disabled': 'That account has been disabled. Ask your school administrator.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window closed before finishing.',
  'auth/network-request-failed': 'No connection. Check the network and try again.',
  'auth/unauthorized-domain': 'This web address is not authorized for Google sign-in yet.',
  'functions/unauthenticated': 'Sign in again to continue.',
  'functions/permission-denied': 'Those sign-in details are not correct.',
  'functions/resource-exhausted': 'Too many attempts. Wait a few minutes and try again.',
  // Said to students as well as teachers (student pass 3, NAV-11): no
  // "Firebase Functions log". A bare "internal" is almost always a request
  // that never got an answer (the SDK reports a failed fetch that way).
  'functions/internal': "Can't reach MathMaster right now. Check the Wi-Fi and try again.",
  'functions/unavailable': "Can't reach MathMaster right now. Check the Wi-Fi and try again.",
  'functions/deadline-exceeded': "MathMaster took too long to answer. Check the Wi-Fi and try again.",
};

/** Turns any auth failure into something worth showing a student or teacher. */
export function describeAuthError(error) {
  if (!error) return 'Something went wrong. Try again.';
  const code = error.code || '';
  // Callable errors carry a server-written message that is already specific
  // ("3 attempts left", "ask your teacher for the current code"). Prefer it —
  // unless it is only the code again ("internal", "unavailable"), which is
  // what the SDK puts there when no server answered (NAV-11).
  const message = typeof error.message === 'string' ? error.message.trim() : '';
  const bareCode = !/\s/.test(message) || message.toLowerCase() === code.replace(/^functions\//, '').toLowerCase();
  if (code.startsWith('functions/') && message && !message.startsWith('INTERNAL') && !bareCode) {
    return message;
  }
  // "INTERNAL" (upper case) is the server failing, not the connection.
  if (code === 'functions/internal' && message.startsWith('INTERNAL')) {
    return 'MathMaster could not finish that. Try again in a moment, and tell your teacher if it keeps happening.';
  }
  return FRIENDLY_ERRORS[code] || (bareCode ? null : message) || 'Something went wrong. Try again.';
}
