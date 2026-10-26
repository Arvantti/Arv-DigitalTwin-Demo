import { Container } from "@cloudflare/containers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { DurableObject } from "cloudflare:workers";
import { decodeD1Value, encodeD1Value } from "./d1-values";

type Env = {
  ACUEDUCTO_CONTAINER: DurableObjectNamespace<AcueductoContainer>;
  DB: D1Database;
  D1_BRIDGE_TOKEN: string;
  D1_GATEWAY_ORIGIN: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_PLANT_IDS: string;
  CORS_ORIGINS: string;
  DEV_AUTH_BYPASS?: string;
};

type D1BridgeRequest = { sql: string; params?: unknown[] };
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const MAX_SQL_BYTES = 16_384;
const MAX_PARAMETER_COUNT = 100;

function accessKeys(teamDomain: string) {
  let keys = jwksCache.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, keys);
  }
  return keys;
}

async function authorizedByAccess(request: Request, env: Env): Promise<boolean> {
  // Local-only opt-in belongs in an untracked .dev.vars file; production has no bypass.
  if (env.DEV_AUTH_BYPASS === "true") return true;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) return false;
  try {
    await jwtVerify(assertion, accessKeys(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    return true;
  } catch {
    return false;
  }
}

function allowedOrigins(env: Env): Set<string> {
  return new Set((env.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean));
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, cf-access-jwt-assertion");
  headers.set("access-control-max-age", "600");
  return headers;
}

function withCors(response: Response, request: Request, env: Env): Response {
  // Do not reconstruct a WebSocket upgrade response.
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request, env)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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

export class AcueductoContainer extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "10m";
  pingEndpoint = "localhost:8000/api/health";

  constructor(ctx: DurableObject["ctx"], env: Env) {
    const gateway = new URL(env.D1_GATEWAY_ORIGIN);
    if (gateway.protocol !== "https:" || !gateway.hostname.endsWith(".workers.dev") || gateway.pathname !== "/") {
      throw new Error("D1_GATEWAY_ORIGIN must be this account's HTTPS workers.dev origin");
    }
    super(ctx, env, {
      envVars: {
        TWIN_SERVICE_ID: "acueducto",
        TWIN_ALLOWED_PLANTS: env.ALLOWED_PLANT_IDS,
        TWIN_DATA_BACKEND: "d1",
        TWIN_D1_GATEWAY_URL: `${gateway.origin}/_internal/d1`,
        TWIN_D1_GATEWAY_TOKEN: env.D1_BRIDGE_TOKEN,
        TWIN_MODELS: "/app/industrial-models",
      },
    });
    this.enableInternet = false;
    this.allowedHosts = [gateway.hostname];
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/_worker/health") return Response.json({ status: "ok", service: "acueducto-gateway" });
    if (url.pathname === "/_internal/d1") return d1Request(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    if (!(await authorizedByAccess(request, env))) {
      return withCors(Response.json({ detail: "Cloudflare Access authentication required" }, { status: 401 }), request, env);
    }
    const allowedPlants = new Set(env.ALLOWED_PLANT_IDS.split(",").map((plant) => plant.trim()).filter(Boolean));
    const match = url.pathname.match(/^\/api\/plants\/([^/]+)(?:\/|$)/);
    if (match && !allowedPlants.has(decodeURIComponent(match[1]))) {
      return withCors(Response.json({ detail: "Plant is not enabled for this emulator service" }, { status: 404 }), request, env);
    }
    if (!env.D1_BRIDGE_TOKEN || !env.D1_GATEWAY_ORIGIN) {
      return withCors(Response.json({ detail: "Emulator service is not fully configured" }, { status: 503 }), request, env);
    }
    try {
      const container = env.ACUEDUCTO_CONTAINER.getByName("acueducto");
      return withCors(await container.fetch(request), request, env);
    } catch (error) {
      console.error("Acueducto container request failed", error instanceof Error ? error.name : "unknown");
      return withCors(Response.json({ detail: "Emulator container is temporarily unavailable" }, { status: 503 }), request, env);
    }
  },
};
