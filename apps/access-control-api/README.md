# DigitalTwin access-control API (local implementation)

This Worker is the control plane for Auth0 users and per-user/per-twin grants. It verifies Cloudflare Access JWTs itself; Access headers alone are not trusted. Administration is granted only to the exact, verified JWT `sub` values in `ACCESS_CONTROL_ADMIN_SUBJECTS` (comma-separated). Prefer the stable Auth0 subject over email matching. The frontend cannot set administrator status or subject IDs.

## Routes

- `GET /v1/me`: current identity and explicit grants. Suspended accounts are denied.
- `GET /admin/users`: lists Auth0 users and their current access assignments.
- `POST /admin/users` `{email, account_type}`: creates an individual Auth0 database account and sends email-verification and password-setup messages. Generated passwords and tickets are never returned or logged. If either email operation fails, the new user is blocked and marked suspended.
- `PUT /admin/users/{auth0_sub}/twins/{twin_id}` `{permissions}`: atomically replaces the grants for that user/twin; `permissions: []` revokes all access for the twin. Allowed permissions are the shared `@twin/access-core` set.
- `PATCH /admin/users/{auth0_sub}` `{status: "active"|"suspended"}`: blocks/unblocks in Auth0; suspension also requests session revocation.
- `DELETE /admin/users/{auth0_sub}/access`: revokes every twin grant and requests session invalidation while retaining the identity and audit history.
- `GET /v1/check?twin_id=...&permission=...`: verifies the caller's own grant; `admin.action` is true only for the configured administrator. Model gateways must call this before serving protected data/actions.

Every non-health route requires a valid Access assertion, same-origin Gallery `Origin`, and `no-store` response. Every `/admin/*` route additionally requires the sole admin identity. New catalog twins have no grants. Resellers receive `view` and `saved_studies.read` defaults in the admin UI only when a twin is assigned; clients get no implicit grant. Additional scenario create/edit grants are explicit. Auth0 secrets and D1 credentials never belong in the Gallery.

## Not yet production-connected

This is implementation scaffolding, not a deployed service. An administration page exists at `/access-admin.html`; the Gallery middleware can check static model routes when `ACCESS_CONTROL_API_URL` is configured at Pages runtime. The acueducto gateway checks API permissions and supports shared saved-study reads/edits only after a gateway-side grant check. Other model APIs are not yet connected, so this is not production-ready. Access applications, D1 resource, Auth0 Management API client, database connection, email templates, and host routing are not configured. Do not expose or deploy it until those integrations, migrations, authorization enforcement, tests, and manual browser flows are complete. `wrangler.access-control.jsonc` intentionally contains placeholders. Do not apply remote migrations or deploy without explicit user authorization.

## Required Auth0 Management API scopes

Use a dedicated least-privilege M2M client scoped only for the operations actually enabled: `read:users`, `create:users`, `update:users`, `delete:sessions`, `read:connections` only if later needed. Store its secret as `AUTH0_MANAGEMENT_CLIENT_SECRET` Worker Secret, never in vars, repository, or browser. `AUTH0_CLIENT_ID` is the public Auth0 application client ID; `AUTH0_DB_CONNECTION` is the database connection name. Do not enable self-signup.
