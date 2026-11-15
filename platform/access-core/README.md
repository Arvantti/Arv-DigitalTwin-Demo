# Access policy core

Shared policy primitives for per-user, per-twin authorization across Gallery and model APIs. The library deliberately has no database, identity-provider, or Cloudflare dependency: callers must build `AccessPrincipal` only from a cryptographically verified identity and server-side assignments.

Permissions are deny-by-default and scoped to a twin: `view`, `saved_studies.read`, `saved_studies.create`, and `saved_studies.edit`. Deletion of another user's saved study and operational/PLC actions are intentionally absent. A newly added catalog twin has no user grants unless an administrator explicitly assigns them. The administrator bypass flag is trusted server input, not a JWT metadata or client field.

This package is policy logic only; it does not by itself secure any endpoint or enable production login. Every frontend route and backend operation must enforce it before use. Never trust a principal, role, or assignment submitted by the browser.
