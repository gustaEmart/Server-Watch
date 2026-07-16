// Templates de OID por fabricante. Isolado nesse arquivo de proposito: os
// valores abaixo sao ponto de partida (nao verificados contra hardware real
// nesta sessao) — se um fabricante retornar CPU/RAM errados ou "unreachable"
// mesmo com SNMP acessivel, a correcao e um diff de uma linha aqui, sem tocar
// no cliente SNMP nem no coletor.

// IF-MIB — status/trafego de interface, comum a qualquer equipamento SNMP,
// usado pra todos os fabricantes (incluindo o fallback generico).
export const IF_MIB = {
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8", // 1 = up, 2 = down, ...
  ifInOctets32: "1.3.6.1.2.1.2.2.1.10", // fallback 32-bit
  ifOutOctets32: "1.3.6.1.2.1.2.2.1.16",
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6", // preferido, 64-bit (IF-MIB high-capacity)
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10",
  // ifName (ifXTable) — em alguns fabricantes (ex: FortiGate) o ifDescr
  // legado vem vazio/generico, mas ifName traz o nome amigavel real
  // (ex: "wan1"/"wan2"), usado pra casar com nomes de outras tabelas.
  ifName: "1.3.6.1.2.1.31.1.1.1.1",
  sysObjectID: "1.3.6.1.2.1.1.2.0",
  sysDescr: "1.3.6.1.2.1.1.1.0"
};

export const VENDOR_OID_TEMPLATES = {
  mikrotik: {
    // .1.3.6.1.4.1.14988.1.1.3.14.0 (mtxrHlCpuFrequency) foi testado contra
    // hardware real (RB760iGS) e retorna a frequencia do clock em MHz (880),
    // nao a carga — RouterOS nao expoe carga de CPU nessa MIB proprietaria.
    // Usa HOST-RESOURCES-MIB hrProcessorLoad (mesma tabela do template
    // generico), que RouterOS implementa corretamente e foi validado ao vivo.
    cpuOids: { hrProcessorLoadTable: "1.3.6.1.2.1.25.3.3.1.2" },
    // HOST-RESOURCES-MIB hrStorage — RouterOS tambem expoe essa MIB padrao;
    // walk e filtra a entrada cuja descricao contenha "RAM"/"Memory".
    memOids: {
      hrStorageDescr: "1.3.6.1.2.1.25.2.3.1.3",
      hrStorageSize: "1.3.6.1.2.1.25.2.3.1.5",
      hrStorageUsed: "1.3.6.1.2.1.25.2.3.1.6"
    },
    sysObjectIdPrefix: "1.3.6.1.4.1.14988"
  },
  fortigate: {
    // FORTINET-FORTIGATE-MIB — ja vem como percentual, sem calculo adicional.
    cpuOids: { cpuUsage: "1.3.6.1.4.1.12356.101.4.1.3.0" },
    memOids: { memUsage: "1.3.6.1.4.1.12356.101.4.1.4.0" },
    sysObjectIdPrefix: "1.3.6.1.4.1.12356"
  },
  pfsense: {
    // UCD-SNMP-MIB (net-snmp, base do pfSense/FreeBSD) — cpuPercent = 100 - idle.
    cpuOids: {
      cpuUser: "1.3.6.1.4.1.2021.11.9.0",
      cpuSystem: "1.3.6.1.4.1.2021.11.10.0",
      cpuIdle: "1.3.6.1.4.1.2021.11.11.0"
    },
    // memPercent = 100 * (1 - memAvailReal/memTotalReal).
    memOids: {
      memTotalReal: "1.3.6.1.4.1.2021.4.5.0",
      memAvailReal: "1.3.6.1.4.1.2021.4.6.0"
    },
    // Prefixo do agente net-snmp — nao especifico do pfSense/FreeBSD, tratar
    // como pista fraca no fingerprint (sysDescr geralmente basta pra desambiguar).
    sysObjectIdPrefix: "1.3.6.1.4.1.8072"
  },
  generic: {
    // HOST-RESOURCES-MIB hrProcessorLoad — walk da tabela, media entre os cores.
    cpuOids: { hrProcessorLoadTable: "1.3.6.1.2.1.25.3.3.1.2" },
    // HOST-RESOURCES-MIB hrStorage — mesma tabela usada pro Mikrotik, generico
    // por definicao (qualquer agente HOST-RESOURCES-MIB expoe isso).
    memOids: {
      hrStorageDescr: "1.3.6.1.2.1.25.2.3.1.3",
      hrStorageSize: "1.3.6.1.2.1.25.2.3.1.5",
      hrStorageUsed: "1.3.6.1.2.1.25.2.3.1.6"
    }
  }
};

const KNOWN_VENDORS = new Set(["mikrotik", "fortigate", "pfsense"]);

/**
 * Tenta identificar o fabricante a partir do sysObjectID (prefixo) — usado
 * como confirmacao/auto-preenchimento quando o admin deixa vendor em branco
 * ou como "generic". Nao decide sozinho: o admin sempre pode sobrescrever.
 */
export function detectVendorFromSysObjectId(sysObjectId) {
  const value = String(sysObjectId || "").replace(/^\.+/, "");
  for (const vendor of KNOWN_VENDORS) {
    const prefix = VENDOR_OID_TEMPLATES[vendor].sysObjectIdPrefix;
    if (value === prefix || value.startsWith(`${prefix}.`)) return vendor;
  }
  return "generic";
}

export function vendorTemplate(vendor) {
  return VENDOR_OID_TEMPLATES[vendor] || VENDOR_OID_TEMPLATES.generic;
}
