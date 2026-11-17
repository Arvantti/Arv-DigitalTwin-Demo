import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(async (assertion: string) => {
    if (assertion === "admin-token") return { payload: { sub: "cf-admin-user", email: "admin@example.test", email_verified: true } };
    if (assertion === "viewer-token") return { payload: { sub: "cf-viewer-user", email: "viewer@example.test", email_verified: true } };
    if (assertion === "unverified-token") return { payload: { sub: "cf-viewer-user", email: "viewer@example.test", email_verified: false } };
    if (assertion === "impostor-token") return { payload: { sub: "cf-impostor-user", email: "admin@example.test", email_verified: true } };
    throw new Error("invalid assertion");
  }),
}));
import worker from "./index";
import { onRequest } from "../../../functions/_middleware";

const origin = "https://digitaltwin.arvantti.online";
const catalog = "water-network-scale-v1,sauce-plant-v1";

function env(overrides: Record<string, unknown> = {}) {
  const db = {
    prepare: (sql: string) => ({
      bind: (..._values: unknown[]) => ({
        first: async () => sql.includes("FROM access_users") ? { account_type: "reseller", status: "active" } : null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: { changes: 1 } }),
      }),
    }),
    batch: vi.fn(async (_statements: unknown[]) => []),
  };
  return {
    DB: db,
    ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com",
    ACCESS_AUD: "access-aud",
    ACCESS_CONTROL_ADMIN_SUBJECTS: "google-oauth2|andres",
    GALLERY_ORIGIN: origin,
    AUTH0_DOMAIN: "arvantti-digitaltwin.us.auth0.com",
    AUTH0_MANAGEMENT_CLIENT_ID: "management-client-id",
    AUTH0_MANAGEMENT_CLIENT_SECRET: "management-secret-for-test",
    AUTH0_CLIENT_ID: "public-client-id",
    AUTH0_DB_CONNECTION: "DigitalTwin-Users",
    TWIN_CATALOG: catalog,
    ...overrides,
  } as never;
}

function sessionFor(token: string): string {
  return token === "admin-token" ? "admin-session" : token === "impostor-token" ? "impostor-session" : "viewer-session";
}

function accessIdentityResponse(input: RequestInfo | URL, init?: RequestInit): Response | undefined {
  if (!String(input).endsWith("/cdn-cgi/access/get-identity")) return undefined;
  const cookie = new Headers(init?.headers).get("cookie");
  const identities: Record<string, object> = {
    "CF_Authorization=admin-session": { id: "google-oauth2|andres", user_uuid: "cf-admin-user", email: "admin@example.test" },
    "CF_Authorization=viewer-session": { id: "auth0|viewer", user_uuid: "cf-viewer-user", email: "viewer@example.test" },
    "CF_Authorization=impostor-session": { id: "google-oauth2|impostor", user_uuid: "cf-impostor-user", email: "admin@example.test" },
  };
  const identity = identities[cookie ?? ""];
  return identity ? Response.json(identity) : new Response(null, { status: 401 });
}

function request(path: string, token = "admin-token", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", origin);
  headers.set("cf-access-jwt-assertion", token);
  headers.set("cf-access-session-cookie", sessionFor(token));
  return new Request(`https://access-api.example${path}`, { ...init, headers });
}

describe("access-control API", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      accessIdentityResponse(input, init) ?? new Response(null, { status: 404 })));
  });

  it("keeps health public but fails closed for unauthenticated management requests", async () => {
    const health = await worker.fetch(new Request("https://access-api.example/health"), env());
    expect(health.status).toBe(200);
    const denied = await worker.fetch(new Request(`https://access-api.example/v1/me`, { headers: { origin } }), env());
    const noSessionCookie = await worker.fetch(new Request(`https://access-api.example/v1/me`, {
      headers: { origin, "cf-access-jwt-assertion": "admin-token" },
    }), env());
    expect(denied.status).toBe(401);
    expect(noSessionCookie.status).toBe(401);
  });

  it("returns an authenticated user to the public portal after Access login", async () => {
    const response = await worker.fetch(request("/v1/login-return", "viewer-token"), env());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("forwards only the Access cookie extracted from the request to the Pages gate", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ allowed: true }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await onRequest({
      request: new Request("https://digitaltwin.arvantti.online/plant?plant=water-network-scale-v1", {
        headers: {
          cookie: "other=value; CF_Authorization=real-session-cookie",
          "cf-access-jwt-assertion": "signed-assertion",
          "cf-access-session-cookie": "forged-session-cookie",
        },
      }),
      env: { ACCESS_CONTROL_API_URL: "https://access-api.example" },
      next: async () => new Response("page"),
    });
    const upstreamHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(result.status).toBe(200);
    expect(upstreamHeaders.get("cf-access-session-cookie")).toBe("real-session-cookie");
    expect(upstreamHeaders.get("cf-access-jwt-assertion")).toBe("signed-assertion");
    expect(upstreamHeaders.has("cookie")).toBe(false);
  });

  it("preserves the login-return redirect through the Pages API proxy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: `${origin}/` } })));
    const result = await onRequest({
      request: new Request("https://digitaltwin.arvantti.online/api/access/v1/login-return", {
        headers: { "cf-access-jwt-assertion": "signed-assertion", cookie: "CF_Authorization=real-session-cookie" },
      }),
      env: { ACCESS_CONTROL_API_URL: "https://access-api.example" },
      next: async () => new Response("page"),
    });
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe(`${origin}/`);
  });

  it("redirects pending applicants from protected twin routes to the portal notice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ allowed: false, approval_status: "pending" })));
    const result = await onRequest({
      request: new Request("https://digitaltwin.arvantti.online/plant?plant=water-network-scale-v1", {
        headers: { "cf-access-jwt-assertion": "signed-assertion", cookie: "CF_Authorization=real-session-cookie" },
      }),
      env: { ACCESS_CONTROL_API_URL: "https://access-api.example" },
      next: async () => new Response("page"),
    });
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe("https://digitaltwin.arvantti.online/?access=pending");
  });

  it("rejects a forged internal session header when the browser has no Access cookie", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await onRequest({
      request: new Request("https://digitaltwin.arvantti.online/plant?plant=water-network-scale-v1", {
        headers: {
          "cf-access-jwt-assertion": "signed-assertion",
          "cf-access-session-cookie": "forged-session-cookie",
        },
      }),
      env: { ACCESS_CONTROL_API_URL: "https://access-api.example" },
      next: async () => new Response("page"),
    });
    expect(result.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unapproved browser origins even with a valid assertion", async () => {
    const response = await worker.fetch(new Request("https://access-api.example/admin/users", {
      headers: { origin: "https://evil.example", "cf-access-jwt-assertion": "admin-token" },
    }), env());
    expect(response.status).toBe(403);
  });

  it("checks model permissions from verified identity for server-to-server callers", async () => {
    const adminRequest = new Request("https://access-api.example/v1/check?twin_id=water-network-scale-v1&permission=view", {
      headers: { "cf-access-jwt-assertion": "admin-token", "cf-access-session-cookie": "admin-session" },
    });
    const viewerRequest = new Request("https://access-api.example/v1/check?twin_id=water-network-scale-v1&permission=view", {
      headers: { "cf-access-jwt-assertion": "viewer-token", "cf-access-session-cookie": "viewer-session" },
    });
    const adminActionRequest = new Request("https://access-api.example/v1/check?twin_id=water-network-scale-v1&permission=admin.action", {
      headers: { "cf-access-jwt-assertion": "admin-token", "cf-access-session-cookie": "admin-session" },
    });
    const admin = await worker.fetch(adminRequest, env());
    const viewer = await worker.fetch(viewerRequest, env());
    const adminAction = await worker.fetch(adminActionRequest, env());
    expect(admin.status).toBe(200);
    expect(await admin.json()).toEqual({ allowed: true });
    expect(viewer.status).toBe(200);
    expect(await viewer.json()).toEqual({ allowed: false });
    expect(adminAction.status).toBe(200);
    expect(await adminAction.json()).toEqual({ allowed: true });
  });

  it("denies ordinary users any administrative route, including approval actions", async () => {
    const regular = await worker.fetch(request("/admin/users", "viewer-token"), env());
    const forgedApproval = await worker.fetch(request("/admin/registrations/auth0%7Cviewer/approve", "viewer-token", { method: "POST" }), env());
    const impostor = await worker.fetch(request("/admin/users", "impostor-token"), env());
    expect(regular.status).toBe(403);
    expect(forgedApproval.status).toBe(403);
    expect(impostor.status).toBe(403);
  });

  it("binds the upstream identity cookie to the signed Access JWT", async () => {
    const mismatchedCookie = request("/v1/me", "admin-token");
    mismatchedCookie.headers.set("cf-access-session-cookie", "viewer-session");
    const response = await worker.fetch(mismatchedCookie, env());
    expect(response.status).toBe(401);
  });

  it("returns only the signed-in user's explicit grants and denies suspended accounts", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => sql.includes("access_users") ? { account_type: "client", status: "suspended" } : null,
          all: async () => ({ results: [{ twin_id: "water-network-scale-v1", permission: "view" }] }),
        }),
      }),
    };
    const response = await worker.fetch(request("/v1/me", "viewer-token"), env({ DB: db }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ detail: "Account suspended" });
  });

  it("revokes every grant and requests Auth0 session invalidation without deleting the identity", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const accessIdentity = accessIdentityResponse(input, init);
      if (accessIdentity) return accessIdentity;
      const url = String(input);
      if (url.endsWith("/oauth/token")) return Response.json({ access_token: "mock-management-token" });
      if (url.includes("/sessions")) return new Response(null, { status: 204 });
      return new Response(null, { status: 200 });
    }));
    const response = await worker.fetch(request("/admin/users/auth0%7Cviewer/access", "admin-token", { method: "DELETE" }), env());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subject: "auth0|viewer", access_revoked: true });
  });

  it("atomically replaces per-user, per-twin grants and accepts empty list as revoke", async () => {
    const configuration = env();
    const db = (configuration as { DB: { batch: ReturnType<typeof vi.fn> } }).DB;
    const response = await worker.fetch(request("/admin/users/auth0%7Cviewer/twins/water-network-scale-v1", "admin-token", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ permissions: [] }),
    }), configuration);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subject: "auth0|viewer", permissions: [] });
    expect(db.batch).toHaveBeenCalledOnce();
  });

  it("rejects unknown twins and unsupported permission names", async () => {
    const unknownTwin = await worker.fetch(request("/admin/users/auth0%7Cviewer/twins/future-twin", "admin-token", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ permissions: ["view"] }),
    }), env());
    const badPermission = await worker.fetch(request("/admin/users/auth0%7Cviewer/twins/water-network-scale-v1", "admin-token", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ permissions: ["admin"] }),
    }), env());
    expect(unknownTwin.status).toBe(404);
    expect(badPermission.status).toBe(422);
  });

  it("records a verified first-time identity as pending without any mail integration", async () => {
    const statements: string[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (..._values: unknown[]) => ({
          first: async () => sql.includes("FROM access_users") ? null : sql.includes("FROM access_signup_requests")
            ? { auth0_sub: "auth0|viewer", email: "viewer@example.test", status: "pending", requested_at: 1 }
            : null,
          run: async () => { statements.push(sql); return { success: true, meta: { changes: 1 } }; },
        }),
      }),
    };
    const response = await worker.fetch(request("/v1/me", "viewer-token"), env({ DB: db }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ approval_status: "pending", twins: [], grants: [] });
    expect(statements.some((sql) => sql.includes("INSERT INTO access_signup_requests"))).toBe(true);
    expect(statements.every((sql) => !sql.includes("notification"))).toBe(true);
  });

  it("records an unapproved user's first protected-twin attempt and denies it", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (..._values: unknown[]) => ({
          first: async () => sql.includes("FROM access_users") ? null : sql.includes("FROM access_signup_requests")
            ? { auth0_sub: "auth0|viewer", email: "viewer@example.test", status: "pending", requested_at: 1 }
            : null,
          run: async () => ({ success: true, meta: { changes: 1 } }),
        }),
      }),
    };
    const response = await worker.fetch(request("/v1/check?twin_id=water-network-scale-v1&permission=view", "viewer-token"), env({ DB: db }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ allowed: false, approval_status: "pending" });
  });

  it("does not open approval requests until the identity provider verifies the email", async () => {
    const run = vi.fn(async () => ({ success: true, meta: { changes: 1 } }));
    const db = {
      prepare: (sql: string) => ({ bind: () => ({ first: async () => sql.includes("FROM access_users") ? null : null, run }) }),
    };
    const response = await worker.fetch(request("/v1/me", "unverified-token"), env({ DB: db }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ approval_status: "email_unverified", email_verified: false, twins: [] });
    expect(run).not.toHaveBeenCalled();
  });

  it("approves a pending verified request with read-only access inherited by future twins", async () => {
    const batch = vi.fn(async (_statements: unknown[]) => [{ meta: { changes: 1 } }, {}, {}]);
    const db = {
      prepare: (sql: string) => ({
        sql,
        bind: (..._values: unknown[]) => ({
          sql,
          first: async () => sql.includes("FROM access_signup_requests")
            ? { auth0_sub: "auth0|new-user", email: "new@example.test", status: "pending", requested_at: 1 }
            : null,
        }),
      }),
      batch,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const identity = accessIdentityResponse(input, init);
      if (identity) return identity;
      if (String(input).endsWith("/oauth/token")) return Response.json({ access_token: "mock-management-token" });
      if (String(input).endsWith("/api/v2/users/auth0%7Cnew-user")) return Response.json({ user_id: "auth0|new-user", email_verified: true });
      return new Response(null, { status: 404 });
    }));
    const response = await worker.fetch(request("/admin/registrations/auth0%7Cnew-user/approve", "admin-token", { method: "POST" }), env({ DB: db }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subject: "auth0|new-user", status: "active", global_view_only: true });
    expect(batch).toHaveBeenCalledOnce();
    const statements = batch.mock.calls[0]?.[0] as Array<{ sql?: string }>;
    expect(statements[0]?.sql).toContain("status = 'pending'");
    expect(statements[1]?.sql).toContain("INSERT INTO access_users");
    expect(statements[1]?.sql).toContain("WHERE EXISTS");
    expect(JSON.stringify(statements)).toContain("global_view_only");
  });

  it("fails closed when a concurrent admin has already decided the signup request", async () => {
    const batch = vi.fn(async (_statements: unknown[]) => [{ meta: { changes: 0 } }, {}, {}]);
    const db = {
      prepare: (sql: string) => ({
        bind: (..._values: unknown[]) => ({
          first: async () => sql.includes("FROM access_signup_requests")
            ? { auth0_sub: "auth0|new-user", email: "new@example.test", status: "pending", requested_at: 1 }
            : null,
        }),
      }),
      batch,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const identity = accessIdentityResponse(input, init);
      if (identity) return identity;
      if (String(input).endsWith("/oauth/token")) return Response.json({ access_token: "mock-management-token" });
      if (String(input).endsWith("/api/v2/users/auth0%7Cnew-user")) return Response.json({ user_id: "auth0|new-user", email_verified: true });
      return new Response(null, { status: 404 });
    }));
    const response = await worker.fetch(request("/admin/registrations/auth0%7Cnew-user/approve", "admin-token", { method: "POST" }), env({ DB: db }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ detail: "Registration request is no longer pending" });
  });

  it("rejects an approval request without granting access", async () => {
    const batch = vi.fn(async (_statements: unknown[]) => [{ meta: { changes: 1 } }, {}]);
    const db = {
      prepare: (sql: string) => ({
        bind: (..._values: unknown[]) => ({
          sql,
          first: async () => sql.includes("FROM access_signup_requests")
            ? { auth0_sub: "auth0|new-user", email: "new@example.test", status: "pending", requested_at: 1 }
            : null,
        }),
      }),
      batch,
    };
    const response = await worker.fetch(request("/admin/registrations/auth0%7Cnew-user/reject", "admin-token", { method: "POST" }), env({ DB: db }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subject: "auth0|new-user", status: "rejected" });
    expect(batch).toHaveBeenCalledOnce();
    expect(JSON.stringify(batch.mock.calls[0]?.[0])).toContain("rejected");
  });

  it("applies approved global view-only access to the configured catalog but not study actions", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => sql.includes("FROM access_users") ? { status: "active", global_view_only: 1 } : null,
          all: async () => ({ results: [] }),
        }),
      }),
    };
    const view = await worker.fetch(request("/v1/check?twin_id=water-network-scale-v1&permission=view", "viewer-token"), env({ DB: db }));
    const study = await worker.fetch(request("/v1/check?twin_id=water-network-scale-v1&permission=saved_studies.create", "viewer-token"), env({ DB: db }));
    expect(await view.json()).toEqual({ allowed: true });
    expect(await study.json()).toEqual({ allowed: false });
  });

  it("never sends generated passwords to the browser and grants invitees verified read-only access", async () => {
    const statements: string[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (..._values: unknown[]) => ({
          run: async () => { statements.push(sql); return { success: true, meta: { changes: 1 } }; },
        }),
      }),
      batch: vi.fn(async (_statements: unknown[]) => []),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const accessIdentity = accessIdentityResponse(input, init);
      if (accessIdentity) return accessIdentity;
      const url = String(input);
      if (url.endsWith("/oauth/token")) return Response.json({ access_token: "mock-management-token" });
      if (url.endsWith("/api/v2/users")) return Response.json({ user_id: "auth0|new-user", email: "new@example.test" }, { status: 201 });
      if (url.endsWith("/api/v2/jobs/verification-email")) return Response.json({ id: "job" }, { status: 201 });
      if (url.endsWith("/dbconnections/change_password")) return new Response("We've just sent you an email");
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(request("/admin/users", "admin-token", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new@example.test", account_type: "reseller" }),
    }), env({ DB: db }));
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ invitation_sent: true });
    expect(statements.some((sql) => sql.includes("global_view_only") && sql.includes(", 1,"))).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/password|ticket|secret/i);
    const createCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/v2/users"));
    const createRequest = createCall?.[1] as RequestInit;
    const payload = JSON.parse(String(createRequest.body)) as Record<string, unknown>;
    expect(payload.password).toBeTruthy();
    expect(payload.email).toBe("new@example.test");
  });

  it("lets an administrator send a reset email for an active managed user without revealing credentials", async () => {
    const auditRun = vi.fn(async () => ({ success: true, meta: { changes: 1 } }));
    const db = {
      prepare: (sql: string) => ({
        bind: (..._values: unknown[]) => ({
          first: async () => sql.includes("FROM access_users") ? { email: "viewer@example.test", status: "active" } : null,
          run: auditRun,
        }),
      }),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const identity = accessIdentityResponse(input, init);
      if (identity) return identity;
      if (String(input).endsWith("/dbconnections/change_password")) return new Response("Email sent");
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(request("/admin/users/auth0%7Cviewer/password-reset", "admin-token", { method: "POST" }), env({ DB: db }));
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ subject: "auth0|viewer", password_reset_email_sent: true });
    expect(JSON.stringify(body)).not.toMatch(/"(?:password|ticket|secret)"\s*:/i);
    const resetCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/dbconnections/change_password"));
    const resetPayload = JSON.parse(String(resetCall?.[1]?.body)) as Record<string, unknown>;
    expect(resetPayload).toEqual({ client_id: "public-client-id", email: "viewer@example.test", connection: "DigitalTwin-Users" });
    expect(auditRun).toHaveBeenCalledOnce();
  });

  it("does not send password reset email for suspended managed users", async () => {
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => ({ email: "viewer@example.test", status: "suspended" }) }) }),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      accessIdentityResponse(input, init) ?? new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(request("/admin/users/auth0%7Cviewer/password-reset", "admin-token", { method: "POST" }), env({ DB: db }));
    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/dbconnections/change_password"), expect.anything());
  });
});
