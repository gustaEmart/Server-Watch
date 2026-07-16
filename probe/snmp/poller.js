import { snmpGet, snmpWalk } from "./client.js";
import { IF_MIB, vendorTemplate, detectVendorFromSysObjectId } from "./vendor-templates.js";

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function pollMemoryViaHrStorage(host, port, community, memOids, timeoutMs) {
  const descrRows = await snmpWalk(host, port, community, memOids.hrStorageDescr, { timeoutMs });
  const ramRow = descrRows.find((row) => /physical memory|real memory|main memory|^ram$/i.test(row.value || ""));
  if (!ramRow) return null;
  const index = ramRow.oid.slice(memOids.hrStorageDescr.length + 1);
  if (!index) return null;
  const sizeOid = `${memOids.hrStorageSize}.${index}`;
  const usedOid = `${memOids.hrStorageUsed}.${index}`;
  const result = await snmpGet(host, port, community, [sizeOid, usedOid], { timeoutMs });
  const size = numberOrNull(result[sizeOid]?.value);
  const used = numberOrNull(result[usedOid]?.value);
  if (!size) return null;
  return Math.max(0, Math.min(100, Math.round((used / size) * 100)));
}

async function pollCpuViaHrProcessorLoad(host, port, community, tableOid, timeoutMs) {
  const rows = await snmpWalk(host, port, community, tableOid, { timeoutMs });
  const values = rows.map((row) => numberOrNull(row.value)).filter((value) => value !== null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function pollCpuAndMem(host, port, community, vendor, timeoutMs) {
  const template = vendorTemplate(vendor);
  if (vendor === "mikrotik") {
    return {
      cpuPercent: await pollCpuViaHrProcessorLoad(host, port, community, template.cpuOids.hrProcessorLoadTable, timeoutMs),
      memPercent: await pollMemoryViaHrStorage(host, port, community, template.memOids, timeoutMs)
    };
  }
  if (vendor === "fortigate") {
    const oids = [template.cpuOids.cpuUsage, template.memOids.memUsage];
    const result = await snmpGet(host, port, community, oids, { timeoutMs });
    return {
      cpuPercent: numberOrNull(result[template.cpuOids.cpuUsage]?.value),
      memPercent: numberOrNull(result[template.memOids.memUsage]?.value)
    };
  }
  if (vendor === "pfsense") {
    const oids = [template.cpuOids.cpuIdle, template.memOids.memTotalReal, template.memOids.memAvailReal];
    const result = await snmpGet(host, port, community, oids, { timeoutMs });
    const idle = numberOrNull(result[template.cpuOids.cpuIdle]?.value);
    const total = numberOrNull(result[template.memOids.memTotalReal]?.value);
    const avail = numberOrNull(result[template.memOids.memAvailReal]?.value);
    return {
      cpuPercent: idle !== null ? Math.max(0, Math.min(100, 100 - idle)) : null,
      memPercent: total ? Math.max(0, Math.min(100, Math.round(100 * (1 - avail / total)))) : null
    };
  }
  // generico — HOST-RESOURCES-MIB, funciona pra qualquer agente que a exponha
  return {
    cpuPercent: await pollCpuViaHrProcessorLoad(host, port, community, template.cpuOids.hrProcessorLoadTable, timeoutMs),
    memPercent: await pollMemoryViaHrStorage(host, port, community, template.memOids, timeoutMs)
  };
}

async function pollInterface(host, port, community, snmpIfIndex, timeoutMs) {
  const oids = {
    ifDescr: `${IF_MIB.ifDescr}.${snmpIfIndex}`,
    ifOperStatus: `${IF_MIB.ifOperStatus}.${snmpIfIndex}`,
    ifHCInOctets: `${IF_MIB.ifHCInOctets}.${snmpIfIndex}`,
    ifHCOutOctets: `${IF_MIB.ifHCOutOctets}.${snmpIfIndex}`,
    ifInOctets32: `${IF_MIB.ifInOctets32}.${snmpIfIndex}`,
    ifOutOctets32: `${IF_MIB.ifOutOctets32}.${snmpIfIndex}`
  };
  const result = await snmpGet(host, port, community, Object.values(oids), { timeoutMs });
  const hcIn = numberOrNull(result[oids.ifHCInOctets]?.value);
  const hcOut = numberOrNull(result[oids.ifHCOutOctets]?.value);
  const in32 = numberOrNull(result[oids.ifInOctets32]?.value);
  const out32 = numberOrNull(result[oids.ifOutOctets32]?.value);
  return {
    ifDescr: result[oids.ifDescr]?.value || "",
    ifOperStatus: numberOrNull(result[oids.ifOperStatus]?.value) ?? 0,
    inOctets: hcIn && hcIn > 0 ? hcIn : in32,
    outOctets: hcOut && hcOut > 0 ? hcOut : out32
  };
}

// ipCidrRouteTable (RFC2096) — testado ao vivo contra RouterOS: a legacy
// ipRouteTable (1.3.6.1.2.1.4.21) NAO existe no RouterOS, so essa. Indexada
// por dest+mask+tos+nextHop, entao pode ter VARIAS rotas 0.0.0.0/0 ao mesmo
// tempo (ex: WAN principal + backup) — a de menor ipCidrRouteMetric1
// (distance no RouterOS) e a preferida/ativa.
const IP_CIDR_ROUTE_ENTRY_BASE = "1.3.6.1.2.1.4.24.4.1";
const IP_CIDR_ROUTE_COL_DEST = "1";
const IP_CIDR_ROUTE_COL_MASK = "2";
const IP_CIDR_ROUTE_COL_NEXTHOP = "4";
const IP_CIDR_ROUTE_COL_IFINDEX = "5";
const IP_CIDR_ROUTE_COL_TYPE = "6"; // 3 = direct/local, 4 = indirect (via gateway)
const IP_CIDR_ROUTE_COL_METRIC1 = "11";

function ipToInt(ip) {
  const parts = String(ip || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

async function pollActiveRouteIfIndex(host, port, community, timeoutMs) {
  try {
    // Um unico walk na entry inteira traz todas as colunas de todas as
    // linhas (GETBULK percorre em ordem: coluna 1 completa, depois coluna
    // 2, etc) — bem mais barato que um walk por coluna.
    const rows = await snmpWalk(host, port, community, IP_CIDR_ROUTE_ENTRY_BASE, { timeoutMs });
    const bySuffix = new Map();
    for (const row of rows) {
      const rest = row.oid.slice(IP_CIDR_ROUTE_ENTRY_BASE.length + 1);
      const dotIndex = rest.indexOf(".");
      if (dotIndex === -1) continue;
      const column = rest.slice(0, dotIndex);
      const suffix = rest.slice(dotIndex + 1);
      if (!bySuffix.has(suffix)) bySuffix.set(suffix, {});
      bySuffix.get(suffix)[column] = row.value;
    }
    const routeRows = Array.from(bySuffix.values());
    const defaultCandidates = routeRows.filter(
      (entry) => entry[IP_CIDR_ROUTE_COL_DEST] === "0.0.0.0" && entry[IP_CIDR_ROUTE_COL_MASK] === "0.0.0.0"
    );
    if (!defaultCandidates.length) return null;
    defaultCandidates.sort(
      (a, b) => (numberOrNull(a[IP_CIDR_ROUTE_COL_METRIC1]) ?? Infinity) - (numberOrNull(b[IP_CIDR_ROUTE_COL_METRIC1]) ?? Infinity)
    );
    const active = defaultCandidates[0];
    const directIfIndex = numberOrNull(active[IP_CIDR_ROUTE_COL_IFINDEX]);
    if (directIfIndex) return directIfIndex; // agente ja reporta certo (ex: pfSense/FortiGate)

    // RouterOS reporta ifIndex=0 pra rotas indiretas — acha o ifIndex de
    // verdade batendo o proximo salto (gateway) contra a rota DIRETA cuja
    // subrede o contem.
    const nextHopInt = ipToInt(active[IP_CIDR_ROUTE_COL_NEXTHOP]);
    if (nextHopInt == null) return null;
    for (const entry of routeRows) {
      if (Number(entry[IP_CIDR_ROUTE_COL_TYPE]) !== 3) continue;
      const destInt = ipToInt(entry[IP_CIDR_ROUTE_COL_DEST]);
      const maskInt = ipToInt(entry[IP_CIDR_ROUTE_COL_MASK]);
      if (destInt == null || maskInt == null) continue;
      if (((nextHopInt & maskInt) >>> 0) === ((destInt & maskInt) >>> 0)) {
        return numberOrNull(entry[IP_CIDR_ROUTE_COL_IFINDEX]) || null;
      }
    }
    return null;
  } catch {
    // agente nao expoe ipCidrRouteTable — sem sinal de rota, quem chama cai
    // pro heuristico de trafego.
    return null;
  }
}

// fgSdwan health-check table (tabela proprietaria da Fortinet, nao presente
// na MIB publica documentada — descoberta via snmpwalk ao vivo contra um
// FortiGate real). Reporta perda de pacote por MEMBRO do SD-WAN a partir do
// health-check ativo (ex: protocolo g711), o MESMO sinal que a GUI do
// FortiGate usa pra marcar wan1/wan2 como up/down — muito mais confiavel
// nesse fabricante do que inferir por ipCidrRouteTable ou trafego.
const FORTIGATE_SDWAN_HEALTH_BASE = "1.3.6.1.4.1.12356.101.4.9.2.1";
const FORTIGATE_SDWAN_COL_MEMBER_NAME = "14";
const FORTIGATE_SDWAN_COL_PACKET_LOSS = "9";

async function pollFortigateSdwanActiveIfIndex(host, port, community, timeoutMs) {
  try {
    const rows = await snmpWalk(host, port, community, FORTIGATE_SDWAN_HEALTH_BASE, { timeoutMs, maxRows: 500 });
    const bySuffix = new Map();
    for (const row of rows) {
      const rest = row.oid.slice(FORTIGATE_SDWAN_HEALTH_BASE.length + 1);
      const dotIndex = rest.indexOf(".");
      if (dotIndex === -1) continue;
      const column = rest.slice(0, dotIndex);
      const suffix = rest.slice(dotIndex + 1);
      if (column !== FORTIGATE_SDWAN_COL_MEMBER_NAME && column !== FORTIGATE_SDWAN_COL_PACKET_LOSS) continue;
      if (!bySuffix.has(suffix)) bySuffix.set(suffix, {});
      bySuffix.get(suffix)[column] = row.value;
    }
    const members = Array.from(bySuffix.values()).filter((entry) => entry[FORTIGATE_SDWAN_COL_MEMBER_NAME]);
    if (!members.length) return null;
    members.sort(
      (a, b) =>
        (numberOrNull(a[FORTIGATE_SDWAN_COL_PACKET_LOSS]) ?? 100) - (numberOrNull(b[FORTIGATE_SDWAN_COL_PACKET_LOSS]) ?? 100)
    );
    const best = members[0];
    const bestLoss = numberOrNull(best[FORTIGATE_SDWAN_COL_PACKET_LOSS]);
    if (bestLoss != null && bestLoss >= 100) return null; // todos os membros down — sem vencedor confiavel, cai pro heuristico de trafego
    const memberName = String(best[FORTIGATE_SDWAN_COL_MEMBER_NAME] || "").trim().toLowerCase();
    if (!memberName) return null;

    // ifDescr costuma vir vazio/generico no FortiGate — ifName (ifXTable) e
    // quem traz o nome amigavel ("wan1"/"wan2") que bate com o da tabela SD-WAN.
    const nameRows = await snmpWalk(host, port, community, IF_MIB.ifName, { timeoutMs, maxRows: 200 });
    for (const row of nameRows) {
      const ifIndex = Number(row.oid.slice(IF_MIB.ifName.length + 1));
      if (Number.isFinite(ifIndex) && String(row.value || "").trim().toLowerCase() === memberName) {
        return ifIndex;
      }
    }
    return null;
  } catch {
    // tabela SD-WAN indisponivel (fabricante diferente, ou FortiGate sem
    // SD-WAN configurado) — quem chama cai pro ipCidrRouteTable generico.
    return null;
  }
}

// Varre a tabela ifDescr inteira do dispositivo — usado pra alimentar o
// seletor de interfaces na UI (o admin escolhe pelo nome real da interface
// em vez de precisar descobrir o ifIndex na mao via SNMP walk manual).
export async function discoverInterfaces(host, port, community, timeoutMs) {
  const rows = await snmpWalk(host, port, community, IF_MIB.ifDescr, { timeoutMs, maxRows: 200 });
  return rows
    .map((row) => {
      const ifIndex = Number(row.oid.slice(IF_MIB.ifDescr.length + 1));
      return Number.isFinite(ifIndex) ? { ifIndex, ifDescr: String(row.value || "").slice(0, 200) } : null;
    })
    .filter(Boolean);
}

export async function pollDevice(target, timeoutMs) {
  const { deviceId, managementIp: host, snmpPort: port, snmpCommunity: community, vendor, interfaces } = target;
  const checkedAt = new Date().toISOString();
  let detectedVendor = null;
  try {
    const sys = await snmpGet(host, port, community, [IF_MIB.sysObjectID], { timeoutMs });
    const sysObjectId = sys[IF_MIB.sysObjectID]?.value;
    if (sysObjectId) detectedVendor = detectVendorFromSysObjectId(sysObjectId);
  } catch {
    // fingerprint eh best-effort — se falhar aqui, o resto da coleta ainda tenta rodar
  }

  let discoveredInterfaces = [];
  try {
    discoveredInterfaces = await discoverInterfaces(host, port, community, timeoutMs);
  } catch {
    // descoberta de interfaces eh best-effort — nao bloqueia o resto da coleta
  }

  // Best-effort tambem — nem todo agente expoe ipRouteTable; nesse caso fica
  // null e quem consome o resultado cai pro heuristico de trafego. No
  // FortiGate, a tabela de health-check do SD-WAN e um sinal mais confiavel
  // que a rota generica (reflete o resultado do health-check ativo, igual a
  // GUI), entao ela e tentada primeiro pra esse fabricante.
  let activeRouteIfIndex = null;
  if (vendor === "fortigate") {
    activeRouteIfIndex = await pollFortigateSdwanActiveIfIndex(host, port, community, timeoutMs);
  }
  if (activeRouteIfIndex == null) {
    activeRouteIfIndex = await pollActiveRouteIfIndex(host, port, community, timeoutMs);
  }

  const interfaceResults = [];
  for (const iface of interfaces || []) {
    try {
      const data = await pollInterface(host, port, community, iface.snmpIfIndex, timeoutMs);
      interfaceResults.push({ linkId: iface.linkId, checkedAt, ...data });
    } catch (error) {
      interfaceResults.push({ linkId: iface.linkId, checkedAt, ifOperStatus: 0, error: error.message });
    }
  }

  try {
    const { cpuPercent, memPercent } = await pollCpuAndMem(host, port, community, vendor, timeoutMs);
    return { deviceId, snmpStatus: "ok", cpuPercent, memPercent, detectedVendor, discoveredInterfaces, interfaceResults, activeRouteIfIndex };
  } catch (error) {
    return {
      deviceId,
      snmpStatus: "unreachable",
      cpuPercent: null,
      memPercent: null,
      activeRouteIfIndex,
      detectedVendor,
      discoveredInterfaces,
      error: error.message,
      interfaceResults
    };
  }
}
