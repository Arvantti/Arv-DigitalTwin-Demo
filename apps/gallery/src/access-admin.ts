import "./access-admin.css";
import { defaultPermissionsForViewer, TWIN_PERMISSIONS, type TwinPermission, type ViewerAccountType } from "@twin/access-core";

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
const inviteForm = document.querySelector<HTMLFormElement>("#invite-form")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-users")!;

function status(message: string, kind: "info" | "error" | "success" = "info"): void {
  statusNode.textContent = message;
  statusNode.className = `access-status${kind === "info" ? "" : ` ${kind}`}`;
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

async function savePermissions(user: ManagedUser, twinId: string, permissions: TwinPermission[]): Promise<void> {
  const path = `/admin/users/${encodeURIComponent(user.subject)}/twins/${encodeURIComponent(twinId)}`;
  await api(path, { method: "PUT", body: JSON.stringify({ permissions }) });
  status(`Permisos actualizados para ${user.email} · ${twinId}.`, "success");
  await loadUsers();
}

function renderUsers(data: UserList): void {
  usersList.replaceChildren();
  if (!data.users.length) {
    const empty = document.createElement("p");
    empty.className = "access-empty";
    empty.textContent = "Aún no hay cuentas administradas. Invita a la primera persona arriba.";
    usersList.append(empty);
    return;
  }

  for (const user of data.users) {
    const card = document.createElement("article");
    card.className = "access-user";
    const header = document.createElement("div");
    header.className = "access-user-head";
    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = user.name || user.email;
    const meta = document.createElement("p");
    meta.className = "access-user-meta";
    const state = user.status === "suspended" || user.blocked ? "Suspendido" : "Activo";
    meta.textContent = `${user.email} · ${user.account_type === "reseller" ? "Reseller" : "Cliente"} · ${state}${user.email_verified ? " · correo verificado" : " · correo pendiente de verificación"}`;
    info.append(title, meta);
    const toggle = createButton(user.status === "suspended" || user.blocked ? "Reactivar" : "Suspender", async () => {
      toggle.disabled = true;
      try {
        const next = user.status === "suspended" || user.blocked ? "active" : "suspended";
        await api(`/admin/users/${encodeURIComponent(user.subject)}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
        status(`Cuenta ${next === "active" ? "reactivada" : "suspendida"}: ${user.email}.`, "success");
        await loadUsers();
      } catch (error) {
        status(error instanceof Error ? error.message : "No se pudo actualizar la cuenta.", "error");
        toggle.disabled = false;
      }
    }, true);
    const revoke = createButton("Quitar todos los gemelos", async () => {
      revoke.disabled = true;
      try {
        await api(`/admin/users/${encodeURIComponent(user.subject)}/access`, { method: "DELETE" });
        status(`Accesos retirados para ${user.email}. La cuenta se conserva para auditoría.`, "success");
        await loadUsers();
      } catch (error) {
        status(error instanceof Error ? error.message : "No se pudieron retirar los accesos.", "error");
        revoke.disabled = false;
      }
    }, true);
    const passwordReset = createButton("Enviar enlace para cambiar contraseña", async () => {
      passwordReset.disabled = true;
      try {
        await api(`/admin/users/${encodeURIComponent(user.subject)}/password-reset`, { method: "POST", body: "{}" });
        status(`Enlace de cambio de contraseña enviado a ${user.email}. La contraseña no se muestra ni se guarda aquí.`, "success");
      } catch (error) {
        status(error instanceof Error ? error.message : "No se pudo enviar el enlace de cambio de contraseña.", "error");
      } finally {
        passwordReset.disabled = false;
      }
    }, true);
    header.append(info, passwordReset, toggle, revoke);
    card.append(header);

    const grid = document.createElement("div");
    grid.className = "access-twin-grid";
    for (const twinId of data.twins) {
      const panel = document.createElement("section");
      panel.className = "access-twin";
      const heading = document.createElement("h4");
      heading.textContent = twinId;
      panel.append(heading);
      const granted = user.grants[twinId] ?? [];
      const assigned = granted.length > 0;
      if (!assigned) {
        const assign = createButton("Asignar acceso de visualización", async () => {
          assign.disabled = true;
          try {
            await savePermissions(user, twinId, defaultPermissionsForViewer(user.account_type ?? "client"));
          } catch (error) {
            status(error instanceof Error ? error.message : "No se pudo asignar el gemelo.", "error");
            assign.disabled = false;
          }
        }, true);
        panel.append(assign);
      } else {
        for (const permission of TWIN_PERMISSIONS) {
          const label = document.createElement("label");
          label.className = "access-grant";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = granted.includes(permission);
          const permissionLabel: Record<TwinPermission, string> = {
            view: "Ver gemelo",
            "saved_studies.read": "Leer escenarios guardados",
            "saved_studies.create": "Crear escenarios",
            "saved_studies.edit": "Editar escenarios",
          };
          label.append(checkbox, document.createTextNode(permissionLabel[permission]));
          checkbox.addEventListener("change", async () => {
            checkbox.disabled = true;
            const next = new Set(granted);
            if (checkbox.checked) next.add(permission);
            else next.delete(permission);
            try {
              await savePermissions(user, twinId, [...next]);
            } catch (error) {
              checkbox.checked = !checkbox.checked;
              checkbox.disabled = false;
              status(error instanceof Error ? error.message : "No se pudieron actualizar los permisos.", "error");
            }
          });
          panel.append(label);
        }
      }
      grid.append(panel);
    }
    card.append(grid);
    usersList.append(card);
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

refreshButton.addEventListener("click", () => void loadUsers());
void initialize();
