import assert from "node:assert/strict";
import test from "node:test";
import { createLanClient } from "../js/lan-client.js";

function setup(t, overrides = {}) {
  const original = globalThis.EventSource;
  const streams = [];
  globalThis.EventSource = class extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.closed = false;
      streams.push(this);
    }
    close() { this.closed = true; }
    emit(type, payload) {
      const event = new Event(type);
      event.data = JSON.stringify(payload);
      this.dispatchEvent(event);
    }
  };
  t.after(() => {
    if (original === undefined) delete globalThis.EventSource;
    else globalThis.EventSource = original;
  });
  const callbacks = { onRooms() {}, onRound() {}, onNotice() {}, onError() {}, ...overrides };
  const client = createLanClient(callbacks);
  t.after(client.disconnect);
  return { client, streams };
}

test("LAN client connects once and forwards room, round, and notice events", async t => {
  const seen = [];
  const { client, streams } = setup(t, {
    onRooms: data => seen.push(data),
    onRound: data => seen.push(data),
    onNotice: data => seen.push(data),
  });
  const first = client.connect(), second = client.connect();
  assert.equal(first, second);
  assert.equal(streams.length, 1);
  streams[0].emit("rooms", { playerId: "p1", games: [], room: null });
  await first;
  streams[0].emit("round", { state: { scene: "countdown" } });
  streams[0].emit("notice", { message: "The host closed this game." });
  assert.equal(seen.length, 3);
  assert.equal(seen[2], "The host closed this game.");
  await client.connect();
  assert.equal(streams.length, 1);
});

test("cancelling while connecting does not strand later LAN menu attempts", async t => {
  const { client, streams } = setup(t);
  const connecting = client.connect();
  client.disconnect();
  await assert.rejects(connecting, /cancelled/);
  assert.equal(streams[0].closed, true);
  const retry = client.connect();
  assert.equal(streams.length, 2);
  streams[1].emit("rooms", { playerId: "retry", games: [], room: null });
  await retry;
});

test("connection failures are explicit and a fresh connection can be made", async t => {
  const errors = [];
  const { client, streams } = setup(t, { onError: message => errors.push(message) });
  const connecting = client.connect();
  streams[0].onerror();
  await assert.rejects(connecting, /unavailable/);
  assert.match(errors[0], /npm start/);
  assert.equal(streams[0].closed, true);
  const retry = client.connect();
  streams[1].emit("rooms", { playerId: "retry", games: [], room: null });
  await retry;
});

test("LAN actions report server errors rather than pretending a join succeeded", async t => {
  const { client, streams } = setup(t);
  await assert.rejects(client.action("join"), /Connect/);
  const connecting = client.connect();
  streams[0].emit("rooms", { playerId: "p1" });
  await connecting;
  t.mock.method(globalThis, "fetch", async () => ({
    ok: false, text: async () => JSON.stringify({ error: "That game is no longer available." }),
  }));
  await assert.rejects(client.action("join", { roomId: "gone" }), /no longer available/);
});

test("controls observe cleared keys even when a hidden tab stops rendering frames", async t => {
  const { client, streams } = setup(t);
  const connecting = client.connect();
  streams[0].emit("rooms", { playerId: "p1" });
  await connecting;
  let complete;
  const request = new Promise(resolve => { complete = resolve; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    complete(JSON.parse(options.body));
    return { ok: true };
  });
  const keys = { w: true };
  client.setKeys(keys);
  delete keys.w;
  client.startControls();
  assert.deepEqual((await request).keys, {});
});

test("an in-flight control failure after an intentional disconnect does not reopen the menu", async t => {
  const errors = [];
  const { client, streams } = setup(t, { onError: message => errors.push(message) });
  const connecting = client.connect();
  streams[0].emit("rooms", { playerId: "p1", token: "private-token" });
  await connecting;
  let started, finish;
  const request = new Promise(resolve => { started = resolve; });
  const response = new Promise(resolve => { finish = resolve; });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    started(JSON.parse(options.body));
    return response;
  });
  client.startControls();
  const body = await request;
  assert.equal(body.token, "private-token");
  client.disconnect();
  finish({ ok: false, text: async () => JSON.stringify({ error: "Connection expired." }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
});
