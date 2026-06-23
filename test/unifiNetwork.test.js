import test from "node:test";
import assert from "node:assert/strict";
import { emptyUnifiNetworkState, unifiDeviceStatus } from "../services/unifiNetwork.js";

test("maps online UniFi device to online", () => {
  assert.equal(unifiDeviceStatus({ state: "ONLINE", firmwareUpdatable: false }), "online");
});

test("marks firmware update as attention", () => {
  assert.equal(unifiDeviceStatus({ state: "ONLINE", firmwareUpdatable: true }), "attention");
});

test("maps disconnected UniFi device to offline", () => {
  assert.equal(unifiDeviceStatus({ state: "OFFLINE" }), "offline");
});

test("creates an empty unconfigured UniFi state", () => {
  assert.deepEqual(emptyUnifiNetworkState(), {
    configured: false,
    fetchedAt: null,
    error: null,
    sites: []
  });
});
