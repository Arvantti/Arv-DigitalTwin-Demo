import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({
  DurableObject: class { ctx: unknown; env: unknown; constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; } },
  WorkerEntrypoint: class { env: unknown; constructor(_ctx: unknown, env: unknown) { this.env = env; } },
}));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(async (assertion: string) => {
    if (assertion.startsWith("valid:")) return { payload: { sub: assertion.slice("valid:".length) } };
    throw new Error("invalid assertion");
  }),
}));
import worker, { AcueductoContainer, ContainerEgressProxy } from "./index";
import { signDemoToken, verifyDemoToken } from "./demo-auth";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    expect(headers.get("cf-access-session-cookie")).toBeTruthy();
    const allowed = url.searchParams.get("permission") !== "admin.action" || headers.get("cf-access-jwt-assertion") === "valid:admin";
    return Response.json({ allowed });
  }));
});

const origin = "https://digitaltwin.arvantti.online";
const secret = "test-secret-for-cloudflare-demo-only-32-bytes";
const cosimulationSecret = "test-cosimulation-internal-token-32-bytes";

function env(overrides: Record<string, unknown> = {}) {
  return {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }),
    },
    D1_BRIDGE_TOKEN: "bridge-secret",
    D1_GATEWAY_ORIGIN: "https://demo.workers.dev",
    ALLOWED_PLANT_IDS: "water-network-scale-v1",
    CORS_ORIGINS: origin,
    ACCESS_CONTROL_API_URL: "https://access-control.example",
    DEMO_TOKEN_SECRET: secret,
    DEMO_API_LIMITER: { limit: async () => ({ success: true }) },
    DEMO_BOOTSTRAP_LIMITER: { limit: async () => ({ success: true }) },
    DEMO_FRACTAL_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  } as never;
}

describe("D1 bridge", () => {
  it("returns a checkpoint BLOB as binary transport alongside its schema version", async () => {
    const all = async () => ({
      success: true, results: [{ schema_version: 2, payload: [0, 1, 2, 127, 255] }], meta: { changes: 0 },
    });
    const response = await worker.fetch(new Request("https://demo.workers.dev/_internal/d1", {
      method: "POST", headers: { authorization: "Bearer bridge-secret" },
      body: JSON.stringify({ sql: "SELECT schema_version, payload FROM session_checkpoints", params: [] }),
    }), env({ DB: { prepare: () => ({ bind: () => ({ all }) }) } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, rows: [[2, { __twin_d1_bytes__: "AAECf/8=" }]], changes: 0 });
  });
});

describe("comparison manifest proxy timings", () => {
  it("records gateway and container stages without logging the request", async () => {
    const timingHeader = "x-twin-internal-manifest-do-timing";
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const managed = {
      running: false,
      setInactivityTimeout: vi.fn(async () => {}),
      getTcpPort: () => ({ fetch: vi.fn(async (input: string | Request) => {
        if (typeof input === "string") return Response.json({ status: "ok" });
        expect(input.headers.get("authorization")).toBeNull();
        expect(input.headers.get("x-twin-demo-id")).toBe("test-owner");
        expect(input.headers.get(timingHeader)).toBeNull();
        expect(await input.json()).toEqual({ marker: "test-body" });
        return Response.json({ detail: "conflict" }, { status: 409, headers: { [timingHeader]: "untrusted" } });
      }) }),
    };
    const object = new AcueductoContainer({ container: managed } as never, env());
    managed.running = true;
    const token = await signDemoToken(secret, "test-owner", Math.floor(Date.now() / 1000) + 60);
    const path = `${origin}/api/plants/water-network-scale-v1/sessions/test-session/comparisons/test-comparison/manifest`;
    const environment = env({
      DB: { prepare: () => ({ bind: () => ({ first: async () => ({ session_id: "test-session" }) }) }) },
      ACUEDUCTO_CONTAINER: { getByName: () => object },
    });
    try {
      const response = await worker.fetch(new Request(path, {
        method: "POST", headers: { authorization: `Bearer ${token}`, [timingHeader]: "untrusted" },
        body: JSON.stringify({ marker: "test-body" }),
      }), environment);
      expect(response.status).toBe(409);
      expect(response.headers.get(timingHeader)).toBeNull();
      expect(await response.json()).toEqual({ detail: "conflict" });
      const stages = log.mock.calls.map(([, fields]) => `${fields.stage}:${fields.event}`);
      expect(stages).toEqual([
        "worker_ingress:start", "worker_to_do:start", "do_ready:start", "do_ready:end",
        "do_inactivity_timeout:start", "do_inactivity_timeout:end", "do_to_tcp:start", "do_to_tcp:end",
        "worker_to_do:end", "worker_do_breakdown:end", "worker_ingress:end",
      ]);
      expect(log).toHaveBeenCalledWith("comparison_manifest proxy", {
        stage: "worker_do_breakdown", event: "end", outcome: 409,
        do_entry_at_ms: expect.any(Number), do_ready_ms: expect.any(Number),
        do_inactivity_timeout_ms: expect.any(Number), do_to_tcp_ms: expect.any(Number),
      });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/test-session|test-comparison|test-body|test-owner|authorization|untrusted/i);
      log.mockClear();
      await worker.fetch(new Request(`${origin}/_worker/health`), environment);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe("public demo gateway", () => {
  it("does not allow API use without an anonymous session capability", async () => {
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1`), env());
    expect(response.status).toBe(401);
  });

  it("requires a verified Access identity for bootstrap and API requests when Access is configured", async () => {
    const protectedEnv = env({ ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience" });
    const bootstrap = await worker.fetch(new Request(`${origin}/api/demo/session`, {
      method: "POST", headers: { origin },
    }), protectedEnv);
    expect(bootstrap.status).toBe(401);

    const token = await signDemoToken(secret, "visitor-a", Math.floor(Date.now() / 1000) + 60);
    const api = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1`, {
      headers: { authorization: `Bearer ${token}`, origin },
    }), protectedEnv);
    expect(api.status).toBe(401);
  });

  it("keeps Access-authenticated viewers from starting live simulation without an admin grant", async () => {
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/sessions`, {
      method: "POST", headers: { origin, "cf-access-jwt-assertion": "valid:auth0|viewer" }, body: "{}",
    }), env({ ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience" }));
    expect(response.status).toBe(403);
  });

  it("binds authenticated sessions to a stable hashed Access subject without issuing a browser capability", async () => {
    const owners: string[] = [];
    const database = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => {
            if (sql.startsWith("INSERT INTO demo_visitors")) owners.push(String(values[0]));
            return { success: true };
          },
        }),
      }),
    };
    const protectedEnv = env({ ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience", DB: database });
    const bootstrap = () => worker.fetch(new Request(`${origin}/api/demo/session`, {
      method: "POST", headers: { origin, "cf-access-jwt-assertion": "valid:auth0|user-a" },
    }), protectedEnv);
    const first = await bootstrap();
    const firstBody = await first.json() as { token?: string; study_key?: string; authenticated_user: boolean };
    const second = await bootstrap();
    const secondBody = await second.json() as { token?: string; study_key?: string; authenticated_user: boolean };

    expect(first.status).toBe(200);
    expect(firstBody.authenticated_user).toBe(true);
    expect(firstBody.token).toBeUndefined();
    expect(firstBody.study_key).toBeUndefined();
    expect(owners[0]).toMatch(/^user:[a-f0-9]{64}$/);
    expect(owners[1]).toBe(owners[0]);
    expect(secondBody.authenticated_user).toBe(true);
  });

  it("rejects cross-site or originless authenticated mutations before authorization or proxying", async () => {
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/saved-studies`, {
      method: "POST", headers: { "content-type": "application/json", "cf-access-jwt-assertion": "valid:auth0|viewer" }, body: "{}",
    }), env({ ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience" }));
    expect(response.status).toBe(403);
  });

  it("adds shared saved-study read scope only after the Access permission check", async () => {
    const container = { getByName: () => ({ fetch: async (request: Request) => {
      expect(request.headers.get("cf-access-jwt-assertion")).toBeNull();
      expect(request.headers.get("x-twin-shared-studies-read")).toBe("1");
      return Response.json([]);
    } }) };
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/saved-studies`, {
      headers: { origin, "cf-access-jwt-assertion": "valid:auth0|viewer", cookie: "CF_Authorization=viewer-session" },
    }), env({
      ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience",
      DB: { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) },
      ACUEDUCTO_CONTAINER: container,
    }));
    expect(response.status).toBe(200);
  });

  it("adds shared scenario edit scope only after the per-twin edit permission check", async () => {
    const container = { getByName: () => ({ fetch: async (request: Request) => {
      expect(request.headers.get("x-twin-shared-studies-edit")).toBe("1");
      expect(request.headers.get("cf-access-jwt-assertion")).toBeNull();
      return Response.json({ id: "SAVED-1", name: "Updated" });
    } }) };
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/saved-studies/SAVED-1`, {
      method: "PUT", headers: { origin, "cf-access-jwt-assertion": "valid:auth0|editor", cookie: "CF_Authorization=editor-session", "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    }), env({
      ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience",
      ACUEDUCTO_CONTAINER: container,
    }));
    expect(response.status).toBe(200);
  });

  it("passes scoped shared-study capabilities to Fractal only after edit authorization", async () => {
    const container = { getByName: () => ({ fetch: async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/studies/saved/rerun");
      expect(request.headers.get("x-twin-shared-studies-read")).toBe("1");
      expect(request.headers.get("x-twin-shared-studies-edit")).toBe("1");
      expect(request.headers.get("cf-access-jwt-assertion")).toBeNull();
      expect(request.headers.get("authorization")).toBeNull();
      return Response.json({ id: "SAVED-1", latest_version: 2 });
    } }) };
    const response = await worker.fetch(new Request(`${origin}/fractal/studies/saved/rerun`, {
      method: "POST", headers: {
        origin, "cf-access-jwt-assertion": "valid:auth0|editor", cookie: "CF_Authorization=editor-session", "content-type": "application/json",
        "x-twin-shared-studies-read": "forged", "x-twin-shared-studies-edit": "forged",
      },
      body: JSON.stringify({ plant_id: "water-network-scale-v1", saved_study_id: "SAVED-1", version: 1 }),
    }), env({
      ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience",
      FRACTAL_CONTAINER: container,
    }));
    expect(response.status).toBe(200);
  });

  it("proxies Access-authenticated PLC requests without browser bearers or Access credentials", async () => {
    const owners = new Map<string, { session_id: string; visitor_id: string; plant_id: string; expires_at: number }>();
    const database = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => ({ total: 0 }),
          all: async () => ({ results: [] }),
          run: async () => {
            if (sql.startsWith("INSERT INTO demo_session_owners")) {
              const [session_id, visitor_id, plant_id, , expires_at] = values as [string, string, string, number, number];
              owners.set(session_id, { session_id, visitor_id, plant_id, expires_at });
            }
            return { success: true };
          },
        }),
      }),
    };
    const container = { getByName: () => ({ fetch: async (request: Request) => {
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("cookie")).toBeNull();
      expect(request.headers.get("cf-access-jwt-assertion")).toBeNull();
      expect(request.headers.get("x-twin-shared-studies-read")).toBeNull();
      expect(request.headers.get("x-twin-shared-studies-edit")).toBeNull();
      expect(request.headers.get("x-twin-demo-id")).toMatch(/^user:[a-f0-9]{64}$/);
      return Response.json({ id: "session-a", plant_id: "water-network-scale-v1" }, { status: 201 });
    } }) };
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/sessions`, {
      method: "POST", headers: { origin, "cf-access-jwt-assertion": "valid:admin", cookie: "CF_Authorization=admin-session", authorization: "Bearer stale-browser-token", "x-twin-shared-studies-read": "1", "x-twin-shared-studies-edit": "1" },
      body: "{}",
    }), env({
      ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience",
      DB: database, ACUEDUCTO_CONTAINER: container,
    }));
    expect(response.status).toBe(201);
    expect(owners.get("session-a")?.visitor_id).toMatch(/^user:[a-f0-9]{64}$/);
  });

  it("keeps Access credentials at the gateway and gives Fractal only a short-lived internal capability", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.headers.get("cookie")).toBeNull();
      expect(request.headers.get("cf-access-jwt-assertion")).toBeNull();
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("x-twin-demo-id")).toMatch(/^user:[a-f0-9]{64}$/);
      const relay = request.headers.get("x-twin-demo-token");
      expect(relay).toBeTruthy();
      expect((await verifyDemoToken(secret, relay!, Math.floor(Date.now() / 1000), "acueducto-internal"))?.sub)
        .toBe(request.headers.get("x-twin-demo-id"));
      return Response.json({ status: "ok" });
    });
    const response = await worker.fetch(new Request(`${origin}/fractal/health`, {
      headers: {
        "cf-access-jwt-assertion": "valid:auth0|user-a",
        cookie: "access-session-cookie",
        origin,
      },
    }), env({
      ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience",
      FRACTAL_CONTAINER: { getByName: () => ({ fetch }) },
    }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("honors shared-study scopes only from signed internal relay capabilities", async () => {
    const token = await signDemoToken(secret, "user:editor", Math.floor(Date.now() / 1000) + 60,
      "acueducto-internal", ["saved_studies.read", "saved_studies.edit"]);
    const container = { getByName: () => ({ fetch: async (request: Request) => {
      expect(request.headers.get("x-twin-shared-studies-read")).toBe("1");
      expect(request.headers.get("x-twin-shared-studies-edit")).toBeNull();
      expect(request.headers.get("x-twin-demo-id")).toBe("user:editor");
      return Response.json([]);
    } }) };
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/saved-studies`, {
      headers: { origin, authorization: `Bearer ${token}`, "x-twin-shared-studies-read": "forged" },
    }), env({
      ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience",
      ACUEDUCTO_CONTAINER: container,
    }));
    expect(response.status).toBe(200);
  });

  it("accepts only a server-minted internal relay capability when an Access assertion is absent", async () => {
    const protectedEnv = env({ ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience" });
    const internal = await signDemoToken(secret, "user:fractal-owner", Math.floor(Date.now() / 1000) + 60, "acueducto-internal");
    const accepted = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/sessions/session-a`, {
      headers: { authorization: `Bearer ${internal}`, origin },
    }), protectedEnv);
    expect(accepted.status).toBe(404);

    const browser = await signDemoToken(secret, "user:fractal-owner", Math.floor(Date.now() / 1000) + 60);
    const rejected = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/sessions/session-a`, {
      headers: { authorization: `Bearer ${browser}`, origin },
    }), protectedEnv);
    expect(rejected.status).toBe(401);
  });

  it("does not let a bearer capability override the verified Access identity", async () => {
    const protectedEnv = env({ ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com", ACCESS_AUD: "water-app-audience" });
    const token = await signDemoToken(secret, "user:owner-a", Math.floor(Date.now() / 1000) + 60);
    const response = await worker.fetch(new Request(`${origin}/api/plants/water-network-scale-v1/sessions/session-a`, {
      headers: { authorization: `Bearer ${token}`, origin, "cf-access-jwt-assertion": "valid:auth0|user-b", cookie: "CF_Authorization=user-b-session" },
    }), protectedEnv);
    expect(response.status).toBe(404);
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

describe("private cosimulation relay", () => {
  it("authenticates and routes engine/model requests while stripping the bearer before the service", async () => {
    const engineFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/v2/jobs");
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("cookie")).toBeNull();
      expect(request.headers.get("cf-access-jwt-assertion")).toBeNull();
      return Response.json({ service: "engine" });
    });
    const modelFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/v2/project");
      expect(request.headers.get("authorization")).toBeNull();
      return Response.json({ service: "model" });
    });
    const proxy = new ContainerEgressProxy({} as never, env({
      COSIMULATION_RELAY_ENABLED: "true",
      COSIMULATION_INTERNAL_TOKEN: cosimulationSecret,
      COSIMULATION_CONTAINER: { getByName: (name: string) => {
        expect(name).toBe("cosimulation");
        return { fetch: engineFetch };
      } },
      COSIMULATION_MODEL_CONTAINER: { getByName: (name: string) => {
        expect(name).toBe("cosimulation-model");
        return { fetch: modelFetch };
      } },
    }) as never);

    const engineResponse = await proxy.fetch(new Request(
      "https://demo.workers.dev/_internal/cosimulation/engine/v2/jobs",
      { method: "POST", headers: {
        authorization: `Bearer ${cosimulationSecret}`, cookie: "sensitive-cookie", "cf-access-jwt-assertion": "sensitive-assertion",
      } },
    ));
    const modelResponse = await proxy.fetch(new Request(
      "https://demo.workers.dev/_internal/cosimulation/model/v2/project",
      { method: "POST", headers: { authorization: `Bearer ${cosimulationSecret}` } },
    ));

    expect(engineResponse.status).toBe(200);
    expect(await engineResponse.json()).toEqual({ service: "engine" });
    expect(modelResponse.status).toBe(200);
    expect(await modelResponse.json()).toEqual({ service: "model" });
    expect(engineFetch).toHaveBeenCalledOnce();
    expect(modelFetch).toHaveBeenCalledOnce();
  });

  it("fails closed for missing credentials and rejects all other internal paths", async () => {
    const engineFetch = vi.fn(async () => Response.json({ unexpected: true }));
    const proxy = new ContainerEgressProxy({} as never, env({
      COSIMULATION_RELAY_ENABLED: "true",
      COSIMULATION_INTERNAL_TOKEN: cosimulationSecret,
      COSIMULATION_CONTAINER: { getByName: () => ({ fetch: engineFetch }) },
    }) as never);
    const unauthorized = await proxy.fetch(new Request(
      "https://demo.workers.dev/_internal/cosimulation/engine/v2/jobs",
      { method: "POST" },
    ));
    const invalidToken = await proxy.fetch(new Request(
      "https://demo.workers.dev/_internal/cosimulation/engine/v2/jobs",
      { method: "POST", headers: { authorization: `Bearer ${"x".repeat(cosimulationSecret.length)}` } },
    ));
    const forbiddenPath = await proxy.fetch(new Request(
      "https://demo.workers.dev/_internal/cosimulation/engine/v2/jobs/COSIM-AAAAAAAAAAAAAAAA",
      { method: "POST", headers: { authorization: `Bearer ${cosimulationSecret}` } },
    ));
    const forbiddenHost = await proxy.fetch(new Request(
      "https://attacker.example/_internal/cosimulation/engine/v2/jobs",
      { method: "POST", headers: { authorization: `Bearer ${cosimulationSecret}` } },
    ));

    expect(unauthorized.status).toBe(401);
    expect(invalidToken.status).toBe(401);
    expect(forbiddenPath.status).toBe(404);
    expect(forbiddenHost.status).toBe(403);
    expect(engineFetch).not.toHaveBeenCalled();
  });

  it("keeps the relay disabled by default even if a stale secret remains stored", async () => {
    const engineFetch = vi.fn(async () => Response.json({ unexpected: true }));
    const proxy = new ContainerEgressProxy({} as never, env({
      COSIMULATION_INTERNAL_TOKEN: cosimulationSecret,
      COSIMULATION_CONTAINER: { getByName: () => ({ fetch: engineFetch }) },
    }) as never);
    const response = await proxy.fetch(new Request(
      "https://demo.workers.dev/_internal/cosimulation/engine/v2/jobs",
      { method: "POST", headers: { authorization: `Bearer ${cosimulationSecret}` } },
    ));
    expect(response.status).toBe(404);
    expect(engineFetch).not.toHaveBeenCalled();
  });

  it("does not expose the private relay on the public Worker route", async () => {
    const response = await worker.fetch(new Request(
      "https://demo.workers.dev/_internal/cosimulation/engine/v2/jobs",
      { method: "POST", headers: { authorization: `Bearer ${cosimulationSecret}` } },
    ), env({ COSIMULATION_INTERNAL_TOKEN: cosimulationSecret }));

    expect(response.status).toBe(404);
  });
});
