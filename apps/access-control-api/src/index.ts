import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  hasTwinPermission,
  isTwinPermission,
  normalizeAssignment,
  visibleTwinIds,
  type AccessPrincipal,
  type TwinPermission,
} from "@twin/access-core";

type Env = {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ACCESS_CONTROL_ADMIN_SUBJECTS: string;
  GALLERY_ORIGIN: string;
  AUTH0_DOMAIN: string;
  AUTH0_MANAGEMENT_CLIENT_ID: string;
  AUTH0_MANAGEMENT_CLIENT_SECRET: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_DB_CONNECTION: string;
  TWIN_CATALOG: string;
  RESEND_API_KEY?: string;
  APPROVAL_NOTIFICATION_EMAIL?: string;
  APPROVAL_NOTIFICATION_FROM?: string;
};

type Identity = { sub: string; email: string; emailVerified: boolean };
type CloudflareAccessIdentity = { id?: unknown; user_uuid?: unknown; email?: unknown };
type AccountType = "client" | "reseller";
type PermissionRow = { twin_id: string; permission: TwinPermission };
type SignupRequest = { auth0_sub: string; email: string; status: "pending" | "approved" | "rejected"; notification_status: string; requested_at: number };
type Auth0User = { user_id: string; email?: string; name?: string; blocked?: boolean; email_verified?: boolean; app_metadata?: { account_type?: AccountType } };

const MAX_BODY_BYTES = 16_384;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function catalog(env: Env): string[] {
  return [...new Set(env.TWIN_CATALOG.split(",").map((id) => id.trim()).filter(Boolean))];
}

function accessAudiences(env: Env): string[] {
  return [...new Set(env.ACCESS_AUD.split(",").map((audience) => audience.trim()).filter(Boolean))];
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function withCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("origin");
  if (!origin || origin !== env.GALLERY_ORIGIN) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return null;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function identity(request: Request, env: Env): Promise<Identity | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const assertion = request.headers.get("cf-access-jwt-assertion");
  const sessionCookie = request.headers.get("cf-access-session-cookie");
  if (!assertion || !sessionCookie || /[\r\n;]/.test(sessionCookie)) return null;
  try {
    jwks ??= createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(assertion, jwks, {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: accessAudiences(env),
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;

    // Access `sub` is a Cloudflare user UUID, not the upstream Auth0 user_id used by grants.
    // Resolve the signed assertion to Access's identity endpoint, then bind both identities.
    const identityResponse = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/get-identity`, {
      headers: { cookie: `CF_Authorization=${sessionCookie}` },
      redirect: "manual",
    });
    if (!identityResponse.ok) return null;
    const accessIdentity = await identityResponse.json() as CloudflareAccessIdentity;
    if (typeof accessIdentity.id !== "string" || typeof accessIdentity.user_uuid !== "string"
      || typeof accessIdentity.email !== "string" || accessIdentity.user_uuid !== payload.sub
      || accessIdentity.email.toLowerCase() !== payload.email.toLowerCase()) return null;
    return { sub: accessIdentity.id, email: payload.email.toLowerCase(), emailVerified: payload.email_verified === true };
  } catch {
    return null;
  }
}

function isAdmin(user: Identity, env: Env): boolean {
  const trustedSubjects = new Set(env.ACCESS_CONTROL_ADMIN_SUBJECTS.split(",").map((sub) => sub.trim()).filter(Boolean));
  return trustedSubjects.has(user.sub);
}

async function rowsForUser(env: Env, sub: string): Promise<PermissionRow[]> {
  const result = await env.DB.prepare(
    "SELECT twin_id, permission FROM twin_access_grants WHERE auth0_sub = ? ORDER BY twin_id, permission",
  ).bind(sub).all<PermissionRow>();
  return result.results ?? [];
}

function principal(user: Identity, assignments: readonly PermissionRow[], admin: boolean, globalViewOnly = false): AccessPrincipal {
  const byTwin = new Map<string, TwinPermission[]>();
  for (const row of assignments) {
    const list = byTwin.get(row.twin_id) ?? [];
    if (isTwinPermission(row.permission) && !list.includes(row.permission)) list.push(row.permission);
    byTwin.set(row.twin_id, list);
  }
  return {
    subject: user.sub,
    administrator: admin,
    globalViewOnly,
    assignments: [...byTwin].map(([twinId, permissions]) => ({ twinId, permissions })),
  };
}

async function auth0Token(env: Env): Promise<string> {
  if (!env.AUTH0_DOMAIN || !env.AUTH0_MANAGEMENT_CLIENT_ID || !env.AUTH0_MANAGEMENT_CLIENT_SECRET) {
    throw new Error("management_unconfigured");
  }
  const response = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env.AUTH0_MANAGEMENT_CLIENT_ID,
      client_secret: env.AUTH0_MANAGEMENT_CLIENT_SECRET,
      audience: `https://${env.AUTH0_DOMAIN}/api/v2/`,
    }),
  });
  if (!response.ok) throw new Error("management_token_failed");
  const body = await response.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string") throw new Error("management_token_invalid");
  return body.access_token;
}

async function auth0Request(env: Env, token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://${env.AUTH0_DOMAIN}/api/v2${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers },
  });
}

async function audit(env: Env, actor: string, target: string, action: string, twinId: string | null, detail: unknown): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO access_admin_audit (id, actor_sub, target_sub, twin_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), actor, target, twinId, action, JSON.stringify(detail), Math.floor(Date.now() / 1000)).run();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[character] ?? character);
}

async function notifyApprovalRequest(env: Env, request: SignupRequest): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claimed = await env.DB.prepare(
    "UPDATE access_signup_requests SET notification_status = 'sending', notification_attempted_at = ?, updated_at = ? WHERE auth0_sub = ? AND status = 'pending' AND notification_status != 'sent' AND (notification_attempted_at IS NULL OR notification_attempted_at < ?)",
  ).bind(now, now, request.auth0_sub, now - 600).run();
  if (!claimed.meta?.changes) return request.notification_status;
  if (!env.RESEND_API_KEY || !env.APPROVAL_NOTIFICATION_EMAIL || !env.APPROVAL_NOTIFICATION_FROM) {
    await env.DB.prepare("UPDATE access_signup_requests SET notification_status = 'unconfigured', updated_at = ? WHERE auth0_sub = ?")
      .bind(now, request.auth0_sub).run();
    return "unconfigured";
  }

  const email = escapeHtml(request.email);
  let delivered = false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "Idempotency-Key": `digitaltwin-approval-${encodeURIComponent(request.auth0_sub)}-${now}`,
      },
      body: JSON.stringify({
        from: env.APPROVAL_NOTIFICATION_FROM,
        to: [env.APPROVAL_NOTIFICATION_EMAIL],
        subject: "Nueva solicitud de acceso a DigitalTwin",
        text: `La cuenta ${request.email} solicitó acceso. Revisa y aprueba la solicitud en ${env.GALLERY_ORIGIN}/access-admin.html.`,
        html: `<p>La cuenta <strong>${email}</strong> solicitó acceso a DigitalTwin.</p><p><a href="${env.GALLERY_ORIGIN}/access-admin.html">Revisar solicitud en Administración</a></p>`,
      }),
    });
    delivered = response.ok;
  } catch {
    delivered = false;
  }
  const status = delivered ? "sent" : "failed";
  await env.DB.prepare(
    "UPDATE access_signup_requests SET notification_status = ?, notification_sent_at = ?, updated_at = ? WHERE auth0_sub = ?",
  ).bind(status, delivered ? now : null, now, request.auth0_sub).run();
  return status;
}

async function signupRequestFor(env: Env, user: Identity): Promise<SignupRequest | null> {
  if (!user.emailVerified) return null;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO access_signup_requests (auth0_sub, email, status, requested_at, updated_at) SELECT ?, ?, 'pending', ?, ? WHERE NOT EXISTS (SELECT 1 FROM access_users WHERE auth0_sub = ?) ON CONFLICT(auth0_sub) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at WHERE access_signup_requests.status = 'pending'",
  ).bind(user.sub, user.email, now, now, user.sub).run();
  const request = await env.DB.prepare(
    "SELECT auth0_sub, email, status, notification_status, requested_at FROM access_signup_requests WHERE auth0_sub = ?",
  ).bind(user.sub).first<SignupRequest>();
  if (!request || request.status !== "pending") return request;
  request.notification_status = await notifyApprovalRequest(env, request);
  return request;
}

async function revokeAuth0Sessions(env: Env, token: string, sub: string): Promise<void> {
  const response = await auth0Request(env, token, `/users/${encodeURIComponent(sub)}/sessions`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error("session_revocation_failed");
}

async function handleAdmin(request: Request, env: Env, actor: Identity, path: string): Promise<Response> {
  if (!isAdmin(actor, env)) return json({ detail: "Administrator access required" }, 403);
  const parts = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

  if (request.method === "GET" && parts.length === 1 && parts[0] === "users") {
    const token = await auth0Token(env);
    // Only enumerate accounts explicitly created/managed by this control plane; never expose other tenant identities.
    const accountRows = await env.DB.prepare(
      "SELECT auth0_sub, email, account_type, status, global_view_only FROM access_users ORDER BY created_at DESC LIMIT 500",
    ).all<{ auth0_sub: string; email: string; account_type: AccountType; status: string; global_view_only: number }>();
    const result = await Promise.all((accountRows.results ?? []).map(async (account) => {
      const response = await auth0Request(env, token, `/users/${encodeURIComponent(account.auth0_sub)}`);
      if (!response.ok) return null;
      const user = await response.json() as Auth0User;
      return {
        subject: account.auth0_sub,
        email: account.email,
        name: user.name ?? "",
        email_verified: user.email_verified === true,
        blocked: user.blocked === true,
        account_type: account.account_type,
        status: account.status,
        global_view_only: account.global_view_only === 1,
        grants: (await rowsForUser(env, account.auth0_sub)).reduce<Record<string, TwinPermission[]>>((all, row) => {
          (all[row.twin_id] ??= []).push(row.permission);
          return all;
        }, {}),
      };
    }));
    return json({ users: result.filter((user): user is NonNullable<typeof user> => user !== null), twins: catalog(env) });
  }

  if (request.method === "GET" && parts.length === 1 && parts[0] === "registrations") {
    const token = await auth0Token(env);
    const rows = await env.DB.prepare(
      "SELECT auth0_sub, email, status, notification_status, requested_at FROM access_signup_requests WHERE status = 'pending' ORDER BY requested_at ASC LIMIT 500",
    ).all<SignupRequest>();
    const registrations = await Promise.all((rows.results ?? []).map(async (row) => {
      const response = await auth0Request(env, token, `/users/${encodeURIComponent(row.auth0_sub)}`);
      if (!response.ok) return null;
      const user = await response.json() as Auth0User;
      return {
        subject: row.auth0_sub,
        email: row.email,
        name: user.name ?? "",
        email_verified: user.email_verified === true,
        requested_at: row.requested_at,
        notification_status: row.notification_status,
      };
    }));
    return json({ registrations: registrations.filter((item): item is NonNullable<typeof item> => item !== null) });
  }

  if (parts.length === 3 && parts[0] === "registrations") {
    const targetSub = parts[1];
    const action = parts[2];
    const target = await env.DB.prepare(
      "SELECT auth0_sub, email, status, notification_status, requested_at FROM access_signup_requests WHERE auth0_sub = ?",
    ).bind(targetSub).first<SignupRequest>();
    if (!target) return json({ detail: "Registration request not found" }, 404);
    if (target.status !== "pending") return json({ detail: "Registration request is no longer pending" }, 409);

    if (request.method === "POST" && action === "approve") {
      const token = await auth0Token(env);
      const profileResponse = await auth0Request(env, token, `/users/${encodeURIComponent(targetSub)}`);
      if (!profileResponse.ok) return json({ detail: "Identity provider could not verify the applicant" }, 502);
      const profile = await profileResponse.json() as Auth0User;
      if (profile.email_verified !== true) return json({ detail: "The applicant must verify their email before approval" }, 409);
      const now = Math.floor(Date.now() / 1000);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO access_users (auth0_sub, email, account_type, status, global_view_only, created_at, updated_at) VALUES (?, ?, 'client', 'active', 1, ?, ?) ON CONFLICT(auth0_sub) DO UPDATE SET email = excluded.email, status = 'active', global_view_only = 1, updated_at = excluded.updated_at")
          .bind(targetSub, target.email, now, now),
        env.DB.prepare("UPDATE access_signup_requests SET status = 'approved', updated_at = ? WHERE auth0_sub = ? AND status = 'pending'")
          .bind(now, targetSub),
        env.DB.prepare("INSERT INTO access_admin_audit (id, actor_sub, target_sub, twin_id, action, detail_json, created_at) VALUES (?, ?, ?, NULL, 'signup.approved', ?, ?)")
          .bind(crypto.randomUUID(), actor.sub, targetSub, JSON.stringify({ global_view_only: true }), now),
      ]);
      return json({ subject: targetSub, status: "active", global_view_only: true });
    }

    if (request.method === "POST" && action === "reject") {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.batch([
        env.DB.prepare("UPDATE access_signup_requests SET status = 'rejected', updated_at = ? WHERE auth0_sub = ? AND status = 'pending'").bind(now, targetSub),
        env.DB.prepare("INSERT INTO access_admin_audit (id, actor_sub, target_sub, twin_id, action, detail_json, created_at) VALUES (?, ?, ?, NULL, 'signup.rejected', '{}', ?)").bind(crypto.randomUUID(), actor.sub, targetSub, now),
      ]);
      return json({ subject: targetSub, status: "rejected" });
    }

    if (request.method === "POST" && action === "resend-notification") {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare("UPDATE access_signup_requests SET notification_status = 'pending', notification_attempted_at = NULL, updated_at = ? WHERE auth0_sub = ? AND status = 'pending'")
        .bind(now, targetSub).run();
      const notificationStatus = await notifyApprovalRequest(env, { ...target, notification_status: "pending" });
      if (notificationStatus !== "sent") return json({ detail: notificationStatus === "unconfigured" ? "Approval email is not configured" : "Approval notification could not be delivered" }, 502);
      return json({ subject: targetSub, notification_sent: true });
    }
  }

  if (request.method === "POST" && parts.length === 1 && parts[0] === "users") {
    const body = await readJson(request);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const accountType = body?.account_type;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (accountType !== "client" && accountType !== "reseller")) {
      return json({ detail: "Valid email and account_type (client or reseller) are required" }, 422);
    }
    if (!env.AUTH0_DB_CONNECTION || !env.AUTH0_CLIENT_ID) return json({ detail: "Account invitations are not configured" }, 503);
    const token = await auth0Token(env);
    const tempPassword = `${Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, "0")).join("")}Aa1!`;
    const created = await auth0Request(env, token, "/users", {
      method: "POST",
      body: JSON.stringify({
        connection: env.AUTH0_DB_CONNECTION,
        email,
        password: tempPassword,
        email_verified: false,
        app_metadata: { account_type: accountType },
      }),
    });
    if (!created.ok) {
      const status = created.status === 409 ? 409 : created.status === 422 ? 422 : 502;
      return json({ detail: status === 409 ? "An account with that email already exists" : "Identity provider could not create the account" }, status);
    }
    const user = await created.json() as Auth0User;
    if (!user.user_id) return json({ detail: "Identity provider returned an invalid user record" }, 502);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO access_users (auth0_sub, email, account_type, status, global_view_only, created_at, updated_at) VALUES (?, ?, ?, 'active', 1, ?, ?)")
      .bind(user.user_id, email, accountType, now, now).run();

    // Send both verification and password setup emails. Never return the generated password or ticket.
    const [verification, passwordSetup] = await Promise.all([
      auth0Request(env, token, "/jobs/verification-email", { method: "POST", body: JSON.stringify({ user_id: user.user_id }) }),
      fetch(`https://${env.AUTH0_DOMAIN}/dbconnections/change_password`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: env.AUTH0_CLIENT_ID, email, connection: env.AUTH0_DB_CONNECTION }),
      }),
    ]);
    if (!verification.ok || !passwordSetup.ok) {
      await auth0Request(env, token, `/users/${encodeURIComponent(user.user_id)}`, { method: "PATCH", body: JSON.stringify({ blocked: true }) });
      await env.DB.prepare("UPDATE access_users SET status = 'suspended', updated_at = ? WHERE auth0_sub = ?").bind(Math.floor(Date.now() / 1000), user.user_id).run();
      return json({ detail: "Account was created but invitation delivery failed; it has been suspended. Check identity-provider email settings." }, 502);
    }
    await audit(env, actor.sub, user.user_id, "user.invited", null, { account_type: accountType });
    return json({ user: { subject: user.user_id, email, account_type: accountType, status: "active" }, invitation_sent: true }, 201);
  }

  if (parts.length >= 2 && parts[0] === "users") {
    const targetSub = parts[1];
    if (request.method === "POST" && parts.length === 3 && parts[2] === "password-reset") {
      if (!env.AUTH0_DOMAIN || !env.AUTH0_CLIENT_ID || !env.AUTH0_DB_CONNECTION) {
        return json({ detail: "Password reset email is not configured" }, 503);
      }
      const target = await env.DB.prepare(
        "SELECT email, status FROM access_users WHERE auth0_sub = ?",
      ).bind(targetSub).first<{ email: string; status: string }>();
      if (!target) return json({ detail: "Managed user not found" }, 404);
      if (target.status !== "active") return json({ detail: "Reactivate the account before sending a password reset email" }, 409);
      const response = await fetch(`https://${env.AUTH0_DOMAIN}/dbconnections/change_password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: env.AUTH0_CLIENT_ID, email: target.email, connection: env.AUTH0_DB_CONNECTION }),
      });
      if (!response.ok) return json({ detail: "Identity provider could not send the password reset email" }, 502);
      await audit(env, actor.sub, targetSub, "user.password_reset_requested", null, { delivery: "email" });
      return json({ subject: targetSub, password_reset_email_sent: true });
    }

    if (request.method === "DELETE" && parts.length === 3 && parts[2] === "access") {
      const target = await env.DB.prepare("SELECT auth0_sub FROM access_users WHERE auth0_sub = ?").bind(targetSub)
        .first<{ auth0_sub: string }>();
      if (!target) return json({ detail: "Managed user not found" }, 404);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM twin_access_grants WHERE auth0_sub = ?").bind(targetSub),
        env.DB.prepare("UPDATE access_users SET global_view_only = 0, updated_at = ? WHERE auth0_sub = ?").bind(Math.floor(Date.now() / 1000), targetSub),
      ]);
      await audit(env, actor.sub, targetSub, "user.access_revoked", null, { all_twins: true, global_view_only: false });
      const token = await auth0Token(env);
      await revokeAuth0Sessions(env, token, targetSub);
      return json({ subject: targetSub, access_revoked: true });
    }

    if (request.method === "PATCH" && parts.length === 2) {
      const body = await readJson(request);
      const status = body?.status;
      if (status !== "active" && status !== "suspended") return json({ detail: "status must be active or suspended" }, 422);
      const token = await auth0Token(env);
      const response = await auth0Request(env, token, `/users/${encodeURIComponent(targetSub)}`, {
        method: "PATCH", body: JSON.stringify({ blocked: status === "suspended" }),
      });
      if (!response.ok) return json({ detail: "Identity provider could not update the account" }, 502);
      await env.DB.prepare("UPDATE access_users SET status = ?, updated_at = ? WHERE auth0_sub = ?")
        .bind(status, Math.floor(Date.now() / 1000), targetSub).run();
      if (status === "suspended") await revokeAuth0Sessions(env, token, targetSub);
      await audit(env, actor.sub, targetSub, status === "suspended" ? "user.suspended" : "user.reactivated", null, {});
      return json({ subject: targetSub, status });
    }

    if (request.method === "PUT" && parts.length === 4 && parts[2] === "twins") {
      const twinId = parts[3];
      if (!catalog(env).includes(twinId)) return json({ detail: "Unknown twin" }, 404);
      const body = await readJson(request);
      const assignment = normalizeAssignment(twinId, body?.permissions);
      if (!assignment) return json({ detail: "Invalid permissions" }, 422);
      const target = await env.DB.prepare("SELECT account_type FROM access_users WHERE auth0_sub = ? AND status = 'active'")
        .bind(targetSub).first<{ account_type: AccountType }>();
      if (!target) return json({ detail: "Active managed user not found" }, 404);
      const batch: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM twin_access_grants WHERE auth0_sub = ? AND twin_id = ?").bind(targetSub, twinId)];
      for (const permission of assignment.permissions) {
        batch.push(env.DB.prepare(
          "INSERT INTO twin_access_grants (auth0_sub, twin_id, permission, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)",
        ).bind(targetSub, twinId, permission, actor.sub, Math.floor(Date.now() / 1000)));
      }
      batch.push(env.DB.prepare(
        "INSERT INTO access_admin_audit (id, actor_sub, target_sub, twin_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, 'grant.updated', ?, ?)",
      ).bind(crypto.randomUUID(), actor.sub, targetSub, twinId, JSON.stringify({ permissions: assignment.permissions }), Math.floor(Date.now() / 1000)));
      await env.DB.batch(batch);
      return json({ subject: targetSub, twin_id: twinId, permissions: assignment.permissions });
    }
  }
  return json({ detail: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (request.headers.get("origin") !== env.GALLERY_ORIGIN) return new Response(null, { status: 403 });
      return withCors(new Response(null, { status: 204 }), request, env);
    }
    if (url.pathname === "/health") return json({ status: "ok", service: "digitaltwin-access-control" });
    const origin = request.headers.get("origin");
    if ((origin && origin !== env.GALLERY_ORIGIN) || (!origin && url.pathname !== "/v1/check")) {
      return withCors(json({ detail: "Origin not allowed" }, 403), request, env);
    }
    const user = await identity(request, env);
    if (!user) return withCors(json({ detail: "Authenticated Access session required" }, 401), request, env);

    let response: Response;
    if (url.pathname === "/v1/login-return" && request.method === "GET") {
      response = new Response(null, {
        status: 302,
        headers: { location: `${env.GALLERY_ORIGIN}/`, "cache-control": "no-store" },
      });
    } else if (url.pathname === "/v1/check" && request.method === "GET") {
      const twinId = url.searchParams.get("twin_id") ?? "";
      const permission = url.searchParams.get("permission");
      if (!catalog(env).includes(twinId) || (permission !== "admin.action" && !isTwinPermission(permission))) {
        response = json({ detail: "Valid twin_id and permission are required" }, 422);
      } else {
        const administrator = isAdmin(user, env);
        if (permission === "admin.action") response = json({ allowed: administrator });
        else if (!administrator && !user.emailVerified) response = json({ allowed: false, approval_status: "email_unverified" });
        else {
          const account = await env.DB.prepare("SELECT status, global_view_only FROM access_users WHERE auth0_sub = ?").bind(user.sub)
            .first<{ status: string; global_view_only: number }>();
          if (administrator) {
            const grants = await rowsForUser(env, user.sub);
            response = json({ allowed: hasTwinPermission(principal(user, grants, true), twinId, permission) });
          } else if (account?.status === "suspended") response = json({ allowed: false, approval_status: "suspended" });
          else if (!account) {
            const signup = await signupRequestFor(env, user);
            response = json({ allowed: false, approval_status: signup?.status ?? "pending" });
          } else if (account.status !== "active") response = json({ allowed: false, approval_status: "suspended" });
          else {
            const grants = await rowsForUser(env, user.sub);
            const policy = principal(user, grants, false, account.global_view_only === 1);
            response = json({ allowed: hasTwinPermission(policy, twinId, permission) });
          }
        }
      }
    } else if (url.pathname === "/v1/me" && request.method === "GET") {
      const administrator = isAdmin(user, env);
      if (!administrator && !user.emailVerified) {
        return withCors(json({ administrator: false, email: user.email, email_verified: false, approval_status: "email_unverified", global_view_only: false, twins: [], grants: [] }), request, env);
      }
      const account = await env.DB.prepare("SELECT account_type, status, global_view_only FROM access_users WHERE auth0_sub = ?").bind(user.sub)
        .first<{ account_type: AccountType; status: string; global_view_only: number }>();
      if (account?.status === "suspended") return withCors(json({ detail: "Account suspended" }, 403), request, env);
      if (!account && !administrator) {
        const signup = user.emailVerified ? await signupRequestFor(env, user) : null;
        return withCors(json({
          administrator: false,
          email: user.email,
          email_verified: user.emailVerified,
          approval_status: user.emailVerified ? signup?.status ?? "pending" : "email_unverified",
          notification_status: signup?.notification_status ?? null,
          global_view_only: false,
          twins: [],
          grants: [],
        }), request, env);
      }
      const rows = await rowsForUser(env, user.sub);
      const globalViewOnly = account?.global_view_only === 1;
      const me = principal(user, rows, administrator, globalViewOnly);
      response = json({ administrator: me.administrator, email: user.email, approval_status: "approved", global_view_only: globalViewOnly, twins: visibleTwinIds(me, catalog(env)), grants: rows });
    } else if (url.pathname.startsWith("/admin/")) {
      try {
        response = await handleAdmin(request, env, user, url.pathname.slice("/admin/".length));
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        console.error("Access administration request failed", message);
        response = json({ detail: message === "management_unconfigured" ? "User-management integration is not configured" : "User-management operation failed" }, message === "management_unconfigured" ? 503 : 502);
      }
    } else {
      response = json({ detail: "Not found" }, 404);
    }
    return withCors(response, request, env);
  },
};
