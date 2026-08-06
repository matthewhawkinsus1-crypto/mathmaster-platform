const crypto = require("crypto");
const { readLinkEncryptionKey } = require("./config");

const ALGORITHM = "aes-256-gcm";

function getKey() {
  const hex = readLinkEncryptionKey();
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("LINK_ENCRYPTION_KEY must be a 32-byte value encoded as 64 hex characters.");
  }
  return key;
}

function encryptLaunchPayload(payload) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext]
    .map((buffer) => buffer.toString("base64url"))
    .join(".");
}

function decryptLaunchToken(token) {
  const key = getKey();
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed launch token.");

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

module.exports = { encryptLaunchPayload, decryptLaunchToken };
