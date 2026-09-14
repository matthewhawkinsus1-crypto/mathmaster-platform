"use strict";

// The Path release control plane enforces the SAME root-admin policy as the
// mature backend, by calling the same shared decision function rather than
// restating the rule. A second copy of "who may administer the platform" is one
// copy too many.

const { HttpsError } = require("firebase-functions/v2/https");
const { requireRuntime, importRuntime } = require("./runtime");

const ROOT_ADMIN_EMAIL = requireRuntime("shared/rolePolicyIdentity.cjs").ROOT_ADMIN_EMAIL;

function normalizedEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** The verified email on the caller's token, or null. */
function callerEmail(request) {
  const token = request?.auth?.token || {};
  // An unverified address is an identity anyone can claim by signing up with it.
  if (!token.email || token.email_verified === false) return null;
  return normalizedEmail(token.email) || null;
}

/**
 * Refuse anything that is not the MathMaster root administrator.
 *
 * Students and teachers are refused here for the same reason and with the same
 * message the rest of the platform uses.
 */
async function requireRootAdmin(request) {
  const email = callerEmail(request);
  const auth = request?.auth
    ? { ...request.auth, token: { ...request.auth.token, email } }
    : null;
  const rolePolicy = await importRuntime("shared/rolePolicy.mjs");
  const decision = rolePolicy.authorizeRootAdmin(auth, { rootAdminEmail: ROOT_ADMIN_EMAIL });
  if (!decision.allowed) {
    if (decision.reason === "unauthenticated") {
      throw new HttpsError("unauthenticated", "Sign in before making this administrative change.");
    }
    const signedInAs = email ? `You are signed in as ${email}.` : "You are signed in without a verified email address.";
    throw new HttpsError(
      "permission-denied",
      `This action is restricted to the MathMaster root administrator (${ROOT_ADMIN_EMAIL}). ${signedInAs}`,
    );
  }
  return { uid: request.auth.uid, email };
}

module.exports = { requireRootAdmin, callerEmail, ROOT_ADMIN_EMAIL };
