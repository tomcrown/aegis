/**
 * Frontend signing utilities.
 * Mirrors the backend canonical_json() logic so the frontend produces
 * the same sorted, compact JSON message that Pacifica expects to verify.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function sortRecursive(obj: JsonValue): JsonValue {
  if (Array.isArray(obj)) {
    return obj.map(sortRecursive);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortRecursive(v)]),
    ) as { [key: string]: JsonValue };
  }
  return obj;
}

/**
 * Produce a canonical JSON string: all keys sorted alphabetically,
 * no whitespace, ASCII-safe. Mirrors backend canonical_json().
 */
export function canonical_json_ts(payload: Record<string, JsonValue>): string {
  return JSON.stringify(sortRecursive(payload));
}
