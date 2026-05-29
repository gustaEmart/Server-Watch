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
  selectedProbeId: null,
  topologyExpanded: new Set(),
  probeInstallTarget: "linux",
  filters: {
    status: "all",
    environment: "all",
    groupId: "all",
    query: ""
  },
  historyFilters: {
    serverId: "all",
    category: "all"
  },
  alertFilters: {
    groupId: "all",
    status: "all",
    type: "all"
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
  topbarEyebrow: document.querySelector("#topbarEyebrow"),
  topbarTitle: document.querySelector("#topbarTitle"),
  metricTotal: document.querySelector("#metricTotal"),
  metricOnline: document.querySelector("#metricOnline"),
  metricOffline: document.querySelector("#metricOffline"),
  metricAvailability: document.querySelector("#metricAvailability"),
  metricAlerts: document.querySelector("#metricAlerts"),
  metricsGrid: document.querySelector("#metricsGrid"),
  overviewScope: document.querySelector("#overviewScope"),
  statusDonut: document.querySelector("#statusDonut"),
  statusLegend: document.querySelector("#statusLegend"),
  executiveDashboard: document.querySelector("#executiveDashboard"),
  executiveGrid: document.querySelector("#executiveGrid"),
  serverList: document.querySelector("#serverList"),
  serverCount: document.querySelector("#serverCount"),
  toggleTopologyAll: document.querySelector("#toggleTopologyAll"),
  detailPanel: document.querySelector("#detailPanel"),
  timeline: document.querySelector("#timeline"),
  eventCount: document.querySelector("#eventCount"),
  historyServerFilter: document.querySelector("#historyServerFilter"),
  historyCategoryFilter: document.querySelector("#historyCategoryFilter"),
  alertCount: document.querySelector("#alertCount"),
  alertGroupFilter: document.querySelector("#alertGroupFilter"),
  alertStatusFilter: document.querySelector("#alertStatusFilter"),
  alertTypeFilter: document.querySelector("#alertTypeFilter"),
  alertsList: document.querySelector("#alertsList"),
  toastStack: document.querySelector("#toastStack"),
  searchInput: document.querySelector("#searchInput"),
  environmentFilter: document.querySelector("#environmentFilter"),
  groupFilter: document.querySelector("#groupFilter"),
  activeFilterCount: document.querySelector("#activeFilterCount"),
  clearFilters: document.querySelector("#clearFilters"),
  companyNav: document.querySelector("#companyNav"),
  groupsList: document.querySelector("#groupsList"),
  groupCount: document.querySelector("#groupCount"),
  usersList: document.querySelector("#usersList"),
  userCount: document.querySelector("#userCount"),
  brandingForm: document.querySelector("#brandingForm"),
  alertSettingsForm: document.querySelector("#alertSettingsForm"),
  brandNameInput: document.querySelector("#brandNameInput"),
  brandSubtitleInput: document.querySelector("#brandSubtitleInput"),
  brandLogoInput: document.querySelector("#brandLogoInput"),
  removeBrandLogo: document.querySelector("#removeBrandLogo"),
  themeModeInputs: document.querySelectorAll('input[name="themeMode"]'),
  probeStaleGraceSeconds: document.querySelector("#probeStaleGraceSeconds"),
  defaultFailureThreshold: document.querySelector("#defaultFailureThreshold"),
  severityProduction: document.querySelector("#severityProduction"),
  severityStaging: document.querySelector("#severityStaging"),
  severityDevelopment: document.querySelector("#severityDevelopment"),
  soundAlertsEnabled: document.querySelector("#soundAlertsEnabled"),
  browserNotificationsEnabled: document.querySelector("#browserNotificationsEnabled"),
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
  probeDetailPanel: document.querySelector("#probeDetailPanel"),
  probeTokenValue: document.querySelector("#probeTokenValue"),
  toggleProbeToken: document.querySelector("#toggleProbeToken"),
  copyProbeToken: document.querySelector("#copyProbeToken"),
  probeInstallCommand: document.querySelector("#probeInstallCommand"),
  probeInstallCommandTitle: document.querySelector("#probeInstallCommandTitle"),
  probeInstallCommandHint: document.querySelector("#probeInstallCommandHint"),
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
  serverNodeType: document.querySelector("#serverNodeType"),
  serverInfrastructurePlatform: document.querySelector("#serverInfrastructurePlatform"),
  serverParentId: document.querySelector("#serverParentId"),
  virtualizerChildrenOptions: document.querySelector("#virtualizerChildrenOptions"),
  serverChildIds: document.querySelector("#serverChildIds"),
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

const VIEW_ROUTES = {
  dashboard: "/dashboard",
  groups: "/empresas",
  probes: "/probes",
  users: "/usuarios",
  settings: "/configuracoes",
  history: "/historico",
  alerts: "/alertas"
};

const ROUTE_VIEWS = Object.fromEntries(Object.entries(VIEW_ROUTES).map(([view, route]) => [route, view]));

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
    logoDataUrl: state.settings.logoDataUrl || "",
    theme: state.settings.theme === "dark" ? "dark" : "light"
  };
}

function alertSettings() {
  const severity = state.settings.alertSeverityByEnvironment || {};
  return {
    probeStaleGraceSeconds: Number(state.settings.probeStaleGraceSeconds || 45),
    defaultFailureThreshold: Number(state.settings.defaultFailureThreshold || 2),
    soundAlertsEnabled: state.settings.soundAlertsEnabled !== false,
    browserNotificationsEnabled: state.settings.browserNotificationsEnabled !== false,
    alertSeverityByEnvironment: {
      production: severity.production || "critical",
      staging: severity.staging || "warning",
      development: severity.development || "info"
    }
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
  document.documentElement.dataset.theme = current.theme;
  document.documentElement.style.colorScheme = current.theme;
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
  syncViewFromLocation({ replace: true });
}

function statusLabel(status) {
  return {
    online: "Online",
    offline: "Offline",
    probe_stale: "Probe sem contato",
    dependency_down: "Afetado pelo host",
    unknown: "Sem status",
    paused: "Pausado"
  }[status || "unknown"];
}

function eventKindLabel(event) {
  return {
    server_created: "Servidor cadastrado",
    server_edited: "Servidor editado",
    server_deleted: "Servidor excluido",
    server_paused: "Monitoramento pausado",
    server_reactivated: "Monitoramento reativado",
    manual_check_requested: "Checagem manual solicitada",
    server_offline: "Servidor ficou offline",
    server_recovered: "Servidor voltou",
    probe_stale: "Probe sem contato",
    probe_recovered: "Probe voltou",
    probe_updated: "Probe atualizado",
    status_changed: "Status alterado"
  }[event.kind || "status_changed"] || "Evento";
}

function eventCategoryLabel(category) {
  return category === "administrative" ? "Administrativo" : "Tecnico";
}

function displayStatus(server) {
  if (!server.isActive) return "paused";
  if (server.dependencyStatus === "affected") return "dependency_down";
  return server.currentStatus || "unknown";
}

function probeStatusLabel(status) {
  return {
    online: "Probe online",
    stale: "Probe sem contato",
    unknown: "Probe sem status",
    not_applicable: "Sem probe"
  }[status || "unknown"];
}

function probeVersionLabel(probe) {
  if (!probe?.version) return "Versao desconhecida";
  if (probe.updateAvailable) return `Atualizar para ${probe.latestVersion || "-"}`;
  return `Atualizado (${probe.version})`;
}

function probeVersionBadge(probe) {
  const status = probe?.versionStatus || "unknown";
  const label =
    status === "outdated"
      ? "Atualizacao disponivel"
      : status === "current"
      ? "Atualizado"
      : "Versao desconhecida";
  return `<span class="status-badge probe-version ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function severityLabel(severity) {
  return {
    critical: "Critico",
    warning: "Atencao",
    info: "Informativo"
  }[severity || "info"] || "Informativo";
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

function nodeTypeLabel(type) {
  return {
    server: "Servidor",
    physical: "Host fisico",
    hypervisor: "Virtualizador",
    vm: "VM",
    service: "Servico"
  }[type || "server"] || "Servidor";
}

function infrastructurePlatformLabel(platform) {
  return {
    none: "Nao definida",
    proxmox: "Proxmox",
    vmware: "VMware",
    "hyper-v": "Hyper-V",
    "bare-metal": "Bare metal",
    cloud: "Cloud",
    linux: "Linux",
    windows: "Windows",
    other: "Outra"
  }[platform || "none"] || "Nao definida";
}

function platformLabel(platform) {
  return {
    linux: "Linux",
    windows: "Windows",
    win32: "Windows",
    macos: "macOS",
    darwin: "macOS"
  }[String(platform || "").toLowerCase()] || "Sistema nao identificado";
}

function normalizedPlatform(platform) {
  const value = String(platform || "").toLowerCase();
  if (value === "win32" || value === "windows") return "windows";
  if (value === "darwin" || value === "macos") return "macos";
  if (value === "linux") return "linux";
  return "unknown";
}

function platformIcon(platform) {
  const normalized = normalizedPlatform(platform);
  const label = platformLabel(platform);
  const icons = {
    windows: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.2 10.7 4v7.2H3V5.2Zm9-1.4L21 2.5v8.7h-9V3.8ZM3 12.8h7.7V20L3 18.8v-6Zm9 0h9v8.7L12 20.2v-7.4Z"/></svg>`,
    linux: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-2.6 0-4.6 2.2-4.6 5.1 0 1.6-.5 2.7-1.2 3.9-.7 1.1-1.4 2.4-1.4 4.2 0 2.9 2.8 4.8 7.2 4.8s7.2-1.9 7.2-4.8c0-1.8-.7-3.1-1.4-4.2-.7-1.2-1.2-2.3-1.2-3.9C16.6 5.2 14.6 3 12 3Zm-1.7 5.5c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9Zm3.4 0c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9Zm-4 7.7h4.6c-.4.8-1.2 1.3-2.3 1.3s-1.9-.5-2.3-1.3Z"/></svg>`,
    macos: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.4 2.8c.1 1.2-.4 2.3-1.1 3-.8.8-1.8 1.2-2.8 1.1-.1-1.1.4-2.1 1.1-2.9.8-.8 1.9-1.3 2.8-1.2Zm3.4 14.1c-.5 1.1-.8 1.6-1.4 2.6-.9 1.3-2.1 2.9-3.6 2.9-1.3 0-1.7-.8-3.5-.8s-2.2.8-3.5.8c-1.5 0-2.7-1.5-3.6-2.8-2.5-3.7-2.8-8.1-1.2-10.4 1.1-1.7 2.9-2.7 4.6-2.7 1.7 0 2.8.9 3.8.9.9 0 2.4-1.1 4.1-.9.7 0 2.7.3 4 2.2-3.5 1.9-2.9 6.8.3 8.2Z"/></svg>`,
    unknown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v8c0 .8-.7 1.5-1.5 1.5h-13c-.8 0-1.5-.7-1.5-1.5v-8ZM9 18h6v2H9v-2Z"/></svg>`
  };
  return `<span class="platform-icon ${normalized}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icons[normalized]}</span>`;
}

function primaryMac(entity) {
  return entity?.primaryMac || entity?.macAddresses?.[0] || "";
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

function formatDurationMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : "-";
}

function formatUptime(seconds) {
  const totalSeconds = Number(seconds);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "-";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatNetworkSpeed(value) {
  const mbps = Number(value);
  if (!Number.isFinite(mbps) || mbps <= 0) return "-";
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(mbps % 1000 === 0 ? 0 : 1)} Gbps` : `${Math.round(mbps)} Mbps`;
}

function interfacePrimaryAddress(item) {
  return item?.addresses?.find((address) => address.family === "IPv4")?.address || item?.addresses?.[0]?.address || "";
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

function activeViewName() {
  return document.querySelector(".nav-tab.active")?.dataset.view || "dashboard";
}

function viewFromPath(pathname = window.location.pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_VIEWS[normalized] || "dashboard";
}

function routeForView(viewName) {
  return VIEW_ROUTES[viewName] || VIEW_ROUTES.dashboard;
}

function setActiveView(viewName, options = {}) {
  const { push = true, replace = false } = options;
  const requestedTab = document.querySelector(`.nav-tab[data-view="${viewName}"]`);
  const nextView = requestedTab?.hidden ? "dashboard" : viewName;
  const tab = document.querySelector(`.nav-tab[data-view="${nextView}"]`) || document.querySelector('[data-view="dashboard"]');
  const view = document.querySelector(`#${tab.dataset.view}View`);
  if (!tab || !view) return;

  document.querySelectorAll(".nav-tab").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  view.classList.add("active");
  updateTopbarContext();
  updateMetricsVisibility();
  if (tab.dataset.view === "alerts") {
    renderAlerts();
    refreshAlerts();
  }

  const nextRoute = routeForView(tab.dataset.view);
  if (push && window.location.pathname !== nextRoute) {
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", nextRoute);
  }
}

function activateLinkedView(target) {
  const viewName = target?.dataset?.viewLink;
  if (!viewName) return;
  setActiveView(viewName);
}

function syncViewFromLocation(options = {}) {
  setActiveView(viewFromPath(), { push: true, replace: options.replace ?? true });
}

function updateTopbarContext() {
  const titles = {
    dashboard: ["Monitoramento em tempo real", "Disponibilidade dos servidores"],
    groups: ["Organizacao operacional", "Empresas e grupos"],
    probes: ["Instalacao e coleta", "Probe Collector"],
    users: ["Controle de acesso", "Usuarios"],
    settings: ["Identidade do sistema", "Configuracoes"],
    history: ["Auditoria operacional", "Historico de eventos"],
    alerts: ["Incidentes e recuperacoes", "Alertas"]
  };
  const [eyebrow, title] = titles[activeViewName()] || titles.dashboard;
  if (els.topbarEyebrow) els.topbarEyebrow.textContent = eyebrow;
  if (els.topbarTitle) els.topbarTitle.textContent = title;
}

function updateMetricsVisibility() {
  if (!els.metricsGrid) return;
  const viewName = activeViewName();
  els.metricsGrid.hidden = !["dashboard", "groups"].includes(viewName);
  if (els.executiveDashboard) els.executiveDashboard.hidden = viewName !== "dashboard";
}

function updateActiveFilterCount() {
  if (!els.activeFilterCount) return;
  const active = [
    state.filters.status !== "all",
    state.filters.environment !== "all",
    state.filters.groupId !== "all",
    Boolean(state.filters.query)
  ].filter(Boolean).length;
  els.activeFilterCount.textContent = active ? `${active} ${active === 1 ? "ativo" : "ativos"}` : "Todos";
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
    if ((payload.event.kind || "status_changed") === "server_offline") {
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
  renderAlertGroupOptions(groupOptions);
  renderCompanyNav();
}

function renderAlertGroupOptions(groupOptions = "") {
  if (!els.alertGroupFilter) return;
  const current = els.alertGroupFilter.value || state.alertFilters.groupId;
  els.alertGroupFilter.innerHTML = `
    <option value="all">Todas empresas</option>
    <option value="none">Sem empresa</option>
    ${groupOptions || state.groups.map((group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`).join("")}
  `;
  els.alertGroupFilter.value = [...els.alertGroupFilter.options].some((option) => option.value === current) ? current : "all";
  state.alertFilters.groupId = els.alertGroupFilter.value;
}

function renderParentOptions(currentServerId = "") {
  if (!els.serverParentId) return;
  const current = els.serverParentId.value;
  const candidates = state.servers.filter(
    (server) => !server.deletedAt && server.id !== currentServerId && server.nodeType === "hypervisor"
  );
  els.serverParentId.innerHTML = `
    <option value="">Sem dependencia</option>
    ${candidates
      .map((server) => {
        const descriptor = [
          nodeTypeLabel(server.nodeType),
          infrastructurePlatformLabel(server.infrastructurePlatform)
        ].filter((item) => item && item !== "Nao definida").join(" · ");
        const label = `${server.name}${descriptor ? ` (${descriptor})` : ""}`;
        return `<option value="${escapeHtml(server.id)}">${escapeHtml(label)}</option>`;
      })
      .join("")}
  `;
  els.serverParentId.value = candidates.some((server) => server.id === current) ? current : "";
}

function hasAncestor(serverId, ancestorId) {
  let current = state.servers.find((server) => server.id === serverId && !server.deletedAt);
  const visited = new Set();
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (visited.has(current.parentId)) return false;
    visited.add(current.parentId);
    current = state.servers.find((server) => server.id === current.parentId && !server.deletedAt);
  }
  return false;
}

function virtualizerChildCandidates(currentServerId = "") {
  return state.servers.filter(
    (server) =>
      !server.deletedAt &&
      server.id !== currentServerId &&
      server.nodeType !== "hypervisor" &&
      (!currentServerId || !hasAncestor(currentServerId, server.id))
  );
}

function selectedVirtualizerChildIds() {
  if (!els.serverChildIds) return [];
  return [...els.serverChildIds.querySelectorAll("[data-virtualizer-child]:checked")].map((input) => input.value);
}

function renderVirtualizerChildOptions(currentServerId = "") {
  if (!els.serverChildIds) return;
  const selected = new Set(selectedVirtualizerChildIds());
  if (!selected.size && currentServerId) {
    state.servers
      .filter((server) => server.parentId === currentServerId && !server.deletedAt)
      .forEach((server) => selected.add(server.id));
  }
  const candidates = virtualizerChildCandidates(currentServerId);
  els.serverChildIds.innerHTML = candidates.length
    ? candidates
        .map((server) => {
          const descriptor = [
            server.hostname,
            nodeTypeLabel(server.nodeType),
            server.parentName ? `depende de ${server.parentName}` : ""
          ]
            .filter(Boolean)
            .join(" · ");
          return `
            <label class="virtualizer-child-option">
              <input type="checkbox" data-virtualizer-child value="${escapeHtml(server.id)}" ${selected.has(server.id) ? "checked" : ""} />
              <span>
                <strong>${escapeHtml(server.name)}</strong>
                <small>${escapeHtml(descriptor || "Sem detalhes adicionais")}</small>
              </span>
            </label>
          `;
        })
        .join("")
    : `<div class="empty-list compact">Nenhum servidor disponivel para vincular.</div>`;
}

function toggleVirtualizerChildrenOptions() {
  if (!els.virtualizerChildrenOptions) return;
  const isVirtualizer = els.serverNodeType.value === "hypervisor";
  els.virtualizerChildrenOptions.hidden = !isVirtualizer;
  if (isVirtualizer) {
    renderVirtualizerChildOptions(els.serverId.value || "");
  }
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
      state.filters.status === "probe_stale"
        ? server.checkSource === "probe" && server.probeStatus === "stale"
        : state.filters.status === "all" ||
          visibleStatus === state.filters.status ||
          (!server.isActive && state.filters.status === "unknown");
    const envOk = state.filters.environment === "all" || server.environment === state.filters.environment;
    const groupOk = groupFilterMatches(server);
    const haystack = [
      server.name,
      server.hostname,
      server.environment,
      platformLabel(server.platform),
      nodeTypeLabel(server.nodeType),
      infrastructurePlatformLabel(server.infrastructurePlatform),
      server.parentName,
      primaryMac(server),
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
      if (server.checkSource === "probe" && server.probeStatus === "stale") {
        acc.probe_stale = (acc.probe_stale || 0) + 1;
      }
      return acc;
    },
    { online: 0, offline: 0, dependency_down: 0, probe_stale: 0, unknown: 0, paused: 0 }
  );
}

function renderMetrics() {
  const servers = scopedServers();
  const counts = statusCounts(servers);
  const activeTotal = servers.filter((server) => server.isActive).length;
  const statusTotal = counts.online + counts.offline + counts.dependency_down + counts.unknown + counts.paused || 1;
  const onlinePct = (counts.online / statusTotal) * 100;
  const offlinePct = (counts.offline / statusTotal) * 100;
  const dependencyPct = (counts.dependency_down / statusTotal) * 100;
  const unknownPct = (counts.unknown / statusTotal) * 100;
  const pausedPct = (counts.paused / statusTotal) * 100;

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
        var(--warning) ${onlinePct + offlinePct}% ${onlinePct + offlinePct + dependencyPct}%,
        var(--unknown) ${onlinePct + offlinePct + dependencyPct}% ${onlinePct + offlinePct + dependencyPct + unknownPct}%,
        #9ca3af ${onlinePct + offlinePct + dependencyPct + unknownPct}% ${onlinePct + offlinePct + dependencyPct + unknownPct + pausedPct}%
      )`
    : "conic-gradient(#dbe3e4 0 100%)";
  els.statusDonut.dataset.total = String(servers.length);
  els.statusLegend.innerHTML = [
    ["online", "Online", counts.online],
    ["offline", "Offline", counts.offline],
    ["dependency_down", "Afetado pelo host", counts.dependency_down],
    ["probe_stale", "Probe sem contato", counts.probe_stale],
    ["unknown", "Sem status", counts.unknown],
    ["paused", "Pausado", counts.paused]
  ]
    .filter(([, , count]) => count > 0)
    .map(([key, label, count]) => `<span><i class="${key}"></i>${label}: ${count}</span>`)
    .join("");
}

function serverById(id) {
  return state.servers.find((server) => server.id === id) || null;
}

function eventServer(event) {
  return serverById(event.serverId);
}

function availabilityForServers(servers) {
  const active = servers.filter((server) => server.isActive);
  if (!active.length) return 0;
  const online = active.filter((server) => server.currentStatus === "online").length;
  return Math.round((online / active.length) * 1000) / 10;
}

function executiveItem({ title, meta, badge, status = "", serverId = "", companyId = "", alertGroupId = "" }) {
  return `
    <button class="executive-item" type="button" ${serverId ? `data-server-id="${escapeHtml(serverId)}"` : ""} ${companyId ? `data-company-id="${escapeHtml(companyId)}"` : ""} ${alertGroupId ? `data-alert-group-id="${escapeHtml(alertGroupId)}"` : ""}>
      <span class="executive-item-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(meta || "")}</small>
      </span>
      ${badge ? `<span class="mini-badge ${status}">${escapeHtml(badge)}</span>` : ""}
    </button>
  `;
}

function executiveEmpty(message) {
  return `<div class="executive-empty">${escapeHtml(message)}</div>`;
}

function renderExecutiveDashboard() {
  if (!els.executiveGrid) return;
  const activeServers = state.servers.filter((server) => server.isActive);
  const openAlerts = state.alerts.filter((alert) => !alert.read && alert.type === "down");
  const staleProbes = state.probes.filter((probe) => probe.status === "stale");
  const criticalOffline = activeServers
    .filter((server) => server.currentStatus === "offline")
    .sort((left, right) => {
      const priority = { production: 0, staging: 1, development: 2 };
      return (priority[left.environment] ?? 3) - (priority[right.environment] ?? 3);
    })
    .slice(0, 5);
  const recentDrops = state.events
    .filter((event) => (event.kind || "") === "server_offline" || event.currentStatus === "offline")
    .slice(0, 4);
  const recentRecoveries = state.events
    .filter((event) => (event.kind || "") === "server_recovered" || (event.currentStatus === "online" && event.previousStatus === "offline"))
    .slice(0, 4);
  const worstLatencies = activeServers
    .filter((server) => server.currentStatus === "online" && Number.isFinite(Number(server.lastLatencyMs)))
    .sort((left, right) => Number(right.lastLatencyMs) - Number(left.lastLatencyMs))
    .slice(0, 4);
  const clientsWithAlerts = groupedServers(state.servers)
    .map((group) => {
      const serverIds = new Set(group.servers.map((server) => server.id));
      return {
        ...group,
        openAlerts: openAlerts.filter((alert) => serverIds.has(alert.serverId)).length,
        offline: group.servers.filter((server) => server.isActive && server.currentStatus === "offline").length,
        availability: availabilityForServers(group.servers)
      };
    })
    .filter((group) => group.openAlerts || group.offline)
    .sort((left, right) => right.openAlerts - left.openAlerts || right.offline - left.offline)
    .slice(0, 4);
  const availabilityByCompany = groupedServers(state.servers)
    .map((group) => ({ ...group, availability: availabilityForServers(group.servers) }))
    .filter((group) => group.servers.some((server) => server.isActive))
    .sort((left, right) => left.availability - right.availability)
    .slice(0, 4);
  const byEnvironment = ["production", "staging", "development"].map((environment) => {
    const servers = activeServers.filter((server) => server.environment === environment);
    const counts = statusCounts(servers);
    return { environment, total: servers.length, online: counts.online, offline: counts.offline };
  });

  els.executiveGrid.innerHTML = `
    <article class="executive-card attention">
      <header><span>Clientes com alerta</span><strong>${clientsWithAlerts.length}</strong></header>
      <div class="executive-list">
        ${
          clientsWithAlerts.length
            ? clientsWithAlerts
                .map((group) =>
                  executiveItem({
                    title: group.name,
                    meta: `${group.offline} offline · ${group.availability}% online`,
                    badge: `${group.openAlerts} alerta${group.openAlerts === 1 ? "" : "s"}`,
                    status: "offline",
                    alertGroupId: group.id
                  })
                )
                .join("")
            : executiveEmpty("Nenhum cliente com alerta aberto.")
        }
      </div>
    </article>

    <article class="executive-card">
      <header><span>Probes sem contato</span><strong>${staleProbes.length}</strong></header>
      <div class="executive-list">
        ${
          staleProbes.length
            ? staleProbes
                .slice(0, 4)
                .map((probe) =>
                  executiveItem({
                    title: probe.name || probe.id,
                    meta: `${probe.primaryAddress || probe.lastAddress || "sem IP"} · ${formatDate(probe.lastSeenAt)}`,
                    badge: `${probe.staleTargetCount || 0} alvos`,
                    status: "probe_stale"
                  })
                )
                .join("")
            : executiveEmpty("Todos os probes estao se comunicando.")
        }
      </div>
    </article>

    <article class="executive-card attention">
      <header><span>Criticos offline</span><strong>${criticalOffline.length}</strong></header>
      <div class="executive-list">
        ${
          criticalOffline.length
            ? criticalOffline
                .map((server) =>
                  executiveItem({
                    title: server.name,
                    meta: `${server.hostname} · ${groupLabel(server.groupId)} · ${environmentLabel(server.environment)}`,
                    badge: "Offline",
                    status: "offline",
                    serverId: server.id
                  })
                )
                .join("")
            : executiveEmpty("Nenhum servidor ativo offline.")
        }
      </div>
    </article>

    <article class="executive-card">
      <header><span>Ultimas quedas</span><strong>${recentDrops.length}</strong></header>
      <div class="executive-list">
        ${
          recentDrops.length
            ? recentDrops
                .map((event) => {
                  const server = eventServer(event);
                  return executiveItem({
                    title: event.serverName || "Servidor",
                    meta: `${formatDate(event.createdAt)}${event.message ? ` · ${event.message}` : ""}`,
                    badge: "Queda",
                    status: "offline",
                    serverId: server?.id || ""
                  });
                })
                .join("")
            : executiveEmpty("Sem quedas recentes.")
        }
      </div>
    </article>

    <article class="executive-card">
      <header><span>Recuperacoes recentes</span><strong>${recentRecoveries.length}</strong></header>
      <div class="executive-list">
        ${
          recentRecoveries.length
            ? recentRecoveries
                .map((event) => {
                  const server = eventServer(event);
                  return executiveItem({
                    title: event.serverName || "Servidor",
                    meta: `${formatDate(event.createdAt)}${event.durationMs ? ` · indisponivel por ${formatDurationMs(event.durationMs)}` : ""}`,
                    badge: "Online",
                    status: "online",
                    serverId: server?.id || ""
                  });
                })
                .join("")
            : executiveEmpty("Sem recuperacoes recentes.")
        }
      </div>
    </article>

    <article class="executive-card">
      <header><span>Piores latencias</span><strong>${worstLatencies.length}</strong></header>
      <div class="executive-list">
        ${
          worstLatencies.length
            ? worstLatencies
                .map((server) =>
                  executiveItem({
                    title: server.name,
                    meta: `${server.hostname} · ${groupLabel(server.groupId)}`,
                    badge: `${server.lastLatencyMs} ms`,
                    status: "unknown",
                    serverId: server.id
                  })
                )
                .join("")
            : executiveEmpty("Sem latencias registradas.")
        }
      </div>
    </article>

    <article class="executive-card">
      <header><span>Disponibilidade por empresa</span><strong>${availabilityByCompany.length}</strong></header>
      <div class="executive-list">
        ${
          availabilityByCompany.length
            ? availabilityByCompany
                .map((group) =>
                  executiveItem({
                    title: group.name,
                    meta: `${group.servers.filter((server) => server.isActive).length} ativos`,
                    badge: `${group.availability}%`,
                    status: group.availability >= 99 ? "online" : group.availability >= 90 ? "probe_stale" : "offline",
                    companyId: group.id
                  })
                )
                .join("")
            : executiveEmpty("Sem empresas com servidores ativos.")
        }
      </div>
    </article>

    <article class="executive-card">
      <header><span>Servidores por ambiente</span><strong>${activeServers.length}</strong></header>
      <div class="environment-bars">
        ${byEnvironment
          .map((item) => {
            const pct = item.total ? Math.round((item.online / item.total) * 100) : 0;
            return `
              <div class="environment-row">
                <span>${environmentLabel(item.environment)}</span>
                <strong>${item.online}/${item.total}</strong>
                <i><b style="width:${pct}%"></b></i>
              </div>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function renderServerRow(server, options = {}) {
  const { childCount = 0, depth = 0 } = options;
  const visibleStatus = displayStatus(server);
  const selected = state.selectedServerId === server.id ? "selected" : "";
  const inactive = server.isActive ? "" : "inactive";
  const expanded = state.topologyExpanded.has(server.id);
  const latency = server.lastLatencyMs === null || server.lastLatencyMs === undefined ? "-" : `${server.lastLatencyMs} ms`;
  const offlineFor =
    server.dependencyStatus === "affected"
      ? `<span>Afetado por ${escapeHtml(server.parentName || "host pai")}</span>`
      : server.dependencyStatus === "orphan"
      ? `<span>Dependencia sem host pai</span>`
      : server.isActive && server.checkSource === "probe" && server.probeStatus === "stale"
      ? `<span>Probe sem contato ha ${formatDurationSince(server.probeLastSeenAt || server.lastProbeSeenAt)}</span>`
      : server.isActive && server.currentStatus === "offline"
      ? `<span>Offline ha ${formatDurationSince(server.statusChangedAt)}</span>`
      : "";
  const probeBadge =
    server.checkSource === "probe"
      ? `<span class="probe-inline-badge ${server.probeStatus || "unknown"}">${probeStatusLabel(server.probeStatus)}</span>`
      : "";
  const mac = primaryMac(server);
  const infra = [
    nodeTypeLabel(server.nodeType),
    server.parentName ? `depende de ${server.parentName}` : infrastructurePlatformLabel(server.infrastructurePlatform)
  ].filter((item) => item && item !== "Nao definida").join(" · ");
  const subtitle = server.isActive
    ? `${escapeHtml(server.hostname)} · ${infra ? `${escapeHtml(infra)} · ` : ""}${checkSourceLabel(server.checkSource)} · ${environmentLabel(server.environment)}${mac ? ` · ${escapeHtml(mac)}` : ""} ${offlineFor}`
    : `${escapeHtml(server.hostname)} · Monitoramento pausado`;
  return `
    <button class="server-row ${selected} ${inactive} ${depth ? "dependency-child-row" : ""}" type="button" data-server-id="${server.id}" style="--dependency-depth:${depth}">
      ${
        childCount
          ? `<span class="topology-toggle ${expanded ? "expanded" : ""}" data-topology-toggle="${escapeHtml(server.id)}" aria-label="${expanded ? "Ocultar dependentes" : "Exibir dependentes"}" aria-expanded="${expanded ? "true" : "false"}"><i aria-hidden="true"></i></span>`
          : `<span class="topology-spacer" aria-hidden="true"></span>`
      }
      <span class="status-pulse ${visibleStatus}"></span>
      ${platformIcon(server.platform)}
      <span class="server-main">
        <strong>${escapeHtml(server.name)}</strong>
        <span>${subtitle}</span>
        ${childCount ? `<small>${childCount} ${childCount === 1 ? "dependente" : "dependentes"}</small>` : ""}
      </span>
      <span class="server-meta">
        ${probeBadge}
        <span class="status-badge ${visibleStatus}">${statusLabel(visibleStatus)}</span>
        <span>${server.isActive ? latency : "pausado"}</span>
      </span>
    </button>
  `;
}

function renderServerTopology(servers) {
  const visibleIds = new Set(servers.map((server) => server.id));
  const childrenByParent = new Map();
  for (const server of servers) {
    if (!server.parentId || !visibleIds.has(server.parentId)) continue;
    const children = childrenByParent.get(server.parentId) || [];
    children.push(server);
    childrenByParent.set(server.parentId, children);
  }

  const renderNode = (server, depth = 0, visited = new Set()) => {
    const children = childrenByParent.get(server.id) || [];
    const expanded = state.topologyExpanded.has(server.id);
    const row = renderServerRow(server, { childCount: children.length, depth });
    if (!children.length || !expanded || visited.has(server.id)) return row;
    const nextVisited = new Set(visited);
    nextVisited.add(server.id);
    return `
      ${row}
      <div class="dependency-children">
        ${children.map((child) => renderNode(child, depth + 1, nextVisited)).join("")}
      </div>
    `;
  };

  return servers
    .filter((server) => !server.parentId || !visibleIds.has(server.parentId))
    .map((server) => renderNode(server))
    .join("");
}

function expandableTopologyIds(servers = filteredServers()) {
  const visibleIds = new Set(servers.map((server) => server.id));
  const ids = new Set();
  for (const server of servers) {
    if (server.parentId && visibleIds.has(server.parentId)) {
      ids.add(server.parentId);
    }
  }
  return [...ids];
}

function allVisibleTopologyExpanded(servers = filteredServers()) {
  const ids = expandableTopologyIds(servers);
  return ids.length > 0 && ids.every((id) => state.topologyExpanded.has(id));
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
  const expandableIds = expandableTopologyIds(servers);
  if (els.toggleTopologyAll) {
    const allExpanded = expandableIds.length > 0 && expandableIds.every((id) => state.topologyExpanded.has(id));
    els.toggleTopologyAll.hidden = expandableIds.length === 0;
    els.toggleTopologyAll.textContent = allExpanded ? "Recolher todos" : "Expandir todos";
  }

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
            ${renderServerTopology(group.servers)}
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
  const mac = primaryMac(server);
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
  const dependencyNotice = server.dependencyStatus === "affected" || server.dependencyStatus === "orphan"
    ? `
      <div class="dependency-notice ${server.dependencyStatus}">
        <strong>${server.dependencyStatus === "orphan" ? "Dependencia sem host pai" : "Afetado por dependencia"}</strong>
        <span>${escapeHtml(server.dependencyReason || `Este item depende de ${server.parentName || "um host pai"}.`)}</span>
      </div>
    `
    : "";
  const checkButton = isAdmin() && server.isActive
    ? `<button class="ghost-button compact" type="button" data-action="check" data-id="${server.id}">${
        server.checkSource === "probe" ? "Solicitar checagem" : "Checar agora"
      }</button>`
    : "";
  const adminActions = isAdmin()
    ? `
      <div class="detail-actions">
        ${checkButton}
        <button class="ghost-button compact" type="button" data-action="edit" data-id="${server.id}">Editar</button>
        <button class="ghost-button compact" type="button" data-action="toggle" data-id="${server.id}">
          ${server.isActive ? "Desativar" : "Reativar"}
        </button>
      </div>
    `
    : "";
  const dangerZone = isAdmin()
    ? `
      <div class="danger-zone">
        <div>
          <strong>Excluir servidor</strong>
          <span>Remove da listagem e para definitivamente o monitoramento deste cadastro.</span>
        </div>
        <button class="danger-button compact" type="button" data-action="delete" data-id="${server.id}">Excluir servidor</button>
      </div>
    `
    : "";
  const probeStats =
    server.checkSource === "probe"
      ? `
        <div class="detail-stat"><span>Probe</span><strong>${escapeHtml(server.probeId || "-")}</strong></div>
        <div class="detail-stat"><span>Status do probe</span><strong><span class="status-badge ${server.probeStatus === "stale" ? "probe_stale" : server.probeStatus || "unknown"}">${probeStatusLabel(server.probeStatus)}</span></strong></div>
        <div class="detail-stat"><span>Ultimo envio do probe</span><strong>${formatDate(server.lastProbeSeenAt)}</strong></div>
        <div class="detail-stat"><span>Limite sem contato</span><strong>${server.probeStaleAfterSeconds ? `${server.probeStaleAfterSeconds}s` : "-"}</strong></div>
        ${
          server.probeCheckRequestedAt
            ? `<div class="detail-stat"><span>Checagem solicitada</span><strong>${formatDate(server.probeCheckRequestedAt)}</strong></div>`
            : ""
        }
      `
      : "";
  const serverHostMetrics = renderServerHostMetrics(server);
  const dependencyStats = `
    <div class="detail-stat"><span>Tipo</span><strong>${nodeTypeLabel(server.nodeType)}</strong></div>
    <div class="detail-stat"><span>Plataforma infra</span><strong>${infrastructurePlatformLabel(server.infrastructurePlatform)}</strong></div>
    <div class="detail-stat"><span>Host pai</span><strong>${escapeHtml(server.parentName || "-")}</strong></div>
    <div class="detail-stat"><span>Estado dependencia</span><strong>${server.dependencyStatus === "affected" ? "Afetado" : server.dependencyStatus === "orphan" ? "Orfao" : server.dependencyStatus === "ok" ? "OK" : "Independente"}</strong></div>
  `;

  els.detailPanel.innerHTML = `
    <div class="detail-header">
      <div>
        <h2 class="detail-title">${platformIcon(server.platform)}${escapeHtml(server.name)}</h2>
        <div class="detail-meta">${escapeHtml(server.hostname)} · ${platformLabel(server.platform)} · ${checkSourceLabel(server.checkSource)} · ${escapeHtml(groupLabel(server.groupId))} · ${environmentLabel(server.environment)}</div>
      </div>
      <span class="status-badge ${visibleStatus}">${statusLabel(visibleStatus)}</span>
    </div>

    ${pausedNotice}
    ${dependencyNotice}

    <p class="detail-meta">${escapeHtml(server.description || "Sem descricao cadastrada.")}</p>
    <div class="tag-list">${tags || `<span class="tag">sem tags</span>`}</div>

    <div class="detail-grid">
      <div class="detail-stat"><span>Ultima checagem</span><strong>${formatDate(server.lastCheckedAt)}</strong></div>
      <div class="detail-stat"><span>Latencia</span><strong>${server.lastLatencyMs ?? "-"} ms</strong></div>
      <div class="detail-stat"><span>Origem</span><strong>${checkSourceLabel(server.checkSource)}</strong></div>
      <div class="detail-stat"><span>Empresa</span><strong>${escapeHtml(groupLabel(server.groupId))}</strong></div>
      <div class="detail-stat"><span>Sistema</span><strong>${platformIcon(server.platform)}${platformLabel(server.platform)}</strong></div>
      <div class="detail-stat"><span>MAC</span><strong>${escapeHtml(mac || "-")}</strong></div>
      <div class="detail-stat"><span>Intervalo</span><strong>${server.checkInterval}s</strong></div>
      ${offlineSince}
      ${dependencyStats}
      ${probeStats}
    </div>

    ${serverHostMetrics}

    ${adminActions}

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

    ${dangerZone}
  `;
}

function renderHistoryFilters() {
  if (!els.historyServerFilter) return;
  const current = state.historyFilters.serverId;
  const options = state.servers
    .map((server) => `<option value="${escapeHtml(server.id)}">${escapeHtml(server.name)} (${escapeHtml(server.hostname)})</option>`)
    .join("");
  els.historyServerFilter.innerHTML = `<option value="all">Todos servidores</option>${options}`;
  els.historyServerFilter.value = state.servers.some((server) => server.id === current) ? current : "all";
  state.historyFilters.serverId = els.historyServerFilter.value;
  if (els.historyCategoryFilter) {
    els.historyCategoryFilter.value = state.historyFilters.category;
  }
}

function filteredEvents() {
  return state.events.filter((event) => {
    const serverOk = state.historyFilters.serverId === "all" || event.serverId === state.historyFilters.serverId;
    const categoryOk = state.historyFilters.category === "all" || (event.category || "technical") === state.historyFilters.category;
    return serverOk && categoryOk;
  });
}

function renderTimelineItem(event) {
  const category = event.category || "technical";
  const kind = event.kind || "status_changed";
  const statusText =
    event.previousStatus && event.currentStatus
      ? `${statusLabel(event.previousStatus)} para ${statusLabel(event.currentStatus)}`
      : event.currentStatus
      ? statusLabel(event.currentStatus)
      : eventCategoryLabel(category);
  const duration = event.durationMs ? `<small>Duracao da indisponibilidade: ${formatDurationMs(event.durationMs)}</small>` : "";
  const actor = event.actorName ? `<small>Responsavel: ${escapeHtml(event.actorName)}</small>` : "";
  return `
    <article class="timeline-item ${category}">
      <span class="timeline-marker ${event.currentStatus || kind}"></span>
      <div>
        <strong>${escapeHtml(event.serverName || "Sistema")} · ${eventKindLabel(event)}</strong>
        <div class="detail-meta">${statusText} · ${eventCategoryLabel(category)}</div>
        ${event.message ? `<small>${escapeHtml(event.message)}</small>` : ""}
        ${duration}
        ${actor}
      </div>
      <small>${formatDate(event.createdAt)}</small>
    </article>
  `;
}

function renderTimeline() {
  renderHistoryFilters();
  const events = filteredEvents();
  els.eventCount.textContent = `${events.length} ${events.length === 1 ? "evento" : "eventos"}`;
  els.timeline.innerHTML = events.length
    ? events.map(renderTimelineItem).join("")
    : `<div class="empty-list">A timeline aparecera quando um status mudar.</div>`;
}

function renderAlerts() {
  const alerts = filteredAlerts();
  if (els.alertCount) {
    const openCount = alerts.filter((alert) => !alert.read && alert.type === "down").length;
    els.alertCount.textContent = `${alerts.length} ${alerts.length === 1 ? "alerta" : "alertas"} · ${openCount} ${openCount === 1 ? "aberto" : "abertos"}`;
  }
  els.alertsList.innerHTML = alerts.length
    ? alerts
        .map(
          (alert) => `
            <article class="alert-card ${alert.severity || "info"} ${alert.read ? "read" : "unread"}">
              <div>
                <strong>${escapeHtml(alert.serverName)}</strong>
                <div>${escapeHtml(alert.message)}</div>
                <small>${formatDate(alert.createdAt)} · ${alert.read ? "reconhecido" : "novo"} · ${severityLabel(alert.severity)}</small>
                ${
                  alert.acknowledgedAt
                    ? `<small>Reconhecido por ${escapeHtml(alert.acknowledgedBy || "-")} em ${formatDate(alert.acknowledgedAt)}${alert.acknowledgmentNote ? ` · ${escapeHtml(alert.acknowledgmentNote)}` : ""}</small>`
                    : ""
                }
              </div>
              <div class="alert-actions">
                <span class="status-badge ${alert.type === "down" ? "offline" : "online"}">
                  ${alert.type === "down" ? "Offline" : "Recuperado"}
                </span>
                ${alert.read ? "" : `<button class="ghost-button compact" type="button" data-alert-action="ack" data-alert-id="${alert.id}">Reconhecer</button>`}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-list">Nenhum alerta encontrado para os filtros atuais.</div>`;
}

async function refreshAlerts() {
  if (!els.alertsList) return;
  try {
    state.alerts = await api("/api/alerts");
    renderAlerts();
  } catch (error) {
    els.alertsList.innerHTML = `<div class="empty-list">Nao foi possivel carregar os alertas: ${escapeHtml(error.message)}</div>`;
  }
}

function alertGroupId(alert) {
  return serverById(alert.serverId)?.groupId || "none";
}

function filteredAlerts() {
  return state.alerts.filter((alert) => {
    const groupOk = state.alertFilters.groupId === "all" || alertGroupId(alert) === state.alertFilters.groupId;
    const statusOk =
      state.alertFilters.status === "all" ||
      (state.alertFilters.status === "open" && !alert.read) ||
      (state.alertFilters.status === "read" && alert.read);
    const typeOk = state.alertFilters.type === "all" || alert.type === state.alertFilters.type;
    return groupOk && statusOk && typeOk;
  });
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
          ${isAdmin() ? `<button class="ghost-button compact" type="button" data-group-action="edit" data-id="${group.id}">Editar</button>` : ""}
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
  els.themeModeInputs?.forEach((input) => {
    input.checked = input.value === current.theme;
  });
  if (els.brandPreviewName) els.brandPreviewName.textContent = current.brandName;
  if (els.brandPreviewSubtitle) els.brandPreviewSubtitle.textContent = current.brandSubtitle || "Sem subtitulo";
  paintBrandLogo(els.brandPreviewLogo, current.logoDataUrl, current.brandName);
}

function renderAlertSettingsForm() {
  if (!els.alertSettingsForm || !isAdmin()) return;
  const current = alertSettings();
  if (document.activeElement !== els.probeStaleGraceSeconds) {
    els.probeStaleGraceSeconds.value = current.probeStaleGraceSeconds;
  }
  if (document.activeElement !== els.defaultFailureThreshold) {
    els.defaultFailureThreshold.value = current.defaultFailureThreshold;
  }
  els.severityProduction.value = current.alertSeverityByEnvironment.production;
  els.severityStaging.value = current.alertSeverityByEnvironment.staging;
  els.severityDevelopment.value = current.alertSeverityByEnvironment.development;
  els.soundAlertsEnabled.checked = current.soundAlertsEnabled;
  els.browserNotificationsEnabled.checked = current.browserNotificationsEnabled;
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
      logoDataUrl: selectedLogo ?? current.logoDataUrl,
      theme: document.querySelector('input[name="themeMode"]:checked')?.value || current.theme
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

async function submitAlertSettings(event) {
  event.preventDefault();
  const payload = {
    probeStaleGraceSeconds: Number(els.probeStaleGraceSeconds.value),
    defaultFailureThreshold: Number(els.defaultFailureThreshold.value),
    soundAlertsEnabled: els.soundAlertsEnabled.checked,
    browserNotificationsEnabled: els.browserNotificationsEnabled.checked,
    alertSeverityByEnvironment: {
      production: els.severityProduction.value,
      staging: els.severityStaging.value,
      development: els.severityDevelopment.value
    }
  };
  try {
    const settings = await api("/api/settings/alerts", { method: "PUT", body: JSON.stringify(payload) });
    state.settings = { ...state.settings, ...settings };
    renderAlertSettingsForm();
    showToast("Alertas salvos", "As regras de alerta foram atualizadas.");
  } catch (error) {
    showToast("Falha ao salvar alertas", error.message);
  }
}

function probeToken() {
  return String(state.settings.probeToken || "");
}

function probeInstallTargetDefaults(target) {
  if (target === "proxmox") {
    return {
      id: "pve1",
      name: "PVE-01",
      title: "Comando Proxmox",
      hint: "Use no shell root do Proxmox, sem sudo."
    };
  }

  return {
    id: "cliente-acme-sp",
    name: "Cliente ACME",
    title: "Comando Linux",
    hint: "Use em distribuicoes Linux com sudo."
  };
}

function probeInstallCommand() {
  const defaults = probeInstallTargetDefaults(state.probeInstallTarget);
  return probeInstallCommandFor({
    id: defaults.id,
    name: defaults.name
  }, { target: state.probeInstallTarget });
}

function shellQuote(value) {
  return `"${String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function probeInstallCommandFor(probe, options = {}) {
  const token = probeToken();
  const probeId = probe?.id || "cliente-acme-sp";
  const probeName = probe?.name || probe?.hostName || probeId;
  const mode = probe?.id ? "--repair " : "";
  const target = options.target || state.probeInstallTarget;
  const runner = target === "proxmox" ? "bash" : "sudo bash";
  return `curl -fsSL -H "X-ServerWatch-Probe-Token: ${token}" ${location.origin}/downloads/probe/linux-installer | ${runner} -s -- ${mode}--server-url ${location.origin} --probe-id ${shellQuote(probeId)} --token ${shellQuote(token)} --name ${shellQuote(probeName)}`;
}

function probeLinkedServers(probeId) {
  return state.servers.filter((server) => !server.deletedAt && server.checkSource === "probe" && server.probeId === probeId);
}

function probeLastIssue(probe, linkedServers) {
  if (!probe) return "Sem dados do probe.";
  if (probe.status === "stale") return "Probe sem contato. Verifique rede, servico local ou credenciais.";
  const issue = linkedServers.find((server) => server.lastError)?.lastError;
  return issue || "Nenhuma falha recente reportada.";
}

function renderServerHostMetrics(server) {
  if (server.checkSource !== "probe") return "";
  const metrics = server.probeHostMetrics;
  if (!metrics) {
    return `
      <div class="server-metrics-summary muted">
        <div class="panel-title compact-title">
          <h3>Metricas do host</h3>
          <span>Collector</span>
        </div>
        <span>Atualize o Probe Collector deste servidor para exibir CPU, memoria, disco e uptime.</span>
      </div>
    `;
  }

  const cpu = metrics.cpu || {};
  const memory = metrics.memory || {};
  const disk = metrics.disk || {};
  const system = metrics.system || {};
  const primaryInterface = (metrics.networkInterfaces || []).find((item) => interfacePrimaryAddress(item)) || metrics.networkInterfaces?.[0] || null;
  return `
    <div class="server-metrics-summary">
      <div class="panel-title compact-title">
        <h3>Metricas do host</h3>
        <span>${formatDate(metrics.collectedAt || server.probeHostMetricsUpdatedAt)}</span>
      </div>
      <div class="server-metric-grid">
        <div class="detail-stat"><span>CPU</span><strong>${formatPercent(cpu.usagePercent)}</strong><small>${escapeHtml(cpu.model || "-")}</small></div>
        <div class="detail-stat"><span>Memoria</span><strong>${formatPercent(memory.usedPercent)}</strong><small>${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}</small></div>
        <div class="detail-stat"><span>Disco</span><strong>${formatPercent(disk.usedPercent)}</strong><small>${escapeHtml(disk.mount || "-")} · ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}</small></div>
        <div class="detail-stat"><span>Uptime</span><strong>${formatUptime(system.uptimeSeconds)}</strong><small>${escapeHtml(server.probeHostName || system.type || "-")}</small></div>
        <div class="detail-stat"><span>Rede</span><strong>${escapeHtml(interfacePrimaryAddress(primaryInterface) || "-")}</strong><small>${escapeHtml(primaryInterface?.name || "-")} · ${formatNetworkSpeed(primaryInterface?.speedMbps)}</small></div>
      </div>
    </div>
  `;
}

function renderNetworkInterfaces(metrics) {
  const interfaces = Array.isArray(metrics?.networkInterfaces) ? metrics.networkInterfaces : [];
  if (!interfaces.length) return "";
  return `
    <div class="probe-network-list">
      <div class="panel-title compact-title">
        <h3>Interfaces de rede</h3>
        <span>${interfaces.length} interfaces</span>
      </div>
      ${interfaces
        .map((item) => {
          const addresses = (item.addresses || []).map((address) => address.address).filter(Boolean).join(", ") || "-";
          return `
            <article class="network-interface-row">
              <div>
                <strong>${escapeHtml(item.name || "-")}</strong>
                <small>${escapeHtml(item.description || item.mac || "sem descricao")}</small>
              </div>
              <div>
                <span>${escapeHtml(addresses)}</span>
                <small>${escapeHtml(item.status || "-")} · ${formatNetworkSpeed(item.speedMbps)}</small>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderProbeHostMetrics(probe) {
  const metrics = probe?.hostMetrics;
  if (!metrics) {
    return `
      <div class="probe-issue">
        <span>Metricas do host</span>
        <strong>Aguardando collector atualizado enviar inventario.</strong>
      </div>
    `;
  }
  const memory = metrics.memory || {};
  const disk = metrics.disk || {};
  const cpu = metrics.cpu || {};
  const system = metrics.system || {};
  const loadAverage = Array.isArray(cpu.loadAverage) && cpu.loadAverage.length
    ? cpu.loadAverage.map((item) => Number(item).toFixed(2)).join(" / ")
    : "-";
  return `
    <div class="probe-metrics">
      <div class="panel-title compact-title">
        <h3>Metricas do host</h3>
        <span>${formatDate(metrics.collectedAt || probe.hostMetricsUpdatedAt)}</span>
      </div>
      <div class="probe-detail-grid">
        <div class="detail-stat"><span>CPU</span><strong>${formatPercent(cpu.usagePercent)}</strong><small>${escapeHtml(cpu.cores || "-")} cores</small></div>
        <div class="detail-stat"><span>Memoria</span><strong>${formatPercent(memory.usedPercent)}</strong><small>${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}</small></div>
        <div class="detail-stat"><span>Disco ${escapeHtml(disk.mount || "")}</span><strong>${formatPercent(disk.usedPercent)}</strong><small>${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}</small></div>
        <div class="detail-stat"><span>Uptime</span><strong>${formatUptime(system.uptimeSeconds)}</strong><small>${escapeHtml(system.type || "-")} ${escapeHtml(system.release || "")}</small></div>
        <div class="detail-stat"><span>Arquitetura</span><strong>${escapeHtml(system.arch || "-")}</strong><small>${escapeHtml(cpu.model || "-")}</small></div>
        <div class="detail-stat"><span>Carga media</span><strong>${escapeHtml(loadAverage)}</strong><small>1 / 5 / 15 minutos</small></div>
      </div>
      ${renderNetworkInterfaces(metrics)}
    </div>
  `;
}

function renderProbeDetail(probe) {
  if (!els.probeDetailPanel) return;
  if (!probe) {
    els.probeDetailPanel.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>Nenhum probe selecionado</strong>
        <span>Selecione um probe para ver alvos, identificacao e acoes.</span>
      </div>
    `;
    return;
  }

  const linkedServers = probeLinkedServers(probe.id);
  const reinstallCommand = probeInstallCommandFor(probe);
  const mac = primaryMac(probe);
  const address = probe.primaryAddress || probe.addresses?.[0] || probe.lastAddress || "-";
  const canRemove = linkedServers.length === 0;
  const updateNotice = probe.updateAvailable
    ? `
      <div class="probe-update-notice">
        <strong>Atualizacao disponivel</strong>
        <span>Este collector esta em ${escapeHtml(probe.version || "-")} e a versao atual e ${escapeHtml(probe.latestVersion || "-")}.</span>
      </div>
    `
    : "";
  els.probeDetailPanel.innerHTML = `
    <div class="probe-detail-header">
      <div>
        <h3>${platformIcon(probe.platform)}${escapeHtml(probe.name || probe.id)}</h3>
        <span>${escapeHtml(probe.id)} · ${probeStatusLabel(probe.status)}</span>
      </div>
      <div class="probe-detail-badges">
        <span class="status-badge ${probe.status === "stale" ? "probe_stale" : probe.status || "unknown"}">${probeStatusLabel(probe.status)}</span>
        ${probeVersionBadge(probe)}
      </div>
    </div>

    ${updateNotice}

    <div class="probe-detail-grid">
      <div class="detail-stat"><span>Ultimo contato</span><strong>${formatDate(probe.lastSeenAt)}</strong></div>
      <div class="detail-stat"><span>IP principal</span><strong>${escapeHtml(address)}</strong></div>
      <div class="detail-stat"><span>MAC</span><strong>${escapeHtml(mac || "-")}</strong></div>
      <div class="detail-stat"><span>Hostname</span><strong>${escapeHtml(probe.hostName || "-")}</strong></div>
      <div class="detail-stat"><span>Sistema</span><strong>${platformIcon(probe.platform)}${platformLabel(probe.platform)}</strong></div>
      <div class="detail-stat"><span>Versao</span><strong>${escapeHtml(probe.version || "-")}</strong></div>
      <div class="detail-stat"><span>Versao esperada</span><strong>${escapeHtml(probe.latestVersion || "-")}</strong></div>
      <div class="detail-stat"><span>Atualizacao</span><strong>${escapeHtml(probeVersionLabel(probe))}</strong></div>
      <div class="detail-stat"><span>Endereco remoto</span><strong>${escapeHtml(probe.lastAddress || "-")}</strong></div>
      <div class="detail-stat"><span>Alvos vinculados</span><strong>${linkedServers.length}</strong></div>
    </div>

    <div class="probe-issue">
      <span>Ultima falha conhecida</span>
      <strong>${escapeHtml(probeLastIssue(probe, linkedServers))}</strong>
    </div>

    ${renderProbeHostMetrics(probe)}

    <div class="probe-targets">
      <div class="panel-title compact-title">
        <h3>Servidores vinculados</h3>
        <span>${linkedServers.length} ${linkedServers.length === 1 ? "alvo" : "alvos"}</span>
      </div>
      ${
        linkedServers.length
          ? linkedServers
              .map((server) => {
                const status = displayStatus(server);
                return `
                  <button class="probe-target-row" type="button" data-server-id="${server.id}">
                    <span class="status-pulse ${status}"></span>
                    ${platformIcon(server.platform)}
                    <span>
                      <strong>${escapeHtml(server.name)}</strong>
                      <small>${escapeHtml(server.hostname)} · ${environmentLabel(server.environment)}</small>
                    </span>
                    <span class="status-badge ${status}">${statusLabel(status)}</span>
                  </button>
                `;
              })
              .join("")
          : `<div class="empty-list">Nenhum servidor vinculado a este probe.</div>`
      }
    </div>

    <div class="install-command probe-repair-command">
      <div class="install-command-header">
        <strong>Atualizacao / reparo Linux</strong>
        <button class="ghost-button compact" type="button" data-action="copy-probe-repair" data-probe-id="${escapeHtml(probe.id)}">Copiar comando</button>
      </div>
      <code>${escapeHtml(reinstallCommand)}</code>
    </div>

    <div class="probe-windows-update">
      <strong>Windows</strong>
      <span>Baixe o instalador Windows e use Reparar/Instalar mantendo URL, ID e token. A versao sera atualizada no proximo contato do collector.</span>
      <a class="ghost-button compact download-link" href="/downloads/probe/windows-installer" download>Baixar instalador</a>
    </div>

    <div class="probe-actions">
      <button class="danger-button compact" type="button" data-action="delete-probe" data-probe-id="${escapeHtml(probe.id)}" ${canRemove ? "" : "disabled"}>
        Remover probe antigo
      </button>
      <span>${canRemove ? "Remove um cadastro sem alvos ativos." : "Reatribua ou remova os servidores vinculados antes de excluir."}</span>
    </div>
  `;
}

function renderProbes() {
  if (!els.probeTokenValue || !isAdmin()) return;
  const token = probeToken();
  const installDefaults = probeInstallTargetDefaults(state.probeInstallTarget);
  els.probeTokenValue.value = token;
  if (els.probeInstallCommandTitle) els.probeInstallCommandTitle.textContent = installDefaults.title;
  if (els.probeInstallCommandHint) els.probeInstallCommandHint.textContent = installDefaults.hint;
  document.querySelectorAll("[data-probe-install-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.probeInstallTarget === state.probeInstallTarget);
  });
  els.probeInstallCommand.textContent = token ? probeInstallCommand() : "Token ainda nao disponivel.";
  els.probeCount.textContent = `${state.probes.length} ${state.probes.length === 1 ? "probe conectado" : "probes conectados"}`;
  if (state.selectedProbeId && !state.probes.some((probe) => probe.id === state.selectedProbeId)) {
    state.selectedProbeId = null;
  }
  if (!state.selectedProbeId && state.probes.length) {
    state.selectedProbeId = state.probes[0].id;
  }

  els.probesList.innerHTML = state.probes.length
    ? state.probes
        .map(
          (probe) => `
            <button class="probe-card ${state.selectedProbeId === probe.id ? "selected" : ""}" type="button" data-probe-id="${escapeHtml(probe.id)}">
              <div>
                <strong>${platformIcon(probe.platform)}${escapeHtml(probe.name || probe.id)}</strong>
                <span>${escapeHtml(probe.id)} · ${platformLabel(probe.platform)} · v${escapeHtml(probe.version || "-")} · ${escapeHtml(probe.primaryAddress || probe.addresses?.[0] || probe.lastAddress || "sem IP")} · ${escapeHtml(primaryMac(probe) || "sem MAC")} · ${probe.targetCount || 0} ${probe.targetCount === 1 ? "alvo" : "alvos"}</span>
              </div>
              <div class="probe-card-meta">
                <strong><span class="status-badge ${probe.status === "stale" ? "probe_stale" : probe.status || "unknown"}">${probeStatusLabel(probe.status)}</span></strong>
                ${probe.updateAvailable ? probeVersionBadge(probe) : ""}
                <span>${formatDate(probe.lastSeenAt)}</span>
                <span>${escapeHtml(probe.lastAddress || "sem endereco")}</span>
              </div>
            </button>
          `
        )
        .join("")
    : `<div class="empty-list">Nenhum probe se conectou ainda.</div>`;
  renderProbeDetail(state.probes.find((probe) => probe.id === state.selectedProbeId) || null);
}

function render() {
  updateTopbarContext();
  updateMetricsVisibility();
  updateActiveFilterCount();
  renderMetrics();
  renderExecutiveDashboard();
  renderCompanyNav();
  renderServers();
  renderDetail();
  renderTimeline();
  renderAlerts();
  renderGroups();
  renderProbes();
  renderUsers();
  renderBrandingForm();
  renderAlertSettingsForm();
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
  if (alertSettings().soundAlertsEnabled) playAlertTone();

  if (
    alertSettings().browserNotificationsEnabled &&
    state.notificationsEnabled &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    new Notification(title, {
      body: message,
      tag: event.serverId,
      requireInteraction: true
    });
  }
}

function openDialog(server = null) {
  els.serverForm.reset();
  if (els.serverChildIds) els.serverChildIds.innerHTML = "";
  renderGroupOptions();
  renderProbeOptions();
  els.serverId.value = server?.id || "";
  els.dialogTitle.textContent = server ? "Editar servidor" : "Adicionar servidor";
  els.serverName.value = server?.name || "";
  els.serverHostname.value = server?.hostname || "";
  els.serverEnvironment.value = server?.environment || "production";
  els.serverCheckSource.value = server?.checkSource || "serverwatch";
  els.serverNodeType.value = server?.nodeType || "server";
  els.serverInfrastructurePlatform.value = server?.infrastructurePlatform || "none";
  els.serverGroup.value = server?.groupId || "";
  els.serverLocation.value = server?.location || "";
  els.serverInterval.value = server?.checkInterval || 10;
  els.serverThreshold.value = server?.failureThreshold || 2;
  if (server?.probeId && state.probes.some((probe) => probe.id === server.probeId)) {
    els.serverProbeId.value = server.probeId;
  }
  renderParentOptions(server?.id || "");
  els.serverParentId.value = server?.parentId || "";
  els.serverTags.value = (server?.tags || []).join(", ");
  els.serverDescription.value = server?.description || "";
  toggleProbeOptions();
  toggleVirtualizerChildrenOptions();
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

function serverUpdatePayload(server, overrides = {}) {
  return {
    name: server.name,
    hostname: server.hostname,
    checkSource: server.checkSource,
    probeId: server.probeId || "",
    nodeType: server.nodeType || "server",
    infrastructurePlatform: server.infrastructurePlatform || "none",
    parentId: server.parentId || null,
    environment: server.environment || "production",
    groupId: server.groupId || null,
    location: server.location || "",
    checkInterval: server.checkInterval || 10,
    failureThreshold: server.failureThreshold || 2,
    tags: server.tags || [],
    description: server.description || "",
    ...overrides
  };
}

async function syncVirtualizerChildren(parentId) {
  if (els.serverNodeType.value !== "hypervisor" || !els.serverChildIds) return 0;
  const selected = new Set(selectedVirtualizerChildIds());
  const candidates = virtualizerChildCandidates(parentId);
  let updated = 0;

  for (const server of candidates) {
    const shouldAttach = selected.has(server.id);
    const shouldDetach = !shouldAttach && server.parentId === parentId;
    if (!shouldAttach && !shouldDetach) continue;

    const payload = serverUpdatePayload(server, {
      parentId: shouldAttach ? parentId : null,
      nodeType: shouldAttach ? "vm" : server.nodeType
    });
    await api(`/api/servers/${server.id}`, { method: "PUT", body: JSON.stringify(payload) });
    updated += 1;
  }

  return updated;
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
    nodeType: els.serverNodeType.value,
    infrastructurePlatform: els.serverInfrastructurePlatform.value,
    parentId: els.serverParentId.value || null,
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
    const childUpdates = await syncVirtualizerChildren(saved.id);
    state.selectedServerId = saved.id;
    closeDialog();
    showToast(
      "Servidor salvo",
      childUpdates ? `${saved.name} salvo. ${childUpdates} VM${childUpdates === 1 ? "" : "s"} atualizada${childUpdates === 1 ? "" : "s"}.` : `${saved.name} entrou no monitoramento.`
    );
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

function fallbackCopyText(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function copyText(value, successMessage) {
  if (!value) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else if (!fallbackCopyText(value)) {
      throw new Error("Clipboard fallback failed.");
    }
    showToast("Copiado", successMessage);
  } catch {
    showToast("Falha ao copiar", "Selecione o texto manualmente e copie com Ctrl+C.");
  }
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
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (button.hidden) return;
      setActiveView(button.dataset.view);
    });
  });

  document.querySelectorAll("[data-view-link]").forEach((card) => {
    card.addEventListener("click", () => activateLinkedView(card));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activateLinkedView(card);
    });
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filters.status = button.dataset.status;
      updateActiveFilterCount();
      renderMetrics();
      renderServers();
    });
  });

  els.searchInput.addEventListener("input", () => {
    state.filters.query = els.searchInput.value.trim();
    updateActiveFilterCount();
    renderMetrics();
    renderServers();
  });

  els.environmentFilter.addEventListener("change", () => {
    state.filters.environment = els.environmentFilter.value;
    updateActiveFilterCount();
    renderMetrics();
    renderServers();
  });

  els.groupFilter.addEventListener("change", () => {
    state.filters.groupId = els.groupFilter.value;
    updateActiveFilterCount();
    render();
  });

  els.historyServerFilter?.addEventListener("change", () => {
    state.historyFilters.serverId = els.historyServerFilter.value;
    renderTimeline();
  });

  els.historyCategoryFilter?.addEventListener("change", () => {
    state.historyFilters.category = els.historyCategoryFilter.value;
    renderTimeline();
  });

  els.alertGroupFilter?.addEventListener("change", () => {
    state.alertFilters.groupId = els.alertGroupFilter.value;
    renderAlerts();
  });

  els.alertStatusFilter?.addEventListener("change", () => {
    state.alertFilters.status = els.alertStatusFilter.value;
    renderAlerts();
  });

  els.alertTypeFilter?.addEventListener("change", () => {
    state.alertFilters.type = els.alertTypeFilter.value;
    renderAlerts();
  });

  els.clearFilters?.addEventListener("click", () => {
    state.filters.status = "all";
    state.filters.environment = "all";
    state.filters.groupId = "all";
    state.filters.query = "";
    els.searchInput.value = "";
    els.environmentFilter.value = "all";
    els.groupFilter.value = "all";
    document.querySelectorAll(".segment").forEach((item) => {
      item.classList.toggle("active", item.dataset.status === "all");
    });
    render();
  });

  els.companyNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-company-id]");
    if (!button) return;
    state.filters.groupId = button.dataset.companyId;
    els.groupFilter.value = state.filters.groupId;
    setActiveView("dashboard");
    render();
  });

  els.executiveDashboard?.addEventListener("click", (event) => {
    const alertGroupButton = event.target.closest("[data-alert-group-id]");
    if (alertGroupButton?.dataset.alertGroupId) {
      state.alertFilters.groupId = alertGroupButton.dataset.alertGroupId;
      state.alertFilters.status = "open";
      state.alertFilters.type = "all";
      if (els.alertGroupFilter) els.alertGroupFilter.value = state.alertFilters.groupId;
      if (els.alertStatusFilter) els.alertStatusFilter.value = state.alertFilters.status;
      if (els.alertTypeFilter) els.alertTypeFilter.value = state.alertFilters.type;
      setActiveView("alerts");
      renderAlerts();
      return;
    }

    const serverButton = event.target.closest("[data-server-id]");
    if (serverButton?.dataset.serverId) {
      state.selectedServerId = serverButton.dataset.serverId;
      setActiveView("dashboard");
      render();
      return;
    }
    const companyButton = event.target.closest("[data-company-id]");
    if (companyButton?.dataset.companyId) {
      state.filters.groupId = companyButton.dataset.companyId;
      els.groupFilter.value = state.filters.groupId;
      setActiveView("dashboard");
      render();
    }
  });

  document.querySelector("#openServerForm").addEventListener("click", () => openDialog());
  document.querySelector("#closeDialog").addEventListener("click", closeDialog);
  document.querySelector("#cancelForm").addEventListener("click", closeDialog);
  els.serverCheckSource.addEventListener("change", toggleProbeOptions);
  els.serverProbeId.addEventListener("change", () => applySelectedProbeDefaults({ force: true }));
  els.serverNodeType.addEventListener("change", toggleVirtualizerChildrenOptions);
  els.serverParentId.addEventListener("change", () => {
    if (els.serverParentId.value) {
      els.serverNodeType.value = "vm";
      toggleVirtualizerChildrenOptions();
    }
  });
  els.toggleTopologyAll?.addEventListener("click", () => {
    const ids = expandableTopologyIds();
    if (!ids.length) return;
    const allExpanded = ids.every((id) => state.topologyExpanded.has(id));
    ids.forEach((id) => {
      if (allExpanded) state.topologyExpanded.delete(id);
      else state.topologyExpanded.add(id);
    });
    renderServers();
  });
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

  document.querySelectorAll("[data-probe-install-target]").forEach((button) => {
    button.addEventListener("click", () => {
      state.probeInstallTarget = button.dataset.probeInstallTarget === "proxmox" ? "proxmox" : "linux";
      renderProbes();
    });
  });

  els.probesList?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-probe-id]");
    if (!card) return;
    state.selectedProbeId = card.dataset.probeId;
    renderProbes();
  });

  els.probeDetailPanel?.addEventListener("click", async (event) => {
    const serverRow = event.target.closest("[data-server-id]");
    if (serverRow) {
      state.selectedServerId = serverRow.dataset.serverId;
      setActiveView("dashboard");
      render();
      return;
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;
    const probe = state.probes.find((item) => item.id === button.dataset.probeId);
    if (!probe) return;

    if (button.dataset.action === "copy-probe-repair") {
      copyText(probeInstallCommandFor(probe), "Comando de reparo do probe copiado.");
      return;
    }

    if (button.dataset.action === "delete-probe") {
      const confirmed = window.confirm(`Remover o probe "${probe.name || probe.id}"?\n\nUse isto apenas para cadastros antigos sem servidores vinculados.`);
      if (!confirmed) return;
      try {
        await api(`/api/probes/${encodeURIComponent(probe.id)}`, { method: "DELETE" });
        state.probes = state.probes.filter((item) => item.id !== probe.id);
        state.selectedProbeId = state.probes[0]?.id || null;
        renderProbeOptions();
        renderProbes();
        showToast("Probe removido", `${probe.name || probe.id} saiu da lista de collectors.`);
      } catch (error) {
        showToast("Nao foi possivel remover", error.message);
      }
    }
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
  els.alertSettingsForm?.addEventListener("submit", submitAlertSettings);
  els.removeBrandLogo?.addEventListener("click", async () => {
    try {
      const settings = await api("/api/settings/branding", {
        method: "PUT",
        body: JSON.stringify({
          brandName: els.brandNameInput.value,
          brandSubtitle: els.brandSubtitleInput.value,
          logoDataUrl: "",
          theme: document.querySelector('input[name="themeMode"]:checked')?.value || branding().theme
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
    if (!isAdmin()) return;
    const button = event.target.closest("[data-group-action]");
    if (!button) return;
    const group = state.groups.find((item) => item.id === button.dataset.id);
    if (group && button.dataset.groupAction === "edit") openGroupDialog(group);
  });

  els.serverList.addEventListener("click", (event) => {
    const topologyToggle = event.target.closest("[data-topology-toggle]");
    if (topologyToggle) {
      event.preventDefault();
      event.stopPropagation();
      const serverId = topologyToggle.dataset.topologyToggle;
      if (state.topologyExpanded.has(serverId)) state.topologyExpanded.delete(serverId);
      else state.topologyExpanded.add(serverId);
      renderServers();
      return;
    }

    const row = event.target.closest("[data-server-id]");
    if (!row) return;
    state.selectedServerId = row.dataset.serverId;
    renderServers();
    renderDetail();
  });

  els.detailPanel.addEventListener("click", async (event) => {
    if (!isAdmin()) return;
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

  els.alertsList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-alert-action]");
    if (!button) return;
    const alert = state.alerts.find((item) => item.id === button.dataset.alertId);
    if (!alert) return;
    if (button.dataset.alertAction === "ack") {
      const note = window.prompt("Observacao do reconhecimento (opcional):", "") || "";
      try {
        const updated = await api(`/api/alerts/${encodeURIComponent(alert.id)}/ack`, {
          method: "POST",
          body: JSON.stringify({ note })
        });
        state.alerts = state.alerts.map((item) => (item.id === updated.id ? updated : item));
        renderAlerts();
        renderMetrics();
        showToast("Alerta reconhecido", `${alert.serverName} foi marcado como tratado.`);
      } catch (error) {
        showToast("Falha ao reconhecer alerta", error.message);
      }
    }
  });

  document.querySelector("#notifyButton").addEventListener("click", async () => {
    if (!alertSettings().browserNotificationsEnabled) {
      showToast("Notificacoes desativadas", "Ative notificacoes do navegador nas configuracoes de alertas.");
      return;
    }
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
    renderExecutiveDashboard();
    showToast("Alertas atualizados", "Todos os alertas foram marcados como lidos.");
  });

  document.querySelector("#clearAlertsHistory")?.addEventListener("click", async () => {
    if (!window.confirm("Limpar todo o historico de alertas?\n\nOs eventos tecnicos continuam preservados no Historico.")) return;
    try {
      await api("/api/alerts", { method: "DELETE" });
      state.alerts = [];
      render();
      showToast("Historico limpo", "Todos os alertas foram removidos.");
    } catch (error) {
      showToast("Falha ao limpar alertas", error.message);
    }
  });

  window.addEventListener("popstate", () => {
    if (!state.currentUser) return;
    syncViewFromLocation({ replace: false });
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
