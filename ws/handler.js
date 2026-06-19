import { createHash } from "node:crypto";

function encodeWebSocketFrame(payload) {
  const data = Buffer.from(JSON.stringify(payload));
  if (data.length < 126) {
    return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  }
  if (data.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
    return Buffer.concat([header, data]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(data.length), 2);
  return Buffer.concat([header, data]);
}

export function createWebSocketHub({ getSession, getFreshUser, snapshot, filterPayload = (_user, payload) => payload }) {
  const sockets = new Set();

  function resolveClientUser(client) {
    if (!client.userId) return null;
    return getFreshUser(client.userId) || null;
  }

  function broadcast(payload) {
    for (const client of sockets) {
      const socket = client.socket || client;
      if (socket.destroyed) continue;
      const scopedPayload = filterPayload(resolveClientUser(client), payload);
      if (scopedPayload) socket.write(encodeWebSocketFrame(scopedPayload));
    }
  }

  function broadcastSnapshot() {
    for (const client of sockets) {
      const socket = client.socket || client;
      if (!socket.destroyed) socket.write(encodeWebSocketFrame(snapshot(resolveClientUser(client))));
    }
  }

  function handleUpgrade(req, socket) {
    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }
    const session = getSession(req);
    if (!session) {
      socket.destroy();
      return;
    }

    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        ""
      ].join("\r\n")
    );

    const client = { socket, userId: session.user.id };
    sockets.add(client);
    socket.write(encodeWebSocketFrame(snapshot(session.user)));
    socket.on("close", () => sockets.delete(client));
    socket.on("error", () => sockets.delete(client));
  }

  return {
    broadcast,
    broadcastSnapshot,
    handleUpgrade,
    clientCount: () => sockets.size
  };
}
