import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison for shared secrets (e.g. webhook API
 * keys) - a plain `===`/`!==` check leaks timing information proportional
 * to the matching prefix length, which is a textbook side channel for
 * guessing a secret byte by byte.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws if lengths differ, so pad to a fixed length
  // first - length itself isn't meant to be secret here.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
