/**
 * Password policy aligned with NIST SP 800-63B (memorized secrets):
 *  - Minimum length 8, and accept long passwords/passphrases (>= 64).
 *  - No composition rules (don't require mixed case / digits / symbols).
 *  - Screen against known-common/breached values and context-specific words
 *    (the user's own username / email).
 *  - Reject trivially predictable strings (single repeated char, simple runs).
 * We intentionally do NOT impose complexity rules, expiry, or hints.
 */

export const MIN_PASSWORD_LENGTH = 8;
// NIST requires accepting at least 64 chars. We cap here (kept within bcrypt's
// 72-byte limit for typical input) rather than silently truncating.
export const MAX_PASSWORD_LENGTH = 64;

// A blocklist of very common / frequently-breached passwords (lowercased).
// Not exhaustive — a representative screen of the most predictable choices.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "pa$$word", "passwords",
  "12345678", "123456789", "1234567890", "123456789012", "1234567890123",
  "qwerty", "qwertyuiop", "qwerty123", "qwerty1234", "1qaz2wsx", "1q2w3e4r",
  "asdfghjkl", "zxcvbnm", "iloveyou", "sunshine", "princess", "football",
  "letmein", "welcome", "welcome1", "admin", "administrator", "root", "toor",
  "monkey", "dragon", "master", "superman", "batman", "trustno1", "whatever",
  "abc12345", "abcd1234", "a1b2c3d4", "changeme", "secret", "login", "guest",
  "baseball", "starwars", "computer", "michael", "jennifer", "hunter2",
  "liverpool", "terriblefootball", "footballliverpool", "00000000", "11111111",
  "aaaaaaaa", "password!", "P@ssw0rd", "Password1", "Password123",
]);

function isSimpleSequence(lower: string): boolean {
  if (lower.length < 4) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < lower.length; i++) {
    const diff = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending; // e.g. "12345678", "abcdefgh", "87654321"
}

export function validatePassword(
  password: string,
  context: { username?: string | null; email?: string | null } = {}
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }

  const lower = password.toLowerCase();

  if (/^(.)\1+$/.test(password)) {
    return "Password can't be a single repeated character.";
  }
  if (isSimpleSequence(lower)) {
    return "Password can't be a simple sequence like 12345678 or abcdefgh.";
  }
  if (COMMON_PASSWORDS.has(lower)) {
    return "This password is too common — choose something less predictable.";
  }

  // Context-specific: reject passwords that contain the username or email.
  const emailLocal = context.email ? context.email.split("@")[0] : "";
  const contextWords = [context.username ?? "", context.email ?? "", emailLocal]
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3);
  for (const word of contextWords) {
    if (lower.includes(word)) {
      return "Password must not contain your username or email.";
    }
  }

  return null;
}
