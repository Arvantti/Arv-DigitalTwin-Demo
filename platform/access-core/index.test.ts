import { describe, expect, it } from "vitest";
import { defaultPermissionsForViewer, hasTwinPermission, normalizeAssignment, visibleTwinIds, type AccessPrincipal } from "./index";

const viewer: AccessPrincipal = {
  subject: "auth0|viewer-1",
  administrator: false,
  globalViewOnly: false,
  assignments: [
    { twinId: "water-network-scale-v1", permissions: ["view", "saved_studies.read"] },
    { twinId: "sauce-plant-v1", permissions: ["view", "saved_studies.create"] },
  ],
};

describe("per-user, per-twin access policy", () => {
  it("grants only explicitly assigned actions on the matching twin", () => {
    expect(hasTwinPermission(viewer, "water-network-scale-v1", "view")).toBe(true);
    expect(hasTwinPermission(viewer, "water-network-scale-v1", "saved_studies.read")).toBe(true);
    expect(hasTwinPermission(viewer, "water-network-scale-v1", "saved_studies.edit")).toBe(false);
    expect(hasTwinPermission(viewer, "sauce-plant-v1", "saved_studies.create")).toBe(true);
    expect(hasTwinPermission(viewer, "sauce-plant-v1", "saved_studies.read")).toBe(false);
  });

  it("does not grant future or unassigned twins", () => {
    expect(hasTwinPermission(viewer, "new-future-twin", "view")).toBe(false);
    expect(visibleTwinIds(viewer, ["water-network-scale-v1", "sauce-plant-v1", "new-future-twin"]))
      .toEqual(["water-network-scale-v1", "sauce-plant-v1"]);
  });

  it("restricts visible twins to the supplied catalog and deduplicates", () => {
    const duplicate: AccessPrincipal = {
      ...viewer,
      assignments: [...viewer.assignments, viewer.assignments[0]!],
    };
    expect(visibleTwinIds(duplicate, ["water-network-scale-v1"])).toEqual(["water-network-scale-v1"]);
  });

  it("gives approved global viewers read-only access to current and future catalog twins", () => {
    const approved: AccessPrincipal = { subject: "auth0|approved", administrator: false, globalViewOnly: true, assignments: [] };
    const catalog = ["water-network-scale-v1", "new-future-twin"];
    expect(hasTwinPermission(approved, "new-future-twin", "view")).toBe(true);
    expect(hasTwinPermission(approved, "new-future-twin", "saved_studies.read")).toBe(false);
    expect(hasTwinPermission(approved, "new-future-twin", "saved_studies.create")).toBe(false);
    expect(visibleTwinIds(approved, catalog)).toEqual(catalog);
  });

  it("grants the administrator global access without creating implicit user assignments", () => {
    const admin: AccessPrincipal = { subject: "admin-sub", administrator: true, assignments: [] };
    expect(hasTwinPermission(admin, "any-twin", "saved_studies.edit")).toBe(true);
    expect(visibleTwinIds(admin, ["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("defaults assigned resellers to read-only while clients receive no implicit permissions", () => {
    expect(defaultPermissionsForViewer("reseller")).toEqual(["view", "saved_studies.read"]);
    expect(defaultPermissionsForViewer("client")).toEqual(["view"]);
  });

  it("validates permission assignment data and removes duplicate permissions", () => {
    expect(normalizeAssignment(" water-network-scale-v1 ", ["view", "view", "saved_studies.edit"])).toEqual({
      twinId: "water-network-scale-v1",
      permissions: ["view", "saved_studies.edit"],
    });
    expect(normalizeAssignment("water-network-scale-v1", ["manage_users"])).toBeNull();
    expect(normalizeAssignment("", ["view"])).toBeNull();
    expect(normalizeAssignment("twin", "view")).toBeNull();
  });

  it("denies an empty subject even if an assignment exists", () => {
    expect(hasTwinPermission({ ...viewer, subject: "" }, "water-network-scale-v1", "view")).toBe(false);
  });
});
