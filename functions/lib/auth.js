// Deliberately dependency-free: everything here is pure crypto, validation and
// Firestore-shaped data, so it can be unit tested without a Functions runtime.
const crypto = require("crypto");

// Collections that only the Admin SDK may touch. `firestore.rules` denies all
// client access to every one of them; the helpers below are the single place
// where their shapes are defined.
const CREDENTIALS_COLLECTION = "studentCredentials";
const DIRECTORY_COLLECTION = "studentDirectory";
const ALIAS_COLLECTION = "studentAliases";
const TEACHER_COLLECTION = "teacherDirectory";
const JOIN_CODE_COLLECTION = "classJoinCodes";
const THROTTLE_COLLECTION = "authThrottle";

const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const PASSCODE_PATTERN = /^\d{4,8}$/;

// Sign-in throttling. A class of thirty students fat-fingering a PIN should
// never trip the lockout, but an automated guesser should stall almost
// immediately.
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MS = 10 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// Join codes are read aloud in a classroom and typed on phones, so the
// alphabet drops every character pair that sounds or looks alike
// (0/O, 1/I/L, 2/Z, 5/S, 8/B).
const JOIN_CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
const JOIN_CODE_LENGTH = 6;

// PINs a student would pick in three seconds and an attacker would guess in
// one. Rejected at the point they are chosen rather than at sign-in.
const BANNED_PASSCODES = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "12345", "123456", "1234567", "12345678", "4321", "54321", "654321",
  "1212", "0123", "1122", "1010", "2020", "2468", "1379", "1004", "6969",
]);

class AuthInputError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "AuthInputError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates a typed student ID and returns it with surrounding whitespace
 * removed but its casing intact. Existing `grades` documents are keyed by
 * whatever a teacher originally typed, so the raw form stays authoritative for
 * data; `studentIdKey` below is what makes sign-in case-insensitive.
 */
function normalizeStudentId(value) {
  const cleaned = String(value ?? "").trim();
  if (!STUDENT_ID_PATTERN.test(cleaned)) {
    throw new AuthInputError(
      "invalid-argument",
      "Student ID must be 2-64 letters, numbers, dots, dashes or underscores.",
    );
  }
  return cleaned;
}

/**
 * The case-insensitive lookup key for a student ID. Credentials, aliases,
 * throttling and the Firebase UID all hang off this, so `ab-12`, `AB-12` and
 * `Ab-12` are one account no matter how a student types it on a phone.
 */
function studentIdKey(value) {
  return normalizeStudentId(value).toUpperCase();
}

/** Emails are the document ID for directory lookups, so they get one canonical form. */
function normalizeEmail(value) {
  const cleaned = String(value ?? "").trim().toLowerCase();
  if (!cleaned || !cleaned.includes("@") || cleaned.includes("/") || cleaned.length > 320) {
    throw new AuthInputError("invalid-argument", "A valid email address is required.");
  }
  return cleaned;
}

function normalizeJoinCode(value) {
  const cleaned = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 4 || cleaned.length > 12) {
    throw new AuthInputError("invalid-argument", "That class code does not look right.");
  }
  return cleaned;
}

function assertPasscodeShape(value) {
  const cleaned = String(value ?? "").trim();
  if (!PASSCODE_PATTERN.test(cleaned)) {
    throw new AuthInputError("invalid-argument", "Choose a PIN of 4 to 8 digits.");
  }
  if (BANNED_PASSCODES.has(cleaned) || /^(\d)\1+$/.test(cleaned)) {
    throw new AuthInputError("invalid-argument", "That PIN is too easy to guess. Pick a different one.");
  }
  return cleaned;
}

function generateJoinCode() {
  const bytes = crypto.randomBytes(JOIN_CODE_LENGTH);
  let code = "";
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += JOIN_CODE_ALPHABET[bytes[index] % JOIN_CODE_ALPHABET.length];
  }
  return code;
}

/**
 * scrypt with a per-credential salt. PINs have a tiny keyspace, so the work
 * factor plus the sign-in lockout — not the hash alone — is what makes offline
 * and online guessing expensive.
 */
function hashPasscode(passcode, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(String(passcode), salt, 64).toString("hex");
  return { algorithm: "scrypt", salt, hash: derived, version: 1 };
}

function verifyPasscode(passcode, credential) {
  if (!credential || !credential.hash || !credential.salt) return false;
  const stored = Buffer.from(credential.hash, "hex");
  const derived = crypto.scryptSync(String(passcode), credential.salt, stored.length || 64);
  if (stored.length !== derived.length) return false;
  return crypto.timingSafeEqual(stored, derived);
}

/** Emails allowed to become teachers before anyone has been invited in-app. */
function bootstrapTeacherEmails() {
  return String(process.env.INITIAL_TEACHER_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Fixed-window counter keyed by student ID. Returns the remaining lockout in
 * milliseconds when the caller must be turned away without a hash comparison.
 */
async function checkThrottle(db, key, now = Date.now()) {
  const snapshot = await db.collection(THROTTLE_COLLECTION).doc(key).get();
  if (!snapshot.exists) return { locked: false, retryAfterMs: 0 };

  const data = snapshot.data() || {};
  const lockedUntil = Number(data.lockedUntil || 0);
  if (lockedUntil > now) return { locked: true, retryAfterMs: lockedUntil - now };
  return { locked: false, retryAfterMs: 0 };
}

async function recordFailedAttempt(db, key, now = Date.now()) {
  const ref = db.collection(THROTTLE_COLLECTION).doc(key);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const windowStart = Number(data.windowStart || 0);
    const withinWindow = now - windowStart < ATTEMPT_WINDOW_MS;
    const failures = (withinWindow ? Number(data.failures || 0) : 0) + 1;
    const locked = failures >= MAX_FAILED_ATTEMPTS;

    transaction.set(ref, {
      failures: locked ? 0 : failures,
      windowStart: withinWindow ? windowStart || now : now,
      lockedUntil: locked ? now + LOCKOUT_MS : 0,
      updatedAt: now,
    });

    return {
      locked,
      attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - failures),
      retryAfterMs: locked ? LOCKOUT_MS : 0,
    };
  });
}

async function clearThrottle(db, key) {
  await db.collection(THROTTLE_COLLECTION).doc(key).delete().catch(() => {});
}

function describeLockout(retryAfterMs) {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return `Too many incorrect PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask your teacher to reset it.`;
}

module.exports = {
  AuthInputError,
  ALIAS_COLLECTION,
  CREDENTIALS_COLLECTION,
  DIRECTORY_COLLECTION,
  TEACHER_COLLECTION,
  JOIN_CODE_COLLECTION,
  THROTTLE_COLLECTION,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  assertPasscodeShape,
  bootstrapTeacherEmails,
  checkThrottle,
  clearThrottle,
  describeLockout,
  generateJoinCode,
  hashPasscode,
  normalizeEmail,
  normalizeJoinCode,
  normalizeStudentId,
  recordFailedAttempt,
  studentIdKey,
  verifyPasscode,
};
