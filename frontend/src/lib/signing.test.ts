import { describe, expect, it } from "vitest";

import { canonical_json_ts } from "./signing";

describe("canonical_json_ts", () => {
  it("sorts keys alphabetically", () => {
    const result = canonical_json_ts({ z: 1, a: 2, m: 3 });
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed)).toEqual(["a", "m", "z"]);
  });

  it("produces compact JSON with no whitespace", () => {
    const result = canonical_json_ts({ a: 1, b: 2 });
    expect(result).toBe('{"a":1,"b":2}');
  });

  it("sorts nested object keys recursively", () => {
    const result = canonical_json_ts({
      stop_order: { stop_price: "154.5", amount: "0.075" },
    });
    const inner = result.indexOf('"amount"');
    const stop = result.indexOf('"stop_price"');
    expect(inner).toBeLessThan(stop);
  });

  it("preserves array element order", () => {
    const result = canonical_json_ts({ items: [3, 1, 2] });
    expect(result).toBe('{"items":[3,1,2]}');
  });

  it("handles empty object", () => {
    expect(canonical_json_ts({})).toBe("{}");
  });

  it("serialises boolean values correctly", () => {
    const result = canonical_json_ts({ reduce_only: false, active: true });
    expect(result).toContain('"reduce_only":false');
    expect(result).toContain('"active":true');
  });

  it("serialises null correctly", () => {
    const result = canonical_json_ts({ field: null });
    expect(result).toContain('"field":null');
  });

  it("preserves string decimals as strings (not numbers)", () => {
    const result = canonical_json_ts({ amount: "0.075" });
    expect(result).toContain('"amount":"0.075"');
  });

  it("serialises integer timestamps without quotes", () => {
    const result = canonical_json_ts({ timestamp: 1234567890000 });
    expect(result).toContain('"timestamp":1234567890000');
  });

  it("matches a full market order payload shape", () => {
    const payload = {
      type: "create_market_order",
      symbol: "SOL",
      side: "ask",
      amount: "0.075",
      slippage_percent: "0.5",
      reduce_only: false,
      account: "wallet_addr",
      agent_wallet: "agent_pubkey",
      builder_code: "AEGIS",
      timestamp: 1700000000000,
      expiry_window: 30000,
    };
    const result = canonical_json_ts(payload);
    const parsed = JSON.parse(result);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
    expect(parsed.builder_code).toBe("AEGIS");
    expect(parsed.amount).toBe("0.075");
    expect(parsed.reduce_only).toBe(false);
  });
});
