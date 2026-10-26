import { describe, expect, it } from "vitest";
import { BLOB_MARKER, decodeD1Value, encodeD1Value } from "./d1-values";

describe("D1 JSON transport for BLOB values", () => {
  it("round trips bytes without changing data", () => {
    const input = Uint8Array.from([0, 1, 2, 127, 255]);
    const encoded = encodeD1Value(input) as Record<string, string>;
    expect(encoded[BLOB_MARKER]).toBe("AAECf/8=");
    expect([...decodeD1Value(encoded) as Uint8Array]).toEqual([...input]);
  });

  it("preserves scalar SQL parameters and normalizes booleans", () => {
    expect(decodeD1Value(null)).toBeNull();
    expect(decodeD1Value("plant")).toBe("plant");
    expect(decodeD1Value(12.5)).toBe(12.5);
    expect(decodeD1Value(true)).toBe(1);
    expect(decodeD1Value(false)).toBe(0);
  });

  it("rejects unknown or malformed parameters", () => {
    expect(() => decodeD1Value({ other: "value" })).toThrow("Unsupported D1 parameter type");
    expect(() => decodeD1Value({ [BLOB_MARKER]: 1 })).toThrow("malformed");
  });
});
