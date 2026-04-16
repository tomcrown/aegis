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

export function canonical_json_ts(payload: Record<string, JsonValue>): string {
  return JSON.stringify(sortRecursive(payload));
}
