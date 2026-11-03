import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createLanServer } from "../server.js";
import { MINIGAMES } from "../js/pillows.js";

async function setup(t) {
  const server = createLanServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    const closed = once(server, "close");
    server.closeLan();
    await closed;
  });
  return base;
}

async function connect(base) {
  const abort = new AbortController();
  const response = await fetch(`${base}/api/lan/events`, { signal: abort.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  async function next(type, predicate = () => true) {
    const timeout = setTimeout(() => abort.abort(), 6000);
    try {
      while (true) {
        const end = buffer.indexOf("\n\n");
        if (end === -1) {
          const chunk = await reader.read();
          assert.equal(chunk.done, false, "LAN stream ended unexpectedly");
          buffer += decoder.decode(chunk.value, { stream: true });
          continue;
        }
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = event.split("\n");
        if (lines[0] !== `event: ${type}`) continue;
        const data = JSON.parse(lines.find(line => line.startsWith("data: ")).slice(6));
        if (predicate(data)) return data;
      }
    } finally { clearTimeout(timeout); }
  }
  const initial = await next("rooms");
  async function action(action, details = {}) {
    const response = await fetch(`${base}/api/lan`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: initial.playerId, token: initial.token, action, ...details }),
    });
    return { status: response.status, body: await response.json() };
  }
  return { id: initial.playerId, next, action, disconnect() { abort.abort(); } };
}

test("rooms advertise host occupancy, enforce settings, and start only when all 2-8 slots fill", async t => {
  const base = await setup(t);
  const clients = [];
  for (let n = 0; n < 8; n++) clients.push(await connect(base));
  const host = clients[0];
  for (const slots of [1, 9, 2.5, "2", null]) {
    assert.equal((await host.action("host", { slots, selection: "track" })).status, 400);
  }
  assert.equal((await host.action("host", { slots: 2, selection: "invalid" })).status, 400);
  for (const selection of [...MINIGAMES, "random"]) {
    for (let slots = 2; slots <= 8; slots++) {
      assert.equal((await host.action("host", { slots, selection })).status, 200);
      const created = await host.next("rooms", data => data.room?.slots === slots &&
        data.room.selection === selection && data.room.members.length === 1);
      assert.equal(created.room.hostId, host.id);
      assert.equal(created.games.length, 1);
      assert.equal(created.room.phase, "waiting");
      for (let index = 1; index < slots; index++) {
        assert.equal((await clients[index].action("join", { roomId: created.room.id })).status, 200);
        const update = await host.next("rooms", data => data.room?.members.length === index + 1);
        assert.equal(update.room.phase, index + 1 === slots ? "playing" : "waiting");
        assert.equal(update.games.length, index + 1 === slots ? 0 : 1);
      }
      const started = await host.next("round");
      assert.equal(started.state.scene, "countdown");
      assert.equal(started.racers.length, slots);
      assert.deepEqual(started.racers.map(racer => racer.id), clients.slice(0, slots).map(client => client.id));
      if (selection === "random") assert.ok(MINIGAMES.includes(started.state.minigame));
      else assert.equal(started.state.minigame, selection);
      assert.equal((await host.action("leave")).status, 200);
    }
  }
});

test("simultaneous join clicks never overfill a room or let someone join twice", async t => {
  const base = await setup(t);
  const host = await connect(base), first = await connect(base), second = await connect(base);
  await host.action("host", { slots: 2, selection: "track" });
  const { room } = await host.next("rooms", data => data.room);
  assert.equal((await first.action("leave", { playerId: host.id })).status, 400,
    "public room player IDs must not authorize another player's actions");
  const results = await Promise.all([first, second].map(client => client.action("join", { roomId: room.id })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  const winner = results[0].status === 200 ? first : second;
  assert.equal((await winner.action("join", { roomId: room.id })).status, 400);
});

test("guest departure reopens a waiting slot; host disconnect removes its listing", async t => {
  const base = await setup(t);
  const host = await connect(base), guest = await connect(base), browser = await connect(base);
  await host.action("host", { slots: 3, selection: "doors" });
  const { room } = await host.next("rooms", data => data.room);
  await guest.action("join", { roomId: room.id });
  await browser.next("rooms", data => data.games[0]?.members.length === 2);
  guest.disconnect();
  const updated = await browser.next("rooms", data => data.games[0]?.members.length === 1);
  assert.equal(updated.games[0].phase, "waiting");
  host.disconnect();
  await browser.next("rooms", data => data.games.length === 0);
  assert.equal((await browser.action("join", { roomId: room.id })).status, 400);
});

test("active players share authoritative human movement and disconnects end the round explicitly", async t => {
  const base = await setup(t);
  const host = await connect(base), guest = await connect(base);
  await host.action("host", { slots: 2, selection: "track" });
  const { room } = await host.next("rooms", data => data.room);
  await guest.action("join", { roomId: room.id });
  const first = await guest.next("round");
  const running = await guest.next("round", data => data.state.scene === "track");
  assert.deepEqual(running.racers.map(({ x, z }) => ({ x, z })),
    first.racers.map(({ x, z }) => ({ x, z })));
  await guest.action("input", { keys: { w: true } });
  const moved = await host.next("round", data => data.racers[1].x > first.racers[1].x);
  assert.equal(moved.racers[0].x, first.racers[0].x);
  assert.ok(moved.racers[1].x > first.racers[1].x);
  guest.disconnect();
  const notice = await host.next("notice");
  assert.match(notice.message, /ended/);
  await host.next("rooms", data => !data.room && data.games.length === 0);
});

test("LAN server serves game assets but not source-server files or hidden files", async t => {
  const base = await setup(t);
  for (const path of ["/", "/styles.css", "/js/lan-game.js", "/assets/models/chicken.glb"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 200);
  }
  for (const path of ["/server.js", "/package.json", "/.git/config", "/js/../server.js"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 404);
  }
  assert.equal((await fetch(`${base}/api/lan`, { method: "POST", body: "{" })).status, 400);
  assert.equal((await fetch(`${base}/api/lan`, { method: "POST", body: "null" })).status, 400);
  assert.equal((await fetch(`${base}/api/lan`, {
    method: "POST", body: JSON.stringify({ playerId: "unknown", action: "host" }),
  })).status, 400);
});
