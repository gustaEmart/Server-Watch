// Cliente SNMPv2c minimo, escrito a mao com node:dgram (sem dependencias npm) —
// o Network Probe nunca roda "npm install", so copia arquivos .js, entao esse
// modulo precisa continuar zero-dependency. Cobre so o necessario: GET e
// GETBULK (usado tanto para consultas pontuais quanto para varrer tabelas como
// IF-MIB/HOST-RESOURCES-MIB), sem SET e sem GETNEXT manual.

import dgram from "node:dgram";
import crypto from "node:crypto";

const TAG = {
  INTEGER: 0x02,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OBJECT_IDENTIFIER: 0x06,
  SEQUENCE: 0x30,
  IP_ADDRESS: 0x40,
  COUNTER32: 0x41,
  GAUGE32: 0x42,
  TIME_TICKS: 0x43,
  OPAQUE: 0x44,
  COUNTER64: 0x46,
  NO_SUCH_OBJECT: 0x80,
  NO_SUCH_INSTANCE: 0x81,
  END_OF_MIB_VIEW: 0x82,
  GET_REQUEST: 0xa0,
  GETNEXT_REQUEST: 0xa1,
  GET_RESPONSE: 0xa2,
  SET_REQUEST: 0xa3,
  GETBULK_REQUEST: 0xa5
};

// ---------------------------------------------------------------------------
// BER: comprimento
// ---------------------------------------------------------------------------

function encodeLength(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function decodeLength(buf, offset) {
  const first = buf[offset];
  if ((first & 0x80) === 0) return { length: first, next: offset + 1 };
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = length * 256 + buf[offset + 1 + i];
  return { length, next: offset + 1 + numBytes };
}

function tlv(tag, valueBuf) {
  return Buffer.concat([Buffer.from([tag]), encodeLength(valueBuf.length), valueBuf]);
}

function readTlv(buf, offset) {
  const tag = buf[offset];
  const { length, next } = decodeLength(buf, offset + 1);
  return { tag, length, value: buf.subarray(next, next + length), next: next + length };
}

// ---------------------------------------------------------------------------
// BER: inteiros (assinado, usado em version/request-id/error-status/error-index;
// nao-assinado, usado em Counter32/Gauge32/TimeTicks/Counter64)
// ---------------------------------------------------------------------------

function encodeSignedInteger(value) {
  let big = BigInt(value);
  if (big === 0n) return Buffer.from([0]);
  const bytes = [];
  if (big > 0n) {
    let n = big;
    while (n > 0n) {
      bytes.unshift(Number(n & 0xffn));
      n >>= 8n;
    }
    if (bytes[0] & 0x80) bytes.unshift(0);
  } else {
    let k = 1;
    while (big < -(1n << BigInt(8 * k - 1))) k++;
    let n = (1n << BigInt(8 * k)) + big;
    for (let i = 0; i < k; i++) {
      bytes.unshift(Number(n & 0xffn));
      n >>= 8n;
    }
  }
  return Buffer.from(bytes);
}

function decodeSignedInteger(buf) {
  if (!buf.length) return 0n;
  const negative = (buf[0] & 0x80) !== 0;
  if (!negative) {
    let big = 0n;
    for (const b of buf) big = (big << 8n) | BigInt(b);
    return big;
  }
  let inverted = 0n;
  for (const b of buf) inverted = (inverted << 8n) | BigInt((~b) & 0xff);
  return -(inverted + 1n);
}

function encodeUnsignedInteger(value) {
  let big = BigInt(value);
  if (big < 0n) throw new Error("encodeUnsignedInteger: valor deve ser nao-negativo");
  if (big === 0n) return Buffer.from([0]);
  const bytes = [];
  let n = big;
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  if (bytes[0] & 0x80) bytes.unshift(0);
  return Buffer.from(bytes);
}

function decodeUnsignedInteger(buf) {
  let big = 0n;
  for (const b of buf) big = (big << 8n) | BigInt(b);
  return big;
}

// ---------------------------------------------------------------------------
// BER: Object Identifier — primeiros dois arcos combinados (40*X+Y), demais
// arcos em base-128 com bit de continuacao. Fonte classica de bug: testar
// contra sequencias de bytes conhecidas (ver test/snmp.test.js).
// ---------------------------------------------------------------------------

function encodeOid(dotted) {
  const arcs = String(dotted)
    .split(".")
    .filter((part) => part !== "")
    .map((part) => parseInt(part, 10));
  if (arcs.length < 2 || arcs.some((arc) => !Number.isFinite(arc) || arc < 0)) {
    throw new Error(`OID invalido: ${dotted}`);
  }
  const bytes = [arcs[0] * 40 + arcs[1]];
  for (let i = 2; i < arcs.length; i++) {
    let arc = arcs[i];
    if (arc === 0) {
      bytes.push(0);
      continue;
    }
    const chunk = [];
    while (arc > 0) {
      chunk.unshift(arc & 0x7f);
      arc = Math.floor(arc / 128);
    }
    for (let j = 0; j < chunk.length - 1; j++) chunk[j] |= 0x80;
    bytes.push(...chunk);
  }
  return Buffer.from(bytes);
}

function decodeOid(buf) {
  if (!buf.length) return "";
  const arcs = [Math.floor(buf[0] / 40), buf[0] % 40];
  let value = 0;
  for (let i = 1; i < buf.length; i++) {
    const byte = buf[i];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      arcs.push(value);
      value = 0;
    }
  }
  return arcs.join(".");
}

// ---------------------------------------------------------------------------
// Varbinds e PDUs
// ---------------------------------------------------------------------------

function encodeVarbindNull(oid) {
  const oidTlv = tlv(TAG.OBJECT_IDENTIFIER, encodeOid(oid));
  const nullTlv = tlv(TAG.NULL, Buffer.alloc(0));
  return tlv(TAG.SEQUENCE, Buffer.concat([oidTlv, nullTlv]));
}

function encodeVarbindList(oids) {
  return tlv(TAG.SEQUENCE, Buffer.concat(oids.map(encodeVarbindNull)));
}

function encodeGetRequestPdu(oids, requestId) {
  const body = Buffer.concat([
    tlv(TAG.INTEGER, encodeSignedInteger(requestId)),
    tlv(TAG.INTEGER, encodeSignedInteger(0)),
    tlv(TAG.INTEGER, encodeSignedInteger(0)),
    encodeVarbindList(oids)
  ]);
  return tlv(TAG.GET_REQUEST, body);
}

function encodeGetBulkRequestPdu(oids, requestId, nonRepeaters, maxRepetitions) {
  const body = Buffer.concat([
    tlv(TAG.INTEGER, encodeSignedInteger(requestId)),
    tlv(TAG.INTEGER, encodeSignedInteger(nonRepeaters)),
    tlv(TAG.INTEGER, encodeSignedInteger(maxRepetitions)),
    encodeVarbindList(oids)
  ]);
  return tlv(TAG.GETBULK_REQUEST, body);
}

function encodeMessage(community, pduBuf) {
  const body = Buffer.concat([
    tlv(TAG.INTEGER, encodeSignedInteger(1)), // SNMP version = v2c
    tlv(TAG.OCTET_STRING, Buffer.from(String(community || ""), "utf8")),
    pduBuf
  ]);
  return tlv(TAG.SEQUENCE, body);
}

function decodeVarbindValue(tag, valueBuf) {
  switch (tag) {
    case TAG.INTEGER:
      return { type: "Integer", value: Number(decodeSignedInteger(valueBuf)) };
    case TAG.OCTET_STRING:
      return { type: "OctetString", value: valueBuf.toString("utf8") };
    case TAG.NULL:
      return { type: "Null", value: null };
    case TAG.OBJECT_IDENTIFIER:
      return { type: "ObjectIdentifier", value: decodeOid(valueBuf) };
    case TAG.IP_ADDRESS:
      return { type: "IpAddress", value: Array.from(valueBuf).join(".") };
    case TAG.COUNTER32:
      return { type: "Counter32", value: Number(decodeUnsignedInteger(valueBuf)) };
    case TAG.GAUGE32:
      return { type: "Gauge32", value: Number(decodeUnsignedInteger(valueBuf)) };
    case TAG.TIME_TICKS:
      return { type: "TimeTicks", value: Number(decodeUnsignedInteger(valueBuf)) };
    case TAG.COUNTER64:
      // Contadores de 64 bits estourariam Number.MAX_SAFE_INTEGER so em cenarios
      // extremos (petabytes acumulados); convertido para Number por simplicidade —
      // deltas entre amostras (o que realmente importa pro calculo de bps) ficam
      // muito abaixo desse limite.
      return { type: "Counter64", value: Number(decodeUnsignedInteger(valueBuf)) };
    case TAG.NO_SUCH_OBJECT:
      return { type: "NoSuchObject", value: null };
    case TAG.NO_SUCH_INSTANCE:
      return { type: "NoSuchInstance", value: null };
    case TAG.END_OF_MIB_VIEW:
      return { type: "EndOfMibView", value: null };
    default:
      return { type: `Unknown(0x${tag.toString(16)})`, value: null };
  }
}

function decodeVarbind(buf, offset) {
  const seq = readTlv(buf, offset);
  const oidTlv = readTlv(seq.value, 0);
  const valTlv = readTlv(seq.value, oidTlv.next);
  return { oid: decodeOid(oidTlv.value), ...decodeVarbindValue(valTlv.tag, valTlv.value), next: seq.next };
}

function decodeMessage(buf) {
  const msgSeq = readTlv(buf, 0);
  const versionTlv = readTlv(msgSeq.value, 0);
  const communityTlv = readTlv(msgSeq.value, versionTlv.next);
  const pduTlv = readTlv(msgSeq.value, communityTlv.next);

  const reqIdTlv = readTlv(pduTlv.value, 0);
  const errStatusTlv = readTlv(pduTlv.value, reqIdTlv.next);
  const errIndexTlv = readTlv(pduTlv.value, errStatusTlv.next);
  const varbindListTlv = readTlv(pduTlv.value, errIndexTlv.next);

  const varbinds = [];
  let pos = 0;
  while (pos < varbindListTlv.value.length) {
    const vb = decodeVarbind(varbindListTlv.value, pos);
    varbinds.push(vb);
    pos = vb.next;
  }

  return {
    version: Number(decodeSignedInteger(versionTlv.value)),
    community: communityTlv.value.toString("utf8"),
    pduType: pduTlv.tag,
    requestId: Number(decodeSignedInteger(reqIdTlv.value)),
    errorStatus: Number(decodeSignedInteger(errStatusTlv.value)),
    errorIndex: Number(decodeSignedInteger(errIndexTlv.value)),
    varbinds
  };
}

// ---------------------------------------------------------------------------
// Transporte UDP
// ---------------------------------------------------------------------------

function randomRequestId() {
  return crypto.randomInt(1, 0x7fffffff);
}

function snmpRequest(host, port, community, pduBuf, requestId, { timeoutMs = 3000, retries = 1 } = {}) {
  const message = encodeMessage(community, pduBuf);
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const attemptOnce = () => {
      const socket = dgram.createSocket("udp4");
      let settled = false;

      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        fn(arg);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        if (attempt < retries) {
          attempt += 1;
          settled = true;
          clearTimeout(timer);
          socket.close();
          attemptOnce();
        } else {
          finish(reject, new Error(`Timeout SNMP ao consultar ${host}:${port}`));
        }
      }, timeoutMs);

      socket.once("error", (error) => finish(reject, error));

      socket.on("message", (msg) => {
        if (settled) return;
        let decoded;
        try {
          decoded = decodeMessage(msg);
        } catch {
          return; // pacote corrompido/inesperado — ignora e continua esperando
        }
        if (decoded.requestId !== requestId) return; // resposta de outra requisicao (UDP sem ordem garantida)
        finish(resolve, decoded);
      });

      socket.send(message, port, host, (error) => {
        if (error) finish(reject, error);
      });
    };

    attemptOnce();
  });
}

/**
 * GET simples — retorna um mapa { oid: {type, value} }.
 */
export async function snmpGet(host, port, community, oids, options = {}) {
  const requestId = randomRequestId();
  const pdu = encodeGetRequestPdu(oids, requestId);
  const response = await snmpRequest(host, port, community, pdu, requestId, options);
  const result = {};
  for (const varbind of response.varbinds) result[varbind.oid] = varbind;
  return result;
}

/**
 * GETBULK — retorna a lista crua de varbinds (usado pra walk de tabela).
 */
export async function snmpGetBulk(host, port, community, oids, options = {}) {
  const { nonRepeaters = 0, maxRepetitions = 20, ...rest } = options;
  const requestId = randomRequestId();
  const pdu = encodeGetBulkRequestPdu(oids, requestId, nonRepeaters, maxRepetitions);
  const response = await snmpRequest(host, port, community, pdu, requestId, rest);
  return response.varbinds;
}

/**
 * Varre uma tabela inteira a partir de um OID base usando GETBULK em rounds,
 * parando em EndOfMibView ou quando o OID retornado sai do prefixo da tabela.
 */
export async function snmpWalk(host, port, community, baseOid, options = {}) {
  const { maxRows = 500, maxRepetitions = 20, ...rest } = options;
  const prefix = `${baseOid}.`;
  const rows = [];
  let currentOid = baseOid;
  while (rows.length < maxRows) {
    const varbinds = await snmpGetBulk(host, port, community, [currentOid], { nonRepeaters: 0, maxRepetitions, ...rest });
    if (!varbinds.length) break;
    let stop = false;
    for (const varbind of varbinds) {
      if (varbind.type === "EndOfMibView" || !varbind.oid.startsWith(prefix)) {
        stop = true;
        break;
      }
      rows.push(varbind);
      currentOid = varbind.oid;
      if (rows.length >= maxRows) break;
    }
    if (stop) break;
  }
  return rows;
}

export const _internal = {
  encodeOid,
  decodeOid,
  encodeLength,
  decodeLength,
  encodeSignedInteger,
  decodeSignedInteger,
  encodeUnsignedInteger,
  decodeUnsignedInteger,
  encodeMessage,
  decodeMessage,
  encodeGetRequestPdu,
  encodeGetBulkRequestPdu,
  TAG
};
