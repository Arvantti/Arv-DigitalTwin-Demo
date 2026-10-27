import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { decodeD1Value, encodeD1Value } from "./d1-values";
import { verifyDemoToken, signDemoToken } from "./demo-auth";

type Env = {
  ACUEDUCTO_CONTAINER: DurableObjectNamespace<AcueductoContainer>;
  FRACTAL_CONTAINER: DurableObjectNamespace<FractalContainer>;
  DB: D1Database;
  D1_BRIDGE_TOKEN: string;
  D1_GATEWAY_ORIGIN: string;
  ALLOWED_PLANT_IDS: string;
  CORS_ORIGINS: string;
  DEMO_TOKEN_SECRET: string;
  DEMO_BOOTSTRAP_LIMITER?: RateLimit;
  DEMO_API_LIMITER?: RateLimit;
  DEMO_FRACTAL_LIMITER?: RateLimit;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};

type D1BridgeRequest = { sql: string; params?: unknown[] };
type DemoSessionRow = { session_id: string; visitor_id: string; plant_id: string; expires_at: number };
const MAX_SQL_BYTES = 16_384;
const MAX_PARAMETER_COUNT = 100;
const DEMO_TOKEN_LIFETIME_S = 12 * 60 * 60;
const DEMO_SESSION_LIFETIME_S = 2 * 60 * 60;
const DEMO_MAX_SESSIONS_PER_VISITOR = 2;
const DEMO_MAX_SESSIONS_TOTAL = 10;

function allowedOrigins(env: Env): Set<string> {
  return new Set((env.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean));
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-max-age", "600");
  headers.set("cache-control", "no-store");
  return headers;
}

function withCors(response: Response, request: Request, env: Env): Response {
  // Do not reconstruct a WebSocket upgrade response.
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request, env)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && allowedOrigins(env).has(origin);
}

function ipKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown-client";
}

async function limited(binding: RateLimit | undefined, key: string): Promise<boolean> {
  // A missing edge limiter is a configuration failure; fail closed rather than silently dropping quotas.
  if (!binding) return true;
  return !(await binding.limit({ key })).success;
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer ([A-Za-z0-9._-]{1,2048})$/);
  return match?.[1] ?? null;
}

function websocketToken(request: Request): string | null {
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((part) => part.trim());
  const protocol = protocols.find((part) => part.startsWith("arvantti-demo."));
  return protocol?.slice("arvantti-demo.".length) || null;
}

async function authorizedByAccess(request: Request, env: Env): Promise<boolean> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) return false;
  try {
    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const keys = createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    await jwtVerify(assertion, keys, {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    return true;
  } catch {
    return false;
  }
}

async function d1Request(request: Request, env: Env): Promise<Response> {
  if (!env.D1_BRIDGE_TOKEN || request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${env.D1_BRIDGE_TOKEN}`) {
    return Response.json({ detail: "Not found" }, { status: 404 });
  }
  let body: D1BridgeRequest;
  try {
    body = await request.json() as D1BridgeRequest;
  } catch {
    return Response.json({ detail: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.sql !== "string" || body.sql.length === 0 || body.sql.length > MAX_SQL_BYTES ||
      !Array.isArray(body.params) || body.params.length > MAX_PARAMETER_COUNT) {
    return Response.json({ detail: "Invalid D1 statement" }, { status: 422 });
  }
  try {
    const parameters = body.params.map(decodeD1Value);
    const statement = env.DB.prepare(body.sql).bind(...parameters);
    const isRead = /^\s*(SELECT|PRAGMA)\b/i.test(body.sql);
    if (isRead) {
      const result = await statement.all<Record<string, unknown>>();
      const rows = (result.results ?? []).map((row) => Object.values(row).map(encodeD1Value));
      return Response.json({ success: result.success, rows, changes: result.meta.changes });
    }
    const result = await statement.run();
    return Response.json({ success: result.success, rows: [], changes: result.meta.changes });
  } catch (error) {
    console.error("D1 operation failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ success: false, rows: [], changes: 0 }, { status: 500 });
  }
}

async function pruneExpiredDemoData(env: Env, now: number): Promise<void> {
  const expiredSessions = "SELECT session_id FROM demo_session_owners WHERE expires_at <= ? LIMIT 100";
  for (const table of ["samples", "commands", "scene_frames", "recommendations", "fractal_studies", "session_checkpoints", "audit_events"]) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE session_id IN (${expiredSessions})`).bind(now).run();
  }
  await env.DB.prepare(
    "DELETE FROM operation_profiles WHERE owner_id IN (SELECT visitor_id FROM demo_visitors WHERE expires_at <= ? LIMIT 100)",
  ).bind(now).run();
  await env.DB.prepare(
    "DELETE FROM audit_events WHERE actor_id IN (SELECT visitor_id FROM demo_visitors WHERE expires_at <= ? LIMIT 100)",
  ).bind(now).run();
  await env.DB.prepare(
    "DELETE FROM demo_session_owners WHERE expires_at <= ? OR visitor_id IN (SELECT visitor_id FROM demo_visitors WHERE expires_at <= ? LIMIT 100)",
  ).bind(now, now).run();
  await env.DB.prepare(
    "DELETE FROM demo_visitors WHERE visitor_id IN (SELECT visitor_id FROM demo_visitors WHERE expires_at <= ? LIMIT 100)",
  ).bind(now).run();
}

async function createDemoSession(request: Request, env: Env): Promise<Response> {
  if (!originAllowed(request, env)) return Response.json({ detail: "Origin not allowed" }, { status: 403 });
  if (await limited(env.DEMO_BOOTSTRAP_LIMITER, ipKey(request))) {
    return Response.json({ detail: "Too many demo sessions requested; retry later" }, { status: 429 });
  }
  if (!env.DEMO_TOKEN_SECRET || env.DEMO_TOKEN_SECRET.length < 32) {
    return Response.json({ detail: "Public demo session service is not configured" }, { status: 503 });
  }
  const now = Math.floor(Date.now() / 1000);
  await pruneExpiredDemoData(env, now);
  const visitorId = crypto.randomUUID();
  const expiresAt = now + DEMO_TOKEN_LIFETIME_S;
  await env.DB.prepare("INSERT INTO demo_visitors (visitor_id, expires_at) VALUES (?, ?)").bind(visitorId, expiresAt).run();
  const token = await signDemoToken(env.DEMO_TOKEN_SECRET, visitorId, expiresAt);
  return Response.json(
    { token, expires_at: expiresAt, mode: "anonymous-demo", authenticated_user: false },
    { headers: { ...Object.fromEntries(corsHeaders(request, env)), "cache-control": "no-store" } },
  );
}

async function ownsSession(env: Env, visitorId: string, plantId: string, sessionId: string): Promise<DemoSessionRow | null> {
  return await env.DB.prepare(
    "SELECT session_id, visitor_id, plant_id, expires_at FROM demo_session_owners " +
    "WHERE session_id = ? AND visitor_id = ? AND plant_id = ? AND expires_at > ?",
  ).bind(sessionId, visitorId, plantId, Math.floor(Date.now() / 1000)).first<DemoSessionRow>();
}

async function countActiveSessions(env: Env, visitorId?: string): Promise<number> {
  const query = visitorId
    ? env.DB.prepare("SELECT COUNT(*) AS total FROM demo_session_owners WHERE visitor_id = ? AND expires_at > ?").bind(visitorId, Math.floor(Date.now() / 1000))
    : env.DB.prepare("SELECT COUNT(*) AS total FROM demo_session_owners WHERE expires_at > ?").bind(Math.floor(Date.now() / 1000));
  const result = await query.first<{ total: number }>();
  return Number(result?.total ?? 0);
}

function sessionPath(pathname: string): { plantId: string; sessionId: string } | null {
  const match = pathname.match(/^\/api\/plants\/([^/]+)\/sessions\/([^/]+)(?:\/|$)/);
  if (!match) return null;
  try {
    return { plantId: decodeURIComponent(match[1]), sessionId: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function isDisabledPublicAction(pathname: string): boolean {
  return pathname.endsWith("/audit-events") ||
    /\/fractal\/studies\/[^/]+\/(decision|activate)$/.test(pathname) ||
    /\/fractal\/recommendations\/[^/]+\/decision$/.test(pathname);
}

function proxyRequest(request: Request, visitorId: string, expiresAt?: number): Request {
  const headers = new Headers(request.headers);
  if (websocketToken(request)) headers.set("sec-websocket-protocol", "arvantti-demo");
  else headers.delete("sec-websocket-protocol");
  headers.set("x-twin-demo-id", visitorId);
  if (expiresAt !== undefined) headers.set("x-twin-demo-expires-at", String(expiresAt));
  return new Request(request, { headers });
}

async function proxyFractal(request: Request, env: Env, visitorId: string, token: string): Promise<Response> {
  if (await limited(env.DEMO_FRACTAL_LIMITER, ipKey(request)) || await limited(env.DEMO_FRACTAL_LIMITER, visitorId)) {
    return withCors(Response.json({ detail: "Fractal demo rate limit exceeded" }, { status: 429 }), request, env);
  }
  const url = new URL(request.url);
  if (url.pathname.includes("/studies/instant")) {
    return withCors(Response.json({ detail: "Fractal optimizer is disabled in the public demo" }, { status: 409 }), request, env);
  }
  const plcStudyRoute = /^\/fractal\/studies\/(horizon|profile-preview)\/from-plc$/.test(url.pathname);
  if (!(url.pathname === "/fractal/health" && request.method === "GET") && !(plcStudyRoute && request.method === "POST")) {
    return withCors(Response.json({ detail: "Fractal route is not enabled in the public demo" }, { status: 404 }), request, env);
  }
  if (plcStudyRoute) {
    let payload: { plant_id?: unknown; session_id?: unknown };
    try { payload = await request.clone().json() as { plant_id?: unknown; session_id?: unknown }; } catch {
      return withCors(Response.json({ detail: "Invalid Fractal request" }, { status: 400 }), request, env);
    }
    if (typeof payload.plant_id !== "string" || typeof payload.session_id !== "string" ||
        !(await ownsSession(env, visitorId, payload.plant_id, payload.session_id))) {
      return withCors(Response.json({ detail: "Demo session not found or not owned by this browser" }, { status: 404 }), request, env);
    }
  }
  try {
    const upstreamUrl = new URL(request.url);
    upstreamUrl.pathname = upstreamUrl.pathname.slice("/fractal".length) || "/";
    const headers = new Headers(request.headers);
    headers.set("x-twin-demo-id", visitorId);
    headers.set("x-twin-demo-token", token);
    const upstream = new Request(upstreamUrl, request);
    for (const [name, value] of headers) upstream.headers.set(name, value);
    const container = env.FRACTAL_CONTAINER.getByName("fractal-simulator");
    return withCors(await container.fetch(upstream), request, env);
  } catch (error) {
    console.error("Fractal simulator request failed", error instanceof Error ? error.name : "unknown");
    return withCors(Response.json({ detail: "Fractal simulator is temporarily unavailable" }, { status: 503 }), request, env);
  }
}

async function proxyApi(request: Request, env: Env, visitorId: string): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/plants/")) {
    return withCors(Response.json({ detail: "Route is not enabled for this emulator service" }, { status: 404 }), request, env);
  }
  const allowedPlants = new Set(env.ALLOWED_PLANT_IDS.split(",").map((plant) => plant.trim()).filter(Boolean));
  const match = url.pathname.match(/^\/api\/plants\/([^/]+)(?:\/|$)/);
  if (match) {
    let plantId: string;
    try { plantId = decodeURIComponent(match[1]); } catch {
      return withCors(Response.json({ detail: "Invalid plant id" }, { status: 400 }), request, env);
    }
    if (!allowedPlants.has(plantId)) {
      return withCors(Response.json({ detail: "Plant is not enabled for this emulator service" }, { status: 404 }), request, env);
    }
  }

  if (isDisabledPublicAction(url.pathname)) {
    return withCors(Response.json({ detail: "This operator action is unavailable in the public demo" }, { status: 403 }), request, env);
  }
  if (/^\/api\/(?:equipment\/[^/]+\/simulate|plants\/[^/]+\/simulate)$/.test(url.pathname)) {
    return withCors(Response.json({ detail: "Use a bounded demo session for live simulation" }, { status: 404 }), request, env);
  }
  if (request.method === "POST" && /^\/api\/plants\/[^/]+\/sessions\/[^/]+\/start$/.test(url.pathname)) {
    return withCors(Response.json({ detail: "The PLC WebSocket starts the bounded demo session" }, { status: 409 }), request, env);
  }

  const creation = request.method === "POST" && /^\/api\/plants\/[^/]+\/sessions$/.test(url.pathname);
  const parsedSession = sessionPath(url.pathname);
  const websocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
  if (websocket && (!/^\/api\/plants\/[^/]+\/sessions\/[^/]+$/.test(url.pathname) || !parsedSession || request.method !== "GET")) {
    return withCors(Response.json({ detail: "Only owned PLC session WebSockets are available" }, { status: 404 }), request, env);
  }
  let demoExpiresAt: number | undefined;
  if (creation) {
    const ownCount = await countActiveSessions(env, visitorId);
    const totalCount = await countActiveSessions(env);
    if (ownCount >= DEMO_MAX_SESSIONS_PER_VISITOR || totalCount >= DEMO_MAX_SESSIONS_TOTAL) {
      return withCors(Response.json({ detail: "Public demo session capacity reached" }, { status: 429 }), request, env);
    }
    demoExpiresAt = Math.floor(Date.now() / 1000) + DEMO_SESSION_LIFETIME_S;
  } else if (parsedSession) {
    if (!(await ownsSession(env, visitorId, parsedSession.plantId, parsedSession.sessionId))) {
      return withCors(Response.json({ detail: "Demo session not found or not owned by this browser" }, { status: 404 }), request, env);
    }
  }

  if (!env.D1_BRIDGE_TOKEN || !env.D1_GATEWAY_ORIGIN) {
    return withCors(Response.json({ detail: "Emulator service is not fully configured" }, { status: 503 }), request, env);
  }
  try {
    const container = env.ACUEDUCTO_CONTAINER.getByName("acueducto");
    const response = await container.fetch(proxyRequest(request, visitorId, demoExpiresAt));
    if (!creation || !response.ok) return withCors(response, request, env);
    const data = await response.clone().json() as { id?: unknown; plant_id?: unknown };
    const plantId = new URL(request.url).pathname.match(/^\/api\/plants\/([^/]+)\/sessions$/)?.[1];
    const sessionId = data.id;
    if (!plantId || typeof sessionId !== "string") {
      return withCors(Response.json({ detail: "Emulator returned an invalid demo session" }, { status: 502 }), request, env);
    }
    const decodedPlantId = decodeURIComponent(plantId);
    const expiresAt = demoExpiresAt ?? Math.floor(Date.now() / 1000) + DEMO_SESSION_LIFETIME_S;
    await env.DB.prepare(
      "INSERT INTO demo_session_owners (session_id, visitor_id, plant_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(sessionId, visitorId, decodedPlantId, Math.floor(Date.now() / 1000), expiresAt).run();
    return withCors(response, request, env);
  } catch (error) {
    console.error("Acueducto container request failed", error instanceof Error ? error.name : "unknown");
    return withCors(Response.json({ detail: "Emulator container is temporarily unavailable" }, { status: 503 }), request, env);
  }
}

export class ContainerEgressProxy extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const target = new URL(request.url);
    const gateway = new URL(this.env.D1_GATEWAY_ORIGIN);
    if (target.origin !== gateway.origin) return new Response("Outbound host is not allowed", { status: 403 });
    if (target.pathname === "/_internal/d1") return d1Request(request, this.env);
    if (target.pathname.startsWith("/api/plants/")) return fetch(request);
    return new Response("Outbound path is not allowed", { status: 403 });
  }
}

abstract class ManagedPythonContainer extends DurableObject<Env> {
  private starting: Promise<void> | undefined;
  private monitoring: Promise<void> | undefined;
  protected abstract readonly port: number;
  protected abstract readonly healthPath: string;
  protected abstract readonly serviceName: string;
  protected abstract containerEnvironment(gateway: URL): Record<string, string>;

  constructor(ctx: DurableObject["ctx"], env: Env) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(10 * 60 * 1000));
      this.monitorContainer(container);
    }
  }

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.startAndWaitForPort().finally(() => { this.starting = undefined; });
    await this.starting;

    const container = this.ctx.container!;
    await container.setInactivityTimeout(10 * 60 * 1000);
    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return container.getTcpPort(this.port).fetch(forwarded);
  }

  private async startAndWaitForPort(): Promise<void> {
    const container = this.ctx.container;
    if (!container) throw new Error("No container is configured for this Durable Object");
    const gateway = new URL(this.env.D1_GATEWAY_ORIGIN);
    if (gateway.protocol !== "https:" || !gateway.hostname.endsWith(".workers.dev") || gateway.pathname !== "/") {
      throw new Error("D1_GATEWAY_ORIGIN must be this account's HTTPS workers.dev origin");
    }
    if (!container.running) {
      const exports = this.ctx.exports as unknown as {
        ContainerEgressProxy: (options: { props: Record<string, never> }) => Fetcher;
      };
      await container.interceptOutboundHttps(gateway.hostname, exports.ContainerEgressProxy({ props: {} }));
      container.start({
        image: container.images.default,
        instance: "standard-1",
        enableInternet: false,
        env: this.containerEnvironment(gateway),
      });
      this.monitorContainer(container);
    }
    await container.setInactivityTimeout(10 * 60 * 1000);

    const port = container.getTcpPort(this.port);
    let lastError: unknown;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await port.fetch(`http://container${this.healthPath}`, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`Health check returned ${response.status}`);
        return;
      } catch (error) {
        lastError = error;
        if (!container.running) break;
        await scheduler.wait(200);
      }
    }
    throw new Error(`${this.serviceName} container did not become ready`, { cause: lastError });
  }

  private monitorContainer(container: NonNullable<DurableObject["ctx"]["container"]>): void {
    if (this.monitoring) return;
    const monitoring = container.monitor()
      .catch((error) => console.error(`${this.serviceName} container exited unexpectedly`, error))
      .then(() => undefined);
    this.monitoring = monitoring;
    this.ctx.waitUntil(monitoring.finally(() => {
      if (this.monitoring === monitoring) this.monitoring = undefined;
    }));
  }
}

export class AcueductoContainer extends ManagedPythonContainer {
  protected readonly port = 8000;
  protected readonly healthPath = "/api/health";
  protected readonly serviceName = "Acueducto";

  protected containerEnvironment(gateway: URL): Record<string, string> {
    return {
      TWIN_SERVICE_ID: "acueducto",
      TWIN_ALLOWED_PLANTS: this.env.ALLOWED_PLANT_IDS,
      TWIN_DATA_BACKEND: "d1",
      TWIN_D1_GATEWAY_URL: `${gateway.origin}/_internal/d1`,
      TWIN_D1_GATEWAY_TOKEN: this.env.D1_BRIDGE_TOKEN,
      TWIN_MODELS: "/app/industrial-models",
      SSL_CERT_FILE: "/etc/cloudflare/certs/cloudflare-containers-ca.crt",
    };
  }
}

export class FractalContainer extends ManagedPythonContainer {
  protected readonly port = 8100;
  protected readonly healthPath = "/health";
  protected readonly serviceName = "Fractal";

  protected containerEnvironment(gateway: URL): Record<string, string> {
    return {
      FRACTAL_PLC_API_URL: gateway.origin,
      FRACTAL_ENABLE_OPTIMIZATION: "0",
      SSL_CERT_FILE: "/etc/cloudflare/certs/cloudflare-containers-ca.crt",
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/_worker/health") return Response.json({ status: "ok", service: "acueducto-gateway" });
    if (url.pathname === "/_internal/d1") return d1Request(request, env);
    if (url.pathname.startsWith("/_admin/")) {
      if (!(await authorizedByAccess(request, env))) return Response.json({ detail: "Administrator access required" }, { status: 401 });
      return Response.json({ detail: "Not found" }, { status: 404 });
    }
    if (request.method === "OPTIONS") {
      if (!originAllowed(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (url.pathname === "/api/demo/session" && request.method === "POST") {
      return withCors(await createDemoSession(request, env), request, env);
    }
    const fractalPath = url.pathname.startsWith("/fractal/");
    if (!fractalPath && !url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    if (!fractalPath && url.pathname === "/api/health" && request.method === "GET") {
      if (await limited(env.DEMO_API_LIMITER, ipKey(request))) return withCors(Response.json({ detail: "Rate limit exceeded" }, { status: 429 }), request, env);
      try {
        const response = await env.ACUEDUCTO_CONTAINER.getByName("acueducto").fetch(request);
        return withCors(response, request, env);
      } catch {
        return withCors(Response.json({ detail: "Emulator service is temporarily unavailable" }, { status: 503 }), request, env);
      }
    }
    const websocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
    const token = websocket ? websocketToken(request) : bearerToken(request);
    if (!token || !env.DEMO_TOKEN_SECRET) {
      return withCors(Response.json({ detail: "Anonymous demo session required" }, { status: 401 }), request, env);
    }
    const claims = await verifyDemoToken(env.DEMO_TOKEN_SECRET, token);
    if (!claims) return withCors(Response.json({ detail: "Anonymous demo session expired or invalid" }, { status: 401 }), request, env);
    if (await limited(env.DEMO_API_LIMITER, ipKey(request)) || await limited(env.DEMO_API_LIMITER, claims.sub)) {
      return withCors(Response.json({ detail: "Demo rate limit exceeded" }, { status: 429 }), request, env);
    }
    if (fractalPath) return proxyFractal(request, env, claims.sub, token);
    return proxyApi(request, env, claims.sub);
  },
};
