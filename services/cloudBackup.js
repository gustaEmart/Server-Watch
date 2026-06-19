const API_BASE = "https://mspclouds.com/api/v1/cloudbackup/reports/summary";

function emptyStatus() {
  return { info: 0, success: 0, warning: 0, error: 0, nomon: 0, total: 0 };
}

function normalizeStatus(raw) {
  return {
    info: Number(raw?.info) || 0,
    success: Number(raw?.success) || 0,
    warning: Number(raw?.warning) || 0,
    error: Number(raw?.error) || 0,
    nomon: Number(raw?.nomon) || 0,
    total: Number(raw?.total) || 0
  };
}

function normalizeBackupSet(raw) {
  return {
    status: raw?.status || "unknown",
    loginDescription: raw?.login_description || raw?.login_name || "",
    backupSetName: raw?.backup_set_name || "",
    destinationName: raw?.destination_name || "",
    lastBackupJobDate: raw?.last_backup_job_date || null,
    lastJobStatusDescription: raw?.last_backup_job_status_description || "",
    lastSuccessBackupJobDate: raw?.last_success_backup_job_date || null
  };
}

function normalizeClient(raw) {
  const backupsets = Array.isArray(raw?.backupsets) ? raw.backupsets : [];
  const backupSets = backupsets.map(normalizeBackupSet);
  return {
    id: raw?.id ?? null,
    name: raw?.name || "Cliente sem nome",
    logo: raw?.logo || null,
    status: normalizeStatus(raw?.status),
    backupSets,
    issues: backupSets.filter((item) => item.status !== "success")
  };
}

export function normalizeCloudBackupReport(raw) {
  return {
    configured: true,
    fetchedAt: new Date().toISOString(),
    error: null,
    company: raw?.company
      ? { id: raw.company.id ?? null, name: raw.company.name || "", logo: raw.company.logo || null }
      : null,
    status: normalizeStatus(raw?.status),
    clients: Array.isArray(raw?.clients) ? raw.clients.map(normalizeClient) : []
  };
}

export async function fetchCloudBackupSummary(apiKey) {
  const url = `${API_BASE}?api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Cloud Backup API respondeu ${response.status}`);
  }
  const raw = await response.json();
  return normalizeCloudBackupReport(raw);
}

export function emptyCloudBackupState() {
  return {
    configured: false,
    fetchedAt: null,
    error: null,
    company: null,
    status: emptyStatus(),
    clients: []
  };
}
