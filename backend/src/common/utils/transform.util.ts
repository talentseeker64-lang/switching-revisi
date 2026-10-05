/**
 * Minimal data-transformation layer (proposal §5.5): renames payload fields
 * per a routing rule's `targetConfig.fieldMapping` (e.g.
 * { "amount": "total_amount" }). Unmapped fields pass through unchanged.
 * Deliberately simple for the MVP - no nested-path mapping, no type
 * coercion - those are documented future extensions, not invented here.
 */
export function applyFieldMapping(
  payload: Record<string, unknown>,
  fieldMapping?: Record<string, string>,
): Record<string, unknown> {
  if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
    return payload;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const mappedKey = fieldMapping[key] ?? key;
    result[mappedKey] = value;
  }
  return result;
}
