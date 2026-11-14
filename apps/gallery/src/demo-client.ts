const TOKEN_PREFIX = "arvantti-demo-token:";
const sessions = new Map<string, ClientDemoSession>();
const accessMode = import.meta.env.VITE_EMULATOR_ACCESS_ENABLED === "true";
const apiCredentials: RequestCredentials = accessMode ? "include" : "omit";

type DemoSessionResponse = {
  token?: string;
  study_key?: string;
  expires_at: number;
  authenticated_user?: boolean;
};
type ClientDemoSession = { token?: string; authenticated: boolean; expiresAt: number };

function storageKey(apiOrigin: string): string {
  return `${TOKEN_PREFIX}${new URL(apiOrigin, location.origin).origin}`;
}

function recoveryKey(tokenKey: string): string {
  return `${tokenKey}:study-recovery-key`;
}

async function demoSession(apiOrigin: string): Promise<ClientDemoSession> {
  const key = storageKey(apiOrigin);
  // Remove bearer credentials persisted by older builds before attempting any network call.
  localStorage.removeItem(key);
  const cached = sessions.get(key);
  if (cached && cached.expiresAt > Math.floor(Date.now() / 1000) + 60) return cached;

  const storedRecoveryKey = accessMode ? null : localStorage.getItem(recoveryKey(key));
  if (accessMode) localStorage.removeItem(recoveryKey(key));
  const requestSession = (studyKey?: string) => fetch(`${apiOrigin.replace(/\/$/, "")}/api/demo/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(studyKey ? { study_key: studyKey } : {}),
    cache: "no-store",
    credentials: apiCredentials,
  });
  let response = await requestSession(storedRecoveryKey ?? undefined);
  if (response.status === 401 && storedRecoveryKey) {
    localStorage.removeItem(recoveryKey(key));
    response = await requestSession();
  }
  if (!response.ok) throw new Error(`No se pudo iniciar la sesión del acueducto (${response.status}).`);
  const result = await response.json() as DemoSessionResponse;
  const authenticated = result.authenticated_user === true;
  if (accessMode && !authenticated) throw new Error("El gateway no confirmó una sesión autenticada de Access.");
  if (!Number.isInteger(result.expires_at) || result.expires_at <= Date.now() / 1000 ||
      (authenticated ? result.token !== undefined : typeof result.token !== "string")) {
    throw new Error("El gateway devolvió una sesión del acueducto no válida.");
  }

  if (authenticated) {
    // Account identity owns data; neither bearer nor browser recovery key is needed.
    localStorage.removeItem(recoveryKey(key));
  } else if (typeof result.study_key === "string" && /^[a-f0-9]{64}$/.test(result.study_key)) {
    // Recovery remains only for the unauthenticated local/demo mode.
    localStorage.setItem(recoveryKey(key), result.study_key);
  }
  const session: ClientDemoSession = {
    ...(typeof result.token === "string" ? { token: result.token } : {}),
    authenticated,
    expiresAt: result.expires_at,
  };
  sessions.set(key, session);
  return session;
}

function localFastApiProxy(apiOrigin: string): boolean {
  const url = new URL(apiOrigin, location.origin);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.protocol !== "http:") return false;
  return url.port === "8000" || (url.port === "5173" && url.origin === location.origin);
}

export async function demoFetch(apiOrigin: string, path: string, init: RequestInit = {}): Promise<Response> {
  if (localFastApiProxy(apiOrigin)) return fetch(`${apiOrigin.replace(/\/$/, "")}${path}`, init);
  const session = await demoSession(apiOrigin);
  const headers = new Headers(init.headers);
  if (session.token) headers.set("authorization", `Bearer ${session.token}`);
  else headers.delete("authorization");
  return fetch(`${apiOrigin.replace(/\/$/, "")}${path}`, { ...init, headers, credentials: apiCredentials, cache: "no-store" });
}

export async function demoWebSocket(apiOrigin: string, path: string): Promise<WebSocket> {
  if (localFastApiProxy(apiOrigin)) {
    return new WebSocket(`${apiOrigin.replace(/^http/, "ws").replace(/\/$/, "")}${path}`);
  }
  const session = await demoSession(apiOrigin);
  const url = `${apiOrigin.replace(/^http/, "ws").replace(/\/$/, "")}${path}`;
  // Access mode sends only a marker; identity comes from the HttpOnly Access cookie.
  if (session.authenticated) return new WebSocket(url, ["arvantti-demo"]);
  return new WebSocket(url, ["arvantti-demo", `arvantti-demo.${session.token}`]);
}
