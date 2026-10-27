const TOKEN_PREFIX = "arvantti-demo-token:";

type DemoToken = { token: string; exp: number };

function expiry(token: string): number {
  try {
    const segment = token.split(".")[0].replaceAll("-", "+").replaceAll("_", "/");
    return Number(JSON.parse(atob(segment + "=".repeat((4 - segment.length % 4) % 4)).toString()).exp ?? 0);
  } catch {
    return 0;
  }
}

function storageKey(apiOrigin: string): string {
  return `${TOKEN_PREFIX}${new URL(apiOrigin, location.origin).origin}`;
}

async function demoToken(apiOrigin: string): Promise<string> {
  const key = storageKey(apiOrigin);
  const existing = localStorage.getItem(key);
  if (existing && expiry(existing) > Math.floor(Date.now() / 1000) + 60) return existing;

  const response = await fetch(`${apiOrigin.replace(/\/$/, "")}/api/demo/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`No se pudo iniciar la sesión anónima de demostración (${response.status}).`);
  const result = await response.json() as DemoToken;
  if (typeof result.token !== "string" || expiry(result.token) <= Date.now() / 1000) {
    throw new Error("El gateway devolvió una sesión de demostración no válida.");
  }
  localStorage.setItem(key, result.token);
  return result.token;
}

function localFastApiProxy(apiOrigin: string): boolean {
  const url = new URL(apiOrigin, location.origin);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.protocol !== "http:") return false;
  return url.port === "8000" || (url.port === "5173" && url.origin === location.origin);
}

export async function demoFetch(apiOrigin: string, path: string, init: RequestInit = {}): Promise<Response> {
  if (localFastApiProxy(apiOrigin)) return fetch(`${apiOrigin.replace(/\/$/, "")}${path}`, init);
  const token = await demoToken(apiOrigin);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return fetch(`${apiOrigin.replace(/\/$/, "")}${path}`, { ...init, headers, credentials: "omit", cache: "no-store" });
}

export async function demoWebSocket(apiOrigin: string, path: string): Promise<WebSocket> {
  if (localFastApiProxy(apiOrigin)) {
    return new WebSocket(`${apiOrigin.replace(/^http/, "ws").replace(/\/$/, "")}${path}`);
  }
  const token = await demoToken(apiOrigin);
  const url = `${apiOrigin.replace(/^http/, "ws").replace(/\/$/, "")}${path}`;
  // The gateway hides the token before forwarding and negotiates this marker with the PLC.
  return new WebSocket(url, ["arvantti-demo", `arvantti-demo.${token}`]);
}
