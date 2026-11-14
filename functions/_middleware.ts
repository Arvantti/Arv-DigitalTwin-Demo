type PagesEnv = { ACCESS_CONTROL_API_URL?: string };
type PagesContext = { request: Request; env: PagesEnv; next: () => Promise<Response> };

const MODEL_ROUTES: Record<string, string> = {
  "/plant.html": "plant-query",
  "/equipos.html": "plant-query-required",
  "/plc.html": "water-network-scale-v1",
  "/plc-mockup.html": "water-network-scale-v1",
  "/emulador.html": "water-network-scale-v1",
  "/aps.html": "plastic-injection-plant-v1",
  "/control.html": "plastic-injection-plant-v1",
  "/resumen-plasticos.html": "plastic-injection-plant-v1",
  "/aps-salsas.html": "sauce-plant-v1",
  "/ciudad.html": "centro-medellin-v1",
  "/data/acueducto-dia.json": "water-network-scale-v1",
  "/data/ciudad-linea-base.json": "centro-medellin-v1",
  "/data/ciudad-plano.svg": "centro-medellin-v1",
  "/data/ciudad-modelo.json": "centro-medellin-v1",
  "/data/ciudad-trayectorias.json": "centro-medellin-v1",
  "/access-admin.html": "admin-console",
};

function response(detail: string, status: number): Response {
  return Response.json({ detail }, { status, headers: { "cache-control": "no-store" } });
}

async function boundedBody(request: Request, limit: number): Promise<ArrayBuffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

/** Pages route gate. The assertion is verified again by the control API; no client identity headers are trusted. */
export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const api = env.ACCESS_CONTROL_API_URL?.trim().replace(/\/$/, "");
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/access/")) {
    if (!api) return response("Access Control API is not configured", 503);
    const endpoint = url.pathname.slice("/api/access".length);
    if (!(endpoint.startsWith("/v1/") || endpoint.startsWith("/admin/"))) return response("Not found", 404);
    const assertion = request.headers.get("cf-access-jwt-assertion");
    if (!assertion) return response("Authenticated Cloudflare Access session required", 401);
    const origin = request.headers.get("origin");
    if ((origin && origin !== url.origin) || (!origin && !["GET", "HEAD"].includes(request.method))) {
      return response("Origin not allowed", 403);
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    const headers = new Headers({
      "cf-access-jwt-assertion": assertion,
      origin: url.origin,
      "cache-control": "no-store",
    });
    for (const name of ["content-type", "accept"] as const) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      let body: ArrayBuffer | undefined;
      if (request.method !== "GET" && request.method !== "HEAD") {
        body = await boundedBody(request, 16_384) ?? undefined;
        if (!body) return response("Request body is too large", 413);
      }
      const target = new URL(`${endpoint}${url.search}`, api);
      if (target.protocol !== "https:") return response("Access Control API must use HTTPS", 503);
      const upstream = await fetch(target, { method: request.method, headers, body, redirect: "manual" });
      const resultHeaders = new Headers(upstream.headers);
      resultHeaders.set("cache-control", "no-store");
      resultHeaders.delete("set-cookie");
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: resultHeaders });
    } catch {
      return response("Access authorization service unavailable", 503);
    }
  }

  // Until external Access and API configuration are deliberately enabled, preserve the existing static demo.
  if (!api) return context.next();
  let route = MODEL_ROUTES[url.pathname];
  const plantData = url.pathname.match(/^\/api\/plants\/([^/]+)$/);
  const replayData = url.pathname.match(/^\/api\/replays\/([^/.]+)\.json$/);
  const scheduleData = url.pathname.match(/^\/api\/schedules\/([^/.]+)\.json$/);
  route ??= plantData?.[1] ?? replayData?.[1] ?? scheduleData?.[1];
  if (!route) return context.next();
  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) return response("Authenticated Cloudflare Access session required", 401);

  const twinId = route === "plant-query" ? (url.searchParams.get("plant") ?? "sauce-plant-v1")
    : route === "plant-query-required" ? url.searchParams.get("plant") : route;
  if (!twinId) return response("Twin id is required", 400);

  try {
    const check = new URL("/v1/check", api);
    check.searchParams.set("twin_id", route === "admin-console" ? "water-network-scale-v1" : twinId);
    check.searchParams.set("permission", route === "admin-console" ? "admin.action" : "view");
    const result = await fetch(check, {
      headers: { "cf-access-jwt-assertion": assertion, "cache-control": "no-store" },
    });
    if (result.status === 422) return response("Twin is not in the access catalog", 404);
    if (!result.ok) return response("Access authorization service unavailable", 503);
    const body = await result.json() as { allowed?: unknown };
    if (body.allowed !== true) return response("This account cannot view the requested twin", 403);
    return context.next();
  } catch {
    return response("Access authorization service unavailable", 503);
  }
}
