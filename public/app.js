const state = {
  servers: [],
  groups: [],
  probes: [],
  networkDevices: [],
  networkLinks: [],
  networkEvents: [],
  users: [],
  currentUser: null,
  settings: {},
  events: [],
  alerts: [],
  summary: {},
  selectedServerId: null,
  selectedServerGroupId: null,
  selectedGroupId: null,
  selectedProbeId: null,
  probeFilter: "all",
  selectedNetworkLinkId: null,
  selectedNetworkGroupId: null,
  companyScopeQuery: "",
  groupLogoDraft: "",
  themeDraft: null,
  topologyExpanded: new Set(),
  selectedBackupClientId: null,
  backupLinkEditorOpen: null,
  probeInstallTarget: "linux",
  commandGeneratorMode: "server",
  commandGeneratorMikrotikUplinks: [
    { name: "Link 1 - Operadora", interfaceName: "ether1-WAN", gateway: "192.0.2.1", prefix: "30", target: "4.2.2.2" },
    { name: "Link 2 - Operadora", interfaceName: "ether2-WAN", gateway: "198.51.100.1", prefix: "30", target: "149.112.112.112" }
  ],
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

const PROBE_PUBLIC_ORIGIN = "http://sw.grupoinsideti.com.br:3000";
const DEFAULT_BRAND_LOGO = "/assets/brand/serverwatch-mark-transparent-256.png?v=20260619-newlogo";

const els = {
  bootScreen: document.querySelector("#bootScreen"),
  authScreen: document.querySelector("#authScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  passwordChangeDialog: document.querySelector("#passwordChangeDialog"),
  passwordChangeForm: document.querySelector("#passwordChangeForm"),
  currentPassword: document.querySelector("#currentPassword"),
  newPassword: document.querySelector("#newPassword"),
  confirmNewPassword: document.querySelector("#confirmNewPassword"),
  passwordChangeError: document.querySelector("#passwordChangeError"),
  currentUserName: document.querySelector("#currentUserName"),
  logoutButton: document.querySelector("#logoutButton"),
  notificationMenu: document.querySelector("#notificationMenu"),
  notificationBadge: document.querySelector("#notificationBadge"),
  notificationSummary: document.querySelector("#notificationSummary"),
  notificationList: document.querySelector("#notificationList"),
  enableBrowserNotifications: document.querySelector("#enableBrowserNotifications"),
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
  simpleDashboardContent: document.querySelector("#simpleDashboardContent"),
  dashboardScopeTitle: document.querySelector("#dashboardScopeTitle"),
  dashboardScopeMeta: document.querySelector("#dashboardScopeMeta"),
  companyScopeSummary: document.querySelector("#companyScopeSummary"),
  companyScopeSearch: document.querySelector("#companyScopeSearch"),
  companyScopeList: document.querySelector("#companyScopeList"),
  companyScopeMenu: document.querySelector("#companyScopeMenu"),
  executiveDashboard: document.querySelector("#executiveDashboard"),
  executiveGrid: document.querySelector("#executiveGrid"),
  serverList: document.querySelector("#serverList"),
  serverCount: document.querySelector("#serverCount"),
  toggleTopologyAll: document.querySelector("#toggleTopologyAll"),
  detailPanel: document.querySelector("#detailPanel"),
  serverDirectoryList: document.querySelector("#serverDirectoryList"),
  serverDirectoryCount: document.querySelector("#serverDirectoryCount"),
  serverProfilePanel: document.querySelector("#serverProfilePanel"),
  networkLinkCount: document.querySelector("#networkLinkCount"),
  networkDeviceCount: document.querySelector("#networkDeviceCount"),
  networkOnlineCount: document.querySelector("#networkOnlineCount"),
  networkDegradedCount: document.querySelector("#networkDegradedCount"),
  networkOfflineCount: document.querySelector("#networkOfflineCount"),
  networkProbeStaleCount: document.querySelector("#networkProbeStaleCount"),
  networkLinksList: document.querySelector("#networkLinksList"),
  networkDetailPanel: document.querySelector("#networkDetailPanel"),
  linkProbeInstallCommand: document.querySelector("#linkProbeInstallCommand"),
  copyLinkProbeInstallCommand: document.querySelector("#copyLinkProbeInstallCommand"),
  mikrotikProbeInstallCommand: document.querySelector("#mikrotikProbeInstallCommand"),
  copyMikrotikProbeInstallCommand: document.querySelector("#copyMikrotikProbeInstallCommand"),
  installGuideDialog: document.querySelector("#installGuideDialog"),
  guideServerProbeCommand: document.querySelector("#guideServerProbeCommand"),
  guideLinkProbeCommand: document.querySelector("#guideLinkProbeCommand"),
  guideMikrotikProbeCommand: document.querySelector("#guideMikrotikProbeCommand"),
  openCommandGeneratorButton: document.querySelector("#openCommandGeneratorButton"),
  commandGeneratorDialog: document.querySelector("#commandGeneratorDialog"),
  closeCommandGeneratorDialog: document.querySelector("#closeCommandGeneratorDialog"),
  cancelCommandGeneratorDialog: document.querySelector("#cancelCommandGeneratorDialog"),
  refreshGeneratedCommand: document.querySelector("#refreshGeneratedCommand"),
  copyGeneratedCommand: document.querySelector("#copyGeneratedCommand"),
  generatedCommandOutput: document.querySelector("#generatedCommandOutput"),
  commandServerProbeId: document.querySelector("#commandServerProbeId"),
  commandServerProbeName: document.querySelector("#commandServerProbeName"),
  commandServerTarget: document.querySelector("#commandServerTarget"),
  commandServerMode: document.querySelector("#commandServerMode"),
  commandLinkAgentId: document.querySelector("#commandLinkAgentId"),
  commandLinkName: document.querySelector("#commandLinkName"),
  commandLinkTargets: document.querySelector("#commandLinkTargets"),
  commandLinkInterface: document.querySelector("#commandLinkInterface"),
  commandLinkSourceIp: document.querySelector("#commandLinkSourceIp"),
  commandLinkInterval: document.querySelector("#commandLinkInterval"),
  commandLinkPingCount: document.querySelector("#commandLinkPingCount"),
  commandLinkThreshold: document.querySelector("#commandLinkThreshold"),
  commandLinkPingTimeout: document.querySelector("#commandLinkPingTimeout"),
  commandMikrotikAgentId: document.querySelector("#commandMikrotikAgentId"),
  commandMikrotikDeviceName: document.querySelector("#commandMikrotikDeviceName"),
  commandMikrotikGroupName: document.querySelector("#commandMikrotikGroupName"),
  commandMikrotikInterval: document.querySelector("#commandMikrotikInterval"),
  addCommandMikrotikUplink: document.querySelector("#addCommandMikrotikUplink"),
  commandMikrotikUplinkList: document.querySelector("#commandMikrotikUplinkList"),
  networkDeviceDialog: document.querySelector("#networkDeviceDialog"),
  networkDeviceForm: document.querySelector("#networkDeviceForm"),
  networkDeviceDialogTitle: document.querySelector("#networkDeviceDialogTitle"),
  networkDeviceId: document.querySelector("#networkDeviceId"),
  networkDeviceName: document.querySelector("#networkDeviceName"),
  networkDeviceVendor: document.querySelector("#networkDeviceVendor"),
  networkDeviceModel: document.querySelector("#networkDeviceModel"),
  networkDeviceManagementIp: document.querySelector("#networkDeviceManagementIp"),
  networkDeviceGroup: document.querySelector("#networkDeviceGroup"),
  networkDeviceProbe: document.querySelector("#networkDeviceProbe"),
  networkDeviceNotes: document.querySelector("#networkDeviceNotes"),
  networkLinkDialog: document.querySelector("#networkLinkDialog"),
  networkLinkForm: document.querySelector("#networkLinkForm"),
  networkLinkDialogTitle: document.querySelector("#networkLinkDialogTitle"),
  networkLinkId: document.querySelector("#networkLinkId"),
  networkLinkName: document.querySelector("#networkLinkName"),
  networkLinkProvider: document.querySelector("#networkLinkProvider"),
  networkLinkDevice: document.querySelector("#networkLinkDevice"),
  networkLinkType: document.querySelector("#networkLinkType"),
  networkLinkTarget: document.querySelector("#networkLinkTarget"),
  addNetworkTarget: document.querySelector("#addNetworkTarget"),
  networkLinkInterface: document.querySelector("#networkLinkInterface"),
  networkLinkExpectedPublicIp: document.querySelector("#networkLinkExpectedPublicIp"),
  networkLinkExpectedPrefix: document.querySelector("#networkLinkExpectedPrefix"),
  networkLinkGroup: document.querySelector("#networkLinkGroup"),
  networkLinkProbe: document.querySelector("#networkLinkProbe"),
  networkLinkInterval: document.querySelector("#networkLinkInterval"),
  networkLinkThreshold: document.querySelector("#networkLinkThreshold"),
  networkLinkLatencyLimit: document.querySelector("#networkLinkLatencyLimit"),
  networkLinkLossLimit: document.querySelector("#networkLinkLossLimit"),
  networkLinkNotes: document.querySelector("#networkLinkNotes"),
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
  themeSettingsForm: document.querySelector("#themeSettingsForm"),
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
  userCompanyFieldset: document.querySelector("#userCompanyFieldset"),
  userSectionsFieldset: document.querySelector("#userSectionsFieldset"),
  userCompanyList: document.querySelector("#userCompanyList"),
  userFormError: document.querySelector("#userFormError"),
  probeCount: document.querySelector("#probeCount"),
  updateOutdatedProbes: document.querySelector("#updateOutdatedProbes"),
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
  groupLogoInput: document.querySelector("#groupLogoInput"),
  groupLogoPreview: document.querySelector("#groupLogoPreview"),
  groupLogoPreviewName: document.querySelector("#groupLogoPreviewName"),
  removeGroupLogo: document.querySelector("#removeGroupLogo"),
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
  serverDescription: document.querySelector("#serverDescription"),
  backupsHero: document.querySelector("#backupsHero"),
  backupsKpiRow: document.querySelector("#backupsKpiRow"),
  backupsDestinationMeta: document.querySelector("#backupsDestinationMeta"),
  backupsDestinationChart: document.querySelector("#backupsDestinationChart"),
  backupsDestinationFoot: document.querySelector("#backupsDestinationFoot"),
  backupsDonutMeta: document.querySelector("#backupsDonutMeta"),
  backupsStatusDonut: document.querySelector("#backupsStatusDonut"),
  backupsStatusDonutValue: document.querySelector("#backupsStatusDonutValue"),
  backupsDonutLegend: document.querySelector("#backupsDonutLegend"),
  backupsSetsMeta: document.querySelector("#backupsSetsMeta"),
  backupsSetsSummary: document.querySelector("#backupsSetsSummary"),
  backupsSetsList: document.querySelector("#backupsSetsList"),
  backupsAttentionMeta: document.querySelector("#backupsAttentionMeta"),
  backupsAttentionList: document.querySelector("#backupsAttentionList"),
  backupsHealthRows: document.querySelector("#backupsHealthRows"),
  backupsClientGrid: document.querySelector("#backupsClientGrid"),
  backupsClientCountHint: document.querySelector("#backupsClientCountHint"),
  backupsEmptyState: document.querySelector("#backupsEmptyState"),
  backupsProfileLayout: document.querySelector("#backupsProfileLayout"),
  backupsDirectoryCount: document.querySelector("#backupsDirectoryCount"),
  backupsDirectoryList: document.querySelector("#backupsDirectoryList"),
  backupsProfilePanel: document.querySelector("#backupsProfilePanel"),
  backupsSyncMeta: document.querySelector("#backupsSyncMeta"),
  refreshBackupsButton: document.querySelector("#refreshBackupsButton"),
  backupErrorsDialog: document.querySelector("#backupErrorsDialog"),
  backupErrorsList: document.querySelector("#backupErrorsList"),
  closeBackupErrorsDialog: document.querySelector("#closeBackupErrorsDialog"),
  offlineServersDialog: document.querySelector("#offlineServersDialog"),
  offlineServersList: document.querySelector("#offlineServersList"),
  closeOfflineServersDialog: document.querySelector("#closeOfflineServersDialog")
};

const VIEW_ROUTES = {
  dashboard: "/dashboard",
  servers: "/servidores",
  networks: "/redes",
  backups: "/backups",
  admin: "/admin",
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

function canSeeUngrouped() {
  return isAdmin();
}

function branding() {
  const base = {
    brandName: state.settings.brandName || "ServerWatch",
    brandSubtitle: state.settings.brandSubtitle || "MVP LAN",
    logoDataUrl: state.settings.logoDataUrl || DEFAULT_BRAND_LOGO,
    theme: state.settings.theme === "dark" ? "dark" : "light"
  };
  if (state.currentUser?.role === "user") {
    const linkedGroupIds = Array.isArray(state.currentUser.groupIds) ? state.currentUser.groupIds : [];
    if (linkedGroupIds.length === 1) {
      const group = state.groups.find((item) => item.id === linkedGroupIds[0]);
      if (group?.logoDataUrl) {
        return {
          ...base,
          brandName: group.name || base.brandName,
          brandSubtitle: base.brandName,
          logoDataUrl: group.logoDataUrl
        };
      }
    }
  }
  return {
    ...base
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
  const raw = String(name || "SW").trim();
  const camelInitials = raw.match(/[A-Z]/g)?.join("") || "";
  if (camelInitials.length >= 2) return camelInitials.slice(0, 3);
  return raw
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

function brandMarkHtml(name, logoDataUrl = "", extraClass = "") {
  const safeLogo = String(logoDataUrl || "");
  return `
    <span class="brand-mark ${safeLogo ? "has-image" : ""} ${extraClass}" style="${safeLogo ? `background-image:url('${escapeHtml(safeLogo)}')` : ""}" aria-hidden="true">
      <span class="brand-initials">${escapeHtml(brandInitials(name))}</span>
    </span>
  `;
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

const SECTION_KEYS = ["servers", "networks", "backups", "alerts", "history"];

function canSeeSection(section) {
  if (isAdmin()) return true;
  const allowed = state.currentUser?.allowedSections;
  return Array.isArray(allowed) ? allowed.includes(section) : true;
}

function showApp(user) {
  state.currentUser = user;
  els.bootScreen.hidden = true;
  els.authScreen.hidden = true;
  els.appShell.hidden = false;
  els.currentUserName.textContent = `${user.name} · ${user.role === "admin" ? "Admin" : "Usuario"}`;
  document.querySelectorAll(".admin-only").forEach((item) => {
    item.hidden = !isAdmin();
  });
  SECTION_KEYS.forEach((section) => {
    const tab = document.querySelector(`.nav-tab[data-view="${section}"]`);
    if (tab) tab.hidden = !canSeeSection(section);
  });
  syncViewFromLocation({ replace: true });
}

function requirePasswordChange() {
  if (!els.passwordChangeDialog || els.passwordChangeDialog.open) return;
  els.passwordChangeError.textContent = "";
  els.currentPassword.value = "";
  els.newPassword.value = "";
  els.confirmNewPassword.value = "";
  els.passwordChangeDialog.showModal();
  els.currentPassword.focus();
}

async function submitPasswordChange(event) {
  event.preventDefault();
  els.passwordChangeError.textContent = "";
  const currentPassword = els.currentPassword.value;
  const newPassword = els.newPassword.value;
  const confirmPassword = els.confirmNewPassword.value;

  if (newPassword.length < 8) {
    els.passwordChangeError.textContent = "A nova senha deve ter pelo menos 8 caracteres.";
    return;
  }
  if (newPassword !== confirmPassword) {
    els.passwordChangeError.textContent = "A confirmacao da senha nao confere.";
    return;
  }

  try {
    const result = await api("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    state.currentUser = result.user;
    els.passwordChangeDialog.close();
    showApp(result.user);
    showToast("Senha atualizada", "O acesso ao dashboard foi liberado.");
  } catch (error) {
    els.passwordChangeError.textContent = error.message;
  }
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
  if (
    server.checkSource === "probe" &&
    server.probeStatus === "stale" &&
    server.currentStatus !== "offline"
  ) {
    return "probe_stale";
  }
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

function probeFallbackLabel(status) {
  return {
    confirmed_online: "Online confirmado pela central",
    confirmed_offline: "Offline confirmado",
    central_failed: "Ping central nao confirmou",
    unconfirmed: "Status nao confirmado"
  }[status || ""] || "Sem verificacao alternativa";
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

function probeUpdateStatusLabel(status) {
  return {
    pending: "Atualizacao pendente",
    running: "Atualizando",
    succeeded: "Atualizado remotamente",
    failed: "Falha na atualizacao",
    unsupported: "Atualizacao manual"
  }[status || ""] || "Sem atualizacao remota";
}

function probeUpdateStatusBadge(probe) {
  const request = probe?.updateRequest;
  if (!request) return "";
  return `<span class="status-badge probe-update-status ${escapeHtml(request.status)}">${escapeHtml(probeUpdateStatusLabel(request.status))}</span>`;
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

function groupLogo(groupId) {
  return state.groups.find((group) => group.id === groupId)?.logoDataUrl || "";
}

function groupScopeLabel(groupId = state.filters.groupId) {
  if (groupId === "all") return "Visao geral";
  if (groupId === "none") return "Sem empresa";
  return groupLabel(groupId);
}

function groupIdMatches(scopeId, groupId) {
  return scopeId === "all" || (scopeId === "none" && !groupId) || groupId === scopeId;
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

function metricTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "neutral";
  if (number >= 90) return "danger";
  if (number >= 70) return "warning";
  return "success";
}

function availabilityTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "neutral";
  if (number >= 95) return "success";
  if (number >= 80) return "warning";
  return "danger";
}

function metricBar(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const percent = Math.max(0, Math.min(100, Math.round(number)));
  return `<div class="metric-bar ${metricTone(number)}" aria-hidden="true"><span style="width:${percent}%"></span></div>`;
}

function latencyTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "neutral";
  if (number >= 250) return "danger";
  if (number >= 100) return "warning";
  return "success";
}

function latencyPill(value) {
  const label = value === null || value === undefined ? "-" : `${value} ms`;
  return `<span class="latency-pill ${latencyTone(value)}"><i aria-hidden="true"></i>${escapeHtml(label)}</span>`;
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

const alphaCollator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base"
});

function alphaText(value) {
  return String(value ?? "").trim();
}

function compareAlpha(left, right) {
  return alphaCollator.compare(alphaText(left), alphaText(right));
}

function sortedByAlpha(items, getLabel) {
  return [...(items || [])].sort((left, right) => compareAlpha(getLabel(left), getLabel(right)));
}

function groupSortLabel(group) {
  return group?.name || "";
}

function serverSortLabel(server) {
  return server?.name || server?.hostname || server?.id || "";
}

function probeSortLabel(probe) {
  return probe?.name || probe?.hostName || probe?.id || "";
}

function networkLinkSortLabel(link) {
  return [link?.groupName || groupLabel(link?.groupId), link?.name || link?.provider || link?.id || ""].join(" ");
}

function networkDeviceSortLabel(device) {
  return device?.name || device?.managementIp || device?.id || "";
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
  state.networkDevices = payload.networkDevices || [];
  state.networkLinks = payload.networkLinks || [];
  state.networkEvents = payload.networkEvents || [];
  state.users = payload.users || [];
  state.currentUser = payload.currentUser || state.currentUser;
  state.settings = payload.settings || {};
  applyBranding();
  state.alerts = payload.alerts || [];
  state.events = payload.events || [];
  state.cloudBackup = payload.cloudBackup || null;
  if (state.selectedServerId && !state.servers.some((server) => server.id === state.selectedServerId)) {
    state.selectedServerId = null;
  }
  if (
    state.selectedServerGroupId &&
    state.selectedServerGroupId !== "none" &&
    !state.groups.some((group) => group.id === state.selectedServerGroupId)
  ) {
    state.selectedServerGroupId = null;
  }
  if (!state.selectedServerId && !state.selectedServerGroupId && state.servers.length) {
    state.selectedServerId = sortedByAlpha(state.servers, serverSortLabel)[0].id;
  }
  if (state.selectedNetworkLinkId && !state.networkLinks.some((link) => link.id === state.selectedNetworkLinkId)) {
    state.selectedNetworkLinkId = null;
  }
  if (state.selectedNetworkGroupId) {
    const groupStillExists =
      state.selectedNetworkGroupId === "none" ||
      state.networkLinks.some((link) => (link.groupId || "none") === state.selectedNetworkGroupId);
    if (!groupStillExists) state.selectedNetworkGroupId = null;
  }
  if (!state.selectedNetworkGroupId && !state.selectedNetworkLinkId && state.networkLinks.length) {
    state.selectedNetworkLinkId = sortedByAlpha(state.networkLinks, networkLinkSortLabel)[0].id;
  }
  renderGroupOptions();
  renderProbeOptions();
  render();
}

function activeViewName() {
  return document.querySelector(".view.active")?.id?.replace(/View$/, "") || "dashboard";
}

function viewFromPath(pathname = window.location.pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_VIEWS[normalized] || "dashboard";
}

function routeForView(viewName) {
  return VIEW_ROUTES[viewName] || VIEW_ROUTES.dashboard;
}

function primaryNavView(viewName) {
  return viewName;
}

function setActiveView(viewName, options = {}) {
  const { push = true, replace = false } = options;
  const requestedTab = document.querySelector(`.nav-tab[data-view="${viewName}"]`);
  const nextView = requestedTab?.hidden ? "dashboard" : viewName;
  const tab = document.querySelector(`.nav-tab[data-view="${nextView}"]`) || document.querySelector('[data-view="dashboard"]');
  if (!tab) return;
  const view = document.querySelector(`#${tab.dataset.view}View`);
  if (!view) return;

  document.querySelectorAll(".nav-tab").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  const primaryTab = document.querySelector(`.nav-tab[data-view="${primaryNavView(tab.dataset.view)}"]`) || tab;
  primaryTab.classList.add("active");
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
    servers: ["Inventario operacional", "Informacoes dos servidores"],
    networks: ["Monitoramento de redes", "Links e conectividade"],
    backups: ["Backups em nuvem", "Status dos jobs de backup"],
    admin: ["Gestao do sistema", "Painel administrativo"],
    groups: ["Organizacao operacional", "Empresas e grupos"],
    probes: ["Instalacao e coleta", "Probe Collector"],
    users: ["Controle de acesso", "Usuarios"],
    settings: ["Identidade do sistema", "Configuracoes"],
    history: ["Auditoria operacional", "Historico de eventos"],
    alerts: ["Incidentes e recuperacoes", "Historico de alertas"]
  };
  const [eyebrow, title] = titles[activeViewName()] || titles.dashboard;
  if (els.topbarEyebrow) els.topbarEyebrow.textContent = eyebrow;
  if (els.topbarTitle) els.topbarTitle.textContent = title;
}

function updateMetricsVisibility() {
  if (!els.metricsGrid) return;
  const viewName = activeViewName();
  els.metricsGrid.hidden = viewName !== "groups";
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
    if (state.selectedServerId === server.id) state.selectedServerId = sortedByAlpha(state.servers, serverSortLabel)[0]?.id || null;
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

let pendingRenderTimer = null;

function scheduleRender(delay = 400) {
  if (pendingRenderTimer) return;
  pendingRenderTimer = setTimeout(() => {
    pendingRenderTimer = null;
    render();
  }, delay);
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

  scheduleRender();
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
  const groupOptions = sortedByAlpha(state.groups, groupSortLabel)
    .map((group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`)
    .join("");

  if (els.groupFilter) {
    const current = els.groupFilter.value || state.filters.groupId;
    els.groupFilter.innerHTML = `
      <option value="all">Todas empresas</option>
      ${canSeeUngrouped() ? `<option value="none">Sem empresa</option>` : ""}
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
  for (const select of [els.networkDeviceGroup, els.networkLinkGroup]) {
    if (!select) continue;
    const current = select.value;
    select.innerHTML = `
      <option value="">Sem empresa</option>
      ${groupOptions}
    `;
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
  }
  if (els.networkLinkDevice) {
    const current = els.networkLinkDevice.value;
    els.networkLinkDevice.innerHTML = `
      <option value="">Sem dispositivo</option>
      ${sortedByAlpha(state.networkDevices, networkDeviceSortLabel).map((device) => `<option value="${escapeHtml(device.id)}">${escapeHtml(device.name)}</option>`).join("")}
    `;
    if ([...els.networkLinkDevice.options].some((option) => option.value === current)) {
      els.networkLinkDevice.value = current;
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
    ${canSeeUngrouped() ? `<option value="none">Sem empresa</option>` : ""}
    ${groupOptions || sortedByAlpha(state.groups, groupSortLabel).map((group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`).join("")}
  `;
  els.alertGroupFilter.value = [...els.alertGroupFilter.options].some((option) => option.value === current) ? current : "all";
  state.alertFilters.groupId = els.alertGroupFilter.value;
}

function renderParentOptions(currentServerId = "") {
  if (!els.serverParentId) return;
  const current = els.serverParentId.value;
  const candidates = sortedByAlpha(
    state.servers.filter((server) => !server.deletedAt && server.id !== currentServerId && server.nodeType === "hypervisor"),
    serverSortLabel
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
      (!server.parentId || server.parentId === currentServerId) &&
      (!currentServerId || !hasAncestor(currentServerId, server.id))
  );
}

function serverByFormParent() {
  return state.servers.find((server) => server.id === els.serverParentId?.value && !server.deletedAt) || null;
}

function applyParentCompanyDefault() {
  const parent = serverByFormParent();
  if (parent?.groupId && els.serverGroup) {
    els.serverGroup.value = parent.groupId;
  }
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
  const candidates = sortedByAlpha(virtualizerChildCandidates(currentServerId), serverSortLabel);
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
    for (const select of [els.networkDeviceProbe, els.networkLinkProbe]) {
      if (!select) continue;
      select.innerHTML = `<option value="">Nenhum probe instalado encontrado</option>`;
      select.disabled = true;
    }
    if (els.serverProbeHint) {
      els.serverProbeHint.textContent = "Instale o Probe Collector primeiro. Assim que ele se conectar, aparecera aqui.";
    }
    return;
  }

  els.serverProbeId.disabled = false;
  const probes = sortedByAlpha(state.probes, probeSortLabel);
  const probeOptions = probes
    .map((probe) => {
      const address = probe.primaryAddress || probe.addresses?.[0] || probe.lastAddress || "";
      const label = `${probe.name || probe.id} (${address || probe.id})`;
      return `<option value="${escapeHtml(probe.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  els.serverProbeId.innerHTML = probeOptions;
  els.serverProbeId.value = probes.some((probe) => probe.id === current) ? current : probes[0].id;
  for (const select of [els.networkDeviceProbe, els.networkLinkProbe]) {
    if (!select) continue;
    const previous = select.value;
    select.disabled = false;
    select.innerHTML = probeOptions;
    select.value = probes.some((probe) => probe.id === previous) ? previous : probes[0].id;
  }
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
  return groupIdMatches(state.filters.groupId, server.groupId);
}

function renderCompanyNav() {
  if (!els.companyScopeList) return;
  const noneCount = state.servers.filter((server) => !server.groupId).length;
  const noneOffline = state.servers.filter((server) => !server.groupId && server.isActive && displayStatus(server) === "offline").length;
  const companyButtons = sortedByAlpha(state.groups, groupSortLabel).map((group) => {
    const servers = state.servers.filter((server) => server.groupId === group.id);
    return {
      id: group.id,
      name: group.name,
      count: servers.length,
      offline: servers.filter((server) => server.isActive && displayStatus(server) === "offline").length
    };
  });
  const buttons = [
    {
      id: "all",
      name: "Visao geral",
      count: state.servers.length,
      offline: state.servers.filter((server) => server.isActive && displayStatus(server) === "offline").length
    },
    ...companyButtons,
    ...(canSeeUngrouped()
      ? [{
          id: "none",
          name: "Sem empresa",
          count: noneCount,
          offline: noneOffline
        }]
      : [])
  ];

  const scopedServers = state.servers.filter((server) => groupIdMatches(state.filters.groupId, server.groupId));
  const activeServers = scopedServers.filter((server) => server.isActive);
  const scopedLinks = (state.networkLinks || []).filter((link) => link.isActive !== false && groupIdMatches(state.filters.groupId, link.groupId));
  const currentLabel = groupScopeLabel();
  const currentOffline = activeServers.filter((server) => displayStatus(server) === "offline").length;
  const currentAttention = activeServers.filter((server) => ["offline", "probe_stale", "dependency_down"].includes(displayStatus(server))).length;
  if (els.dashboardScopeTitle) els.dashboardScopeTitle.textContent = currentLabel;
  if (els.dashboardScopeMeta) {
    els.dashboardScopeMeta.textContent =
      state.filters.groupId === "all"
        ? `${activeServers.length} servidores ativos, ${scopedLinks.length} links e ${currentAttention} itens em atencao.`
        : `${activeServers.length} servidores ativos, ${scopedLinks.length} links, ${currentOffline} offline.`;
  }
  if (els.companyScopeSummary) {
    els.companyScopeSummary.textContent = state.filters.groupId === "all" ? "Escolher empresa" : currentLabel;
  }
  document.querySelectorAll("[data-company-scope-id]").forEach((button) => {
    button.classList.toggle("active", button.dataset.companyScopeId === state.filters.groupId);
  });

  const query = state.companyScopeQuery.trim().toLowerCase();
  if (els.companyScopeSearch && document.activeElement !== els.companyScopeSearch) {
    els.companyScopeSearch.value = state.companyScopeQuery;
  }
  els.companyScopeList.innerHTML = buttons
    .filter((item) => item.id !== "none" || item.count > 0)
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .map(
      (item) => `
        <button class="company-scope-option ${state.filters.groupId === item.id ? "active" : ""}" type="button" data-company-id="${item.id}" title="${escapeHtml(item.name)}">
          <span>${escapeHtml(item.name)}</span>
          <strong>${item.offline ? `${item.offline} off` : `${item.count} itens`}</strong>
        </button>
      `
    )
    .join("") || `<div class="empty-list compact">Nenhuma empresa encontrada.</div>`;
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
  const alertsOpen = Number(state.summary.alertsOpen ?? 0);
  const availability = Number(state.summary.availability24h ?? 0);

  els.overviewScope.textContent = groupScopeLabel();
  els.metricTotal.textContent = activeTotal;
  els.metricOnline.textContent = counts.online;
  els.metricOffline.textContent = counts.offline;
  els.metricAvailability.textContent = `${state.summary.availability24h ?? 0}%`;
  els.metricAlerts.textContent = `${state.summary.alertsOpen ?? 0} alertas abertos`;

  const offlineCard = els.metricOffline.closest(".metric-card");
  offlineCard?.classList.toggle("has-alerts", alertsOpen > 0);
  offlineCard?.classList.toggle("is-zero", counts.offline === 0);
  const availabilityCard = els.metricAvailability.closest(".metric-card");
  availabilityCard?.classList.remove("availability-success", "availability-warning", "availability-danger", "availability-neutral");
  availabilityCard?.classList.add(`availability-${availabilityTone(availability)}`);

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

function eventClosest(event, selector) {
  const target = event?.target;
  if (target?.closest) return target.closest(selector);
  return target?.parentElement?.closest ? target.parentElement.closest(selector) : null;
}

function clickableCardAttrs(label = "") {
  const ariaLabel = label ? ` aria-label="${escapeHtml(label)}"` : "";
  return `tabindex="0" role="button"${ariaLabel}`;
}

function selectServer(serverId, options = {}) {
  if (!serverById(serverId)) return false;
  state.selectedServerId = serverId;
  state.selectedServerGroupId = null;
  if (options.view) {
    setActiveView(options.view);
    render();
    return true;
  }
  renderServerDirectory();
  renderServerProfile();
  return true;
}

function selectServerGroup(groupId) {
  state.selectedServerGroupId = groupId || null;
  state.selectedServerId = null;
  renderServerDirectory();
  renderServerProfile();
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

function boundedAvailability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function availabilityGaugeHtml(value, options = {}) {
  const bounded = boundedAvailability(value);
  const displayValue = Number.isFinite(Number(value)) ? `${bounded.toFixed(bounded % 1 ? 1 : 0)}%` : "-";
  const tone = availabilityTone(bounded);
  const angle = -90 + bounded * 1.8;
  const title = options.title || "Disponibilidade";
  const caption = options.caption || "baseada em eventos";
  return `
    <div class="availability-gauge availability-${tone}" aria-label="${escapeHtml(`${title}: ${displayValue}`)}">
      <svg viewBox="0 0 160 102" role="img" aria-hidden="true" focusable="false">
        <path class="gauge-track" pathLength="100" d="M 18 78 A 62 62 0 0 1 142 78"></path>
        <path class="gauge-value" pathLength="100" stroke-dasharray="${bounded} 100" d="M 18 78 A 62 62 0 0 1 142 78"></path>
        <line class="gauge-needle" x1="80" y1="78" x2="80" y2="34" transform="rotate(${angle} 80 78)"></line>
        <circle class="gauge-pin" cx="80" cy="78" r="5"></circle>
      </svg>
      <strong>${displayValue}</strong>
      <span>${escapeHtml(title)}</span>
      <small>${escapeHtml(caption)}</small>
    </div>
  `;
}

function captureSimpleDashboardScroll() {
  if (!els.simpleDashboardContent) return [];
  return Array.from(els.simpleDashboardContent.querySelectorAll(".simple-scroll-list")).map((element) => element.scrollTop);
}

function restoreSimpleDashboardScroll(scrollPositions) {
  if (!els.simpleDashboardContent || !scrollPositions.length) return;
  Array.from(els.simpleDashboardContent.querySelectorAll(".simple-scroll-list")).forEach((element, index) => {
    const scrollTop = scrollPositions[index];
    if (Number.isFinite(scrollTop)) element.scrollTop = scrollTop;
  });
}

function eventTimestamp(event) {
  const timestamp = new Date(event.createdAt || event.timestamp || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isFailureEvent(event) {
  return (event.kind || "") === "server_offline" || event.currentStatus === "offline" || event.type === "down";
}

function isRecoveryEvent(event) {
  return (
    (event.kind || "") === "server_recovered" ||
    (event.currentStatus === "online" && event.previousStatus === "offline") ||
    event.type === "up"
  );
}

function renderSimpleDashboard() {
  if (!els.simpleDashboardContent) return;
  const scrollPositions = captureSimpleDashboardScroll();
  const canServers = canSeeSection("servers");
  const canNetworks = canSeeSection("networks");
  const canBackups = canSeeSection("backups");
  const canAlerts = canSeeSection("alerts");
  const scopedServers = state.servers.filter((server) => groupIdMatches(state.filters.groupId, server.groupId));
  const scopedServerIds = new Set(scopedServers.map((server) => server.id));
  const activeServers = scopedServers.filter((server) => server.isActive);
  const counts = statusCounts(activeServers);
  const simpleStatusCounts = activeServers.reduce(
    (acc, server) => {
      const status = displayStatus(server);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { online: 0, offline: 0, dependency_down: 0, probe_stale: 0, unknown: 0, paused: 0 }
  );
  const openAlerts = state.alerts.filter(
    (alert) => !alert.read && alert.type === "down" && (state.filters.groupId === "all" || scopedServerIds.has(alert.serverId))
  );
  const problemServers = activeServers
    .filter((server) => ["offline", "probe_stale", "dependency_down"].includes(displayStatus(server)))
    .sort((left, right) => {
      const order = { offline: 0, dependency_down: 1, probe_stale: 2 };
      return (order[displayStatus(left)] ?? 3) - (order[displayStatus(right)] ?? 3) || compareAlpha(serverSortLabel(left), serverSortLabel(right));
    })
    .slice(0, 4);
  const staleProbes = state.probes.filter((probe) => probe.status === "stale");
  const networkLinks = (state.networkLinks || []).filter((link) => link.isActive !== false && groupIdMatches(state.filters.groupId, link.groupId));
  const networkCounts = networkLinks.reduce(
    (acc, link) => {
      const status = link.displayStatus || link.currentStatus || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { online: 0, degraded: 0, offline: 0, probe_unreachable: 0, unknown: 0, paused: 0 }
  );
  const networkProblems = networkLinks
    .filter((link) => ["offline", "degraded", "probe_unreachable"].includes(link.displayStatus || link.currentStatus))
    .sort((left, right) => {
      const order = { offline: 0, probe_unreachable: 1, degraded: 2 };
      return (
        (order[left.displayStatus || left.currentStatus] ?? 3) - (order[right.displayStatus || right.currentStatus] ?? 3) ||
        compareAlpha(networkLinkSortLabel(left), networkLinkSortLabel(right))
      );
    })
    .slice(0, 4);
  const networkRows = networkLinks
    .slice()
    .sort((left, right) => {
      const order = { offline: 0, probe_unreachable: 1, degraded: 2, unknown: 3, online: 4, paused: 5 };
      return (
        (order[left.displayStatus || left.currentStatus] ?? 6) - (order[right.displayStatus || right.currentStatus] ?? 6) ||
        compareAlpha(networkLinkSortLabel(left), networkLinkSortLabel(right))
      );
    });
  const networkOverviewList = networkRows.length
    ? networkRows
        .map((link) => {
          const status = link.displayStatus || link.currentStatus || "unknown";
          return `
            <button class="simple-network-row ${status}" type="button" data-simple-network-link-id="${escapeHtml(link.id)}">
              <span>
                <strong>${escapeHtml(link.name)}</strong>
                <small>${escapeHtml([link.groupName || "Sem empresa", activeNetworkTargetLabel(link)].filter(Boolean).join(" · "))}</small>
              </span>
              <em>${networkStatusLabel(status)}</em>
              <small>${link.lastLatencyMs ?? "-"} ms</small>
            </button>
          `;
        })
        .join("")
    : `<div class="simple-empty">Nenhum link de rede cadastrado.</div>`;
  const isGlobalScope = state.filters.groupId === "all";
  const availability = Number(isGlobalScope ? state.summary.availability24h ?? availabilityForServers(activeServers) : availabilityForServers(activeServers));
  const availabilityTitle = isGlobalScope ? "Disponibilidade 24h" : "Disponibilidade agora";
  const availabilityCaption = isGlobalScope ? "eventos registrados" : "estado atual do filtro";
  const tone = (canServers && counts.offline) || (canAlerts && openAlerts.length) || (canNetworks && networkCounts.offline)
    ? "danger"
    : (canServers && (counts.dependency_down || counts.probe_stale || staleProbes.length)) || (canNetworks && (networkCounts.degraded || networkCounts.probe_unreachable))
    ? "warning"
    : "success";
  const headline = tone === "danger" ? "Atencao necessaria" : tone === "warning" ? "Acompanhar operacao" : "Operacao normal";
  const dangerParts = [];
  if (canServers && counts.offline) dangerParts.push(`${counts.offline} servidor${counts.offline === 1 ? "" : "es"} offline`);
  if (canNetworks && networkCounts.offline) dangerParts.push(`${networkCounts.offline} link${networkCounts.offline === 1 ? "" : "s"} offline`);
  if (canAlerts && openAlerts.length) dangerParts.push(`${openAlerts.length} alerta${openAlerts.length === 1 ? "" : "s"} aberto${openAlerts.length === 1 ? "" : "s"}`);
  const message =
    tone === "danger"
      ? `${dangerParts.join(", ")}.`
      : tone === "warning"
      ? "Ha itens para acompanhar, mas sem queda critica confirmada."
      : "Nenhuma queda critica aberta no momento.";

  const now = Date.now();
  const recentWindowStart = now - 24 * 60 * 60 * 1000;
  const serverEvents24h = state.filters.groupId === "all" ? state.summary.serverEvents24h : null;
  const recentFailures = serverEvents24h ? [] : state.events.filter((event) => eventTimestamp(event) >= recentWindowStart && isFailureEvent(event));
  const recentRecoveries = serverEvents24h ? [] : state.events.filter((event) => eventTimestamp(event) >= recentWindowStart && isRecoveryEvent(event));
  const recentFailureCount = Number(serverEvents24h?.failures ?? recentFailures.length);
  const recentRecoveryCount = Number(serverEvents24h?.recoveries ?? recentRecoveries.length);
  const failureBuckets = Array.isArray(serverEvents24h?.buckets)
    ? serverEvents24h.buckets
    : Array.from({ length: 12 }, (_, index) => {
        const start = now - (12 - index) * 2 * 60 * 60 * 1000;
        const end = start + 2 * 60 * 60 * 1000;
        return recentFailures.filter((event) => {
          const timestamp = eventTimestamp(event);
          return timestamp >= start && timestamp < end;
        }).length;
      });
  const maxFailures = Math.max(1, ...failureBuckets);
  const failureBars = failureBuckets
    .map((count, index) => {
      const startHour = new Date(now - (12 - index) * 2 * 60 * 60 * 1000).getHours().toString().padStart(2, "0");
      const height = Math.max(count ? 12 : 3, Math.round((count / maxFailures) * 100));
      return `<span class="${count ? "active" : ""}" style="--bar-height:${height}%" title="${count} falha${count === 1 ? "" : "s"} entre ${startHour}h e ${String((Number(startHour) + 2) % 24).padStart(2, "0")}h"><i></i></span>`;
    })
    .join("");
  const statusTotal = Math.max(
    1,
    simpleStatusCounts.online +
      simpleStatusCounts.offline +
      simpleStatusCounts.dependency_down +
      simpleStatusCounts.probe_stale +
      simpleStatusCounts.unknown +
      simpleStatusCounts.paused
  );
  const onlineDegrees = (simpleStatusCounts.online / statusTotal) * 360;
  const offlineDegrees = (simpleStatusCounts.offline / statusTotal) * 360;
  const attentionDegrees = ((simpleStatusCounts.dependency_down + simpleStatusCounts.probe_stale) / statusTotal) * 360;
  const statusChartStyle = `--online-deg:${onlineDegrees}deg; --offline-deg:${offlineDegrees}deg; --attention-deg:${attentionDegrees}deg;`;

  const attentionList = problemServers.length
    ? problemServers
        .map((server) => {
          const status = displayStatus(server);
          return `
            <button class="simple-attention-item ${status}" type="button" data-simple-server-id="${escapeHtml(server.id)}">
              <span>
                <strong>${escapeHtml(server.name)}</strong>
                <small>${escapeHtml(server.hostname)} · ${escapeHtml(groupLabel(server.groupId))}</small>
              </span>
              <em>${statusLabel(status)}</em>
            </button>
          `;
        })
        .join("")
    : canAlerts && openAlerts.length
    ? `<div class="simple-empty">Nenhum servidor com problema agora, mas ha ${openAlerts.length} alerta${openAlerts.length === 1 ? "" : "s"} aberto${openAlerts.length === 1 ? "" : "s"} para revisar.</div>`
    : `<div class="simple-empty">Tudo certo nos servidores ativos.</div>`;
  const networkAttentionList = networkProblems.length
    ? networkProblems
        .map((link) => {
          const status = link.displayStatus || link.currentStatus || "unknown";
          return `
            <button class="simple-attention-item ${status}" type="button" data-simple-network-link-id="${escapeHtml(link.id)}">
              <span>
                <strong>${escapeHtml(link.name)}</strong>
                <small>${escapeHtml([link.groupName || "Sem empresa", activeNetworkTargetLabel(link)].filter(Boolean).join(" · "))}</small>
              </span>
              <em>${networkStatusLabel(status)}</em>
            </button>
          `;
        })
        .join("")
    : `<div class="simple-empty">Todos os links monitorados estao operacionais.</div>`;

  const cloudBackup = state.cloudBackup || null;
  const backupsConfigured = Boolean(cloudBackup?.configured);
  const backupStatus = cloudBackup?.status || { info: 0, success: 0, warning: 0, error: 0, nomon: 0, total: 0 };
  const backupsMonitoredTotal = backupClientMonitoredTotal(backupStatus);
  const backupsUnmonitoredTotal = backupClientUnmonitoredTotal(backupStatus);
  const backupHealthPct = backupClientHealthPct(backupStatus);
  const backupDonutTotal = Math.max(1, backupsMonitoredTotal);
  const backupSuccessDeg = (backupStatus.success / backupDonutTotal) * 360;
  const backupErrorDeg = (backupStatus.error / backupDonutTotal) * 360;
  const backupWarningDeg = (backupStatus.warning / backupDonutTotal) * 360;
  const backupClients = Array.isArray(cloudBackup?.clients) ? cloudBackup.clients : [];
  const backupHealthBars = backupsConfigured
    ? backupClients
        .map((client) => ({ client, pct: backupClientHealthPct(client.status), monitored: backupClientMonitoredTotal(client.status) }))
        .filter((item) => item.monitored > 0)
        .sort((left, right) => left.pct - right.pct)
        .slice(0, 6)
        .map(
          ({ client, pct, monitored }) => `
            <button class="backup-health-row ${availabilityTone(pct)}" type="button" data-simple-backup-client-id="${escapeHtml(String(client.id))}">
              <span>
                <strong>${escapeHtml(client.groupName || client.name)}</strong>
                <small>${client.status.success}/${monitored} backups monitorados com sucesso</small>
              </span>
              <em>${pct}%</em>
              <i aria-hidden="true"><b style="width:${Math.max(0, Math.min(100, pct))}%"></b></i>
            </button>
          `
        )
        .join("")
    : "";

  els.simpleDashboardContent.innerHTML = `
    <div class="simple-hero ${tone}">
      <div>
        <span class="simple-kicker">Resumo agora</span>
        <h2>${headline}</h2>
        <p>${message}</p>
      </div>
      ${availabilityGaugeHtml(availability, { title: availabilityTitle, caption: availabilityCaption })}
    </div>

    <div class="simple-kpi-row" aria-label="Resumo principal">
      ${canServers ? `<article><span>Total</span><strong>${activeServers.length}/${counts.online}</strong><small>monitorados online</small></article>` : ""}
      ${canServers ? `<article class="${counts.offline ? "danger" : "success"}" data-offline-trigger="1"><span>Offline</span><strong>${counts.offline}</strong><small>${staleProbes.length} sem contato</small></article>` : ""}
      ${canAlerts ? `<article class="${openAlerts.length ? "danger" : "success"}" data-simple-view="alerts"><span>Alertas</span><strong>${openAlerts.length}</strong><small>abertos</small></article>` : ""}
      ${canNetworks ? `<article class="${networkCounts.offline ? "danger" : networkCounts.degraded || networkCounts.probe_unreachable ? "warning" : "success"}"><span>Links</span><strong>${networkLinks.length}</strong><small>${networkCounts.online} online</small></article>` : ""}
      ${canBackups ? `<article class="${backupsConfigured && backupStatus.error ? "danger" : "success"}"><span>Backups</span><strong>${backupsConfigured ? `${backupStatus.success}/${backupsMonitoredTotal}` : "-"}</strong><small>${backupsConfigured ? "sucesso (monitorados)" : "nao configurado"}</small></article>` : ""}
    </div>

    <div class="simple-chart-grid" aria-label="Graficos rapidos">
      ${canServers ? `
      <section class="simple-panel simple-chart-card simple-chart-wide">
        <div class="panel-title compact-title">
          <h2>Falhas nas ultimas 24h</h2>
          <span>${recentFailureCount} queda${recentFailureCount === 1 ? "" : "s"} · ${recentRecoveryCount} recuperacao${recentRecoveryCount === 1 ? "" : "es"}</span>
        </div>
        <div class="simple-failure-chart" aria-label="${recentFailureCount} falhas nas ultimas 24 horas">
          ${failureBars}
        </div>
        <div class="simple-chart-foot">
          <span>24h atras</span>
          <strong>${recentFailureCount ? `${recentFailureCount} evento${recentFailureCount === 1 ? "" : "s"}` : "Sem falhas registradas"}</strong>
          <span>agora</span>
        </div>
      </section>` : ""}

      ${canServers ? `
      <section class="simple-panel simple-chart-card">
        <div class="panel-title compact-title">
          <h2>Estado atual</h2>
          <span>${activeServers.length} ativos</span>
        </div>
        <div class="simple-status-chart">
          <div class="simple-status-donut" style="${statusChartStyle}" aria-hidden="true">
            <strong>${Math.round((simpleStatusCounts.online / statusTotal) * 100)}%</strong>
          </div>
          <div class="simple-status-legend">
            <span><i class="success"></i>${simpleStatusCounts.online} online</span>
            <span><i class="danger"></i>${simpleStatusCounts.offline} offline</span>
            <span><i class="warning"></i>${simpleStatusCounts.dependency_down + simpleStatusCounts.probe_stale} atencao</span>
            <span><i class="neutral"></i>${simpleStatusCounts.unknown + simpleStatusCounts.paused} sem status/pausado</span>
          </div>
        </div>
      </section>` : ""}

      ${canNetworks ? `
      <section class="simple-panel simple-chart-card">
        <div class="panel-title compact-title">
          <h2>Redes monitoradas</h2>
          <span>${networkLinks.length} link${networkLinks.length === 1 ? "" : "s"}</span>
        </div>
        <div class="simple-network-summary">
          <article><strong>${networkCounts.online || 0}</strong><span>online</span></article>
          <article class="${networkCounts.degraded ? "warning" : ""}"><strong>${networkCounts.degraded || 0}</strong><span>degradados</span></article>
          <article class="${networkCounts.offline ? "danger" : ""}"><strong>${networkCounts.offline || 0}</strong><span>offline</span></article>
        </div>
        <div class="simple-scroll-list simple-network-list">
          ${networkOverviewList}
        </div>
      </section>` : ""}
    </div>

    <div class="simple-dashboard-grid">
      ${canServers ? `
      <section class="simple-panel">
        <div class="panel-title compact-title">
          <h2>Precisa de atencao</h2>
          <span>${problemServers.length ? `${problemServers.length} itens principais` : "Sem acao imediata"}</span>
        </div>
        <div class="simple-attention-list simple-scroll-list">${attentionList}</div>
      </section>` : ""}

      ${canBackups ? `
      <section class="simple-panel">
        <div class="panel-title compact-title">
          <h2>Estado atual dos backups</h2>
          <span>${backupsConfigured ? `${backupsMonitoredTotal} monitorados` : "Nao configurado"}</span>
        </div>
        ${
          backupsConfigured
            ? `<div class="simple-status-chart">
                <div class="simple-status-donut" style="--online-deg:${backupSuccessDeg}deg; --offline-deg:${backupErrorDeg}deg; --attention-deg:${backupWarningDeg}deg;" aria-hidden="true">
                  <strong>${backupHealthPct}%</strong>
                </div>
                <div class="simple-status-legend">
                  <span><i class="success"></i>${backupStatus.success} sucesso</span>
                  <span><i class="danger"></i>${backupStatus.error} erro</span>
                  <span><i class="warning"></i>${backupStatus.warning} alerta</span>
                  <span><i class="neutral"></i>${backupsUnmonitoredTotal} sem monitoramento</span>
                </div>
              </div>`
            : `<div class="simple-empty">Configure a API de Cloud Backup para ver os dados.</div>`
        }
      </section>` : ""}

      ${canBackups ? `
      <section class="simple-panel">
        <div class="panel-title compact-title">
          <h2>Taxa de sucesso dos backups</h2>
          <span>Prioridade visual</span>
        </div>
        <div class="simple-health-list simple-scroll-list">
          ${backupHealthBars || `<div class="simple-empty">${backupsConfigured ? "Nenhum cliente de backup monitorado." : "Configure a API de Cloud Backup para ver os dados."}</div>`}
        </div>
      </section>` : ""}
    </div>

    <div class="simple-actions">
      ${canAlerts ? `<button class="primary-button" type="button" data-simple-view="alerts">Ver alertas</button>` : ""}
      ${canServers ? `<button class="ghost-button" type="button" data-simple-view="servers">Abrir servidores</button>` : ""}
    </div>
  `;
  restoreSimpleDashboardScroll(scrollPositions);
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

function executiveEmpty(message, tone = "success") {
  return `<div class="executive-empty ${escapeHtml(tone)}">${escapeHtml(message)}</div>`;
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
      return (priority[left.environment] ?? 3) - (priority[right.environment] ?? 3) || compareAlpha(serverSortLabel(left), serverSortLabel(right));
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
    .sort((left, right) => Number(right.lastLatencyMs) - Number(left.lastLatencyMs) || compareAlpha(serverSortLabel(left), serverSortLabel(right)))
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
    .sort((left, right) => right.openAlerts - left.openAlerts || right.offline - left.offline || compareAlpha(left.name, right.name))
    .slice(0, 4);
  const availabilityByCompany = groupedServers(state.servers)
    .map((group) => ({ ...group, availability: availabilityForServers(group.servers) }))
    .filter((group) => group.servers.some((server) => server.isActive))
    .sort((left, right) => left.availability - right.availability || compareAlpha(left.name, right.name))
    .slice(0, 4);
  const byEnvironment = ["production", "staging", "development"].map((environment) => {
    const servers = activeServers.filter((server) => server.environment === environment);
    const counts = statusCounts(servers);
    return { environment, total: servers.length, online: counts.online, offline: counts.offline };
  });

  els.executiveGrid.innerHTML = `
    <article class="executive-card ${clientsWithAlerts.length ? "attention" : "healthy"}">
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

    <article class="executive-card ${staleProbes.length ? "warning" : "healthy"}">
      <header><span>Probes sem contato</span><strong>${staleProbes.length}</strong></header>
      <div class="executive-list">
        ${
          staleProbes.length
            ? sortedByAlpha(staleProbes, probeSortLabel)
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

    <article class="executive-card ${criticalOffline.length ? "attention" : "healthy"}">
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

    <article class="executive-card ${recentDrops.length ? "attention" : "healthy"}">
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

    <article class="executive-card ${recentRecoveries.length ? "positive" : ""}">
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
            : executiveEmpty("Sem recuperacoes recentes.", "neutral")
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
                    status: latencyTone(server.lastLatencyMs),
                    serverId: server.id
                  })
                )
                .join("")
            : executiveEmpty("Sem latencias registradas.", "neutral")
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
  const statusTone = visibleStatus === "offline" ? "is-offline" : "";
  const expanded = state.topologyExpanded.has(server.id);
  const latency = latencyPill(server.lastLatencyMs);
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
    server.checkSource === "probe" && visibleStatus !== "probe_stale"
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
    <button class="server-row ${selected} ${inactive} ${statusTone} ${depth ? "dependency-child-row" : ""}" type="button" data-profile-server-id="${server.id}" style="--dependency-depth:${depth}">
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
        ${server.isActive ? latency : `<span class="latency-pill neutral"><i aria-hidden="true"></i>pausado</span>`}
      </span>
    </button>
  `;
}

function renderServerDirectoryRow(server, options = {}) {
  const { childCount = 0, depth = 0 } = options;
  const visibleStatus = displayStatus(server);
  const selected = server.id === state.selectedServerId ? "selected" : "";
  const statusTone = visibleStatus === "offline" ? "is-offline" : "";
  const expanded = state.topologyExpanded.has(server.id);
  return `
    <button class="server-directory-item ${selected} ${statusTone} ${depth ? "dependency-child-row" : ""}" type="button" data-profile-server-id="${server.id}" style="--dependency-depth:${depth}">
      ${
        childCount
          ? `<span class="topology-toggle ${expanded ? "expanded" : ""}" data-topology-toggle="${escapeHtml(server.id)}" aria-label="${expanded ? "Ocultar dependentes" : "Exibir dependentes"}" aria-expanded="${expanded ? "true" : "false"}"><i aria-hidden="true"></i></span>`
          : `<span class="topology-spacer" aria-hidden="true"></span>`
      }
      <span class="status-pulse ${visibleStatus}"></span>
      ${platformIcon(server.platform)}
      <span>
        <strong>${escapeHtml(server.name)}</strong>
        <small>${escapeHtml(server.hostname)}</small>
      </span>
      <em>${statusLabel(visibleStatus)}</em>
    </button>
  `;
}

function renderServerTopology(servers, rowRenderer = renderServerRow) {
  const visibleIds = new Set(servers.map((server) => server.id));
  const childrenByParent = new Map();
  for (const server of servers) {
    if (!server.parentId || !visibleIds.has(server.parentId)) continue;
    const children = childrenByParent.get(server.parentId) || [];
    children.push(server);
    childrenByParent.set(server.parentId, children);
  }
  for (const [parentId, children] of childrenByParent.entries()) {
    childrenByParent.set(parentId, sortedByAlpha(children, serverSortLabel));
  }

  const renderNode = (server, depth = 0, visited = new Set()) => {
    const children = childrenByParent.get(server.id) || [];
    const expanded = state.topologyExpanded.has(server.id);
    const row = rowRenderer(server, { childCount: children.length, depth });
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

  return sortedByAlpha(
    servers.filter((server) => !server.parentId || !visibleIds.has(server.parentId)),
    serverSortLabel
  )
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

  for (const group of sortedByAlpha(state.groups, groupSortLabel)) {
    const items = sortedByAlpha(
      servers.filter((server) => server.groupId === group.id),
      serverSortLabel
    );
    if (items.length) groups.push({ id: group.id, name: group.name, logoDataUrl: group.logoDataUrl || "", servers: items });
  }

  const withoutGroup = sortedByAlpha(
    servers.filter((server) => !server.groupId || !knownGroupIds.has(server.groupId)),
    serverSortLabel
  );
  if (withoutGroup.length) groups.push({ id: "none", name: "Sem empresa", servers: withoutGroup });

  return sortedByAlpha(groups, (group) => group.name);
}

function renderServers() {
  if (!els.serverList) return;
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
      const selected = state.selectedServerGroupId === group.id ? "selected" : "";
      return `
        <section class="server-group-section ${selected}">
          <button class="server-group-header" type="button" data-server-group-id="${escapeHtml(group.id)}">
            <div>
              <strong>${escapeHtml(group.name)}</strong>
              <span>${group.servers.length} ${group.servers.length === 1 ? "servidor" : "servidores"}</span>
            </div>
            <div class="server-group-badges">
              <span class="mini-badge online">${counts.online} online</span>
              <span class="mini-badge offline">${counts.offline} offline</span>
              ${counts.paused ? `<span class="mini-badge paused">${counts.paused} pausado</span>` : ""}
            </div>
          </button>
          <div class="server-group-items">
            ${renderServerTopology(group.servers)}
          </div>
        </section>
      `;
    })
    .join("");
}

function serverGroupById(groupId) {
  const knownGroupIds = new Set(state.groups.map((group) => group.id));
  const servers = groupId === "none"
    ? state.servers.filter((server) => !server.groupId || !knownGroupIds.has(server.groupId))
    : state.servers.filter((server) => server.groupId === groupId);
  if (!servers.length) return null;
  return {
    id: groupId,
    name: groupId === "none" ? "Sem empresa" : groupLabel(groupId),
    logoDataUrl: groupId === "none" ? "" : groupLogo(groupId),
    servers: sortedByAlpha(servers, serverSortLabel)
  };
}

function renderServerGroupDetail(group, target = els.detailPanel) {
  if (!group) {
    target.innerHTML = `
      <div class="empty-state">
        <strong>Empresa nao encontrada</strong>
        <span>Selecione outra empresa para ver os servidores associados.</span>
      </div>
    `;
    return;
  }
  const counts = statusCounts(group.servers);
  const activeServers = group.servers.filter((server) => server.isActive);
  const availability = availabilityForServers(group.servers);
  const serverIds = new Set(group.servers.map((server) => server.id));
  const openAlerts = state.alerts.filter((alert) => !alert.read && serverIds.has(alert.serverId));
  const recentEvents = state.events.filter((event) => serverIds.has(event.serverId)).slice(0, 5);
  const groupLinks = sortedByAlpha(
    (state.networkLinks || []).filter((link) => link.isActive !== false && groupIdMatches(group.id, link.groupId)),
    networkLinkSortLabel
  );
  const networkCounts = groupLinks.reduce(
    (acc, link) => {
      const status = link.displayStatus || link.currentStatus || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { online: 0, degraded: 0, offline: 0, probe_unreachable: 0, unknown: 0, paused: 0 }
  );
  const statusTotal = Math.max(1, counts.online + counts.offline + counts.dependency_down + counts.probe_stale + counts.unknown + counts.paused);
  const onlineDegrees = (counts.online / statusTotal) * 360;
  const offlineDegrees = (counts.offline / statusTotal) * 360;
  const attentionDegrees = ((counts.dependency_down + counts.probe_stale) / statusTotal) * 360;
  const statusChartStyle = `--online-deg:${onlineDegrees}deg; --offline-deg:${offlineDegrees}deg; --attention-deg:${attentionDegrees}deg;`;
  const now = Date.now();
  const recentWindowStart = now - 24 * 60 * 60 * 1000;
  const recentFailures = state.events.filter((event) => serverIds.has(event.serverId) && eventTimestamp(event) >= recentWindowStart && isFailureEvent(event));
  const recentRecoveries = state.events.filter((event) => serverIds.has(event.serverId) && eventTimestamp(event) >= recentWindowStart && isRecoveryEvent(event));
  const failureBuckets = Array.from({ length: 8 }, (_, index) => {
    const start = now - (8 - index) * 3 * 60 * 60 * 1000;
    const end = start + 3 * 60 * 60 * 1000;
    return recentFailures.filter((event) => {
      const timestamp = eventTimestamp(event);
      return timestamp >= start && timestamp < end;
    }).length;
  });
  const maxFailures = Math.max(1, ...failureBuckets);
  const failureBars = failureBuckets
    .map((count, index) => {
      const startHour = new Date(now - (8 - index) * 3 * 60 * 60 * 1000).getHours().toString().padStart(2, "0");
      const height = Math.max(count ? 12 : 3, Math.round((count / maxFailures) * 100));
      return `<span class="${count ? "active" : ""}" style="--bar-height:${height}%" title="${count} falha${count === 1 ? "" : "s"} desde ${startHour}h"><i></i></span>`;
    })
    .join("");
  const probeServers = activeServers.filter((server) => server.checkSource === "probe");
  const staleProbeServers = probeServers.filter((server) => server.probeStatus === "stale");
  const probeHealth = probeServers.length ? Math.round(((probeServers.length - staleProbeServers.length) / probeServers.length) * 100) : 100;
  const attentionServers = group.servers
    .filter((server) => ["offline", "probe_stale", "dependency_down"].includes(displayStatus(server)))
    .sort((left, right) => {
      const order = { offline: 0, dependency_down: 1, probe_stale: 2 };
      return (order[displayStatus(left)] ?? 3) - (order[displayStatus(right)] ?? 3) || compareAlpha(serverSortLabel(left), serverSortLabel(right));
    });
  const statusTone = counts.offline ? "offline" : counts.probe_stale || counts.dependency_down ? "probe_stale" : "online";

  target.innerHTML = `
    <div class="detail-header">
      <div class="company-profile-title">
        ${brandMarkHtml(group.name, group.logoDataUrl, "company-logo-mark")}
        <div>
          <h2>${escapeHtml(group.name)}</h2>
          <div class="detail-meta">${group.servers.length} ${group.servers.length === 1 ? "maquina associada" : "maquinas associadas"} · ${activeServers.length} ativas</div>
        </div>
      </div>
      <span class="status-badge ${statusTone}">${counts.offline ? "ATENCAO" : counts.probe_stale || counts.dependency_down ? "VERIFICAR" : "ONLINE"}</span>
    </div>

    <section class="company-insight-grid" aria-label="Visao visual da empresa">
      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Estado atual</h3>
          <span>${activeServers.length} ativos</span>
        </div>
        <div class="simple-status-chart company-status-chart">
          <div class="simple-status-donut" style="${statusChartStyle}" aria-hidden="true">
            <strong>${Math.round((counts.online / statusTotal) * 100)}%</strong>
          </div>
          <div class="simple-status-legend">
            <span><i class="success"></i>${counts.online} online</span>
            <span><i class="danger"></i>${counts.offline} offline</span>
            <span><i class="warning"></i>${counts.dependency_down + counts.probe_stale} atencao</span>
            <span><i class="neutral"></i>${counts.unknown + counts.paused} sem status/pausado</span>
          </div>
        </div>
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Falhas 24h</h3>
          <span>${recentFailures.length} quedas · ${recentRecoveries.length} recuperacoes</span>
        </div>
        <div class="simple-failure-chart company-failure-chart">
          ${failureBars}
        </div>
        <div class="simple-chart-foot">
          <span>24h atras</span>
          <strong>${recentFailures.length ? `${recentFailures.length} evento${recentFailures.length === 1 ? "" : "s"}` : "Sem quedas"}</strong>
          <span>agora</span>
        </div>
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Links de rede</h3>
          <span>${groupLinks.length} link${groupLinks.length === 1 ? "" : "s"}</span>
        </div>
        <div class="simple-network-summary">
          <article><strong>${networkCounts.online || 0}</strong><span>online</span></article>
          <article class="${networkCounts.degraded || networkCounts.probe_unreachable ? "warning" : ""}"><strong>${(networkCounts.degraded || 0) + (networkCounts.probe_unreachable || 0)}</strong><span>atencao</span></article>
          <article class="${networkCounts.offline ? "danger" : ""}"><strong>${networkCounts.offline || 0}</strong><span>offline</span></article>
        </div>
        <div class="company-mini-list">
          ${
            groupLinks.length
              ? groupLinks.slice(0, 3).map((link) => {
                  const linkStatus = link.displayStatus || link.currentStatus || "unknown";
                  return `
                    <button type="button" data-network-link-id="${escapeHtml(link.id)}">
                      <span>${escapeHtml(link.name)}</span>
                      <strong class="status-badge ${networkStatusClass(linkStatus)}">${networkStatusLabel(linkStatus)}</strong>
                    </button>
                  `;
                }).join("")
              : `<div class="empty-list compact">Nenhum link vinculado.</div>`
          }
        </div>
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Coleta e probes</h3>
          <span>${probeServers.length} por probe</span>
        </div>
        <div class="company-health-meter">
          <strong>${probeHealth}%</strong>
          <span><i style="width:${Math.max(0, Math.min(100, probeHealth))}%"></i></span>
          <small>${staleProbeServers.length ? `${staleProbeServers.length} sem contato` : "Coleta respondendo"}</small>
        </div>
        <div class="company-mini-list">
          ${
            attentionServers.length
              ? attentionServers.slice(0, 3).map((server) => {
                  const status = displayStatus(server);
                  return `
                    <button type="button" data-profile-server-id="${escapeHtml(server.id)}">
                      <span>${escapeHtml(server.name)}</span>
                      <strong class="status-badge ${status}">${statusLabel(status)}</strong>
                    </button>
                  `;
                }).join("")
              : `<div class="empty-list compact">Sem servidores criticos.</div>`
          }
        </div>
      </article>
    </section>

    <section class="detail-section">
      <h3>Resumo da empresa</h3>
      <div class="detail-grid">
        <div class="detail-stat"><span>Total</span><strong>${group.servers.length}</strong><small>maquinas cadastradas</small></div>
        <div class="detail-stat"><span>Online</span><strong>${counts.online}</strong><small>respondendo agora</small></div>
        <div class="detail-stat"><span>Offline</span><strong>${counts.offline}</strong><small>falhas confirmadas</small></div>
        <div class="detail-stat"><span>Probes sem contato</span><strong>${counts.probe_stale}</strong><small>coleta interrompida</small></div>
        <div class="detail-stat"><span>Pausados</span><strong>${counts.paused}</strong><small>sem monitoramento ativo</small></div>
        <div class="detail-stat"><span>Disponibilidade</span><strong>${availability}%</strong><small>baseada no estado atual</small></div>
      </div>
    </section>

    <section class="detail-section">
      <div class="panel-title compact-title">
        <h3>Maquinas da empresa</h3>
        <span>${group.servers.length} itens</span>
      </div>
      <div class="company-server-list">
        ${group.servers.map((server) => {
          const visibleStatus = displayStatus(server);
          const statusTone = visibleStatus === "offline" ? "is-offline" : "";
          return `
            <button class="server-directory-item company-server-row ${statusTone}" type="button" data-profile-server-id="${escapeHtml(server.id)}">
              <span class="status-pulse ${visibleStatus}"></span>
              ${platformIcon(server.platform)}
              <span>
                <strong>${escapeHtml(server.name)}</strong>
                <small>${escapeHtml([server.hostname, nodeTypeLabel(server.nodeType), checkSourceLabel(server.checkSource), environmentLabel(server.environment)].filter(Boolean).join(" · "))}</small>
              </span>
              <em>${statusLabel(visibleStatus)}</em>
            </button>
          `;
        }).join("")}
      </div>
    </section>

    <section class="detail-section">
      <div class="panel-title compact-title">
        <h3>Alertas abertos</h3>
        <span>${openAlerts.length} itens</span>
      </div>
      <div class="mini-history">
        ${
          openAlerts.length
            ? openAlerts.slice(0, 5).map((alert) => `
                <div class="timeline-item">
                  <span class="status-pulse offline"></span>
                  <div>
                    <strong>${escapeHtml(alert.serverName || "Servidor")}</strong>
                    <small>${escapeHtml(alert.message || "Alerta aberto")} · ${formatDate(alert.createdAt)}</small>
                  </div>
                </div>
              `).join("")
            : `<div class="empty-list">Nenhum alerta aberto nesta empresa.</div>`
        }
      </div>
    </section>

    <section class="detail-section">
      <div class="panel-title compact-title">
        <h3>Historico recente</h3>
        <span>${recentEvents.length} eventos</span>
      </div>
      <div class="mini-history">
        ${
          recentEvents.length
            ? recentEvents.map(renderTimelineItem).join("")
            : `<div class="empty-list">Sem eventos recentes nesta empresa.</div>`
        }
      </div>
    </section>
  `;
}

function renderDetail() {
  if (!els.detailPanel) return;
  if (state.selectedServerGroupId) {
    renderServerGroupDetail(serverGroupById(state.selectedServerGroupId));
    return;
  }
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
      : visibleStatus === "probe_stale"
      ? `<div class="detail-stat"><span>Probe sem contato ha</span><strong>${formatDurationSince(server.probeLastSeenAt || server.lastProbeSeenAt)}</strong></div>`
      : visibleStatus === "offline"
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
  const fullProfileAction = `
    <div class="detail-actions">
      <button class="ghost-button compact" type="button" data-view-server="${server.id}">Abrir ficha completa</button>
    </div>
  `;
  const probeStats =
    server.checkSource === "probe"
      ? `
        <div class="detail-stat"><span>Probe</span><strong>${escapeHtml(server.probeId || "-")}</strong></div>
        <div class="detail-stat"><span>Status do probe</span><strong><span class="status-badge ${server.probeStatus === "stale" ? "probe_stale" : server.probeStatus || "unknown"}">${probeStatusLabel(server.probeStatus)}</span></strong></div>
        <div class="detail-stat"><span>Ultimo envio do probe</span><strong>${formatDate(server.lastProbeSeenAt)}</strong></div>
        <div class="detail-stat watch-limit-stat"><span>Limite sem contato</span><strong>${server.probeStaleAfterSeconds ? `${server.probeStaleAfterSeconds}s` : "-"}</strong></div>
        ${server.probeStatus === "stale" ? `<div class="detail-stat"><span>Verificacao alternativa</span><strong>${probeFallbackLabel(server.probeFallbackStatus)}</strong><small>${server.probeFallbackCheckedAt ? formatDate(server.probeFallbackCheckedAt) : ""}</small></div>` : ""}
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

    <section class="detail-section">
      <h3>Monitoramento</h3>
      <div class="detail-grid">
        <div class="detail-stat"><span>Ultima checagem</span><strong>${formatDate(server.lastCheckedAt)}</strong></div>
        <div class="detail-stat latency-stat"><span>Latencia</span><strong>${latencyPill(server.lastLatencyMs)}</strong></div>
        <div class="detail-stat"><span>Origem</span><strong>${checkSourceLabel(server.checkSource)}</strong></div>
        <div class="detail-stat"><span>Empresa</span><strong>${escapeHtml(groupLabel(server.groupId))}</strong></div>
        <div class="detail-stat"><span>Intervalo</span><strong>${server.checkInterval}s</strong></div>
        ${offlineSince}
      </div>
    </section>

    <section class="detail-section">
      <h3>Inventario</h3>
      <div class="detail-grid">
        <div class="detail-stat"><span>Sistema</span><strong>${platformIcon(server.platform)}${platformLabel(server.platform)}</strong></div>
        <div class="detail-stat"><span>MAC</span><strong>${escapeHtml(mac || "-")}</strong></div>
      </div>
    </section>

    <section class="detail-section">
      <h3>Infraestrutura</h3>
      <div class="detail-grid">
        ${dependencyStats}
      </div>
    </section>

    ${
      probeStats
        ? `<section class="detail-section"><h3>Probe e verificacao</h3><div class="detail-grid">${probeStats}</div></section>`
        : ""
    }

    ${serverHostMetrics}

    ${fullProfileAction}
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

function sortedServersForDirectory() {
  return [...state.servers].sort((a, b) => {
    const groupCompare = compareAlpha(groupLabel(a.groupId), groupLabel(b.groupId));
    if (groupCompare) return groupCompare;
    return compareAlpha(serverSortLabel(a), serverSortLabel(b));
  });
}

function renderServerDirectory() {
  if (!els.serverDirectoryList) return;
  const servers = filteredServers();
  if (els.serverDirectoryCount) {
    els.serverDirectoryCount.textContent = `${servers.length} ${servers.length === 1 ? "servidor" : "servidores"}`;
  }
  const expandableIds = expandableTopologyIds(servers);
  if (els.toggleTopologyAll) {
    const allExpanded = expandableIds.length > 0 && expandableIds.every((id) => state.topologyExpanded.has(id));
    els.toggleTopologyAll.hidden = expandableIds.length === 0;
    els.toggleTopologyAll.textContent = allExpanded ? "Recolher todos" : "Expandir todos";
  }
  const groups = groupedServers(servers);
  els.serverDirectoryList.innerHTML = servers.length
    ? groups
        .map((group) => {
          const online = group.servers.filter((server) => server.isActive && displayStatus(server) === "online").length;
          const offline = group.servers.filter((server) => server.isActive && displayStatus(server) === "offline").length;
          return `
            <section class="server-directory-group ${state.selectedServerGroupId === group.id ? "selected" : ""}">
              <button class="server-directory-group-header" type="button" data-profile-server-group-id="${escapeHtml(group.id)}">
                <div>
                  <strong>${escapeHtml(group.name)}</strong>
                  <span>${group.servers.length} ${group.servers.length === 1 ? "servidor" : "servidores"}</span>
                </div>
                <div class="server-directory-group-badges">
                  <span class="mini-badge online">${online} on</span>
                  ${offline ? `<span class="mini-badge offline">${offline} off</span>` : ""}
                </div>
              </button>
              <div class="server-directory-group-items">
                ${renderServerTopology(group.servers, renderServerDirectoryRow)}
              </div>
            </section>
          `;
        })
        .join("")
    : `<div class="empty-list">Nenhum servidor encontrado.</div>`;
}

function renderServerProfile() {
  if (!els.serverProfilePanel) return;
  if (state.selectedServerGroupId) {
    renderServerGroupDetail(serverGroupById(state.selectedServerGroupId), els.serverProfilePanel);
    return;
  }
  const server = state.servers.find((item) => item.id === state.selectedServerId);
  if (!server) {
    els.serverProfilePanel.innerHTML = `
      <div class="empty-state">
        <strong>Nenhum servidor selecionado</strong>
        <span>Selecione um servidor para abrir a ficha operacional completa.</span>
      </div>
    `;
    return;
  }

  const visibleStatus = displayStatus(server);
  const metrics = server.probeHostMetrics || null;
  const cpu = metrics?.cpu || {};
  const memory = metrics?.memory || {};
  const disk = metrics?.disk || {};
  const system = metrics?.system || {};
  const primaryInterface = (metrics?.networkInterfaces || []).find((item) => interfacePrimaryAddress(item)) || metrics?.networkInterfaces?.[0] || null;
  const recent = state.events.filter((event) => event.serverId === server.id).slice(0, 10);
  const dependents = sortedByAlpha(
    state.servers.filter((item) => item.parentId === server.id),
    serverSortLabel
  );
  const macAddresses = Array.isArray(server.macAddresses) && server.macAddresses.length ? server.macAddresses : primaryMac(server) ? [primaryMac(server)] : [];
  const statusTimeLabel = !server.isActive
    ? "Monitoramento pausado"
    : visibleStatus === "offline"
    ? `Offline ha ${formatDurationSince(server.statusChangedAt)}`
    : visibleStatus === "probe_stale"
    ? `Probe sem contato ha ${formatDurationSince(server.probeLastSeenAt || server.lastProbeSeenAt)}`
    : `Status desde ${formatDate(server.statusChangedAt)}`;
  const tags = (server.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const adminActions = isAdmin()
    ? `
      <div class="profile-actions">
        ${
          server.isActive
            ? `<button class="ghost-button compact" type="button" data-action="check" data-id="${server.id}">${server.checkSource === "probe" ? "Solicitar checagem" : "Checar agora"}</button>`
            : ""
        }
        <button class="ghost-button compact" type="button" data-action="edit" data-id="${server.id}">Editar</button>
        <button class="ghost-button compact" type="button" data-action="toggle" data-id="${server.id}">${server.isActive ? "Desativar" : "Reativar"}</button>
      </div>
    `
    : "";

  els.serverProfilePanel.innerHTML = `
    <section class="server-profile-hero">
      <div>
        <div class="profile-title-row">
          <h2>${platformIcon(server.platform)}${escapeHtml(server.name)}</h2>
          <span class="status-badge ${visibleStatus}">${statusLabel(visibleStatus)}</span>
        </div>
        <p>${escapeHtml(server.description || "Sem descricao cadastrada.")}</p>
        <div class="detail-meta">${escapeHtml(server.hostname)} · ${platformLabel(server.platform)} · ${environmentLabel(server.environment)} · ${escapeHtml(groupLabel(server.groupId))}</div>
        <div class="tag-list">${tags || `<span class="tag">sem tags</span>`}</div>
      </div>
      ${adminActions}
    </section>

    <section class="server-profile-grid">
      <article class="profile-section">
        <div class="panel-title compact-title">
          <h3>Resumo operacional</h3>
          <span>${statusTimeLabel}</span>
        </div>
        <div class="profile-stat-grid">
          <div class="detail-stat"><span>IP ou hostname</span><strong>${escapeHtml(server.hostname)}</strong></div>
          <div class="detail-stat"><span>Origem da checagem</span><strong>${checkSourceLabel(server.checkSource)}</strong></div>
          <div class="detail-stat"><span>Ultima checagem</span><strong>${formatDate(server.lastCheckedAt)}</strong></div>
          <div class="detail-stat latency-stat"><span>Latencia</span><strong>${latencyPill(server.lastLatencyMs)}</strong></div>
          <div class="detail-stat"><span>Intervalo</span><strong>${server.checkInterval}s</strong></div>
          <div class="detail-stat watch-limit-stat"><span>Falhas para offline</span><strong>${server.failureThreshold || "-"}</strong></div>
        </div>
        ${server.lastError ? `<div class="profile-note"><strong>Ultima observacao</strong><span>${escapeHtml(server.lastError)}</span></div>` : ""}
      </article>

      <article class="profile-section">
        <div class="panel-title compact-title">
          <h3>Inventario</h3>
          <span>${platformLabel(server.platform)}</span>
        </div>
        <div class="profile-stat-grid">
          <div class="detail-stat"><span>Sistema</span><strong>${platformIcon(server.platform)}${platformLabel(server.platform)}</strong><small>${escapeHtml(system.type || system.release || "-")}</small></div>
          <div class="detail-stat"><span>Nome do host</span><strong>${escapeHtml(server.probeHostName || "-")}</strong></div>
          <div class="detail-stat"><span>CPU</span><strong>${escapeHtml(cpu.model || "-")}</strong><small>${cpu.cores ? `${escapeHtml(cpu.cores)} cores` : "sem dados"}</small></div>
          <div class="detail-stat"><span>Uptime</span><strong>${formatUptime(system.uptimeSeconds)}</strong></div>
          <div class="detail-stat"><span>MAC principal</span><strong>${escapeHtml(primaryMac(server) || "-")}</strong></div>
          <div class="detail-stat"><span>MACs coletados</span><strong>${macAddresses.length || "-"}</strong><small>${escapeHtml(macAddresses.join(", ") || "-")}</small></div>
        </div>
      </article>

      <article class="profile-section">
        <div class="panel-title compact-title">
          <h3>Probe e verificacao</h3>
          <span>${probeStatusLabel(server.probeStatus)}</span>
        </div>
        <div class="profile-stat-grid">
          <div class="detail-stat"><span>Probe</span><strong>${escapeHtml(server.probeId || "-")}</strong></div>
          <div class="detail-stat"><span>Status do probe</span><strong><span class="status-badge ${server.probeStatus === "stale" ? "probe_stale" : server.probeStatus || "unknown"}">${probeStatusLabel(server.probeStatus)}</span></strong></div>
          <div class="detail-stat"><span>Ultimo envio</span><strong>${formatDate(server.lastProbeSeenAt)}</strong></div>
          <div class="detail-stat watch-limit-stat"><span>Limite sem contato</span><strong>${server.probeStaleAfterSeconds ? `${server.probeStaleAfterSeconds}s` : "-"}</strong></div>
          <div class="detail-stat"><span>Verificacao alternativa</span><strong>${probeFallbackLabel(server.probeFallbackStatus)}</strong><small>${server.probeFallbackCheckedAt ? formatDate(server.probeFallbackCheckedAt) : ""}</small></div>
          <div class="detail-stat"><span>Checagem solicitada</span><strong>${formatDate(server.probeCheckRequestedAt)}</strong></div>
        </div>
      </article>

      <article class="profile-section">
        <div class="panel-title compact-title">
          <h3>Infraestrutura</h3>
          <span>${nodeTypeLabel(server.nodeType)}</span>
        </div>
        <div class="profile-stat-grid">
          <div class="detail-stat"><span>Tipo</span><strong>${nodeTypeLabel(server.nodeType)}</strong></div>
          <div class="detail-stat"><span>Plataforma</span><strong>${infrastructurePlatformLabel(server.infrastructurePlatform)}</strong></div>
          <div class="detail-stat"><span>Host pai</span><strong>${escapeHtml(server.parentName || "-")}</strong></div>
          <div class="detail-stat"><span>Estado dependencia</span><strong>${server.dependencyStatus === "affected" ? "Afetado" : server.dependencyStatus === "orphan" ? "Orfao" : server.dependencyStatus === "ok" ? "OK" : "Independente"}</strong></div>
        </div>
        ${
          dependents.length
            ? `<div class="dependency-list">${dependents
                .map((item) => `<button type="button" data-profile-server-id="${item.id}">${platformIcon(item.platform)}<span>${escapeHtml(item.name)}</span><strong class="status-badge ${displayStatus(item)}">${statusLabel(displayStatus(item))}</strong></button>`)
                .join("")}</div>`
            : `<div class="empty-list compact-empty">Sem dependentes vinculados.</div>`
        }
      </article>

      <article class="profile-section profile-section-wide">
        <div class="panel-title compact-title">
          <h3>Metricas do host</h3>
          <span>${formatDate(metrics?.collectedAt || server.probeHostMetricsUpdatedAt)}</span>
        </div>
        <div class="profile-stat-grid metric-profile-grid">
          <div class="detail-stat metric-stat"><span>CPU em uso</span><strong>${formatPercent(cpu.usagePercent)}</strong>${metricBar(cpu.usagePercent)}<small>${escapeHtml(cpu.model || "-")}</small></div>
          <div class="detail-stat metric-stat"><span>Memoria</span><strong>${formatPercent(memory.usedPercent)}</strong>${metricBar(memory.usedPercent)}<small>${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}</small></div>
          <div class="detail-stat metric-stat"><span>Disco</span><strong>${formatPercent(disk.usedPercent)}</strong>${metricBar(disk.usedPercent)}<small>${escapeHtml(disk.mount || "-")} · ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}</small></div>
          <div class="detail-stat"><span>Interface principal</span><strong>${escapeHtml(interfacePrimaryAddress(primaryInterface) || "-")}</strong><small>${escapeHtml(primaryInterface?.name || "-")} · ${formatNetworkSpeed(primaryInterface?.speedMbps)}</small></div>
        </div>
        ${metrics ? renderNetworkInterfaces(metrics) : `<div class="empty-list compact-empty">Aguardando metricas do Probe Collector atualizado.</div>`}
        ${renderExtendedServerMetrics(metrics)}
      </article>

      <article class="profile-section profile-section-wide">
        <div class="panel-title compact-title">
          <h3>Historico do servidor</h3>
          <span>${recent.length} eventos recentes</span>
        </div>
        <div class="timeline profile-timeline">
          ${recent.length ? recent.map(renderTimelineItem).join("") : `<div class="empty-list">Sem eventos registrados para este servidor.</div>`}
        </div>
      </article>
    </section>
  `;
}

function renderHistoryFilters() {
  if (!els.historyServerFilter) return;
  const current = state.historyFilters.serverId;
  const options = sortedByAlpha(state.servers, serverSortLabel)
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
            <article class="alert-card ${alert.severity || "info"} ${alert.type !== "down" ? "alert-recovered" : ""} ${alert.read ? "read" : "unread"}">
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
  renderNotificationPopup();
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

function alertServerName(alert) {
  return alert.serverName || serverById(alert.serverId)?.name || "Alerta";
}

function alertCompanyName(alert) {
  const groupId = alertGroupId(alert);
  return groupId === "none" ? "Sem empresa" : groupLabel(groupId);
}

function renderNotificationPopup() {
  if (!els.notificationList) return;
  const alerts = [...(state.alerts || [])].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  const unreadCount = alerts.filter((alert) => !alert.read).length;
  const openCount = alerts.filter((alert) => !alert.read && alert.type === "down").length;
  if (els.notificationBadge) {
    els.notificationBadge.textContent = unreadCount;
    els.notificationBadge.classList.toggle("is-empty", unreadCount === 0);
  }
  if (els.notificationSummary) {
    els.notificationSummary.textContent = `${openCount} ${openCount === 1 ? "alerta aberto" : "alertas abertos"} · ${unreadCount} ${unreadCount === 1 ? "nao lido" : "nao lidos"}`;
  }

  const recentAlerts = alerts.slice(0, 6);
  els.notificationList.innerHTML = recentAlerts.length
    ? recentAlerts
        .map(
          (alert) => `
            <button class="notification-item ${alert.read ? "read" : "unread"}" type="button" data-notification-alert-id="${escapeHtml(alert.id)}">
              <span class="status-dot ${alert.type === "down" ? "offline" : "online"}"></span>
              <span class="notification-item-body">
                <strong>${escapeHtml(alertServerName(alert))}</strong>
                <small>${escapeHtml(alert.message || severityLabel(alert.severity))}</small>
                <em>${escapeHtml(alertCompanyName(alert))} · ${formatDate(alert.createdAt)}</em>
              </span>
              <span class="status-badge ${alert.type === "down" ? "offline" : "online"}">${alert.read ? "lido" : "novo"}</span>
            </button>
          `
        )
        .join("")
    : `<div class="empty-list compact-empty">Nenhum alerta recente.</div>`;
}

async function requestBrowserNotifications() {
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
}

async function markAllAlertsRead() {
  await api("/api/alerts/read", { method: "POST" });
  state.alerts = state.alerts.map((alert) => ({ ...alert, read: true }));
  renderAlerts();
  renderMetrics();
  renderSimpleDashboard();
  if (els.notificationMenu) els.notificationMenu.open = false;
  showToast("Alertas atualizados", "Todos os alertas foram marcados como lidos.");
}

async function clearAllAlertsHistory() {
  if (!window.confirm("Resetar todos os alertas?\n\nOs eventos tecnicos continuam preservados no Historico.")) return;
  try {
    await api("/api/alerts", { method: "DELETE" });
    state.alerts = [];
    if (els.notificationMenu) els.notificationMenu.open = false;
    render();
    showToast("Alertas resetados", "Todos os alertas foram removidos.");
  } catch (error) {
    showToast("Falha ao resetar alertas", error.message);
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

function backupClientMonitoredTotal(status) {
  return status.success + status.error + status.warning;
}

function backupClientUnmonitoredTotal(status) {
  return status.nomon + status.info;
}

function backupClientHealthPct(status) {
  const monitored = backupClientMonitoredTotal(status);
  return monitored ? Math.round((status.success / monitored) * 1000) / 10 : 0;
}

function captureBackupsScroll() {
  const ids = ["backupsDirectoryList", "backupsSetsList", "backupsHealthRows", "backupsAttentionList", "backupsClientGrid"];
  const positions = {};
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) positions[id] = element.scrollTop;
  }
  if (els.backupsProfilePanel) positions.backupsProfilePanel = els.backupsProfilePanel.scrollTop;
  const jobsList = els.backupsProfilePanel?.querySelector(".backup-jobs-list, .company-mini-list.simple-scroll-list");
  if (jobsList) positions.backupsJobsList = jobsList.scrollTop;
  return positions;
}

function restoreBackupsScroll(positions) {
  for (const [id, scrollTop] of Object.entries(positions)) {
    if (id === "backupsProfilePanel") {
      if (els.backupsProfilePanel) els.backupsProfilePanel.scrollTop = scrollTop;
      continue;
    }
    if (id === "backupsJobsList") {
      const jobsList = els.backupsProfilePanel?.querySelector(".backup-jobs-list, .company-mini-list.simple-scroll-list");
      if (jobsList) jobsList.scrollTop = scrollTop;
      continue;
    }
    const element = document.getElementById(id);
    if (element) element.scrollTop = scrollTop;
  }
}

function renderBackups() {
  if (!els.backupsHero) return;
  const backupsScrollPositions = captureBackupsScroll();
  const backups = state.cloudBackup || null;
  const configured = Boolean(backups?.configured);
  const status = backups?.status || { info: 0, success: 0, warning: 0, error: 0, nomon: 0, total: 0 };
  const clients = Array.isArray(backups?.clients) ? backups.clients : [];
  const total = status.total || 0;
  const monitoredTotal = backupClientMonitoredTotal(status);
  const unmonitoredTotal = backupClientUnmonitoredTotal(status);
  const healthPct = configured ? backupClientHealthPct(status) : 0;
  if (els.backupsSyncMeta) {
    els.backupsSyncMeta.textContent = backups?.fetchedAt
      ? `Ultima atualizacao: ${formatDate(backups.fetchedAt)}`
      : configured
      ? "Dados recebidos, aguardando horario da sincronizacao"
      : "Integracao ainda nao configurada";
  }
  const clientsWithIssues = clients
    .filter((client) => client.status.error > 0 || backupClientUnmonitoredTotal(client.status) > 0)
    .sort((left, right) =>
      (right.status.error + backupClientUnmonitoredTotal(right.status)) -
      (left.status.error + backupClientUnmonitoredTotal(left.status))
    );

  const tone = !configured ? "warning" : status.error > 0 ? "danger" : unmonitoredTotal > 0 ? "warning" : "success";
  const headline = !configured
    ? "Integracao nao configurada"
    : tone === "danger"
    ? "Atencao necessaria"
    : tone === "warning"
    ? "Acompanhar coleta"
    : "Backups saudaveis";
  const message = !configured
    ? "Cadastre a API key do Cloud Backup para comecar a receber dados aqui."
    : tone === "danger"
    ? `${status.error} backup${status.error === 1 ? "" : "s"} com erro e ${unmonitoredTotal} sem monitoramento.`
    : tone === "warning"
    ? `${unmonitoredTotal} backup${unmonitoredTotal === 1 ? "" : "s"} sem monitoramento ativo, sem erro critico confirmado.`
    : "Nenhum erro critico de backup no momento.";

  els.backupsHero.className = `simple-hero ${tone}`;
  els.backupsHero.innerHTML = `
    <div>
      <span class="simple-kicker">Resumo de backups</span>
      <h2>${escapeHtml(headline)}</h2>
      <p>${escapeHtml(message)}</p>
    </div>
    ${availabilityGaugeHtml(configured ? healthPct : undefined, { title: "Taxa de sucesso", caption: "" })}
  `;

  if (els.backupsKpiRow) {
    els.backupsKpiRow.innerHTML = `
      <article><span>Monitorados</span><strong>${monitoredTotal}</strong><small>com coleta ativa</small></article>
      <article class="success"><span>Sucesso</span><strong>${status.success}</strong><small>concluidos</small></article>
      <article class="${status.error ? "danger" : "success"}" data-backup-errors-trigger="1"><span>Erro</span><strong>${status.error}</strong><small>com falha</small></article>
      <article class="${unmonitoredTotal ? "warning" : "success"}"><span>Sem monitor</span><strong>${unmonitoredTotal}</strong><small>sem coleta ativa</small></article>
      <article class="${clientsWithIssues.length ? "danger" : "success"}"><span>Clientes</span><strong>${clients.length}</strong><small>${clientsWithIssues.length} com problema</small></article>
    `;
  }

  const parseBackupDate = (value) => {
    if (!value) return NaN;
    const t = new Date(String(value).replace(" ", "T")).getTime();
    return Number.isFinite(t) ? t : NaN;
  };
  const allBackupSets = clients.flatMap((client) =>
    (client.backupSets || []).map((set) => ({ ...set, clientLabel: client.groupName || client.name }))
  );
  const now = Date.now();
  const dayStart = now - 24 * 60 * 60 * 1000;
  const recentAttempts = allBackupSets.filter((set) => {
    const t = parseBackupDate(set.lastBackupJobDate);
    return Number.isFinite(t) && t >= dayStart && t <= now;
  });
  const recentFailed = recentAttempts.filter((set) => set.status !== "success");

  if (els.backupsDestinationMeta) {
    els.backupsDestinationMeta.textContent = configured
      ? `${recentAttempts.length} tentativa${recentAttempts.length === 1 ? "" : "s"}`
      : "Sem dados";
  }

  if (els.backupsDestinationChart) {
    const bucketCount = 8;
    const bucketMs = 3 * 60 * 60 * 1000;
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const start = now - (bucketCount - index) * bucketMs;
      const end = start + bucketMs;
      const inBucket = recentAttempts.filter((set) => {
        const t = parseBackupDate(set.lastBackupJobDate);
        return t >= start && t < end;
      });
      const failed = inBucket.filter((set) => set.status !== "success").length;
      return { start, count: inBucket.length, failed };
    });
    const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
    els.backupsDestinationChart.innerHTML = configured
      ? buckets
          .map((bucket) => {
            const height = Math.max(bucket.count ? 12 : 3, Math.round((bucket.count / maxCount) * 100));
            const barTone = bucket.count === 0 ? "" : bucket.failed > 0 ? "active" : "success";
            const hour = new Date(bucket.start).getHours().toString().padStart(2, "0");
            const title = bucket.count
              ? `${bucket.count} tentativa${bucket.count === 1 ? "" : "s"} por volta de ${hour}h${bucket.failed ? `, ${bucket.failed} com falha` : ""}`
              : `Sem tentativas por volta de ${hour}h`;
            return `<span class="${barTone}" style="--bar-height:${height}%" title="${title}"><i></i></span>`;
          })
          .join("")
      : "";
  }

  if (els.backupsDestinationFoot) {
    els.backupsDestinationFoot.innerHTML = !configured
      ? ""
      : `
        <span>24h atras</span>
        <strong>${recentAttempts.length ? `${recentAttempts.length} tentativa${recentAttempts.length === 1 ? "" : "s"} &middot; ${recentFailed.length} falha${recentFailed.length === 1 ? "" : "s"}` : "Sem tentativas registradas"}</strong>
        <span>agora</span>
      `;
  }

  const donutTotal = Math.max(1, monitoredTotal);
  const successDeg = (status.success / donutTotal) * 360;
  const errorDeg = (status.error / donutTotal) * 360;
  const warningDeg = (status.warning / donutTotal) * 360;

  if (els.backupsDonutMeta) {
    els.backupsDonutMeta.textContent = `${monitoredTotal} monitorado${monitoredTotal === 1 ? "" : "s"}`;
  }
  if (els.backupsStatusDonut) {
    els.backupsStatusDonut.style.setProperty("--online-deg", `${successDeg}deg`);
    els.backupsStatusDonut.style.setProperty("--offline-deg", `${errorDeg}deg`);
    els.backupsStatusDonut.style.setProperty("--attention-deg", `${warningDeg}deg`);
  }
  if (els.backupsStatusDonutValue) {
    els.backupsStatusDonutValue.textContent = `${healthPct}%`;
  }
  if (els.backupsDonutLegend) {
    els.backupsDonutLegend.innerHTML = `
      <span><i class="success"></i>${status.success} sucesso</span>
      <span><i class="danger"></i>${status.error} erro</span>
      <span><i class="warning"></i>${status.warning} alerta</span>
      <span><i class="neutral"></i>${unmonitoredTotal} sem monitoramento</span>
    `;
  }

  if (els.backupsSetsMeta) els.backupsSetsMeta.textContent = `${total} set${total === 1 ? "" : "s"}`;
  if (els.backupsSetsSummary) {
    els.backupsSetsSummary.innerHTML = `
      <article><strong>${status.success}</strong><span>sucesso</span></article>
      <article class="${status.warning ? "warning" : ""}"><strong>${status.warning}</strong><span>alerta</span></article>
      <article class="${status.error ? "danger" : ""}" data-backup-errors-trigger="1"><strong>${status.error}</strong><span>erro</span></article>
    `;
  }
  if (els.backupsSetsList) {
    const allIssues = clients.flatMap((client) => client.issues.map((issue) => ({ ...issue, clientLabel: client.groupName || client.name })));
    const sortedIssues = allIssues
      .slice()
      .sort((left, right) => (left.status === "error" ? 0 : 1) - (right.status === "error" ? 0 : 1))
      .slice(0, 20);
    els.backupsSetsList.innerHTML = !configured
      ? `<div class="simple-empty">Configure a API de backup para ver os dados.</div>`
      : sortedIssues.length
      ? sortedIssues
          .map((issue) => {
            const rowTone = issue.status === "error" ? "offline" : "degraded";
            return `
              <button class="simple-network-row ${rowTone}" type="button">
                <span>
                  <strong>${escapeHtml(issue.backupSetName || issue.loginDescription)}</strong>
                  <small>${escapeHtml(issue.clientLabel)} &middot; ${escapeHtml(issue.destinationName || "Sem destino")}</small>
                </span>
                <em>${escapeHtml(issue.lastJobStatusDescription || issue.status)}</em>
              </button>
            `;
          })
          .join("")
      : `<div class="simple-empty">Nenhum backup set com problema.</div>`;
  }

  if (els.backupsAttentionMeta) {
    els.backupsAttentionMeta.textContent = clientsWithIssues.length ? `${clientsWithIssues.length} itens principais` : "Sem acao imediata";
  }
  if (els.backupsAttentionList) {
    els.backupsAttentionList.innerHTML = !configured
      ? `<div class="simple-empty">Configure a API de backup para ver os dados.</div>`
      : clientsWithIssues.length
      ? clientsWithIssues
          .slice(0, 4)
          .map((client) => `
            <button class="simple-attention-item ${client.status.error > 0 ? "offline" : "probe_stale"}" type="button" data-backup-attention-client="${escapeHtml(String(client.id))}">
              <span>
                <strong>${escapeHtml(client.groupName || client.name)}</strong>
                <small>${backupClientMonitoredTotal(client.status)} jobs monitorados</small>
              </span>
              <em>${client.status.error > 0 ? `${client.status.error} erro${client.status.error === 1 ? "" : "s"}` : `${backupClientUnmonitoredTotal(client.status)} sem monitor`}</em>
            </button>
          `)
          .join("")
      : `<div class="simple-empty">Tudo certo nos backups monitorados.</div>`;
  }

  if (els.backupsHealthRows) {
    const healthRows = clients
      .map((client) => ({ client, pct: backupClientHealthPct(client.status), monitored: backupClientMonitoredTotal(client.status) }))
      .filter((item) => item.monitored > 0)
      .sort((left, right) => left.pct - right.pct)
      .slice(0, 6);

    els.backupsHealthRows.innerHTML = !configured
      ? `<div class="simple-empty">Configure a API de backup para ver os dados.</div>`
      : healthRows.length
      ? healthRows
          .map(({ client, pct, monitored }) => `
            <div class="backup-health-row ${availabilityTone(pct)}">
              <span>
                <strong>${escapeHtml(client.groupName || client.name)}</strong>
                <small>${client.status.success}/${monitored} backups monitorados com sucesso</small>
              </span>
              <em>${pct}%</em>
              <i aria-hidden="true"><b style="width:${Math.max(0, Math.min(100, pct))}%"></b></i>
            </div>
          `)
          .join("")
      : `<div class="simple-empty">Nenhum cliente com backups monitorados.</div>`;
  }

  const clientTilesSorted = clients.slice().sort((left, right) => {
    const toneOrder = { danger: 0, warning: 1, success: 2 };
    const leftTone = left.status.error > 0 ? "danger" : backupClientUnmonitoredTotal(left.status) > 0 ? "warning" : "success";
    const rightTone = right.status.error > 0 ? "danger" : backupClientUnmonitoredTotal(right.status) > 0 ? "warning" : "success";
    return (
      (toneOrder[leftTone] ?? 3) - (toneOrder[rightTone] ?? 3) ||
      compareAlpha(left.groupName || left.name, right.groupName || right.name)
    );
  });

  if (els.backupsClientGrid) {
    const clientTiles = clientTilesSorted.slice(0, 8);
    els.backupsClientGrid.innerHTML = !configured
      ? `<div class="simple-empty">Configure a API de backup para ver os dados.</div>`
      : clientTiles.length
      ? clientTiles
          .map((client) => {
            const tileTone = client.status.error > 0 ? "danger" : backupClientUnmonitoredTotal(client.status) > 0 ? "warning" : "success";
            const pct = backupClientHealthPct(client.status);
            return `
              <button class="simple-client-card ${tileTone}" type="button" data-backup-client-jump="${escapeHtml(String(client.id))}">
                <strong>${escapeHtml(client.groupName || client.name)}</strong>
                <span>${client.status.success}/${backupClientMonitoredTotal(client.status)} sucesso</span>
                <small>${client.status.error ? `${client.status.error} erro${client.status.error === 1 ? "" : "s"}` : `${pct}% saude`}</small>
              </button>
            `;
          })
          .join("")
      : `<div class="simple-empty">Nenhum cliente retornado pela API.</div>`;
  }

  if (els.backupsEmptyState) els.backupsEmptyState.hidden = configured;
  if (els.backupsProfileLayout) els.backupsProfileLayout.hidden = !configured;
  if (els.backupsClientCountHint) {
    els.backupsClientCountHint.textContent = `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}`;
  }
  if (els.backupsDirectoryCount) {
    els.backupsDirectoryCount.textContent = `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}`;
  }
  if (!configured) return;

  if (state.selectedBackupClientId && !clients.some((client) => String(client.id) === state.selectedBackupClientId)) {
    state.selectedBackupClientId = null;
  }
  if (!state.selectedBackupClientId && clientTilesSorted.length) {
    state.selectedBackupClientId = String(clientTilesSorted[0].id);
  }

  if (els.backupsDirectoryList) {
    els.backupsDirectoryList.innerHTML = clients.length
      ? sortedByAlpha(clients, (client) => client.groupName || client.name)
          .map((client) => {
            const clientId = String(client.id);
            const selected = clientId === state.selectedBackupClientId ? "selected" : "";
            const pulseStatus = client.status.error > 0 ? "offline" : backupClientUnmonitoredTotal(client.status) > 0 ? "paused" : "online";
            const badgeLabel = client.status.error > 0 ? "ATENCAO" : backupClientUnmonitoredTotal(client.status) > 0 ? "VERIFICAR" : "OK";
            return `
              <button class="server-directory-item ${selected}" type="button" data-backup-client-id="${escapeHtml(clientId)}">
                <span class="status-pulse ${pulseStatus}"></span>
                <span>
                  <strong>${escapeHtml(client.groupName || client.name)}</strong>
                  <small>${client.status.total} jobs</small>
                </span>
                <em>${badgeLabel}</em>
              </button>
            `;
          })
          .join("")
      : `<div class="empty-list">Nenhum cliente retornado pela API.</div>`;
  }

  if (els.backupsProfilePanel) {
    const linkSelectIsActive =
      document.activeElement?.matches?.("[data-backup-client-link]") && els.backupsProfilePanel.contains(document.activeElement);
    if (!linkSelectIsActive) {
      const selectedClient = clients.find((client) => String(client.id) === state.selectedBackupClientId);
      els.backupsProfilePanel.innerHTML = renderBackupClientProfile(selectedClient);
    }
  }

  restoreBackupsScroll(backupsScrollPositions);
}

function renderBackupClientProfile(client) {
  if (!client) {
    return `
      <div class="empty-state">
        <strong>Nenhum cliente selecionado</strong>
        <span>Selecione um cliente para ver o detalhamento completo.</span>
      </div>
    `;
  }
  const clientId = String(client.id);
  const jobs = Array.isArray(client.backupSets) ? client.backupSets : [];
  const c = client.status;
  const clientMonitoredTotal = backupClientMonitoredTotal(c);
  const clientUnmonitoredTotal = backupClientUnmonitoredTotal(c);
  const clientTotal = Math.max(1, clientMonitoredTotal);
  const clientHealthPct = backupClientHealthPct(c);
  const successDeg = (c.success / clientTotal) * 360;
  const errorDeg = (c.error / clientTotal) * 360;
  const warningDeg = (c.warning / clientTotal) * 360;
  const badgeTone = c.error > 0 ? "offline" : clientUnmonitoredTotal > 0 ? "probe_stale" : "online";
  const badgeLabel = c.error > 0 ? "ATENCAO" : clientUnmonitoredTotal > 0 ? "VERIFICAR" : "OK";
  const backupJobTimestamp = (value) => {
    if (!value) return 0;
    const timestamp = new Date(String(value).replace(" ", "T")).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const sortedJobs = jobs.slice().sort((left, right) => {
    const order = { error: 0, warning: 1, nomon: 2, info: 3, success: 4 };
    return (
      (order[left.status] ?? 5) - (order[right.status] ?? 5) ||
      backupJobTimestamp(right.lastBackupJobDate) - backupJobTimestamp(left.lastBackupJobDate) ||
      compareAlpha(left.loginDescription || left.backupSetName, right.loginDescription || right.backupSetName)
    );
  });
  const lastAttemptJob = jobs.slice().sort((left, right) => backupJobTimestamp(right.lastBackupJobDate) - backupJobTimestamp(left.lastBackupJobDate))[0];
  const lastSuccessJob = jobs
    .filter((job) => job.lastSuccessBackupJobDate)
    .sort((left, right) => backupJobTimestamp(right.lastSuccessBackupJobDate) - backupJobTimestamp(left.lastSuccessBackupJobDate))[0];
  const lastAttemptLabel = lastAttemptJob?.lastBackupJobDate ? formatDate(lastAttemptJob.lastBackupJobDate) : "-";
  const lastSuccessLabel = lastSuccessJob?.lastSuccessBackupJobDate ? formatDate(lastSuccessJob.lastSuccessBackupJobDate) : "-";

  const destinationCounts = client.issues.reduce((acc, issue) => {
    const key = issue.destinationName || "Sem destino";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const destinationEntries = Object.entries(destinationCounts).sort((left, right) => right[1] - left[1]).slice(0, 8);
  const maxDestCount = Math.max(1, ...destinationEntries.map(([, count]) => count));
  const destinationBars = destinationEntries
    .map(([name, count]) => {
      const height = Math.max(12, Math.round((count / maxDestCount) * 100));
      return `<span class="active" style="--bar-height:${height}%" title="${count} problema(s) em ${escapeHtml(name)}"><i></i></span>`;
    })
    .join("");

  const loginItems = client.issues.length
    ? client.issues
        .slice(0, 4)
        .map(
          (issue) => `
            <button type="button">
              <span>${escapeHtml(issue.loginDescription || issue.backupSetName)}</span>
              <strong class="status-badge ${issue.status === "error" ? "offline" : "probe_stale"}">${escapeHtml(issue.lastJobStatusDescription || issue.status)}</strong>
            </button>
          `
        )
        .join("")
    : `<div class="empty-list compact">Nenhum problema de coleta.</div>`;

  const groupOptions = sortedByAlpha(state.groups, groupSortLabel)
    .map((group) => `<option value="${group.id}" ${client.groupId === group.id ? "selected" : ""}>${escapeHtml(group.name)}</option>`)
    .join("");

  return `
    <div class="detail-header">
      <div class="company-profile-title">
        <div>
          <h2>${escapeHtml(client.groupName || client.name)}</h2>
          <div class="detail-meta">${clientMonitoredTotal} job${clientMonitoredTotal === 1 ? "" : "s"} monitorado${clientMonitoredTotal === 1 ? "" : "s"}${clientUnmonitoredTotal ? ` &middot; ${clientUnmonitoredTotal} sem monitoramento` : ""}${client.groupName ? ` &middot; API: ${escapeHtml(client.name)}` : ""}</div>
        </div>
      </div>
      <span class="status-badge ${badgeTone}">${badgeLabel}</span>
    </div>

    <section class="company-insight-grid backup-insight-grid" aria-label="Visao visual dos backups">
      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Status dos backups</h3>
          <span>${clientMonitoredTotal} monitorado${clientMonitoredTotal === 1 ? "" : "s"}</span>
        </div>
        <div class="simple-status-chart company-status-chart">
          <div class="simple-status-donut" style="--online-deg:${successDeg}deg; --offline-deg:${errorDeg}deg; --attention-deg:${warningDeg}deg;" aria-hidden="true">
            <strong>${clientHealthPct}%</strong>
          </div>
          <div class="simple-status-legend">
            <span><i class="success"></i>${c.success} sucesso</span>
            <span><i class="danger"></i>${c.error} erro</span>
            <span><i class="warning"></i>${c.warning} alerta</span>
            <span><i class="neutral"></i>${clientUnmonitoredTotal} sem monitoramento</span>
          </div>
        </div>
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Por destino</h3>
          <span>${destinationEntries.length} destino${destinationEntries.length === 1 ? "" : "s"} com problema</span>
        </div>
        ${
          destinationEntries.length
            ? `<div class="simple-failure-chart company-failure-chart">${destinationBars}</div>`
            : `<div class="empty-list compact">Nenhum destino com problema.</div>`
        }
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Conjuntos</h3>
          <span>${c.total} no total</span>
        </div>
        <div class="simple-network-summary">
          <article><strong>${c.success}</strong><span>sucesso</span></article>
          <article class="${c.warning ? "warning" : ""}"><strong>${c.warning}</strong><span>alerta</span></article>
          <article class="${c.error ? "danger" : ""}"><strong>${c.error}</strong><span>erro</span></article>
        </div>
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Saude da coleta</h3>
          <span>${clientUnmonitoredTotal} sem monitor</span>
        </div>
        <div class="company-health-meter">
          <strong>${clientHealthPct}%</strong>
          <span><i style="width:${Math.max(0, Math.min(100, clientHealthPct))}%"></i></span>
          <small>${clientUnmonitoredTotal ? `${clientUnmonitoredTotal} sem monitorar` : "Coleta respondendo"}</small>
        </div>
        <div class="company-mini-list">${loginItems}</div>
      </article>
    </section>

    <section class="detail-section backup-summary-section">
      <h3>Resumo do cliente</h3>
      <div class="detail-grid backup-detail-grid">
        <div class="detail-stat"><span>Monitorados</span><strong>${clientMonitoredTotal}</strong><small>jobs com coleta ativa</small></div>
        <div class="detail-stat"><span>Sucesso</span><strong>${c.success}</strong><small>ultima coleta validada</small></div>
        <div class="detail-stat ${c.error ? "backup-stat-danger" : ""}"><span>Erros</span><strong>${c.error}</strong><small>falhas confirmadas</small></div>
        <div class="detail-stat ${clientUnmonitoredTotal ? "watch-limit-stat" : ""}"><span>Sem monitor</span><strong>${clientUnmonitoredTotal}</strong><small>coleta desativada</small></div>
        <div class="detail-stat"><span>Ultima tentativa</span><strong>${escapeHtml(lastAttemptLabel)}</strong><small>${escapeHtml(lastAttemptJob?.destinationName || "sem destino")}</small></div>
        <div class="detail-stat"><span>Ultimo sucesso</span><strong>${escapeHtml(lastSuccessLabel)}</strong><small>${escapeHtml(lastSuccessJob?.destinationName || "sem destino")}</small></div>
      </div>
    </section>

    <section class="detail-section backup-jobs-section">
      <div class="panel-title compact-title">
        <h3>Trabalhos de backup</h3>
        <span>${jobs.length} job${jobs.length === 1 ? "" : "s"}</span>
      </div>
      <div class="company-server-list backup-jobs-list">
        ${
          sortedJobs.length
            ? sortedJobs
                .map((job) => {
                  const jobTone = backupJobBadgeTone(job.status);
                  const rowTone = job.status === "error" ? "is-offline" : job.status === "warning" ? "is-warning" : "";
                  return `
                    <button class="server-directory-item company-server-row backup-job-row ${rowTone}" type="button">
                      <span class="status-pulse ${jobTone === "offline" ? "offline" : jobTone === "dependency_down" ? "paused" : "online"}"></span>
                      <span class="backup-job-icon" aria-hidden="true">BK</span>
                      <span>
                        <strong>${escapeHtml(job.loginDescription || job.backupSetName || "Backup sem nome")}</strong>
                        <small>${escapeHtml(job.destinationName || "Sem destino")} &middot; ${job.lastBackupJobDate ? escapeHtml(job.lastBackupJobDate) : "sem data"}</small>
                      </span>
                      <strong class="status-badge ${jobTone}">${escapeHtml(job.lastJobStatusDescription || job.status)}</strong>
                    </button>
                  `;
                })
                .join("")
            : `<div class="empty-list compact">Nenhum job retornado para este cliente.</div>`
        }
      </div>
    </section>

    ${
      isAdmin()
        ? `<section class="detail-section backup-link-section">
            <div class="panel-title compact-title">
              <h3>Vinculo administrativo</h3>
              <span>${client.groupName ? "Empresa associada" : "Sem empresa"}</span>
            </div>
            <div class="backup-link-row">
              ${
                state.backupLinkEditorOpen === clientId
                  ? `<label class="backup-link-control">
                      <span>Empresa</span>
                      <select data-backup-client-link="${escapeHtml(clientId)}">
                        <option value="">Nao vinculado</option>
                        ${groupOptions}
                      </select>
                    </label>`
                  : `<button class="ghost-button compact" type="button" data-backup-link-edit="${escapeHtml(clientId)}">
                      ${client.groupName ? `Vinculado a ${escapeHtml(client.groupName)}` : "Vincular empresa"} &#9998;
                    </button>`
              }
            </div>
          </section>`
        : ""
    }
  `;
}

function backupJobBadgeTone(status) {
  if (status === "success") return "online";
  if (status === "error") return "offline";
  if (status === "warning") return "dependency_down";
  return "paused";
}

function openBackupErrorsDialog() {
  if (!els.backupErrorsDialog || !els.backupErrorsList) return;
  const clients = Array.isArray(state.cloudBackup?.clients) ? state.cloudBackup.clients : [];
  const errors = clients
    .flatMap((client) =>
      (client.backupSets || [])
        .filter((set) => set.status === "error")
        .map((set) => ({ ...set, clientLabel: client.groupName || client.name }))
    )
    .sort((left, right) => compareAlpha(left.clientLabel, right.clientLabel) || compareAlpha(left.backupSetName, right.backupSetName));

  els.backupErrorsList.innerHTML = errors.length
    ? errors
        .map(
          (error) => `
            <div class="dialog-list-row">
              <div>
                <strong>${escapeHtml(error.loginDescription || error.backupSetName)}</strong>
                <small>${escapeHtml(error.clientLabel)} &middot; ${escapeHtml(error.destinationName || "Sem destino")}</small>
              </div>
              <div class="dialog-list-meta">
                <span class="status-badge offline">${escapeHtml(error.lastJobStatusDescription || "Erro")}</span>
                <small>Ultimo sucesso: ${error.lastSuccessBackupJobDate ? escapeHtml(error.lastSuccessBackupJobDate) : "nunca"}</small>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-list">Nenhum backup com erro no momento.</div>`;

  els.backupErrorsDialog.showModal();
}

function openOfflineServersDialog() {
  if (!els.offlineServersDialog || !els.offlineServersList) return;
  const activeServers = state.servers.filter((server) => server.isActive);
  const problemServers = activeServers
    .filter((server) => ["offline", "probe_stale"].includes(displayStatus(server)))
    .sort((left, right) => {
      const order = { offline: 0, probe_stale: 1 };
      return (order[displayStatus(left)] ?? 2) - (order[displayStatus(right)] ?? 2) || compareAlpha(serverSortLabel(left), serverSortLabel(right));
    });

  els.offlineServersList.innerHTML = problemServers.length
    ? problemServers
        .map((server) => {
          const status = displayStatus(server);
          return `
            <div class="dialog-list-row">
              <div>
                <strong>${escapeHtml(server.name)}</strong>
                <small>${escapeHtml(groupLabel(server.groupId))} &middot; ${escapeHtml(server.hostname)}</small>
              </div>
              <div class="dialog-list-meta">
                <span class="status-badge ${status}">${statusLabel(status)}</span>
                <small>${server.checkSource === "probe" && status === "probe_stale" ? `Probe visto: ${formatDate(server.probeLastSeenAt)}` : `Verificado: ${formatDate(server.lastCheckedAt)}`}</small>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-list">Nenhum servidor offline ou sem contato.</div>`;

  els.offlineServersDialog.showModal();
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

  els.groupsList.innerHTML = sortedByAlpha(state.groups, groupSortLabel)
    .map((group) => {
      const servers = state.servers.filter((server) => server.groupId === group.id);
      const links = state.networkLinks.filter((link) => link.groupId === group.id);
      const devices = state.networkDevices.filter((device) => device.groupId === group.id);
      const activeServers = servers.filter((server) => server.isActive);
      const offline = activeServers.filter((server) => server.currentStatus === "offline").length;
      return `
        <article class="group-card">
          <div>
            <strong>${escapeHtml(group.name)}</strong>
            <span>${escapeHtml(group.description || "Sem descricao.")}</span>
          </div>
          <div class="group-stats">
            <span>${servers.length} ${servers.length === 1 ? "servidor" : "servidores"}</span>
            <span>${links.length} ${links.length === 1 ? "link" : "links"}</span>
            <span>${devices.length} ${devices.length === 1 ? "dispositivo" : "dispositivos"}</span>
            <span>${activeServers.length} ${activeServers.length === 1 ? "ativo" : "ativos"}</span>
            <span>${offline} offline</span>
          </div>
          ${
            isAdmin()
              ? `<div class="group-actions">
                  <button class="ghost-button compact" type="button" data-group-action="edit" data-id="${group.id}">Editar</button>
                  <button class="danger-button compact" type="button" data-group-action="delete" data-id="${group.id}">Excluir</button>
                </div>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function roleLabel(role) {
  return role === "admin" ? "Administrador" : "Usuario";
}

function userCompanyLabels(user) {
  if (user.role === "admin") return "Todas as empresas";
  const ids = Array.isArray(user.groupIds) ? user.groupIds : [];
  const names = ids
    .map((id) => state.groups.find((group) => group.id === id)?.name)
    .filter(Boolean)
    .sort(compareAlpha);
  return names.length ? names.join(", ") : "Sem empresas vinculadas";
}

function renderUsers() {
  if (!els.usersList || !isAdmin()) return;
  els.userCount.textContent = `${state.users.length} ${state.users.length === 1 ? "usuario" : "usuarios"}`;

  els.usersList.innerHTML = state.users.length
    ? sortedByAlpha(state.users, (user) => user.name || user.email || user.id)
        .map(
          (user) => `
            <article class="user-card ${user.isActive ? "" : "inactive"}">
              <div>
                <strong>${escapeHtml(user.name)}</strong>
                <span>${escapeHtml(user.email)}</span>
                <small>${escapeHtml(userCompanyLabels(user))}</small>
              </div>
              <div class="user-badges">
                <span class="tag ${user.role === "admin" ? "tag-admin" : ""}">${roleLabel(user.role)}</span>
                <span class="tag ${user.isActive ? "tag-active" : ""}">${user.isActive ? "Ativo" : "Inativo"}</span>
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
    input.checked = input.value === (state.themeDraft || current.theme);
  });
  if (els.brandPreviewName) els.brandPreviewName.textContent = current.brandName;
  if (els.brandPreviewSubtitle) els.brandPreviewSubtitle.textContent = current.brandSubtitle || "Sem subtitulo";
  paintBrandLogo(els.brandPreviewLogo, current.logoDataUrl, current.brandName);
}

function renderAlertSettingsForm() {
  if (!els.alertSettingsForm) return;
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
      theme: current.theme
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

async function submitThemeSettings(event) {
  event.preventDefault();
  const theme = document.querySelector('input[name="themeMode"]:checked')?.value || branding().theme;
  try {
    const settings = await api("/api/settings/theme", { method: "PUT", body: JSON.stringify({ theme }) });
    state.settings = { ...state.settings, ...settings };
    state.themeDraft = null;
    applyBranding();
    showToast("Tema salvo", "A preferencia de tema foi atualizada.");
  } catch (error) {
    showToast("Falha ao salvar tema", error.message);
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
  const mode = options.repair || options.mode === "repair" ? "--repair " : "";
  const target = options.target || state.probeInstallTarget;
  const serverUrl = options.serverUrl || PROBE_PUBLIC_ORIGIN;
  const runner = target === "proxmox" ? "bash" : "sudo bash";
  return `curl -fsSL -H "X-ServerWatch-Probe-Token: ${token}" ${serverUrl}/downloads/probe/linux-installer | ${runner} -s -- ${mode}--server-url ${serverUrl} --probe-id ${shellQuote(probeId)} --token ${shellQuote(token)} --name ${shellQuote(probeName)}`;
}

function commandValue(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function optionalCommandLine(flag, value, options = {}) {
  const text = commandValue(value);
  if (!text) return null;
  return `  ${flag} ${options.raw ? text : shellQuote(text)}`;
}

function routerosParamValue(value) {
  return commandValue(value).replace(/[|;]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePrefixValue(value, fallback = "30") {
  const text = commandValue(value, fallback).replace("/", "");
  const number = Number.parseInt(text, 10);
  if (!Number.isFinite(number) || number < 1 || number > 32) return fallback;
  return String(number);
}

function linkProbeInstallCommand(options = {}) {
  const token = probeToken();
  if (!token) return "";
  const targets = commandValue(options.targets, "1.1.1.1,8.8.8.8,9.9.9.9");
  const lines = [
    `curl -fsSL -H "X-ServerWatch-Probe-Token: ${token}" ${PROBE_PUBLIC_ORIGIN}/downloads/linkprobe/linux-installer | sudo bash -s --`,
    `  --server-url ${PROBE_PUBLIC_ORIGIN}`,
    `  --agent-id ${shellQuote(commandValue(options.agentId, "link1-empresa"))}`,
    `  --link-name ${shellQuote(commandValue(options.linkName, "Link 1 - Empresa"))}`,
    `  --targets ${shellQuote(targets)}`,
    `  --token ${shellQuote(token)}`,
    optionalCommandLine("--interface", options.interfaceName),
    optionalCommandLine("--source-ip", options.sourceIp),
    optionalCommandLine("--interval", options.interval || "10", { raw: true }),
    optionalCommandLine("--ping-count", options.pingCount || "4", { raw: true }),
    optionalCommandLine("--threshold", options.threshold || "0.5", { raw: true }),
    optionalCommandLine("--ping-timeout", options.pingTimeout || "2", { raw: true })
  ].filter(Boolean);
  return lines.join(" \\\n");
}

function mikrotikProbeInstallCommand(options = {}) {
  const token = probeToken();
  if (!token) return "";
  const uplinks = (options.uplinks?.length ? options.uplinks : [
    { name: "Link 1 - Operadora A", interfaceName: "ether1-WAN", gateway: "192.0.2.1", prefix: "30", target: "4.2.2.2" },
    { name: "Link 2 - Operadora B", interfaceName: "ether2-WAN", gateway: "198.51.100.1", prefix: "30", target: "149.112.112.112" }
  ])
    .slice(0, 10)
    .map((uplink, index) => {
      const name = routerosParamValue(uplink.name || `Link ${index + 1}`);
      const interfaceName = routerosParamValue(uplink.interfaceName || `ether${index + 1}-WAN`);
      const gateway = routerosParamValue(uplink.gateway || "192.0.2.1");
      const prefix = normalizePrefixValue(uplink.prefix, "30");
      const target = routerosParamValue(uplink.target || (index === 0 ? "4.2.2.2" : "149.112.112.112"));
      return [name, interfaceName, gateway, prefix, target].join("|");
    })
    .join(";");
  const params = new URLSearchParams({
    serverUrl: PROBE_PUBLIC_ORIGIN,
    agentId: commandValue(options.agentId, "rb-empresa-01"),
    deviceName: commandValue(options.deviceName, "RB Empresa 01"),
    groupName: commandValue(options.groupName, ""),
    interval: commandValue(options.interval, "10"),
    uplinks
  });
  const scriptUrl = `${PROBE_PUBLIC_ORIGIN}/downloads/mikrotik/uplink-probe.rsc?${params.toString()}`;
  return `/tool fetch url=${shellQuote(scriptUrl)} http-header-field=${shellQuote(`X-ServerWatch-Probe-Token: ${token}`)} dst-path=serverwatch-mikrotik-uplink-probe.rsc; /import serverwatch-mikrotik-uplink-probe.rsc`;
}

function selectedProbeForCommand() {
  return state.probes.find((probe) => probe.id === state.selectedProbeId) || null;
}

function commandGeneratorMode() {
  return ["link", "mikrotik"].includes(state.commandGeneratorMode) ? state.commandGeneratorMode : "server";
}

function setCommandGeneratorMode(mode) {
  state.commandGeneratorMode = ["link", "mikrotik"].includes(mode) ? mode : "server";
  const activeMode = commandGeneratorMode();
  document.querySelectorAll("[data-command-generator-mode]").forEach((button) => {
    const selected = button.dataset.commandGeneratorMode === activeMode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
  document.querySelectorAll("[data-command-generator-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.commandGeneratorPanel === activeMode);
  });
  updateGeneratedCommand();
}

function setCommandGeneratorDefaults() {
  const selectedProbe = selectedProbeForCommand();
  if (els.commandServerProbeId) els.commandServerProbeId.value = selectedProbe?.id || "srv-cliente-01";
  if (els.commandServerProbeName) els.commandServerProbeName.value = selectedProbe?.name || selectedProbe?.hostName || "SRV-CLIENTE-01";
  if (els.commandServerTarget) els.commandServerTarget.value = state.probeInstallTarget || "linux";
  if (els.commandServerMode) els.commandServerMode.value = selectedProbe ? "repair" : "install";
  if (els.commandLinkAgentId) els.commandLinkAgentId.value = "cliente-link1-operadora";
  if (els.commandLinkName) els.commandLinkName.value = "Link 1 - Operadora";
  if (els.commandLinkTargets) els.commandLinkTargets.value = "4.2.2.2,149.112.112.112";
  if (els.commandLinkInterface) els.commandLinkInterface.value = "";
  if (els.commandLinkSourceIp) els.commandLinkSourceIp.value = "";
  if (els.commandLinkInterval) els.commandLinkInterval.value = "10";
  if (els.commandLinkPingCount) els.commandLinkPingCount.value = "4";
  if (els.commandLinkThreshold) els.commandLinkThreshold.value = "0.5";
  if (els.commandLinkPingTimeout) els.commandLinkPingTimeout.value = "2";
  if (els.commandMikrotikAgentId) els.commandMikrotikAgentId.value = "rb-empresa-borda";
  if (els.commandMikrotikDeviceName) els.commandMikrotikDeviceName.value = "RB Empresa Borda";
  if (els.commandMikrotikGroupName) els.commandMikrotikGroupName.value = "";
  if (els.commandMikrotikInterval) els.commandMikrotikInterval.value = "10";
  renderCommandMikrotikUplinks();
}

function collectCommandMikrotikUplinks() {
  if (!els.commandMikrotikUplinkList) return state.commandGeneratorMikrotikUplinks;
  state.commandGeneratorMikrotikUplinks = Array.from(els.commandMikrotikUplinkList.querySelectorAll("[data-command-uplink-row]"))
    .map((row) => ({
      name: row.querySelector("[data-command-uplink-name]")?.value || "",
      interfaceName: row.querySelector("[data-command-uplink-interface]")?.value || "",
      gateway: row.querySelector("[data-command-uplink-gateway]")?.value || "",
      prefix: row.querySelector("[data-command-uplink-prefix]")?.value || "",
      target: row.querySelector("[data-command-uplink-target]")?.value || ""
    }))
    .slice(0, 10);
  if (!state.commandGeneratorMikrotikUplinks.length) {
    state.commandGeneratorMikrotikUplinks = [{ name: "", interfaceName: "", gateway: "", prefix: "30", target: "" }];
  }
  return state.commandGeneratorMikrotikUplinks;
}

function renderCommandMikrotikUplinks() {
  if (!els.commandMikrotikUplinkList) return;
  const uplinks = state.commandGeneratorMikrotikUplinks.slice(0, 10);
  els.commandMikrotikUplinkList.innerHTML = uplinks
    .map((uplink, index) => {
      const removable = uplinks.length > 1;
      return `
        <div class="command-uplink-row" data-command-uplink-row>
          <label>
            Nome
            <input data-command-uplink-name value="${escapeHtml(uplink.name)}" placeholder="Link ${index + 1} - Operadora" />
          </label>
          <label>
            Interface
            <input data-command-uplink-interface value="${escapeHtml(uplink.interfaceName)}" placeholder="ether${index + 1}-WAN" />
          </label>
          <label>
            Gateway
            <input data-command-uplink-gateway value="${escapeHtml(uplink.gateway)}" placeholder="LINK-WAN ou 192.0.2.1" />
          </label>
          <label>
            Mascara
            <input data-command-uplink-prefix value="${escapeHtml(uplink.prefix)}" placeholder="/30" />
          </label>
          <label>
            Alvo
            <input data-command-uplink-target value="${escapeHtml(uplink.target)}" placeholder="4.2.2.2" />
          </label>
          <button class="ghost-button compact" type="button" data-remove-command-uplink="${index}" ${removable ? "" : "disabled"}>-</button>
        </div>
      `;
    })
    .join("");
  if (els.addCommandMikrotikUplink) {
    els.addCommandMikrotikUplink.disabled = uplinks.length >= 10;
    els.addCommandMikrotikUplink.title = uplinks.length >= 10 ? "Limite de 10 uplinks atingido" : "Adicionar uplink";
  }
  updateGeneratedCommand();
}

function generatedCommand() {
  const mode = commandGeneratorMode();
  if (mode === "link") {
    return linkProbeInstallCommand({
      agentId: els.commandLinkAgentId?.value,
      linkName: els.commandLinkName?.value,
      targets: els.commandLinkTargets?.value,
      interfaceName: els.commandLinkInterface?.value,
      sourceIp: els.commandLinkSourceIp?.value,
      interval: els.commandLinkInterval?.value,
      pingCount: els.commandLinkPingCount?.value,
      threshold: els.commandLinkThreshold?.value,
      pingTimeout: els.commandLinkPingTimeout?.value
    });
  }
  if (mode === "mikrotik") {
    return mikrotikProbeInstallCommand({
      agentId: els.commandMikrotikAgentId?.value,
      deviceName: els.commandMikrotikDeviceName?.value,
      groupName: els.commandMikrotikGroupName?.value,
      interval: els.commandMikrotikInterval?.value,
      uplinks: collectCommandMikrotikUplinks()
    });
  }
  return probeInstallCommandFor(
    {
      id: els.commandServerProbeId?.value || "srv-cliente-01",
      name: els.commandServerProbeName?.value || "SRV-CLIENTE-01"
    },
    {
      target: els.commandServerTarget?.value || "linux",
      repair: els.commandServerMode?.value === "repair"
    }
  );
}

function updateGeneratedCommand() {
  if (!els.generatedCommandOutput) return;
  els.generatedCommandOutput.value = probeToken() ? generatedCommand() : "Token ainda nao disponivel.";
}

function openCommandGeneratorDialog(mode = "server") {
  if (!els.commandGeneratorDialog || !isAdmin()) return;
  setCommandGeneratorDefaults();
  setCommandGeneratorMode(mode);
  updateGeneratedCommand();
  els.commandGeneratorDialog.showModal();
}

function closeCommandGeneratorDialog() {
  forceCloseDialog(els.commandGeneratorDialog);
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

function probeCompanySummary(probe) {
  const labels = [...new Set(probeLinkedServers(probe.id).map((server) => groupLabel(server.groupId)))].filter(Boolean).sort(compareAlpha);
  if (!labels.length) return "Sem empresa vinculada";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
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
        <div class="detail-stat metric-stat"><span>CPU</span><strong>${formatPercent(cpu.usagePercent)}</strong>${metricBar(cpu.usagePercent)}<small>${escapeHtml(cpu.model || "-")}</small></div>
        <div class="detail-stat metric-stat"><span>Memoria</span><strong>${formatPercent(memory.usedPercent)}</strong>${metricBar(memory.usedPercent)}<small>${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}</small></div>
        <div class="detail-stat metric-stat"><span>Disco</span><strong>${formatPercent(disk.usedPercent)}</strong>${metricBar(disk.usedPercent)}<small>${escapeHtml(disk.mount || "-")} · ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}</small></div>
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

function renderMetricRows(title, subtitle, rows) {
  if (!rows?.length) return "";
  return `
    <div class="profile-extra-list">
      <div class="panel-title compact-title">
        <h3>${escapeHtml(title)}</h3>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      ${rows.join("")}
    </div>
  `;
}

function renderExtendedServerMetrics(metrics) {
  if (!metrics) return "";
  const relevantAddresses = (metrics.networkInterfaces || [])
    .flatMap((item) => item.addresses || [])
    .map((address) => address.address)
    .filter((address) => address && !address.startsWith("127.") && !address.startsWith("169.254.") && address !== "::1");
  const diskRows = (metrics.diskPartitions || []).map((item) => `
    <article class="profile-data-row">
      <div>
        <strong>${escapeHtml(item.mount || item.filesystem || "-")}</strong>
        <small>${escapeHtml([item.label, item.filesystem].filter(Boolean).join(" · ") || "volume local")}</small>
      </div>
      <div>
        <span>${formatPercent(item.usedPercent)}</span>
        <small>${formatBytes(item.usedBytes)} / ${formatBytes(item.totalBytes)} · livre ${formatBytes(item.freeBytes)}</small>
      </div>
    </article>
  `);

  const portRows = relevantAddresses.length > 1 ? (metrics.listeningPorts || []).map((item) => `
    <article class="profile-data-row compact-row">
      <div>
        <strong>${escapeHtml(String(item.port || "-"))}</strong>
        <small>${escapeHtml(item.protocol || "tcp")}${item.processId ? ` · PID ${escapeHtml(item.processId)}` : ""}</small>
      </div>
      <div>
        <span>${escapeHtml(item.address || "todas interfaces")}</span>
      </div>
    </article>
  `) : [];

  const serviceRows = (metrics.services || []).map((item) => {
    const status = item.status || item.active || "-";
    return `
      <article class="profile-data-row compact-row">
        <div>
          <strong>${escapeHtml(item.displayName || item.name || "-")}</strong>
          <small>${escapeHtml(item.name || "")}</small>
        </div>
        <div>
          <span>${escapeHtml(status)}</span>
          <small>${escapeHtml(item.startType || item.load || "")}</small>
        </div>
      </article>
    `;
  });

  const processRows = (metrics.topProcesses || []).map((item) => `
    <article class="profile-data-row compact-row">
      <div>
        <strong>${escapeHtml(item.name || "-")}</strong>
        <small>${item.processId ? `PID ${escapeHtml(item.processId)}` : "processo"}</small>
      </div>
      <div>
        <span>${item.cpuPercent !== null && item.cpuPercent !== undefined ? `${escapeHtml(item.cpuPercent)}% CPU` : item.cpuSeconds ? `${escapeHtml(Math.round(item.cpuSeconds))}s CPU` : "CPU -"}</span>
        <small>${formatBytes(item.memoryBytes)}${item.memoryPercent !== null && item.memoryPercent !== undefined ? ` · ${escapeHtml(item.memoryPercent)}% memoria` : ""}</small>
      </div>
    </article>
  `);

  const eventRows = (metrics.criticalEvents || []).map((item) => `
    <article class="profile-data-row event-row">
      <div>
        <strong>${escapeHtml(item.source || item.level || "Evento critico")}</strong>
        <small>${escapeHtml([item.level, item.eventId ? `ID ${item.eventId}` : null, item.createdAt].filter(Boolean).join(" · "))}</small>
      </div>
      <div>
        <span>${escapeHtml(item.message || "-")}</span>
      </div>
    </article>
  `);

  const virtualizationRows = (metrics.virtualization || []).map((item) => `
    <article class="profile-data-row compact-row">
      <div>
        <strong>${escapeHtml(item.name || item.id || "-")}</strong>
        <small>${escapeHtml([item.type, item.id].filter(Boolean).join(" · ") || "virtualizacao")}</small>
      </div>
      <div>
        <span>${escapeHtml(item.state || "-")}</span>
        <small>${item.memoryBytes ? formatBytes(item.memoryBytes) : item.memoryMb ? `${escapeHtml(item.memoryMb)} MB` : ""}${item.cpuCount ? ` · ${escapeHtml(item.cpuCount)} CPU` : ""}</small>
      </div>
    </article>
  `);
  const proxmoxStorageRows = (metrics.proxmoxStorage || []).map((item) => `
    <article class="profile-data-row">
      <div>
        <strong>${escapeHtml(item.name || "-")}</strong>
        <small>${escapeHtml([item.type, item.status].filter(Boolean).join(" · ") || "storage Proxmox")}</small>
      </div>
      <div>
        <span>${formatPercent(item.usedPercent)}</span>
        <small>${formatBytes(item.usedBytes)} / ${formatBytes(item.totalBytes)} · livre ${formatBytes(item.availableBytes)}</small>
      </div>
    </article>
  `);

  return [
    renderMetricRows("Particoes de disco", `${diskRows.length} volumes`, diskRows),
    renderMetricRows("Storage Proxmox", `${proxmoxStorageRows.length} storages`, proxmoxStorageRows),
    renderMetricRows("Portas locais", `${portRows.length} portas em host multi-IP`, portRows),
    renderMetricRows("Servicos criticos", `${serviceRows.length} servicos encontrados`, serviceRows),
    renderMetricRows("Top processos por consumo", `${processRows.length} processos por CPU`, processRows),
    renderMetricRows("Eventos criticos", `${eventRows.length} eventos`, eventRows),
    renderMetricRows("Virtualizacao", `${virtualizationRows.length} convidados`, virtualizationRows)
  ].join("");
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
        <span>Ultima coleta ${formatDate(metrics.collectedAt || probe.hostMetricsUpdatedAt)}</span>
      </div>
      <div class="probe-detail-grid">
        <div class="detail-stat metric-stat"><span>CPU</span><strong>${formatPercent(cpu.usagePercent)}</strong>${metricBar(cpu.usagePercent)}<small>${escapeHtml(cpu.cores || "-")} cores</small></div>
        <div class="detail-stat metric-stat"><span>Memoria</span><strong>${formatPercent(memory.usedPercent)}</strong>${metricBar(memory.usedPercent)}<small>${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}</small></div>
        <div class="detail-stat metric-stat"><span>Disco ${escapeHtml(disk.mount || "")}</span><strong>${formatPercent(disk.usedPercent)}</strong>${metricBar(disk.usedPercent)}<small>${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}</small></div>
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

  const linkedServers = sortedByAlpha(probeLinkedServers(probe.id), serverSortLabel);
  const reinstallCommand = probeInstallCommandFor(probe, { repair: true });
  const mac = primaryMac(probe);
  const address = probe.primaryAddress || probe.addresses?.[0] || probe.lastAddress || "-";
  const canRemove = linkedServers.length === 0;
  const updateRequest = probe.updateRequest;
  const canRemoteUpdate = probe.updateAvailable && probe.updateSupported && !["pending", "running"].includes(updateRequest?.status);
  const updateNotice = updateRequest
    ? `
      <div class="probe-update-notice ${escapeHtml(updateRequest.status)}">
        <strong>${escapeHtml(probeUpdateStatusLabel(updateRequest.status))}</strong>
        <span>${escapeHtml(updateRequest.error || `Alvo ${updateRequest.targetVersion || probe.latestVersion || "-"}. Solicitado em ${formatDate(updateRequest.requestedAt)}.`)}</span>
      </div>
    `
    : probe.updateAvailable
    ? `
      <div class="probe-update-notice">
        <strong>Atualizacao disponivel</strong>
        <span>Este collector esta em ${escapeHtml(probe.version || "-")} e a versao atual e ${escapeHtml(probe.latestVersion || "-")}.${probe.updateSupported ? "" : " Atualizacao automatica disponivel apenas para Linux."}</span>
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
      <button class="primary-button compact" type="button" data-action="update-probe" data-probe-id="${escapeHtml(probe.id)}" ${canRemoteUpdate ? "" : "disabled"}>
        Atualizar probe
      </button>
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
  if (els.guideServerProbeCommand) {
    els.guideServerProbeCommand.textContent = token ? probeInstallCommand() : "Token ainda nao disponivel.";
  }
  if (els.guideLinkProbeCommand) {
    els.guideLinkProbeCommand.textContent = token ? linkProbeInstallCommand() : "Token ainda nao disponivel.";
  }
  if (els.guideMikrotikProbeCommand) {
    els.guideMikrotikProbeCommand.textContent = token ? mikrotikProbeInstallCommand() : "Token ainda nao disponivel.";
  }
  if (els.commandGeneratorDialog?.open) updateGeneratedCommand();
  els.probeCount.textContent = `${state.probes.length} ${state.probes.length === 1 ? "probe conectado" : "probes conectados"}`;
  const updatableCount = state.probes.filter(
    (probe) => probe.updateAvailable && probe.updateSupported && !["pending", "running"].includes(probe.updateRequest?.status)
  ).length;
  if (els.updateOutdatedProbes) {
    els.updateOutdatedProbes.disabled = updatableCount === 0;
    els.updateOutdatedProbes.textContent = updatableCount ? `Atualizar ${updatableCount}` : "Atualizar desatualizados";
  }
  document.querySelectorAll("[data-probe-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.probeFilter === state.probeFilter);
    const total = state.probes.length;
    const stale = state.probes.filter((probe) => probe.status === "stale").length;
    const online = state.probes.filter((probe) => probe.status === "online").length;
    const outdated = state.probes.filter((probe) => probe.updateAvailable).length;
    const counts = { all: total, stale, online, outdated };
    const labels = { all: "Todos", stale: "Sem contato", online: "Online", outdated: "Desatualizados" };
    button.textContent = `${labels[button.dataset.probeFilter] || "Todos"} (${counts[button.dataset.probeFilter] ?? total})`;
  });
  const filteredProbes = state.probes.filter((probe) => {
    if (state.probeFilter === "stale") return probe.status === "stale";
    if (state.probeFilter === "online") return probe.status === "online";
    if (state.probeFilter === "outdated") return probe.updateAvailable;
    return true;
  });
  const probes = sortedByAlpha(filteredProbes, probeSortLabel);
  state.selectedProbeId = null;

  els.probesList.innerHTML = probes.length
    ? probes
        .map(
          (probe) => `
            <article class="probe-card ${probe.updateAvailable ? "outdated" : ""}" ${clickableCardAttrs(`Selecionar probe ${probe.name || probe.id}`)} data-probe-id="${escapeHtml(probe.id)}">
              <div class="probe-card-main">
                <div class="probe-card-title">
                  ${platformIcon(probe.platform)}
                  <strong>${escapeHtml(probe.name || probe.id)}</strong>
                  ${probe.updateAvailable ? '<span class="mini-badge warning">Atualizar</span>' : ""}
                </div>
                <div class="probe-card-tags">
                  <span class="probe-card-tag">${platformLabel(probe.platform)} · v${escapeHtml(probe.version || "-")}</span>
                  <span class="probe-card-tag">${probe.targetCount || 0} ${probe.targetCount === 1 ? "alvo" : "alvos"}</span>
                  <span class="probe-card-tag company">${escapeHtml(probeCompanySummary(probe))}</span>
                </div>
              </div>
              <div class="probe-card-meta">
                <span class="status-badge ${probe.status === "stale" ? "probe_stale" : probe.status || "unknown"}">${probeStatusLabel(probe.status)}</span>
                ${probeUpdateStatusBadge(probe)}
                <span class="probe-card-seen">${formatDate(probe.lastSeenAt)}</span>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-list">${state.probeFilter === "stale" ? "Nenhum probe sem contato." : state.probeFilter === "online" ? "Nenhum probe online." : state.probeFilter === "outdated" ? "Nenhum probe desatualizado." : "Nenhum probe se conectou ainda."}</div>`;
  if (els.probeDetailPanel) {
    els.probeDetailPanel.hidden = true;
    els.probeDetailPanel.innerHTML = "";
  }
}

function networkStatusLabel(status) {
  return {
    online: "Online",
    degraded: "Degradado",
    offline: "Offline",
    probe_unreachable: "Agente sem contato",
    paused: "Pausado",
    unknown: "Sem status"
  }[status] || "Sem status";
}

function networkStatusClass(status) {
  return {
    online: "online",
    degraded: "warning",
    offline: "offline",
    probe_unreachable: "probe_stale",
    paused: "unknown",
    unknown: "unknown"
  }[status] || "unknown";
}

function networkVendorLabel(vendor) {
  return {
    mikrotik: "MikroTik",
    pfsense: "pfSense",
    fortigate: "Fortigate",
    generic: "Generico",
    other: "Outro"
  }[vendor] || "Generico";
}

function networkLinkTypeLabel(type) {
  return {
    internet: "Internet",
    mpls: "MPLS",
    vpn: "VPN",
    radio: "Radio",
    fiber: "Fibra",
    cellular: "Celular",
    other: "Outro"
  }[type] || "Internet";
}

function networkTargetLabel(target) {
  if (!target) return "-";
  const name = target.targetName || target.name || target.label || "";
  const host = target.targetHost || target.host || "";
  const prefixLength = target.prefixLength || target.prefix_length || "";
  const hostLabel = `${host}${prefixLength ? `/${String(prefixLength).replace(/^\//, "")}` : ""}`;
  return name ? `${name} (${hostLabel})` : hostLabel || "-";
}

function networkTargetsForLink(link) {
  if (Array.isArray(link?.targets) && link.targets.length) return link.targets;
  return (link?.targetHosts || [link?.targetHost]).filter(Boolean).map((host) => ({ name: "", host }));
}

function normalizeNetworkTargetInput(target) {
  return {
    name: String(target?.name || target?.targetName || "").trim(),
    host: String(target?.host || target?.targetHost || "").trim(),
    prefixLength: String(target?.prefixLength || target?.prefix_length || "").replace(/^\//, "").trim()
  };
}

function renderNetworkTargetInputs(targets = [{ name: "", host: "" }]) {
  if (!els.networkLinkTarget) return;
  const normalized = (targets.length ? targets : [{ name: "", host: "" }]).map(normalizeNetworkTargetInput).slice(0, 10);
  els.networkLinkTarget.innerHTML = normalized
    .map((target, index) => `
      <div class="network-target-input-row" data-network-target-row>
        <label>
          Nome do link
          <input data-network-target-name value="${escapeHtml(target.name)}" placeholder="Vivo, BR Digital" />
        </label>
        <label>
          IP monitorado
          <input data-network-target-host value="${escapeHtml(target.host)}" required placeholder="187.91.174.154" />
        </label>
        <label>
          Mascara
          <input data-network-target-prefix value="${escapeHtml(target.prefixLength)}" inputmode="numeric" placeholder="/30" />
        </label>
        <button class="icon-button network-target-remove" type="button" data-remove-network-target title="Remover link" ${index === 0 ? "disabled" : ""}>-</button>
      </div>
    `)
    .join("");
  if (els.addNetworkTarget) {
    els.addNetworkTarget.disabled = normalized.length >= 10;
    els.addNetworkTarget.title = normalized.length >= 10 ? "Limite de 10 links atingido" : "Adicionar link";
  }
}

function readNetworkTargetInputs() {
  if (!els.networkLinkTarget) return [];
  return [...els.networkLinkTarget.querySelectorAll("[data-network-target-row]")]
    .map((row) => ({
      name: row.querySelector("[data-network-target-name]")?.value.trim() || "",
      host: row.querySelector("[data-network-target-host]")?.value.trim() || "",
      prefixLength: row.querySelector("[data-network-target-prefix]")?.value.trim().replace(/^\//, "") || null
    }))
    .filter((target) => target.name || target.host);
}

function addNetworkTargetInput() {
  const targets = readNetworkTargetInputs();
  if (targets.length >= 10) return;
  renderNetworkTargetInputs([...targets, { name: "", host: "" }]);
}

function removeNetworkTargetInput(button) {
  const targets = readNetworkTargetInputs();
  const rows = [...els.networkLinkTarget.querySelectorAll("[data-network-target-row]")];
  const index = rows.findIndex((row) => row.contains(button));
  if (index <= 0 || targets.length <= 1) return;
  targets.splice(index, 1);
  renderNetworkTargetInputs(targets);
}

function activeNetworkTargetLabel(link) {
  if (!link?.activeTargetHost) return "-";
  if (["expected_public_ip", "expected_public_subnet"].includes(link.activeDetection)) {
    const prefix = link.expectedPublicPrefixLength ? `/${link.expectedPublicPrefixLength}` : "";
    return `${link.activeTargetName || "Rede WAN"} (${link.activeTargetHost}${prefix})`;
  }
  const target = networkTargetsForLink(link).find((item) => item.host === link.activeTargetHost || item.targetHost === link.activeTargetHost);
  return networkTargetLabel(target || { host: link.activeTargetHost, name: link.activeTargetName || "" });
}

function hasConfirmedActiveNetworkTarget(link) {
  return ["egress_ip", "egress_subnet", "expected_public_ip", "expected_public_subnet", "mikrotik_default_route"].includes(link?.activeDetection);
}

function networkTargetSummary(link) {
  if (hasConfirmedActiveNetworkTarget(link)) return `ativo ${activeNetworkTargetLabel(link)}`;
  return networkTargetsForLink(link).map(networkTargetLabel).join(", ");
}

function activeDetectionLabel(value) {
  return {
    mikrotik_default_route: "Rota padrao MikroTik",
    linkprobe_source_ip: "LinkProbe source IP",
    expected_public_ip: "IP WAN esperado",
    expected_public_subnet: "sub-rede WAN esperada",
    egress_ip: "IP publico de saida",
    egress_subnet: "mesma sub-rede WAN",
    single_reachable: "unico gateway respondendo",
    ping_best: "melhor resposta ao ping",
    ping: "melhor resposta ao ping"
  }[value] || "-";
}

function activeTargetTitle(link) {
  if (hasConfirmedActiveNetworkTarget(link)) return "Link ativo";
  if (link?.monitorSource === "mikrotik" || link?.mikrotikAgentId) return "Rota MikroTik";
  if (link?.monitorSource === "linkprobe" || link?.linkProbeAgentId) return "Alvo monitorado";
  return "Melhor resposta";
}

function networkStatusReasons(link) {
  const status = link?.displayStatus || link?.currentStatus || "unknown";
  const reasons = [];
  const latency = Number(link?.lastLatencyMs);
  const latencyLimit = Number(link?.degradedLatencyMs || 120);
  const loss = Number(link?.lastPacketLossPercent);
  const lossLimit = Number(link?.degradedPacketLossPercent ?? 10);
  const jitter = Number(link?.lastJitterMs);
  const jitterLimit = Number(link?.degradedJitterMs || 40);
  if (status === "degraded") {
    if (Number.isFinite(latency) && latency > latencyLimit) reasons.push(`latencia ${latency} ms acima do limite ${latencyLimit} ms`);
    if (Number.isFinite(loss) && loss > lossLimit) reasons.push(`perda ${loss}% acima do limite ${lossLimit}%`);
    if (Number.isFinite(jitter) && jitter > jitterLimit) reasons.push(`jitter ${jitter} ms acima do limite ${jitterLimit} ms`);
    if (!reasons.length) reasons.push("resultado dentro da faixa de atencao configurada");
  }
  if (status === "offline") reasons.push(link?.lastError || "sem resposta dos alvos monitorados");
  if (status === "probe_unreachable") reasons.push("agente sem contato recente");
  if (status === "paused") reasons.push("monitoramento desativado manualmente");
  return reasons;
}

function networkStatusReasonLabel(link) {
  return networkStatusReasons(link).join("; ") || "sem anomalia pelos limites atuais";
}

function networkTargetReason(target) {
  if (target.egressActive) return "IP de saida";
  if (target.egressSubnetActive) return `mesma /${target.egressSubnetPrefix || target.prefixLength || "?"}`;
  if (target.detail) return target.detail;
  return "";
}

function networkTargetLatencyLabel(target) {
  return `${target.latencyMs ?? "-"} ms`;
}

function networkEventsForLink(linkId) {
  return state.networkEvents.filter((event) => event.linkId === linkId).slice(0, 8);
}

function renderNetworkDetail(link) {
  if (!els.networkDetailPanel) return;
  if (!link) {
    els.networkDetailPanel.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>Nenhum link selecionado</strong>
        <span>Selecione um link para ver alvo, probe, latencia, perda e ultimos eventos.</span>
      </div>
    `;
    return;
  }
  const events = networkEventsForLink(link.id);
  const status = link.displayStatus || link.currentStatus || "unknown";
  const targetLabels = networkTargetsForLink(link).map(networkTargetLabel);
  const isLinkProbe = link.monitorSource === "linkprobe" || Boolean(link.linkProbeAgentId);
  const isMikrotikProbe = link.monitorSource === "mikrotik" || Boolean(link.mikrotikAgentId);
  const collectorLabel = isMikrotikProbe ? "MikroTik RouterOS" : isLinkProbe ? "LinkProbe" : "Probe Collector";
  const collectorId = isMikrotikProbe ? link.mikrotikAgentId : isLinkProbe ? link.linkProbeAgentId : link.probeName || link.probeId;
  const activeLabel = hasConfirmedActiveNetworkTarget(link) ? activeNetworkTargetLabel(link) : targetLabels.join(", ") || "-";
  const activeMethod = hasConfirmedActiveNetworkTarget(link)
    ? activeDetectionLabel(link.activeDetection)
    : isLinkProbe
    ? "Policy route por alvos"
    : isMikrotikProbe
    ? "Tabela de rotas da RB"
    : link.activeTargetHost
    ? activeDetectionLabel(link.activeDetection)
    : "-";
  els.networkDetailPanel.innerHTML = `
    <div class="network-detail-header">
      <div>
        <h3>${escapeHtml(link.name)}</h3>
        <span>${escapeHtml([link.groupName, link.provider, link.networkDeviceName].filter(Boolean).join(" · ") || "Sem contexto adicional")}</span>
      </div>
      <span class="status-badge ${networkStatusClass(status)}">${networkStatusLabel(status)}</span>
    </div>
    <article class="profile-section">
      <div class="panel-title compact-title">
        <h3>Conectividade</h3>
        <span>${networkStatusLabel(status)}</span>
      </div>
      <div class="profile-stat-grid">
        <div class="detail-stat"><span>${escapeHtml(activeTargetTitle(link))}</span><strong>${escapeHtml(activeLabel)}</strong></div>
        <div class="detail-stat"><span>Metodo do ativo</span><strong>${escapeHtml(activeMethod)}</strong></div>
        <div class="detail-stat"><span>Motivo do status</span><strong>${escapeHtml(networkStatusReasonLabel(link))}</strong></div>
        <div class="detail-stat"><span>Alvos externos</span><strong>${escapeHtml(targetLabels.join(", ") || "-")}</strong></div>
      </div>
    </article>

    <article class="profile-section">
      <div class="panel-title compact-title">
        <h3>Identificacao</h3>
        <span>${escapeHtml(collectorLabel)}</span>
      </div>
      <div class="profile-stat-grid">
        <div class="detail-stat"><span>IP publico observado</span><strong>${escapeHtml(link.observedPublicIp || "-")}</strong></div>
        <div class="detail-stat"><span>Rede WAN esperada</span><strong>${escapeHtml(link.expectedPublicIp ? `${link.expectedPublicIp}${link.expectedPublicPrefixLength ? `/${link.expectedPublicPrefixLength}` : ""}` : "-")}</strong></div>
        <div class="detail-stat"><span>Coletor</span><strong>${escapeHtml(collectorLabel)}</strong></div>
        <div class="detail-stat"><span>ID do agente</span><strong>${escapeHtml(collectorId || "-")}</strong></div>
        <div class="detail-stat"><span>Source IP</span><strong>${escapeHtml(link.linkProbeSourceIp || "-")}</strong></div>
        <div class="detail-stat"><span>Versao do agente</span><strong>${escapeHtml(link.mikrotikVersion || link.linkProbeVersion || "-")}</strong></div>
      </div>
    </article>

    <article class="profile-section">
      <div class="panel-title compact-title">
        <h3>Desempenho</h3>
        <span>${link.lastLatencyMs ?? "-"} ms</span>
      </div>
      <div class="profile-stat-grid">
        <div class="detail-stat"><span>Latencia</span><strong>${link.lastLatencyMs ?? "-"} ms</strong></div>
        <div class="detail-stat"><span>Perda</span><strong>${link.lastPacketLossPercent ?? "-"}%</strong></div>
        <div class="detail-stat"><span>Jitter</span><strong>${link.lastJitterMs ?? "-"} ms</strong></div>
        <div class="detail-stat"><span>Sucesso</span><strong>${link.linkProbeSuccessRate === null || link.linkProbeSuccessRate === undefined ? "-" : `${Math.round(Number(link.linkProbeSuccessRate) * 100)}%`}</strong></div>
        ${isMikrotikProbe ? `<div class="detail-stat"><span>Health-check</span><strong>${escapeHtml(link.mikrotikHealthTarget || "-")}</strong><small>${link.mikrotikHealthReceived ?? 0}/${link.mikrotikHealthSent ?? 0} respostas</small></div>` : ""}
      </div>
    </article>

    <article class="profile-section">
      <div class="panel-title compact-title">
        <h3>Configuracao</h3>
        <span>${networkLinkTypeLabel(link.linkType)}</span>
      </div>
      <div class="profile-stat-grid">
        <div class="detail-stat"><span>Ultima checagem</span><strong>${formatDate(link.lastCheckedAt)}</strong></div>
        <div class="detail-stat"><span>Intervalo</span><strong>${link.checkInterval || 10}s</strong></div>
        <div class="detail-stat"><span>Falhas para offline</span><strong>${link.failureThreshold || 3}</strong></div>
        <div class="detail-stat"><span>Tipo</span><strong>${networkLinkTypeLabel(link.linkType)}</strong></div>
        <div class="detail-stat"><span>Interface</span><strong>${escapeHtml(link.interfaceName || "-")}</strong></div>
        <div class="detail-stat"><span>Limite latencia</span><strong>${link.degradedLatencyMs || 120} ms</strong></div>
        <div class="detail-stat"><span>Limite perda</span><strong>${link.degradedPacketLossPercent ?? 10}%</strong></div>
      </div>
    </article>
    ${
      Array.isArray(link.targetResults) && link.targetResults.length
        ? `<section class="profile-section">
            <div class="panel-title compact-title">
              <h3>IPs testados</h3>
              <span>${link.targetResults.length} alvos</span>
            </div>
            <div class="network-target-list">
              ${link.targetResults
                .map((target) => {
                  const active = target.targetHost === link.activeTargetHost;
                  const reason = networkTargetReason(target);
                  const targetState = target.online ? "Respondendo" : "Sem resposta";
                  const targetDetail = target.online ? reason || "Monitorado por ping" : "Monitorado por ping";
                  const targetTitle = target.online ? targetDetail : target.error || targetDetail;
                  return `
                    <div class="profile-data-row network-target-card ${target.online ? "online" : "offline"} ${active ? "active" : ""}">
                      <div>
                        <strong>${escapeHtml(networkTargetLabel(target))}${active ? `<em>ATIVO</em>` : ""}</strong>
                        <small title="${escapeHtml(targetTitle)}">${escapeHtml(targetDetail)}</small>
                      </div>
                      <span class="network-target-state">${escapeHtml(targetState)}</span>
                      <small class="network-target-latency">${escapeHtml(networkTargetLatencyLabel(target))}</small>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </section>`
        : ""
    }
    ${
      isAdmin()
        ? `<div class="network-actions">
            <button class="ghost-button compact" type="button" data-network-action="check" data-link-id="${escapeHtml(link.id)}" ${link.isActive === false ? "disabled" : ""}>Checar agora</button>
            <button class="ghost-button compact" type="button" data-network-action="edit" data-link-id="${escapeHtml(link.id)}">Editar</button>
            <button class="ghost-button compact" type="button" data-network-action="toggle" data-link-id="${escapeHtml(link.id)}">${link.isActive === false ? "Reativar monitoramento" : "Desativar monitoramento"}</button>
            <button class="danger-button compact" type="button" data-network-action="delete" data-link-id="${escapeHtml(link.id)}">Excluir</button>
          </div>`
        : ""
    }
    <section class="profile-section">
      <div class="panel-title compact-title">
        <h3>Historico recente</h3>
        <span>${events.length} eventos</span>
      </div>
      <div class="network-event-list">
        ${
          events.length
            ? events.map((event) => `
                <div class="profile-data-row">
                  <strong>${escapeHtml(networkStatusLabel(event.currentStatus))}</strong>
                  <span>${escapeHtml(event.message || "")}</span>
                  <small>${formatDate(event.createdAt)}</small>
                </div>
              `).join("")
            : `<div class="empty-list compact">Nenhum evento deste link ainda.</div>`
        }
      </div>
    </section>
  `;
}

function renderNetworkCompanyDetail(group) {
  if (!els.networkDetailPanel) return;
  if (!group) {
    renderNetworkDetail(null);
    return;
  }
  const links = sortedByAlpha(group.links, networkLinkSortLabel);
  const counts = links.reduce((acc, link) => {
    const status = link.displayStatus || link.currentStatus || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const confirmedActive = links.filter(hasConfirmedActiveNetworkTarget);
  const onlineLinks = links.filter((link) => (link.displayStatus || link.currentStatus) === "online");
  const activeSummary = confirmedActive.length
    ? confirmedActive.map((link) => `${link.name}: ${activeNetworkTargetLabel(link)}`).join(", ")
    : onlineLinks.length > 1
    ? "Mais de um link respondendo"
    : onlineLinks[0]?.name || "-";
  const companyTone = counts.offline ? "offline" : counts.degraded || counts.probe_unreachable ? "warning" : "online";
  const statusTotal = Math.max(1, links.length);
  const onlineDegrees = ((counts.online || 0) / statusTotal) * 360;
  const offlineDegrees = ((counts.offline || 0) / statusTotal) * 360;
  const attentionDegrees = (((counts.degraded || 0) + (counts.probe_unreachable || 0)) / statusTotal) * 360;
  const statusChartStyle = `--online-deg:${onlineDegrees}deg; --offline-deg:${offlineDegrees}deg; --attention-deg:${attentionDegrees}deg;`;
  const linkIds = new Set(links.map((link) => link.id));
  const now = Date.now();
  const recentWindowStart = now - 24 * 60 * 60 * 1000;
  const recentNetworkEvents = state.networkEvents.filter((event) => linkIds.has(event.linkId) && eventTimestamp(event) >= recentWindowStart);
  const recentNetworkProblems = recentNetworkEvents.filter((event) =>
    ["offline", "degraded", "probe_unreachable"].includes(event.currentStatus || event.status || "")
  );
  const networkBuckets = Array.from({ length: 8 }, (_, index) => {
    const start = now - (8 - index) * 3 * 60 * 60 * 1000;
    const end = start + 3 * 60 * 60 * 1000;
    return recentNetworkProblems.filter((event) => {
      const timestamp = eventTimestamp(event);
      return timestamp >= start && timestamp < end;
    }).length;
  });
  const maxNetworkEvents = Math.max(1, ...networkBuckets);
  const networkBars = networkBuckets
    .map((count, index) => {
      const startHour = new Date(now - (8 - index) * 3 * 60 * 60 * 1000).getHours().toString().padStart(2, "0");
      const height = Math.max(count ? 12 : 3, Math.round((count / maxNetworkEvents) * 100));
      return `<span class="${count ? "active" : ""}" style="--bar-height:${height}%" title="${count} evento${count === 1 ? "" : "s"} desde ${startHour}h"><i></i></span>`;
    })
    .join("");
  const latencyValues = links.map((link) => Number(link.lastLatencyMs)).filter(Number.isFinite);
  const avgLatency = latencyValues.length ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length) : null;
  const lossValues = links.map((link) => Number(link.lastPacketLossPercent)).filter(Number.isFinite);
  const avgLoss = lossValues.length ? Math.round((lossValues.reduce((sum, value) => sum + value, 0) / lossValues.length) * 10) / 10 : null;
  const jitterValues = links.map((link) => Number(link.lastJitterMs)).filter(Number.isFinite);
  const avgJitter = jitterValues.length ? Math.round(jitterValues.reduce((sum, value) => sum + value, 0) / jitterValues.length) : null;
  const activeLinks = confirmedActive.length ? confirmedActive : onlineLinks.slice(0, 3);
  const linkQualityRows = links.slice(0, 4).map((link) => {
    const status = link.displayStatus || link.currentStatus || "unknown";
    const latency = Number(link.lastLatencyMs);
    const limit = Number(link.degradedLatencyMs || 120);
    const latencyPct = Number.isFinite(latency) ? Math.max(4, Math.min(100, Math.round((latency / Math.max(limit, 1)) * 100))) : 0;
    return `
      <button type="button" data-network-link-id="${escapeHtml(link.id)}">
        <span>${escapeHtml(link.name)}</span>
        <i aria-hidden="true"><b class="${networkStatusClass(status)}" style="width:${latencyPct}%"></b></i>
        <strong>${Number.isFinite(latency) ? `${latency} ms` : "-"}</strong>
      </button>
    `;
  }).join("");
  els.networkDetailPanel.innerHTML = `
    <div class="network-detail-header">
      <div class="company-profile-title">
        ${brandMarkHtml(group.label, group.logoDataUrl, "company-logo-mark")}
        <div>
          <h3>${escapeHtml(group.label)}</h3>
          <span>${links.length} ${links.length === 1 ? "link monitorado" : "links monitorados"}</span>
        </div>
      </div>
      <span class="status-badge ${counts.offline ? "danger" : counts.degraded || counts.probe_unreachable ? "warning" : "success"}">
        ${counts.offline ? "ATENCAO" : counts.degraded || counts.probe_unreachable ? "DEGRADADO" : "ONLINE"}
      </span>
    </div>

    <section class="network-insight-grid" aria-label="Visao visual dos links da empresa">
      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Estado dos links</h3>
          <span>${links.length} monitorados</span>
        </div>
        <div class="simple-status-chart company-status-chart">
          <div class="simple-status-donut" style="${statusChartStyle}" aria-hidden="true">
            <strong>${Math.round(((counts.online || 0) / statusTotal) * 100)}%</strong>
          </div>
          <div class="simple-status-legend">
            <span><i class="success"></i>${counts.online || 0} online</span>
            <span><i class="danger"></i>${counts.offline || 0} offline</span>
            <span><i class="warning"></i>${(counts.degraded || 0) + (counts.probe_unreachable || 0)} atencao</span>
            <span><i class="neutral"></i>${(counts.unknown || 0) + (counts.paused || 0)} sem status/pausado</span>
          </div>
        </div>
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Eventos 24h</h3>
          <span>${recentNetworkProblems.length} ocorrencias</span>
        </div>
        <div class="simple-failure-chart company-failure-chart">
          ${networkBars}
        </div>
        <div class="simple-chart-foot">
          <span>24h atras</span>
          <strong>${recentNetworkProblems.length ? `${recentNetworkProblems.length} evento${recentNetworkProblems.length === 1 ? "" : "s"}` : "Sem falhas"}</strong>
          <span>agora</span>
        </div>
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Qualidade media</h3>
          <span>ultimos resultados</span>
        </div>
        <div class="network-quality-grid">
          <article><strong>${avgLatency === null ? "-" : avgLatency}</strong><span>ms latencia</span></article>
          <article class="${avgLoss && avgLoss > 0 ? "warning" : ""}"><strong>${avgLoss === null ? "-" : avgLoss}</strong><span>% perda</span></article>
          <article><strong>${avgJitter === null ? "-" : avgJitter}</strong><span>ms jitter</span></article>
        </div>
        <div class="network-quality-list">
          ${linkQualityRows || `<div class="empty-list compact">Sem dados de qualidade ainda.</div>`}
        </div>
      </article>

      <article class="company-insight-card">
        <div class="panel-title compact-title">
          <h3>Saida ativa</h3>
          <span>${confirmedActive.length ? "confirmada" : "estimada"}</span>
        </div>
        <div class="network-active-route-card ${companyTone}">
          <strong>${escapeHtml(activeSummary)}</strong>
          <span>${confirmedActive.length ? "confirmada por IP/sub-rede WAN" : "sem confirmacao unica de saida"}</span>
        </div>
        <div class="company-mini-list">
          ${
            activeLinks.length
              ? activeLinks.map((link) => {
                  const status = link.displayStatus || link.currentStatus || "unknown";
                  return `
                    <button type="button" data-network-link-id="${escapeHtml(link.id)}">
                      <span>${escapeHtml(link.name)}</span>
                      <strong class="status-badge ${networkStatusClass(status)}">${networkStatusLabel(status)}</strong>
                    </button>
                  `;
                }).join("")
              : `<div class="empty-list compact">Nenhum link ativo detectado.</div>`
          }
        </div>
      </article>
    </section>

    <section class="profile-section">
      <div class="panel-title compact-title">
        <h3>Links da empresa</h3>
        <span>${links.length} itens</span>
      </div>
      <div class="network-company-detail-list">
        ${links
          .map((link) => {
            const status = link.displayStatus || link.currentStatus || "unknown";
            return `
              <button class="network-company-detail-row" type="button" data-network-link-id="${escapeHtml(link.id)}">
                <div>
                  <strong>${escapeHtml(link.name)}</strong>
                  <small>${escapeHtml([networkTargetSummary(link), networkStatusReasonLabel(link)].filter(Boolean).join(" · "))}</small>
                </div>
                <span class="status-badge ${networkStatusClass(status)}">${networkStatusLabel(status)}</span>
                <small>${link.lastLatencyMs ?? "-"} ms</small>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderNetworkLinkRow(link) {
  const status = link.displayStatus || link.currentStatus || "unknown";
  const selected = state.selectedNetworkLinkId === link.id ? "selected" : "";
  const statusTone = status === "offline" ? "is-offline" : "";
  const subtitle = [
    link.provider || "Sem operadora",
    link.networkDeviceName || "Sem dispositivo",
    networkTargetSummary(link)
  ].filter(Boolean).join(" · ");
  return `
    <button class="network-link-row ${selected} ${statusTone}" type="button" data-network-link-id="${escapeHtml(link.id)}">
      <span class="status-dot ${networkStatusClass(status)}"></span>
      <div>
        <strong>${escapeHtml(link.name)}</strong>
        <small>${escapeHtml(subtitle)}</small>
      </div>
      <span class="status-badge ${networkStatusClass(status)}">${networkStatusLabel(status)}</span>
      <small>${link.lastLatencyMs ?? "-"} ms</small>
    </button>
  `;
}

function renderNetworkCompanySection(group) {
  const links = sortedByAlpha(group.links, networkLinkSortLabel);
  const counts = links.reduce((acc, link) => {
    const status = link.displayStatus || link.currentStatus || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const online = counts.online || 0;
  const offline = counts.offline || 0;
  const degraded = counts.degraded || 0;
  const stale = counts.probe_unreachable || 0;
  const attention = offline + degraded + stale;
  const selected = state.selectedNetworkGroupId === group.id ? "selected" : "";
  return `
    <section class="network-company-section ${selected}">
      <button class="network-company-header" type="button" data-network-group-id="${escapeHtml(group.id)}">
        <div>
          <strong>${escapeHtml(group.label)}</strong>
          <span>${links.length} ${links.length === 1 ? "link" : "links"} monitorados</span>
        </div>
        <div class="server-group-badges">
          <span class="mini-badge online">${online} online</span>
          ${attention ? `<span class="mini-badge offline">${attention} atencao</span>` : ""}
        </div>
      </button>
      <div class="network-company-items">
        ${links.map(renderNetworkLinkRow).join("")}
      </div>
    </section>
  `;
}

function renderNetworks() {
  if (!els.networkLinksList) return;
  const links = sortedByAlpha(state.networkLinks || [], networkLinkSortLabel);
  const counts = links.reduce((acc, link) => {
    const status = link.displayStatus || link.currentStatus || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  if (els.networkLinkCount) els.networkLinkCount.textContent = `${links.length} ${links.length === 1 ? "link monitorado" : "links monitorados"}`;
  if (els.networkDeviceCount) els.networkDeviceCount.textContent = `${state.networkDevices.length} ${state.networkDevices.length === 1 ? "dispositivo" : "dispositivos"}`;
  if (els.networkOnlineCount) els.networkOnlineCount.textContent = counts.online || 0;
  if (els.networkDegradedCount) els.networkDegradedCount.textContent = counts.degraded || 0;
  if (els.networkOfflineCount) els.networkOfflineCount.textContent = counts.offline || 0;
  if (els.networkProbeStaleCount) els.networkProbeStaleCount.textContent = counts.probe_unreachable || 0;
  if (els.linkProbeInstallCommand) {
    els.linkProbeInstallCommand.textContent = probeToken() ? linkProbeInstallCommand() : "Token ainda nao disponivel.";
  }
  if (els.mikrotikProbeInstallCommand) {
    els.mikrotikProbeInstallCommand.textContent = probeToken() ? mikrotikProbeInstallCommand() : "Token ainda nao disponivel.";
  }

  const groups = new Map();
  links.forEach((link) => {
    const key = link.groupId || "none";
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: key === "none" ? "Sem empresa" : groupLabel(key),
        logoDataUrl: key === "none" ? "" : groupLogo(key),
        links: []
      });
    }
    groups.get(key).links.push(link);
  });
  const groupedLinks = Array.from(groups.values()).sort((left, right) => {
    if (left.id === "none") return 1;
    if (right.id === "none") return -1;
    return compareAlpha(left.label, right.label);
  });
  els.networkLinksList.innerHTML = links.length
    ? groupedLinks.map(renderNetworkCompanySection).join("")
    : `<div class="empty-list">Nenhum link cadastrado ainda.</div>`;
  const selectedGroup = state.selectedNetworkGroupId ? groupedLinks.find((group) => group.id === state.selectedNetworkGroupId) : null;
  if (selectedGroup) renderNetworkCompanyDetail(selectedGroup);
  else renderNetworkDetail(links.find((link) => link.id === state.selectedNetworkLinkId) || null);
}

function render() {
  updateTopbarContext();
  updateMetricsVisibility();
  updateActiveFilterCount();
  renderMetrics();
  renderSimpleDashboard();
  renderCompanyNav();
  renderServerDirectory();
  renderServerProfile();
  renderNetworks();
  renderTimeline();
  renderAlerts();
  renderGroups();
  renderProbes();
  renderUsers();
  renderBackups();
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
  forceCloseDialog(els.serverDialog);
}

function openGroupDialog(group = null) {
  els.groupForm.reset();
  state.groupLogoDraft = group?.logoDataUrl || "";
  els.groupId.value = group?.id || "";
  els.groupDialogTitle.textContent = group ? "Editar empresa" : "Adicionar empresa";
  els.groupName.value = group?.name || "";
  els.groupDescription.value = group?.description || "";
  if (els.groupLogoInput) els.groupLogoInput.value = "";
  if (els.groupLogoPreviewName) els.groupLogoPreviewName.textContent = group?.name || "Logo da empresa";
  paintBrandLogo(els.groupLogoPreview, state.groupLogoDraft, group?.name || els.groupName.value || "SW");
  els.groupDialog.showModal();
}

function closeGroupDialog() {
  els.groupDialog.close();
}

function renderUserSectionsPicker(selectedSections = SECTION_KEYS) {
  if (!els.userSectionsFieldset || !els.userRole) return;
  const isRestrictedUser = els.userRole.value !== "admin";
  els.userSectionsFieldset.hidden = !isRestrictedUser;
  const selected = new Set(selectedSections);
  els.userSectionsFieldset.querySelectorAll('input[name="userSection"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function renderUserCompanyPicker(selectedIds = []) {
  if (!els.userCompanyFieldset || !els.userCompanyList || !els.userRole) return;
  const isRestrictedUser = els.userRole.value !== "admin";
  els.userCompanyFieldset.hidden = !isRestrictedUser;
  const selected = new Set(selectedIds.map(String));
  const groups = sortedByAlpha(state.groups, groupSortLabel);
  els.userCompanyList.innerHTML = groups.length
    ? groups
        .map(
          (group) => `
            <label class="user-company-option">
              <input type="checkbox" value="${escapeHtml(group.id)}" ${selected.has(group.id) ? "checked" : ""} />
              <span>${escapeHtml(group.name)}</span>
            </label>
          `
        )
        .join("")
    : `<div class="empty-list compact">Cadastre uma empresa antes de vincular usuarios comuns.</div>`;
}

function openUserDialog(user = null) {
  els.userForm.reset();
  if (els.userFormError) els.userFormError.textContent = "";
  els.userId.value = user?.id || "";
  els.userDialogTitle.textContent = user ? "Editar usuario" : "Adicionar usuario";
  els.userName.value = user?.name || "";
  els.userEmail.value = user?.email || "";
  els.userRole.value = user?.role || "user";
  els.userActive.value = String(user?.isActive ?? true);
  els.userPassword.placeholder = user ? "Deixe em branco para manter a senha" : "Minimo 6 caracteres";
  els.userPassword.required = !user;
  renderUserCompanyPicker(user?.groupIds || []);
  renderUserSectionsPicker(user?.allowedSections || SECTION_KEYS);
  els.userDialog.showModal();
}

function closeUserDialog() {
  els.userDialog.close();
}

function openNetworkDeviceDialog(device = null) {
  if (!els.networkDeviceDialog || !isAdmin()) return;
  els.networkDeviceForm.reset();
  renderGroupOptions();
  renderProbeOptions();
  els.networkDeviceId.value = device?.id || "";
  els.networkDeviceDialogTitle.textContent = device ? "Editar dispositivo" : "Adicionar dispositivo";
  els.networkDeviceName.value = device?.name || "";
  els.networkDeviceVendor.value = device?.vendor || "mikrotik";
  els.networkDeviceModel.value = device?.model || "";
  els.networkDeviceManagementIp.value = device?.managementIp || "";
  els.networkDeviceGroup.value = device?.groupId || "";
  if (device?.probeId && state.probes.some((probe) => probe.id === device.probeId)) {
    els.networkDeviceProbe.value = device.probeId;
  }
  els.networkDeviceNotes.value = device?.notes || "";
  els.networkDeviceDialog.showModal();
}

function closeNetworkDeviceDialog() {
  els.networkDeviceDialog?.close();
}

function applyNetworkDeviceDefaults() {
  const device = state.networkDevices.find((item) => item.id === els.networkLinkDevice?.value);
  if (!device) return;
  if (device.groupId && els.networkLinkGroup) els.networkLinkGroup.value = device.groupId;
  if (device.probeId && els.networkLinkProbe && state.probes.some((probe) => probe.id === device.probeId)) {
    els.networkLinkProbe.value = device.probeId;
  }
}

function openNetworkLinkDialog(link = null) {
  if (!els.networkLinkDialog || !isAdmin()) return;
  els.networkLinkForm.reset();
  renderGroupOptions();
  renderProbeOptions();
  els.networkLinkId.value = link?.id || "";
  els.networkLinkDialogTitle.textContent = link ? "Editar link" : "Adicionar link";
  els.networkLinkName.value = link?.name || "";
  els.networkLinkProvider.value = link?.provider || "";
  els.networkLinkDevice.value = link?.networkDeviceId || "";
  els.networkLinkType.value = link?.linkType || "internet";
  renderNetworkTargetInputs(link ? networkTargetsForLink(link) : [{ name: "", host: "" }]);
  els.networkLinkInterface.value = link?.interfaceName || "";
  if (els.networkLinkExpectedPublicIp) els.networkLinkExpectedPublicIp.value = link?.expectedPublicIp || "";
  if (els.networkLinkExpectedPrefix) els.networkLinkExpectedPrefix.value = link?.expectedPublicPrefixLength ? `/${link.expectedPublicPrefixLength}` : "";
  els.networkLinkGroup.value = link?.groupId || "";
  if (link?.probeId && state.probes.some((probe) => probe.id === link.probeId)) {
    els.networkLinkProbe.value = link.probeId;
  }
  els.networkLinkInterval.value = link?.checkInterval || 10;
  els.networkLinkThreshold.value = link?.failureThreshold || 3;
  els.networkLinkLatencyLimit.value = link?.degradedLatencyMs || 120;
  els.networkLinkLossLimit.value = link?.degradedPacketLossPercent ?? 10;
  els.networkLinkNotes.value = link?.notes || "";
  if (!link) applyNetworkDeviceDefaults();
  els.networkLinkDialog.showModal();
}

function closeNetworkLinkDialog() {
  forceCloseDialog(els.networkLinkDialog);
}

function forceCloseDialog(dialog) {
  if (!dialog) return;
  if (document.activeElement && dialog.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  if (dialog.open) {
    dialog.close();
  }
}

function closeDialogFromBackdrop(event, closeFn) {
  const dialog = event.currentTarget;
  if (event.target !== dialog) {
    const rect = dialog.getBoundingClientRect();
    const clickedInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (clickedInside) return;
  }
  closeFn();
}

function setInstallGuideTab(tab) {
  const activeTab = ["link", "mikrotik"].includes(tab) ? tab : "server";
  document.querySelectorAll("[data-install-guide-tab]").forEach((button) => {
    const selected = button.dataset.installGuideTab === activeTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
  document.querySelectorAll("[data-install-guide-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.installGuidePanel === activeTab);
  });
}

function openInstallGuideDialog(tab = "server") {
  setInstallGuideTab(tab);
  renderProbes();
  els.installGuideDialog?.showModal();
}

function closeInstallGuideDialog() {
  els.installGuideDialog?.close();
}

async function submitGroup(event) {
  event.preventDefault();
  const id = els.groupId.value;
  const payload = {
    name: els.groupName.value,
    description: els.groupDescription.value,
    logoDataUrl: state.groupLogoDraft || "",
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

async function deleteGroup(group) {
  const servers = state.servers.filter((server) => server.groupId === group.id);
  const links = state.networkLinks.filter((link) => link.groupId === group.id);
  const devices = state.networkDevices.filter((device) => device.groupId === group.id);
  const totalRelated = servers.length + links.length + devices.length;
  let mode = "detach";

  if (totalRelated) {
    const choice = window.prompt(
      `A empresa "${group.name}" possui ${servers.length} servidor(es), ${links.length} link(s) e ${devices.length} dispositivo(s) vinculados.\n\n` +
        "Digite DESVINCULAR para remover apenas a empresa desses cadastros.\n" +
        "Digite EXCLUIR para remover a empresa e tambem esses cadastros."
    );
    if (!choice) return;
    const normalized = choice.trim().toLowerCase();
    if (normalized === "excluir") {
      const confirmed = window.confirm(
        `Confirmar exclusao de "${group.name}" e tambem ${servers.length} servidor(es), ${links.length} link(s) e ${devices.length} dispositivo(s)?`
      );
      if (!confirmed) return;
      mode = "delete_related";
    } else if (normalized === "desvincular") {
      mode = "detach";
    } else {
      showToast("Acao cancelada", "Digite exatamente DESVINCULAR ou EXCLUIR.");
      return;
    }
  } else if (!window.confirm(`Excluir a empresa "${group.name}"?`)) {
    return;
  }

  try {
    const result = await api(`/api/groups/${encodeURIComponent(group.id)}`, {
      method: "DELETE",
      body: JSON.stringify({ mode })
    });
    const snap = await api("/api/snapshot");
    applySnapshot(snap);
    const affected = result.affected || {};
    showToast(
      "Empresa removida",
      mode === "delete_related"
        ? `${group.name} e seus itens vinculados foram removidos.`
        : `${group.name} foi removida; ${affected.serverCount || 0} servidor(es), ${affected.networkLinkCount || 0} link(s) e ${affected.networkDeviceCount || 0} dispositivo(s) ficaram sem empresa.`
    );
  } catch (error) {
    showToast("Falha ao remover empresa", error.message);
  }
}

async function submitUser(event) {
  event.preventDefault();
  if (els.userFormError) els.userFormError.textContent = "";
  const id = els.userId.value;
  const payload = {
    name: els.userName.value,
    email: els.userEmail.value,
    role: els.userRole.value,
    isActive: els.userActive.value === "true",
    groupIds: els.userRole.value === "admin"
      ? []
      : [...(els.userCompanyList?.querySelectorAll("input[type='checkbox']:checked") || [])].map((input) => input.value),
    allowedSections: els.userRole.value === "admin"
      ? SECTION_KEYS
      : [...(els.userSectionsFieldset?.querySelectorAll('input[name="userSection"]:checked') || [])].map((input) => input.value)
  };
  if (els.userPassword.value) payload.password = els.userPassword.value;
  try {
    const saved = id
      ? await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
    const snap = await api("/api/snapshot");
    applySnapshot(snap);
    closeUserDialog();
    showToast("Usuario salvo", `${saved.name} pode acessar o ServerWatch.`);
  } catch (error) {
    const message = error?.message || "Nao foi possivel salvar o usuario.";
    if (els.userFormError) els.userFormError.textContent = message;
    showToast("Falha ao salvar usuario", message);
  }
}

async function submitNetworkDevice(event) {
  event.preventDefault();
  const id = els.networkDeviceId.value;
  const payload = {
    name: els.networkDeviceName.value,
    vendor: els.networkDeviceVendor.value,
    model: els.networkDeviceModel.value,
    managementIp: els.networkDeviceManagementIp.value,
    groupId: els.networkDeviceGroup.value || null,
    probeId: els.networkDeviceProbe.value || null,
    notes: els.networkDeviceNotes.value
  };
  try {
    const saved = id
      ? await api(`/api/network/devices/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/network/devices", { method: "POST", body: JSON.stringify(payload) });
    state.networkDevices = [saved, ...state.networkDevices.filter((item) => item.id !== saved.id)];
    closeNetworkDeviceDialog();
    renderGroupOptions();
    renderNetworks();
    showToast("Dispositivo salvo", `${saved.name} esta disponivel para vincular links.`);
  } catch (error) {
    showToast("Falha ao salvar dispositivo", error.message);
  }
}

async function submitNetworkLink(event) {
  event.preventDefault();
  event.stopPropagation();
  const id = els.networkLinkId.value;
  const targets = readNetworkTargetInputs();
  if (!targets.length || targets.some((target) => !target.host)) {
    showToast("Informe os IPs", "Cada link cadastrado precisa ter um IP monitorado.");
    return;
  }
  const invalidPrefix = targets.find((target) => {
    if (!target.prefixLength) return false;
    const prefixLength = Number(target.prefixLength);
    return !Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 32;
  });
  if (invalidPrefix) {
    showToast("Mascara invalida", "Use valores como /30, /29 ou /28 nos links monitorados.");
    return;
  }
  const expectedPrefix = els.networkLinkExpectedPrefix?.value.trim().replace(/^\//, "") || "";
  if (expectedPrefix) {
    const prefixLength = Number(expectedPrefix);
    if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 32) {
      showToast("Mascara WAN invalida", "Use valores como /30, /29 ou /28 na rede WAN esperada.");
      return;
    }
  }
  const payload = {
    name: els.networkLinkName.value,
    provider: els.networkLinkProvider.value,
    networkDeviceId: els.networkLinkDevice.value || null,
    linkType: els.networkLinkType.value,
    targets,
    interfaceName: els.networkLinkInterface.value,
    expectedPublicIp: els.networkLinkExpectedPublicIp?.value || "",
    expectedPublicPrefixLength: expectedPrefix || null,
    groupId: els.networkLinkGroup.value || null,
    probeId: els.networkLinkProbe.value || null,
    checkInterval: Number(els.networkLinkInterval.value || 10),
    failureThreshold: Number(els.networkLinkThreshold.value || 3),
    degradedLatencyMs: Number(els.networkLinkLatencyLimit.value || 120),
    degradedPacketLossPercent: Number(els.networkLinkLossLimit.value || 10),
    notes: els.networkLinkNotes.value
  };
  try {
    const saved = id
      ? await api(`/api/network/links/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/network/links", { method: "POST", body: JSON.stringify(payload) });
    state.selectedNetworkLinkId = saved.id;
    state.networkLinks = [saved, ...state.networkLinks.filter((item) => item.id !== saved.id)];
    closeNetworkLinkDialog();
    renderNetworks();
    showToast("Link salvo", `${saved.name} sera testado pelo probe a cada ${saved.checkInterval || 10}s.`);
  } catch (error) {
    showToast("Falha ao salvar link", error.message);
  }
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
  const parent = state.servers.find((server) => server.id === parentId && !server.deletedAt);
  let updated = 0;

  for (const server of candidates) {
    const shouldAttach = selected.has(server.id);
    const shouldDetach = !shouldAttach && server.parentId === parentId;
    if (!shouldAttach && !shouldDetach) continue;

    const payload = serverUpdatePayload(server, {
      parentId: shouldAttach ? parentId : null,
      nodeType: shouldAttach ? "vm" : server.nodeType,
      groupId: shouldAttach && parent?.groupId ? parent.groupId : server.groupId || null
    });
    await api(`/api/servers/${server.id}`, { method: "PUT", body: JSON.stringify(payload) });
    updated += 1;
  }

  return updated;
}

async function submitServer(event) {
  event.preventDefault();
  event.stopPropagation();
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
  if (payload.nodeType === "hypervisor") {
    payload.childIds = selectedVirtualizerChildIds();
  }
  const parent = serverByFormParent();
  if (parent?.groupId) payload.groupId = parent.groupId;
  try {
    const saved = id
      ? await api(`/api/servers/${id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/servers", { method: "POST", body: JSON.stringify(payload) });
    const childUpdates = Number(saved.childUpdates || 0);
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

async function handleServerAction(button) {
  if (!isAdmin()) return;
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
      if (result.requirePasswordChange || result.user?.mustChangePassword) {
        requirePasswordChange();
      }
    } catch (error) {
      els.loginError.textContent = error.message;
    }
  });

  els.passwordChangeDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
  });

  els.passwordChangeForm?.addEventListener("submit", submitPasswordChange);

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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = eventClosest(event, '[role="button"][data-probe-id]');
    if (!card) return;
    event.preventDefault();
    card.click();
  });

  els.simpleDashboardContent?.addEventListener("click", (event) => {
    const viewButton = eventClosest(event, "[data-simple-view]");
    if (viewButton?.dataset.simpleView) {
      setActiveView(viewButton.dataset.simpleView);
      return;
    }

    const serverButton = eventClosest(event, "[data-simple-server-id]");
    if (serverButton?.dataset.simpleServerId) {
      selectServer(serverButton.dataset.simpleServerId, { view: "servers" });
      return;
    }

    const networkButton = eventClosest(event, "[data-simple-network-link-id]");
    if (networkButton?.dataset.simpleNetworkLinkId) {
      state.selectedNetworkLinkId = networkButton.dataset.simpleNetworkLinkId;
      setActiveView("networks");
      renderNetworks();
      return;
    }

    const companyButton = eventClosest(event, "[data-simple-company-id]");
    if (companyButton?.dataset.simpleCompanyId) {
      state.filters.groupId = companyButton.dataset.simpleCompanyId;
      if (els.groupFilter) els.groupFilter.value = state.filters.groupId;
      setActiveView("dashboard");
      render();
      return;
    }

    const backupClientButton = eventClosest(event, "[data-simple-backup-client-id]");
    if (backupClientButton?.dataset.simpleBackupClientId) {
      state.selectedBackupClientId = backupClientButton.dataset.simpleBackupClientId;
      state.backupLinkEditorOpen = null;
      setActiveView("backups");
      renderBackups();
      return;
    }

    if (eventClosest(event, "[data-offline-trigger]")) {
      openOfflineServersDialog();
    }
  });

  document.querySelector("#dashboardScopeBar")?.addEventListener("click", (event) => {
    const scopeButton = eventClosest(event, "[data-company-scope-id]");
    if (scopeButton?.dataset.companyScopeId) {
      state.filters.groupId = scopeButton.dataset.companyScopeId;
      state.companyScopeQuery = "";
      if (els.groupFilter) els.groupFilter.value = state.filters.groupId;
      if (els.companyScopeMenu) els.companyScopeMenu.open = false;
      render();
      return;
    }

    const focusButton = eventClosest(event, "[data-dashboard-focus]");
    if (!focusButton?.dataset.dashboardFocus) return;
    const focus = focusButton.dataset.dashboardFocus;
    if (focus === "attention") {
      state.alertFilters.status = "open";
      state.alertFilters.type = "all";
      state.alertFilters.groupId = state.filters.groupId;
      if (els.alertGroupFilter) els.alertGroupFilter.value = state.alertFilters.groupId;
      if (els.alertStatusFilter) els.alertStatusFilter.value = state.alertFilters.status;
      if (els.alertTypeFilter) els.alertTypeFilter.value = state.alertFilters.type;
      setActiveView("alerts");
      renderAlerts();
      return;
    }
    if (focus === "links") {
      setActiveView("networks");
      return;
    }
    state.filters.status = focus === "probe_stale" ? "probe_stale" : "offline";
    document.querySelectorAll(".segment").forEach((item) => {
      item.classList.toggle("active", item.dataset.status === state.filters.status);
    });
    setActiveView("servers");
    updateActiveFilterCount();
    renderMetrics();
    renderServerDirectory();
  });

  els.companyScopeSearch?.addEventListener("input", () => {
    state.companyScopeQuery = els.companyScopeSearch.value.trim();
    renderCompanyNav();
  });

  els.companyScopeList?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-company-id]");
    if (!button) return;
    state.filters.groupId = button.dataset.companyId;
    state.companyScopeQuery = "";
    if (els.groupFilter) els.groupFilter.value = state.filters.groupId;
    if (els.companyScopeMenu) els.companyScopeMenu.open = false;
    render();
  });

  els.networkLinksList?.addEventListener("click", (event) => {
    const row = eventClosest(event, "[data-network-link-id]");
    if (row) {
      state.selectedNetworkLinkId = row.dataset.networkLinkId;
      state.selectedNetworkGroupId = null;
      renderNetworks();
      return;
    }
    const group = eventClosest(event, "[data-network-group-id]");
    if (group) {
      state.selectedNetworkGroupId = group.dataset.networkGroupId;
      state.selectedNetworkLinkId = null;
      renderNetworks();
    }
  });

  els.networkDetailPanel?.addEventListener("click", async (event) => {
    const detailRow = eventClosest(event, "[data-network-link-id]");
    if (detailRow && !eventClosest(event, "[data-network-action]")) {
      state.selectedNetworkLinkId = detailRow.dataset.networkLinkId;
      state.selectedNetworkGroupId = null;
      renderNetworks();
      return;
    }

    const button = eventClosest(event, "[data-network-action]");
    if (!button || !isAdmin()) return;
    const link = state.networkLinks.find((item) => item.id === button.dataset.linkId);
    if (!link) return;

    if (button.dataset.networkAction === "edit") {
      openNetworkLinkDialog(link);
      return;
    }

    if (button.dataset.networkAction === "check") {
      try {
        const updated = await api(`/api/network/links/${encodeURIComponent(link.id)}/check`, { method: "POST" });
        state.networkLinks = state.networkLinks.map((item) => (item.id === updated.id ? updated : item));
        renderNetworks();
        showToast("Checagem solicitada", `${link.name} sera testado no proximo ciclo do probe.`);
      } catch (error) {
        showToast("Falha ao solicitar checagem", error.message);
      }
      return;
    }

    if (button.dataset.networkAction === "toggle") {
      try {
        const updated = await api(`/api/network/links/${encodeURIComponent(link.id)}/toggle`, { method: "POST" });
        state.networkLinks = state.networkLinks.map((item) => (item.id === updated.id ? updated : item));
        renderNetworks();
        showToast(
          updated.isActive ? "Monitoramento reativado" : "Monitoramento desativado",
          updated.isActive ? `${updated.name} voltou a contar nas visualizacoes.` : `${updated.name} nao sera tratado como falha enquanto estiver pausado.`
        );
      } catch (error) {
        showToast("Nao foi possivel alterar", error.message);
      }
      return;
    }

    if (button.dataset.networkAction === "delete") {
      const confirmed = window.confirm(`Excluir o link "${link.name}"?`);
      if (!confirmed) return;
      try {
        await api(`/api/network/links/${encodeURIComponent(link.id)}`, { method: "DELETE" });
        state.networkLinks = state.networkLinks.filter((item) => item.id !== link.id);
        state.selectedNetworkLinkId = sortedByAlpha(state.networkLinks, networkLinkSortLabel)[0]?.id || null;
        renderNetworks();
        showToast("Link excluido", `${link.name} saiu do monitoramento.`);
      } catch (error) {
        showToast("Nao foi possivel excluir", error.message);
      }
    }
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filters.status = button.dataset.status;
      updateActiveFilterCount();
      renderMetrics();
      renderServerDirectory();
    });
  });

  els.searchInput.addEventListener("input", () => {
    state.filters.query = els.searchInput.value.trim();
    updateActiveFilterCount();
    renderMetrics();
    renderServerDirectory();
  });

  els.environmentFilter.addEventListener("change", () => {
    state.filters.environment = els.environmentFilter.value;
    updateActiveFilterCount();
    renderMetrics();
    renderServerDirectory();
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

  els.companyNav?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-company-id]");
    if (!button) return;
    state.filters.groupId = button.dataset.companyId;
    els.groupFilter.value = state.filters.groupId;
    setActiveView("dashboard");
    render();
  });

  els.executiveDashboard?.addEventListener("click", (event) => {
    const alertGroupButton = eventClosest(event, "[data-alert-group-id]");
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

    const serverButton = eventClosest(event, "[data-server-id]");
    if (serverButton?.dataset.serverId) {
      selectServer(serverButton.dataset.serverId, { view: "dashboard" });
      return;
    }
    const companyButton = eventClosest(event, "[data-company-id]");
    if (companyButton?.dataset.companyId) {
      state.filters.groupId = companyButton.dataset.companyId;
      els.groupFilter.value = state.filters.groupId;
      setActiveView("dashboard");
      render();
    }
  });

  document.querySelector("#closeDialog").addEventListener("click", closeDialog);
  document.querySelector("#cancelForm").addEventListener("click", closeDialog);
  els.serverDialog?.addEventListener("click", (event) => closeDialogFromBackdrop(event, closeDialog));
  els.serverCheckSource.addEventListener("change", toggleProbeOptions);
  els.serverProbeId.addEventListener("change", () => applySelectedProbeDefaults({ force: true }));
  els.serverNodeType.addEventListener("change", toggleVirtualizerChildrenOptions);
  els.serverParentId.addEventListener("change", () => {
    if (els.serverParentId.value) {
      els.serverNodeType.value = "vm";
      applyParentCompanyDefault();
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
    renderServerDirectory();
  });
  els.serverForm.addEventListener("submit", submitServer);

  document.querySelector("#openNetworkDeviceForm")?.addEventListener("click", () => openNetworkDeviceDialog());
  document.querySelector("#openNetworkLinkForm")?.addEventListener("click", () => openNetworkLinkDialog());
  document.querySelector("#closeNetworkDeviceDialog")?.addEventListener("click", closeNetworkDeviceDialog);
  document.querySelector("#cancelNetworkDeviceForm")?.addEventListener("click", closeNetworkDeviceDialog);
  document.querySelector("#closeNetworkLinkDialog")?.addEventListener("click", closeNetworkLinkDialog);
  document.querySelector("#cancelNetworkLinkForm")?.addEventListener("click", closeNetworkLinkDialog);
  els.networkLinkDialog?.addEventListener("click", (event) => closeDialogFromBackdrop(event, closeNetworkLinkDialog));
  els.networkDeviceForm?.addEventListener("submit", submitNetworkDevice);
  els.networkLinkForm?.addEventListener("submit", submitNetworkLink);
  els.networkLinkDevice?.addEventListener("change", applyNetworkDeviceDefaults);
  els.addNetworkTarget?.addEventListener("click", addNetworkTargetInput);
  els.networkLinkTarget?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-remove-network-target]");
    if (button) removeNetworkTargetInput(button);
  });

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

  els.copyLinkProbeInstallCommand?.addEventListener("click", () => {
    copyText(linkProbeInstallCommand(), "Comando de instalacao do LinkProbe copiado.");
  });
  els.copyMikrotikProbeInstallCommand?.addEventListener("click", () => {
    copyText(mikrotikProbeInstallCommand(), "Comando de instalacao do MikroTik Probe copiado.");
  });

  els.openCommandGeneratorButton?.addEventListener("click", () => openCommandGeneratorDialog("server"));
  els.closeCommandGeneratorDialog?.addEventListener("click", closeCommandGeneratorDialog);
  els.cancelCommandGeneratorDialog?.addEventListener("click", closeCommandGeneratorDialog);
  els.commandGeneratorDialog?.addEventListener("click", (event) => closeDialogFromBackdrop(event, closeCommandGeneratorDialog));
  els.commandGeneratorDialog?.addEventListener("input", () => updateGeneratedCommand());
  els.commandGeneratorDialog?.addEventListener("change", () => updateGeneratedCommand());
  els.refreshGeneratedCommand?.addEventListener("click", () => {
    collectCommandMikrotikUplinks();
    updateGeneratedCommand();
  });
  els.copyGeneratedCommand?.addEventListener("click", () => {
    copyText(els.generatedCommandOutput?.value || "", "Comando gerado copiado.");
  });
  document.querySelectorAll("[data-command-generator-mode]").forEach((button) => {
    button.addEventListener("click", () => setCommandGeneratorMode(button.dataset.commandGeneratorMode));
  });
  els.addCommandMikrotikUplink?.addEventListener("click", () => {
    collectCommandMikrotikUplinks();
    if (state.commandGeneratorMikrotikUplinks.length >= 10) return;
    const next = state.commandGeneratorMikrotikUplinks.length + 1;
    state.commandGeneratorMikrotikUplinks.push({
      name: `Link ${next} - Operadora`,
      interfaceName: `ether${next}-WAN`,
      gateway: "",
      prefix: "30",
      target: next % 2 === 0 ? "149.112.112.112" : "4.2.2.2"
    });
    renderCommandMikrotikUplinks();
  });
  els.commandMikrotikUplinkList?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-remove-command-uplink]");
    if (!button) return;
    collectCommandMikrotikUplinks();
    if (state.commandGeneratorMikrotikUplinks.length <= 1) return;
    state.commandGeneratorMikrotikUplinks.splice(Number(button.dataset.removeCommandUplink), 1);
    renderCommandMikrotikUplinks();
  });

  document.querySelectorAll("[data-open-probe-guide]").forEach((button) => {
    button.addEventListener("click", () => openInstallGuideDialog(button.dataset.openProbeGuide));
  });
  document.querySelector("#closeInstallGuideDialog")?.addEventListener("click", closeInstallGuideDialog);
  document.querySelectorAll("[data-install-guide-tab]").forEach((button) => {
    button.addEventListener("click", () => setInstallGuideTab(button.dataset.installGuideTab));
  });

  document.querySelectorAll("[data-probe-install-target]").forEach((button) => {
    button.addEventListener("click", () => {
      state.probeInstallTarget = button.dataset.probeInstallTarget === "proxmox" ? "proxmox" : "linux";
      renderProbes();
    });
  });
  document.querySelectorAll("[data-probe-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.probeFilter = button.dataset.probeFilter || "all";
      renderProbes();
    });
  });

  els.probesList?.addEventListener("click", (event) => {
    const card = eventClosest(event, "[data-probe-id]");
    if (!card) return;
    state.selectedProbeId = card.dataset.probeId;
    document.querySelectorAll(".probe-card").forEach((item) => {
      item.classList.toggle("selected", item.dataset.probeId === state.selectedProbeId);
    });
  });

  els.updateOutdatedProbes?.addEventListener("click", async () => {
    try {
      const response = await api("/api/probes/update-outdated", { method: "POST" });
      showToast("Atualizacao solicitada", `${response.count || 0} probes Linux foram colocados na fila.`);
    } catch (error) {
      showToast("Falha ao atualizar probes", error.message);
    }
  });

  els.refreshBackupsButton?.addEventListener("click", async () => {
    const button = els.refreshBackupsButton;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Atualizando...";
    if (els.backupsSyncMeta) els.backupsSyncMeta.textContent = "Consultando a API de backups...";
    try {
      const response = await api("/api/backups/refresh", { method: "POST" });
      state.cloudBackup = response.backups || state.cloudBackup;
      renderBackups();
      showToast("Backups atualizados", "Os dados de backup foram atualizados agora.");
    } catch (error) {
      renderBackups();
      showToast("Falha ao atualizar backups", error.message);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  els.backupsKpiRow?.addEventListener("click", (event) => {
    if (event.target.closest("[data-backup-errors-trigger]")) openBackupErrorsDialog();
  });

  els.backupsSetsSummary?.addEventListener("click", (event) => {
    if (event.target.closest("[data-backup-errors-trigger]")) openBackupErrorsDialog();
  });

  els.closeBackupErrorsDialog?.addEventListener("click", () => {
    els.backupErrorsDialog?.close();
  });

  els.closeOfflineServersDialog?.addEventListener("click", () => {
    els.offlineServersDialog?.close();
  });

  function selectBackupClient(clientId) {
    state.selectedBackupClientId = clientId;
    state.backupLinkEditorOpen = null;
    renderBackups();
    requestAnimationFrame(() => {
      els.backupsProfilePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  els.backupsAttentionList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-backup-attention-client]");
    if (!button) return;
    selectBackupClient(button.dataset.backupAttentionClient);
  });

  els.backupsClientGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-backup-client-jump]");
    if (!button) return;
    selectBackupClient(button.dataset.backupClientJump);
  });

  els.backupsDirectoryList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-backup-client-id]");
    if (!button) return;
    state.selectedBackupClientId = button.dataset.backupClientId;
    state.backupLinkEditorOpen = null;
    renderBackups();
  });

  els.backupsProfilePanel?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-backup-link-edit]");
    if (!button) return;
    state.backupLinkEditorOpen = button.dataset.backupLinkEdit;
    renderBackups();
    requestAnimationFrame(() => {
      els.backupsProfilePanel?.querySelector("[data-backup-client-link]")?.focus();
    });
  });

  els.backupsProfilePanel?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-backup-client-link]");
    if (!select) return;
    const clientId = select.dataset.backupClientLink;
    const groupId = select.value || null;
    try {
      const response = await api("/api/backups/link", {
        method: "POST",
        body: JSON.stringify({ clientId, groupId })
      });
      state.cloudBackup = response.backups || state.cloudBackup;
      state.backupLinkEditorOpen = null;
      renderBackups();
      showToast("Vinculo atualizado", "O cliente de backup foi vinculado a empresa selecionada.");
    } catch (error) {
      showToast("Falha ao vincular cliente", error.message);
      renderBackups();
    }
  });

  els.probeDetailPanel?.addEventListener("click", async (event) => {
    const serverRow = eventClosest(event, "[data-server-id]");
    if (serverRow) {
      selectServer(serverRow.dataset.serverId, { view: "dashboard" });
      return;
    }

    const button = eventClosest(event, "[data-action]");
    if (!button) return;
    const probe = state.probes.find((item) => item.id === button.dataset.probeId);
    if (!probe) return;

    if (button.dataset.action === "copy-probe-repair") {
      copyText(probeInstallCommandFor(probe, { repair: true }), "Comando de reparo do probe copiado.");
      return;
    }

    if (button.dataset.action === "update-probe") {
      try {
        const response = await api(`/api/probes/${encodeURIComponent(probe.id)}/update`, { method: "POST" });
        state.probes = state.probes.map((item) => (item.id === probe.id ? response.probe : item));
        renderProbes();
        showToast("Atualizacao solicitada", `${probe.name || probe.id} sera atualizado no proximo contato.`);
      } catch (error) {
        showToast("Falha ao solicitar atualizacao", error.message);
      }
      return;
    }

    if (button.dataset.action === "delete-probe") {
      const confirmed = window.confirm(`Remover o probe "${probe.name || probe.id}"?\n\nUse isto apenas para cadastros antigos sem servidores vinculados.`);
      if (!confirmed) return;
      try {
        await api(`/api/probes/${encodeURIComponent(probe.id)}`, { method: "DELETE" });
        state.probes = state.probes.filter((item) => item.id !== probe.id);
        state.selectedProbeId = sortedByAlpha(state.probes, probeSortLabel)[0]?.id || null;
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
  els.groupName?.addEventListener("input", () => {
    if (els.groupLogoPreviewName) els.groupLogoPreviewName.textContent = els.groupName.value.trim() || "Logo da empresa";
    paintBrandLogo(els.groupLogoPreview, state.groupLogoDraft, els.groupName.value || "SW");
  });
  els.groupLogoInput?.addEventListener("change", async () => {
    try {
      state.groupLogoDraft = await readLogoFile(els.groupLogoInput.files?.[0]) || "";
      paintBrandLogo(els.groupLogoPreview, state.groupLogoDraft, els.groupName.value || "SW");
    } catch (error) {
      state.groupLogoDraft = "";
      if (els.groupLogoInput) els.groupLogoInput.value = "";
      paintBrandLogo(els.groupLogoPreview, "", els.groupName.value || "SW");
      showToast("Logo invalida", error.message);
    }
  });
  els.removeGroupLogo?.addEventListener("click", () => {
    state.groupLogoDraft = "";
    if (els.groupLogoInput) els.groupLogoInput.value = "";
    paintBrandLogo(els.groupLogoPreview, "", els.groupName.value || "SW");
  });
  els.groupForm.addEventListener("submit", submitGroup);

  document.querySelector("#openUserForm").addEventListener("click", () => openUserDialog());
  document.querySelector("#closeUserDialog").addEventListener("click", closeUserDialog);
  document.querySelector("#cancelUserForm").addEventListener("click", closeUserDialog);
  els.userRole?.addEventListener("change", () => {
    renderUserCompanyPicker(
      [...(els.userCompanyList?.querySelectorAll("input[type='checkbox']:checked") || [])].map((input) => input.value)
    );
    renderUserSectionsPicker(
      [...(els.userSectionsFieldset?.querySelectorAll('input[name="userSection"]:checked') || [])].map((input) => input.value)
    );
  });
  els.userForm.addEventListener("submit", submitUser);
  els.brandingForm?.addEventListener("submit", submitBranding);
  els.themeSettingsForm?.addEventListener("submit", submitThemeSettings);
  els.themeModeInputs?.forEach((input) => {
    input.addEventListener("change", () => {
      state.themeDraft = input.value;
    });
  });
  els.alertSettingsForm?.addEventListener("submit", submitAlertSettings);

  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.adminView));
  });
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
    const button = eventClosest(event, "[data-user-action]");
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
    const button = eventClosest(event, "[data-group-action]");
    if (!button) return;
    const group = state.groups.find((item) => item.id === button.dataset.id);
    if (group && button.dataset.groupAction === "edit") openGroupDialog(group);
    if (group && button.dataset.groupAction === "delete") deleteGroup(group);
  });

  els.serverDirectoryList?.addEventListener("click", (event) => {
    const topologyToggle = eventClosest(event, "[data-topology-toggle]");
    if (topologyToggle) {
      event.preventDefault();
      event.stopPropagation();
      const serverId = topologyToggle.dataset.topologyToggle;
      if (state.topologyExpanded.has(serverId)) state.topologyExpanded.delete(serverId);
      else state.topologyExpanded.add(serverId);
      renderServerDirectory();
      return;
    }
    const groupButton = eventClosest(event, "[data-profile-server-group-id]");
    if (groupButton) {
      selectServerGroup(groupButton.dataset.profileServerGroupId);
      return;
    }
    const button = eventClosest(event, "[data-profile-server-id]");
    if (!button) return;
    selectServer(button.dataset.profileServerId);
  });

  els.serverProfilePanel?.addEventListener("click", async (event) => {
    const networkLink = eventClosest(event, "[data-network-link-id]");
    if (networkLink) {
      state.selectedNetworkLinkId = networkLink.dataset.networkLinkId;
      state.selectedNetworkGroupId = null;
      setActiveView("networks");
      renderNetworks();
      return;
    }

    const profileServer = eventClosest(event, "[data-profile-server-id]");
    if (profileServer) {
      selectServer(profileServer.dataset.profileServerId);
      return;
    }

    const button = eventClosest(event, "[data-action]");
    if (!button) return;
    await handleServerAction(button);
  });

  els.alertsList.addEventListener("click", async (event) => {
    const button = eventClosest(event, "[data-alert-action]");
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
        renderSimpleDashboard();
        showToast("Alerta reconhecido", `${alert.serverName} foi marcado como tratado.`);
      } catch (error) {
        showToast("Falha ao reconhecer alerta", error.message);
      }
    }
  });

  els.notificationList?.addEventListener("click", (event) => {
    const item = eventClosest(event, "[data-notification-alert-id]");
    if (!item) return;
    const alert = state.alerts.find((entry) => entry.id === item.dataset.notificationAlertId);
    if (!alert) return;
    state.alertFilters.groupId = alertGroupId(alert);
    state.alertFilters.status = alert.read ? "read" : "open";
    state.alertFilters.type = alert.type || "all";
    if (els.alertGroupFilter) els.alertGroupFilter.value = state.alertFilters.groupId;
    if (els.alertStatusFilter) els.alertStatusFilter.value = state.alertFilters.status;
    if (els.alertTypeFilter) els.alertTypeFilter.value = state.alertFilters.type;
    if (els.notificationMenu) els.notificationMenu.open = false;
    setActiveView("alerts");
  });

  els.enableBrowserNotifications?.addEventListener("click", requestBrowserNotifications);

  els.logoutButton.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => ({}));
    showLogin();
  });

  document.querySelector("#markAlertsRead")?.addEventListener("click", markAllAlertsRead);

  document.querySelector("#clearAlertsHistory")?.addEventListener("click", clearAllAlertsHistory);

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
    if (user.mustChangePassword) {
      requirePasswordChange();
    }
  })
  .catch(() => showLogin());
setInterval(() => {
  if (!state.currentUser) return;
  renderServerDirectory();
  renderServerProfile();
}, 1000);
