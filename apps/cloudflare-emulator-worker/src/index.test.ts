import { describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class {}, WorkerEntrypoint: class {} }));
import worker from "./index";
import { signDemoToken, verifyDemoToken } from "./demo-auth";

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

  it("recovers the same anonymous owner after token expiry with the browser recovery key", async () => {
    const keys = new Map<string, string>();
    const database = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            if (sql.startsWith("SELECT visitor_id FROM demo_study_owner_keys")) {
              const visitorId = keys.get(String(values[0]));
              return visitorId ? { visitor_id: visitorId } : null;
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (sql.startsWith("INSERT INTO demo_study_owner_keys")) keys.set(String(values[1]), String(values[0]));
            return { success: true };
          },
        }),
      }),
    };
    const workerEnv = env({ DB: database });
    const first = await worker.fetch(new Request(`${origin}/api/demo/session`, { method: "POST", headers: { origin } }), workerEnv);
    const firstBody = await first.json() as { token: string; study_key: string };
    const firstClaims = await verifyDemoToken(secret, firstBody.token);
    expect(first.status).toBe(200);
    expect(firstBody.study_key).toMatch(/^[a-f0-9]{64}$/);
    expect(firstClaims?.sub).toBeTruthy();

    const renewed = await worker.fetch(new Request(`${origin}/api/demo/session`, {
      method: "POST", headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ study_key: firstBody.study_key }),
    }), workerEnv);
    const renewedBody = await renewed.json() as { token: string; study_key: string };
    const renewedClaims = await verifyDemoToken(secret, renewedBody.token);
    expect(renewed.status).toBe(200);
    expect(renewedClaims?.sub).toBe(firstClaims?.sub);
    expect(renewedBody.study_key).toBe(firstBody.study_key);
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

  it("forwards optimized Fractal horizons only for an owned PLC session", async () => {
    const token = await signDemoToken(secret, "visitor-a", Math.floor(Date.now() / 1000) + 60);
    const database = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ session_id: "session-a", visitor_id: "visitor-a", plant_id: "water-network-scale-v1", expires_at: Math.floor(Date.now() / 1000) + 60 }),
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
      }),
    };
    const fetch = vi.fn(async () => Response.json({ study_type: "optimized", applied: false }));
    const response = await worker.fetch(
      new Request(`${origin}/fractal/studies/horizon/from-plc`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, origin, "content-type": "application/json" },
        body: JSON.stringify({ plant_id: "water-network-scale-v1", session_id: "session-a", study_type: "optimized" }),
      }),
      env({ DB: database, FRACTAL_CONTAINER: { getByName: () => ({ fetch }) } }),
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ study_type: "optimized", applied: false });
  });

  it("allows an owner-scoped rerun request for an archived Fractal study without requiring a live session", async () => {
    const token = await signDemoToken(secret, "visitor-a", Math.floor(Date.now() / 1000) + 60);
    const fetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/studies/saved/rerun");
      expect(request.headers.get("x-twin-demo-id")).toBe("visitor-a");
      expect(request.headers.get("x-twin-demo-token")).toBe(token);
      return Response.json({ id: "SAVED-1", latest_version: 2 });
    });
    const response = await worker.fetch(
      new Request(`${origin}/fractal/studies/saved/rerun`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, origin, "content-type": "application/json" },
        body: JSON.stringify({ plant_id: "water-network-scale-v1", saved_study_id: "SAVED-1", version: 1 }),
      }),
      env({ FRACTAL_CONTAINER: { getByName: () => ({ fetch }) } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "SAVED-1", latest_version: 2 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("forwards PLC-backed cosimulation only for an owned session", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const token = await signDemoToken(secret, "visitor-a", expiresAt);
    const foreignToken = await signDemoToken(secret, "visitor-b", expiresAt);
    const database = {
      prepare: () => ({
        bind: (...values: string[]) => ({
          first: async () => values[1] === "visitor-a" ? ({
            session_id: "session-a", visitor_id: "visitor-a", plant_id: "water-network-scale-v1", expires_at: expiresAt,
          }) : null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
      }),
    };
    const fetch = vi.fn(async () => Response.json({ comparison_id: "CMP-1", frame_count: 0, applied_to_plc: false }));
    const request = () => new Request(`${origin}/fractal/studies/cosimulation/from-plc`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, origin, "content-type": "application/json" },
      body: JSON.stringify({
        plant_id: "water-network-scale-v1", session_id: "session-a", time_step_s: 3600, horizon_s: 86400,
      }),
    });
    const workerEnv = env({ DB: database, FRACTAL_CONTAINER: { getByName: () => ({ fetch }) } });
    const response = await worker.fetch(request(), workerEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ comparison_id: "CMP-1", frame_count: 0, applied_to_plc: false });
    expect(fetch).toHaveBeenCalledOnce();

    const foreignResponse = await worker.fetch(
      new Request(`${origin}/fractal/studies/cosimulation/from-plc`, {
        method: "POST",
        headers: { authorization: `Bearer ${foreignToken}`, origin, "content-type": "application/json" },
        body: JSON.stringify({
          plant_id: "water-network-scale-v1", session_id: "session-a", time_step_s: 3600, horizon_s: 86400,
        }),
      }),
      workerEnv,
    );
    expect(foreignResponse.status).toBe(404);
    expect(fetch).toHaveBeenCalledOnce();
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
