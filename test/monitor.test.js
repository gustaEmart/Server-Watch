import test from "node:test";
import assert from "node:assert/strict";
import { applyMonitorResult } from "../services/monitor.js";

function server(overrides = {}) {
  return {
    currentStatus: "online",
    failureThreshold: 2,
    consecutiveFailures: 0,
    ...overrides
  };
}

test("marks server offline after the configured failure threshold", () => {
  const target = server();

  applyMonitorResult(target, { online: false, latencyMs: null, error: "timeout" }, { checkedAt: "2026-06-02T10:00:00.000Z" });
  const transition = applyMonitorResult(target, { online: false, latencyMs: null, error: "timeout" }, { checkedAt: "2026-06-02T10:00:10.000Z" });

  assert.equal(target.consecutiveFailures, 2);
  assert.equal(target.currentStatus, "offline");
  assert.equal(transition.statusChanged, true);
});

test("keeps status unchanged before the failure threshold", () => {
  const target = server({ failureThreshold: 3 });
  const transition = applyMonitorResult(target, { online: false, latencyMs: null, error: "timeout" }, { checkedAt: "2026-06-02T10:00:00.000Z" });

  assert.equal(target.consecutiveFailures, 1);
  assert.equal(target.currentStatus, "online");
  assert.equal(transition.statusChanged, false);
});

test("moves offline server back online on successful response", () => {
  const target = server({ currentStatus: "offline", consecutiveFailures: 2 });
  const transition = applyMonitorResult(target, { online: true, latencyMs: 12, error: null }, { checkedAt: "2026-06-02T10:00:00.000Z" });

  assert.equal(target.currentStatus, "online");
  assert.equal(target.lastLatencyMs, 12);
  assert.equal(transition.previousStatus, "offline");
  assert.equal(transition.statusChanged, true);
});

test("resets consecutive failures after successful response", () => {
  const target = server({ consecutiveFailures: 1 });

  applyMonitorResult(target, { online: true, latencyMs: 7, error: null }, { checkedAt: "2026-06-02T10:00:00.000Z" });

  assert.equal(target.consecutiveFailures, 0);
  assert.equal(target.currentStatus, "online");
});
