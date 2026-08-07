const runtime = {
  root: null,
  enabled: false,
  publicUrl: "",
  gatewayUrl: "",
  groups: [],
  servers: [],
  organizations: [],
  collections: [],
  expandedCollections: new Set(),
  organizationFilter: "all",
  configurationKey: "",
  phase: "loading",
  userEmail: "",
  idleTimeoutMinutes: 10,
  items: [],
  selectedId: "",
  detail: null,
  query: "",
  error: "",
  busy: false,
  passwordVisible: false
};

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value == null ? "" : String(value);
  return node.innerHTML;
}

function isSecurePanel() {
  return window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

async function serverwatchTicket() {
  const response = await fetch("/api/vault/ticket", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Falha ao autorizar o acesso ao cofre.");
  return payload;
}

async function gateway(path, options = {}) {
  const authorization = await serverwatchTicket();
  const base = String(authorization.gatewayUrl || runtime.gatewayUrl).replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: "omit",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${authorization.ticket}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Falha ao comunicar com o gateway do cofre.");
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

function icon(name) {
  const paths = {
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    copy: '<rect x="8" y="8" width="10" height="10" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
    collection: '<path d="M4 9h16v10H4z"/><path d="M7 9V6h10v3M8 13h8M8 16h5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function setBusy(value) {
  runtime.busy = value;
  runtime.root?.querySelectorAll("button, input, select, textarea").forEach((control) => {
    if (value) control.dataset.vaultWasDisabled = control.disabled ? "1" : "0";
    control.disabled = value || control.dataset.vaultWasDisabled === "1";
    if (!value) delete control.dataset.vaultWasDisabled;
  });
}

function toast(message, type = "success") {
  const current = runtime.root?.querySelector(".vault-inline-toast");
  current?.remove();
  const node = document.createElement("div");
  node.className = `vault-inline-toast ${type}`;
  node.textContent = message;
  runtime.root?.append(node);
  setTimeout(() => node.remove(), 3200);
}

function renderGate(title, description, body = "") {
  runtime.root.innerHTML = `
    <section class="vault-access-gate">
      <div class="vault-access-mark">${icon("lock")}</div>
      <div class="vault-access-copy"><span class="eyebrow">Sessao protegida</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>
      ${body}
    </section>`;
}

function renderUnlinked() {
  renderGate(
    "Vincule sua conta do Vaultwarden",
    "A vinculacao e individual. As chaves e a senha mestra seguem diretamente para o gateway seguro e nunca passam pelo banco do ServerWatch.",
    `<form class="vault-access-form" id="vaultConnectForm" autocomplete="off">
      <label>Client ID<input name="clientId" required autocomplete="off" spellcheck="false" placeholder="user.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /><small class="vault-field-help">Use a chave pessoal em Configuracoes &gt; Seguranca &gt; Chaves. O ID deve iniciar com user.</small></label>
      <label>Client Secret<input name="clientSecret" type="password" required autocomplete="new-password" /></label>
      <label class="vault-form-wide">Senha mestra<input name="masterPassword" type="password" required autocomplete="current-password" /></label>
      <button class="primary-button vault-form-wide" type="submit">Vincular e desbloquear</button>
    </form>`
  );
  runtime.root.querySelector("#vaultConnectForm")?.addEventListener("submit", connectAccount);
}

function renderLocked() {
  renderGate(
    "Cofre bloqueado",
    `A conta ${runtime.userEmail || "vinculada"} esta protegida. Desbloqueie por ate ${runtime.idleTimeoutMinutes} minutos de inatividade.`,
    `<form class="vault-unlock-form" id="vaultUnlockForm" autocomplete="off">
      <label>Senha mestra<input name="masterPassword" type="password" required autofocus autocomplete="current-password" /></label>
      <button class="primary-button" type="submit">Desbloquear cofre</button>
    </form>`
  );
  runtime.root.querySelector("#vaultUnlockForm")?.addEventListener("submit", unlockAccount);
}

function renderError() {
  renderGate(
    "Nao foi possivel abrir o cofre",
    runtime.error || "O gateway seguro nao respondeu.",
    '<div class="dialog-actions"><button class="primary-button" id="vaultRetry" type="button">Tentar novamente</button><button class="ghost-button" data-vault-configure type="button">Abrir Integracoes</button></div>'
  );
  runtime.root.querySelector("#vaultRetry")?.addEventListener("click", initialize);
  runtime.root.querySelector("[data-vault-configure]")?.addEventListener("click", () => document.querySelector('[data-view-link="integrations"]')?.click());
}

function visibleItems() {
  const query = runtime.query.trim().toLocaleLowerCase("pt-BR");
  return runtime.items.filter((item) => {
    if (runtime.organizationFilter === "personal" && item.organizationId) return false;
    if (!["all", "personal"].includes(runtime.organizationFilter) && item.organizationId !== runtime.organizationFilter) return false;
    return !query || `${item.name} ${item.username} ${item.company} ${item.server} ${item.uri} ${item.organization} ${(item.collections || []).join(" ")}`.toLocaleLowerCase("pt-BR").includes(query);
  });
}

function itemRows() {
  const items = visibleItems();
  if (!items.length) return '<div class="vault-empty-list"><strong>Nenhuma credencial encontrada</strong><span>Ajuste a busca ou cadastre uma nova credencial.</span></div>';
  const buckets = new Map(runtime.organizations.map((entry) => [entry.id, { id: entry.id, label: entry.name, items: [] }]));
  buckets.set("personal", { id: "personal", label: "Meu cofre", items: [] });
  items.forEach((item) => buckets.get(item.organizationId || "personal")?.items.push(item));
  return [...buckets.values()].filter((bucket) => bucket.items.length).sort((a, b) => {
    if (a.id === "personal") return -1;
    if (b.id === "personal") return 1;
    return a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });
  }).map((bucket) => `
    <section class="vault-item-group">
      <div class="vault-item-group-heading"><strong>${escapeHtml(bucket.label)}</strong><span>${bucket.items.length}</span></div>
      ${bucket.id === "personal" ? credentialRows(bucket.items) : collectionTreeMarkup(bucket.id, bucket.items)}
    </section>`).join("");
}

function credentialRows(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).map((item) => `
    <button class="vault-item-row${item.id === runtime.selectedId ? " is-selected" : ""}" type="button" data-vault-item="${escapeHtml(item.id)}">
      <span class="vault-item-symbol">${icon("key")}</span>
      <span class="vault-item-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.company || "Sem empresa")}${item.server ? ` · ${escapeHtml(item.server)}` : ""}${item.collections?.length ? ` · ${escapeHtml(item.collections.join(", "))}` : ""}</small></span>
      <span class="vault-item-user">${escapeHtml(item.username || "Sem usuario")}</span>
    </button>`).join("");
}

function collectionForest(organizationId, items) {
  const source = runtime.collections.filter((entry) => entry.organizationId === organizationId);
  const nodes = new Map(source.map((entry) => [entry.id, {
    id: entry.id,
    key: entry.id,
    name: String(entry.name || "Colecao").split(/[\\/]/).filter(Boolean).at(-1) || "Colecao",
    fullName: entry.name || "Colecao",
    parentId: entry.parentId || "",
    children: [],
    items: []
  }]));
  const roots = [];
  const paths = new Map();
  source.forEach((entry) => paths.set(String(entry.name || "").toLocaleLowerCase("pt-BR"), nodes.get(entry.id)));
  source.forEach((entry) => {
    const node = nodes.get(entry.id);
    const parts = String(entry.name || "").split(/[\\/]/).map((part) => part.trim()).filter(Boolean);
    const parentPath = parts.slice(0, -1).join("/").toLocaleLowerCase("pt-BR");
    const parent = nodes.get(entry.parentId) || paths.get(parentPath);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  });
  items.forEach((item) => (item.collectionIds || []).forEach((id) => nodes.get(id)?.items.push(item)));
  const sortNodes = (entries) => entries.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })).forEach((node) => sortNodes(node.children));
  sortNodes(roots);
  return roots;
}

function collectionNodeCount(node) {
  const ids = new Set(node.items.map((item) => item.id));
  node.children.forEach((child) => collectionNodeItems(child).forEach((item) => ids.add(item.id)));
  return ids.size;
}

function collectionNodeItems(node) {
  return [...node.items, ...node.children.flatMap(collectionNodeItems)];
}

function collectionNodeMarkup(node, depth = 0) {
  const expanded = runtime.query.trim() || runtime.expandedCollections.has(node.key);
  const count = collectionNodeCount(node);
  return `<div class="vault-collection-node" style="--vault-tree-depth:${depth}">
    <button class="vault-collection-row" type="button" data-vault-collection="${escapeHtml(node.key)}" aria-expanded="${Boolean(expanded)}">
      <span class="vault-collection-chevron">${icon("chevron")}</span>
      <span class="vault-collection-icon">${icon("collection")}</span>
      <span class="vault-collection-name">${escapeHtml(node.name)}</span>
      <span class="vault-collection-count">${count}</span>
    </button>
    <div class="vault-collection-content"${expanded ? "" : " hidden"}>
      ${node.children.map((child) => collectionNodeMarkup(child, depth + 1)).join("")}
      ${credentialRows(node.items)}
    </div>
  </div>`;
}

function collectionTreeMarkup(organizationId, items) {
  const roots = collectionForest(organizationId, items);
  const knownCollections = new Set(runtime.collections
    .filter((entry) => entry.organizationId === organizationId)
    .map((entry) => entry.id));
  const unassigned = items.filter((item) => !(item.collectionIds || []).some((id) => knownCollections.has(id)));
  const unassignedNode = unassigned.length ? [{ id: `unassigned:${organizationId}`, key: `unassigned:${organizationId}`, name: "Nao atribuido", children: [], items: unassigned }] : [];
  const nodes = [...roots, ...unassignedNode];
  return nodes.length ? nodes.map((node) => collectionNodeMarkup(node)).join("") : credentialRows(items);
}

function organizationFilterOptions() {
  return [
    '<option value="all">Todos os grupos</option>',
    '<option value="personal">Meu cofre</option>',
    ...runtime.organizations.map((entry) => `<option value="${escapeHtml(entry.id)}"${runtime.organizationFilter === entry.id ? " selected" : ""}>${escapeHtml(entry.name)}</option>`)
  ].join("");
}

function detailMarkup() {
  const item = runtime.detail;
  if (!runtime.selectedId) return '<div class="vault-detail-empty"><div class="vault-detail-empty-icon">' + icon("key") + '</div><strong>Selecione uma credencial</strong><span>Os dados sensiveis so sao solicitados quando voce abre um item.</span></div>';
  if (!item || item.id !== runtime.selectedId) return '<div class="vault-detail-empty"><span class="vault-loading-line"></span><span class="vault-loading-line short"></span></div>';
  const password = runtime.passwordVisible ? item.password || "Sem senha" : "••••••••••••";
  return `
    <div class="vault-detail-header">
      <div><span class="eyebrow">${escapeHtml(item.organization || "Meu cofre")}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.company || "Sem empresa")}${item.server ? ` · ${escapeHtml(item.server)}` : ""}${item.collections?.length ? ` · ${escapeHtml(item.collections.join(", "))}` : ""}</p></div>
      <div class="vault-icon-actions">
        <button class="icon-button" data-vault-edit type="button" title="Editar credencial">${icon("edit")}</button>
        <button class="icon-button danger" data-vault-delete type="button" title="Excluir credencial">${icon("trash")}</button>
      </div>
    </div>
    <dl class="vault-secret-fields">
      <div><dt>Usuario</dt><dd><span>${escapeHtml(item.username || "Nao informado")}</span><button class="icon-button" data-vault-copy="username" type="button" title="Copiar usuario">${icon("copy")}</button></dd></div>
      <div><dt>Senha</dt><dd><span class="vault-password-value">${escapeHtml(password)}</span><button class="icon-button" data-vault-reveal type="button" title="${runtime.passwordVisible ? "Ocultar" : "Mostrar"} senha">${icon("eye")}</button><button class="icon-button" data-vault-copy="password" type="button" title="Copiar senha">${icon("copy")}</button></dd></div>
      ${item.uri ? `<div><dt>Endereco</dt><dd><a href="${escapeHtml(item.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.uri)}</a><button class="icon-button" data-vault-copy="uri" type="button" title="Copiar endereco">${icon("copy")}</button></dd></div>` : ""}
    </dl>
    ${item.notes ? `<section class="vault-notes"><span class="eyebrow">Observacoes</span><p>${escapeHtml(item.notes)}</p></section>` : ""}
    ${item.fields?.length ? `<section class="vault-custom-fields"><span class="eyebrow">Campos adicionais</span>${item.fields.map((field) => `<div><strong>${escapeHtml(field.name)}</strong><span>${escapeHtml(field.value)}</span></div>`).join("")}</section>` : ""}
    <div class="vault-detail-footer"><span>Atualizado em ${item.revisionDate ? new Date(item.revisionDate).toLocaleString("pt-BR") : "data indisponivel"}</span><a href="${escapeHtml(runtime.publicUrl)}/#/vault" target="_blank" rel="noopener noreferrer">Abrir Vaultwarden ${icon("external")}</a></div>`;
}

function renderWorkspace({ preserveFocus = false } = {}) {
  const activeId = preserveFocus ? document.activeElement?.id : "";
  const selection = preserveFocus && document.activeElement?.selectionStart != null
    ? [document.activeElement.selectionStart, document.activeElement.selectionEnd]
    : null;
  runtime.root.innerHTML = `
    <section class="vault-native-shell">
      <header class="vault-native-toolbar">
        <label class="vault-native-search">${icon("search")}<span class="sr-only">Buscar credencial</span><input id="vaultSearch" type="search" value="${escapeHtml(runtime.query)}" placeholder="Buscar credencial, empresa ou servidor" autocomplete="off" /></label>
        <label class="vault-group-filter"><span class="sr-only">Filtrar grupo do cofre</span><select id="vaultOrganizationFilter">${organizationFilterOptions()}</select></label>
        <div class="vault-session-meta"><span class="vault-secure-dot"></span><span>${escapeHtml(runtime.userEmail || "Cofre desbloqueado")}</span></div>
        <div class="vault-toolbar-actions"><button class="ghost-button compact" data-vault-sync type="button">${icon("refresh")} Atualizar</button><button class="primary-button compact" data-vault-new type="button">${icon("plus")} Nova credencial</button><button class="icon-button" data-vault-lock type="button" title="Bloquear cofre">${icon("lock")}</button></div>
      </header>
      <div class="vault-native-body">
        <aside class="vault-item-browser"><div class="vault-list-heading"><strong>Credenciais</strong><span>${visibleItems().length} itens</span></div><div class="vault-item-list">${itemRows()}</div></aside>
        <section class="vault-item-detail">${detailMarkup()}</section>
      </div>
    </section>`;
  bindWorkspace();
  if (activeId) {
    const target = runtime.root.querySelector(`#${CSS.escape(activeId)}`);
    target?.focus();
    if (selection && target?.setSelectionRange) target.setSelectionRange(...selection);
  }
}

function bindWorkspace() {
  runtime.root.querySelector("#vaultSearch")?.addEventListener("input", (event) => {
    runtime.query = event.currentTarget.value;
    renderWorkspace({ preserveFocus: true });
  });
  runtime.root.querySelector("#vaultOrganizationFilter")?.addEventListener("change", (event) => {
    runtime.organizationFilter = event.currentTarget.value;
    renderWorkspace();
  });
  runtime.root.querySelectorAll("[data-vault-item]").forEach((button) => button.addEventListener("click", () => selectItem(button.dataset.vaultItem)));
  runtime.root.querySelectorAll("[data-vault-collection]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.vaultCollection;
    if (runtime.expandedCollections.has(key)) runtime.expandedCollections.delete(key);
    else runtime.expandedCollections.add(key);
    renderWorkspace();
  }));
  runtime.root.querySelector("[data-vault-sync]")?.addEventListener("click", () => loadItems(true));
  runtime.root.querySelector("[data-vault-new]")?.addEventListener("click", () => openEditor());
  runtime.root.querySelector("[data-vault-lock]")?.addEventListener("click", lockAccount);
  runtime.root.querySelector("[data-vault-edit]")?.addEventListener("click", () => openEditor(runtime.detail));
  runtime.root.querySelector("[data-vault-delete]")?.addEventListener("click", deleteItem);
  runtime.root.querySelector("[data-vault-reveal]")?.addEventListener("click", () => {
    runtime.passwordVisible = !runtime.passwordVisible;
    renderWorkspace();
  });
  runtime.root.querySelectorAll("[data-vault-copy]").forEach((button) => button.addEventListener("click", () => copyField(button.dataset.vaultCopy)));
}

async function connectAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.clientId = String(values.clientId || "").trim();
  if (/^organization\./i.test(values.clientId)) {
    toast("Esta chave pertence a organizacao. Use a API key pessoal da sua conta, com Client ID de prefixo user.", "error");
    form.elements.clientId?.focus();
    return;
  }
  if (!/^user\./i.test(values.clientId)) {
    toast("O Client ID da API key pessoal deve possuir o prefixo user.", "error");
    form.elements.clientId?.focus();
    return;
  }
  setBusy(true);
  try {
    const result = await gateway("/connect", { method: "POST", body: JSON.stringify(values) });
    form.reset();
    runtime.phase = "unlocked";
    runtime.userEmail = result.userEmail || "";
    await loadItems(true);
  } catch (error) {
    setBusy(false);
    if (form.elements.masterPassword) form.elements.masterPassword.value = "";
    toast(error.message, "error");
  }
}

async function unlockAccount(event) {
  event.preventDefault();
  const masterPassword = new FormData(event.currentTarget).get("masterPassword");
  event.currentTarget.reset();
  setBusy(true);
  try {
    const result = await gateway("/unlock", { method: "POST", body: JSON.stringify({ masterPassword }) });
    runtime.phase = "unlocked";
    runtime.userEmail = result.userEmail || runtime.userEmail;
    await loadItems(false);
    if (result.syncWarning) toast("Cofre aberto com os dados locais. A sincronizacao sera tentada novamente.", "error");
  } catch (error) {
    setBusy(false);
    toast(error.message, "error");
  }
}

async function lockAccount() {
  try { await gateway("/lock", { method: "POST" }); } catch {}
  runtime.detail = null;
  runtime.items = [];
  runtime.selectedId = "";
  runtime.passwordVisible = false;
  runtime.phase = "locked";
  renderLocked();
}

async function loadItems(force = false) {
  try {
    setBusy(true);
    if (force) await gateway("/sync", { method: "POST" });
    const result = await gateway("/items");
    runtime.items = result.items || [];
    runtime.organizations = result.organizations || [];
    runtime.collections = result.collections || [];
    const requestedServer = new URLSearchParams(window.location.search).get("server");
    if (requestedServer && !runtime.selectedId) runtime.selectedId = runtime.items.find((item) => item.serverId === requestedServer)?.id || "";
    if (runtime.selectedId && !runtime.items.some((item) => item.id === runtime.selectedId)) runtime.selectedId = "";
    runtime.phase = "unlocked";
    renderWorkspace();
    if (runtime.selectedId) await selectItem(runtime.selectedId);
  } catch (error) {
    if (error.status === 423) {
      runtime.phase = "locked";
      renderLocked();
    } else {
      runtime.error = error.message;
      runtime.phase = "error";
      renderError();
    }
  } finally {
    setBusy(false);
  }
}

async function selectItem(itemId) {
  runtime.selectedId = itemId;
  runtime.detail = null;
  runtime.passwordVisible = false;
  renderWorkspace();
  try {
    const result = await gateway(`/items/${encodeURIComponent(itemId)}`);
    if (runtime.selectedId !== itemId) return;
    runtime.detail = result.item;
    renderWorkspace();
  } catch (error) {
    if (error.status === 423) return lockAccount();
    toast(error.message, "error");
  }
}

async function copyField(field) {
  const value = runtime.detail?.[field] || "";
  if (!value) return toast("Este campo esta vazio.", "error");
  try {
    await navigator.clipboard.writeText(value);
    toast(field === "password" ? "Senha copiada." : "Campo copiado.");
  } catch {
    toast("O navegador bloqueou a copia.", "error");
  }
}

function groupOptions(selected = "") {
  return ['<option value="">Sem empresa</option>', ...runtime.groups.map((group) => `<option value="${escapeHtml(group.id)}"${group.id === selected ? " selected" : ""}>${escapeHtml(group.name)}</option>`)].join("");
}

function serverOptions(groupId, selected = "") {
  return ['<option value="">Sem servidor vinculado</option>', ...runtime.servers.filter((server) => !groupId || server.groupId === groupId).map((server) => `<option value="${escapeHtml(server.id)}"${server.id === selected ? " selected" : ""}>${escapeHtml(server.name)}</option>`)].join("");
}

function organizationOptions(selected = "") {
  return ['<option value="">Meu cofre pessoal</option>', ...runtime.organizations.map((entry) => `<option value="${escapeHtml(entry.id)}"${entry.id === selected ? " selected" : ""}>${escapeHtml(entry.name)}</option>`)].join("");
}

function collectionOptions(organizationId, selectedIds = []) {
  const selected = new Set(selectedIds || []);
  const available = runtime.collections.filter((entry) => entry.organizationId === organizationId).sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR", { sensitivity: "base" }));
  if (!organizationId) return '<option value="">Nenhuma colecao</option>';
  return ['<option value="">Selecione uma colecao</option>', ...available.map((entry) => {
    const depth = Math.max(0, String(entry.name || "").split(/[\\/]/).filter(Boolean).length - 1);
    return `<option value="${escapeHtml(entry.id)}"${selected.has(entry.id) ? " selected" : ""}>${"— ".repeat(depth)}${escapeHtml(entry.name)}</option>`;
  })].join("");
}

function openEditor(item = null) {
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog vault-editor-dialog";
  const groupId = item?.companyId || "";
  const requestedServerId = new URLSearchParams(window.location.search).get("server") || "";
  const initialServerId = item?.serverId || requestedServerId;
  const initialServer = runtime.servers.find((server) => server.id === initialServerId);
  const initialGroupId = groupId || initialServer?.groupId || "";
  const organizationLocked = Boolean(item?.organizationId);
  dialog.innerHTML = `
    <form class="dialog-form vault-editor-form" method="dialog" id="vaultEditorForm" autocomplete="off">
      <div class="dialog-heading"><div><span class="eyebrow">Cofre</span><h2>${item ? "Editar credencial" : "Nova credencial"}</h2></div><button class="icon-button" value="cancel" type="submit" title="Fechar">×</button></div>
      <div class="vault-editor-grid">
        <label class="vault-form-wide">Nome da credencial<input name="name" required value="${escapeHtml(item?.name || "")}" /></label>
        <label>Grupo do Vaultwarden<select name="organizationId" id="vaultEditorOrganization"${organizationLocked ? " disabled" : ""}>${organizationOptions(item?.organizationId || "")}</select>${organizationLocked ? `<input type="hidden" name="organizationId" value="${escapeHtml(item.organizationId)}" />` : ""}<small class="vault-field-help">Organizacao que controla o compartilhamento e as permissoes.</small></label>
        <label>Colecao<select name="collectionId" id="vaultEditorCollection">${collectionOptions(item?.organizationId || "", item?.collectionIds || [])}</select><small class="vault-field-help">Use uma colecao por cliente ou equipe.</small></label>
        <label>Empresa no ServerWatch<select name="companyId" id="vaultEditorCompany">${groupOptions(initialGroupId)}</select></label>
        <label>Servidor vinculado<select name="serverId" id="vaultEditorServer">${serverOptions(initialGroupId, initialServerId)}</select></label>
        <label>Usuario<input name="username" autocomplete="off" value="${escapeHtml(item?.username || "")}" /></label>
        <label>Senha<div class="vault-password-editor"><input name="password" id="vaultEditorPassword" type="password" autocomplete="new-password" value="${escapeHtml(item?.password || "")}" /><button class="ghost-button compact" id="vaultGeneratePassword" type="button">Gerar</button></div></label>
        <label class="vault-form-wide">Endereco<input name="uri" type="url" value="${escapeHtml(item?.uri || "")}" placeholder="https://..." /></label>
        <label class="vault-form-wide">Observacoes<textarea name="notes" rows="4">${escapeHtml(item?.notes || "")}</textarea></label>
      </div>
      <div class="dialog-actions"><button class="ghost-button" value="cancel" type="submit">Cancelar</button><button class="primary-button" id="vaultSaveItem" type="button">Salvar credencial</button></div>
    </form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.querySelector("#vaultEditorCompany")?.addEventListener("change", (event) => {
    dialog.querySelector("#vaultEditorServer").innerHTML = serverOptions(event.currentTarget.value);
  });
  dialog.querySelector("#vaultEditorOrganization")?.addEventListener("change", (event) => {
    dialog.querySelector("#vaultEditorCollection").innerHTML = collectionOptions(event.currentTarget.value);
  });
  dialog.querySelector("#vaultGeneratePassword")?.addEventListener("click", async () => {
    try {
      const result = await gateway("/generate-password", { method: "POST", body: JSON.stringify({ length: 24 }) });
      const input = dialog.querySelector("#vaultEditorPassword");
      input.type = "text";
      input.value = result.password;
      input.focus();
    } catch (error) { toast(error.message, "error"); }
  });
  dialog.querySelector("#vaultSaveItem")?.addEventListener("click", () => saveItem(dialog, item));
  dialog.showModal();
}

async function saveItem(dialog, current) {
  const form = dialog.querySelector("#vaultEditorForm");
  dialog.querySelector(".vault-editor-error")?.remove();
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  values.collectionIds = values.collectionId ? [values.collectionId] : [];
  delete values.collectionId;
  if (values.organizationId && !values.collectionIds.length) {
    toast("Selecione uma colecao para compartilhar a credencial com o grupo.", "error");
    form.elements.collectionId?.focus();
    return;
  }
  const group = runtime.groups.find((item) => item.id === values.companyId);
  const server = runtime.servers.find((item) => item.id === values.serverId);
  values.company = group?.name || "";
  values.server = server?.name || "";
  const button = dialog.querySelector("#vaultSaveItem");
  button.disabled = true;
  const previousLabel = button.textContent;
  button.textContent = "Salvando...";
  try {
    const path = current ? `/items/${encodeURIComponent(current.id)}` : "/items";
    const result = await gateway(path, { method: current ? "PUT" : "POST", body: JSON.stringify(values) });
    dialog.close();
    runtime.selectedId = result.item.id;
    runtime.detail = result.item;
    await loadItems();
    toast(current ? "Credencial atualizada." : "Credencial criada.");
  } catch (error) {
    button.disabled = false;
    button.textContent = previousLabel;
    const message = document.createElement("div");
    message.className = "vault-editor-error";
    message.setAttribute("role", "alert");
    message.textContent = error.message;
    form.querySelector(".dialog-actions")?.before(message);
  }
}

async function deleteItem() {
  if (!runtime.detail || !window.confirm(`Excluir a credencial "${runtime.detail.name}" do Vaultwarden?`)) return;
  try {
    await gateway(`/items/${encodeURIComponent(runtime.detail.id)}`, { method: "DELETE" });
    runtime.selectedId = "";
    runtime.detail = null;
    await loadItems();
    toast("Credencial excluida.");
  } catch (error) { toast(error.message, "error"); }
}

async function initialize() {
  if (!runtime.enabled) {
    runtime.root.innerHTML = '<div class="vault-client-empty"><strong>Integracao desativada</strong><span>Ative o Vaultwarden em Integracoes para liberar o cofre nativo.</span></div>';
    return;
  }
  if (!isSecurePanel()) {
    renderGate("Acesso seguro necessario", "Abra o ServerWatch pelo endereco HTTPS para desbloquear credenciais. Os probes podem continuar usando a porta 3000.", `<a class="primary-button" href="https://painel.grupoinsideti.com.br/cofre">Abrir painel seguro</a>`);
    return;
  }
  runtime.phase = "loading";
  renderGate("Validando sessao segura", "Aguarde enquanto o ServerWatch verifica o gateway do cofre.", '<span class="vault-gate-progress" aria-hidden="true"></span>');
  try {
    const result = await gateway("/status");
    runtime.userEmail = result.userEmail || "";
    runtime.idleTimeoutMinutes = result.idleTimeoutMinutes || 10;
    runtime.phase = result.state;
    if (result.state === "unlocked") await loadItems();
    else if (result.state === "locked") renderLocked();
    else renderUnlinked();
  } catch (error) {
    runtime.error = error.message;
    runtime.phase = "error";
    renderError();
  }
}

export function renderVaultClient(root, options = {}) {
  if (!root) return;
  const next = {
    enabled: options.enabled === true,
    publicUrl: String(options.publicUrl || "").replace(/\/+$/, ""),
    gatewayUrl: String(options.gatewayUrl || "").replace(/\/+$/, ""),
    groups: Array.isArray(options.groups) ? options.groups : [],
    servers: Array.isArray(options.servers) ? options.servers : []
  };
  const configurationKey = JSON.stringify([next.enabled, next.publicUrl, next.gatewayUrl]);
  const changed = runtime.root !== root || runtime.configurationKey !== configurationKey;
  runtime.root = root;
  runtime.enabled = next.enabled;
  runtime.publicUrl = next.publicUrl;
  runtime.gatewayUrl = next.gatewayUrl;
  runtime.groups = next.groups;
  runtime.servers = next.servers;
  runtime.configurationKey = configurationKey;
  if (changed || !root.firstElementChild) initialize();
}
