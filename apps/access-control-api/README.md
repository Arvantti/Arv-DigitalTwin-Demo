# DigitalTwin access-control API (local implementation)

This Worker is the control plane for Auth0 users and per-user/per-twin grants. It verifies the Cloudflare Access JWT and resolves its Cloudflare `sub` (user UUID) through `/cdn-cgi/access/get-identity`, binding the result to the signed JWT's UUID and email. Authorization and D1 grants use the upstream Auth0 subject (`id` from that verified identity response), not email or Cloudflare's organization-specific UUID. `ACCESS_CONTROL_ADMIN_SUBJECTS` contains exact Auth0 subject IDs. The Pages middleware forwards only the `CF_Authorization` session cookie to this Worker over a private header; neither the cookie nor JWT is logged or returned. The frontend cannot set administrator status or subject IDs.

## Routes

- `GET /v1/me`: current identity and explicit grants. Suspended accounts are denied.
- `GET /admin/users`: lists Auth0 users and their current access assignments.
- `POST /admin/users` `{email, account_type}`: creates an individual Auth0 database account and sends email-verification and password-setup messages. Generated passwords and tickets are never returned or logged. If either email operation fails, the new user is blocked and marked suspended.
- `PUT /admin/users/{auth0_sub}/twins/{twin_id}` `{permissions}`: atomically replaces the grants for that user/twin; `permissions: []` revokes all access for the twin. Allowed permissions are the shared `@twin/access-core` set.
- `PATCH /admin/users/{auth0_sub}` `{status: "active"|"suspended"}`: blocks/unblocks in Auth0; suspension also requests session revocation.
- `DELETE /admin/users/{auth0_sub}/access`: revokes every twin grant and requests session invalidation while retaining the identity and audit history.
- `GET /v1/check?twin_id=...&permission=...`: verifies the caller's own grant; `admin.action` is true only for the configured administrator. Model gateways must call this before serving protected data/actions.

Every non-health route requires a valid Access assertion, the matching `CF_Authorization` session, and (for browser-origin requests) the same-origin Gallery `Origin`; responses are `no-store`. The Worker binds the JWT's Cloudflare `sub` and email to `user_uuid` and email returned by Access, then uses the verified upstream Auth0 `id` as the authorization principal. `/admin/*` additionally requires an exact configured Auth0 subject. New catalog twins have no grants. Resellers receive `view` and `saved_studies.read` defaults in the admin UI only when a twin is assigned; clients get no implicit grant. Additional scenario create/edit grants are explicit. Auth0 secrets, D1 credentials, session cookies, and assertions never belong in the Gallery and must not be logged.

## Deployment status

The Worker, D1 migration, Auth0 connection, Cloudflare Access application, and Gallery middleware are connected in production. The middleware checks static model routes and proxies `/api/access/*`; the Worker applies per-user/per-twin policy. The Acueducto gateway integration is still incomplete and other model APIs are not connected, so those backends must not be considered protected by this API alone. Follow `wrangler.access-control.jsonc` for non-secret deployment settings; do not apply remote migrations or deploy without explicit user authorization.

## Required Auth0 Management API scopes

Use a dedicated least-privilege M2M client scoped only for the operations actually enabled: `read:users`, `create:users`, `update:users`, `delete:sessions`, `read:connections` only if later needed. Store its secret as `AUTH0_MANAGEMENT_CLIENT_SECRET` Worker Secret, never in vars, repository, or browser. `AUTH0_CLIENT_ID` is the public Auth0 application client ID; `AUTH0_DB_CONNECTION` is the database connection name. Do not enable self-signup.
