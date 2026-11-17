# DigitalTwin access-control API

This Worker is the control plane for Auth0 identities, signup approvals, and per-user/per-twin grants. It verifies the Cloudflare Access JWT and resolves the upstream Auth0 subject through `/cdn-cgi/access/get-identity`; authorization never uses email as the identity key. `ACCESS_CONTROL_ADMIN_SUBJECTS` contains exact Auth0 subject IDs. Pages forwards only the validated Access session cookie over a private header. Secrets and identity tokens are never returned to Gallery or logged.

## Signup and approval lifecycle

- A first-time **verified** identity authenticating through Cloudflare Access is recorded in `access_signup_requests` as `pending`. Unverified identities receive no access and cannot open an approval request.
- Pending users see a waiting notice in the public portal. `/v1/check` denies all model access until approval.
- `GET /admin/registrations` lists pending requests. `POST /admin/registrations/{auth0_sub}/approve` requires a verified Auth0 email, marks the account active, and enables `global_view_only`. That policy grants only `view` for every twin in `TWIN_CATALOG`, including future twins; it does not grant saved-study access or editing.
- `POST /admin/registrations/{auth0_sub}/reject` records rejection; rejected identities remain denied.
- There is deliberately no automatic administrator notification. Review pending requests from the Administration console periodically; its refresh button loads the current queue.
- New self-registrations by password and Google use separate Auth0 identities. Do not automatically link accounts by matching email; account linking requires a separately authenticated, reviewed flow.

## Auth0 settings to apply after the backend is deployed

1. In the `DigitalTwin-Users` database connection, clear **Disable Sign Ups** so public registrations use the same connection as administrator invitations.
2. For the `DigitalTwin Cloudflare Access` Auth0 application, enable `DigitalTwin-Users`, keep Google enabled, and disable the legacy `Username-Password-Authentication` connection **for this application only**. Do not change its use by other clients.
3. Confirm the Auth0 Post Login Action requires verified email and that the Cloudflare Access OIDC client is configured for the two intended connections.

These Dashboard changes and the D1 migration are production changes; do not apply them or deploy without explicit user authorization. Until that rollout is complete, keep the current production settings unchanged.

## Routes

- `GET /v1/me`: verified identity, approval state, visible twins, and grants. A pending signup receives an empty twin list.
- `GET /v1/check?twin_id=...&permission=...`: server-side permission decision used by Pages and model gateways. Global viewers inherit only `view` from the current configured catalog.
- `GET /admin/users`: managed accounts and grants.
- `POST /admin/users` `{email, account_type}`: creates a database account through `AUTH0_DB_CONNECTION`, sends verification and password-setup email, and marks it active with global read-only access after email verification. The generated password and setup ticket are never returned.
- `GET /admin/registrations`: pending self-registration requests. Review them periodically in the console; no automatic notification is sent.
- `POST /admin/registrations/{auth0_sub}/approve|reject`: administers the approval queue.
- `PUT /admin/users/{auth0_sub}/twins/{twin_id}` `{permissions}`: atomically replaces explicit permissions for one twin. Extra scenario permissions remain per-user/per-twin.
- `PATCH /admin/users/{auth0_sub}` `{status: "active"|"suspended"}`: blocks/unblocks in Auth0; suspension also requests session revocation.
- `DELETE /admin/users/{auth0_sub}/access`: revokes explicit grants and inherited global read-only access while retaining identity and audit history.

Every non-health route requires a valid Access assertion and matching session cookie; browser-origin requests are limited to the Gallery origin. Administrative routes additionally require the exact configured administrator Auth0 subject; ordinary users cannot approve themselves, edit access records, or assign the trusted global-view flag. Approval/rejection is conditional on the request still being pending, so concurrent decisions cannot turn a rejected request into an approved account. The Worker fails closed for pending, rejected, suspended, unverified, and unassigned identities. New global viewers see future twins only when those twin IDs are added to the trusted `TWIN_CATALOG`.

## Validation and deployment

Run `pnpm --filter @twin/access-core test`, `pnpm --filter @twin/access-control-api test`, `pnpm --filter @twin/access-control-api typecheck`, and `pnpm --filter @twin/gallery typecheck`. Apply migration `0002_signup_approval.sql` to D1 and deploy the Worker/Gallery only after explicit authorization. Existing `0001` accounts keep their explicit grants; they do not automatically become global viewers. Newly invited accounts and approved self-registrations receive global view-only access.

The Worker and Gallery are already connected in production, but rollout of this approval workflow is not complete. Other model APIs must continue to enforce their own gateway checks; the control API alone does not protect an unintegrated backend.