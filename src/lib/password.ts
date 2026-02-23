import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

/**
 * Hash a plaintext password.
 * Returns: scrypt$16384$8$1$<salt-hex>$<hash-hex>
 */
export function hashPassword(plaintext: string): string {
  const salt = randomBytes(32);
  const hash = scryptSync(plaintext, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored hash.
 * Constant-time comparison to prevent timing attacks.
 */
export function verifyPassword(plaintext: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], "hex");
  const expectedHash = Buffer.from(parts[5], "hex");

  const actualHash = scryptSync(plaintext, salt, expectedHash.length, { N, r, p });
  return timingSafeEqual(actualHash, expectedHash);
}
