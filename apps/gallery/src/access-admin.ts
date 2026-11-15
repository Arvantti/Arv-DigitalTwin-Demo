import "./access-admin.css";
import { TWIN_PERMISSIONS, type TwinPermission, type ViewerAccountType } from "@twin/access-core";

type ManagedUser = {
  subject: string;
  email: string;
  name: string;
  email_verified: boolean;
  blocked: boolean;
  account_type: ViewerAccountType | null;
  status: "active" | "suspended";
  grants: Record<string, TwinPermission[]>;
};
type UserList = { users: ManagedUser[]; twins: string[] };

const apiBase = import.meta.env.PROD
  ? "/api/access"
  : import.meta.env.VITE_ACCESS_CONTROL_API_URL?.trim().replace(/\/$/, "") ?? "";
const statusNode = document.querySelector<HTMLElement>("#access-status")!;
const invitePanel = document.querySelector<HTMLElement>("#invite-panel")!;
const usersPanel = document.querySelector<HTMLElement>("#users-panel")!;
const usersList = document.querySelector<HTMLElement>("#users-list")!;
const usersCount = document.querySelector<HTMLElement>("#users-count")!;
const userSearch = document.querySelector<HTMLInputElement>("#user-search")!;
const inviteForm = document.querySelector<HTMLFormElement>("#invite-form")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-users")!;
const permissionsDialog = document.querySelector<HTMLDialogElement>("#permissions-dialog")!;
const dialogTitle = document.querySelector<HTMLElement>("#permissions-dialog-title")!;
const dialogMeta = document.querySelector<HTMLElement>("#permissions-dialog-meta")!;
const permissionsGrid = document.querySelector<HTMLElement>("#permissions-grid")!;
const dialogStatus = document.querySelector<HTMLElement>("#permissions-dialog-status")!;
const dialogActions = document.querySelector<HTMLElement>("#permissions-dialog-actions")!;
const closeDialogButton = document.querySelector<HTMLButtonElement>("#close-permissions-dialog")!;
const doneDialogButton = document.querySelector<HTMLButtonElement>("#done-permissions-dialog")!;

let loadedUsers: UserList | null = null;

function status(message: string, kind: "info" | "error" | "success" = "info"): void {
  statusNode.textContent = message;
  statusNode.className = `access-status${kind === "info" ? "" : ` ${kind}`}`;
}

function dialogMessage(message: string, kind: "info" | "error" | "success" = "info"): void {
  dialogStatus.textContent = message;
  dialogStatus.className = `access-status${kind === "info" ? "" : ` ${kind}`}`;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBase) throw new Error("La API de control de acceso no está configurada para este sitio.");
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as { detail?: string } & T;
  if (!response.ok) throw new Error(body.detail || `La solicitud falló (${response.status}).`);
  return body;
}

function createButton(label: string, onClick: () => void | Promise<void>, secondary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (secondary) button.className = "secondary";
  button.addEventListener("click", () => void onClick());
  return button;
}

function isSuspended(user: ManagedUser): boolean {
  return user.status === "suspended" || user.blocked;
}

function renderPermissions(user: ManagedUser, twins: string[]): void {
  permissionsGrid.replaceChildren();
  for (const twinId of twins) {
    const panel = document.createElement("section");
    panel.className = "access-twin";
    const heading = document.createElement("h3");
    heading.textContent = twinId;
    panel.append(heading);
    const granted = new Set(user.grants[twinId] ?? []);
    const labels: Record<TwinPermission, string> = {
      view: "Ver gemelo",
      "saved_studies.read": "Leer escenarios guardados",
      "saved_studies.create": "Crear escenarios",
      "saved_studies.edit": "Editar escenarios",
    };
    for (const permission of TWIN_PERMISSIONS) {
      const label = document.createElement("label");
      label.className = "access-grant";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = granted.has(permission);
      checkbox.addEventListener("change", async () => {
        const next = new Set(user.grants[twinId] ?? []);
        if (checkbox.checked) next.add(permission);
        else next.delete(permission);
        const twinInputs = [...panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
        twinInputs.forEach((input) => { input.disabled = true; });
        try {
          await api(`/admin/users/${encodeURIComponent(user.subject)}/twins/${encodeURIComponent(twinId)}`, {
            method: "PUT",
            body: JSON.stringify({ permissions: [...next] }),
          });
          if (next.size) user.grants[twinId] = [...next];
          else delete user.grants[twinId];
          dialogMessage(`Permisos guardados para ${twinId}.`, "success");
        } catch (error) {
          checkbox.checked = !checkbox.checked;
          dialogMessage(error instanceof Error ? error.message : "No se pudieron actualizar los permisos.", "error");
        } finally {
          twinInputs.forEach((input) => { input.disabled = false; });
        }
      });
      label.append(checkbox, document.createTextNode(labels[permission]));
      panel.append(label);
    }
    permissionsGrid.append(panel);
  }
}

function openPermissions(user: ManagedUser, twins: string[]): void {
  dialogTitle.textContent = user.name || user.email;
  dialogMeta.textContent = `${user.email} · ${user.account_type === "reseller" ? "Reseller" : "Cliente"} · ${isSuspended(user) ? "Suspendido" : "Activo"}${user.email_verified ? " · correo verificado" : " · correo pendiente de verificación"}`;
  dialogMessage("Los cambios en las casillas se guardan inmediatamente.");
  renderPermissions(user, twins);

  const resetPassword = createButton("Enviar enlace para cambiar contraseña", async () => {
    resetPassword.disabled = true;
    try {
      await api(`/admin/users/${encodeURIComponent(user.subject)}/password-reset`, { method: "POST", body: "{}" });
      dialogMessage(`Enlace enviado a ${user.email}. La contraseña no se muestra ni se guarda aquí.`, "success");
    } catch (error) {
      dialogMessage(error instanceof Error ? error.message : "No se pudo enviar el enlace de cambio.", "error");
    } finally {
      resetPassword.disabled = false;
    }
  }, true);
  resetPassword.disabled = isSuspended(user);
  if (isSuspended(user)) resetPassword.title = "Reactiva la cuenta antes de solicitar el enlace.";

  const toggle = createButton(isSuspended(user) ? "Reactivar cuenta" : "Suspender cuenta", async () => {
    toggle.disabled = true;
    try {
      const next = isSuspended(user) ? "active" : "suspended";
      await api(`/admin/users/${encodeURIComponent(user.subject)}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      user.status = next;
      user.blocked = next === "suspended";
      toggle.textContent = next === "active" ? "Suspender cuenta" : "Reactivar cuenta";
      resetPassword.disabled = next !== "active";
      dialogMeta.textContent = `${user.email} · ${user.account_type === "reseller" ? "Reseller" : "Cliente"} · ${next === "active" ? "Activo" : "Suspendido"}${user.email_verified ? " · correo verificado" : " · correo pendiente de verificación"}`;
      if (loadedUsers) renderUsers(loadedUsers);
      dialogMessage(`Cuenta ${next === "active" ? "reactivada" : "suspendida"}.`, "success");
    } catch (error) {
      dialogMessage(error instanceof Error ? error.message : "No se pudo actualizar la cuenta.", "error");
    } finally {
      toggle.disabled = false;
    }
  }, true);

  const revoke = createButton("Quitar todos los permisos", async () => {
    if (!window.confirm(`¿Quitar todos los permisos de ${user.email}? La cuenta se conservará.`)) return;
    revoke.disabled = true;
    try {
      await api(`/admin/users/${encodeURIComponent(user.subject)}/access`, { method: "DELETE" });
      user.grants = {};
      renderPermissions(user, twins);
      if (loadedUsers) renderUsers(loadedUsers);
      dialogMessage(`Se retiraron todos los permisos de ${user.email}.`, "success");
    } catch (error) {
      dialogMessage(error instanceof Error ? error.message : "No se pudieron retirar los permisos.", "error");
    } finally {
      revoke.disabled = false;
    }
  }, true);
  revoke.classList.add("danger");
  dialogActions.replaceChildren(resetPassword, toggle, revoke);
  permissionsDialog.showModal();
}

function renderUsers(data: UserList): void {
  loadedUsers = data;
  usersList.replaceChildren();
  const query = userSearch.value.trim().toLocaleLowerCase();
  const matching = data.users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase().includes(query));
  usersCount.textContent = query ? `${matching.length} de ${data.users.length} usuarios` : `${data.users.length} usuarios`;
  if (!data.users.length) {
    const empty = document.createElement("p");
    empty.className = "access-empty";
    empty.textContent = "Aún no hay cuentas administradas. Invita a la primera persona arriba.";
    usersList.append(empty);
    return;
  }
  if (!matching.length) {
    const empty = document.createElement("p");
    empty.className = "access-empty";
    empty.textContent = "No hay usuarios que coincidan con la búsqueda.";
    usersList.append(empty);
    return;
  }

  for (const user of matching) {
    const row = document.createElement("article");
    row.className = "access-user-row";
    const info = document.createElement("div");
    info.className = "access-user-info";
    const title = document.createElement("h3");
    title.textContent = user.name || user.email;
    const meta = document.createElement("p");
    meta.className = "access-user-meta";
    const state = isSuspended(user) ? "Suspendido" : "Activo";
    meta.textContent = `${user.email} · ${user.account_type === "reseller" ? "Reseller" : "Cliente"} · ${state}${user.email_verified ? " · correo verificado" : " · correo pendiente de verificación"}`;
    info.append(title, meta);
    const edit = createButton("Editar permisos", () => openPermissions(user, data.twins));
    row.append(info, edit);
    usersList.append(row);
  }
}

async function loadUsers(): Promise<void> {
  refreshButton.disabled = true;
  try {
    const data = await api<UserList>("/admin/users");
    renderUsers(data);
    status(`${data.users.length} usuarios · ${data.twins.length} gemelos en catálogo.`, "success");
  } catch (error) {
    status(error instanceof Error ? error.message : "No se pudieron cargar los usuarios.", "error");
  } finally {
    refreshButton.disabled = false;
  }
}

async function initialize(): Promise<void> {
  try {
    if (!apiBase) throw new Error("La API de control de acceso aún no está configurada.");
    const me = await api<{ administrator: boolean }>("/v1/me");
    if (!me.administrator) throw new Error("Esta cuenta no tiene permisos de administración.");
    invitePanel.hidden = false;
    usersPanel.hidden = false;
    await loadUsers();
  } catch (error) {
    status(error instanceof Error ? error.message : "No se pudo verificar la sesión.", "error");
  }
}

inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = inviteForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const form = new FormData(inviteForm);
  submit.disabled = true;
  try {
    await api("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), account_type: form.get("account_type") }),
    });
    inviteForm.reset();
    status("Invitación enviada. La cuenta iniciará sin gemelos asignados.", "success");
    await loadUsers();
  } catch (error) {
    status(error instanceof Error ? error.message : "No se pudo enviar la invitación.", "error");
  } finally {
    submit.disabled = false;
  }
});

userSearch.addEventListener("input", () => {
  if (loadedUsers) renderUsers(loadedUsers);
});
refreshButton.addEventListener("click", () => void loadUsers());
closeDialogButton.addEventListener("click", () => permissionsDialog.close());
doneDialogButton.addEventListener("click", () => permissionsDialog.close());
void initialize();
