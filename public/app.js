const state = {
  servers: [],
  groups: [],
  probes: [],
  users: [],
  currentUser: null,
  settings: {},
  events: [],
  alerts: [],
  summary: {},
  selectedServerId: null,
  selectedGroupId: null,
  filters: {
    status: "all",
    environment: "all",
    groupId: "all",
    query: ""
  },
  socket: null,
  reconnectTimer: null,
  notificationsEnabled: false
};

const els = {
  bootScreen: document.querySelector("#bootScreen"),
  authScreen: document.querySelector("#authScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  currentUserName: document.querySelector("#currentUserName"),
  logoutButton: document.querySelector("#logoutButton"),
  metricTotal: document.querySelector("#metricTotal"),
  metricOnline: document.querySelector("#metricOnline"),
  metricOffline: document.querySelector("#metricOffline"),
  metricAvailability: document.querySelector("#metricAvailability"),
  metricAlerts: document.querySelector("#metricAlerts"),
  overviewScope: document.querySelector("#overviewScope"),
  statusDonut: document.querySelector("#statusDonut"),
  statusLegend: document.querySelector("#statusLegend"),
  serverList: document.querySelector("#serverList"),
  serverCount: document.querySelector("#serverCount"),
  detailPanel: document.querySelector("#detailPanel"),
  timeline: document.querySelector("#timeline"),
  eventCount: document.querySelector("#eventCount"),
  alertsList: document.querySelector("#alertsList"),
  toastStack: document.querySelector("#toastStack"),
  searchInput: document.querySelector("#searchInput"),
  environmentFilter: document.querySelector("#environmentFilter"),
  groupFilter: document.querySelector("#groupFilter"),
  companyNav: document.querySelector("#companyNav"),
  groupsList: document.querySelector("#groupsList"),
  groupCount: document.querySelector("#groupCount"),
  usersList: document.querySelector("#usersList"),
  userCount: document.querySelector("#userCount"),
  brandingForm: document.querySelector("#brandingForm"),
  brandNameInput: document.querySelector("#brandNameInput"),
  brandSubtitleInput: document.querySelector("#brandSubtitleInput"),
  brandLogoInput: document.querySelector("#brandLogoInput"),
  removeBrandLogo: document.querySelector("#removeBrandLogo"),
  brandPreviewLogo: document.querySelector("#brandPreviewLogo"),
  brandPreviewInitials: document.querySelector("#brandPreviewInitials"),
  brandPreviewName: document.querySelector("#brandPreviewName"),
  brandPreviewSubtitle: document.querySelector("#brandPreviewSubtitle"),
  userDialog: document.querySelector("#userDialog"),
  userForm: document.querySelector("#userForm"),
  userDialogTitle: document.querySelector("#userDialogTitle"),
  userId: document.querySelector("#userId"),
  userName: document.querySelector("#userName"),
  userEmail: document.querySelector("#userEmail"),
  userRole: document.querySelector("#userRole"),
  userActive: document.querySelector("#userActive"),
  userPassword: document.querySelector("#userPassword"),
  probeCount: document.querySelector("#probeCount"),
  probesList: document.querySelector("#probesList"),
  probeTokenValue: document.querySelector("#probeTokenValue"),
  toggleProbeToken: document.querySelector("#toggleProbeToken"),
  copyProbeToken: document.querySelector("#copyProbeToken"),
  probeInstallCommand: document.querySelector("#probeInstallCommand"),
  copyProbeInstallCommand: document.querySelector("#copyProbeInstallCommand"),
  groupDialog: document.querySelector("#groupDialog"),
  groupForm: document.querySelector("#groupForm"),
  groupDialogTitle: document.querySelector("#groupDialogTitle"),
  groupId: document.querySelector("#groupId"),
  groupName: document.querySelector("#groupName"),
  groupDescription: document.querySelector("#groupDescription"),
  connectionDot: document.querySelector("#connectionDot"),
  connectionLabel: document.querySelector("#connectionLabel"),
  connectionDetail: document.querySelector("#connectionDetail"),
  serverDialog: document.querySelector("#serverDialog"),
  serverForm: document.querySelector("#serverForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  serverId: document.querySelector("#serverId"),
  serverName: document.querySelector("#serverName"),
  serverHostname: document.querySelector("#serverHostname"),
  serverEnvironment: document.querySelector("#serverEnvironment"),
  serverCheckSource: document.querySelector("#serverCheckSource"),
  serverGroup: document.querySelector("#serverGroup"),
  serverLocation: document.querySelector("#serverLocation"),
  serverInterval: document.querySelector("#serverInterval"),
  serverThreshold: document.querySelector("#serverThreshold"),
  probeOptions: document.querySelector("#probeOptions"),
  serverProbeId: document.querySelector("#serverProbeId"),
  serverProbeHint: document.querySelector("#serverProbeHint"),
  serverTags: document.querySelector("#serverTags"),
  serverDescription: document.querySelector("#serverDescription")
};

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) showLogin();
    if (!response.ok) throw new Error(body.error || "Falha na requisicao.");
    return body;
  });
}

function isAdmin() {
  return state.currentUser?.role === "admin";
}

function branding() {
  return {
    brandName: state.settings.brandName || "ServerWatch",
    brandSubtitle: state.settings.brandSubtitle || "MVP LAN",
    logoDataUrl: state.settings.logoDataUrl || ""
  };
}

function brandInitials(name) {
  return String(name || "SW")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 3) || "SW";
}

function paintBrandLogo(element, logoDataUrl, name) {
  if (!element) return;
  element.style.backgroundImage = logoDataUrl ? `url("${logoDataUrl}")` : "";
  element.classList.toggle("has-image", Boolean(logoDataUrl));
  const initials = element.querySelector(".brand-initials");
  if (initials) initials.textContent = brandInitials(name);
}

function applyBranding() {
  const current = branding();
  document.title = current.brandName;
  document.querySelectorAll(".brand-name").forEach((item) => {
    item.textContent = current.brandName;
  });
  document.querySelectorAll(".brand-subtitle").forEach((item) => {
    item.textContent = current.brandSubtitle;
  });
  document.querySelectorAll(".brand-logo").forEach((item) => {
    paintBrandLogo(item, current.logoDataUrl, current.brandName);
  });
  renderBrandingForm();
}

function showLogin() {
  state.currentUser = null;
  state.socket?.close();
  clearTimeout(state.reconnectTimer);
  els.bootScreen.hidden = true;
  els.authScreen.hidden = false;
  els.appShell.hidden = true;
}

function showApp(user) {
  state.currentUser = user;
  els.bootScreen.hidden = true;
  els.authScreen.hidden = true;
  els.appShell.hidden = false;
  els.currentUserName.textContent = `${user.name} · ${user.role === "admin" ? "Admin" : "Operador"}`;
  document.querySelectorAll(".admin-only").forEach((item) => {
    item.hidden = !isAdmin();
  });
  if (!isAdmin() && document.querySelector(".nav-tab.active")?.classList.contains("admin-only")) {
    document.querySelector('[data-view="dashboard"]').click();
  }
}

function statusLabel(status) {
  return {
    online: "Online",
    offline: "Offline",
    unknown: "Sem status",
    paused: "Pausado"
  }[status || "unknown"];
}

function displayStatus(server) {
  return server.isActive ? server.currentStatus || "unknown" : "paused";
}

function environmentLabel(environment) {
  return {
    production: "Producao",
    staging: "Homologacao",
    development: "Desenvolvimento"
  }[environment] || environment || "Sem ambiente";
}

function checkSourceLabel(source) {
  return {
    serverwatch: "ServerWatch central",
    probe: "Probe local"
  }[source || "serverwatch"];
}

function groupLabel(groupId) {
  if (!groupId) return "Sem empresa";
  return state.groups.find((group) => group.id === groupId)?.name || "Empresa removida";
}

function groupScopeLabel(groupId = state.filters.groupId) {
  if (groupId === "all") return "Visao geral";
  if (groupId === "none") return "Sem empresa";
  return groupLabel(groupId);
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDurationSince(value) {
  if (!value) return "-";
  const ms = Math.max(0, Date.now() - new Date(value).getTime());
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((item) => String(item).padStart(2, "0")).join(":");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setConnection(status) {
  els.connectionDot.className = `connection-dot ${status}`;
  if (status === "connected") {
    els.connectionLabel.textContent = "Tempo real ativo";
    els.connectionDetail.textContent = "Atualizacoes instantaneas";
  } else if (status === "disconnected") {
    els.connectionLabel.textContent = "Reconectando";
    els.connectionDetail.textContent = "Tentando novo WebSocket";
  } else {
    els.connectionLabel.textContent = "Conectando";
    els.connectionDetail.textContent = "WebSocket";
  }
}

function applySnapshot(payload) {
  state.summary = payload.summary || {};
  state.servers = payload.servers || [];
  state.groups = payload.groups || [];
  state.probes = payload.probes || [];
  state.users = payload.users || [];
  state.currentUser = payload.currentUser || state.currentUser;
  state.settings = payload.settings || {};
  applyBranding();
  state.alerts = payload.alerts || [];
  state.events = payload.events || [];
  if (state.selectedServerId && !state.servers.some((server) => server.id === state.selectedServerId)) {
    state.selectedServerId = null;
  }
  if (!state.selectedServerId && state.servers.length) {
    state.selectedServerId = state.servers[0].id;
  }
  renderGroupOptions();
  renderProbeOptions();
  render();
}

function upsertServer(server) {
  if (server.deletedAt) {
    state.servers = state.servers.filter((item) => item.id !== server.id);
    if (state.selectedServerId === server.id) state.selectedServerId = state.servers[0]?.id || null;
    return;
  }
  const index = state.servers.findIndex((item) => item.id === server.id);
  if (index >= 0) state.servers[index] = server;
  else state.servers.unshift(server);
}

function upsertGroup(group) {
  if (group.deletedAt) {
    state.groups = state.groups.filter((item) => item.id !== group.id);
    return;
  }
  const index = state.groups.findIndex((item) => item.id === group.id);
  if (index >= 0) state.groups[index] = group;
  else state.groups.unshift(group);
  renderGroupOptions();
}

function handleSocketMessage(payload) {
  if (payload.type === "snapshot") {
    applySnapshot(payload);
    return;
  }

  if (payload.summary) state.summary = payload.summary;

  if (payload.server) {
    upsertServer(payload.server);
  }

  if (payload.group) {
    upsertGroup(payload.group);
  }

  if (payload.event) {
    state.events = [payload.event, ...state.events.filter((item) => item.id !== payload.event.id)].slice(0, 100);
    if (payload.event.currentStatus === "offline" && payload.event.previousStatus !== "offline") {
      showIncidentNotification(payload.event);
    }
  }

  if (payload.alert) {
    state.alerts = [payload.alert, ...state.alerts.filter((item) => item.id !== payload.alert.id)].slice(0, 50);
  }

  render();
}

function connectSocket() {
  clearTimeout(state.reconnectTimer);
  setConnection("connecting");
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  state.socket = new WebSocket(`${protocol}//${location.host}/ws`);

  state.socket.addEventListener("open", () => setConnection("connected"));
  state.socket.addEventListener("message", (event) => {
    try {
      handleSocketMessage(JSON.parse(event.data));
    } catch (error) {
      console.warn("Mensagem WebSocket invalida", error);
    }
  });
  state.socket.addEventListener("close", () => {
    if (!state.currentUser) return;
    setConnection("disconnected");
    state.reconnectTimer = setTimeout(connectSocket, 1800);
  });
  state.socket.addEventListener("error", () => {
    state.socket.close();
  });
}

function renderGroupOptions() {
  const groupOptions = state.groups
    .map((group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`)
    .join("");

  if (els.groupFilter) {
    const current = els.groupFilter.value || state.filters.groupId;
    els.groupFilter.innerHTML = `
      <option value="all">Todas empresas</option>
      <option value="none">Sem empresa</option>
      ${groupOptions}
    `;
    els.groupFilter.value = [...els.groupFilter.options].some((option) => option.value === current) ? current : "all";
    state.filters.groupId = els.groupFilter.value;
  }

  if (els.serverGroup) {
    const current = els.serverGroup.value;
    els.serverGroup.innerHTML = `
      <option value="">Sem empresa</option>
      ${groupOptions}
    `;
    if ([...els.serverGroup.options].some((option) => option.value === current)) {
      els.serverGroup.value = current;
    }
  }
  renderCompanyNav();
}

function renderProbeOptions() {
  if (!els.serverProbeId) return;
  const current = els.serverProbeId.value;
  if (!state.probes.length) {
    els.serverProbeId.innerHTML = `<option value="">Nenhum probe instalado encontrado</option>`;
    els.serverProbeId.disabled = true;
    if (els.serverProbeHint) {
      els.serverProbeHint.textContent = "Instale o Probe Collector primeiro. Assim que ele se conectar, aparecera aqui.";
    }
    return;
  }

  els.serverProbeId.disabled = false;
  els.serverProbeId.innerHTML = state.probes
    .map((probe) => {
      const address = probe.primaryAddress || probe.addresses?.[0] || probe.lastAddress || "";
      const label = `${probe.name || probe.id} (${address || probe.id})`;
      return `<option value="${escapeHtml(probe.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  els.serverProbeId.value = state.probes.some((probe) => probe.id === current) ? current : state.probes[0].id;
  if (els.serverProbeHint) {
    const selected = state.probes.find((probe) => probe.id === els.serverProbeId.value);
    const selectedAddress = selected?.primaryAddress || selected?.addresses?.[0] || selected?.lastAddress || "";
    els.serverProbeHint.textContent = selected?.lastSeenAt
      ? `${selectedAddress ? `IP detectado: ${selectedAddress}. ` : ""}Ultimo contato: ${formatDate(selected.lastSeenAt)}.`
      : "Probe pronto para receber alvos.";
  }
}

function selectedProbe() {
  return state.probes.find((probe) => probe.id === els.serverProbeId?.value) || null;
}

function probeAddress(probe) {
  return probe?.primaryAddress || probe?.addresses?.[0] || probe?.lastAddress || "";
}

function applySelectedProbeDefaults({ force = false } = {}) {
  if (els.serverCheckSource.value !== "probe") return;
  const probe = selectedProbe();
  if (!probe) return;
  const address = probeAddress(probe);
  if (address && (force || !els.serverHostname.value.trim())) {
    els.serverHostname.value = address;
  }
  if ((force || !els.serverName.value.trim()) && probe.name) {
    els.serverName.value = probe.name.toUpperCase();
  }
}

function groupFilterMatches(server) {
  return (
    state.filters.groupId === "all" ||
    (state.filters.groupId === "none" && !server.groupId) ||
    server.groupId === state.filters.groupId
  );
}

function renderCompanyNav() {
  if (!els.companyNav) return;
  const noneCount = state.servers.filter((server) => !server.groupId).length;
  const buttons = [
    {
      id: "all",
      name: "Visao geral",
      count: state.servers.length,
      offline: state.servers.filter((server) => server.isActive && server.currentStatus === "offline").length
    },
    ...state.groups.map((group) => {
      const servers = state.servers.filter((server) => server.groupId === group.id);
      return {
        id: group.id,
        name: group.name,
        count: servers.length,
        offline: servers.filter((server) => server.isActive && server.currentStatus === "offline").length
      };
    }),
    {
      id: "none",
      name: "Sem empresa",
      count: noneCount,
      offline: state.servers.filter((server) => !server.groupId && server.isActive && server.currentStatus === "offline").length
    }
  ];

  els.companyNav.innerHTML = buttons
    .filter((item) => item.id !== "none" || item.count > 0)
    .map(
      (item) => `
        <button class="company-nav-button ${state.filters.groupId === item.id ? "active" : ""}" type="button" data-company-id="${item.id}" title="${escapeHtml(item.name)}">
          <span>${escapeHtml(item.name)}</span>
          <strong>${item.offline ? `${item.offline} off` : item.count}</strong>
        </button>
      `
    )
    .join("");
}

function filteredServers() {
  const query = state.filters.query.toLowerCase();
  return state.servers.filter((server) => {
    const visibleStatus = displayStatus(server);
    const statusOk =
      state.filters.status === "all" ||
      visibleStatus === state.filters.status ||
      (!server.isActive && state.filters.status === "unknown");
    const envOk = state.filters.environment === "all" || server.environment === state.filters.environment;
    const groupOk = groupFilterMatches(server);
    const haystack = [
      server.name,
      server.hostname,
      server.environment,
      groupLabel(server.groupId),
      server.location,
      ...(server.tags || [])
    ]
      .join(" ")
      .toLowerCase();
    return statusOk && envOk && groupOk && (!query || haystack.includes(query));
  });
}

function scopedServers({ includeStatusFilter = false } = {}) {
  const currentStatus = state.filters.status;
  if (!includeStatusFilter) state.filters.status = "all";
  const servers = filteredServers();
  state.filters.status = currentStatus;
  return servers;
}

function statusCounts(servers) {
  return servers.reduce(
    (acc, server) => {
      const status = displayStatus(server);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { online: 0, offline: 0, unknown: 0, paused: 0 }
  );
}

function renderMetrics() {
  const servers = scopedServers();
  const counts = statusCounts(servers);
  const activeTotal = servers.filter((server) => server.isActive).length;
  const total = servers.length || 1;
  const onlinePct = (counts.online / total) * 100;
  const offlinePct = (counts.offline / total) * 100;
  const unknownPct = (counts.unknown / total) * 100;
  const pausedPct = (counts.paused / total) * 100;

  els.overviewScope.textContent = groupScopeLabel();
  els.metricTotal.textContent = activeTotal;
  els.metricOnline.textContent = counts.online;
  els.metricOffline.textContent = counts.offline;
  els.metricAvailability.textContent = `${state.summary.availability24h ?? 0}%`;
  els.metricAlerts.textContent = `${state.summary.alertsOpen ?? 0} alertas abertos`;

  els.statusDonut.style.background = servers.length
    ? `conic-gradient(
        var(--online) 0 ${onlinePct}%,
        var(--offline) ${onlinePct}% ${onlinePct + offlinePct}%,
        var(--unknown) ${onlinePct + offlinePct}% ${onlinePct + offlinePct + unknownPct}%,
        #9ca3af ${onlinePct + offlinePct + unknownPct}% ${onlinePct + offlinePct + unknownPct + pausedPct}%
      )`
    : "conic-gradient(#dbe3e4 0 100%)";
  els.statusDonut.dataset.total = String(servers.length);
  els.statusLegend.innerHTML = [
    ["online", "Online", counts.online],
    ["offline", "Offline", counts.offline],
    ["unknown", "Sem status", counts.unknown],
    ["paused", "Pausado", counts.paused]
  ]
    .filter(([, , count]) => count > 0)
    .map(([key, label, count]) => `<span><i class="${key}"></i>${label}: ${count}</span>`)
    .join("");
}

function renderServerRow(server) {
  const visibleStatus = displayStatus(server);
  const selected = state.selectedServerId === server.id ? "selected" : "";
  const inactive = server.isActive ? "" : "inactive";
  const latency = server.lastLatencyMs === null || server.lastLatencyMs === undefined ? "-" : `${server.lastLatencyMs} ms`;
  const offlineFor =
    server.isActive && server.currentStatus === "offline" ? `<span>Offline ha ${formatDurationSince(server.statusChangedAt)}</span>` : "";
  const subtitle = server.isActive
    ? `${escapeHtml(server.hostname)} · ${checkSourceLabel(server.checkSource)} · ${environmentLabel(server.environment)} ${offlineFor}`
    : `${escapeHtml(server.hostname)} · Monitoramento pausado`;
  return `
    <button class="server-row ${selected} ${inactive}" type="button" data-server-id="${server.id}">
      <span class="status-pulse ${visibleStatus}"></span>
      <span class="server-main">
        <strong>${escapeHtml(server.name)}</strong>
        <span>${subtitle}</span>
      </span>
      <span class="server-meta">
        <span class="status-badge ${visibleStatus}">${statusLabel(visibleStatus)}</span>
        <span>${server.isActive ? latency : "pausado"}</span>
      </span>
    </button>
  `;
}

function groupedServers(servers) {
  const groups = [];
  const knownGroupIds = new Set(state.groups.map((group) => group.id));

  for (const group of state.groups) {
    const items = servers.filter((server) => server.groupId === group.id);
    if (items.length) groups.push({ id: group.id, name: group.name, servers: items });
  }

  const withoutGroup = servers.filter((server) => !server.groupId || !knownGroupIds.has(server.groupId));
  if (withoutGroup.length) groups.push({ id: "none", name: "Sem empresa", servers: withoutGroup });

  return groups;
}

function renderServers() {
  const servers = filteredServers();
  els.serverCount.textContent = `${servers.length} ${servers.length === 1 ? "item" : "itens"}`;

  if (!servers.length) {
    els.serverList.innerHTML = `<div class="empty-list">Nenhum servidor encontrado.</div>`;
    return;
  }

  els.serverList.innerHTML = groupedServers(servers)
    .map((group) => {
      const counts = statusCounts(group.servers);
      return `
        <section class="server-group-section">
          <header class="server-group-header">
            <div>
              <strong>${escapeHtml(group.name)}</strong>
              <span>${group.servers.length} ${group.servers.length === 1 ? "servidor" : "servidores"}</span>
            </div>
            <div class="server-group-badges">
              <span class="mini-badge online">${counts.online} online</span>
              <span class="mini-badge offline">${counts.offline} offline</span>
              ${counts.paused ? `<span class="mini-badge paused">${counts.paused} pausado</span>` : ""}
            </div>
          </header>
          <div class="server-group-items">
            ${group.servers.map(renderServerRow).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderDetail() {
  const server = state.servers.find((item) => item.id === state.selectedServerId);
  if (!server) {
    els.detailPanel.innerHTML = `
      <div class="empty-state">
        <strong>Nenhum servidor selecionado</strong>
        <span>Selecione um item para ver latencia, historico recente e acoes.</span>
      </div>
    `;
    return;
  }

  const recent = state.events.filter((event) => event.serverId === server.id).slice(0, 5);
  const visibleStatus = displayStatus(server);
  const tags = (server.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const offlineSince =
    !server.isActive
      ? `<div class="detail-stat"><span>Monitoramento</span><strong>Pausado</strong></div>`
      : server.currentStatus === "offline"
      ? `<div class="detail-stat"><span>Indisponivel ha</span><strong>${formatDurationSince(server.statusChangedAt)}</strong></div>`
      : `<div class="detail-stat"><span>Status desde</span><strong>${formatDate(server.statusChangedAt)}</strong></div>`;
  const pausedNotice = server.isActive
    ? ""
    : `
      <div class="paused-notice">
        <strong>Monitoramento pausado</strong>
        <span>Este servidor esta cadastrado, mas nao esta recebendo pings nem gerando alertas.</span>
      </div>
    `;
  const checkButton = server.isActive
    ? `<button class="ghost-button compact" type="button" data-action="check" data-id="${server.id}">${
        server.checkSource === "probe" ? "Solicitar checagem" : "Checar agora"
      }</button>`
    : "";
  const probeStats =
    server.checkSource === "probe"
      ? `
        <div class="detail-stat"><span>Probe</span><strong>${escapeHtml(server.probeId || "-")}</strong></div>
        <div class="detail-stat"><span>Ultimo envio do probe</span><strong>${formatDate(server.lastProbeSeenAt)}</strong></div>
        ${
          server.probeCheckRequestedAt
            ? `<div class="detail-stat"><span>Checagem solicitada</span><strong>${formatDate(server.probeCheckRequestedAt)}</strong></div>`
            : ""
        }
      `
      : "";

  els.detailPanel.innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${escapeHtml(server.name)}</h2>
        <div class="detail-meta">${escapeHtml(server.hostname)} · ${checkSourceLabel(server.checkSource)} · ${escapeHtml(groupLabel(server.groupId))} · ${environmentLabel(server.environment)}</div>
      </div>
      <span class="status-badge ${visibleStatus}">${statusLabel(visibleStatus)}</span>
    </div>

    ${pausedNotice}

    <p class="detail-meta">${escapeHtml(server.description || "Sem descricao cadastrada.")}</p>
    <div class="tag-list">${tags || `<span class="tag">sem tags</span>`}</div>

    <div class="detail-grid">
      <div class="detail-stat"><span>Ultima checagem</span><strong>${formatDate(server.lastCheckedAt)}</strong></div>
      <div class="detail-stat"><span>Latencia</span><strong>${server.lastLatencyMs ?? "-"} ms</strong></div>
      <div class="detail-stat"><span>Origem</span><strong>${checkSourceLabel(server.checkSource)}</strong></div>
      <div class="detail-stat"><span>Empresa</span><strong>${escapeHtml(groupLabel(server.groupId))}</strong></div>
      <div class="detail-stat"><span>Intervalo</span><strong>${server.checkInterval}s</strong></div>
      ${offlineSince}
      ${probeStats}
    </div>

    <div class="detail-actions">
      ${checkButton}
      <button class="ghost-button compact" type="button" data-action="edit" data-id="${server.id}">Editar</button>
      <button class="ghost-button compact" type="button" data-action="toggle" data-id="${server.id}">
        ${server.isActive ? "Desativar" : "Reativar"}
      </button>
    </div>

    <div class="panel-title">
      <h2>Historico recente</h2>
      <span>${recent.length} eventos</span>
    </div>
    <div class="mini-history">
      ${
        recent.length
          ? recent.map(renderTimelineItem).join("")
          : `<div class="empty-list">Sem transicoes registradas ainda.</div>`
      }
    </div>

    <div class="danger-zone">
      <div>
        <strong>Excluir servidor</strong>
        <span>Remove da listagem e para definitivamente o monitoramento deste cadastro.</span>
      </div>
      <button class="danger-button compact" type="button" data-action="delete" data-id="${server.id}">Excluir servidor</button>
    </div>
  `;
}

function renderTimelineItem(event) {
  return `
    <article class="timeline-item">
      <span class="timeline-marker ${event.currentStatus}"></span>
      <div>
        <strong>${escapeHtml(event.serverName)}</strong>
        <div class="detail-meta">${statusLabel(event.previousStatus)} para ${statusLabel(event.currentStatus)}</div>
        ${event.message ? `<small>${escapeHtml(event.message)}</small>` : ""}
      </div>
      <small>${formatDate(event.createdAt)}</small>
    </article>
  `;
}

function renderTimeline() {
  els.eventCount.textContent = `${state.events.length} eventos`;
  els.timeline.innerHTML = state.events.length
    ? state.events.map(renderTimelineItem).join("")
    : `<div class="empty-list">A timeline aparecera quando um status mudar.</div>`;
}

function renderAlerts() {
  els.alertsList.innerHTML = state.alerts.length
    ? state.alerts
        .map(
          (alert) => `
            <article class="alert-card ${alert.severity === "critical" ? "critical" : ""}">
              <div>
                <strong>${escapeHtml(alert.serverName)}</strong>
                <div>${escapeHtml(alert.message)}</div>
                <small>${formatDate(alert.createdAt)} · ${alert.read ? "lido" : "novo"}</small>
              </div>
              <span class="status-badge ${alert.type === "down" ? "offline" : "online"}">
                ${alert.type === "down" ? "Offline" : "Recuperado"}
              </span>
            </article>
          `
        )
        .join("")
    : `<div class="empty-list">Nenhum alerta registrado.</div>`;
}

function renderGroups() {
  if (!els.groupsList) return;
  els.groupCount.textContent = `${state.groups.length} ${state.groups.length === 1 ? "empresa" : "empresas"}`;

  if (!state.groups.length) {
    els.groupsList.innerHTML = `
      <div class="empty-list">Nenhuma empresa cadastrada. Crie a primeira para associar servidores.</div>
    `;
    return;
  }

  els.groupsList.innerHTML = state.groups
    .map((group) => {
      const servers = state.servers.filter((server) => server.groupId === group.id);
      const activeServers = servers.filter((server) => server.isActive);
      const offline = activeServers.filter((server) => server.currentStatus === "offline").length;
      return `
        <article class="group-card">
          <div>
            <strong>${escapeHtml(group.name)}</strong>
            <span>${escapeHtml(group.description || "Sem descricao.")}</span>
          </div>
          <div class="group-stats">
            <span>${servers.length} servidores</span>
            <span>${activeServers.length} ativos</span>
            <span>${offline} offline</span>
          </div>
          <button class="ghost-button compact" type="button" data-group-action="edit" data-id="${group.id}">Editar</button>
        </article>
      `;
    })
    .join("");
}

function roleLabel(role) {
  return role === "admin" ? "Administrador" : "Operador";
}

function renderUsers() {
  if (!els.usersList || !isAdmin()) return;
  els.userCount.textContent = `${state.users.length} ${state.users.length === 1 ? "usuario" : "usuarios"}`;

  els.usersList.innerHTML = state.users.length
    ? state.users
        .map(
          (user) => `
            <article class="user-card ${user.isActive ? "" : "inactive"}">
              <div>
                <strong>${escapeHtml(user.name)}</strong>
                <span>${escapeHtml(user.email)}</span>
              </div>
              <div class="user-badges">
                <span class="tag">${roleLabel(user.role)}</span>
                <span class="tag">${user.isActive ? "Ativo" : "Inativo"}</span>
              </div>
              <div class="user-actions">
                <button class="ghost-button compact" type="button" data-user-action="edit" data-id="${user.id}">Editar</button>
                <button class="danger-button compact" type="button" data-user-action="delete" data-id="${user.id}">Excluir</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-list">Nenhum usuario cadastrado.</div>`;
}

function renderBrandingForm() {
  if (!els.brandingForm) return;
  const current = branding();
  if (document.activeElement !== els.brandNameInput) els.brandNameInput.value = current.brandName;
  if (document.activeElement !== els.brandSubtitleInput) els.brandSubtitleInput.value = current.brandSubtitle;
  if (els.brandPreviewName) els.brandPreviewName.textContent = current.brandName;
  if (els.brandPreviewSubtitle) els.brandPreviewSubtitle.textContent = current.brandSubtitle || "Sem subtitulo";
  paintBrandLogo(els.brandPreviewLogo, current.logoDataUrl, current.brandName);
}

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    if (file.size > 512 * 1024) {
      reject(new Error("A logo deve ter ate 500 KB."));
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      reject(new Error("Use uma imagem PNG, JPG, WEBP ou SVG."));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Nao foi possivel ler a imagem.")));
    reader.readAsDataURL(file);
  });
}

async function submitBranding(event) {
  event.preventDefault();
  try {
    const current = branding();
    const selectedLogo = await readLogoFile(els.brandLogoInput.files?.[0]);
    const payload = {
      brandName: els.brandNameInput.value,
      brandSubtitle: els.brandSubtitleInput.value,
      logoDataUrl: selectedLogo ?? current.logoDataUrl
    };
    const settings = await api("/api/settings/branding", { method: "PUT", body: JSON.stringify(payload) });
    state.settings = { ...state.settings, ...settings };
    els.brandLogoInput.value = "";
    applyBranding();
    showToast("Identidade salva", "A marca da interface foi atualizada.");
  } catch (error) {
    showToast("Falha ao salvar identidade", error.message);
  }
}

function probeToken() {
  return String(state.settings.probeToken || "");
}

function probeInstallCommand() {
  const token = probeToken();
  return `curl -fsSL ${location.origin}/downloads/probe/linux-installer | sudo bash -s -- --server-url ${location.origin} --probe-id cliente-acme-sp --token ${token} --name "Cliente ACME"`;
}

function renderProbes() {
  if (!els.probeTokenValue) return;
  const token = probeToken();
  els.probeTokenValue.value = token;
  els.probeInstallCommand.textContent = token ? probeInstallCommand() : "Token ainda nao disponivel.";
  els.probeCount.textContent = `${state.probes.length} ${state.probes.length === 1 ? "probe conectado" : "probes conectados"}`;

  els.probesList.innerHTML = state.probes.length
    ? state.probes
        .map(
          (probe) => `
            <article class="probe-card">
              <div>
                <strong>${escapeHtml(probe.name || probe.id)}</strong>
                <span>${escapeHtml(probe.id)} · ${escapeHtml(probe.primaryAddress || probe.addresses?.[0] || probe.lastAddress || "sem IP")} · ${probe.targetCount || 0} ${probe.targetCount === 1 ? "alvo" : "alvos"}</span>
              </div>
              <div>
                <strong>${formatDate(probe.lastSeenAt)}</strong>
                <span>${escapeHtml(probe.lastAddress || "sem endereco")}</span>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-list">Nenhum probe se conectou ainda.</div>`;
}

function render() {
  renderMetrics();
  renderCompanyNav();
  renderServers();
  renderDetail();
  renderTimeline();
  renderAlerts();
  renderGroups();
  renderProbes();
  renderUsers();
  renderBrandingForm();
}

function showToast(title, message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  els.toastStack.append(toast);
  setTimeout(() => toast.remove(), 6500);
}

function playAlertTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.45);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.46);
  } catch {
    // Audio is best-effort and depends on browser gesture policies.
  }
}

function showIncidentNotification(event) {
  const title = `${event.serverName} offline`;
  const message = event.message || "Servidor parou de responder.";
  showToast(title, message);
  playAlertTone();

  if (state.notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body: message,
      tag: event.serverId,
      requireInteraction: true
    });
  }
}

function openDialog(server = null) {
  els.serverForm.reset();
  renderGroupOptions();
  renderProbeOptions();
  els.serverId.value = server?.id || "";
  els.dialogTitle.textContent = server ? "Editar servidor" : "Adicionar servidor";
  els.serverName.value = server?.name || "";
  els.serverHostname.value = server?.hostname || "";
  els.serverEnvironment.value = server?.environment || "production";
  els.serverCheckSource.value = server?.checkSource || "serverwatch";
  els.serverGroup.value = server?.groupId || "";
  els.serverLocation.value = server?.location || "";
  els.serverInterval.value = server?.checkInterval || 10;
  els.serverThreshold.value = server?.failureThreshold || 2;
  if (server?.probeId && state.probes.some((probe) => probe.id === server.probeId)) {
    els.serverProbeId.value = server.probeId;
  }
  els.serverTags.value = (server?.tags || []).join(", ");
  els.serverDescription.value = server?.description || "";
  toggleProbeOptions();
  els.serverDialog.showModal();
}

function closeDialog() {
  els.serverDialog.close();
}

function openGroupDialog(group = null) {
  els.groupForm.reset();
  els.groupId.value = group?.id || "";
  els.groupDialogTitle.textContent = group ? "Editar empresa" : "Adicionar empresa";
  els.groupName.value = group?.name || "";
  els.groupDescription.value = group?.description || "";
  els.groupDialog.showModal();
}

function closeGroupDialog() {
  els.groupDialog.close();
}

function openUserDialog(user = null) {
  els.userForm.reset();
  els.userId.value = user?.id || "";
  els.userDialogTitle.textContent = user ? "Editar usuario" : "Adicionar usuario";
  els.userName.value = user?.name || "";
  els.userEmail.value = user?.email || "";
  els.userRole.value = user?.role || "operator";
  els.userActive.value = String(user?.isActive ?? true);
  els.userPassword.placeholder = user ? "Deixe em branco para manter a senha" : "Minimo 6 caracteres";
  els.userPassword.required = !user;
  els.userDialog.showModal();
}

function closeUserDialog() {
  els.userDialog.close();
}

async function submitGroup(event) {
  event.preventDefault();
  const id = els.groupId.value;
  const payload = {
    name: els.groupName.value,
    description: els.groupDescription.value,
    type: "company"
  };
  const saved = id
    ? await api(`/api/groups/${id}`, { method: "PUT", body: JSON.stringify(payload) })
    : await api("/api/groups", { method: "POST", body: JSON.stringify(payload) });
  upsertGroup(saved);
  closeGroupDialog();
  showToast("Empresa salva", `${saved.name} esta disponivel para associar servidores.`);
  const snap = await api("/api/snapshot");
  applySnapshot(snap);
}

async function submitUser(event) {
  event.preventDefault();
  const id = els.userId.value;
  const payload = {
    name: els.userName.value,
    email: els.userEmail.value,
    role: els.userRole.value,
    isActive: els.userActive.value === "true"
  };
  if (els.userPassword.value) payload.password = els.userPassword.value;
  const saved = id
    ? await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) })
    : await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
  const index = state.users.findIndex((item) => item.id === saved.id);
  if (index >= 0) state.users[index] = saved;
  else state.users.unshift(saved);
  closeUserDialog();
  renderUsers();
  showToast("Usuario salvo", `${saved.name} pode acessar o ServerWatch.`);
}

async function submitServer(event) {
  event.preventDefault();
  const id = els.serverId.value;
  if (els.serverCheckSource.value === "probe" && !els.serverProbeId.value) {
    showToast("Probe obrigatorio", "Instale e selecione um Probe Collector antes de salvar este servidor.");
    return;
  }
  const payload = {
    name: els.serverName.value,
    hostname: els.serverHostname.value,
    checkSource: els.serverCheckSource.value,
    probeId: els.serverProbeId.value,
    environment: els.serverEnvironment.value,
    groupId: els.serverGroup.value || null,
    location: els.serverLocation.value,
    checkInterval: Number(els.serverInterval.value),
    failureThreshold: Number(els.serverThreshold.value),
    tags: els.serverTags.value,
    description: els.serverDescription.value
  };
  try {
    const saved = id
      ? await api(`/api/servers/${id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/servers", { method: "POST", body: JSON.stringify(payload) });
    state.selectedServerId = saved.id;
    closeDialog();
    showToast("Servidor salvo", `${saved.name} entrou no monitoramento.`);
    const snap = await api("/api/snapshot");
    applySnapshot(snap);
  } catch (error) {
    showToast("Falha ao salvar servidor", error.message);
  }
}

async function loadInitialData() {
  const payload = await api("/api/snapshot");
  applySnapshot(payload);
}

async function copyText(value, successMessage) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  showToast("Copiado", successMessage);
}

function toggleProbeOptions() {
  els.probeOptions.hidden = els.serverCheckSource.value !== "probe";
  if (els.serverCheckSource.value === "probe") {
    renderProbeOptions();
    applySelectedProbeDefaults();
  }
}

function bindEvents() {
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.loginError.textContent = "";
    try {
      const payload = {
        email: els.loginEmail.value,
        password: els.loginPassword.value
      };
      const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
      showApp(result.user);
      await loadInitialData();
      connectSocket();
    } catch (error) {
      els.loginError.textContent = error.message;
    }
  });

  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.hidden) return;
      document.querySelectorAll(".nav-tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.view}View`).classList.add("active");
    });
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filters.status = button.dataset.status;
      renderMetrics();
      renderServers();
    });
  });

  els.searchInput.addEventListener("input", () => {
    state.filters.query = els.searchInput.value.trim();
    renderMetrics();
    renderServers();
  });

  els.environmentFilter.addEventListener("change", () => {
    state.filters.environment = els.environmentFilter.value;
    renderMetrics();
    renderServers();
  });

  els.groupFilter.addEventListener("change", () => {
    state.filters.groupId = els.groupFilter.value;
    render();
  });

  els.companyNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-company-id]");
    if (!button) return;
    state.filters.groupId = button.dataset.companyId;
    els.groupFilter.value = state.filters.groupId;
    document.querySelectorAll(".nav-tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    document.querySelector('[data-view="dashboard"]').classList.add("active");
    document.querySelector("#dashboardView").classList.add("active");
    render();
  });

  document.querySelector("#openServerForm").addEventListener("click", () => openDialog());
  document.querySelector("#closeDialog").addEventListener("click", closeDialog);
  document.querySelector("#cancelForm").addEventListener("click", closeDialog);
  els.serverCheckSource.addEventListener("change", toggleProbeOptions);
  els.serverProbeId.addEventListener("change", () => applySelectedProbeDefaults({ force: true }));
  els.serverForm.addEventListener("submit", submitServer);

  els.toggleProbeToken?.addEventListener("click", () => {
    const showToken = els.probeTokenValue.type === "password";
    els.probeTokenValue.type = showToken ? "text" : "password";
    els.toggleProbeToken.textContent = showToken ? "Ocultar" : "Mostrar";
  });

  els.copyProbeToken?.addEventListener("click", () => {
    copyText(probeToken(), "Token do probe pronto para usar.");
  });

  els.copyProbeInstallCommand?.addEventListener("click", () => {
    copyText(probeInstallCommand(), "Comando de instalacao do probe copiado.");
  });

  document.querySelector("#openGroupForm").addEventListener("click", () => openGroupDialog());
  document.querySelector("#closeGroupDialog").addEventListener("click", closeGroupDialog);
  document.querySelector("#cancelGroupForm").addEventListener("click", closeGroupDialog);
  els.groupForm.addEventListener("submit", submitGroup);

  document.querySelector("#openUserForm").addEventListener("click", () => openUserDialog());
  document.querySelector("#closeUserDialog").addEventListener("click", closeUserDialog);
  document.querySelector("#cancelUserForm").addEventListener("click", closeUserDialog);
  els.userForm.addEventListener("submit", submitUser);
  els.brandingForm?.addEventListener("submit", submitBranding);
  els.removeBrandLogo?.addEventListener("click", async () => {
    try {
      const settings = await api("/api/settings/branding", {
        method: "PUT",
        body: JSON.stringify({
          brandName: els.brandNameInput.value,
          brandSubtitle: els.brandSubtitleInput.value,
          logoDataUrl: ""
        })
      });
      state.settings = { ...state.settings, ...settings };
      els.brandLogoInput.value = "";
      applyBranding();
      showToast("Logo removida", "A interface voltou a usar as iniciais da marca.");
    } catch (error) {
      showToast("Falha ao remover logo", error.message);
    }
  });

  els.usersList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    const user = state.users.find((item) => item.id === button.dataset.id);
    if (!user) return;
    if (button.dataset.userAction === "edit") {
      openUserDialog(user);
      return;
    }
    if (button.dataset.userAction === "delete") {
      const confirmed = window.confirm(`Excluir o usuario "${user.name}"?`);
      if (!confirmed) return;
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      state.users = state.users.filter((item) => item.id !== user.id);
      renderUsers();
      showToast("Usuario excluido", `${user.name} nao acessa mais o ServerWatch.`);
    }
  });

  els.groupsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-group-action]");
    if (!button) return;
    const group = state.groups.find((item) => item.id === button.dataset.id);
    if (group && button.dataset.groupAction === "edit") openGroupDialog(group);
  });

  els.serverList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-server-id]");
    if (!row) return;
    state.selectedServerId = row.dataset.serverId;
    renderServers();
    renderDetail();
  });

  els.detailPanel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const server = state.servers.find((item) => item.id === button.dataset.id);
    if (!server) return;

    if (button.dataset.action === "edit") {
      openDialog(server);
      return;
    }

    if (button.dataset.action === "toggle") {
      const updated = await api(`/api/servers/${server.id}/toggle`, { method: "POST" });
      upsertServer(updated);
      render();
      showToast("Status do cadastro alterado", `${updated.name} foi ${updated.isActive ? "reativado" : "desativado"}.`);
      return;
    }

    if (button.dataset.action === "delete") {
      const confirmed = window.confirm(
        `Tem certeza que deseja excluir "${server.name}"?\n\nO servidor sera removido da listagem e nao sera mais monitorado. O historico tecnico fica preservado internamente.`
      );
      if (!confirmed) return;
      await api(`/api/servers/${server.id}`, { method: "DELETE" });
      const snap = await api("/api/snapshot");
      applySnapshot(snap);
      showToast("Servidor excluido", `${server.name} saiu do monitoramento.`);
      return;
    }

    if (button.dataset.action === "check") {
      try {
        const result = await api(`/api/servers/${server.id}/check`, { method: "POST" });
        if (result.server) upsertServer(result.server);
        render();
        showToast(
          result.status === "probe_queued" ? "Checagem enviada ao probe" : "Checagem concluida",
          result.status === "probe_queued"
            ? `${server.name} sera verificado no proximo contato do Probe Collector.`
            : `${server.name} foi verificado agora.`
        );
      } catch (error) {
        showToast("Falha na checagem", error.message);
      }
    }
  });

  document.querySelector("#notifyButton").addEventListener("click", async () => {
    if (!("Notification" in window)) {
      showToast("Notificacoes indisponiveis", "Este navegador nao suporta Notification API.");
      return;
    }
    const permission = await Notification.requestPermission();
    state.notificationsEnabled = permission === "granted";
    showToast(
      state.notificationsEnabled ? "Notificacoes ativas" : "Notificacoes bloqueadas",
      state.notificationsEnabled ? "Alertas offline aparecerao no navegador." : "Use as permissoes do navegador para ativar."
    );
  });

  els.logoutButton.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => ({}));
    showLogin();
  });

  document.querySelector("#markAlertsRead").addEventListener("click", async () => {
    await api("/api/alerts/read", { method: "POST" });
    state.alerts = state.alerts.map((alert) => ({ ...alert, read: true }));
    renderAlerts();
    renderMetrics();
  });
}

bindEvents();
api("/api/auth/session")
  .then(async ({ user, settings }) => {
    state.settings = settings || state.settings;
    applyBranding();
    if (!user) {
      showLogin();
      return;
    }
    showApp(user);
    await loadInitialData();
    connectSocket();
  })
  .catch(() => showLogin());
setInterval(() => {
  if (!state.currentUser) return;
  renderServers();
  renderDetail();
}, 1000);
