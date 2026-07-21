const state = {
  servers: [],
  groups: [],
  productCatalog: [],
  probes: [],
  networkDevices: [],
  networkLinks: [],
  networkDiscoverySuggestions: [],
  networkEvents: [],
  users: [],
  currentUser: null,
  settings: {},
  events: [],
  alerts: [],
  tickets: [],
  selectedTicketId: null,
  ticketUpdateDraft: null,
  clientSupportMode: "list",
  summary: {},
  selectedServerId: null,
  selectedServerGroupId: null,
  selectedGroupId: null,
  selectedProbeId: null,
  probeFilter: "all",
  selectedNetworkLinkId: null,
  selectedNetworkGroupId: null,
  companyScopeQuery: "",
  dashboardMode: localStorage.getItem("serverwatch.dashboardMode") === "complete" ? "complete" : "simple",
  groupLogoDraft: "",
  groupManagementView: "companies",
  groupSearchQuery: "",
  groupExpiringOnly: false,
  themeDraft: null,
  topologyExpanded: new Set(),
  networkDeviceExpanded: new Set(),
  selectedBackupClientId: null,
  backupProvider: "msp",
  report: { groupId: "", days: 30, data: null, loadedKey: "", loading: false, error: "" },
  networkProvider: "connectivity",
  unifiExpandedSites: new Set(),
  unifiRenderSignature: "",
  backupLinkEditorOpen: null,
  probeInstallTarget: "linux",
  commandGeneratorMode: "server",
  filters: {
    status: "all",
    environment: "all",
    groupId: "all",
    query: ""
  },
  filterDraft: {
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
  ticketFilters: {
    groupId: "all",
    status: "all",
    priority: "all",
    assignee: "all",
    query: "",
    quick: "all"
  },
  socket: null,
  reconnectTimer: null,
  notificationsEnabled: false
};

const _mh = { open: false, probeId: null, type: "short", rangeMs: 6 * 60 * 60_000, chartsHtml: "" };

const _nocSort = { column: null, direction: "asc" };

// Campos que mudam em praticamente todo snapshot (timestamps de "ultima
// checagem", latencia com jitter natural, metricas de host que oscilam a
// cada coleta) mas nao representam algo que precise reconstruir a tela.
// Ignorados ao decidir se um snapshot novo justifica um render completo —
// sem isso, qualquer probe reportando (a cada poucos segundos, para dezenas
// de probes) disparava um render() a cada ~300ms e piscava a interface
// inteira embaixo do cursor do mouse.
const SNAPSHOT_VOLATILE_KEYS = new Set([
  "lastCheckedAt",
  "probeLastSeenAt",
  "lastProbeSeenAt",
  "probeHostMetricsUpdatedAt",
  "probeFallbackCheckedAt",
  "updatedAt",
  "lastSeenAt",
  "hostMetricsUpdatedAt",
  "fetchedAt",
  "collectedAt",
  "lastLatencyMs",
  "probeHostMetrics",
  "hostMetrics",
  "consecutiveFailures",
  "activeTargetHost",
  "clientCount",
  "totalBytes"
]);

function stripVolatileForFingerprint(value) {
  if (Array.isArray(value)) return value.map(stripVolatileForFingerprint);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      if (SNAPSHOT_VOLATILE_KEYS.has(key)) continue;
      out[key] = stripVolatileForFingerprint(value[key]);
    }
    return out;
  }
  return value;
}

let _lastSnapshotFingerprint = null;

function snapshotFingerprint(payload) {
  return JSON.stringify(
    stripVolatileForFingerprint({
      summary: payload.summary,
      servers: payload.servers,
      groups: payload.groups,
      productCatalog: payload.productCatalog,
      probes: payload.probes,
      networkDevices: payload.networkDevices,
      networkLinks: payload.networkLinks,
      networkEvents: payload.networkEvents,
      users: payload.users,
      settings: payload.settings,
      alerts: payload.alerts,
      tickets: payload.tickets,
      events: payload.events,
      cloudBackup: payload.cloudBackup,
      proxmoxBackup: payload.proxmoxBackup,
      unifiNetwork: payload.unifiNetwork
    })
  );
}

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
  dashboardModeToggle: document.querySelector("#dashboardModeToggle"),
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
  networkDiscoveryBanner: document.querySelector("#networkDiscoveryBanner"),
  networkDetailPanel: document.querySelector("#networkDetailPanel"),
  networkProviderToggle: document.querySelector("#networkProviderToggle"),
  networkConnectivityView: document.querySelector("#networkConnectivityView"),
  networkUnifiView: document.querySelector("#networkUnifiView"),
  unifiSyncMeta: document.querySelector("#unifiSyncMeta"),
  unifiSummary: document.querySelector("#unifiSummary"),
  unifiContent: document.querySelector("#unifiContent"),
  refreshUnifiButton: document.querySelector("#refreshUnifiButton"),
  networkProbeInstallCommand: document.querySelector("#networkProbeInstallCommand"),
  copyNetworkProbeInstallCommand: document.querySelector("#copyNetworkProbeInstallCommand"),
  installGuideDialog: document.querySelector("#installGuideDialog"),
  guideServerProbeCommand: document.querySelector("#guideServerProbeCommand"),
  guideNetworkProbeCommand: document.querySelector("#guideNetworkProbeCommand"),
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
  networkDeviceSnmpEnabled: document.querySelector("#networkDeviceSnmpEnabled"),
  networkDeviceSnmpCommunity: document.querySelector("#networkDeviceSnmpCommunity"),
  networkDeviceSnmpPort: document.querySelector("#networkDeviceSnmpPort"),
  networkDeviceNetworkProbe: document.querySelector("#networkDeviceNetworkProbe"),
  networkDeviceNotes: document.querySelector("#networkDeviceNotes"),
  networkDeviceInterfacesSection: document.querySelector("#networkDeviceInterfacesSection"),
  networkDeviceInterfaceChecklist: document.querySelector("#networkDeviceInterfaceChecklist"),
  networkLinkDialog: document.querySelector("#networkLinkDialog"),
  networkLinkForm: document.querySelector("#networkLinkForm"),
  networkLinkDialogTitle: document.querySelector("#networkLinkDialogTitle"),
  networkLinkId: document.querySelector("#networkLinkId"),
  networkLinkName: document.querySelector("#networkLinkName"),
  networkLinkProvider: document.querySelector("#networkLinkProvider"),
  networkLinkDevice: document.querySelector("#networkLinkDevice"),
  networkLinkSnmpIfPickerLabel: document.querySelector("#networkLinkSnmpIfPickerLabel"),
  networkLinkSnmpIfPicker: document.querySelector("#networkLinkSnmpIfPicker"),
  networkLinkSnmpIfIndex: document.querySelector("#networkLinkSnmpIfIndex"),
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
  ticketCount: document.querySelector("#ticketCount"),
  ticketListCount: document.querySelector("#ticketListCount"),
  ticketGroupFilter: document.querySelector("#ticketGroupFilter"),
  ticketStatusFilter: document.querySelector("#ticketStatusFilter"),
  ticketPriorityFilter: document.querySelector("#ticketPriorityFilter"),
  ticketAssigneeFilter: document.querySelector("#ticketAssigneeFilter"),
  ticketSearch: document.querySelector("#ticketSearch"),
  ticketQuickFilters: document.querySelector("#ticketQuickFilters"),
  ticketsList: document.querySelector("#ticketsList"),
  ticketQueueScreen: document.querySelector("#ticketQueueScreen"),
  ticketWorkspaceScreen: document.querySelector("#ticketWorkspaceScreen"),
  ticketWorkspacePanel: document.querySelector("#ticketWorkspacePanel"),
  ticketDetailPanel: document.querySelector("#ticketDetailPanel"),
  openTicketForm: document.querySelector("#openTicketForm"),
  ticketDialog: document.querySelector("#ticketDialog"),
  ticketForm: document.querySelector("#ticketForm"),
  ticketDialogTitle: document.querySelector("#ticketDialogTitle"),
  closeTicketDialog: document.querySelector("#closeTicketDialog"),
  cancelTicketForm: document.querySelector("#cancelTicketForm"),
  ticketId: document.querySelector("#ticketId"),
  ticketTitle: document.querySelector("#ticketTitle"),
  ticketGroupId: document.querySelector("#ticketGroupId"),
  ticketPriority: document.querySelector("#ticketPriority"),
  ticketCategory: document.querySelector("#ticketCategory"),
  ticketImpact: document.querySelector("#ticketImpact"),
  ticketSource: document.querySelector("#ticketSource"),
  ticketAssetType: document.querySelector("#ticketAssetType"),
  ticketAssetName: document.querySelector("#ticketAssetName"),
  ticketFirstResponseDueAt: document.querySelector("#ticketFirstResponseDueAt"),
  ticketResolutionDueAt: document.querySelector("#ticketResolutionDueAt"),
  ticketRequesterName: document.querySelector("#ticketRequesterName"),
  ticketAssignedTo: document.querySelector("#ticketAssignedTo"),
  ticketDescription: document.querySelector("#ticketDescription"),
  ticketFormError: document.querySelector("#ticketFormError"),
  clientSupportPortal: document.querySelector("#clientSupportPortal"),
  clientCompanyContext: document.querySelector("#clientCompanyContext"),
  clientSupportContent: document.querySelector("#clientSupportContent"),
  clientNewTicket: document.querySelector("#clientNewTicket"),
  toastStack: document.querySelector("#toastStack"),
  searchInput: document.querySelector("#searchInput"),
  environmentFilter: document.querySelector("#environmentFilter"),
  groupFilter: document.querySelector("#groupFilter"),
  activeFilterCount: document.querySelector("#activeFilterCount"),
  clearFilters: document.querySelector("#clearFilters"),
  applyFilters: document.querySelector("#applyFilters"),
  filterMenu: document.querySelector("#filterMenu"),
  companyNav: document.querySelector("#companyNav"),
  groupsList: document.querySelector("#groupsList"),
  groupCount: document.querySelector("#groupCount"),
  usersList: document.querySelector("#usersList"),
  userCount: document.querySelector("#userCount"),
  brandingForm: document.querySelector("#brandingForm"),
  themeSettingsForm: document.querySelector("#themeSettingsForm"),
  alertSettingsForm: document.querySelector("#alertSettingsForm"),
  ticketSlaSettingsForm: document.querySelector("#ticketSlaSettingsForm"),
  ticketSlaUrgentHours: document.querySelector("#ticketSlaUrgentHours"),
  ticketSlaNormalHours: document.querySelector("#ticketSlaNormalHours"),
  ticketAutomationSettingsForm: document.querySelector("#ticketAutomationSettingsForm"),
  ticketAutomationEnabled: document.querySelector("#ticketAutomationEnabled"),
  ticketAutomationServerMinutes: document.querySelector("#ticketAutomationServerMinutes"),
  ticketAutomationLinkMinutes: document.querySelector("#ticketAutomationLinkMinutes"),
  ticketAutomationBackupHours: document.querySelector("#ticketAutomationBackupHours"),
  expirySettingsForm: document.querySelector("#expirySettingsForm"),
  expiryNotifyDays: document.querySelector("#expiryNotifyDays"),
  cloudBackupSettingsForm: document.querySelector("#cloudBackupSettingsForm"),
  cloudBackupApiKeyInput: document.querySelector("#cloudBackupApiKeyInput"),
  cloudBackupSourceLabel: document.querySelector("#cloudBackupSourceLabel"),
  proxmoxSettingsForm: document.querySelector("#proxmoxSettingsForm"),
  proxmoxBaseUrlInput: document.querySelector("#proxmoxBaseUrlInput"),
  proxmoxTokenIdInput: document.querySelector("#proxmoxTokenIdInput"),
  proxmoxTokenSecretInput: document.querySelector("#proxmoxTokenSecretInput"),
  proxmoxTlsFingerprintInput: document.querySelector("#proxmoxTlsFingerprintInput"),
  proxmoxSourceLabel: document.querySelector("#proxmoxSourceLabel"),
  unifiSettingsForm: document.querySelector("#unifiSettingsForm"),
  unifiBaseUrlInput: document.querySelector("#unifiBaseUrlInput"),
  unifiApiBasePathInput: document.querySelector("#unifiApiBasePathInput"),
  unifiApiKeyInput: document.querySelector("#unifiApiKeyInput"),
  unifiTlsFingerprintInput: document.querySelector("#unifiTlsFingerprintInput"),
  unifiSourceLabel: document.querySelector("#unifiSourceLabel"),
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
  groupContractInputs: document.querySelectorAll('input[name="groupContract"]'),
  groupContractsList: document.querySelector("#groupContractsList"),
  addGroupContract: document.querySelector("#addGroupContract"),
  groupProductsList: document.querySelector("#groupProductsList"),
  addGroupProduct: document.querySelector("#addGroupProduct"),
  productCatalogSuggestions: document.querySelector("#productCatalogSuggestions"),
  groupSearch: document.querySelector("#groupSearch"),
  toggleGroupExpiryFilter: document.querySelector("#toggleGroupExpiryFilter"),
  groupsDirectoryPanel: document.querySelector("#groupsDirectoryPanel"),
  productCatalogPanel: document.querySelector("#productCatalogPanel"),
  productCatalogCount: document.querySelector("#productCatalogCount"),
  productCatalogForm: document.querySelector("#productCatalogForm"),
  productCatalogId: document.querySelector("#productCatalogId"),
  productCatalogName: document.querySelector("#productCatalogName"),
  productCatalogList: document.querySelector("#productCatalogList"),
  saveProductCatalog: document.querySelector("#saveProductCatalog"),
  cancelProductCatalogEdit: document.querySelector("#cancelProductCatalogEdit"),
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
  proxmoxBackupsSyncMeta: document.querySelector("#proxmoxBackupsSyncMeta"),
  refreshProxmoxBackupsButton: document.querySelector("#refreshProxmoxBackupsButton"),
  backupErrorsDialog: document.querySelector("#backupErrorsDialog"),
  backupErrorsList: document.querySelector("#backupErrorsList"),
  closeBackupErrorsDialog: document.querySelector("#closeBackupErrorsDialog"),
  proxmoxIssuesDialog: document.querySelector("#proxmoxIssuesDialog"),
  proxmoxIssuesTitle: document.querySelector("#proxmoxIssuesTitle"),
  proxmoxIssuesList: document.querySelector("#proxmoxIssuesList"),
  closeProxmoxIssuesDialog: document.querySelector("#closeProxmoxIssuesDialog"),
  offlineServersDialog: document.querySelector("#offlineServersDialog"),
  offlineServersList: document.querySelector("#offlineServersList"),
  closeOfflineServersDialog: document.querySelector("#closeOfflineServersDialog"),
  reportGroupSelect: document.querySelector("#reportGroupSelect"),
  reportPeriodSelect: document.querySelector("#reportPeriodSelect"),
  refreshReportButton: document.querySelector("#refreshReportButton"),
  reportContent: document.querySelector("#reportContent")
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
  integrations: "/integracoes",
  settings: "/configuracoes",
  history: "/historico",
  alerts: "/alertas",
  tickets: "/suporte",
  reports: "/relatorios"
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

function ticketSlaSettings() {
  const current = state.settings.ticketSla || {};
  return {
    urgentHours: Number(current.urgentHours || 2),
    normalHours: Number(current.normalHours || 24)
  };
}

function ticketAutomationSettings() {
  const current = state.settings.ticketAutomation || {};
  return {
    enabled: current.enabled === true,
    serverOfflineMinutes: Number(current.serverOfflineMinutes || 30),
    linkOfflineMinutes: Number(current.linkOfflineMinutes || 120),
    backupOverdueHours: Number(current.backupOverdueHours || 36)
  };
}

function expirationSettings() {
  return { expiryNotifyDays: expiryNotifyDays() };
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

const SECTION_KEYS = ["servers", "networks", "backups", "alerts", "history", "support"];

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
  document.querySelectorAll(".client-only").forEach((item) => {
    item.hidden = isAdmin();
  });
  SECTION_KEYS.forEach((section) => {
    const tab = document.querySelector(`.nav-tab[data-view="${section}"]`);
    if (tab) tab.hidden = section === "backups" ? true : !canSeeSection(section);
  });
  updateBackupNavigationVisibility();
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

function formatDateOnly(value) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : "-";
}

function formatDateShort(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
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

// Span com o numero que precisa "andar" a cada segundo. Marcado com
// data-since para que o tick periodico atualize so o textContent desse no
// especifico, sem recriar o elemento (o que apagaria o :hover do mouse e
// causava a piscada em toda a interface).
function liveDurationSpan(sinceIso) {
  if (!sinceIso) return "-";
  return `<span class="live-duration" data-since="${escapeHtml(sinceIso)}">${formatDurationSince(sinceIso)}</span>`;
}

function tickLiveDurations() {
  document.querySelectorAll(".live-duration[data-since]").forEach((el) => {
    const next = formatDurationSince(el.dataset.since);
    if (el.textContent !== next) el.textContent = next;
  });
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

function formatSignedBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes === 0) return "0 B";
  const sign = bytes > 0 ? "+" : "-";
  return `${sign}${formatBytes(Math.abs(bytes))}`;
}

function dateDayKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(day) {
  if (!day) return "";
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function datastoreHistoryFor(datastoreName, history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((entry) => String(entry.datastore || "") === String(datastoreName || ""))
    .filter((entry) => entry.day && Number.isFinite(Number(entry.usedBytes)))
    .sort((left, right) => String(left.day).localeCompare(String(right.day)));
}

function datastoreStorageInsights(datastore, history = [], fetchedAt = null) {
  const currentUsed = Number(datastore?.usedBytes) || 0;
  const today = dateDayKey(fetchedAt || Date.now());
  const entries = datastoreHistoryFor(datastore?.datastore, history);
  const previousEntry = [...entries].reverse().find((entry) => String(entry.day) < today);
  const delta = previousEntry ? currentUsed - Number(previousEntry.usedBytes || 0) : null;
  const recentDeltas = [];
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    recentDeltas.push({
      day: current.day,
      delta: Number(current.usedBytes || 0) - Number(previous.usedBytes || 0)
    });
  }
  return {
    previousEntry,
    delta,
    recentDeltas: recentDeltas.slice(-5)
  };
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

function formatBps(bps) {
  const value = Number(bps);
  if (!Number.isFinite(value) || value < 0) return "-";
  return formatNetworkSpeed(value / 1_000_000);
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
  const fingerprint = snapshotFingerprint(payload);
  const needsRender = fingerprint !== _lastSnapshotFingerprint;
  _lastSnapshotFingerprint = fingerprint;

  state.summary = payload.summary || {};
  state.servers = payload.servers || [];
  state.groups = payload.groups || [];
  state.productCatalog = payload.productCatalog || [];
  state.probes = payload.probes || [];
  state.networkDevices = payload.networkDevices || [];
  state.networkLinks = payload.networkLinks || [];
  state.networkEvents = payload.networkEvents || [];
  state.networkDiscoverySuggestions = payload.networkDiscoverySuggestions || [];
  state.users = payload.users || [];
  state.currentUser = payload.currentUser || state.currentUser;
  state.settings = payload.settings || {};
  applyBranding();
  state.alerts = payload.alerts || [];
  state.tickets = payload.tickets || [];
  restoreTicketFromLocation();
  state.events = payload.events || [];
  state.cloudBackup = payload.cloudBackup || null;
  state.proxmoxBackup = payload.proxmoxBackup || null;
  state.unifiNetwork = payload.unifiNetwork || null;
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
  if (state.selectedTicketId && !state.tickets.some((ticket) => ticket.id === state.selectedTicketId)) {
    state.selectedTicketId = null;
  }
  if (!needsRender) return;
  renderGroupOptions();
  renderProbeOptions();
  render();
}

function activeViewName() {
  return document.querySelector(".view.active")?.id?.replace(/View$/, "") || "dashboard";
}

function viewFromPath(pathname = window.location.pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/suporte/chamado") return "tickets";
  return ROUTE_VIEWS[normalized] || "dashboard";
}

function visibleNavTab(viewName) {
  return [...document.querySelectorAll(`.nav-tab[data-view="${viewName}"]`)].find((item) => !item.hidden) || null;
}

function routeForView(viewName) {
  return VIEW_ROUTES[viewName] || VIEW_ROUTES.dashboard;
}

function primaryNavView(viewName) {
  return viewName;
}

function setActiveView(viewName, options = {}) {
  const { push = true, replace = false } = options;
  const clientViews = new Set(["tickets", "servers", "networks", "backups", "settings"]);
  const nextView = !isAdmin() && !clientViews.has(viewName) ? "tickets" : viewName;
  const tab = visibleNavTab(nextView) || visibleNavTab(isAdmin() ? "dashboard" : "tickets");
  if (!tab) return;
  const view = document.querySelector(`#${tab.dataset.view}View`);
  if (!view) return;

  document.querySelectorAll(".nav-tab").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  const primaryTab = visibleNavTab(primaryNavView(tab.dataset.view)) || tab;
  primaryTab.classList.add("active");
  view.classList.add("active");
  updateTopbarContext();
  updateMetricsVisibility();
  if (tab.dataset.view === "alerts") {
    renderAlerts();
    refreshAlerts();
  }
  if (tab.dataset.view === "reports") {
    renderReports();
    void loadCompanyReport();
  }

  const nextRoute = routeForView(tab.dataset.view);
  if (push && (window.location.pathname !== nextRoute || window.location.hash)) {
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
  const viewName = viewFromPath();
  if (viewName === "tickets") {
    if (ticketRouteReference()) restoreTicketFromLocation();
    else {
      state.selectedTicketId = null;
      state.clientSupportMode = "list";
    }
  }
  setActiveView(viewName, { push: false, replace: options.replace ?? true });
  if (viewName === "tickets") {
    if (isAdmin()) renderTickets();
    else renderClientSupport();
  }
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
    integrations: ["Conexoes externas", "Integracoes"],
    settings: ["Identidade do sistema", "Configuracoes"],
    history: ["Auditoria operacional", "Historico de eventos"],
    alerts: ["Incidentes e recuperacoes", "Historico de alertas"],
    reports: ["Relatorios operacionais", "Saude por empresa"],
    tickets: isAdmin() ? ["Suporte", "Chamados e historico de atendimento"] : ["Atendimento", "Meus chamados"]
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

function syncFilterPanelControls(filters) {
  document.querySelectorAll(".segment").forEach((item) => {
    item.classList.toggle("active", item.dataset.status === filters.status);
  });
  if (els.searchInput) els.searchInput.value = filters.query;
  if (els.environmentFilter) els.environmentFilter.value = filters.environment;
  if (els.groupFilter) els.groupFilter.value = filters.groupId;
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

// Campos que mudam a cada checagem mesmo quando nada de visivel aconteceu
// (timestamps de "ultima vez que verificou"). Ignorados na comparacao para
// nao disparar um re-render completo da tela a cada ping de rotina — esses
// valores ja sao exibidos via liveDurationSpan/tickLiveDurations, que nao
// precisa de re-render.
const SERVER_VOLATILE_FIELDS = new Set([
  "lastCheckedAt",
  "probeLastSeenAt",
  "lastProbeSeenAt",
  "probeHostMetricsUpdatedAt",
  "probeFallbackCheckedAt",
  "updatedAt",
  "consecutiveFailures"
]);

function serverMeaningfullyChanged(previous, next) {
  if (!previous) return true;
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (SERVER_VOLATILE_FIELDS.has(key) || key === "probeHostMetrics") continue;
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) return true;
  }
  // Metricas de host (CPU/memoria/disco) so importam re-render se a tela de
  // servidores estiver mesmo visivel e for exatamente o servidor aberto —
  // state.selectedServerId pode ter um valor residual de outra navegacao.
  if (
    activeViewName() === "servers" &&
    state.selectedServerId === next.id &&
    JSON.stringify(previous.probeHostMetrics) !== JSON.stringify(next.probeHostMetrics)
  ) {
    return true;
  }
  return false;
}

function upsertServer(server) {
  if (server.deletedAt) {
    state.servers = state.servers.filter((item) => item.id !== server.id);
    if (state.selectedServerId === server.id) state.selectedServerId = sortedByAlpha(state.servers, serverSortLabel)[0]?.id || null;
    return true;
  }
  const index = state.servers.findIndex((item) => item.id === server.id);
  const previous = index >= 0 ? state.servers[index] : null;
  const changed = serverMeaningfullyChanged(previous, server);
  if (index >= 0) state.servers[index] = server;
  else state.servers.unshift(server);
  return changed;
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

  let needsRender = false;

  if (payload.server) {
    needsRender = upsertServer(payload.server) || needsRender;
  }

  if (payload.group) {
    upsertGroup(payload.group);
    needsRender = true;
  }

  if (payload.event) {
    state.events = [payload.event, ...state.events.filter((item) => item.id !== payload.event.id)].slice(0, 100);
    if ((payload.event.kind || "status_changed") === "server_offline") {
      showIncidentNotification(payload.event);
    }
    needsRender = true;
  }

  if (payload.alert) {
    state.alerts = [payload.alert, ...state.alerts.filter((item) => item.id !== payload.alert.id)].slice(0, 50);
    needsRender = true;
  }

  // "server_checked" de rotina (nada mudou) so atualiza o state.summary e
  // sai sem re-render — evita reconstruir a tela inteira a cada ping normal
  // de cada servidor, que era a causa da piscada ao passar o mouse.
  if (needsRender) scheduleRender();
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
    const source = els.filterMenu?.open ? state.filterDraft : state.filters;
    const current = source.groupId;
    els.groupFilter.innerHTML = `
      <option value="all">Todas empresas</option>
      ${canSeeUngrouped() ? `<option value="none">Sem empresa</option>` : ""}
      ${groupOptions}
    `;
    const resolved = [...els.groupFilter.options].some((option) => option.value === current) ? current : "all";
    els.groupFilter.value = resolved;
    source.groupId = resolved;
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
  renderTicketGroupOptions(groupOptions);
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

function renderTicketGroupOptions(groupOptions = "") {
  const resolvedOptions =
    groupOptions || sortedByAlpha(state.groups, groupSortLabel).map((group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`).join("");
  if (els.ticketGroupFilter) {
    const current = els.ticketGroupFilter.value || state.ticketFilters.groupId;
    els.ticketGroupFilter.innerHTML = `
      <option value="all">Todas empresas</option>
      ${resolvedOptions}
    `;
    els.ticketGroupFilter.value = [...els.ticketGroupFilter.options].some((option) => option.value === current) ? current : "all";
    state.ticketFilters.groupId = els.ticketGroupFilter.value;
  }
  if (els.ticketGroupId) {
    const current = els.ticketGroupId.value;
    els.ticketGroupId.innerHTML = `
      <option value="">Selecione...</option>
      ${resolvedOptions}
    `;
    if ([...els.ticketGroupId.options].some((option) => option.value === current)) {
      els.ticketGroupId.value = current;
    }
  }
  if (els.ticketAssigneeFilter) {
    const current = els.ticketAssigneeFilter.value || state.ticketFilters.assignee;
    const admins = sortedByAlpha(state.users.filter((user) => user.role === "admin"), (user) => user.name);
    els.ticketAssigneeFilter.innerHTML = `
      <option value="all">Todos responsaveis</option>
      <option value="unassigned">Sem responsavel</option>
      ${admins.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`).join("")}
    `;
    els.ticketAssigneeFilter.value = [...els.ticketAssigneeFilter.options].some((option) => option.value === current) ? current : "all";
    state.ticketFilters.assignee = els.ticketAssigneeFilter.value;
  }
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
  renderNetworkProbeOptions();
  if (!els.serverProbeId) return;
  const current = els.serverProbeId.value;
  // Servidores e links por ping usam probes de host — probes de rede (SNMP)
  // ficam de fora dessas listas, tem um select proprio (renderNetworkProbeOptions).
  const hostProbes = state.probes.filter((probe) => (probe.probeType || "host") !== "network");
  if (!hostProbes.length) {
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
  const probes = sortedByAlpha(hostProbes, probeSortLabel);
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

function renderNetworkProbeOptions() {
  if (!els.networkDeviceNetworkProbe) return;
  const previous = els.networkDeviceNetworkProbe.value;
  const networkProbes = sortedByAlpha(
    state.probes.filter((probe) => (probe.probeType || "host") === "network"),
    probeSortLabel
  );
  els.networkDeviceNetworkProbe.innerHTML = `
    <option value="">Nenhum</option>
    ${networkProbes
      .map((probe) => {
        const address = probe.primaryAddress || probe.addresses?.[0] || probe.lastAddress || "";
        const label = `${probe.name || probe.id} (${address || probe.id})`;
        return `<option value="${escapeHtml(probe.id)}">${escapeHtml(label)}</option>`;
      })
      .join("")}
  `;
  els.networkDeviceNetworkProbe.value = networkProbes.some((probe) => probe.id === previous) ? previous : "";
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
  const scopedLinks = (state.networkLinks || []).filter(
    (link) => link.isActive !== false && link.featured !== false && groupIdMatches(state.filters.groupId, link.groupId)
  );
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

function updateDashboardModeControls() {
  if (!els.dashboardModeToggle) return;
  els.dashboardModeToggle.querySelectorAll("[data-dashboard-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.dashboardMode === state.dashboardMode);
    button.setAttribute("aria-pressed", button.dataset.dashboardMode === state.dashboardMode ? "true" : "false");
  });
}

function sumBackupStatus(statuses) {
  return statuses.reduce(
    (acc, status = {}) => {
      acc.success += Number(status.success || 0);
      acc.warning += Number(status.warning || 0);
      acc.error += Number(status.error || 0);
      acc.nomon += Number(status.nomon || 0);
      acc.info += Number(status.info || 0);
      acc.total += Number(status.total || 0);
      return acc;
    },
    { success: 0, warning: 0, error: 0, nomon: 0, info: 0, total: 0 }
  );
}

function dashboardBackupStatsForGroup(groupId) {
  const cloudClients = Array.isArray(state.cloudBackup?.clients) ? state.cloudBackup.clients : [];
  const cloud = sumBackupStatus(
    cloudClients
      .filter((client) => String(client.groupId || "") === String(groupId || ""))
      .map((client) => client.status || {})
  );
  const pbsItems = Array.isArray(state.proxmoxBackup?.items) ? state.proxmoxBackup.items : [];
  const pbs = pbsItems
    .filter((item) => String(item.groupId || "") === String(groupId || ""))
    .reduce(
      (acc, item) => {
        // Atencao (perto do limite de 26h) ainda conta como sucesso monitorado
        // aqui — so falha de verificacao ou atraso real (>26h) tira do sucesso.
        if (item.status === "success" || item.status === "warning") acc.success += 1;
        if (item.status === "warning") acc.warning += 1;
        else if (item.status === "error" || item.status === "late" || item.status === "stale") acc.error += 1;
        acc.total += 1;
        return acc;
      },
      { success: 0, warning: 0, error: 0, total: 0 }
    );
  return {
    success: cloud.success + pbs.success,
    warning: cloud.warning + pbs.warning,
    error: cloud.error + pbs.error,
    monitored: backupClientMonitoredTotal(cloud) + pbs.total,
    unmonitored: backupClientUnmonitoredTotal(cloud)
  };
}

function dashboardUnifiStatsForGroup(groupId) {
  const sites = Array.isArray(state.unifiNetwork?.sites) ? state.unifiNetwork.sites : [];
  return sites
    .filter((site) => String(site.groupId || "") === String(groupId || ""))
    .reduce(
      (acc, site) => {
        acc.online += Number(site.counts?.online || 0);
        acc.offline += Number(site.counts?.offline || 0);
        acc.attention += Number(site.counts?.attention || 0) + Number(site.counts?.unknown || 0);
        acc.total += Number(site.deviceCount || 0);
        return acc;
      },
      { online: 0, offline: 0, attention: 0, total: 0 }
    );
}

function dashboardTimeValue(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

// Janela minima entre quedas do mesmo servidor para contarem como alertas
// separados. Evita que um servidor oscilando gere dezenas de "alertas" no
// contador de 24h — soh conta de novo apos passar esse intervalo sem alerta.
const ALERTS_24H_DEDUPE_WINDOW_MS = 10 * 60_000;

function dashboardAlerts24hForGroup(groupId) {
  const limit = Date.now() - 24 * 60 * 60 * 1000;
  const relevant = state.alerts.filter((alert) => {
    const createdAt = dashboardTimeValue(alert.createdAt || alert.timestamp || alert.updatedAt);
    return createdAt >= limit && alertGroupId(alert) === groupId;
  });
  const timesByServer = new Map();
  for (const alert of relevant) {
    const createdAt = dashboardTimeValue(alert.createdAt || alert.timestamp || alert.updatedAt);
    const list = timesByServer.get(alert.serverId) || [];
    list.push(createdAt);
    timesByServer.set(alert.serverId, list);
  }
  let total = 0;
  for (const times of timesByServer.values()) {
    times.sort((left, right) => left - right);
    let lastCounted = -Infinity;
    for (const time of times) {
      if (time - lastCounted >= ALERTS_24H_DEDUPE_WINDOW_MS) {
        total += 1;
        lastCounted = time;
      }
    }
  }
  return total;
}

function latestDashboardActivityForGroup(groupId, servers, links) {
  const serverTimes = servers.flatMap((server) => [
    dashboardTimeValue(server.lastCheckedAt),
    dashboardTimeValue(server.statusChangedAt),
    dashboardTimeValue(server.lastProbeSeenAt),
    dashboardTimeValue(server.probeLastSeenAt)
  ]);
  const linkTimes = links.flatMap((link) => [
    dashboardTimeValue(link.lastCheckedAt),
    dashboardTimeValue(link.updatedAt),
    dashboardTimeValue(link.statusChangedAt)
  ]);
  const backupTimes = [
    ...(Array.isArray(state.cloudBackup?.clients)
      ? state.cloudBackup.clients
          .filter((client) => String(client.groupId || "") === String(groupId || ""))
          .flatMap((client) => (client.backupSets || []).map((set) => dashboardTimeValue(set.lastBackupJobDate || set.lastSuccessAt)))
      : []),
    ...(Array.isArray(state.proxmoxBackup?.items)
      ? state.proxmoxBackup.items
          .filter((item) => String(item.groupId || "") === String(groupId || ""))
          .map((item) => dashboardTimeValue(item.lastSnapshotAt))
      : [])
  ];
  return Math.max(0, ...serverTimes, ...linkTimes, ...backupTimes);
}

function dashboardCompanyRows() {
  const groups = sortedByAlpha(state.groups, groupSortLabel).map((group) => ({
    id: group.id,
    name: group.name,
    synthetic: false
  }));

  return groups
    .map((group) => {
      const groupId = group.id;
      const servers = state.servers.filter((server) => server.groupId === group.id);
      const activeServers = servers.filter((server) => server.isActive);
      const serverCounts = statusCounts(activeServers);
      const links = (state.networkLinks || []).filter(
        (link) => link.isActive !== false && link.featured !== false && link.groupId === group.id
      );
      const linkCounts = links.reduce(
        (acc, link) => {
          const status = link.displayStatus || link.currentStatus || "unknown";
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        },
        { online: 0, degraded: 0, offline: 0, probe_unreachable: 0, unknown: 0, paused: 0 }
      );
      const unifi = dashboardUnifiStatsForGroup(groupId);
      const backups = dashboardBackupStatsForGroup(groupId);
      const openAlerts = state.alerts.filter((alert) => !alert.read && alertGroupId(alert) === group.id).length;
      const alerts24h = dashboardAlerts24hForGroup(group.id);
      const critical =
        Number(serverCounts.offline || 0) +
        Number(linkCounts.offline || 0) +
        Number(linkCounts.probe_unreachable || 0) +
        Number(backups.error || 0) +
        Number(unifi.offline || 0) +
        Number(openAlerts || 0);
      // Avisos de backup contam como sucesso nesta dashboard (nao entram em "atencao").
      const attention =
        Number(serverCounts.probe_stale || 0) +
        Number(serverCounts.dependency_down || 0) +
        Number(linkCounts.degraded || 0) +
        Number(unifi.attention || 0);
      return {
        ...group,
        servers,
        activeServers,
        serverCounts,
        links,
        linkCounts,
        unifi,
        backups,
        openAlerts,
        alerts24h,
        critical,
        attention,
        latestActivity: latestDashboardActivityForGroup(groupId, servers, links)
      };
    })
    // So aparece se houver servidor, link ou backup efetivamente monitorado
    // (backup marcado como "sem monitor" sozinho nao basta para listar a empresa).
    .filter((row) => row.activeServers.length || row.links.length || row.backups.monitored)
    .sort((left, right) => compareAlpha(left.name, right.name));
}

// Avisos de backup contam como sucesso nesta dashboard (badge, ordenacao e tom da linha).
function dashboardBackupBadge(backups) {
  if (!backups.monitored && !backups.unmonitored) return `<span class="noc-muted">-</span>`;
  if (backups.error) return `<span class="noc-status danger">Falha</span>`;
  if (!backups.monitored && backups.unmonitored) return `<span class="noc-status muted">Sem monitor</span>`;
  return `<span class="noc-status success">OK</span>`;
}

function dashboardBackupSortRank(backups) {
  if (backups.error) return 3;
  if (!backups.monitored && backups.unmonitored) return 1;
  if (!backups.monitored && !backups.unmonitored) return -1;
  return 0;
}

const NOC_SORT_COLUMNS = {
  name: (row) => row.name || "",
  servers: (row) => Number(row.serverCounts.offline || 0),
  links: (row) => Number((row.linkCounts.offline || 0) + (row.linkCounts.degraded || 0) + (row.linkCounts.probe_unreachable || 0)),
  unifi: (row) => Number(row.unifi.offline || 0),
  backups: (row) => dashboardBackupSortRank(row.backups),
  alerts24h: (row) => Number(row.alerts24h || 0)
};

function sortDashboardRows(rows) {
  const column = _nocSort.column;
  if (!column || !NOC_SORT_COLUMNS[column]) return rows;
  const getValue = NOC_SORT_COLUMNS[column];
  const direction = _nocSort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    const compared =
      typeof leftValue === "string" ? compareAlpha(leftValue, rightValue) : leftValue - rightValue;
    return compared * direction;
  });
}

function nocSortIndicator(column) {
  if (_nocSort.column !== column) return "";
  return _nocSort.direction === "desc" ? " ▼" : " ▲";
}

function renderNocDashboard() {
  if (!els.simpleDashboardContent) return;
  const scrollPositions = captureSimpleDashboardScroll();
  const rows = dashboardCompanyRows();
  const activeServers = state.servers.filter((server) => server.isActive);
  const serverCounts = statusCounts(activeServers);
  const links = (state.networkLinks || []).filter((link) => link.isActive !== false && link.featured !== false);
  const linkOnline = links.filter((link) => (link.displayStatus || link.currentStatus) === "online").length;
  const linkProblem = links.filter((link) => ["offline", "degraded", "probe_unreachable"].includes(link.displayStatus || link.currentStatus)).length;
  const backupTotals = rows.reduce(
    (acc, row) => {
      acc.success += row.backups.success;
      acc.monitored += row.backups.monitored;
      acc.error += row.backups.error;
      return acc;
    },
    { success: 0, monitored: 0, error: 0 }
  );
  const criticalRows = rows.filter((row) => row.critical);
  if (els.dashboardScopeTitle) els.dashboardScopeTitle.textContent = "Visao Geral - Todos os Clientes";
  if (els.dashboardScopeMeta) {
    els.dashboardScopeMeta.textContent = `${rows.length} empresas acompanhadas, ${criticalRows.length} com prioridade operacional.`;
  }

  els.simpleDashboardContent.innerHTML = `
    <section class="noc-dashboard" aria-label="Visao executiva por cliente">
      <div class="noc-kpi-grid" aria-label="Indicadores principais">
        <article><span>Empresas</span><strong>${rows.length}</strong><small>${criticalRows.length} com atencao</small></article>
        <article><span>Servidores</span><strong><b>${serverCounts.online}</b>/${activeServers.length}</strong><small>online agora</small></article>
        <article><span>Links</span><strong><b>${linkOnline}</b>/${links.length}</strong><small>${linkProblem} com ocorrencia</small></article>
        <article class="${criticalRows.length ? "danger" : "success"}"><span>Criticos</span><strong>${criticalRows.length}</strong><small>clientes afetados</small></article>
        <article><span>Backups</span><strong><b>${backupTotals.success}</b>/${backupTotals.monitored || 0}</strong><small>sucesso monitorado</small></article>
      </div>
      <section class="noc-table-panel">
        <div class="noc-table-header">
          <span class="noc-sortable ${_nocSort.column === "name" ? "active" : ""}" data-noc-sort="name">Empresa${nocSortIndicator("name")}</span>
          <span class="noc-sortable ${_nocSort.column === "servers" ? "active" : ""}" data-noc-sort="servers">Servidores${nocSortIndicator("servers")}</span>
          <span class="noc-sortable ${_nocSort.column === "links" ? "active" : ""}" data-noc-sort="links">Links${nocSortIndicator("links")}</span>
          <span class="noc-sortable ${_nocSort.column === "unifi" ? "active" : ""}" data-noc-sort="unifi">UniFi${nocSortIndicator("unifi")}</span>
          <span class="noc-sortable ${_nocSort.column === "backups" ? "active" : ""}" data-noc-sort="backups">Backups${nocSortIndicator("backups")}</span>
          <span class="noc-sortable ${_nocSort.column === "alerts24h" ? "active" : ""}" data-noc-sort="alerts24h">Alertas 24h${nocSortIndicator("alerts24h")}</span>
        </div>
        <div class="noc-table-body simple-scroll-list">
          ${
            rows.length
              ? sortDashboardRows(rows)
                  .map((row) => {
                    const tone = row.critical ? "danger" : row.attention ? "warning" : "success";
                    const serverMeta = row.activeServers.length ? `${row.serverCounts.online}/${row.activeServers.length}` : "-";
                    const linkMeta = row.links.length ? `${row.linkCounts.online || 0}/${row.links.length}` : "-";
                    const unifiMeta = row.unifi.total ? `${row.unifi.online}/${row.unifi.total}` : "-";
                    return `
                      <button class="noc-company-row ${tone}" type="button" data-dashboard-company-row="${escapeHtml(row.id)}">
                        <span class="noc-company-name">
                          <i class="noc-dot ${tone}" aria-hidden="true"></i>
                          <strong>${escapeHtml(row.name)}</strong>
                          <small>${row.openAlerts ? `${row.openAlerts} alerta${row.openAlerts === 1 ? "" : "s"}` : `${row.activeServers.length} servidor${row.activeServers.length === 1 ? "" : "es"}`}</small>
                        </span>
                        <span class="${row.serverCounts.offline ? "noc-number danger" : "noc-number"}">${serverMeta}</span>
                        <span class="${row.linkCounts.offline || row.linkCounts.degraded || row.linkCounts.probe_unreachable ? "noc-number warning" : "noc-number"}">${linkMeta}</span>
                        <span class="${row.unifi.offline ? "noc-number danger" : row.unifi.attention ? "noc-number warning" : "noc-number"}">${unifiMeta}</span>
                        <span>${dashboardBackupBadge(row.backups)}</span>
                        <span class="${row.alerts24h ? "noc-number danger" : "noc-number"}">${row.alerts24h}</span>
                      </button>
                    `;
                  })
                  .join("")
              : `<div class="simple-empty">Nenhuma empresa com ativos monitorados.</div>`
          }
        </div>
      </section>
    </section>
  `;
  restoreSimpleDashboardScroll(scrollPositions);
}

function renderSimpleDashboard() {
  updateDashboardModeControls();
  if (state.dashboardMode === "simple") {
    renderNocDashboard();
    return;
  }
  const previousGroupId = state.filters.groupId;
  state.filters.groupId = "all";
  if (els.dashboardScopeTitle) els.dashboardScopeTitle.textContent = "Dashboard completa";
  if (els.dashboardScopeMeta) els.dashboardScopeMeta.textContent = "Graficos e listas operacionais detalhadas de todos os clientes.";
  renderCompleteDashboard();
  state.filters.groupId = previousGroupId;
}

function renderCompleteDashboard() {
  if (!els.simpleDashboardContent) return;
  const scrollPositions = captureSimpleDashboardScroll();
  const canServers = canSeeSection("servers");
  const canNetworks = canSeeSection("networks");
  const canBackups = canSeeSection("backups") && backupProviderConfigured("msp");
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
  const networkLinks = (state.networkLinks || []).filter(
    (link) => link.isActive !== false && link.featured !== false && groupIdMatches(state.filters.groupId, link.groupId)
  );
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
      ? `<span>Probe sem contato ha ${liveDurationSpan(server.probeLastSeenAt || server.lastProbeSeenAt)}</span>`
      : server.isActive && server.currentStatus === "offline"
      ? `<span>Offline ha ${liveDurationSpan(server.statusChangedAt)}</span>`
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
  if (groupId === "none") {
    const servers = state.servers.filter((server) => !server.groupId || !knownGroupIds.has(server.groupId));
    return {
      id: "none",
      name: "Sem empresa",
      logoDataUrl: "",
      servers: sortedByAlpha(servers, serverSortLabel)
    };
  }
  if (!knownGroupIds.has(groupId)) return null;
  const servers = state.servers.filter((server) => server.groupId === groupId);
  return {
    id: groupId,
    name: groupLabel(groupId),
    logoDataUrl: groupLogo(groupId),
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
    (state.networkLinks || []).filter(
      (link) => link.isActive !== false && link.featured !== false && groupIdMatches(group.id, link.groupId)
    ),
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
  const groupBackupClients = canSeeSection("backups") && backupProviderConfigured("msp")
    ? (state.cloudBackup?.clients || []).filter((client) => String(client.groupId || "") === String(group.id))
    : [];
  const groupBackupStatus = groupBackupClients.reduce(
    (acc, client) => {
      acc.info += Number(client.status?.info) || 0;
      acc.success += Number(client.status?.success) || 0;
      acc.warning += Number(client.status?.warning) || 0;
      acc.error += Number(client.status?.error) || 0;
      acc.nomon += Number(client.status?.nomon) || 0;
      return acc;
    },
    { info: 0, success: 0, warning: 0, error: 0, nomon: 0 }
  );
  const groupBackupMonitored = backupClientMonitoredTotal(groupBackupStatus);
  const groupBackupUnmonitored = backupClientUnmonitoredTotal(groupBackupStatus);
  const groupBackupHealth = backupClientHealthPct(groupBackupStatus);
  const groupBackupClient = groupBackupClients[0] || null;
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

    <section class="company-insight-grid server-company-insight-grid" aria-label="Visao visual da empresa">
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

      ${
        canSeeSection("backups") && backupProviderConfigured("msp")
          ? `<article class="company-insight-card company-backup-widget">
              <div class="panel-title compact-title">
                <h3>Backups</h3>
                <span>${groupBackupMonitored} monitorado${groupBackupMonitored === 1 ? "" : "s"}</span>
              </div>
              ${
                state.cloudBackup?.configured && groupBackupClient
                  ? `<div class="company-health-meter">
                      <strong>${groupBackupHealth}%</strong>
                      <span><i style="width:${Math.max(0, Math.min(100, groupBackupHealth))}%"></i></span>
                      <small>${groupBackupStatus.success} sucesso · ${groupBackupStatus.error} erro</small>
                    </div>
                    <div class="simple-network-summary company-backup-summary">
                      <article><strong>${groupBackupStatus.success}</strong><span>sucesso</span></article>
                      <article class="${groupBackupStatus.error ? "danger" : ""}"><strong>${groupBackupStatus.error}</strong><span>erro</span></article>
                      <article class="${groupBackupUnmonitored ? "warning" : ""}"><strong>${groupBackupUnmonitored}</strong><span>sem monitor</span></article>
                    </div>
                    <div class="company-mini-list">
                      <button type="button" data-company-backup-client-id="${escapeHtml(String(groupBackupClient.id))}">
                        <span>Abrir detalhes</span>
                        <strong class="status-badge ${groupBackupStatus.error ? "offline" : groupBackupUnmonitored ? "probe_stale" : "online"}">
                          ${groupBackupStatus.error ? "ATENCAO" : groupBackupUnmonitored ? "VERIFICAR" : "OK"}
                        </strong>
                      </button>
                    </div>`
                  : `<div class="empty-list compact">Nenhum cliente de backup vinculado a esta empresa.</div>`
              }
            </article>`
          : ""
      }
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
      ? `<div class="detail-stat"><span>Probe sem contato ha</span><strong>${liveDurationSpan(server.probeLastSeenAt || server.lastProbeSeenAt)}</strong></div>`
      : visibleStatus === "offline"
      ? `<div class="detail-stat"><span>Indisponivel ha</span><strong>${liveDurationSpan(server.statusChangedAt)}</strong></div>`
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
  if (server.checkSource === "probe" && server.probeId) loadPeakCpuHourWarning(server.probeId);
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
    ? `Offline ha ${liveDurationSpan(server.statusChangedAt)}`
    : visibleStatus === "probe_stale"
    ? `Probe sem contato ha ${liveDurationSpan(server.probeLastSeenAt || server.lastProbeSeenAt)}`
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
        ${server.checkSource === "probe" && server.probeId ? `
          <div class="metrics-history-section" data-history-probe-id="${escapeHtml(server.probeId)}">
            <button class="metrics-history-toggle ghost-button compact" type="button" data-action="toggle-metrics-history">
              Historico de metricas
            </button>
            <div class="metrics-history-body" hidden></div>
          </div>
          ${renderServerWarningsSection(server)}
        ` : ""}
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
  restoreMetricsHistory();
  if (server.checkSource === "probe" && server.probeId) loadPeakCpuHourWarning(server.probeId);
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
  const duration = event.durationMs
    ? `<small class="timeline-duration">Perdeu contato as ${formatDate(event.outageStartedAt)} · retomou as ${formatDate(
        event.createdAt
      )} · <strong>${formatDurationMs(event.durationMs)} sem contato</strong></small>`
    : "";
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

// Janela usada para empilhar eventos tecnicos consecutivos do mesmo servidor
// (ex.: servidor oscilando entre "sem contato" e "online" varias vezes
// seguidas). Enquanto o intervalo entre um evento e o proximo for menor que
// isso, eles entram no mesmo grupo em vez de poluir a timeline individualmente.
const TIMELINE_GROUP_WINDOW_MS = 10 * 60_000;

// events ja vem ordenado do mais novo para o mais antigo.
function groupTimelineEvents(events) {
  const groups = [];
  for (const event of events) {
    const category = event.category || "technical";
    const last = groups[groups.length - 1];
    const canChain =
      last &&
      category === "technical" &&
      last.category === "technical" &&
      last.serverId === event.serverId &&
      eventTimestamp(last.events[last.events.length - 1]) - eventTimestamp(event) <= TIMELINE_GROUP_WINDOW_MS;
    if (canChain) {
      last.events.push(event);
      continue;
    }
    groups.push({ serverId: event.serverId, serverName: event.serverName, category, events: [event] });
  }
  return groups;
}

function renderTimelineGroup(group) {
  if (group.events.length === 1) return renderTimelineItem(group.events[0]);
  const events = group.events;
  const newest = events[0];
  const oldest = events[events.length - 1];
  const offlineCount = events.filter(isFailureEvent).length;
  const recoveredCount = events.filter(isRecoveryEvent).length;
  const groupId = `tl-group-${newest.id}`;
  return `
    <article class="timeline-item technical timeline-group">
      <span class="timeline-marker ${newest.currentStatus || newest.kind}"></span>
      <div>
        <strong>${escapeHtml(group.serverName || "Servidor")} · Oscilando</strong>
        <div class="detail-meta">${events.length} eventos entre ${formatDate(oldest.createdAt)} e ${formatDate(newest.createdAt)}</div>
        <small class="timeline-group-summary">${offlineCount} ${offlineCount === 1 ? "queda" : "quedas"} · ${recoveredCount} ${recoveredCount === 1 ? "recuperacao" : "recuperacoes"} · ultimo evento: ${escapeHtml(newest.message || eventKindLabel(newest))}</small>
        <button class="ghost-button compact timeline-group-toggle" type="button" data-timeline-group-toggle="${escapeHtml(groupId)}">Ver ${events.length} eventos</button>
        <div class="timeline-group-body" id="${escapeHtml(groupId)}" hidden>
          ${events.map(renderTimelineItem).join("")}
        </div>
      </div>
      <small>${formatDate(newest.createdAt)}</small>
    </article>
  `;
}

function renderTimeline() {
  renderHistoryFilters();
  const events = filteredEvents();
  els.eventCount.textContent = `${events.length} ${events.length === 1 ? "evento" : "eventos"}`;
  const groups = groupTimelineEvents(events);
  els.timeline.innerHTML = groups.length
    ? groups.map(renderTimelineGroup).join("")
    : `<div class="empty-list">A timeline aparecera quando um status mudar.</div>`;
}

function alertStatusTone(alert) {
  if (alert.type === "down") return "offline";
  if (alert.type === "contract_expiring") return "warning";
  return "online";
}

function alertStatusLabel(alert) {
  if (alert.type === "down") return "Offline";
  if (alert.type === "contract_expiring") return "Contrato";
  return "Recuperado";
}

function renderAlerts() {
  const alerts = filteredAlerts();
  if (els.alertCount) {
    const openCount = alerts.filter((alert) => !alert.read && alert.type === "down").length;
    els.alertCount.textContent = `${alerts.length} ${alerts.length === 1 ? "alerta" : "alertas"} · ${openCount} ${openCount === 1 ? "aberto" : "abertos"}`;
  }
  els.alertsList.innerHTML = alerts.length
    ? alerts
        .map((alert) => {
          const server = serverById(alert.serverId);
          const stillDown = alert.type === "down" && server && server.currentStatus !== "online";
          const durationLine =
            alert.type === "recovery" && alert.durationMs
              ? `<small class="alert-duration">Ficou <strong>${formatDurationMs(alert.durationMs)}</strong> sem contato${
                  alert.outageStartedAt ? ` (desde ${formatDate(alert.outageStartedAt)})` : ""
                }</small>`
              : stillDown
              ? `<small class="alert-duration">Offline ha <strong>${liveDurationSpan(alert.createdAt)}</strong></small>`
              : "";
          return `
            <article class="alert-card ${alert.severity || "info"} ${alert.type !== "down" ? "alert-recovered" : ""} ${alert.read ? "read" : "unread"}">
              <div>
                <strong>${escapeHtml(alertServerName(alert))}</strong>
                <div>${escapeHtml(alert.message)}</div>
                <small>${formatDate(alert.createdAt)} · ${alert.read ? "reconhecido" : "novo"} · ${severityLabel(alert.severity)}</small>
                ${durationLine}
                ${
                  alert.acknowledgedAt
                    ? `<small>Reconhecido por ${escapeHtml(alert.acknowledgedBy || "-")} em ${formatDate(alert.acknowledgedAt)}${alert.acknowledgmentNote ? ` · ${escapeHtml(alert.acknowledgmentNote)}` : ""}</small>`
                    : ""
                }
              </div>
              <div class="alert-actions">
                <span class="status-badge ${alertStatusTone(alert)}">
                  ${alertStatusLabel(alert)}
                </span>
                ${alert.read ? "" : `<button class="ghost-button compact" type="button" data-alert-action="ack" data-alert-id="${alert.id}">Reconhecer</button>`}
              </div>
            </article>
          `;
        })
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
  return alert.serverName || serverById(alert.serverId)?.name || alert.groupName || "Alerta";
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
              <span class="status-dot ${alertStatusTone(alert)}"></span>
              <span class="notification-item-body">
                <strong>${escapeHtml(alertServerName(alert))}</strong>
                <small>${escapeHtml(alert.message || severityLabel(alert.severity))}</small>
                <em>${escapeHtml(alertCompanyName(alert))} · ${formatDate(alert.createdAt)}</em>
              </span>
              <span class="status-badge ${alertStatusTone(alert)}">${alert.read ? "lido" : "novo"}</span>
            </button>
          `
        )
        .join("")
    : `<div class="empty-list compact-empty">Nenhum alerta recente.</div>`;
}

function ticketStatusTone(status) {
  if (status === "in_progress" || status === "waiting_third_party") return "dependency_down";
  if (status === "waiting_customer") return "degraded";
  if (status === "resolved") return "online";
  return "paused";
}

function ticketStatusLabel(status) {
  return (
    {
      open: "Aberto",
      in_progress: "Em andamento",
      waiting_customer: "Aguardando cliente",
      waiting_third_party: "Aguardando terceiro",
      resolved: "Resolvido",
      closed: "Fechado"
    }[status] || "Aberto"
  );
}

function ticketPriorityLabel(priority) {
  return { low: "Baixa", normal: "Normal", high: "Alta", critical: "Urgente" }[priority] || "Normal";
}

function ticketCategoryLabel(category) {
  return { incident: "Incidente", request: "Solicitacao", access: "Acesso", backup: "Backup", network: "Rede", server: "Servidor", other: "Outro" }[category] || "Incidente";
}

function ticketImpactLabel(impact) {
  return { individual: "Individual", department: "Departamento", company: "Empresa", critical: "Critico" }[impact] || "Individual";
}

function ticketSlaState(ticket) {
  const now = Date.now();
  const createdAt = new Date(ticket.createdAt || 0).getTime();
  const due = ticket.resolutionDueAt ? new Date(ticket.resolutionDueAt).getTime() : 0;
  if (!due) return { label: "Sem SLA", tone: "muted", progress: 0, detail: "Prioridade baixa", hasSla: false };
  const total = Math.max(1, due - (Number.isFinite(createdAt) && createdAt > 0 ? createdAt : due));
  const elapsed = Math.max(0, now - (Number.isFinite(createdAt) && createdAt > 0 ? createdAt : now));
  const progress = Math.min(100, Math.round((elapsed / total) * 100));
  if (["resolved", "closed"].includes(ticket.status)) {
    return { label: "Concluido", tone: "success", progress: 100, detail: "Resolvido dentro do fluxo", hasSla: true };
  }
  const remaining = due - now;
  if (remaining < 0) return { label: "SLA vencido", tone: "danger", progress: 100, detail: `${formatTicketDuration(-remaining)} vencido`, hasSla: true };
  if (remaining < total * 0.25) return { label: "SLA proximo", tone: "warning", progress, detail: `${formatTicketDuration(remaining)} restante`, hasSla: true };
  return { label: "Dentro do SLA", tone: "success", progress, detail: `${formatTicketDuration(remaining)} restante`, hasSla: true };
}

function ticketUpdateTitle(update) {
  if (update.kind === "status_change") {
    return `Status alterado: ${ticketStatusLabel(update.fromStatus)} -> ${ticketStatusLabel(update.toStatus)}`;
  }
  return update.kind === "resolution" ? "Resolucao" : "Comentario";
}

function filteredTickets() {
  return (state.tickets || []).filter((ticket) => {
    const groupOk = state.ticketFilters.groupId === "all" || ticket.groupId === state.ticketFilters.groupId;
    const statusOk = state.ticketFilters.status === "all" || ticket.status === state.ticketFilters.status;
    const priorityOk = state.ticketFilters.priority === "all" || ticket.priority === state.ticketFilters.priority;
    const assigneeOk = state.ticketFilters.assignee === "all" || (state.ticketFilters.assignee === "unassigned" ? !ticket.assignedTo : ticket.assignedTo === state.ticketFilters.assignee);
    const query = state.ticketFilters.query.trim().toLocaleLowerCase("pt-BR");
    const searchOk = !query || [ticket.code, ticket.title, ticket.groupName, ticket.requesterName, ticket.assignedToName, ticket.assetName]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(query));
    const quick = state.ticketFilters.quick;
    const quickOk = quick === "all"
      || (quick === "attention" && !["resolved", "closed"].includes(ticket.status))
      || (quick === "overdue" && ticketSlaState(ticket).tone === "danger")
      || (quick === "unassigned" && !ticket.assignedTo);
    return groupOk && statusOk && priorityOk && assigneeOk && searchOk && quickOk;
  });
}

function selectedTicket() {
  return (state.tickets || []).find((ticket) => ticket.id === state.selectedTicketId) || null;
}

function ticketReference(ticket) {
  if (ticket?.reference) return String(ticket.reference);
  const explicitNumber = Number(ticket?.ticketNumber);
  if (Number.isInteger(explicitNumber) && explicitNumber > 0) return `#${String(explicitNumber).padStart(4, "0")}`;
  const match = String(ticket?.code || "").match(/(\d+)\s*$/);
  return match ? `#${String(Number(match[1])).padStart(4, "0")}` : String(ticket?.code || "Chamado");
}

function ticketRouteReference() {
  const normalized = window.location.pathname.length > 1 ? window.location.pathname.replace(/\/+$/, "") : window.location.pathname;
  if (normalized !== "/suporte/chamado") return "";
  return decodeURIComponent(window.location.hash || "").replace(/^#/, "").trim();
}

function ticketRoute(ticket) {
  return `/suporte/chamado${ticketReference(ticket)}`;
}

function ticketMatchesReference(ticket, reference) {
  const normalized = String(reference || "").replace(/^#/, "").replace(/^0+/, "") || "0";
  const number = String(ticket.ticketNumber || "").replace(/^0+/, "") || "0";
  return number === normalized || ticketReference(ticket).replace(/^#/, "").replace(/^0+/, "") === normalized;
}

function restoreTicketFromLocation() {
  const reference = ticketRouteReference();
  if (!reference) return;
  const ticket = (state.tickets || []).find((item) => ticketMatchesReference(item, reference));
  if (!ticket) return;
  state.selectedTicketId = ticket.id;
  state.clientSupportMode = "detail";
}

function openTicketQueue({ push = true } = {}) {
  state.selectedTicketId = null;
  clearTicketUpdateDraft();
  state.clientSupportMode = "list";
  if (push && (window.location.pathname !== "/suporte" || window.location.hash)) {
    window.history.pushState({}, "", "/suporte");
  }
  if (isAdmin()) renderTickets();
  else renderClientSupport();
}

function selectTicket(ticketId, { push = true } = {}) {
  if (state.selectedTicketId !== ticketId) clearTicketUpdateDraft();
  state.selectedTicketId = ticketId;
  state.clientSupportMode = "detail";
  const ticket = selectedTicket();
  if (ticket && push && window.location.href !== new URL(ticketRoute(ticket), window.location.origin).href) {
    window.history.pushState({}, "", ticketRoute(ticket));
  }
  if (isAdmin()) renderTickets();
  else renderClientSupport();
}

function renderTickets() {
  if (!isAdmin()) {
    renderClientSupport();
    return;
  }
  if (!els.ticketsList) return;
  const previousScrollTop = els.ticketsList.scrollTop;
  const tickets = [...filteredTickets()].sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
  if (els.ticketCount) {
    els.ticketCount.textContent = `${state.tickets.length} ${state.tickets.length === 1 ? "chamado" : "chamados"}`;
  }
  if (els.ticketListCount) {
    els.ticketListCount.textContent = `${tickets.length} ${tickets.length === 1 ? "chamado" : "chamados"}`;
  }

  els.ticketsList.innerHTML = tickets.length
    ? tickets
        .map((ticket) => {
          const selected = ticket.id === state.selectedTicketId ? "selected" : "";
          const sla = ticketSlaState(ticket);
          return `
            <button class="ticket-table-row ${selected}" type="button" data-ticket-id="${escapeHtml(ticket.id)}">
              <span class="status-dot ${ticketStatusTone(ticket.status)}" aria-hidden="true"></span>
              <div class="ticket-table-main">
                <strong>${escapeHtml(ticket.title)}</strong>
                <small>${escapeHtml(ticketReference(ticket))} · ${escapeHtml(ticket.requesterName || "Sem solicitante")}</small>
              </div>
              <span class="ticket-table-company">${escapeHtml(ticket.groupName || "Sem empresa")}</span>
              <span class="ticket-table-assignee">${escapeHtml(ticket.assignedToName || "Sem responsavel")}</span>
              <span class="ticket-priority-badge ${escapeHtml(ticket.priority)}">${ticketPriorityLabel(ticket.priority)}</span>
              <span class="status-badge ${ticketStatusTone(ticket.status)}">${ticketStatusLabel(ticket.status)}</span>
              <span class="ticket-sla-cell ${sla.tone}" title="${escapeHtml(sla.detail)}">
                <span class="ticket-sla ${sla.tone}">${sla.label}</span>
                ${sla.hasSla ? `<span class="ticket-sla-progress" aria-label="${escapeHtml(sla.detail)}"><i style="width:${sla.progress}%"></i></span><small>${escapeHtml(sla.detail)}</small>` : ""}
              </span>
            </button>
          `;
        })
        .join("")
    : `<div class="empty-list">Nenhum chamado encontrado para os filtros atuais.</div>`;

  els.ticketsList.scrollTop = previousScrollTop;

  const ticket = selectedTicket();
  if (els.ticketQueueScreen) els.ticketQueueScreen.hidden = Boolean(ticket);
  if (els.ticketWorkspaceScreen) els.ticketWorkspaceScreen.hidden = !ticket;
  renderTicketWorkspace(ticket);
  renderTicketSummary(ticket);
}

function clientSupportGroups() {
  return sortedByAlpha(state.groups || [], (group) => group.name);
}

function clientSupportEligibleGroups() {
  return clientSupportGroups().filter((group) => Array.isArray(group.contracts) && group.contracts.includes("support"));
}

function clientTicketListHtml() {
  const tickets = [...(state.tickets || [])].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  if (!tickets.length) {
    return `<div class="client-support-empty"><strong>Nenhum chamado aberto</strong><span>Quando precisar de ajuda, abra uma solicitacao por aqui.</span></div>`;
  }
  return `<div class="client-ticket-list">${tickets.map((ticket) => `
    <button class="client-ticket-row" type="button" data-client-ticket="${escapeHtml(ticket.id)}">
      <span class="status-dot ${ticketStatusTone(ticket.status)}" aria-hidden="true"></span>
      <span class="client-ticket-copy"><strong>${escapeHtml(ticket.title)}</strong><small>${escapeHtml(ticketReference(ticket))} · ${escapeHtml(ticket.groupName || "Empresa")} · Atualizado ${formatDate(ticket.updatedAt)}</small></span>
      <span class="ticket-priority-badge ${escapeHtml(ticket.priority)}">${ticketPriorityLabel(ticket.priority)}</span>
      <span class="status-badge ${ticketStatusTone(ticket.status)}">${ticketStatusLabel(ticket.status)}</span>
      <span class="client-ticket-arrow" aria-hidden="true">›</span>
    </button>
  `).join("")}</div>`;
}

function clientTicketDetailHtml(ticket) {
  if (!ticket) return clientTicketListHtml();
  const closed = ["resolved", "closed"].includes(ticket.status);
  const updates = [...(ticket.updates || [])].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return `
    <div class="client-ticket-detail">
      <button class="ghost-button compact client-back-button" type="button" data-client-action="back">← Voltar aos chamados</button>
      <header class="client-ticket-detail-header">
        <div><span>${escapeHtml(ticketReference(ticket))}</span><h3>${escapeHtml(ticket.title)}</h3><p>${escapeHtml(ticket.groupName || "Empresa")} · ${escapeHtml(ticket.location || "Localizacao nao informada")}</p></div>
        <div class="ticket-detail-badges"><span class="ticket-priority-badge ${escapeHtml(ticket.priority)}">${ticketPriorityLabel(ticket.priority)}</span><span class="status-badge ${ticketStatusTone(ticket.status)}">${ticketStatusLabel(ticket.status)}</span></div>
      </header>
      <div class="client-ticket-summary">
        <div><span>Categoria</span><strong>${ticketCategoryLabel(ticket.category)}</strong></div>
        <div><span>Aberto em</span><strong>${formatDate(ticket.createdAt)}</strong></div>
        <div><span>Responsavel</span><strong>${escapeHtml(ticket.assignedToName || "Aguardando atribuicao")}</strong></div>
      </div>
      <article class="client-ticket-description"><span>Solicitacao</span><p>${escapeHtml(ticket.description || "Sem descricao.")}</p></article>
      ${(ticket.attachments || []).length ? `<div class="client-attachments"><span>Anexos</span>${ticket.attachments.map((file) => `<a class="ghost-button compact" href="/api/tickets/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(file.id)}">${escapeHtml(file.name)}</a>`).join("")}</div>` : ""}
      <section class="client-conversation"><div class="panel-title compact-title"><h3>Conversa</h3><span>${updates.length} registros</span></div>
        <div class="client-message-list">${updates.length ? updates.map((update) => `
          <article class="client-message ${update.authorUserId === state.currentUser?.id ? "is-customer" : "is-support"}">
            <header><strong>${escapeHtml(update.authorName || "Equipe de suporte")}</strong><span>${formatDate(update.createdAt)}</span></header>
            <p>${escapeHtml(update.message || ticketUpdateTitle(update))}</p>
          </article>`).join("") : `<div class="empty-list">Aguardando a primeira atualizacao.</div>`}</div>
      </section>
      ${closed ? `<div class="client-closed-note">Este chamado foi encerrado. O historico permanece disponivel para consulta.</div>` : `
        <form class="client-reply-form" id="clientReplyForm" data-ticket-id="${escapeHtml(ticket.id)}">
          <label>Adicionar mensagem<textarea name="message" rows="4" required placeholder="Escreva uma nova informacao para a equipe de suporte"></textarea></label>
          <div class="dialog-actions"><button class="ghost-button" type="button" data-client-action="close" data-ticket-id="${escapeHtml(ticket.id)}">Nao preciso mais de ajuda</button><button class="primary-button" type="submit">Enviar mensagem</button></div>
        </form>`}
    </div>`;
}

function clientTicketFormHtml() {
  const groups = clientSupportEligibleGroups();
  if (!groups.length) return `<div class="client-contract-notice"><strong>Servico de suporte nao contratado</strong><p>Nenhuma das empresas vinculadas ao seu acesso possui contrato de suporte ativo.</p><button class="ghost-button" type="button" data-client-action="back">Voltar</button></div>`;
  return `
    <form class="client-ticket-form" id="clientTicketForm">
      <div class="client-form-heading"><div><p class="eyebrow">Nova solicitacao</p><h3>Abrir chamado</h3><span>Descreva o que esta acontecendo. Quanto mais contexto, mais rapido conseguimos ajudar.</span></div><button class="ghost-button compact" type="button" data-client-action="back">Cancelar</button></div>
      <div class="form-grid"><label>Empresa<select name="groupId" required>${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join("")}</select></label><label>Localizacao<input name="location" required maxlength="180" placeholder="Ex: Escritorio, recepcao ou filial" /></label></div>
      <label>Titulo<input name="title" required maxlength="160" placeholder="Resuma o problema em uma frase" /></label>
      <div class="form-grid"><label>Categoria<select name="category"><option value="incident">Incidente</option><option value="request">Solicitacao</option><option value="access">Acesso</option><option value="backup">Backup</option><option value="network">Rede</option><option value="server">Servidor</option><option value="other">Outro</option></select></label><label>Prioridade<select name="priority"><option value="low">Baixa</option><option value="normal" selected>Normal</option><option value="high">Alta</option><option value="critical">Critica</option></select></label></div>
      <label>Descricao<textarea name="description" rows="7" required maxlength="5000" placeholder="Informe sintomas, quando comecou e quem esta sendo afetado"></textarea></label>
      <label class="client-file-field">Anexos opcionais<input name="attachments" type="file" multiple accept="image/*,.pdf,.txt,.log" /><small>Ate 3 arquivos de 2 MB cada.</small></label>
      <div class="form-error" data-client-form-error role="alert"></div><div class="dialog-actions"><button class="primary-button" type="submit">Enviar chamado</button></div>
    </form>`;
}

function renderClientSupport() {
  if (!els.clientSupportContent || isAdmin()) return;
  const groups = clientSupportGroups();
  const eligible = clientSupportEligibleGroups();
  if (els.clientNewTicket) els.clientNewTicket.disabled = eligible.length === 0;
  if (els.clientCompanyContext) {
    els.clientCompanyContext.innerHTML = groups.map((group) => {
      const active = eligible.some((item) => item.id === group.id);
      return `<div><span class="status-dot ${active ? "online" : "unknown"}"></span><span><strong>${escapeHtml(group.name)}</strong><small>${active ? "Suporte contratado" : "Suporte nao contratado"}</small></span></div>`;
    }).join("") || `<div><strong>Nenhuma empresa vinculada</strong></div>`;
  }
  if (state.clientSupportMode === "new") els.clientSupportContent.innerHTML = clientTicketFormHtml();
  else if (state.clientSupportMode === "detail") els.clientSupportContent.innerHTML = clientTicketDetailHtml(selectedTicket());
  else els.clientSupportContent.innerHTML = `<section class="client-ticket-index"><div class="panel-title"><div><h3>Meus chamados</h3><span>${state.tickets.length} ${state.tickets.length === 1 ? "solicitacao" : "solicitacoes"}</span></div></div>${clientTicketListHtml()}</section>`;
}

function formatTicketDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "-";
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}min`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function ticketDurationBetween(start, end) {
  const startAt = new Date(start || 0).getTime();
  const endAt = new Date(end || 0).getTime();
  if (!startAt || !endAt) return null;
  return Math.max(0, endAt - startAt);
}

function ticketUpdateDraftFor(ticketId) {
  const draft = state.ticketUpdateDraft;
  if (draft?.ticketId === ticketId) return draft;
  return {
    ticketId,
    open: false,
    message: "",
    kind: "comment",
    newStatus: "",
    internal: false
  };
}

function captureTicketUpdateDraft() {
  const form = els.ticketWorkspacePanel?.querySelector("#ticketUpdateForm");
  if (!form) return null;
  const ticketId = form.dataset.ticketId;
  if (!ticketId) return null;
  const previous = ticketUpdateDraftFor(ticketId);
  state.ticketUpdateDraft = {
    ticketId,
    open: true,
    message: form.querySelector("#ticketUpdateMessage")?.value || "",
    kind: form.querySelector("#ticketUpdateKind")?.value || previous.kind || "comment",
    newStatus: form.querySelector("#ticketUpdateStatus")?.value || "",
    internal: Boolean(form.querySelector("#ticketUpdateInternal")?.checked)
  };
  return state.ticketUpdateDraft;
}

function clearTicketUpdateDraft(ticketId = null) {
  if (!ticketId || state.ticketUpdateDraft?.ticketId === ticketId) state.ticketUpdateDraft = null;
}

function isEditingTicketUpdate(ticketId) {
  const form = els.ticketWorkspacePanel?.querySelector("#ticketUpdateForm");
  return Boolean(
    state.ticketUpdateDraft?.open &&
      state.ticketUpdateDraft.ticketId === ticketId &&
    form &&
      form.dataset.ticketId === ticketId &&
      form.contains(document.activeElement)
  );
}

function renderTicketWorkspace(ticket) {
  if (!els.ticketWorkspacePanel) return;
  if (!ticket) {
    els.ticketWorkspacePanel.innerHTML = "";
    return;
  }

  if (isEditingTicketUpdate(ticket.id)) {
    captureTicketUpdateDraft();
    return;
  }

  const updates = [...(ticket.updates || [])].sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));
  const sla = ticketSlaState(ticket);
  const attachments = ticket.attachments || [];
  const updateDraft = ticketUpdateDraftFor(ticket.id);
  const isClosed = ticket.status === "closed";

  els.ticketWorkspacePanel.innerHTML = `
    <header class="ticket-workspace-header">
      <button class="icon-button ticket-back-button" type="button" data-ticket-action="back" title="Voltar para a fila" aria-label="Voltar para a fila">←</button>
      <div class="ticket-workspace-heading">
        <span>${escapeHtml(ticketReference(ticket))} · ${escapeHtml(ticket.groupName || "Sem empresa")}</span>
        <h2>${escapeHtml(ticket.title)}</h2>
      </div>
      <div class="ticket-detail-badges">
        <span class="ticket-priority-badge ${escapeHtml(ticket.priority)}">${ticketPriorityLabel(ticket.priority)}</span>
        <span class="ticket-sla ${sla.tone}">${sla.label}</span>
        <span class="status-badge ${ticketStatusTone(ticket.status)}">${ticketStatusLabel(ticket.status)}</span>
      </div>
    </header>

    <section class="ticket-workspace-section ticket-request-section">
      <div class="panel-title compact-title">
        <div><p class="eyebrow">Solicitacao</p><h3>Informacoes do chamado</h3></div>
        <div class="panel-title-actions">
          <button class="ghost-button compact" type="button" data-ticket-action="edit" data-id="${escapeHtml(ticket.id)}">Editar</button>
          <button class="danger-button compact" type="button" data-ticket-action="delete" data-id="${escapeHtml(ticket.id)}">Excluir</button>
        </div>
      </div>
      <div class="ticket-overview-grid">
        <div><span>Solicitante</span><strong>${escapeHtml(ticket.requesterName || "Nao informado")}</strong></div>
        <div><span>Responsavel</span><strong>${escapeHtml(ticket.assignedToName || "Sem responsavel")}</strong></div>
        <div><span>Categoria</span><strong>${ticketCategoryLabel(ticket.category)}</strong></div>
        <div><span>Impacto</span><strong>${ticketImpactLabel(ticket.impact)}</strong></div>
        <div><span>Localizacao</span><strong>${escapeHtml(ticket.location || "Nao informada")}</strong></div>
        <div><span>Ativo vinculado</span><strong>${escapeHtml(ticket.assetName || "Nao vinculado")}</strong></div>
      </div>
      <div class="ticket-description-block">
        <span>Descricao</span>
        <p>${escapeHtml(ticket.description || "Nenhuma descricao informada.")}</p>
      </div>
      ${attachments.length ? `<div class="ticket-attachments"><span>Anexos</span><div>${attachments.map((file) => `<a class="ghost-button compact" href="/api/tickets/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(file.id)}">${escapeHtml(file.name)}</a>`).join("")}</div></div>` : ""}
    </section>

    <section class="ticket-workspace-section ticket-history-section">
      <div class="panel-title compact-title">
        <div><p class="eyebrow">Atendimento</p><h3>Historico e comunicacao</h3></div>
        <span>${updates.length} ${updates.length === 1 ? "registro" : "registros"}</span>
      </div>
      <div class="ticket-conversation-list">
        ${updates.length ? updates.map((update) => `
          <article class="ticket-conversation-item ${update.visibility === "internal" ? "is-internal" : ""}">
            <span class="status-pulse ${update.kind === "status_change" ? ticketStatusTone(update.toStatus) : "online"}" aria-hidden="true"></span>
            <div>
              <header><strong>${escapeHtml(ticketUpdateTitle(update))}</strong>${update.visibility === "internal" ? `<span class="ticket-internal-badge">Nota interna</span>` : ""}<time>${formatDate(update.createdAt)}</time></header>
              ${update.message ? `<p>${escapeHtml(update.message)}</p>` : ""}
              <small>${escapeHtml(update.authorName || "Sistema")}</small>
            </div>
          </article>`).join("") : `<div class="empty-list">Nenhuma atualizacao registrada ainda.</div>`}
      </div>
    </section>

    <section class="ticket-workspace-section ticket-reply-section ${isClosed ? "is-closed" : ""}">
      <div class="ticket-update-trigger">
        <div><p class="eyebrow">${isClosed ? "Atendimento encerrado" : "Nova interacao"}</p><h3>${isClosed ? "Chamado fechado" : updateDraft.open ? "Adicionar atualizacao" : "Registrar atendimento"}</h3></div>
        ${isClosed ? `<span class="ticket-sla muted">Reabra o chamado para atualizar</span>` : `<button class="${updateDraft.open ? "ghost-button" : "primary-button"} compact" type="button" data-ticket-action="toggle-update" data-id="${escapeHtml(ticket.id)}">${updateDraft.open ? "Cancelar" : "Adicionar atualizacao"}</button>`}
      </div>
      ${isClosed ? `<p class="ticket-closed-update-note">Novas atualizacoes estao bloqueadas. Altere o status para aberto ou em andamento para retomar o atendimento.</p>` : updateDraft.open ? `
        <form class="ticket-update-form" id="ticketUpdateForm" data-ticket-id="${escapeHtml(ticket.id)}">
          <label class="ticket-update-message">
            Mensagem
            <textarea id="ticketUpdateMessage" rows="4" placeholder="Descreva o atendimento, a orientacao ou a resolucao" required>${escapeHtml(updateDraft.message)}</textarea>
          </label>
          <div class="ticket-update-options">
            <label>
              Tipo
              <select id="ticketUpdateKind">
                <option value="comment" ${updateDraft.kind === "comment" ? "selected" : ""}>Comentario</option>
                <option value="resolution" ${updateDraft.kind === "resolution" ? "selected" : ""}>Resolucao</option>
              </select>
            </label>
            <label>
              Mudar status para
              <select id="ticketUpdateStatus">
                <option value="" ${!updateDraft.newStatus ? "selected" : ""}>Manter status atual</option>
                <option value="open" ${updateDraft.newStatus === "open" ? "selected" : ""} ${ticket.status === "open" ? "disabled" : ""}>Aberto</option>
                <option value="in_progress" ${updateDraft.newStatus === "in_progress" ? "selected" : ""} ${ticket.status === "in_progress" ? "disabled" : ""}>Em andamento</option>
                <option value="waiting_customer" ${updateDraft.newStatus === "waiting_customer" ? "selected" : ""} ${ticket.status === "waiting_customer" ? "disabled" : ""}>Aguardando cliente</option>
                <option value="waiting_third_party" ${updateDraft.newStatus === "waiting_third_party" ? "selected" : ""} ${ticket.status === "waiting_third_party" ? "disabled" : ""}>Aguardando terceiro</option>
                <option value="resolved" ${updateDraft.newStatus === "resolved" ? "selected" : ""} ${ticket.status === "resolved" ? "disabled" : ""}>Resolvido</option>
                <option value="closed" ${updateDraft.newStatus === "closed" ? "selected" : ""} ${ticket.status === "closed" ? "disabled" : ""}>Fechado</option>
              </select>
            </label>
          </div>
          <div class="ticket-update-footer">
            <label class="ticket-internal-toggle">
              <input id="ticketUpdateInternal" type="checkbox" ${updateDraft.internal ? "checked" : ""} />
              <span>Nota interna <small>nao aparece para o cliente</small></span>
            </label>
            <div class="dialog-actions"><button class="ghost-button compact" type="button" data-ticket-action="toggle-update" data-id="${escapeHtml(ticket.id)}">Cancelar</button><button class="primary-button compact" type="submit">Salvar atualizacao</button></div>
          </div>
        </form>
      ` : ""}
    </section>
  `;
}

function renderTicketSummary(ticket) {
  if (!els.ticketDetailPanel) return;
  if (!ticket) {
    els.ticketDetailPanel.innerHTML = "";
    return;
  }

  const closed = ["resolved", "closed"].includes(ticket.status);
  const totalDuration = ticketDurationBetween(ticket.createdAt, closed ? ticket.closedAt || ticket.updatedAt : new Date().toISOString());
  const firstResponseDuration = ticketDurationBetween(ticket.createdAt, ticket.firstRespondedAt);
  const resolutionDuration = closed ? ticketDurationBetween(ticket.createdAt, ticket.closedAt || ticket.updatedAt) : null;

  els.ticketDetailPanel.innerHTML = `
    <div class="ticket-summary-heading">
      <p class="eyebrow">Resumo operacional</p>
      <h3>${closed ? "Atendimento concluido" : "Chamado em andamento"}</h3>
      <span>${escapeHtml(ticketReference(ticket))}</span>
    </div>

    <div class="ticket-time-summary">
      <div class="ticket-time-primary">
        <span>${closed ? "Tempo total" : "Aberto ha"}</span>
        <strong>${formatTicketDuration(totalDuration)}</strong>
        <small>${formatDate(ticket.createdAt)}</small>
      </div>
      <div><span>Primeira resposta</span><strong>${firstResponseDuration == null ? "Aguardando" : formatTicketDuration(firstResponseDuration)}</strong></div>
      <div><span>Resolucao</span><strong>${resolutionDuration == null ? "Em andamento" : formatTicketDuration(resolutionDuration)}</strong></div>
    </div>

    <section class="ticket-summary-section">
      <div><span>Empresa</span><strong>${escapeHtml(ticket.groupName || "Sem empresa")}</strong></div>
      <div><span>Solicitante</span><strong>${escapeHtml(ticket.requesterName || "Nao informado")}</strong></div>
      <div><span>Responsavel</span><strong>${escapeHtml(ticket.assignedToName || "Sem responsavel")}</strong></div>
      <div><span>Prioridade</span><strong>${ticketPriorityLabel(ticket.priority)}</strong></div>
      <div><span>Categoria</span><strong>${ticketCategoryLabel(ticket.category)}</strong></div>
      <div><span>Prazo de solucao</span><strong>${ticket.resolutionDueAt ? formatDate(ticket.resolutionDueAt) : "Nao definido"}</strong></div>
    </section>
  `;
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
  return alert.groupId || serverById(alert.serverId)?.groupId || "none";
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

function backupProviderConfigured(provider) {
  if (provider === "msp") return Boolean(state.settings.cloudBackupConfigured || state.cloudBackup?.configured);
  if (provider === "proxmox") return Boolean(state.settings.proxmoxConfigured || state.proxmoxBackup?.configured);
  return false;
}

function configuredBackupProviders() {
  return ["msp", "proxmox"].filter(backupProviderConfigured);
}

function updateBackupNavigationVisibility() {
  const tab = document.querySelector('.nav-tab[data-view="backups"]');
  if (!tab) return;
  const visible = canSeeSection("backups") && configuredBackupProviders().length > 0;
  tab.hidden = !visible;
  if (!visible && activeViewName() === "backups") {
    setActiveView(isAdmin() ? "integrations" : "dashboard");
  }
}

function applyBackupProvider(provider) {
  state.backupProvider = provider;
  document.querySelectorAll("#backupsProviderToggle [data-backup-provider]").forEach((item) => {
    item.classList.toggle("active", item.dataset.backupProvider === provider);
  });
  const mspView = document.getElementById("backupsMspView");
  const proxmoxView = document.getElementById("backupsProxmoxView");
  if (mspView) mspView.hidden = provider !== "msp";
  if (proxmoxView) proxmoxView.hidden = provider !== "proxmox";
}

function updateBackupProviderVisibility() {
  const toggle = document.getElementById("backupsProviderToggle");
  const emptyState = document.getElementById("backupsNoProviders");
  const mspView = document.getElementById("backupsMspView");
  const proxmoxView = document.getElementById("backupsProxmoxView");
  if (!toggle || !emptyState || !mspView || !proxmoxView) return;

  const configuredProviders = configuredBackupProviders();
  toggle.querySelectorAll("[data-backup-provider]").forEach((button) => {
    button.hidden = !configuredProviders.includes(button.dataset.backupProvider);
  });

  if (!configuredProviders.length) {
    toggle.hidden = true;
    mspView.hidden = true;
    proxmoxView.hidden = true;
    emptyState.hidden = false;
    const hint = document.getElementById("backupsNoProvidersHint");
    if (hint) {
      hint.textContent = isAdmin()
        ? "Configure um provedor na aba Integracoes para comecar o monitoramento."
        : "Nenhum provedor de backup foi configurado pela administracao.";
    }
    updateBackupNavigationVisibility();
    return;
  }

  emptyState.hidden = true;
  toggle.hidden = configuredProviders.length < 2;
  if (!configuredProviders.includes(state.backupProvider)) {
    state.backupProvider = configuredProviders[0];
  }
  applyBackupProvider(state.backupProvider);
  updateBackupNavigationVisibility();
}

function renderBackups() {
  if (!els.backupsHero) return;
  const backupsScrollPositions = captureBackupsScroll();
  const finishBackupRender = () => {
    restoreBackupsScroll(backupsScrollPositions);
    renderProxmoxBackups();
    updateBackupProviderVisibility();
  };
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
  if (!configured) {
    finishBackupRender();
    return;
  }

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

  finishBackupRender();
}

function renderProxmoxBackups() {
  const container = document.getElementById("proxmoxBackupsContent");
  const summaryEl = document.getElementById("proxmoxBackupsSummary");
  if (!container) return;
  if (document.activeElement && container.contains(document.activeElement)) return;
  const scrollPositions = {};
  container.querySelectorAll("[data-proxmox-scroll-id]").forEach((element) => {
    scrollPositions[element.dataset.proxmoxScrollId] = element.scrollTop;
  });
  const data = state.proxmoxBackup || { configured: false, items: [], error: null };
  if (els.proxmoxBackupsSyncMeta) {
    els.proxmoxBackupsSyncMeta.textContent = data.fetchedAt
      ? `Ultima atualizacao: ${formatDate(data.fetchedAt)}`
      : data.configured
      ? "Dados recebidos, aguardando horario da sincronizacao"
      : "Integracao ainda nao configurada";
  }
  if (!data.configured) {
    if (summaryEl) summaryEl.textContent = "Nao configurado";
    container.innerHTML = `<div class="simple-empty">Configure o Proxmox Backup Server (PROXMOX_PBS_BASE_URL) para ver os dados aqui.</div>`;
    return;
  }
  const items = data.items || [];
  if (summaryEl) summaryEl.textContent = `${items.length} ${items.length === 1 ? "backup monitorado" : "backups monitorados"}`;

  const successCount = items.filter((item) => item.status === "success").length;
  const warningCount = items.filter((item) => item.status === "warning").length;
  const errorItems = items.filter((item) => item.status === "error");
  const lateItems = items.filter((item) => item.status === "late" || item.status === "stale");
  const lateCount = lateItems.length;
  const failCount = errorItems.length;
  const successPct = Math.round((successCount / Math.max(1, successCount + failCount + lateCount)) * 100);
  const unmatchedGroupItems = items.filter((item) => !item.groupId);
  const unmatchedServerItems = items.filter((item) => item.groupId && !item.serverId);

  const groupOptionsFor = (selectedGroupId) =>
    sortedByAlpha(state.groups, groupSortLabel)
      .map(
        (group) =>
          `<option value="${escapeHtml(group.id)}" ${group.id === selectedGroupId ? "selected" : ""}>${escapeHtml(group.name)}</option>`
      )
      .join("");

  function serverOptionsFor(groupId) {
    const candidates = groupId ? state.servers.filter((server) => server.groupId === groupId) : state.servers;
    return sortedByAlpha(candidates, serverSortLabel)
      .map((server) => `<option value="${escapeHtml(server.id)}">${escapeHtml(server.name)}</option>`)
      .join("");
  }

  function itemLabel(item) {
    return item.serverName || item.comment || `${item.backupType} ${item.backupId}`;
  }

  function itemRow(item) {
    const label = itemLabel(item);
    const size = formatBytes(item.sizeBytes);
    const when = item.lastSnapshotAt ? formatDate(item.lastSnapshotAt) : "-";
    const badgeClass = item.status === "error" ? "offline" : item.status === "warning" ? "probe_stale" : "online";
    const badgeLabel = item.status === "error" ? "Erro" : item.status === "warning" ? "Atencao" : "Sucesso";
    const needsServer = item.groupId && !item.serverId;
    return `
      <div class="proxmox-backup-row ${escapeHtml(item.status || "unknown")}">
        <div class="proxmox-backup-row-top">
          <div class="proxmox-backup-identity">
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(item.namespace)} · ${escapeHtml(item.backupType)} ${escapeHtml(item.backupId)} · ${size}</small>
          </div>
          <span class="status-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="proxmox-backup-row-bottom">
          <small class="proxmox-backup-date">${when}</small>
          ${
            needsServer
              ? `<select class="compact-select" data-proxmox-link-server data-namespace="${escapeHtml(item.namespace)}" data-backup-id="${escapeHtml(item.backupId)}">
                  <option value="">Vincular servidor...</option>
                  ${serverOptionsFor(item.groupId)}
                </select>`
              : ""
          }
        </div>
      </div>
    `;
  }

  const statusOrder = { error: 0, warning: 1, success: 2 };
  const sortBackupItems = (left, right) =>
    (statusOrder[left.status] ?? 3) - (statusOrder[right.status] ?? 3) ||
    compareAlpha(itemLabel(left), itemLabel(right));

  const grouped = new Map();
  for (const item of items) {
    if (!item.groupId) continue;
    const list = grouped.get(item.groupId) || [];
    list.push(item);
    grouped.set(item.groupId, list);
  }

  const groupSections = [...grouped.entries()]
    .sort(([leftGroupId], [rightGroupId]) => {
      const leftGroup = state.groups.find((candidate) => candidate.id === leftGroupId);
      const rightGroup = state.groups.find((candidate) => candidate.id === rightGroupId);
      return compareAlpha(leftGroup?.name || "Empresa", rightGroup?.name || "Empresa");
    })
    .map(([groupId, groupItems]) => {
      const group = state.groups.find((candidate) => candidate.id === groupId);
      const orderedItems = [...groupItems].sort(sortBackupItems);
      const groupSuccess = groupItems.filter((item) => item.status === "success").length;
      const groupWarning = groupItems.filter((item) => item.status === "warning").length;
      const groupError = groupItems.filter((item) => item.status === "error").length;
      return `
        <section class="proxmox-company-section">
          <div class="proxmox-company-header">
            <div>
              <strong>${escapeHtml(group?.name || "Empresa")}</strong>
              <span>${groupItems.length} ${groupItems.length === 1 ? "backup monitorado" : "backups monitorados"}</span>
            </div>
            <div class="proxmox-company-counts">
              <span class="status-badge online">${groupSuccess} sucesso${groupSuccess === 1 ? "" : "s"}</span>
              ${groupWarning ? `<span class="status-badge probe_stale">${groupWarning} atencao</span>` : ""}
              ${groupError ? `<span class="status-badge offline">${groupError} ${groupError === 1 ? "falha" : "falhas"}</span>` : ""}
            </div>
          </div>
          <div class="proxmox-company-items" data-proxmox-scroll-id="group-${escapeHtml(groupId)}">${orderedItems.map(itemRow).join("")}</div>
        </section>
      `;
    })
    .join("");

  const unmatchedNamespaces = [...new Set(unmatchedGroupItems.map((item) => item.namespace))];
  const unmatchedSection = unmatchedNamespaces.length
    ? `
      <section class="proxmox-company-section unmatched">
        <div class="proxmox-company-header">
          <div>
            <strong>Sem empresa vinculada</strong>
            <span>${unmatchedNamespaces.length} ${unmatchedNamespaces.length === 1 ? "namespace pendente" : "namespaces pendentes"}</span>
          </div>
          <div class="proxmox-company-counts">
            <span class="status-badge probe_stale">${unmatchedGroupItems.length} sem vinculo</span>
          </div>
        </div>
        <div class="proxmox-company-items" data-proxmox-scroll-id="unmatched">
          ${unmatchedNamespaces
            .sort(compareAlpha)
            .map((ns) => {
              const namespaceItems = unmatchedGroupItems.filter((item) => item.namespace === ns);
              const count = namespaceItems.length;
              const namespaceSuccess = namespaceItems.filter((item) => item.status === "success").length;
              const namespaceError = namespaceItems.filter((item) => item.status === "error").length;
              return `
                <div class="proxmox-namespace-row">
                  <div>
                    <strong>${escapeHtml(ns)}</strong>
                    <small>${count} ${count === 1 ? "backup" : "backups"} · ${namespaceSuccess} sucesso${namespaceSuccess === 1 ? "" : "s"}${namespaceError ? ` · ${namespaceError} ${namespaceError === 1 ? "falha" : "falhas"}` : ""}</small>
                  </div>
                  <select class="compact-select" data-proxmox-link-namespace data-namespace="${escapeHtml(ns)}">
                    <option value="">Vincular empresa...</option>
                    ${groupOptions}
                  </select>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>
    `
    : "";

  const capacityCards = (data.datastores || [])
    .map((ds) => {
      const pct = ds.totalBytes ? Math.round((ds.usedBytes / ds.totalBytes) * 100) : 0;
      const storageInsights = datastoreStorageInsights(ds, data.datastoreHistory, data.fetchedAt);
      const currentPct = ds.totalBytes ? (Number(ds.usedBytes || 0) / Number(ds.totalBytes || 1)) * 100 : 0;
      const previousPct = storageInsights.previousEntry?.totalBytes
        ? (Number(storageInsights.previousEntry.usedBytes || 0) / Number(storageInsights.previousEntry.totalBytes || 1)) * 100
        : null;
      const percentDelta = previousPct === null ? null : Math.round((currentPct - previousPct) * 10) / 10;
      const deltaClass =
        storageInsights.delta === null || storageInsights.delta === 0 ? "neutral" : storageInsights.delta > 0 ? "increase" : "decrease";
      const deltaLabel =
        storageInsights.delta === null
          ? "Historico inicia hoje"
          : storageInsights.delta === 0
          ? "Sem variacao"
          : `${formatSignedBytes(storageInsights.delta)} desde ${formatDayLabel(storageInsights.previousEntry?.day)}`;
      const percentDeltaText =
        percentDelta === null
          ? null
          : `${percentDelta > 0 ? "+" : ""}${Number.isInteger(percentDelta) ? percentDelta : percentDelta.toFixed(1)}%`;
      const storageDeltaLabel =
        storageInsights.delta === null
          ? "novo"
          : `${formatSignedBytes(storageInsights.delta)}${percentDeltaText ? ` · ${percentDeltaText}` : ""}`;
      return `
        <div class="detail-stat metric-stat">
          <span>${escapeHtml(ds.datastore)}</span>
          <strong>${formatBytes(ds.usedBytes)} / ${formatBytes(ds.totalBytes)}</strong>
          ${metricBar(pct)}
          <small class="pbs-storage-meta">
            <span>${pct}% usado · ${formatBytes(ds.availBytes)} livres</span>
            <span class="pbs-storage-trend ${deltaClass}" title="${escapeHtml(deltaLabel)}">${escapeHtml(storageDeltaLabel)}</span>
          </small>
        </div>
      `;
    })
    .join("");
  container.innerHTML = `
    <div class="simple-kpi-row proxmox-kpi-row">
      <article class="success"><span>Sucesso</span><strong>${successCount}</strong><small>dentro da janela esperada</small></article>
      <article class="${warningCount ? "warning" : "success"}"><span>Atencao</span><strong>${warningCount}</strong><small>proximos do limite</small></article>
      <button type="button" class="proxmox-kpi-card ${failCount ? "danger" : "success"}" data-proxmox-issue-open="error" ${failCount ? "" : "disabled"}>
        <span>Erro</span><strong>${failCount}</strong><small>com falha ou sem backup</small>
      </button>
      <button type="button" class="proxmox-kpi-card ${lateCount ? "danger" : "success"}" data-proxmox-issue-open="late" ${lateCount ? "" : "disabled"}>
        <span>Atrasados</span><strong>${lateCount}</strong><small>fora da janela esperada</small>
      </button>
      <article class="pbs-rate-card">
        ${availabilityGaugeHtml(successPct, { title: "Taxa de sucesso", caption: "sucesso vs falha" })}
      </article>
    </div>
    ${
      capacityCards
        ? `<div class="profile-stat-grid proxmox-capacity-grid">${capacityCards}</div>`
        : ""
    }
    <div class="proxmox-groups-list" data-proxmox-scroll-id="companies">
      ${groupSections}
      ${unmatchedSection}
    </div>
  `;
  container.querySelectorAll("[data-proxmox-scroll-id]").forEach((element) => {
    const saved = scrollPositions[element.dataset.proxmoxScrollId];
    if (saved) element.scrollTop = saved;
  });
}

async function linkProxmoxNamespaceToGroup(namespace, groupId) {
  try {
    const result = await api("/api/proxmox-backups/link-namespace", { method: "POST", body: JSON.stringify({ namespace, groupId: groupId || null }) });
    state.proxmoxBackup = result.proxmoxBackup;
    renderProxmoxBackups();
    showToast("Empresa vinculada", `${namespace} associado com sucesso.`);
  } catch (error) {
    showToast("Falha ao vincular empresa", error.message);
  }
}

async function linkProxmoxBackupToServer(namespace, backupId, serverId) {
  try {
    const result = await api("/api/proxmox-backups/link-server", { method: "POST", body: JSON.stringify({ namespace, backupId, serverId: serverId || null }) });
    state.proxmoxBackup = result.proxmoxBackup;
    renderProxmoxBackups();
    showToast("Servidor vinculado", "Backup associado ao servidor selecionado.");
  } catch (error) {
    showToast("Falha ao vincular servidor", error.message);
  }
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

function proxmoxBackupItemLabel(item) {
  return item.serverName || item.comment || `${item.backupType} ${item.backupId}`;
}

function openProxmoxIssuesDialog(type) {
  if (!els.proxmoxIssuesDialog || !els.proxmoxIssuesList) return;
  const items = Array.isArray(state.proxmoxBackup?.items) ? state.proxmoxBackup.items : [];
  const isLate = type === "late";
  const issues = items
    .filter((item) => (isLate ? item.status === "late" || item.status === "stale" : item.status === "error"))
    .sort(
      (left, right) =>
        compareAlpha(left.groupName || "Sem empresa vinculada", right.groupName || "Sem empresa vinculada") ||
        compareAlpha(proxmoxBackupItemLabel(left), proxmoxBackupItemLabel(right))
    );

  if (els.proxmoxIssuesTitle) {
    els.proxmoxIssuesTitle.textContent = isLate ? "Backups atrasados" : "Backups com erro";
  }

  els.proxmoxIssuesList.innerHTML = issues.length
    ? issues
        .map((item) => {
          const statusClass = isLate ? "probe_stale" : "offline";
          const statusLabel = isLate ? "Atrasado" : "Erro";
          const dateLabel = item.lastSnapshotAt ? formatDate(item.lastSnapshotAt) : "sem snapshot";
          const company = item.groupName || "Sem empresa vinculada";
          const server = item.serverName || item.comment || "Servidor nao vinculado";
          return `
            <div class="dialog-list-row proxmox-dialog-row">
              <div>
                <strong>${escapeHtml(proxmoxBackupItemLabel(item))}</strong>
                <small>${escapeHtml(company)} &middot; ${escapeHtml(server)}</small>
                <small>${escapeHtml(item.namespace)} &middot; ${escapeHtml(item.backupType)} ${escapeHtml(item.backupId)} &middot; ${formatBytes(item.sizeBytes)}</small>
              </div>
              <div class="dialog-list-meta">
                <span class="status-badge ${statusClass}">${statusLabel}</span>
                <small>Ultimo backup: ${dateLabel}</small>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-list">Nenhum backup ${isLate ? "atrasado" : "com erro"} no momento.</div>`;

  els.proxmoxIssuesDialog.showModal();
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

function daysUntilDate(dateStr) {
  const end = new Date(`${dateStr}T00:00:00`).getTime();
  if (!Number.isFinite(end)) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((end - todayStart) / 86400000);
}

function expiryNotifyDays() {
  const value = Number(state.settings?.expiryNotifyDays ?? 10);
  return Number.isFinite(value) ? Math.min(120, Math.max(1, Math.round(value))) : 10;
}

function groupDatedEntries(group) {
  return [
    ...(Array.isArray(group.serviceContracts) ? group.serviceContracts : []).map((entry) => ({ ...entry, type: "contract", label: entry.label || "Contrato" })),
    ...(Array.isArray(group.products) ? group.products : []).map((entry) => ({ ...entry, type: "product", label: entry.name || "Produto" }))
  ];
}

function expirationTag(entry) {
  const daysLeft = daysUntilDate(entry.endDate);
  if (daysLeft === null) return "";
  const tone = daysLeft < 0 ? "expired" : daysLeft <= expiryNotifyDays() ? "expiring" : "";
  const noun = entry.type === "product" ? "Produto" : "Contrato";
  const suffix =
    daysLeft < 0
      ? `venceu ha ${Math.abs(daysLeft)} dia(s)`
      : daysLeft === 0
      ? "vence hoje"
      : `${daysLeft} dia(s) restantes`;
  return `<span class="company-contract-tag ${entry.type} ${tone}" title="${escapeHtml(`${noun}: ${formatDateOnly(entry.endDate)}`)}">${escapeHtml(`${entry.label}: ${suffix}`)}</span>`;
}

function groupContractTags(group) {
  return groupDatedEntries(group).map(expirationTag).join("");
}

function groupHasNearExpiry(group) {
  return groupDatedEntries(group).some((entry) => {
    const daysLeft = daysUntilDate(entry.endDate);
    return daysLeft !== null && daysLeft <= expiryNotifyDays();
  });
}

function groupsForDirectory() {
  const query = state.groupSearchQuery.trim().toLocaleLowerCase("pt-BR");
  return sortedByAlpha(state.groups, groupSortLabel).filter((group) => {
    const searchable = [group.name, group.description, group.document, group.cnpj, group.cpf].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return (!query || searchable.includes(query)) && (!state.groupExpiringOnly || groupHasNearExpiry(group));
  });
}

function renderGroupManagementView() {
  const showCatalog = state.groupManagementView === "catalog";
  if (els.groupsDirectoryPanel) els.groupsDirectoryPanel.hidden = showCatalog;
  if (els.productCatalogPanel) els.productCatalogPanel.hidden = !showCatalog;
  document.querySelectorAll("[data-group-management-view]").forEach((button) => {
    const active = button.dataset.groupManagementView === state.groupManagementView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function resetProductCatalogForm() {
  if (els.productCatalogForm) els.productCatalogForm.reset();
  if (els.productCatalogId) els.productCatalogId.value = "";
  if (els.saveProductCatalog) els.saveProductCatalog.textContent = "Adicionar produto";
  if (els.cancelProductCatalogEdit) els.cancelProductCatalogEdit.hidden = true;
}

function renderProductCatalog() {
  if (!els.productCatalogList) return;
  const products = sortedByAlpha(state.productCatalog || [], (product) => product.name);
  if (els.productCatalogCount) els.productCatalogCount.textContent = `${products.length} ${products.length === 1 ? "produto" : "produtos"}`;
  els.productCatalogList.innerHTML = products.length
    ? products.map((product) => `
        <article class="product-catalog-row">
          <div><strong>${escapeHtml(product.name)}</strong><small>Disponivel no cadastro de empresas</small></div>
          <div class="product-catalog-actions">
            <button class="ghost-button compact" type="button" data-product-catalog-action="edit" data-id="${escapeHtml(product.id)}">Editar</button>
            <button class="danger-button compact" type="button" data-product-catalog-action="delete" data-id="${escapeHtml(product.id)}">Excluir</button>
          </div>
        </article>`).join("")
    : `<div class="empty-list">Nenhum produto no catalogo. O primeiro produto cadastrado em uma empresa tambem aparecera aqui.</div>`;
}

function renderGroups() {
  if (!els.groupsList) return;
  const groups = groupsForDirectory();
  const suffix = groups.length === state.groups.length ? "" : ` de ${state.groups.length}`;
  els.groupCount.textContent = `${groups.length}${suffix} ${state.groups.length === 1 ? "empresa" : "empresas"}`;
  if (els.toggleGroupExpiryFilter) {
    els.toggleGroupExpiryFilter.classList.toggle("active", state.groupExpiringOnly);
    els.toggleGroupExpiryFilter.setAttribute("aria-pressed", state.groupExpiringOnly ? "true" : "false");
    els.toggleGroupExpiryFilter.textContent = state.groupExpiringOnly ? "Vencimentos proximos: ativo" : "Vencimentos proximos";
  }
  renderGroupManagementView();
  renderProductCatalog();

  if (!groups.length) {
    els.groupsList.innerHTML = `
      <div class="empty-list">${state.groups.length ? "Nenhuma empresa corresponde aos filtros atuais." : "Nenhuma empresa cadastrada. Crie a primeira para associar servidores."}</div>
    `;
    return;
  }

  els.groupsList.innerHTML = groups
    .map((group) => {
      const servers = state.servers.filter((server) => server.groupId === group.id);
      const links = state.networkLinks.filter((link) => link.groupId === group.id && link.featured !== false);
      const devices = state.networkDevices.filter((device) => device.groupId === group.id);
      const activeServers = servers.filter((server) => server.isActive);
      const offline = activeServers.filter((server) => server.currentStatus === "offline").length;
      const contractLabels = {
        support: "Suporte",
        backup_msp: "Backup MSP",
        backup_proxmox: "Backup Proxmox"
      };
      const contracts = Array.isArray(group.contracts) ? group.contracts.filter((contract) => contractLabels[contract]) : [];
      return `
        <article class="group-card">
          <div class="group-card-main">
            <strong>${escapeHtml(group.name)}</strong>
            <span>${escapeHtml(group.description || "Sem descricao.")}</span>
            <div class="company-contract-tags" aria-label="Contratos da empresa">
              ${
                contracts.length
                  ? contracts
                      .map((contract) => `<span class="company-contract-tag ${escapeHtml(contract)}">${escapeHtml(contractLabels[contract])}</span>`)
                      .join("")
                  : `<span class="company-contract-tag empty">Sem contratos marcados</span>`
              }
              ${groupContractTags(group)}
            </div>
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
                  <button class="ghost-button compact" type="button" data-group-action="report" data-id="${group.id}">Relatorio</button>
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

function renderTicketSlaSettingsForm() {
  if (!els.ticketSlaSettingsForm || !isAdmin()) return;
  const current = ticketSlaSettings();
  if (document.activeElement !== els.ticketSlaUrgentHours) {
    els.ticketSlaUrgentHours.value = current.urgentHours;
  }
  if (document.activeElement !== els.ticketSlaNormalHours) {
    els.ticketSlaNormalHours.value = current.normalHours;
  }
}

function renderTicketAutomationSettingsForm() {
  if (!els.ticketAutomationSettingsForm || !isAdmin()) return;
  const current = ticketAutomationSettings();
  if (document.activeElement !== els.ticketAutomationEnabled) els.ticketAutomationEnabled.checked = current.enabled;
  if (document.activeElement !== els.ticketAutomationServerMinutes) els.ticketAutomationServerMinutes.value = current.serverOfflineMinutes;
  if (document.activeElement !== els.ticketAutomationLinkMinutes) els.ticketAutomationLinkMinutes.value = current.linkOfflineMinutes;
  if (document.activeElement !== els.ticketAutomationBackupHours) els.ticketAutomationBackupHours.value = current.backupOverdueHours;
}

function renderExpirySettingsForm() {
  if (!els.expirySettingsForm || !isAdmin()) return;
  if (document.activeElement !== els.expiryNotifyDays) {
    els.expiryNotifyDays.value = expirationSettings().expiryNotifyDays;
  }
}

function backupIntegrationSourceLabel(source) {
  if (source === "environment") return "Variavel de ambiente";
  if (source === "configured") return "Configurado";
  return "Nao configurado";
}

function setIntegrationStatus(element, source) {
  if (!element) return;
  element.textContent = backupIntegrationSourceLabel(source);
  element.className = `integration-status ${source === "none" ? "inactive" : "active"}`;
}

function renderBackupIntegrationSettingsForm() {
  if (!isAdmin()) return;
  if (els.cloudBackupSettingsForm) {
    setIntegrationStatus(els.cloudBackupSourceLabel, state.settings.cloudBackupSource || "none");
    if (document.activeElement !== els.cloudBackupApiKeyInput) {
      els.cloudBackupApiKeyInput.value = state.settings.cloudBackupApiKey || "";
    }
  }
  if (els.proxmoxSettingsForm) {
    setIntegrationStatus(els.proxmoxSourceLabel, state.settings.proxmoxSource || "none");
    if (document.activeElement !== els.proxmoxBaseUrlInput) {
      els.proxmoxBaseUrlInput.value = state.settings.proxmoxBaseUrl || "";
    }
    if (document.activeElement !== els.proxmoxTokenIdInput) {
      els.proxmoxTokenIdInput.value = state.settings.proxmoxTokenId || "";
    }
    if (document.activeElement !== els.proxmoxTlsFingerprintInput) {
      els.proxmoxTlsFingerprintInput.value = state.settings.proxmoxTlsFingerprint || "";
    }
    if (document.activeElement !== els.proxmoxTokenSecretInput) {
      els.proxmoxTokenSecretInput.value = state.settings.proxmoxTokenSecret || "";
    }
  }
  if (els.unifiSettingsForm) {
    setIntegrationStatus(els.unifiSourceLabel, state.settings.unifiSource || "none");
    if (document.activeElement !== els.unifiBaseUrlInput) {
      els.unifiBaseUrlInput.value = state.settings.unifiBaseUrl || "";
    }
    if (document.activeElement !== els.unifiApiBasePathInput) {
      els.unifiApiBasePathInput.value = state.settings.unifiApiBasePath || "/proxy/network/integration";
    }
    if (document.activeElement !== els.unifiApiKeyInput) {
      els.unifiApiKeyInput.value = state.settings.unifiApiKey || "";
    }
    if (document.activeElement !== els.unifiTlsFingerprintInput) {
      els.unifiTlsFingerprintInput.value = state.settings.unifiTlsFingerprint || "";
    }
  }
}

async function submitCloudBackupSettings(event) {
  event.preventDefault();
  try {
    const settings = await api("/api/settings/cloudbackup", {
      method: "PUT",
      body: JSON.stringify({ apiKey: els.cloudBackupApiKeyInput.value.trim() })
    });
    state.settings = { ...state.settings, ...settings };
    applySnapshot(await api("/api/snapshot"));
    showToast("MSP Cloud Backup atualizado", "As credenciais foram salvas e a sincronizacao foi atualizada.");
  } catch (error) {
    showToast("Falha ao salvar MSP Cloud Backup", error.message);
  }
}

async function submitProxmoxSettings(event) {
  event.preventDefault();
  try {
    const settings = await api("/api/settings/proxmox", {
      method: "PUT",
      body: JSON.stringify({
        baseUrl: els.proxmoxBaseUrlInput.value.trim(),
        tokenId: els.proxmoxTokenIdInput.value.trim(),
        tokenSecret: els.proxmoxTokenSecretInput.value.trim(),
        tlsFingerprint: els.proxmoxTlsFingerprintInput.value.trim()
      })
    });
    state.settings = { ...state.settings, ...settings };
    applySnapshot(await api("/api/snapshot"));
    showToast("Proxmox Backup Server atualizado", "As credenciais foram salvas e a sincronizacao foi atualizada.");
  } catch (error) {
    showToast("Falha ao salvar Proxmox Backup Server", error.message);
  }
}

async function submitUnifiSettings(event) {
  event.preventDefault();
  try {
    const settings = await api("/api/settings/unifi", {
      method: "PUT",
      body: JSON.stringify({
        baseUrl: els.unifiBaseUrlInput.value.trim(),
        apiBasePath: els.unifiApiBasePathInput.value.trim(),
        apiKey: els.unifiApiKeyInput.value.trim(),
        tlsFingerprint: els.unifiTlsFingerprintInput.value.trim()
      })
    });
    state.settings = { ...state.settings, ...settings };
    applySnapshot(await api("/api/snapshot"));
    showToast("UniFi Network atualizado", "A integracao foi salva e os sites foram sincronizados.");
  } catch (error) {
    showToast("Falha ao salvar UniFi Network", error.message);
  }
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

async function submitTicketSlaSettings(event) {
  event.preventDefault();
  const payload = {
    urgentHours: Number(els.ticketSlaUrgentHours.value),
    normalHours: Number(els.ticketSlaNormalHours.value)
  };
  try {
    const settings = await api("/api/settings/ticket-sla", { method: "PUT", body: JSON.stringify(payload) });
    state.settings = { ...state.settings, ...settings };
    renderTicketSlaSettingsForm();
    showToast("SLA salvo", "Os prazos serao aplicados aos proximos chamados.");
  } catch (error) {
    showToast("Falha ao salvar SLA", error.message);
  }
}

async function submitTicketAutomationSettings(event) {
  event.preventDefault();
  const payload = {
    enabled: els.ticketAutomationEnabled.checked,
    serverOfflineMinutes: Number(els.ticketAutomationServerMinutes.value),
    linkOfflineMinutes: Number(els.ticketAutomationLinkMinutes.value),
    backupOverdueHours: Number(els.ticketAutomationBackupHours.value)
  };
  try {
    const settings = await api("/api/settings/ticket-automation", { method: "PUT", body: JSON.stringify(payload) });
    state.settings = { ...state.settings, ...settings };
    renderTicketAutomationSettingsForm();
    showToast("Automacao salva", payload.enabled ? "As novas regras serao aplicadas a partir de agora." : "A abertura automatica de chamados foi desativada.");
  } catch (error) {
    showToast("Falha ao salvar automacao", error.message);
  }
}

async function submitExpirySettings(event) {
  event.preventDefault();
  try {
    const settings = await api("/api/settings/expirations", {
      method: "PUT",
      body: JSON.stringify({ expiryNotifyDays: Number(els.expiryNotifyDays.value) })
    });
    state.settings = { ...state.settings, ...settings };
    renderExpirySettingsForm();
    renderGroups();
    showToast("Vencimentos salvos", `Os avisos serao gerados ${settings.expiryNotifyDays} dia(s) antes do vencimento.`);
  } catch (error) {
    showToast("Falha ao salvar vencimentos", error.message);
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

function networkProbeInstallCommand() {
  const token = probeToken();
  return `curl -fsSL -H "X-ServerWatch-Probe-Token: ${token}" ${PROBE_PUBLIC_ORIGIN}/downloads/network-probe/linux-installer | sudo bash -s -- --server-url ${PROBE_PUBLIC_ORIGIN} --probe-id ${shellQuote("cliente-acme-sp-rede")} --token ${shellQuote(token)} --name ${shellQuote("Rede - Cliente ACME")}`;
}

function selectedProbeForCommand() {
  return state.probes.find((probe) => probe.id === state.selectedProbeId) || null;
}

function commandGeneratorMode() {
  return "server";
}

function setCommandGeneratorMode(mode) {
  state.commandGeneratorMode = "server";
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
}

function generatedCommand() {
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

const DISK_WARNING_THRESHOLD_PCT = 80;
const SERVER_OFFLINE_WINDOW_MS = 30 * 24 * 60 * 60_000;
const _peakCpuHourCache = new Map();

// Avisos calculados na hora, a partir do que ja esta carregado em state —
// nao marcam o servidor como critico, sao so pontos de atencao operacional.
function computeServerWarnings(server) {
  const warnings = [];

  const partitions = Array.isArray(server.probeHostMetrics?.diskPartitions) ? server.probeHostMetrics.diskPartitions : [];
  for (const partition of partitions) {
    const pct = Number(partition.usedPercent);
    if (!Number.isFinite(pct) || pct < DISK_WARNING_THRESHOLD_PCT) continue;
    warnings.push({
      level: pct >= 90 ? "danger" : "warning",
      icon: "💾",
      text: `Particao ${escapeHtml(partition.mount || partition.filesystem || "?")} em ${Math.round(pct)}% de uso`
    });
  }

  const offlineSince = Date.now() - SERVER_OFFLINE_WINDOW_MS;
  const offlineCount = state.events.filter(
    (event) => event.serverId === server.id && event.kind === "server_offline" && dashboardTimeValue(event.createdAt) >= offlineSince
  ).length;
  if (offlineCount > 0) {
    warnings.push({
      level: offlineCount >= 5 ? "warning" : "info",
      icon: "⚠",
      text: `Ficou offline ${offlineCount} ${offlineCount === 1 ? "vez" : "vezes"} nos ultimos 30 dias`
    });
  }

  const backupItem = (state.proxmoxBackup?.items || []).find((item) => item.serverId === server.id);
  if (backupItem && (backupItem.status === "error" || backupItem.status === "warning")) {
    warnings.push({
      level: backupItem.status === "error" ? "danger" : "warning",
      icon: "🗄",
      text: backupItem.status === "error" ? "Backup com falha ou fora da janela esperada" : "Backup proximo do limite da janela esperada"
    });
  }

  return warnings;
}

async function computePeakCpuHour(probeId) {
  if (!probeId) return null;
  if (_peakCpuHourCache.has(probeId)) return _peakCpuHourCache.get(probeId);
  try {
    const data = await api(`/api/metrics/history?probeId=${encodeURIComponent(probeId)}&type=short`);
    const samples = (data.samples || []).filter((s) => Number.isFinite(s.cpu));
    if (samples.length < 12) {
      _peakCpuHourCache.set(probeId, null);
      return null;
    }
    const buckets = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
    for (const sample of samples) {
      const hour = new Date(sample.t).getHours();
      buckets[hour].sum += sample.cpu;
      buckets[hour].count += 1;
    }
    let bestHour = null;
    let bestAvg = -1;
    buckets.forEach((bucket, hour) => {
      if (!bucket.count) return;
      const avg = bucket.sum / bucket.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestHour = hour;
      }
    });
    const result = bestHour === null ? null : { hour: bestHour, avg: Math.round(bestAvg) };
    _peakCpuHourCache.set(probeId, result);
    return result;
  } catch {
    return null;
  }
}

function renderServerWarningsSection(server) {
  if (server.checkSource !== "probe" || !server.probeId) return "";
  const warnings = computeServerWarnings(server);
  return `
    <div class="server-warnings-section" data-warnings-probe-id="${escapeHtml(server.probeId)}">
      <div class="panel-title compact-title">
        <h3>Quadro de avisos</h3>
        <span>${warnings.length ? `${warnings.length} ${warnings.length === 1 ? "item" : "itens"}` : "Nada a reportar"}</span>
      </div>
      <div class="server-warnings-list">
        ${warnings.map((w) => `<div class="server-warning-row ${w.level}"><span class="server-warning-icon">${w.icon}</span><span>${w.text}</span></div>`).join("")}
        <div class="server-warning-row muted" data-warning-peak-cpu>
          <span class="server-warning-icon">⏱</span>
          <span>Calculando horario de pico de CPU...</span>
        </div>
      </div>
    </div>
  `;
}

async function loadPeakCpuHourWarning(probeId) {
  const peak = await computePeakCpuHour(probeId);
  const rows = document.querySelectorAll(`.server-warnings-section[data-warnings-probe-id="${CSS.escape(probeId)}"] [data-warning-peak-cpu]`);
  rows.forEach((row) => {
    if (!peak) {
      row.remove();
      return;
    }
    row.classList.remove("muted");
    const hourLabel = `${String(peak.hour).padStart(2, "0")}:00`;
    row.innerHTML = `<span class="server-warning-icon">⏱</span><span>Pico de uso de CPU costuma ocorrer por volta das ${hourLabel} (media ${peak.avg}%)</span>`;
  });
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
      <div class="metrics-history-section" data-history-probe-id="${escapeHtml(server.probeId || "")}">
        <button class="metrics-history-toggle ghost-button compact" type="button" data-action="toggle-metrics-history">
          Historico de metricas
        </button>
        <div class="metrics-history-body" hidden></div>
      </div>
      ${renderServerWarningsSection(server)}
    </div>
  `;
}

function metricsLineChart(samples, getValue, color, label, formatter) {
  const W = 400, H = 56;
  const vals = samples.map(getValue).filter((v) => v !== null && Number.isFinite(v));
  if (vals.length < 2) return `<div class="metrics-chart-empty">Sem dados suficientes</div>`;
  const min = 0;
  const max = Math.max(...vals) || 1;
  const xStep = W / (samples.length - 1);
  const pts = samples
    .map((s, i) => {
      const v = getValue(s);
      if (v === null || !Number.isFinite(v)) return null;
      const x = Math.round(i * xStep);
      const y = Math.round(H - ((v - min) / (max - min)) * H);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");
  const last = vals[vals.length - 1];
  const first = vals[0];
  const delta = last - first;
  const deltaStr = formatter(Math.abs(delta));
  const trend = delta > 0 ? `+${deltaStr}` : delta < 0 ? `-${deltaStr}` : "estavel";
  const trendClass = delta > 0 ? "trend-up" : delta < 0 ? "trend-down" : "trend-flat";
  const areaClose = `${W},${H} 0,${H}`;
  const times = samples.map((s) => s.t).join(",");
  const values = samples
    .map((s) => {
      const v = getValue(s);
      return v === null || !Number.isFinite(v) ? "" : formatter(v);
    })
    .join(",");
  return `
    <div class="metrics-chart-row">
      <div class="metrics-chart-meta">
        <span class="metrics-chart-label">${label}</span>
        <span class="metrics-chart-current">${formatter(last)}</span>
        <span class="metrics-chart-trend ${trendClass}">${trend}</span>
      </div>
      <div class="metrics-chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="metrics-chart-svg" preserveAspectRatio="none"
             data-chart-label="${escapeHtml(label)}" data-times="${times}" data-values="${escapeHtml(values)}">
          <polygon points="${pts} ${areaClose}" fill="${color}" opacity="0.15"/>
          <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <line class="metrics-chart-guide-line" x1="0" y1="0" x2="0" y2="${H}" hidden></line>
        </svg>
      </div>
    </div>
  `;
}

let _metricsTooltipEl = null;

function metricsChartPointAt(svg, clientX) {
  const rect = svg.getBoundingClientRect();
  if (!rect.width) return null;
  const times = (svg.dataset.times || "").split(",").filter(Boolean).map(Number);
  if (times.length < 2) return null;
  const values = (svg.dataset.values || "").split(",");
  const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const index = Math.min(times.length - 1, Math.round(fraction * (times.length - 1)));
  return { time: times[index], value: values[index] || "-", fraction: index / (times.length - 1) };
}

function showMetricsChartTooltip(svg, clientX, clientY) {
  const point = metricsChartPointAt(svg, clientX);
  if (!point || !point.time) return;
  if (!_metricsTooltipEl) {
    _metricsTooltipEl = document.createElement("div");
    _metricsTooltipEl.className = "metrics-chart-tooltip";
    document.body.append(_metricsTooltipEl);
  }
  _metricsTooltipEl.innerHTML = `<strong>${escapeHtml(point.value)}</strong><span>${escapeHtml(formatDateShort(point.time))}</span>`;
  _metricsTooltipEl.hidden = false;
  const tipRect = _metricsTooltipEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tipRect.width - 8, clientX + 14);
  const top = Math.max(8, clientY - tipRect.height - 14);
  _metricsTooltipEl.style.left = `${left}px`;
  _metricsTooltipEl.style.top = `${top}px`;

  const guide = svg.querySelector(".metrics-chart-guide-line");
  if (guide) {
    const x = Math.round(point.fraction * 400);
    guide.setAttribute("x1", x);
    guide.setAttribute("x2", x);
    guide.removeAttribute("hidden");
  }
}

function hideMetricsChartTooltips() {
  if (_metricsTooltipEl) _metricsTooltipEl.hidden = true;
  document.querySelectorAll(".metrics-chart-guide-line").forEach((guide) => guide.setAttribute("hidden", ""));
}

const PARTITION_COLORS = ["#e05252", "#3fba74", "#4d9de0", "#e8a838", "#9b59b6", "#1abc9c", "#e67e22", "#16a085"];

function renderPartitionCharts(filtered, isLong) {
  const allMounts = [];
  const seen = new Set();
  for (const s of filtered) {
    for (const p of (s.partitions || [])) {
      if (!seen.has(p.m)) { seen.add(p.m); allMounts.push(p.m); }
    }
  }
  if (!allMounts.length) {
    return isLong
      ? metricsLineChart(filtered, (s) => s.diskUsed, PARTITION_COLORS[0], "Disco principal", formatBytes)
      : metricsLineChart(filtered, (s) => s.diskPct, PARTITION_COLORS[0], "Disco principal", formatPercent);
  }
  return allMounts.map((mount, idx) => {
    const color = PARTITION_COLORS[idx % PARTITION_COLORS.length];
    if (isLong) {
      return metricsLineChart(filtered, (s) => (s.partitions || []).find((p) => p.m === mount)?.used ?? null, color, `Disco ${mount}`, formatBytes);
    }
    return metricsLineChart(filtered, (s) => (s.partitions || []).find((p) => p.m === mount)?.pct ?? null, color, `Disco ${mount}`, formatPercent);
  }).join("");
}

function renderMetricsCharts(samples, type, rangeMs) {
  const now = Date.now();
  const filtered = samples.filter((s) => s.t >= now - rangeMs);
  if (!filtered.length) {
    return `<div class="metrics-chart-empty">Nenhum dado neste periodo ainda.</div>`;
  }
  if (type === "short") {
    return [
      metricsLineChart(filtered, (s) => s.cpu, "var(--accent)", "CPU", formatPercent),
      metricsLineChart(filtered, (s) => s.mem, "#e8a838", "Memoria", formatPercent),
      renderPartitionCharts(filtered, false)
    ].join("");
  }
  // Amostras "long" registradas antes da extensao de retencao nao tem
  // cpu/mem (so disco) — os graficos simplesmente ficam sem esses pontos
  // ate a janela antiga expirar.
  return [
    metricsLineChart(filtered, (s) => s.cpu, "var(--accent)", "CPU", formatPercent),
    metricsLineChart(filtered, (s) => s.mem, "#e8a838", "Memoria", formatPercent),
    renderPartitionCharts(filtered, true)
  ].join("");
}

async function loadMetricsHistory(probeId, type, rangeMs, container) {
  _mh.chartsHtml = `<div class="metrics-chart-empty">Carregando...</div>`;
  container.innerHTML = _mh.chartsHtml;
  try {
    const data = await api(`/api/metrics/history?probeId=${encodeURIComponent(probeId)}&type=${type}`);
    _mh.chartsHtml = renderMetricsCharts(data.samples || [], type, rangeMs);
    container.innerHTML = _mh.chartsHtml;
  } catch (error) {
    _mh.chartsHtml = `<div class="metrics-chart-empty">Falha ao carregar historico: ${escapeHtml(error.message)}</div>`;
    container.innerHTML = _mh.chartsHtml;
  }
}

function restoreMetricsHistory() {
  if (!_mh.open || !_mh.probeId) return;
  const section = els.serverProfilePanel?.querySelector(`.metrics-history-section[data-history-probe-id="${_mh.probeId}"]`);
  if (!section) return;
  const toggle = section.querySelector(".metrics-history-toggle");
  const body = section.querySelector(".metrics-history-body");
  if (!body) return;
  body.hidden = false;
  toggle?.classList.add("active");
  body.innerHTML = buildMetricsHistoryBody(_mh.probeId, _mh.type, _mh.rangeMs);
  const chartsArea = body.querySelector(".metrics-charts-area");
  if (chartsArea && _mh.chartsHtml) chartsArea.innerHTML = _mh.chartsHtml;
}

function buildMetricsHistoryBody(probeId, type, rangeMs) {
  const shortRanges = [
    { label: "1h", ms: 60 * 60_000 },
    { label: "6h", ms: 6 * 60 * 60_000 },
    { label: "24h", ms: 24 * 60 * 60_000 },
    { label: "72h", ms: 72 * 60 * 60_000 }
  ];
  const longRanges = [
    { label: "7d", ms: 7 * 24 * 60 * 60_000 },
    { label: "15d", ms: 15 * 24 * 60 * 60_000 },
    { label: "30d", ms: 30 * 24 * 60 * 60_000 },
    { label: "60d", ms: 60 * 24 * 60 * 60_000 }
  ];
  const curType = type;
  const shortTab = `<button class="mh-type-tab${curType === "short" ? " active" : ""}" data-mh-type="short" data-mh-probe-id="${escapeHtml(probeId)}">CPU / Memoria / Disco · 72h</button>`;
  const longTab = `<button class="mh-type-tab${curType === "long" ? " active" : ""}" data-mh-type="long" data-mh-probe-id="${escapeHtml(probeId)}">CPU / Memoria / Disco · 60 dias</button>`;
  const ranges = curType === "short" ? shortRanges : longRanges;
  const rangeTabs = ranges.map((r) =>
    `<button class="mh-range-tab${r.ms === rangeMs ? " active" : ""}" data-mh-range="${r.ms}" data-mh-probe-id="${escapeHtml(probeId)}" data-mh-type="${curType}">${r.label}</button>`
  ).join("");
  return `
    <div class="metrics-history-tabs">
      <div class="mh-type-tabs">${shortTab}${longTab}</div>
      <div class="mh-range-tabs">${rangeTabs}</div>
    </div>
    <div class="metrics-charts-area"></div>
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

function renderProbeSpeedTest(probe) {
  const hasResult = probe.speedTestDownloadMbps != null;
  return `
    <div class="probe-metrics">
      <div class="panel-title compact-title">
        <h3>Velocidade real (teste ativo)</h3>
        <span>${probe.speedTestAt ? `Ultimo teste ${formatDate(probe.speedTestAt)}` : "Nenhum teste ainda"}</span>
      </div>
      <div class="probe-detail-grid">
        <div class="detail-stat"><span>Download</span><strong>${hasResult ? `${probe.speedTestDownloadMbps} Mbps` : "-"}</strong></div>
        <div class="detail-stat"><span>Upload</span><strong>${probe.speedTestUploadMbps != null ? `${probe.speedTestUploadMbps} Mbps` : "-"}</strong></div>
      </div>
      <button class="ghost-button compact" type="button" data-action="speed-test" data-probe-id="${escapeHtml(probe.id)}" ${probe.speedTestPending ? "disabled" : ""}>
        ${probe.speedTestPending ? "Teste agendado..." : "Testar agora"}
      </button>
      <div class="probe-speedtest-history-body" data-speedtest-history-probe="${escapeHtml(probe.id)}">
        <div class="metrics-chart-empty">Carregando...</div>
      </div>
    </div>
  `;
}

// Grafico de capacidade real (teste ativo) ao longo do tempo — diferente do
// grafico de trafego SNMP passivo, mostra o resultado de cada teste que
// satura o link de proposito (ver runSpeedTest no network-collector.js).
async function loadProbeSpeedTestHistory(probeId, container) {
  if (!container) return;
  try {
    const data = await api(`/api/probes/${encodeURIComponent(probeId)}/speed-test-history`);
    const samples = data.samples || [];
    if (samples.length < 2) {
      container.innerHTML = `<div class="metrics-chart-empty">Sem historico suficiente ainda.</div>`;
      return;
    }
    container.innerHTML = [
      metricsLineChart(samples, (s) => s.downloadMbps, "var(--accent)", "Download (teste ativo)", (v) => `${v} Mbps`),
      metricsLineChart(samples, (s) => s.uploadMbps, "#e8a838", "Upload (teste ativo)", (v) => `${v} Mbps`)
    ].join("");
  } catch (error) {
    container.innerHTML = `<div class="metrics-chart-empty">Falha ao carregar historico: ${escapeHtml(error.message)}</div>`;
  }
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
        <span>Este collector esta em ${escapeHtml(probe.version || "-")} e a versao atual e ${escapeHtml(probe.latestVersion || "-")}.${probe.updateSupported ? "" : " Atualizacao automatica disponivel apenas para Linux e Windows."}</span>
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

    ${probe.probeType === "network" ? renderProbeSpeedTest(probe) : renderProbeHostMetrics(probe)}

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

  if (probe.probeType === "network") {
    loadProbeSpeedTestHistory(probe.id, els.probeDetailPanel.querySelector(".probe-speedtest-history-body"));
  }
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
  if (els.networkProbeInstallCommand) {
    els.networkProbeInstallCommand.textContent = token ? networkProbeInstallCommand() : "Token ainda nao disponivel.";
  }
  if (els.guideNetworkProbeCommand) {
    els.guideNetworkProbeCommand.textContent = token ? networkProbeInstallCommand() : "Token ainda nao disponivel.";
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
  // Preserva a selecao entre re-renders (snapshot em tempo real chega a cada
  // poucos segundos) — sem isso, o painel de detalhe/acoes do probe fechava
  // sozinho assim que qualquer outro probe reportava resultado.
  if (state.selectedProbeId && !probes.some((probe) => probe.id === state.selectedProbeId)) {
    state.selectedProbeId = null;
  }

  els.probesList.innerHTML = probes.length
    ? probes
        .map(
          (probe) => `
            <article class="probe-card ${probe.updateAvailable ? "outdated" : ""} ${probe.id === state.selectedProbeId ? "selected" : ""}" ${clickableCardAttrs(`Selecionar probe ${probe.name || probe.id}`)} data-probe-id="${escapeHtml(probe.id)}">
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
    const selected = state.probes.find((probe) => probe.id === state.selectedProbeId) || null;
    els.probeDetailPanel.hidden = !selected;
    renderProbeDetail(selected);
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

// isSnmpLink=true (link com interface SNMP escolhida) torna o IP de ping
// opcional — sem essa flag, o atributo required ficava fixo no HTML e
// bloqueava o submit do form (validacao nativa do browser) mesmo quando
// submitNetworkLink ja teria liberado o envio sem IP pra links SNMP.
function renderNetworkTargetInputs(targets = [{ name: "", host: "" }], isSnmpLink = false) {
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
          IP monitorado${isSnmpLink ? " (opcional)" : ""}
          <input data-network-target-host value="${escapeHtml(target.host)}" ${isSnmpLink ? "" : "required"} placeholder="187.91.174.154" />
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
  const isSnmpLink = link.monitorSource === "snmp";
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
  // Links coletados via SNMP nao tem alvo ativo de ping, IP publico, source
  // IP ou agente de probe — mostrar esses campos so confunde (vinham todos
  // em branco, ou pior, com o probe de host errado). Mostra em troca o que
  // faz sentido pra SNMP: dispositivo/fabricante/interface e trafego in/out.
  const connectivitySectionHtml = isSnmpLink
    ? `
      <article class="profile-section">
        <div class="panel-title compact-title">
          <h3>Conectividade</h3>
          <span>${networkStatusLabel(status)}</span>
        </div>
        <div class="profile-stat-grid">
          <div class="detail-stat"><span>Motivo do status</span><strong>${escapeHtml(networkStatusReasonLabel(link))}</strong></div>
          <div class="detail-stat"><span>Interface</span><strong>${escapeHtml(link.snmpIfDescr || link.interfaceName || "-")}</strong></div>
          <div class="detail-stat"><span>Dispositivo</span><strong>${escapeHtml(link.networkDeviceName || "-")}</strong></div>
          <div class="detail-stat"><span>Fabricante</span><strong>${escapeHtml(networkVendorLabel(link.vendor))}</strong></div>
        </div>
      </article>
    `
    : `
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
    `;

  const performanceSectionHtml = isSnmpLink
    ? `
      <article class="profile-section">
        <div class="panel-title compact-title">
          <h3>Trafego</h3>
          <span>${link.snmpLastSampleAt ? formatDate(link.snmpLastSampleAt) : "-"}</span>
        </div>
        <div class="profile-stat-grid">
          <div class="detail-stat"><span>Download</span><strong>${link.snmpInBps == null ? "-" : formatBps(link.snmpInBps)}</strong></div>
          <div class="detail-stat"><span>Upload</span><strong>${link.snmpOutBps == null ? "-" : formatBps(link.snmpOutBps)}</strong></div>
        </div>
      </article>
    `
    : `
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
    `;

  els.networkDetailPanel.innerHTML = `
    <div class="network-detail-header">
      <div>
        <h3>${escapeHtml(link.name)}</h3>
        <span>${escapeHtml([link.groupName, link.provider, link.networkDeviceName].filter(Boolean).join(" · ") || "Sem contexto adicional")}</span>
      </div>
      <span class="status-badge ${networkStatusClass(status)}">${networkStatusLabel(status)}</span>
    </div>
    ${connectivitySectionHtml}
    ${performanceSectionHtml}

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
        ${
          isSnmpLink
            ? ""
            : `
              <div class="detail-stat"><span>Limite latencia</span><strong>${link.degradedLatencyMs || 120} ms</strong></div>
              <div class="detail-stat"><span>Limite perda</span><strong>${link.degradedPacketLossPercent ?? 10}%</strong></div>
            `
        }
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
  // Links SNMP nao tem latencia/perda/jitter (nao usam ping) — quando a
  // empresa so tem esse tipo de link, "Qualidade media" mostra throughput
  // medio em vez de metricas de ping que nunca teriam dado.
  const snmpLinks = links.filter((link) => link.monitorSource === "snmp");
  // Number(null) === 0 em JS — nao pode usar latencyValues aqui (ele conta
  // "0" como amostra valida mesmo quando lastLatencyMs nunca foi definido).
  const useSnmpQuality = links.every((link) => link.lastLatencyMs == null) && snmpLinks.length > 0;
  const snmpInValues = snmpLinks.map((link) => Number(link.snmpInBps)).filter(Number.isFinite);
  const snmpOutValues = snmpLinks.map((link) => Number(link.snmpOutBps)).filter(Number.isFinite);
  const avgSnmpInBps = snmpInValues.length ? Math.round(snmpInValues.reduce((sum, value) => sum + value, 0) / snmpInValues.length) : null;
  const avgSnmpOutBps = snmpOutValues.length ? Math.round(snmpOutValues.reduce((sum, value) => sum + value, 0) / snmpOutValues.length) : null;
  const qualityGridHtml = useSnmpQuality
    ? `
      <div class="network-quality-grid">
        <article><strong>${avgSnmpInBps === null ? "-" : formatBps(avgSnmpInBps)}</strong><span>download medio</span></article>
        <article><strong>${avgSnmpOutBps === null ? "-" : formatBps(avgSnmpOutBps)}</strong><span>upload medio</span></article>
        <article><strong>${counts.online || 0}/${statusTotal}</strong><span>interfaces online</span></article>
      </div>
    `
    : `
      <div class="network-quality-grid">
        <article><strong>${avgLatency === null ? "-" : avgLatency}</strong><span>ms latencia</span></article>
        <article class="${avgLoss && avgLoss > 0 ? "warning" : ""}"><strong>${avgLoss === null ? "-" : avgLoss}</strong><span>% perda</span></article>
        <article><strong>${avgJitter === null ? "-" : avgJitter}</strong><span>ms jitter</span></article>
      </div>
    `;
  const linkQualityRows = links.slice(0, 4).map((link) => {
    const status = link.displayStatus || link.currentStatus || "unknown";
    if (link.monitorSource === "snmp") {
      const inBps = Number(link.snmpInBps);
      const pct = status === "online" ? 100 : status === "degraded" ? 50 : 0;
      return `
        <button type="button" data-network-link-id="${escapeHtml(link.id)}">
          <span>${escapeHtml(link.name)}</span>
          <i aria-hidden="true"><b class="${networkStatusClass(status)}" style="width:${pct}%"></b></i>
          <strong>${Number.isFinite(inBps) ? formatBps(inBps) : "-"}</strong>
        </button>
      `;
    }
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
        ${qualityGridHtml}
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

      <article class="company-insight-card company-bps-card" data-bps-history-group="${escapeHtml(group.id || "none")}">
        <div class="panel-title compact-title">
          <h3>Variacao de velocidade</h3>
          <span>ultimas 72h</span>
        </div>
        <div class="network-bps-history-body">
          <div class="metrics-chart-empty">Carregando...</div>
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
  loadNetworkGroupBpsHistory(group.id || "none", els.networkDetailPanel.querySelector(".network-bps-history-body"));
}

// Grafico de variacao de velocidade (download/upload) na visao de empresa —
// agrega no servidor a banda de todos os links SNMP "featured" da empresa,
// reaproveita o mesmo componente de grafico de linha do historico de CPU/RAM.
async function loadNetworkGroupBpsHistory(groupId, container) {
  if (!container) return;
  try {
    const data = await api(`/api/network/groups/${encodeURIComponent(groupId)}/bps-history`);
    const samples = data.samples || [];
    if (!samples.length) {
      container.innerHTML = `<div class="metrics-chart-empty">Nenhum dado neste periodo ainda.</div>`;
      return;
    }
    container.innerHTML = [
      metricsLineChart(samples, (s) => s.inBps, "var(--accent)", "Download", formatBps),
      metricsLineChart(samples, (s) => s.outBps, "#e8a838", "Upload", formatBps)
    ].join("");
  } catch (error) {
    container.innerHTML = `<div class="metrics-chart-empty">Falha ao carregar historico: ${escapeHtml(error.message)}</div>`;
  }
}

function renderNetworkLinkRow(link) {
  const status = link.displayStatus || link.currentStatus || "unknown";
  const selected = state.selectedNetworkLinkId === link.id ? "selected" : "";
  const statusTone = status === "offline" ? "is-offline" : "";
  const isSnmp = link.monitorSource === "snmp";
  // Quando a RB expoe tabela de rotas via SNMP, quem manda e ela (link.snmpActiveRoute
  // true/false) — e o sinal mais confiavel de qual interface carrega a rota
  // padrao agora, mesmo se duas interfaces tiverem trafego real ao mesmo
  // tempo (ver applyNetworkDeviceSnmpResult no server.js). Sem esse sinal
  // (dispositivo nao expoe ipRouteTable), cai pro heuristico de trafego — e
  // aí o selo ATIVO precisa bater com o que a coluna de trafego mostra
  // (formatBps arredonda pro Mbps mais proximo), senao da pra marcar um link
  // como ativo enquanto ele exibe "0 Mbps", o que parece um bug.
  const hasRouteSignal = link.snmpActiveRoute === true || link.snmpActiveRoute === false;
  const hasActiveTraffic =
    isSnmp &&
    (hasRouteSignal
      ? link.snmpActiveRoute === true
      : state.networkTrafficFallbackActiveLinkIds?.has(link.id) === true);
  const subtitle = [
    link.provider || "Sem operadora",
    link.networkDeviceName || "Sem dispositivo",
    isSnmp ? (link.snmpIfDescr || "Interface SNMP") : networkTargetSummary(link)
  ].filter(Boolean).join(" · ");
  // Links via SNMP nao tem latencia de ping — mostra throughput da interface no lugar.
  const metric = isSnmp
    ? `${formatBps(link.snmpInBps)} ↓ · ${formatBps(link.snmpOutBps)} ↑`
    : `${link.lastLatencyMs ?? "-"} ms`;
  return `
    <button class="network-link-row ${selected} ${statusTone} ${hasActiveTraffic ? "is-active" : ""}" type="button" data-network-link-id="${escapeHtml(link.id)}">
      <span class="status-dot ${networkStatusClass(status)}"></span>
      <div>
        <strong>${escapeHtml(link.name)}${hasActiveTraffic ? `<em class="network-link-active-badge">ATIVO</em>` : ""}</strong>
        <small>${escapeHtml(subtitle)}</small>
      </div>
      <span class="status-badge ${networkStatusClass(status)}">${networkStatusLabel(status)}</span>
      <small>${metric}</small>
    </button>
  `;
}

function networkDeviceStatusClass(status) {
  return status === "unreachable" ? "offline" : status === "ok" ? "online" : "paused";
}

function networkDeviceStatusLabel(status) {
  return { ok: "SNMP OK", unreachable: "SNMP SEM CONTATO" }[status] || "SNMP NAO CONFIGURADO";
}

function renderNetworkDeviceRow(device, featuredLinks = []) {
  const status = device.snmpStatus || "unconfigured";
  // .unifi-device-row so tem estilo definido pra "offline"/"attention"/"unknown"
  // (vocabulario do card UniFi que essa linha reaproveita) — mapeia o status SNMP pra isso.
  const rowClass = status === "unreachable" ? "offline" : status === "unconfigured" ? "unknown" : "";
  const networkProbe = device.networkProbeId ? state.probes.find((item) => item.id === device.networkProbeId) : null;
  const metrics = [
    device.cpuPercent != null ? `CPU ${device.cpuPercent}%` : "",
    device.memPercent != null ? `RAM ${device.memPercent}%` : "",
    networkProbe?.speedTestDownloadMbps != null ? `${networkProbe.speedTestDownloadMbps} Mbps real` : ""
  ].filter(Boolean);
  // Interfaces auto-descobertas via SNMP que o admin ainda nao marcou como WAN
  // (featured) ficam colapsadas aqui — mesmo padrao visual de VM sob host Proxmox.
  const collapsedLinks = (state.networkLinks || []).filter(
    (link) => link.networkDeviceId === device.id && link.featured === false
  );
  const expanded = state.networkDeviceExpanded.has(device.id);
  return `
    <div class="unifi-device-row ${rowClass}" data-network-device-id="${escapeHtml(device.id)}">
      ${
        collapsedLinks.length
          ? `<span class="topology-toggle ${expanded ? "expanded" : ""}" data-network-device-toggle="${escapeHtml(device.id)}" aria-label="${expanded ? "Ocultar interfaces" : "Exibir interfaces"}" aria-expanded="${expanded ? "true" : "false"}"><i aria-hidden="true"></i></span>`
          : `<span class="topology-spacer" aria-hidden="true"></span>`
      }
      <span class="status-dot ${networkDeviceStatusClass(status)}"></span>
      <span class="unifi-device-identity">
        <strong>${escapeHtml(device.name)}</strong>
        <small>${escapeHtml(device.vendor || "generic")} · ${escapeHtml(device.managementIp || "Sem IP")}${collapsedLinks.length ? ` · ${collapsedLinks.length} interface(s) nao destacada(s)` : ""}</small>
      </span>
      <span class="status-badge ${networkDeviceStatusClass(status)}">${networkDeviceStatusLabel(status)}</span>
      <span class="unifi-device-metrics">
        ${metrics.length ? metrics.map((metric) => `<small>${escapeHtml(metric)}</small>`).join("") : "<small>Aguardando coleta</small>"}
      </span>
    </div>
    ${
      // Links destacados (featured) do dispositivo ficam sempre visiveis logo
      // abaixo dele, num bloco a parte — nao atras do toggle de "nao
      // destacadas". Isso evita que, com mais de uma RB na mesma empresa, os
      // links destacados de dispositivos diferentes se misturem numa lista so.
      featuredLinks.length
        ? `<div class="dependency-children network-device-featured-links">${sortedByAlpha(featuredLinks, networkLinkSortLabel).map(renderNetworkLinkRow).join("")}</div>`
        : ""
    }
    ${
      collapsedLinks.length && expanded
        ? `<div class="dependency-children">${sortedByAlpha(collapsedLinks, networkLinkSortLabel).map(renderNetworkLinkRow).join("")}</div>`
        : ""
    }
  `;
}

function renderNetworkCompanySection(group) {
  const links = sortedByAlpha(group.links, networkLinkSortLabel);
  const devices = sortedByAlpha(group.devices || [], (device) => device.name);
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
  // Cada link destacado (featured) e agrupado sob o dispositivo dono dele —
  // com mais de uma RB na mesma empresa (ex: Kompier), isso evita misturar
  // os links de dispositivos diferentes numa lista unica e ambigua.
  const deviceIds = new Set(devices.map((device) => device.id));
  const linksByDeviceId = new Map();
  const linksWithoutDevice = [];
  for (const link of links) {
    if (link.networkDeviceId && deviceIds.has(link.networkDeviceId)) {
      if (!linksByDeviceId.has(link.networkDeviceId)) linksByDeviceId.set(link.networkDeviceId, []);
      linksByDeviceId.get(link.networkDeviceId).push(link);
    } else {
      linksWithoutDevice.push(link);
    }
  }
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
      ${
        devices.length
          ? `<div class="network-company-items">${devices
              .map((device) => renderNetworkDeviceRow(device, linksByDeviceId.get(device.id) || []))
              .join("")}</div>`
          : ""
      }
      ${
        linksWithoutDevice.length
          ? `<div class="network-company-items">${linksWithoutDevice.map(renderNetworkLinkRow).join("")}</div>`
          : ""
      }
    </section>
  `;
}

function applyNetworkProvider(provider) {
  state.networkProvider = provider === "unifi" && state.settings.unifiConfigured ? "unifi" : "connectivity";
  document.querySelectorAll("[data-network-provider]").forEach((button) => {
    button.classList.toggle("active", button.dataset.networkProvider === state.networkProvider);
  });
  if (els.networkConnectivityView) els.networkConnectivityView.hidden = state.networkProvider !== "connectivity";
  if (els.networkUnifiView) els.networkUnifiView.hidden = state.networkProvider !== "unifi";
}

function updateNetworkProviderVisibility() {
  const configured = Boolean(state.settings.unifiConfigured ?? state.unifiNetwork?.configured);
  if (els.networkProviderToggle) els.networkProviderToggle.hidden = !configured;
  const unifiButton = document.querySelector('[data-network-provider="unifi"]');
  if (unifiButton) unifiButton.hidden = !configured;
  if (!configured && state.networkProvider === "unifi") state.networkProvider = "connectivity";
  applyNetworkProvider(state.networkProvider);
}

function unifiStatusLabel(status) {
  return { online: "ONLINE", attention: "ATENCAO", offline: "OFFLINE", unknown: "SEM DADOS" }[status] || "SEM DADOS";
}

function unifiStatusClass(status) {
  return status === "offline" ? "offline" : status === "attention" ? "probe_stale" : status === "online" ? "online" : "paused";
}

function unifiDeviceTypeLabel(type) {
  return { access_point: "Access Point", switch: "Switch", gateway: "Gateway", device: "Dispositivo" }[type] || "Dispositivo";
}

function formatUptimeSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h`;
}

function updateUnifiExpandAllButton() {
  const button = els.unifiContent?.querySelector("[data-unifi-toggle-all]");
  if (!button) return;
  const sites = Array.isArray(state.unifiNetwork?.sites) ? state.unifiNetwork.sites : [];
  const siteIds = sites.map((site) => String(site.id));
  const allExpanded = siteIds.length > 0 && siteIds.every((siteId) => state.unifiExpandedSites.has(siteId));
  button.textContent = allExpanded ? "Recolher todos" : "Expandir todos";
}

function renderUnifiNetwork() {
  if (!els.unifiContent) return;
  const activeUnifiSelect = els.unifiContent.contains(document.activeElement) && document.activeElement.closest("[data-unifi-link-site]");
  const siteListScrollTop = els.unifiContent.querySelector(".unifi-sites-list")?.scrollTop || 0;
  const scrollPositions = {};
  els.unifiContent.querySelectorAll("[data-unifi-scroll-id]").forEach((element) => {
    scrollPositions[element.dataset.unifiScrollId] = element.scrollTop;
  });
  const data = state.unifiNetwork || { configured: false, sites: [], error: null };
  const sites = Array.isArray(data.sites) ? data.sites : [];
  if (els.unifiSyncMeta) {
    els.unifiSyncMeta.textContent = data.error
      ? `Falha na coleta: ${data.error}`
      : data.fetchedAt
      ? `Ultima atualizacao: ${formatDate(data.fetchedAt)}`
      : "Aguardando sincronizacao";
  }
  if (els.unifiSummary) {
    const devices = sites.reduce((sum, site) => sum + Number(site.deviceCount || 0), 0);
    els.unifiSummary.textContent = `${sites.length} sites · ${devices} dispositivos`;
  }
  if (!data.configured) {
    els.unifiContent.innerHTML = `<div class="simple-empty">Configure a API oficial do UniFi Network em Integracoes.</div>`;
    return;
  }
  if (activeUnifiSelect) return;

  const allDevices = sites.flatMap((site) => site.devices || []);
  const online = allDevices.filter((device) => device.status === "online").length;
  const attention = allDevices.filter((device) => device.status === "attention" || device.status === "unknown").length;
  const offline = allDevices.filter((device) => device.status === "offline").length;
  const clients = sites.reduce((sum, site) => sum + Number(site.clientCount || 0), 0);
  const expandedIds = [...state.unifiExpandedSites].sort();
  const renderSignature = JSON.stringify({
    expandedIds,
    admin: isAdmin(),
    groups: isAdmin() ? sortedByAlpha(state.groups, groupSortLabel).map((group) => [group.id, group.name]) : [],
    sites: sortedByAlpha(sites, (site) => site.groupName || site.name).map((site) => {
      const siteId = String(site.id);
      return {
        id: siteId,
        name: site.name,
        groupId: site.groupId,
        groupName: site.groupName,
        deviceCount: site.deviceCount,
        clientCount: site.clientCount,
        counts: site.counts,
        devices: sortedByAlpha(site.devices || [], (device) => device.name).map((device) => ({
            id: device.id,
            name: device.name,
            status: device.status,
            type: device.type,
            model: device.model,
            ipAddress: device.ipAddress,
            cpuUtilizationPct: device.cpuUtilizationPct,
            memoryUtilizationPct: device.memoryUtilizationPct,
            uptimeSeconds: device.uptimeSeconds
          }))
      };
    })
  });
  if (renderSignature === state.unifiRenderSignature && els.unifiContent.querySelector(".unifi-sites-list")) return;
  state.unifiRenderSignature = renderSignature;
  const groupOptionsFor = (selectedGroupId) => sortedByAlpha(state.groups, groupSortLabel)
    .map((group) => `<option value="${escapeHtml(group.id)}" ${String(selectedGroupId || "") === String(group.id) ? "selected" : ""}>${escapeHtml(group.name)}</option>`)
    .join("");

  const sortedSites = sortedByAlpha(sites, (site) => site.groupName || site.name);
  const allSiteIds = sortedSites.map((site) => String(site.id));
  const allSitesExpanded = allSiteIds.length > 0 && allSiteIds.every((siteId) => state.unifiExpandedSites.has(siteId));
  const siteCards = sortedSites
    .map((site) => {
      const siteId = String(site.id);
      const expanded = state.unifiExpandedSites.has(siteId);
      const devices = sortedByAlpha(site.devices || [], (device) => device.name);
      const rows = devices.length
        ? devices
            .map((device) => {
              const metrics = [
                device.cpuUtilizationPct != null ? `CPU ${device.cpuUtilizationPct}%` : "",
                device.memoryUtilizationPct != null ? `RAM ${device.memoryUtilizationPct}%` : "",
                device.uptimeSeconds ? formatUptimeSeconds(device.uptimeSeconds) : ""
              ].filter(Boolean);
              return `
                <div class="unifi-device-row ${device.status}">
                  <span class="status-dot ${unifiStatusClass(device.status)}"></span>
                  <span class="unifi-device-identity">
                    <strong>${escapeHtml(device.name)}</strong>
                    <small>${escapeHtml(unifiDeviceTypeLabel(device.type))} · ${escapeHtml(device.model || "Modelo nao informado")} · ${escapeHtml(device.ipAddress || "Sem IP")}</small>
                  </span>
                  <span class="status-badge ${unifiStatusClass(device.status)}">${unifiStatusLabel(device.status)}</span>
                  <span class="unifi-device-metrics">
                    ${metrics.length ? metrics.map((metric) => `<small>${escapeHtml(metric)}</small>`).join("") : "<small>Sem metricas</small>"}
                  </span>
                </div>
              `;
            })
            .join("")
        : `<div class="simple-empty">Nenhum dispositivo adotado neste site.</div>`;
      return `
        <article class="unifi-site-card ${expanded ? "is-expanded" : ""}" data-unifi-site-id="${escapeHtml(siteId)}">
          <button type="button" class="unifi-site-header" data-unifi-site-toggle aria-expanded="${expanded ? "true" : "false"}">
            <span class="unifi-site-arrow" aria-hidden="true"></span>
            <div class="unifi-site-title">
              <strong>${escapeHtml(site.groupName || site.name)}</strong>
              <span>${escapeHtml(site.name)} · ${site.deviceCount} dispositivos · ${site.clientCount} clientes</span>
            </div>
            <div class="unifi-site-counts">
              <span class="status-badge online">${site.counts?.online || 0} online</span>
              ${site.counts?.attention || site.counts?.unknown ? `<span class="status-badge probe_stale">${(site.counts?.attention || 0) + (site.counts?.unknown || 0)} atencao</span>` : ""}
              ${site.counts?.offline ? `<span class="status-badge offline">${site.counts.offline} offline</span>` : ""}
            </div>
          </button>
          ${
            isAdmin()
              ? `<div class="unifi-site-link" data-unifi-site-panel ${expanded ? "" : "hidden"}>
                  <span>${site.groupId ? "Empresa vinculada" : "Site sem empresa vinculada"}</span>
                  <select class="compact-select" data-unifi-link-site="${escapeHtml(siteId)}">
                    <option value="">Vincular empresa...</option>
                    ${groupOptionsFor(site.groupId)}
                  </select>
                </div>`
              : ""
          }
          <div class="unifi-device-list" data-unifi-site-panel data-unifi-scroll-id="${escapeHtml(siteId)}" ${expanded ? "" : "hidden"}>${rows}</div>
        </article>
      `;
    })
    .join("");

  els.unifiContent.innerHTML = `
    <div class="simple-kpi-row unifi-kpi-row">
      <article class="success"><span>Online</span><strong>${online}</strong><small>dispositivos respondendo</small></article>
      <article class="${attention ? "warning" : "success"}"><span>Atencao</span><strong>${attention}</strong><small>firmware ou estado pendente</small></article>
      <article class="${offline ? "danger" : "success"}"><span>Offline</span><strong>${offline}</strong><small>dispositivos desconectados</small></article>
      <article><span>Clientes</span><strong>${clients}</strong><small>conectados agora</small></article>
    </div>
    ${data.error ? `<div class="integration-warning">A coleta atual falhou; exibindo o ultimo estado valido. ${escapeHtml(data.error)}</div>` : ""}
    <div class="unifi-list-toolbar">
      <span>Sites monitorados</span>
      <button type="button" class="ghost-button compact-action" data-unifi-toggle-all>${allSitesExpanded ? "Recolher todos" : "Expandir todos"}</button>
    </div>
    <div class="unifi-sites-list">${siteCards || `<div class="simple-empty">Nenhum site retornado pela API.</div>`}</div>
  `;
  const siteList = els.unifiContent.querySelector(".unifi-sites-list");
  if (siteList) siteList.scrollTop = siteListScrollTop;
  els.unifiContent.querySelectorAll("[data-unifi-scroll-id]").forEach((element) => {
    const saved = scrollPositions[element.dataset.unifiScrollId];
    if (saved != null) element.scrollTop = saved;
  });
}

async function refreshUnifiData() {
  if (els.refreshUnifiButton) els.refreshUnifiButton.disabled = true;
  try {
    const response = await api("/api/unifi-network/refresh", { method: "POST" });
    state.unifiNetwork = response.unifiNetwork || state.unifiNetwork;
    renderNetworks();
    showToast("UniFi atualizado", "Sites e dispositivos foram consultados agora.");
  } catch (error) {
    showToast("Falha ao atualizar UniFi", error.message);
  } finally {
    if (els.refreshUnifiButton) els.refreshUnifiButton.disabled = false;
  }
}

async function linkUnifiSiteToGroup(siteId, groupId) {
  try {
    const response = await api("/api/unifi-network/link-site", {
      method: "POST",
      body: JSON.stringify({ siteId, groupId: groupId || null })
    });
    state.unifiNetwork = response.unifiNetwork || state.unifiNetwork;
    state.unifiRenderSignature = "";
    renderNetworks();
    showToast("Site vinculado", "O site UniFi foi associado a empresa.");
  } catch (error) {
    showToast("Falha ao vincular site", error.message);
  }
}

function renderNetworkDiscoveryBanner() {
  if (!els.networkDiscoveryBanner) return;
  const suggestions = state.networkDiscoverySuggestions || [];
  if (!isAdmin() || !suggestions.length) {
    els.networkDiscoveryBanner.innerHTML = "";
    return;
  }
  els.networkDiscoveryBanner.innerHTML = suggestions
    .map(
      (suggestion) => `
        <div class="network-discovery-banner">
          <div>
            <strong>Dispositivo de rede detectado automaticamente</strong>
            <small>Gateway ${escapeHtml(suggestion.discoveredGatewayIp)} visto pelo network probe "${escapeHtml(suggestion.probeName)}"</small>
          </div>
          <button class="ghost-button compact" type="button" data-network-discovery-probe-id="${escapeHtml(suggestion.probeId)}" data-network-discovery-ip="${escapeHtml(suggestion.discoveredGatewayIp)}">Cadastrar</button>
        </div>
      `
    )
    .join("");
}

// Quando o dispositivo nao expoe tabela de rotas via SNMP (snmpActiveRoute
// nunca fica definido em nenhum link dele — ex: alguns Fortigate nao
// implementam ipCidrRouteTable), o heuristico de trafego precisa escolher
// SO UM vencedor por dispositivo (o de maior trafego combinado), nao
// qualquer interface que cruze um limite absoluto — senao um link de
// backup com so um pouco de trafego residual (health-check/keepalive)
// tambem acende como ATIVO junto com o link principal.
function computeTrafficFallbackActiveLinkIds(allLinks) {
  const byDevice = new Map();
  for (const link of allLinks) {
    if (link.monitorSource !== "snmp" || !link.networkDeviceId) continue;
    if (!byDevice.has(link.networkDeviceId)) byDevice.set(link.networkDeviceId, []);
    byDevice.get(link.networkDeviceId).push(link);
  }
  const winners = new Set();
  for (const deviceLinks of byDevice.values()) {
    // Se algum link do dispositivo ja tem sinal de rota confirmado
    // (true ou false), a rota manda — nao usa heuristico de trafego pra
    // nenhum link desse dispositivo.
    if (deviceLinks.some((link) => link.snmpActiveRoute === true || link.snmpActiveRoute === false)) continue;
    let best = null;
    for (const link of deviceLinks) {
      const total = Math.max(0, Number(link.snmpInBps) || 0) + Math.max(0, Number(link.snmpOutBps) || 0);
      if (total <= 0) continue;
      if (!best || total > best.total) best = { link, total };
    }
    if (best) winners.add(best.link.id);
  }
  return winners;
}

function renderNetworks() {
  if (!els.networkLinksList) return;
  const allLinks = sortedByAlpha(state.networkLinks || [], networkLinkSortLabel);
  state.networkTrafficFallbackActiveLinkIds = computeTrafficFallbackActiveLinkIds(allLinks);
  // So conta/lista na visualizacao principal os links "featured" — os demais
  // (interfaces auto-descobertas via SNMP ainda nao confirmadas como WAN pelo
  // admin) ficam colapsados sob o dispositivo, ver renderNetworkDeviceRow.
  const links = allLinks.filter((link) => link.featured !== false);
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

  const groups = new Map();
  const ensureGroup = (key) => {
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: key === "none" ? "Sem empresa" : groupLabel(key),
        logoDataUrl: key === "none" ? "" : groupLogo(key),
        links: [],
        devices: []
      });
    }
    return groups.get(key);
  };
  links.forEach((link) => {
    ensureGroup(link.groupId || "none").links.push(link);
  });
  // So mostra na lista dispositivos com SNMP habilitado — sem isso a linha
  // ficaria redundante com o nome do dispositivo ja exibido no subtitulo do link.
  (state.networkDevices || []).filter((device) => device.snmpEnabled).forEach((device) => {
    ensureGroup(device.groupId || "none").devices.push(device);
  });
  renderNetworkDiscoveryBanner();
  const groupedLinks = Array.from(groups.values()).sort((left, right) => {
    if (left.id === "none") return 1;
    if (right.id === "none") return -1;
    return compareAlpha(left.label, right.label);
  });
  els.networkLinksList.innerHTML = groupedLinks.length
    ? groupedLinks.map(renderNetworkCompanySection).join("")
    : `<div class="empty-list">Nenhum link cadastrado ainda.</div>`;
  const selectedGroup = state.selectedNetworkGroupId ? groupedLinks.find((group) => group.id === state.selectedNetworkGroupId) : null;
  if (selectedGroup) renderNetworkCompanyDetail(selectedGroup);
  else renderNetworkDetail(allLinks.find((link) => link.id === state.selectedNetworkLinkId) || null);
  renderUnifiNetwork();
  updateNetworkProviderVisibility();
}

function reportKey() {
  return `${state.report.groupId}:${state.report.days}`;
}

function reportTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (["online", "success", "ok", "resolved"].includes(normalized)) return "good";
  if (["warning", "late", "degraded", "attention"].includes(normalized)) return "warn";
  if (["offline", "error", "overdue", "probe_unreachable"].includes(normalized)) return "bad";
  return "muted";
}

function reportStatusLabel(value) {
  const labels = {
    online: "Online",
    offline: "Offline",
    success: "Sucesso",
    warning: "Atencao",
    error: "Erro",
    late: "Atrasado",
    degraded: "Degradado",
    overdue: "SLA vencido",
    probe_unreachable: "Probe sem contato"
  };
  return labels[String(value || "").toLowerCase()] || "Evento";
}

function reportChartLabel(day, index, total) {
  if (total <= 7 || index === 0 || index === total - 1 || index === Math.floor(total / 2)) {
    return formatDateOnly(day);
  }
  return "";
}

function renderReportBars(trend = [], mode = "backup") {
  const values = trend.map((item) => mode === "backup" ? item.success + item.warning + item.error : item.serverFailures + item.linkProblems);
  const max = Math.max(1, ...values);
  return trend.map((item, index) => {
    const total = values[index];
    const success = mode === "backup" ? item.success : 0;
    const warning = mode === "backup" ? item.warning : item.linkProblems;
    const error = mode === "backup" ? item.error : item.serverFailures;
    const height = total ? Math.max(8, Math.round((total / max) * 100)) : 2;
    const successHeight = total ? Math.round((success / total) * height) : 0;
    const warningHeight = total ? Math.round((warning / total) * height) : 0;
    const errorHeight = Math.max(0, height - successHeight - warningHeight);
    const title = mode === "backup"
      ? `${formatDateOnly(item.day)}: ${success} sucesso, ${warning} atencao, ${error} erro`
      : `${formatDateOnly(item.day)}: ${item.serverFailures} falhas de servidor, ${item.linkProblems} ocorrencias de link`;
    return `<div class="report-bar-column" title="${escapeHtml(title)}">
      <div class="report-bar-stack" style="height:${height}%">
        <i class="report-bar-success" style="height:${successHeight}%"></i>
        <i class="report-bar-warning" style="height:${warningHeight}%"></i>
        <i class="report-bar-error" style="height:${errorHeight}%"></i>
      </div>
      <span>${escapeHtml(reportChartLabel(item.day, index, trend.length))}</span>
    </div>`;
  }).join("");
}

function renderReportMetrics(report) {
  const { coverage, backups, support, availability } = report;
  const serverTotal = coverage.servers.active || coverage.servers.total;
  const serverValue = serverTotal ? `${coverage.servers.online}/${serverTotal}` : "-";
  const linkValue = coverage.links.total ? `${coverage.links.online}/${coverage.links.total}` : "-";
  const backupValue = backups.monitored ? `${backups.success}/${backups.monitored}` : "-";
  const backupTone = backups.error ? "bad" : backups.warning ? "warn" : "good";
  return `<section class="report-kpi-grid">
    <article class="report-kpi-card"><span>Servidores</span><strong class="${coverage.servers.offline ? "is-bad" : "is-good"}">${serverValue}</strong><small>${coverage.servers.offline ? `${coverage.servers.offline} offline` : "respondendo agora"}</small></article>
    <article class="report-kpi-card"><span>Links</span><strong class="${coverage.links.offline ? "is-bad" : coverage.links.degraded ? "is-warn" : "is-good"}">${linkValue}</strong><small>${coverage.links.degraded ? `${coverage.links.degraded} degradado(s)` : coverage.links.offline ? `${coverage.links.offline} offline` : "operacionais"}</small></article>
    <article class="report-kpi-card"><span>Backups</span><strong class="is-${backupTone}">${backupValue}</strong><small>${backups.monitored ? `${backups.successRate ?? 0}% de sucesso` : "sem coleta monitorada"}</small></article>
    <article class="report-kpi-card"><span>Suporte</span><strong class="${support.slaOverdue ? "is-bad" : support.open ? "is-warn" : "is-good"}">${support.open}</strong><small>${support.slaOverdue ? `${support.slaOverdue} SLA vencido(s)` : "chamados em aberto"}</small></article>
    <article class="report-kpi-card"><span>Ocorrencias</span><strong class="${availability.currentlyOffline ? "is-bad" : "is-good"}">${availability.serverFailures + availability.linkProblems}</strong><small>no periodo selecionado</small></article>
  </section>`;
}

function renderReportExceptions(report) {
  const items = report.exceptions || [];
  if (!items.length) return `<div class="report-clear-state"><strong>Sem excecoes em aberto</strong><span>Os ativos e servicos vinculados a esta empresa estao dentro do esperado.</span></div>`;
  return `<div class="report-exception-list">${items.map((item) => `<article class="report-exception report-${reportTone(item.status)}">
    <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.detail || "Sem detalhes adicionais")}</span></div>
    <em>${escapeHtml(reportStatusLabel(item.status))}</em>
  </article>`).join("")}</div>`;
}

function renderReportExpiryItems(report) {
  if (!report.expirations?.length) return `<div class="report-clear-state compact"><strong>Nenhum vencimento proximo</strong><span>Contratos e produtos estao fora da janela de alerta.</span></div>`;
  return `<div class="report-expiry-list">${report.expirations.map((item) => `<div class="report-expiry-row">
    <span>${escapeHtml(item.type)}</span><strong>${escapeHtml(item.label)}</strong><em class="${item.daysLeft < 0 ? "is-bad" : item.daysLeft <= 3 ? "is-warn" : ""}">${item.daysLeft < 0 ? `vencido ha ${Math.abs(item.daysLeft)}d` : item.daysLeft === 0 ? "vence hoje" : `vence em ${item.daysLeft}d`}</em>
  </div>`).join("")}</div>`;
}

async function loadCompanyReport({ force = false } = {}) {
  if (!isAdmin() || !state.report.groupId || state.report.loading) return;
  const key = reportKey();
  if (!force && state.report.loadedKey === key) return;
  state.report.loading = true;
  state.report.error = "";
  renderReports();
  try {
    const payload = await api(`/api/reports/company/${encodeURIComponent(state.report.groupId)}?days=${state.report.days}`);
    if (key !== reportKey()) return;
    state.report.data = payload.report || null;
    state.report.loadedKey = key;
  } catch (error) {
    if (key === reportKey()) state.report.error = error.message;
  } finally {
    if (key === reportKey()) state.report.loading = false;
    renderReports();
  }
}

function renderReports() {
  if (!els.reportContent || !els.reportGroupSelect || !isAdmin()) return;
  const groups = [...state.groups].sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));
  if (!groups.some((group) => group.id === state.report.groupId)) {
    state.report.groupId = groups[0]?.id || "";
    state.report.data = null;
    state.report.loadedKey = "";
  }
  els.reportGroupSelect.innerHTML = groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join("");
  els.reportGroupSelect.value = state.report.groupId;
  els.reportPeriodSelect.value = String(state.report.days);

  if (!state.report.groupId) {
    els.reportContent.innerHTML = `<div class="empty-state"><strong>Nenhuma empresa cadastrada</strong><span>Cadastre uma empresa para gerar o primeiro relatorio.</span></div>`;
    return;
  }

  const key = reportKey();
  if (activeViewName() === "reports" && state.report.loadedKey !== key && !state.report.loading) {
    window.setTimeout(() => loadCompanyReport(), 0);
  }
  if (state.report.loading && !state.report.data) {
    els.reportContent.innerHTML = `<div class="report-loading"><span></span><span></span><span></span><span></span></div>`;
    return;
  }
  if (state.report.error) {
    els.reportContent.innerHTML = `<div class="empty-state"><strong>Nao foi possivel gerar o relatorio</strong><span>${escapeHtml(state.report.error)}</span></div>`;
    return;
  }
  const report = state.report.data;
  if (!report) return;
  const backupRate = report.backups.successRate == null ? "Sem dados" : `${report.backups.successRate}%`;
  const protectedStorage = report.backups.protectedBytes ? formatBytes(report.backups.protectedBytes) : "Sem inventario PBS";
  els.reportContent.innerHTML = `<section class="report-hero">
    <div><span class="eyebrow">Empresa selecionada</span><h2>${escapeHtml(report.company.name)}</h2><p>${report.period.days} dias consolidados ate ${escapeHtml(formatDate(report.generatedAt))}.</p></div>
    <div class="report-hero-status ${report.availability.currentlyOffline ? "is-bad" : report.backups.error ? "is-warn" : "is-good"}"><strong>${report.availability.currentlyOffline ? "Atencao necessaria" : "Operacao acompanhada"}</strong><span>${report.availability.currentlyOffline ? `${report.availability.currentlyOffline} ativo(s) offline agora` : "Sem indisponibilidade confirmada agora"}</span></div>
  </section>
  ${renderReportMetrics(report)}
  <section class="report-visual-grid">
    <article class="report-panel report-chart-panel"><header><div><h3>Saude dos backups</h3><span>Historico diario consolidado</span></div><strong class="is-${report.backups.error ? "bad" : report.backups.warning ? "warn" : "good"}">${backupRate}</strong></header><div class="report-bars">${renderReportBars(report.trends, "backup")}</div><footer><span>Sucesso</span><span>Atencao</span><span>Erro</span></footer></article>
    <article class="report-panel report-chart-panel"><header><div><h3>Eventos de disponibilidade</h3><span>Falhas e ocorrencias de rede</span></div><strong>${report.availability.serverFailures + report.availability.linkProblems}</strong></header><div class="report-bars report-incident-bars">${renderReportBars(report.trends, "availability")}</div><footer><span>Falhas de servidor</span><span>Ocorrencias de link</span></footer></article>
    <article class="report-panel report-coverage-panel"><header><div><h3>Cobertura monitorada</h3><span>Ativos reconhecidos na empresa</span></div></header><div class="report-coverage-rows"><div><span>Servidores</span><strong>${report.coverage.servers.active}/${report.coverage.servers.total || 0}</strong><small>${report.coverage.servers.probe} por probe</small></div><div><span>Links</span><strong>${report.coverage.links.online}/${report.coverage.links.total || 0}</strong><small>${report.coverage.links.degraded} degradado(s)</small></div><div><span>UniFi</span><strong>${report.coverage.unifi.online}/${report.coverage.unifi.devices || 0}</strong><small>${report.coverage.unifi.sites} site(s)</small></div><div><span>Armazenamento PBS</span><strong>${escapeHtml(protectedStorage)}</strong><small>ultimo inventario protegido</small></div></div></article>
  </section>
  <section class="report-detail-grid">
    <article class="report-panel"><header><div><h3>Excecoes para revisar</h3><span>Itens que pedem acompanhamento</span></div><strong>${report.exceptions.length}</strong></header>${renderReportExceptions(report)}</article>
    <article class="report-panel"><header><div><h3>Vencimentos proximos</h3><span>Contratos e produtos vinculados</span></div><strong>${report.expirations.length}</strong></header>${renderReportExpiryItems(report)}</article>
  </section>`;
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
  renderTickets();
  renderProbes();
  renderUsers();
  renderBackups();
  renderReports();
  renderBrandingForm();
  renderAlertSettingsForm();
  renderTicketSlaSettingsForm();
  renderTicketAutomationSettingsForm();
  renderExpirySettingsForm();
  renderBackupIntegrationSettingsForm();
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

function normalizeGroupContractInput(contract = {}) {
  return {
    id: contract.id || "",
    label: contract.label || "",
    startDate: contract.startDate || "",
    endDate: contract.endDate || ""
  };
}

function renderGroupContractInputs(contracts = []) {
  if (!els.groupContractsList) return;
  const normalized = contracts.map(normalizeGroupContractInput).slice(0, 20);
  els.groupContractsList.innerHTML = normalized.length
    ? normalized
        .map(
          (contract) => `
      <div class="group-contract-input-row" data-group-contract-row>
        <input type="hidden" data-group-contract-id value="${escapeHtml(contract.id)}" />
        <label>
          Descricao
          <input data-group-contract-label value="${escapeHtml(contract.label)}" placeholder="Contrato de suporte, backup mensal..." />
        </label>
        <label>
          Inicio (opcional)
          <input type="date" data-group-contract-start value="${escapeHtml(contract.startDate)}" />
        </label>
        <label>
          Fim
          <input type="date" data-group-contract-end value="${escapeHtml(contract.endDate)}" />
        </label>
        <button class="icon-button group-contract-remove" type="button" data-remove-group-contract title="Remover contrato">-</button>
      </div>
    `
        )
        .join("")
    : "";
  if (els.addGroupContract) {
    els.addGroupContract.disabled = normalized.length >= 20;
    els.addGroupContract.title = normalized.length >= 20 ? "Limite de 20 contratos atingido" : "Adicionar contrato";
  }
}

function readGroupContractRows() {
  if (!els.groupContractsList) return [];
  return [...els.groupContractsList.querySelectorAll("[data-group-contract-row]")].map((row) => ({
    id: row.querySelector("[data-group-contract-id]")?.value.trim() || "",
    label: row.querySelector("[data-group-contract-label]")?.value.trim() || "",
    startDate: row.querySelector("[data-group-contract-start]")?.value || "",
    endDate: row.querySelector("[data-group-contract-end]")?.value || ""
  }));
}

function readGroupContractInputs() {
  return readGroupContractRows().filter((contract) => contract.endDate);
}

function addGroupContractInput() {
  const contracts = readGroupContractRows();
  if (contracts.length >= 20) return;
  renderGroupContractInputs([...contracts, {}]);
}

function removeGroupContractInput(button) {
  if (!els.groupContractsList) return;
  const rows = [...els.groupContractsList.querySelectorAll("[data-group-contract-row]")];
  const index = rows.findIndex((row) => row.contains(button));
  if (index === -1) return;
  const contracts = readGroupContractRows();
  contracts.splice(index, 1);
  renderGroupContractInputs(contracts);
}

function renderProductSuggestions() {
  if (!els.productCatalogSuggestions) return;
  els.productCatalogSuggestions.innerHTML = sortedByAlpha(state.productCatalog || [], (product) => product.name)
    .map((product) => `<option value="${escapeHtml(product.name)}"></option>`)
    .join("");
}

function normalizeGroupProductInput(product = {}) {
  return { id: product.id || "", productId: product.productId || "", name: product.name || "", endDate: product.endDate || "" };
}

function renderGroupProductInputs(products = []) {
  if (!els.groupProductsList) return;
  renderProductSuggestions();
  const normalized = products.map(normalizeGroupProductInput).slice(0, 40);
  els.groupProductsList.innerHTML = normalized.length
    ? normalized.map((product) => `
      <div class="group-contract-input-row group-product-input-row" data-group-product-row>
        <input type="hidden" data-group-product-id value="${escapeHtml(product.id)}" />
        <input type="hidden" data-group-product-catalog-id value="${escapeHtml(product.productId)}" />
        <label>
          Produto
          <input data-group-product-name list="productCatalogSuggestions" value="${escapeHtml(product.name)}" placeholder="Ex: Licenca Windows Server" required />
        </label>
        <label>
          Vencimento
          <input type="date" data-group-product-end value="${escapeHtml(product.endDate)}" required />
        </label>
        <button class="icon-button group-contract-remove" type="button" data-remove-group-product title="Remover produto">-</button>
      </div>`).join("")
    : "";
  if (els.addGroupProduct) {
    els.addGroupProduct.disabled = normalized.length >= 40;
    els.addGroupProduct.title = normalized.length >= 40 ? "Limite de 40 produtos atingido" : "Adicionar produto";
  }
}

function readGroupProductRows() {
  if (!els.groupProductsList) return [];
  return [...els.groupProductsList.querySelectorAll("[data-group-product-row]")].map((row) => ({
    id: row.querySelector("[data-group-product-id]")?.value.trim() || "",
    productId: row.querySelector("[data-group-product-catalog-id]")?.value.trim() || "",
    name: row.querySelector("[data-group-product-name]")?.value.trim() || "",
    endDate: row.querySelector("[data-group-product-end]")?.value || ""
  }));
}

function readGroupProductInputs() {
  return readGroupProductRows().filter((product) => product.name || product.endDate);
}

function addGroupProductInput() {
  const products = readGroupProductRows();
  if (products.length >= 40) return;
  renderGroupProductInputs([...products, {}]);
}

function removeGroupProductInput(button) {
  if (!els.groupProductsList) return;
  const rows = [...els.groupProductsList.querySelectorAll("[data-group-product-row]")];
  const index = rows.findIndex((row) => row.contains(button));
  if (index === -1) return;
  const products = readGroupProductRows();
  products.splice(index, 1);
  renderGroupProductInputs(products);
}

function openGroupDialog(group = null) {
  els.groupForm.reset();
  state.groupLogoDraft = group?.logoDataUrl || "";
  els.groupId.value = group?.id || "";
  els.groupDialogTitle.textContent = group ? "Editar empresa" : "Adicionar empresa";
  els.groupName.value = group?.name || "";
  els.groupDescription.value = group?.description || "";
  const selectedContracts = new Set(Array.isArray(group?.contracts) ? group.contracts : []);
  els.groupContractInputs?.forEach((input) => {
    input.checked = selectedContracts.has(input.value);
  });
  renderGroupContractInputs(group?.serviceContracts || []);
  renderGroupProductInputs(group?.products || []);
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

function openNetworkDeviceDialog(device = null, prefill = null) {
  if (!els.networkDeviceDialog || !isAdmin()) return;
  els.networkDeviceForm.reset();
  renderGroupOptions();
  renderProbeOptions();
  els.networkDeviceId.value = device?.id || "";
  els.networkDeviceDialogTitle.textContent = device ? "Editar dispositivo" : "Adicionar dispositivo";
  els.networkDeviceName.value = device?.name || "";
  els.networkDeviceVendor.value = device?.vendor || "mikrotik";
  els.networkDeviceModel.value = device?.model || "";
  els.networkDeviceManagementIp.value = device?.managementIp || prefill?.managementIp || "";
  els.networkDeviceGroup.value = device?.groupId || "";
  if (device?.probeId && state.probes.some((probe) => probe.id === device.probeId)) {
    els.networkDeviceProbe.value = device.probeId;
  }
  if (els.networkDeviceSnmpEnabled) els.networkDeviceSnmpEnabled.checked = device?.snmpEnabled ?? Boolean(prefill?.snmpEnabled);
  if (els.networkDeviceSnmpCommunity) {
    // Padrao operacional: toda community SNMP cadastrada nos equipamentos
    // dos clientes se chama "serverwatch" — pre-preenche pra cadastro novo
    // (valor real, nao so placeholder, pra evitar o erro de ficar em branco
    // achando que "cai" num default que na verdade nunca existiu).
    els.networkDeviceSnmpCommunity.value = device ? "" : "serverwatch";
    els.networkDeviceSnmpCommunity.placeholder = device ? "Deixe em branco para manter a atual" : "serverwatch";
  }
  if (els.networkDeviceSnmpPort) els.networkDeviceSnmpPort.value = device?.snmpPort || 161;
  const networkProbeId = device?.networkProbeId || prefill?.networkProbeId || "";
  if (els.networkDeviceNetworkProbe && networkProbeId && state.probes.some((probe) => probe.id === networkProbeId)) {
    els.networkDeviceNetworkProbe.value = networkProbeId;
  }
  els.networkDeviceNotes.value = device?.notes || "";
  renderNetworkDeviceInterfaceChecklist(device);
  els.networkDeviceDialog.showModal();
}

// Checklist de interfaces descobertas via SNMP no editor do dispositivo —
// marca quais sao WAN de verdade (featured, aparecem na lista principal) e
// quais ficam colapsadas (LAN/VPN/bridge, criadas automaticamente mas fora
// da visualizacao padrao).
function renderNetworkDeviceInterfaceChecklist(device) {
  if (!els.networkDeviceInterfacesSection || !els.networkDeviceInterfaceChecklist) return;
  const interfaces = device?.discoveredInterfaces || [];
  if (!device || !interfaces.length) {
    els.networkDeviceInterfacesSection.hidden = true;
    els.networkDeviceInterfaceChecklist.innerHTML = "";
    return;
  }
  els.networkDeviceInterfacesSection.hidden = false;
  const linksByIfIndex = new Map(
    state.networkLinks.filter((link) => link.networkDeviceId === device.id && link.snmpIfIndex != null).map((link) => [link.snmpIfIndex, link])
  );
  const sorted = [...interfaces].sort((a, b) => a.ifIndex - b.ifIndex);
  els.networkDeviceInterfaceChecklist.innerHTML = sorted
    .map((iface) => {
      const link = linksByIfIndex.get(iface.ifIndex);
      const checked = link ? link.featured !== false : false;
      return `
        <label class="toggle-row">
          <input type="checkbox" data-network-interface-ifindex="${iface.ifIndex}" ${checked ? "checked" : ""} />
          <span>${escapeHtml(iface.ifDescr || `Interface ${iface.ifIndex}`)}</span>
        </label>
      `;
    })
    .join("");
}

function closeNetworkDeviceDialog() {
  els.networkDeviceDialog?.close();
}

function applyNetworkDeviceDefaults() {
  const device = state.networkDevices.find((item) => item.id === els.networkLinkDevice?.value);
  renderNetworkLinkSnmpIfPicker(device, null);
  if (!device) return;
  if (device.groupId && els.networkLinkGroup) els.networkLinkGroup.value = device.groupId;
  if (device.probeId && els.networkLinkProbe && state.probes.some((probe) => probe.id === device.probeId)) {
    els.networkLinkProbe.value = device.probeId;
  }
}

// Preenche o seletor de interfaces com os nomes reais descobertos pelo SNMP
// walk do Network Probe — evita o admin ter que descobrir o ifIndex na mao.
function renderNetworkLinkSnmpIfPicker(device, currentIfIndex) {
  if (!els.networkLinkSnmpIfPicker || !els.networkLinkSnmpIfPickerLabel) return;
  const interfaces = device?.discoveredInterfaces || [];
  if (!interfaces.length) {
    els.networkLinkSnmpIfPickerLabel.hidden = true;
    els.networkLinkSnmpIfPicker.innerHTML = `<option value="">Selecione a interface...</option>`;
    return;
  }
  els.networkLinkSnmpIfPickerLabel.hidden = false;
  const sorted = [...interfaces].sort((a, b) => a.ifIndex - b.ifIndex);
  const options = sorted
    .map(
      (iface) =>
        `<option value="${iface.ifIndex}">${escapeHtml(iface.ifDescr || `Interface ${iface.ifIndex}`)} (ifIndex ${iface.ifIndex})</option>`
    )
    .join("");
  els.networkLinkSnmpIfPicker.innerHTML = `<option value="">Selecione a interface...</option>${options}`;
  if (currentIfIndex != null && sorted.some((iface) => iface.ifIndex === Number(currentIfIndex))) {
    els.networkLinkSnmpIfPicker.value = String(currentIfIndex);
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
  if (els.networkLinkSnmpIfIndex) els.networkLinkSnmpIfIndex.value = link?.snmpIfIndex ?? "";
  renderNetworkLinkSnmpIfPicker(
    state.networkDevices.find((item) => item.id === link?.networkDeviceId),
    link?.snmpIfIndex ?? null
  );
  els.networkLinkType.value = link?.linkType || "internet";
  renderNetworkTargetInputs(link ? networkTargetsForLink(link) : [{ name: "", host: "" }], link?.snmpIfIndex != null);
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
  const activeTab = ["networkProbe"].includes(tab) ? tab : "server";
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
    contracts: [...(els.groupContractInputs || [])].filter((input) => input.checked).map((input) => input.value),
    serviceContracts: readGroupContractInputs(),
    products: readGroupProductInputs(),
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

async function submitProductCatalog(event) {
  event.preventDefault();
  const id = els.productCatalogId?.value || "";
  const name = els.productCatalogName?.value.trim() || "";
  if (!name) return;
  try {
    await api(id ? `/api/product-catalog/${encodeURIComponent(id)}` : "/api/product-catalog", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({ name })
    });
    resetProductCatalogForm();
    applySnapshot(await api("/api/snapshot"));
    showToast(id ? "Produto atualizado" : "Produto adicionado", `${name} esta disponivel para todas as empresas.`);
  } catch (error) {
    showToast("Falha ao salvar produto", error.message);
  }
}

function editProductCatalog(product) {
  if (!product) return;
  els.productCatalogId.value = product.id;
  els.productCatalogName.value = product.name;
  els.saveProductCatalog.textContent = "Salvar produto";
  els.cancelProductCatalogEdit.hidden = false;
  els.productCatalogName.focus();
}

async function deleteProductCatalog(product) {
  if (!product || !window.confirm(`Excluir o produto "${product.name}" do catalogo?`)) return;
  try {
    await api(`/api/product-catalog/${encodeURIComponent(product.id)}`, { method: "DELETE" });
    if (els.productCatalogId.value === product.id) resetProductCatalogForm();
    applySnapshot(await api("/api/snapshot"));
    showToast("Produto excluido", `${product.name} foi removido do catalogo.`);
  } catch (error) {
    showToast("Nao foi possivel excluir", error.message);
  }
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

function upsertTicket(ticket) {
  if (ticket.deletedAt) {
    state.tickets = state.tickets.filter((item) => item.id !== ticket.id);
    if (state.selectedTicketId === ticket.id) state.selectedTicketId = null;
    return;
  }
  const index = state.tickets.findIndex((item) => item.id === ticket.id);
  if (index >= 0) state.tickets[index] = ticket;
  else state.tickets.unshift(ticket);
}

function dateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultTicketResolutionDateTime(priority) {
  if (priority === "low") return "";
  const settings = ticketSlaSettings();
  const hours = priority === "critical" ? settings.urgentHours : settings.normalHours;
  return dateTimeLocalValue(new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
}

function openTicketDialog(ticket = null) {
  els.ticketForm.reset();
  if (els.ticketFormError) els.ticketFormError.textContent = "";
  els.ticketId.value = ticket?.id || "";
  els.ticketDialogTitle.textContent = ticket ? "Editar chamado" : "Adicionar chamado";
  els.ticketTitle.value = ticket?.title || "";
  els.ticketDescription.value = ticket?.description || "";
  els.ticketRequesterName.value = ticket?.requesterName || "";
  els.ticketPriority.value = ticket?.priority || "normal";
  if (els.ticketCategory) els.ticketCategory.value = ticket?.category || "incident";
  if (els.ticketImpact) els.ticketImpact.value = ticket?.impact || "individual";
  if (els.ticketSource) els.ticketSource.value = ticket?.source || "manual";
  if (els.ticketAssetType) els.ticketAssetType.value = ticket?.assetType || "";
  if (els.ticketAssetName) els.ticketAssetName.value = ticket?.assetName || "";
  if (els.ticketFirstResponseDueAt) els.ticketFirstResponseDueAt.value = dateTimeLocalValue(ticket?.firstResponseDueAt);
  if (els.ticketResolutionDueAt) {
    els.ticketResolutionDueAt.value = ticket
      ? dateTimeLocalValue(ticket.resolutionDueAt)
      : defaultTicketResolutionDateTime(els.ticketPriority.value);
  }
  renderTicketGroupOptions();
  els.ticketGroupId.value = ticket?.groupId || "";
  if (els.ticketAssignedTo) {
    const admins = sortedByAlpha(
      state.users.filter((user) => user.role === "admin"),
      (user) => user.name
    );
    els.ticketAssignedTo.innerHTML = `
      <option value="">Sem responsavel</option>
      ${admins.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`).join("")}
    `;
    els.ticketAssignedTo.value = ticket?.assignedTo || "";
  }
  els.ticketDialog.showModal();
}

function closeTicketDialog() {
  els.ticketDialog.close();
}

async function submitTicket(event) {
  event.preventDefault();
  if (els.ticketFormError) els.ticketFormError.textContent = "";
  const id = els.ticketId.value;
  const payload = {
    title: els.ticketTitle.value,
    groupId: els.ticketGroupId.value,
    description: els.ticketDescription.value,
    requesterName: els.ticketRequesterName.value,
    priority: els.ticketPriority.value,
    category: els.ticketCategory?.value || "incident",
    impact: els.ticketImpact?.value || "individual",
    source: els.ticketSource?.value || "manual",
    assetType: els.ticketAssetType?.value || "",
    assetName: els.ticketAssetName?.value || "",
    firstResponseDueAt: els.ticketFirstResponseDueAt?.value || "",
    resolutionDueAt: els.ticketResolutionDueAt?.value || "",
    assignedTo: els.ticketAssignedTo.value
  };
  try {
    const saved = id
      ? await api(`/api/tickets/${id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/tickets", { method: "POST", body: JSON.stringify(payload) });
    upsertTicket(saved);
    selectTicket(saved.id);
    closeTicketDialog();
    showToast("Chamado salvo", `${saved.title} foi salvo com sucesso.`);
  } catch (error) {
    if (els.ticketFormError) els.ticketFormError.textContent = error.message;
    else showToast("Falha ao salvar chamado", error.message);
  }
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", dataUrl: reader.result });
    reader.onerror = () => reject(new Error(`Nao foi possivel ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function submitClientTicket(event) {
  event.preventDefault();
  const form = event.target;
  const errorBox = form.querySelector("[data-client-form-error]");
  if (errorBox) errorBox.textContent = "";
  const files = [...(form.elements.attachments?.files || [])];
  if (files.length > 3 || files.some((file) => file.size > 2 * 1024 * 1024)) {
    if (errorBox) errorBox.textContent = "Envie no maximo 3 arquivos de ate 2 MB cada.";
    return;
  }
  try {
    const attachments = await Promise.all(files.map(fileAsDataUrl));
    const saved = await api("/api/tickets", {
      method: "POST",
      body: JSON.stringify({
        groupId: form.elements.groupId.value,
        location: form.elements.location.value,
        title: form.elements.title.value,
        category: form.elements.category.value,
        priority: form.elements.priority.value,
        description: form.elements.description.value,
        attachments
      })
    });
    upsertTicket(saved);
    selectTicket(saved.id);
    showToast("Chamado aberto", `${ticketReference(saved)} foi enviado para a equipe.`);
  } catch (error) {
    if (errorBox) errorBox.textContent = error.message;
  }
}

async function submitClientReply(event) {
  event.preventDefault();
  const form = event.target;
  const message = form.elements.message.value.trim();
  if (!message) return;
  try {
    const saved = await api(`/api/tickets/${encodeURIComponent(form.dataset.ticketId)}/updates`, {
      method: "POST",
      body: JSON.stringify({ kind: "comment", message })
    });
    upsertTicket(saved);
    renderClientSupport();
    showToast("Mensagem enviada", "A equipe de suporte recebeu sua atualizacao.");
  } catch (error) {
    showToast("Falha ao enviar", error.message);
  }
}

async function closeClientTicket(ticketId) {
  if (!window.confirm("Encerrar este chamado porque o apoio nao e mais necessario?")) return;
  try {
    const saved = await api(`/api/tickets/${encodeURIComponent(ticketId)}/close`, { method: "POST" });
    upsertTicket(saved);
    renderClientSupport();
    showToast("Chamado encerrado", "O encerramento foi registrado no historico.");
  } catch (error) {
    showToast("Falha ao encerrar", error.message);
  }
}

async function deleteTicket(ticket) {
  if (!window.confirm(`Excluir o chamado "${ticket.title}"?`)) return;
  try {
    await api(`/api/tickets/${encodeURIComponent(ticket.id)}`, { method: "DELETE" });
    state.tickets = state.tickets.filter((item) => item.id !== ticket.id);
    if (state.selectedTicketId === ticket.id) state.selectedTicketId = null;
    renderTickets();
    showToast("Chamado removido", `${ticket.title} foi removido.`);
  } catch (error) {
    showToast("Falha ao remover chamado", error.message);
  }
}

async function submitTicketUpdate(event) {
  event.preventDefault();
  const form = event.target;
  const ticketId = form.dataset.ticketId;
  const ticket = state.tickets.find((item) => item.id === ticketId);
  if (ticket?.status === "closed") {
    clearTicketUpdateDraft(ticketId);
    renderTickets();
    showToast("Chamado fechado", "Reabra o chamado antes de adicionar uma atualizacao.");
    return;
  }
  const kind = form.querySelector("#ticketUpdateKind")?.value || "comment";
  const message = form.querySelector("#ticketUpdateMessage")?.value.trim() || "";
  const newStatus = form.querySelector("#ticketUpdateStatus")?.value || "";
  const visibility = form.querySelector("#ticketUpdateInternal")?.checked ? "internal" : "public";
  if (!message) return;
  try {
    const saved = await api(`/api/tickets/${ticketId}/updates`, {
      method: "POST",
      body: JSON.stringify({ kind, message, newStatus: newStatus || undefined, visibility })
    });
    upsertTicket(saved);
    clearTicketUpdateDraft(ticketId);
    document.activeElement?.blur?.();
    renderTickets();
    showToast("Atualizacao adicionada", "O historico do chamado foi atualizado.");
  } catch (error) {
    showToast("Falha ao adicionar atualizacao", error.message);
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
  // Ao criar um dispositivo novo com SNMP habilitado, a community e
  // obrigatoria — o placeholder "public" no campo e so uma dica visual, nao
  // um valor padrao real; deixar em branco salva um dispositivo que nunca
  // vai responder e some do fluxo de erro (ja aconteceu mais de uma vez).
  if (!id && els.networkDeviceSnmpEnabled?.checked && !els.networkDeviceSnmpCommunity?.value) {
    showToast("Informe a community SNMP", "Com coleta SNMP habilitada, a community (v2c) e obrigatoria — deixar em branco nao usa \"public\" automaticamente.");
    els.networkDeviceSnmpCommunity?.focus();
    return;
  }
  const payload = {
    name: els.networkDeviceName.value,
    vendor: els.networkDeviceVendor.value,
    model: els.networkDeviceModel.value,
    managementIp: els.networkDeviceManagementIp.value,
    groupId: els.networkDeviceGroup.value || null,
    probeId: els.networkDeviceProbe.value || null,
    snmpEnabled: els.networkDeviceSnmpEnabled?.checked || false,
    snmpPort: Number(els.networkDeviceSnmpPort?.value) || 161,
    networkProbeId: els.networkDeviceNetworkProbe?.value || null,
    notes: els.networkDeviceNotes.value
  };
  // Campo de senha vazio na edicao = "nao mexer na community atual"; so envia
  // se o admin realmente digitou algo (novo cadastro sempre envia, mesmo vazio,
  // pra permitir limpar/definir explicitamente).
  if (!id || els.networkDeviceSnmpCommunity?.value) {
    payload.snmpCommunity = els.networkDeviceSnmpCommunity?.value || "";
  }
  if (els.networkDeviceInterfacesSection && !els.networkDeviceInterfacesSection.hidden) {
    payload.featuredSnmpIfIndexes = Array.from(
      els.networkDeviceInterfaceChecklist.querySelectorAll("input[data-network-interface-ifindex]:checked")
    ).map((input) => Number(input.dataset.networkInterfaceIfindex));
  }
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
  const isSnmpLink = els.networkLinkSnmpIfIndex?.value !== "" && els.networkLinkSnmpIfIndex?.value != null;
  const rawTargets = readNetworkTargetInputs();
  if (!isSnmpLink && (!rawTargets.length || rawTargets.some((target) => !target.host))) {
    showToast("Informe os IPs", "Cada link cadastrado precisa ter um IP monitorado.");
    return;
  }
  const targets = isSnmpLink ? rawTargets.filter((target) => target.host) : rawTargets;
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
    snmpIfIndex: els.networkLinkSnmpIfIndex?.value !== "" ? Number(els.networkLinkSnmpIfIndex.value) : null,
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
      if (button.dataset.view === "tickets") {
        openTicketQueue();
        setActiveView("tickets", { push: false });
        return;
      }
      setActiveView(button.dataset.view);
    });
  });

  els.reportGroupSelect?.addEventListener("change", () => {
    state.report.groupId = els.reportGroupSelect.value;
    state.report.data = null;
    state.report.loadedKey = "";
    void loadCompanyReport({ force: true });
  });

  els.reportPeriodSelect?.addEventListener("change", () => {
    state.report.days = Number(els.reportPeriodSelect.value) || 30;
    state.report.data = null;
    state.report.loadedKey = "";
    void loadCompanyReport({ force: true });
  });

  els.refreshReportButton?.addEventListener("click", () => {
    void loadCompanyReport({ force: true });
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

  document.addEventListener("mousemove", (event) => {
    const svg = event.target.closest?.(".metrics-chart-svg");
    if (svg) {
      showMetricsChartTooltip(svg, event.clientX, event.clientY);
    } else {
      hideMetricsChartTooltips();
    }
  });

  els.simpleDashboardContent?.addEventListener("click", (event) => {
    const nocSortHeader = eventClosest(event, "[data-noc-sort]");
    if (nocSortHeader?.dataset.nocSort) {
      const column = nocSortHeader.dataset.nocSort;
      if (_nocSort.column === column) {
        _nocSort.direction = _nocSort.direction === "asc" ? "desc" : "asc";
      } else {
        _nocSort.column = column;
        _nocSort.direction = "asc";
      }
      renderNocDashboard();
      return;
    }

    const dashboardCompanyRow = eventClosest(event, "[data-dashboard-company-row]");
    if (dashboardCompanyRow?.dataset.dashboardCompanyRow) {
      const groupId = dashboardCompanyRow.dataset.dashboardCompanyRow;
      state.selectedServerGroupId = groupId;
      state.filters.groupId = groupId;
      if (els.groupFilter) els.groupFilter.value = groupId;
      setActiveView("servers");
      updateActiveFilterCount();
      renderServerDirectory();
      return;
    }

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
    const modeButton = eventClosest(event, "[data-dashboard-mode]");
    if (modeButton?.dataset.dashboardMode) {
      state.dashboardMode = modeButton.dataset.dashboardMode === "complete" ? "complete" : "simple";
      localStorage.setItem("serverwatch.dashboardMode", state.dashboardMode);
      renderSimpleDashboard();
      return;
    }

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
    const deviceToggle = eventClosest(event, "[data-network-device-toggle]");
    if (deviceToggle) {
      event.preventDefault();
      event.stopPropagation();
      const deviceId = deviceToggle.dataset.networkDeviceToggle;
      if (state.networkDeviceExpanded.has(deviceId)) state.networkDeviceExpanded.delete(deviceId);
      else state.networkDeviceExpanded.add(deviceId);
      renderNetworks();
      return;
    }
    const deviceRow = eventClosest(event, "[data-network-device-id]");
    if (deviceRow) {
      const device = state.networkDevices.find((item) => item.id === deviceRow.dataset.networkDeviceId);
      if (device) openNetworkDeviceDialog(device);
      return;
    }
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
      state.filterDraft.status = button.dataset.status;
    });
  });

  els.searchInput.addEventListener("input", () => {
    state.filterDraft.query = els.searchInput.value.trim();
  });

  els.environmentFilter.addEventListener("change", () => {
    state.filterDraft.environment = els.environmentFilter.value;
  });

  els.groupFilter.addEventListener("change", () => {
    state.filterDraft.groupId = els.groupFilter.value;
  });

  els.historyServerFilter?.addEventListener("change", () => {
    state.historyFilters.serverId = els.historyServerFilter.value;
    renderTimeline();
  });

  els.timeline?.addEventListener("click", (event) => {
    const toggle = eventClosest(event, "[data-timeline-group-toggle]");
    if (!toggle) return;
    const body = document.getElementById(toggle.dataset.timelineGroupToggle);
    if (!body) return;
    if (!toggle.dataset.timelineGroupLabel) toggle.dataset.timelineGroupLabel = toggle.textContent;
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? toggle.dataset.timelineGroupLabel : "Ocultar eventos";
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

  els.applyFilters?.addEventListener("click", () => {
    state.filters = { ...state.filterDraft };
    updateActiveFilterCount();
    if (state.filters.groupId !== "all") {
      state.selectedServerGroupId = state.filters.groupId;
      state.selectedServerId = null;
    }
    render();
    if (els.filterMenu) els.filterMenu.open = false;
  });

  els.clearFilters?.addEventListener("click", () => {
    state.filters = { status: "all", environment: "all", groupId: "all", query: "" };
    state.filterDraft = { ...state.filters };
    syncFilterPanelControls(state.filters);
    render();
    if (els.filterMenu) els.filterMenu.open = false;
  });

  els.filterMenu?.addEventListener("toggle", () => {
    if (!els.filterMenu.open) return;
    state.filterDraft = { ...state.filters };
    syncFilterPanelControls(state.filters);
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
  els.networkDiscoveryBanner?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-network-discovery-probe-id]");
    if (!button) return;
    openNetworkDeviceDialog(null, {
      managementIp: button.dataset.networkDiscoveryIp,
      networkProbeId: button.dataset.networkDiscoveryProbeId,
      snmpEnabled: true
    });
  });
  document.querySelector("#openNetworkLinkForm")?.addEventListener("click", () => openNetworkLinkDialog());
  document.querySelector("#closeNetworkDeviceDialog")?.addEventListener("click", closeNetworkDeviceDialog);
  document.querySelector("#cancelNetworkDeviceForm")?.addEventListener("click", closeNetworkDeviceDialog);
  document.querySelector("#closeNetworkLinkDialog")?.addEventListener("click", closeNetworkLinkDialog);
  document.querySelector("#cancelNetworkLinkForm")?.addEventListener("click", closeNetworkLinkDialog);
  els.networkLinkDialog?.addEventListener("click", (event) => closeDialogFromBackdrop(event, closeNetworkLinkDialog));
  els.networkDeviceForm?.addEventListener("submit", submitNetworkDevice);
  els.networkLinkForm?.addEventListener("submit", submitNetworkLink);
  els.networkLinkDevice?.addEventListener("change", applyNetworkDeviceDefaults);
  els.networkLinkSnmpIfPicker?.addEventListener("change", () => {
    const ifIndex = els.networkLinkSnmpIfPicker.value;
    if (!ifIndex) return;
    if (els.networkLinkSnmpIfIndex) els.networkLinkSnmpIfIndex.value = ifIndex;
    // Escolher uma interface SNMP torna o IP de ping opcional — sem isso o
    // required ficava travado no valor renderizado quando o dialog abriu.
    els.networkLinkTarget?.querySelectorAll("[data-network-target-host]").forEach((input) => {
      input.required = false;
    });
    const device = state.networkDevices.find((item) => item.id === els.networkLinkDevice?.value);
    const iface = device?.discoveredInterfaces?.find((item) => item.ifIndex === Number(ifIndex));
    if (iface?.ifDescr && els.networkLinkName && !els.networkLinkName.value.trim()) {
      els.networkLinkName.value = iface.ifDescr;
    }
  });
  els.addNetworkTarget?.addEventListener("click", addNetworkTargetInput);
  els.networkLinkTarget?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-remove-network-target]");
    if (button) removeNetworkTargetInput(button);
  });

  els.addGroupContract?.addEventListener("click", addGroupContractInput);
  els.groupContractsList?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-remove-group-contract]");
    if (button) removeGroupContractInput(button);
  });
  els.addGroupProduct?.addEventListener("click", addGroupProductInput);
  els.groupProductsList?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-remove-group-product]");
    if (button) removeGroupProductInput(button);
  });
  els.groupSearch?.addEventListener("input", () => {
    state.groupSearchQuery = els.groupSearch.value || "";
    renderGroups();
  });
  els.toggleGroupExpiryFilter?.addEventListener("click", () => {
    state.groupExpiringOnly = !state.groupExpiringOnly;
    renderGroups();
  });
  document.querySelectorAll("[data-group-management-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.groupManagementView = button.dataset.groupManagementView === "catalog" ? "catalog" : "companies";
      renderGroups();
    });
  });
  els.productCatalogForm?.addEventListener("submit", submitProductCatalog);
  els.cancelProductCatalogEdit?.addEventListener("click", resetProductCatalogForm);
  els.productCatalogList?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-product-catalog-action]");
    if (!button) return;
    const product = state.productCatalog.find((item) => item.id === button.dataset.id);
    if (!product) return;
    if (button.dataset.productCatalogAction === "edit") editProductCatalog(product);
    if (button.dataset.productCatalogAction === "delete") deleteProductCatalog(product);
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

  els.copyNetworkProbeInstallCommand?.addEventListener("click", () => {
    copyText(networkProbeInstallCommand(), "Comando de instalacao do Network Probe copiado.");
  });

  els.openCommandGeneratorButton?.addEventListener("click", () => openCommandGeneratorDialog("server"));
  els.closeCommandGeneratorDialog?.addEventListener("click", closeCommandGeneratorDialog);
  els.cancelCommandGeneratorDialog?.addEventListener("click", closeCommandGeneratorDialog);
  els.commandGeneratorDialog?.addEventListener("click", (event) => closeDialogFromBackdrop(event, closeCommandGeneratorDialog));
  els.commandGeneratorDialog?.addEventListener("input", () => updateGeneratedCommand());
  els.commandGeneratorDialog?.addEventListener("change", () => updateGeneratedCommand());
  els.refreshGeneratedCommand?.addEventListener("click", () => {
    updateGeneratedCommand();
  });
  els.copyGeneratedCommand?.addEventListener("click", () => {
    copyText(els.generatedCommandOutput?.value || "", "Comando gerado copiado.");
  });
  document.querySelectorAll("[data-command-generator-mode]").forEach((button) => {
    button.addEventListener("click", () => setCommandGeneratorMode(button.dataset.commandGeneratorMode));
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
    if (els.probeDetailPanel) {
      const selected = state.probes.find((item) => item.id === state.selectedProbeId) || null;
      els.probeDetailPanel.hidden = !selected;
      renderProbeDetail(selected);
    }
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

  els.refreshProxmoxBackupsButton?.addEventListener("click", async () => {
    const button = els.refreshProxmoxBackupsButton;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Atualizando...";
    if (els.proxmoxBackupsSyncMeta) els.proxmoxBackupsSyncMeta.textContent = "Consultando o Proxmox Backup Server...";
    try {
      const response = await api("/api/proxmox-backups/refresh", { method: "POST" });
      state.proxmoxBackup = response.proxmoxBackup || state.proxmoxBackup;
      renderBackups();
      showToast("PBS atualizado", "Os dados do Proxmox Backup Server foram atualizados agora.");
    } catch (error) {
      renderBackups();
      showToast("Falha ao atualizar PBS", error.message);
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

  els.closeProxmoxIssuesDialog?.addEventListener("click", () => {
    els.proxmoxIssuesDialog?.close();
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

    if (button.dataset.action === "speed-test") {
      try {
        const response = await api(`/api/probes/${encodeURIComponent(probe.id)}/speed-test`, { method: "POST" });
        state.probes = state.probes.map((item) => (item.id === probe.id ? response.probe : item));
        renderProbes();
        showToast("Teste agendado", `${probe.name || probe.id} vai medir a velocidade real no proximo contato.`);
      } catch (error) {
        showToast("Falha ao agendar teste", error.message);
      }
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

  document.getElementById("proxmoxBackupsContent")?.addEventListener("change", (event) => {
    const nsSelect = event.target.closest("[data-proxmox-link-namespace]");
    if (nsSelect) {
      linkProxmoxNamespaceToGroup(nsSelect.dataset.namespace, nsSelect.value);
      return;
    }
    const serverSelect = event.target.closest("[data-proxmox-link-server]");
    if (serverSelect) {
      linkProxmoxBackupToServer(serverSelect.dataset.namespace, serverSelect.dataset.backupId, serverSelect.value);
    }
  });
  document.getElementById("proxmoxBackupsContent")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-proxmox-issue-open]");
    if (!button) return;
    openProxmoxIssuesDialog(button.dataset.proxmoxIssueOpen);
  });

  document.querySelectorAll("[data-backup-provider]").forEach((button) => {
    button.addEventListener("click", () => {
      applyBackupProvider(button.dataset.backupProvider);
    });
  });
  document.querySelectorAll("[data-network-provider]").forEach((button) => {
    button.addEventListener("click", () => applyNetworkProvider(button.dataset.networkProvider));
  });
  els.brandingForm?.addEventListener("submit", submitBranding);
  els.themeSettingsForm?.addEventListener("submit", submitThemeSettings);
  els.themeModeInputs?.forEach((input) => {
    input.addEventListener("change", () => {
      state.themeDraft = input.value;
    });
  });
  els.alertSettingsForm?.addEventListener("submit", submitAlertSettings);
  els.ticketSlaSettingsForm?.addEventListener("submit", submitTicketSlaSettings);
  els.ticketAutomationSettingsForm?.addEventListener("submit", submitTicketAutomationSettings);
  els.expirySettingsForm?.addEventListener("submit", submitExpirySettings);
  els.ticketPriority?.addEventListener("change", () => {
    if (!els.ticketId?.value && els.ticketResolutionDueAt) {
      els.ticketResolutionDueAt.value = defaultTicketResolutionDateTime(els.ticketPriority.value);
    }
  });
  els.cloudBackupSettingsForm?.addEventListener("submit", submitCloudBackupSettings);
  els.proxmoxSettingsForm?.addEventListener("submit", submitProxmoxSettings);
  els.unifiSettingsForm?.addEventListener("submit", submitUnifiSettings);
  els.refreshUnifiButton?.addEventListener("click", refreshUnifiData);
  els.unifiContent?.addEventListener("change", (event) => {
    const select = event.target.closest("[data-unifi-link-site]");
    if (select) linkUnifiSiteToGroup(select.dataset.unifiLinkSite, select.value);
  });
  els.unifiContent?.addEventListener("click", (event) => {
    const toggleAll = event.target.closest("[data-unifi-toggle-all]");
    if (toggleAll) {
      const sites = Array.isArray(state.unifiNetwork?.sites) ? state.unifiNetwork.sites : [];
      const siteIds = sites.map((site) => String(site.id));
      const allExpanded = siteIds.length > 0 && siteIds.every((siteId) => state.unifiExpandedSites.has(siteId));
      state.unifiExpandedSites = allExpanded ? new Set() : new Set(siteIds);
      state.unifiRenderSignature = "";
      renderUnifiNetwork();
      return;
    }

    const header = event.target.closest("[data-unifi-site-toggle]");
    if (!header || !els.unifiContent.contains(header)) return;
    event.preventDefault();
    const card = header.closest("[data-unifi-site-id]");
    if (!card) return;
    const siteId = card.dataset.unifiSiteId;
    const expanded = !state.unifiExpandedSites.has(siteId);
    if (expanded) state.unifiExpandedSites.add(siteId);
    else state.unifiExpandedSites.delete(siteId);
    state.unifiRenderSignature = "";
    card.classList.toggle("is-expanded", expanded);
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    card.querySelectorAll("[data-unifi-site-panel]").forEach((panel) => {
      panel.hidden = !expanded;
    });
    updateUnifiExpandAllButton();
  });

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
    if (group && button.dataset.groupAction === "report") {
      showToast(
        "Relatorio automatico em desenvolvimento",
        `A geracao de relatorios profissionais para "${group.name}" (picos de uso, comparativos mensais, indisponibilidade) esta no roadmap e ainda nao gera relatorios reais.`
      );
    }
  });

  document.querySelector("#openTicketForm")?.addEventListener("click", () => openTicketDialog());
  els.clientNewTicket?.addEventListener("click", () => {
    state.clientSupportMode = "new";
    renderClientSupport();
  });
  document.querySelector("#changePasswordButton")?.addEventListener("click", requirePasswordChange);
  els.clientSupportContent?.addEventListener("click", (event) => {
    const ticketRow = eventClosest(event, "[data-client-ticket]");
    if (ticketRow) {
      selectTicket(ticketRow.dataset.clientTicket);
      return;
    }
    const action = eventClosest(event, "[data-client-action]");
    if (!action) return;
    if (action.dataset.clientAction === "back") {
      openTicketQueue();
    }
    if (action.dataset.clientAction === "close") closeClientTicket(action.dataset.ticketId);
  });
  els.clientSupportContent?.addEventListener("submit", (event) => {
    if (event.target?.id === "clientTicketForm") submitClientTicket(event);
    if (event.target?.id === "clientReplyForm") submitClientReply(event);
  });
  els.closeTicketDialog?.addEventListener("click", closeTicketDialog);
  els.cancelTicketForm?.addEventListener("click", closeTicketDialog);
  els.ticketForm?.addEventListener("submit", submitTicket);

  els.ticketsList?.addEventListener("click", (event) => {
    const row = eventClosest(event, "[data-ticket-id]");
    if (row) selectTicket(row.dataset.ticketId);
  });

  els.ticketWorkspacePanel?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-ticket-action]");
    if (!button) return;
    if (button.dataset.ticketAction === "back") {
      openTicketQueue();
      return;
    }
    const ticket = state.tickets.find((item) => item.id === button.dataset.id);
    if (ticket && button.dataset.ticketAction === "toggle-update") {
      const current = ticketUpdateDraftFor(ticket.id);
      state.ticketUpdateDraft = current.open ? null : { ...current, open: true };
      renderTicketWorkspace(ticket);
      if (state.ticketUpdateDraft?.open) {
        requestAnimationFrame(() => els.ticketWorkspacePanel?.querySelector("#ticketUpdateMessage")?.focus());
      }
      return;
    }
    if (ticket && button.dataset.ticketAction === "edit") openTicketDialog(ticket);
    if (ticket && button.dataset.ticketAction === "delete") deleteTicket(ticket);
  });

  els.ticketWorkspacePanel?.addEventListener("submit", (event) => {
    if (event.target?.id === "ticketUpdateForm") submitTicketUpdate(event);
  });
  els.ticketWorkspacePanel?.addEventListener("input", (event) => {
    if (event.target?.closest("#ticketUpdateForm")) captureTicketUpdateDraft();
  });
  els.ticketWorkspacePanel?.addEventListener("change", (event) => {
    if (event.target?.closest("#ticketUpdateForm")) captureTicketUpdateDraft();
  });

  els.ticketGroupFilter?.addEventListener("change", () => {
    state.ticketFilters.groupId = els.ticketGroupFilter.value;
    renderTickets();
  });
  els.ticketStatusFilter?.addEventListener("change", () => {
    state.ticketFilters.status = els.ticketStatusFilter.value;
    renderTickets();
  });
  els.ticketPriorityFilter?.addEventListener("change", () => {
    state.ticketFilters.priority = els.ticketPriorityFilter.value;
    renderTickets();
  });
  els.ticketAssigneeFilter?.addEventListener("change", () => {
    state.ticketFilters.assignee = els.ticketAssigneeFilter.value;
    renderTickets();
  });
  els.ticketSearch?.addEventListener("input", () => {
    state.ticketFilters.query = els.ticketSearch.value;
    renderTickets();
  });
  els.ticketQuickFilters?.addEventListener("click", (event) => {
    const button = eventClosest(event, "[data-ticket-quick]");
    if (!button) return;
    state.ticketFilters.quick = button.dataset.ticketQuick || "all";
    els.ticketQuickFilters.querySelectorAll("[data-ticket-quick]").forEach((item) => item.classList.toggle("active", item === button));
    renderTickets();
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
    // Metrics history: toggle panel
    const histToggle = eventClosest(event, "[data-action='toggle-metrics-history']");
    if (histToggle) {
      const section = eventClosest(event, ".metrics-history-section");
      if (!section) return;
      const body = section.querySelector(".metrics-history-body");
      if (!body) return;
      const probeId = section.dataset.historyProbeId;
      if (body.hidden) {
        _mh.open = true;
        _mh.probeId = probeId;
        _mh.type = "short";
        _mh.rangeMs = 6 * 60 * 60_000;
        _mh.chartsHtml = "";
        body.hidden = false;
        histToggle.classList.add("active");
        body.innerHTML = buildMetricsHistoryBody(probeId, _mh.type, _mh.rangeMs);
        loadMetricsHistory(probeId, _mh.type, _mh.rangeMs, body.querySelector(".metrics-charts-area"));
      } else {
        _mh.open = false;
        body.hidden = true;
        histToggle.classList.remove("active");
      }
      return;
    }

    // Metrics history: type tab switch
    const typeTab = eventClosest(event, "[data-mh-type]");
    if (typeTab && typeTab.classList.contains("mh-type-tab")) {
      const section = eventClosest(event, ".metrics-history-section");
      const body = section?.querySelector(".metrics-history-body");
      if (!body) return;
      const probeId = typeTab.dataset.mhProbeId;
      const type = typeTab.dataset.mhType;
      const defaultRange = type === "short" ? 6 * 60 * 60_000 : 30 * 24 * 60 * 60_000;
      _mh.type = type;
      _mh.rangeMs = defaultRange;
      _mh.chartsHtml = "";
      body.innerHTML = buildMetricsHistoryBody(probeId, type, defaultRange);
      loadMetricsHistory(probeId, type, defaultRange, body.querySelector(".metrics-charts-area"));
      return;
    }

    // Metrics history: range tab switch
    const rangeTab = eventClosest(event, "[data-mh-range]");
    if (rangeTab && rangeTab.classList.contains("mh-range-tab")) {
      const section = eventClosest(event, ".metrics-history-section");
      const body = section?.querySelector(".metrics-history-body");
      if (!body) return;
      const probeId = rangeTab.dataset.mhProbeId;
      const type = rangeTab.dataset.mhType;
      const rangeMs = Number(rangeTab.dataset.mhRange);
      _mh.type = type;
      _mh.rangeMs = rangeMs;
      _mh.chartsHtml = "";
      body.innerHTML = buildMetricsHistoryBody(probeId, type, rangeMs);
      loadMetricsHistory(probeId, type, rangeMs, body.querySelector(".metrics-charts-area"));
      return;
    }

    const backupClient = eventClosest(event, "[data-company-backup-client-id]");
    if (backupClient) {
      state.selectedBackupClientId = backupClient.dataset.companyBackupClientId;
      state.backupLinkEditorOpen = null;
      setActiveView("backups");
      renderBackups();
      requestAnimationFrame(() => {
        els.backupsProfilePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

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
  tickLiveDurations();
}, 1000);
