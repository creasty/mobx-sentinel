/**
 * Generate a random id: 128 bits from a CSPRNG, as 32 lowercase hex digits
 *
 * Not `crypto.randomUUID`, which only exists in secure contexts: a page served over plain HTTP from
 * anywhere but localhost has none. `crypto.getRandomValues` has no such restriction.
 *
 * @mobx-sentinel/form keeps a copy of this module.
 */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
