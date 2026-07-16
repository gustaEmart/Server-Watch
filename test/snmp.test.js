import test from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import { snmpGet, _internal } from "../probe/snmp/client.js";

const { encodeOid, decodeOid, encodeLength, decodeLength, encodeSignedInteger, decodeSignedInteger, encodeUnsignedInteger, decodeUnsignedInteger, encodeMessage, decodeMessage, encodeGetRequestPdu, TAG } = _internal;

test("encodeOid matches the known BER encoding of sysDescr.0 (1.3.6.1.2.1.1.1.0)", () => {
  const encoded = encodeOid("1.3.6.1.2.1.1.1.0");
  assert.deepEqual([...encoded], [0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00]);
});

test("encodeOid handles multi-byte arcs (base-128) — Mikrotik CPU OID", () => {
  const encoded = encodeOid("1.3.6.1.4.1.14988.1.1.3.14.0");
  // 14988 = 117*128 + 12 -> [0xF5, 0x0C] (continuation bit set on all but last byte)
  assert.deepEqual([...encoded], [0x2b, 0x06, 0x01, 0x04, 0x01, 0xf5, 0x0c, 0x01, 0x01, 0x03, 0x0e, 0x00]);
});

test("encodeOid/decodeOid round-trips arbitrary OIDs", () => {
  const oids = ["1.3.6.1.2.1.2.2.1.8.5", "1.3.6.1.4.1.12356.101.4.1.3.0", "1.3.6.1.2.1.31.1.1.1.6.1"];
  for (const oid of oids) {
    assert.equal(decodeOid(encodeOid(oid)), oid);
  }
});

test("encodeLength/decodeLength round-trips short and long form", () => {
  for (const len of [0, 1, 127, 128, 255, 256, 65535, 70000]) {
    const encoded = encodeLength(len);
    const { length, next } = decodeLength(encoded, 0);
    assert.equal(length, len);
    assert.equal(next, encoded.length);
  }
});

test("encodeSignedInteger/decodeSignedInteger round-trips positive, negative and zero", () => {
  for (const value of [0, 1, -1, 127, 128, -128, -129, 255, 256, 2147483647, -2147483648]) {
    const encoded = encodeSignedInteger(value);
    assert.equal(decodeSignedInteger(encoded), BigInt(value));
  }
});

test("encodeUnsignedInteger/decodeUnsignedInteger round-trips values near Counter32 max (2^32-1)", () => {
  for (const value of [0, 1, 255, 256, 4294967295]) {
    const encoded = encodeUnsignedInteger(value);
    assert.equal(decodeUnsignedInteger(encoded), BigInt(value));
    // high bit of first byte must never be set on values that fit within their
    // natural byte-length, otherwise a BER decoder would misread it as negative
    assert.equal(encoded[0] & 0x80, 0);
  }
});

test("encodeMessage/decodeMessage round-trips a GET request PDU", () => {
  const requestId = 12345;
  const pdu = encodeGetRequestPdu(["1.3.6.1.2.1.1.1.0"], requestId);
  const message = encodeMessage("public", pdu);
  const decoded = decodeMessage(message);
  assert.equal(decoded.version, 1);
  assert.equal(decoded.community, "public");
  assert.equal(decoded.pduType, TAG.GET_REQUEST);
  assert.equal(decoded.requestId, requestId);
  assert.equal(decoded.varbinds.length, 1);
  assert.equal(decoded.varbinds[0].oid, "1.3.6.1.2.1.1.1.0");
  assert.equal(decoded.varbinds[0].type, "Null");
});

// Agente SNMP falso, so o suficiente pra responder um GET/GETBULK a partir de
// um mapa fixo de OID -> {tag, value}, usado pra testar o cliente ponta a ponta
// sem depender de um equipamento real ou de snmpd instalado na maquina de teste.
function startFakeAgent(fixtures) {
  const socket = dgram.createSocket("udp4");
  socket.on("message", (msg, rinfo) => {
    let request;
    try {
      request = decodeMessage(msg);
    } catch {
      return;
    }
    const varbinds = request.varbinds.map((vb) => fixtures[vb.oid] || { oid: vb.oid, tag: TAG.NO_SUCH_OBJECT, value: Buffer.alloc(0) });
    const varbindTlvs = varbinds.map((v) => {
      const oidTlv = Buffer.concat([Buffer.from([TAG.OBJECT_IDENTIFIER]), encodeLength(encodeOid(v.oid).length), encodeOid(v.oid)]);
      const valueBuf = v.tag === TAG.INTEGER || v.tag === TAG.COUNTER32 || v.tag === TAG.GAUGE32
        ? encodeUnsignedInteger(v.value)
        : Buffer.from(String(v.value ?? ""), "utf8");
      const valTlv = Buffer.concat([Buffer.from([v.tag]), encodeLength(valueBuf.length), valueBuf]);
      const seqBody = Buffer.concat([oidTlv, valTlv]);
      return Buffer.concat([Buffer.from([TAG.SEQUENCE]), encodeLength(seqBody.length), seqBody]);
    });
    const varbindListBody = Buffer.concat(varbindTlvs);
    const varbindListTlv = Buffer.concat([Buffer.from([TAG.SEQUENCE]), encodeLength(varbindListBody.length), varbindListBody]);
    const pduBody = Buffer.concat([
      Buffer.concat([Buffer.from([TAG.INTEGER]), encodeLength(encodeSignedInteger(request.requestId).length), encodeSignedInteger(request.requestId)]),
      Buffer.concat([Buffer.from([TAG.INTEGER]), encodeLength(encodeSignedInteger(0).length), encodeSignedInteger(0)]),
      Buffer.concat([Buffer.from([TAG.INTEGER]), encodeLength(encodeSignedInteger(0).length), encodeSignedInteger(0)]),
      varbindListTlv
    ]);
    const pduTlv = Buffer.concat([Buffer.from([TAG.GET_RESPONSE]), encodeLength(pduBody.length), pduBody]);
    const response = encodeMessage(request.community, pduTlv);
    socket.send(response, rinfo.port, rinfo.address);
  });
  return new Promise((resolve) => {
    socket.bind(0, "127.0.0.1", () => resolve({ socket, port: socket.address().port }));
  });
}

test("snmpGet performs a real UDP round-trip against a fake agent", async () => {
  const agent = await startFakeAgent({
    "1.3.6.1.2.1.1.1.0": { oid: "1.3.6.1.2.1.1.1.0", tag: TAG.OCTET_STRING, value: "RouterOS test-device" },
    "1.3.6.1.4.1.14988.1.1.3.14.0": { oid: "1.3.6.1.4.1.14988.1.1.3.14.0", tag: TAG.INTEGER, value: 37 }
  });
  try {
    const result = await snmpGet("127.0.0.1", agent.port, "public", ["1.3.6.1.2.1.1.1.0", "1.3.6.1.4.1.14988.1.1.3.14.0"], { timeoutMs: 1000 });
    assert.equal(result["1.3.6.1.2.1.1.1.0"].value, "RouterOS test-device");
    assert.equal(result["1.3.6.1.4.1.14988.1.1.3.14.0"].value, 37);
  } finally {
    agent.socket.close();
  }
});

test("snmpGet rejects with a timeout error when nothing responds", async () => {
  // porta improvavel de ter algo escutando, sem precisar de um socket "fechado" especifico
  await assert.rejects(
    () => snmpGet("127.0.0.1", 1, "public", ["1.3.6.1.2.1.1.1.0"], { timeoutMs: 300, retries: 0 }),
    /Timeout SNMP/
  );
});
