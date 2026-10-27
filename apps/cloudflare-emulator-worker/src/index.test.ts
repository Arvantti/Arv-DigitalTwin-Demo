import { describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class {}, WorkerEntrypoint: class {} }));
import worker from "./index";
import { signDemoToken } from "./demo-auth";

const origin = "https://digitaltwin.arvantti.online";
const secret = "test-secret-for-cloudflare-demo-only-32-bytes";

function env(overrides: Record<string, unknown> = {}) {
  return {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }),
    },
    D1_BRIDGE_TOKEN: "bridge-secret",
    D1_GATEWAY_ORIGIN: "https://demo.workers.dev",
    ALLOWED_PLANT_IDS: "water-network-scale-v1",
    CORS_ORIGINS: origin,
    DEMO_TOKEN_SECRET: secret,
    DEMO_API_LIMITER: { limit: async () => ({ success: true }) },
    DEMO_BOOTSTRAP_LIMITER: { limit: async () => ({ success: true }) },
    DEMO_FRACTAL_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  } as never;
}

describe("public demo gateway", () => {
  it("does not allow API use without an anonymous session capability", async () => {
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1`), env());
    expect(response.status).toBe(401);
  });

  it("prevents a valid visitor token from reading another visitor's session", async () => {
    const token = await signDemoToken(secret, "visitor-a", Math.floor(Date.now() / 1000) + 60);
    const response = await worker.fetch(
      new Request(`${origin}/api/plants/water-network-scale-v1/sessions/session-b`, {
        headers: { authorization: `Bearer ${token}`, origin },
      }),
      env(),
    );
    expect(response.status).toBe(404);
  });

  it("issues anonymous tokens only to the configured gallery origin", async () => {
    const blocked = await worker.fetch(
      new Request(`${origin}/api/demo/session`, { method: "POST", headers: { origin: "https://attacker.example" } }),
      env(),
    );
    expect(blocked.status).toBe(403);

    const allowed = await worker.fetch(
      new Request(`${origin}/api/demo/session`, { method: "POST", headers: { origin } }),
      env(),
    );
    const body = await allowed.json() as { token: string; authenticated_user: boolean };
    expect(allowed.status).toBe(200);
    expect(body.authenticated_user).toBe(false);
    expect(body.token).toBeTruthy();
  });

  it("binds created sessions to the issuing visitor capability", async () => {
    const owners = new Map<string, { session_id: string; visitor_id: string; plant_id: string; expires_at: number }>();
    const database = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            if (sql.startsWith("SELECT session_id")) {
              const [sessionId, visitorId, plantId, now] = values as [string, string, string, number];
              const row = owners.get(sessionId);
              return row && row.visitor_id === visitorId && row.plant_id === plantId && row.expires_at > now ? row : null;
            }
            return { total: owners.size };
          },
          run: async () => {
            if (sql.startsWith("INSERT INTO demo_session_owners")) {
              const [session_id, visitor_id, plant_id, , expires_at] = values as [string, string, string, number, number];
              owners.set(session_id, { session_id, visitor_id, plant_id, expires_at });
            }
            return { success: true };
          },
          all: async () => ({ results: [] }),
        }),
      }),
    };
    const container = {
      getByName: () => ({ fetch: async () => Response.json({ id: "session-owned", plant_id: "water-network-scale-v1" }, { status: 201 }) }),
    };
    const tokenA = await signDemoToken(secret, "visitor-a", Math.floor(Date.now() / 1000) + 60);
    const tokenB = await signDemoToken(secret, "visitor-b", Math.floor(Date.now() / 1000) + 60);
    const sessionPath = `${origin}/api/plants/water-network-scale-v1/sessions/session-owned`;
    const create = await worker.fetch(
      new Request(`${origin}/api/plants/water-network-scale-v1/sessions`, {
        method: "POST",
        headers: { authorization: `Bearer ${tokenA}`, origin, "content-type": "application/json" },
        body: "{}",
      }),
      env({ DB: database, ACUEDUCTO_CONTAINER: container }),
    );
    expect(create.status).toBe(201);
    const owned = await worker.fetch(new Request(sessionPath, { headers: { authorization: `Bearer ${tokenA}`, origin } }), env({ DB: database, ACUEDUCTO_CONTAINER: container }));
    const foreign = await worker.fetch(new Request(sessionPath, { headers: { authorization: `Bearer ${tokenB}`, origin } }), env({ DB: database }));
    expect(owned.status).toBe(201);
    expect(foreign.status).toBe(404);
  });

  it("limits this gateway to its own plant and PLC-backed Fractal routes", async () => {
    const token = await signDemoToken(secret, "visitor-a", Math.floor(Date.now() / 1000) + 60);
    const equipment = await worker.fetch(
      new Request(`${origin}/api/equipment/vessel`, { headers: { authorization: `Bearer ${token}`, origin } }),
      env(),
    );
    const offlineFractal = await worker.fetch(
      new Request(`${origin}/fractal/studies/horizon`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, origin, "content-type": "application/json" },
        body: "{}",
      }),
      env(),
    );
    expect(equipment.status).toBe(404);
    expect(offlineFractal.status).toBe(404);
  });

  it("blocks unbounded one-shot simulation endpoints", async () => {
    const token = await signDemoToken(secret, "visitor-a", Math.floor(Date.now() / 1000) + 60);
    const response = await worker.fetch(
      new Request(`${origin}/api/plants/water-network-scale-v1/simulate`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, origin },
      }),
      env(),
    );
    expect(response.status).toBe(404);
  });

  it("rejects API use when the edge rate limit is exceeded", async () => {
    const token = await signDemoToken(secret, "visitor-a", Math.floor(Date.now() / 1000) + 60);
    const rateLimitedEnv = env({ DEMO_API_LIMITER: { limit: vi.fn(async () => ({ success: false })) } });
    const response = await worker.fetch(
      new Request(`${origin}/api/plants/water-network-scale-v1`, {
        headers: { authorization: `Bearer ${token}`, origin, "cf-connecting-ip": "192.0.2.1" },
      }),
      rateLimitedEnv,
    );
    expect(response.status).toBe(429);
  });
});
