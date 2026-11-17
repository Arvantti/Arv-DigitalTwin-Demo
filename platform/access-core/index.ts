/** Common authorization policy. Inputs must come from a trusted identity provider/backend, never request JSON. */
export const TWIN_PERMISSIONS = [
  "view",
  "saved_studies.read",
  "saved_studies.create",
  "saved_studies.edit",
] as const;

export type TwinPermission = (typeof TWIN_PERMISSIONS)[number];
export type ViewerAccountType = "client" | "reseller";

/** Defaults apply only when an administrator assigns a twin to a new account. */
export function defaultPermissionsForViewer(type: ViewerAccountType): TwinPermission[] {
  return type === "reseller" ? ["view", "saved_studies.read"] : ["view"];
}

export type TwinAssignment = {
  twinId: string;
  permissions: readonly TwinPermission[];
};

export type AccessPrincipal = {
  /** Stable subject from the verified identity provider (e.g. Access JWT sub). */
  subject: string;
  /** Set only by trusted server-side admin policy, never by user profile metadata. */
  administrator: boolean;
  /** Read-only visibility over the current and future catalog, set only after approval. */
  globalViewOnly?: boolean;
  assignments: readonly TwinAssignment[];
};

/** Deny by default; administrators bypass per-twin grants. */
export function hasTwinPermission(
  principal: AccessPrincipal,
  twinId: string,
  permission: TwinPermission,
): boolean {
  if (!principal.subject || !twinId) return false;
  if (principal.administrator) return true;
  if (principal.globalViewOnly && permission === "view") return true;
  return principal.assignments.some(
    (assignment) => assignment.twinId === twinId && assignment.permissions.includes(permission),
  );
}

/** Returns only explicitly viewable twins; no wildcard/future-twin inheritance. */
export function visibleTwinIds(principal: AccessPrincipal, catalogTwinIds: readonly string[]): string[] {
  if (principal.administrator || principal.globalViewOnly) return [...new Set(catalogTwinIds)];
  const catalog = new Set(catalogTwinIds);
  return [...new Set(principal.assignments
    .filter((assignment) => catalog.has(assignment.twinId) && assignment.permissions.includes("view"))
    .map((assignment) => assignment.twinId))];
}

/** Validate assignment payloads at the API boundary before persisting them. */
export function isTwinPermission(value: unknown): value is TwinPermission {
  return typeof value === "string" && (TWIN_PERMISSIONS as readonly string[]).includes(value);
}

export function normalizeAssignment(twinId: unknown, permissions: unknown): TwinAssignment | null {
  if (typeof twinId !== "string" || !twinId.trim() || !Array.isArray(permissions) || !permissions.every(isTwinPermission)) {
    return null;
  }
  return { twinId: twinId.trim(), permissions: [...new Set(permissions)] };
}
