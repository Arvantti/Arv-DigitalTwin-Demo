import { describe, expect, it } from "vitest";
import { signDemoToken, verifyDemoToken } from "./demo-auth";

describe("anonymous demo capabilities", () => {
  it("verifies a signed, audience-bound, expiring token", async () => {
    const token = await signDemoToken("test-only-secret-with-enough-entropy", "visitor-1", 2000);
    expect(await verifyDemoToken("test-only-secret-with-enough-entropy", token, 1000)).toEqual({
      sub: "visitor-1",
      aud: "acueducto-demo",
      exp: 2000,
    });
    expect(await verifyDemoToken("wrong-secret-with-enough-entropy", token, 1000)).toBeNull();
    expect(await verifyDemoToken("test-only-secret-with-enough-entropy", token, 2000)).toBeNull();
    expect(await verifyDemoToken("test-only-secret-with-enough-entropy", `${token}x`, 1000)).toBeNull();
  });

  it("keeps short-lived internal relay capabilities audience-separated from browser demo tokens", async () => {
    const token = await signDemoToken("test-only-secret-with-enough-entropy", "user:1", 2000, "acueducto-internal");
    const internalClaims = await verifyDemoToken("test-only-secret-with-enough-entropy", token, 1000, "acueducto-internal");
    expect(internalClaims?.aud).toBe("acueducto-internal");
    expect(await verifyDemoToken("test-only-secret-with-enough-entropy", token, 1000)).toBeNull();
  });
});
