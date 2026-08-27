const { defineSecret } = require("firebase-functions/params");

const GOOGLE_OAUTH_CLIENT_ID = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const LINK_ENCRYPTION_KEY = defineSecret("LINK_ENCRYPTION_KEY");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

function readSecret(secretParam, envName) {
  try {
    const value = secretParam.value();
    if (value) return value;
  } catch {
    // Local scripts that import the module outside a Functions runtime can
    // still use ordinary environment variables.
  }

  const fallback = process.env[envName];
  if (!fallback) {
    throw new Error(`${envName} is not configured.`);
  }
  return fallback;
}

function readPublicEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

module.exports = {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  LINK_ENCRYPTION_KEY,
  OPENAI_API_KEY,
  GOOGLE_API_SECRETS: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET],
  GOOGLE_AND_LINK_SECRETS: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, LINK_ENCRYPTION_KEY],
  ASSIGNMENT_AI_SECRETS: [OPENAI_API_KEY],
  readGoogleClientId: () => readSecret(GOOGLE_OAUTH_CLIENT_ID, "GOOGLE_OAUTH_CLIENT_ID"),
  readGoogleClientSecret: () => readSecret(GOOGLE_OAUTH_CLIENT_SECRET, "GOOGLE_OAUTH_CLIENT_SECRET"),
  readLinkEncryptionKey: () => readSecret(LINK_ENCRYPTION_KEY, "LINK_ENCRYPTION_KEY"),
  readOpenAiApiKey: () => readSecret(OPENAI_API_KEY, "OPENAI_API_KEY"),
  readPublicEnv,
};
