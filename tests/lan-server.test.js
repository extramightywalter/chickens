import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createLanServer } from "../server.js";
import { MINIGAMES } from "../js/pillows.js";
import { EGG_STUN_DURATION } from "../js/eggs.js";
import { MAZE_COLS, MAZE_SIZE, MAZE_WALL_THICKNESS } from "../js/maze.js";
import { R } from "../js/track.js";

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
      if (started.state.minigame === "eggs") {
        assert.equal(started.state.eggs.length, slots * 3);
        assert.equal(started.state.eggTimeLeft, 90);
        assert.equal(started.state.eggPits.length, slots);
      }
      assert.equal((await host.action("leave")).status, 200);
    }
  }
});

test("LAN maze rounds send all players the same layout with 48 alternate-route connections", async t => {
  const base = await setup(t);
  const clients = [];
  for (let index = 0; index < 8; index++) clients.push(await connect(base));
  const host = clients[0];
  for (const slots of [2, 8]) {
    assert.equal((await host.action("host", { slots, selection: "maze" })).status, 200);
    const { room } = await host.next("rooms", data => data.room?.selection === "maze" &&
      data.room.members.length === 1);
    for (const client of clients.slice(1, slots)) {
      assert.equal((await client.action("join", { roomId: room.id })).status, 200);
    }
    const rounds = await Promise.all(clients.slice(0, slots).map(client => client.next("round")));
    const maze = rounds[0].state.maze;
    assert.equal(maze.links.length, MAZE_COLS ** 2);
    const bounds = maze.walls.reduce((result, wall) => ({
      minX: Math.min(result.minX, wall.minX), maxX: Math.max(result.maxX, wall.maxX),
      minZ: Math.min(result.minZ, wall.minZ), maxZ: Math.max(result.maxZ, wall.maxZ),
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    assert.ok(Math.abs(bounds.maxX - bounds.minX - MAZE_SIZE - MAZE_WALL_THICKNESS) < 1e-10);
    assert.ok(Math.abs(bounds.maxZ - bounds.minZ - MAZE_SIZE - MAZE_WALL_THICKNESS) < 1e-10);
    const passages = maze.links.reduce((total, links) => total + links.length, 0) / 2;
    assert.equal(passages - maze.links.length + 1, 48);
    for (const round of rounds) {
      assert.equal(round.state.minigame, "maze");
      assert.equal(round.racers.length, slots);
      assert.deepEqual(round.state.maze, maze);
    }
    assert.equal((await host.action("leave")).status, 200);
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
  await guest.action("input", { keys: { w: true, e: true, " ": true } });
  const moved = await host.next("round", data => data.racers[1].x > first.racers[1].x);
  assert.equal(moved.racers[0].x, first.racers[0].x);
  assert.ok(moved.racers[1].x > first.racers[1].x);
  assert.ok(moved.racers[1].spinTimer > 0);
  assert.ok(moved.racers[1].diveTimer > 0);
  assert.ok(moved.racers[1].spinCooldown > 0);
  assert.ok(moved.racers[1].diveCooldown > 0);
  assert.equal(moved.racers[0].spinTimer, 0);
  assert.equal(moved.racers[0].diveTimer, 0);
  guest.disconnect();
  const notice = await host.next("notice");
  assert.match(notice.message, /ended/);
  await host.next("rooms", data => !data.room && data.games.length === 0);
});

test("online Egg Heist clients share close-contact dash stuns and recovery", async t => {
  const base = await setup(t);
  const host = await connect(base), guest = await connect(base);
  await host.action("host", { slots: 2, selection: "eggs" });
  const { room } = await host.next("rooms", data => data.room);
  await guest.action("join", { roomId: room.id });
  let round = await host.next("round", data => data.state.scene === "eggs");
  const distance = data => Math.hypot(
    data.racers[0].x - data.racers[1].x, data.racers[0].z - data.racers[1].z);

  // Walk together before dashing: this used to bypass the server's hit check.
  for (let tick = 0; distance(round) > R * 2 && tick < 100; tick++) {
    await Promise.all([host, guest].map(client => client.action("input", { keys: { w: true } })));
    round = await host.next("round");
  }
  assert.ok(distance(round) <= R * 2, "players must be touching before the dash");
  await Promise.all([host, guest].map(client => client.action("input", { keys: {} })));
  round = await host.next("round", data =>
    data.racers.every(racer => racer.controls.forward === 0));
  assert.ok(distance(round) <= R * 2);

  await guest.action("input", { keys: { " ": true } });
  const stunned = await host.next("round", data => data.racers[0].stunTimer > 0);
  assert.equal(stunned.racers[0].stunTimer, EGG_STUN_DURATION);
  assert.equal(stunned.racers[1].stunTimer, 0);
  const guestView = await guest.next("round", data => data.racers[0].stunTimer > 0);
  assert.deepEqual(guestView.racers, stunned.racers, "both clients see the same server hit");

  const position = ({ x, z, yaw }) => ({ x, z, yaw });
  const stopped = position(stunned.racers[0]);
  const keys = { w: true, a: true, e: true, " ": true };
  let recovered;
  for (let tick = 0; tick < 40; tick++) {
    await host.action("input", { keys });
    const snapshot = await host.next("round");
    const target = snapshot.racers[0];
    if (target.stunTimer === 0 && target.controls.forward !== 0) {
      recovered = snapshot;
      break;
    }
    assert.deepEqual(position(target), stopped);
    assert.equal(target.carryingEggId, null);
    assert.equal(target.diveTimer, 0);
    assert.deepEqual(target.controls, { forward: 0, turn: 0 });
  }
  assert.ok(recovered, "movement resumes after the stun");
  const duration = stunned.state.eggTimeLeft - recovered.state.eggTimeLeft;
  assert.ok(duration >= EGG_STUN_DURATION && duration < EGG_STUN_DURATION + 0.3);
  assert.notDeepEqual(position(recovered.racers[0]), stopped);
});

test("LAN server serves game assets but not source-server files or hidden files", async t => {
  const base = await setup(t);
  for (const path of ["/", "/styles.css", "/js/lan-game.js", "/assets/models/chicken.glb"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-cache");
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

test("Chicken Blaster LAN transmits authoritative aim, firing, health and arena assets", async t => {
  const base = await setup(t);
  const host = await connect(base), guest = await connect(base);
  for (const path of ["/assets/models/gun%20arina.model", "/assets/models/chicken%20blaster.glb"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 200);
  }
  await host.action("host", { slots: 2, selection: "gun-arena" });
  const { room } = await host.next("rooms", data => data.room);
  await guest.action("join", { roomId: room.id });
  const countdown = await host.next("round");
  assert.equal(countdown.state.minigame, "gun-arena");
  assert.deepEqual(countdown.racers.map(racer => racer.lives), [30, 30]);
  assert.deepEqual(countdown.state.bullets, []);
  await host.next("round", data => data.state.scene === "gun-arena");
  for (const keys of [{ aimYaw: "bad" }, { aimPitch: null }, { aimYaw: {} }]) {
    const invalid = await host.action("input", { keys });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.error, /aim/);
  }
  assert.equal((await host.action("input", {
    keys: { fire: true, aimYaw: 0.7, aimPitch: 0.2 },
  })).status, 200);
  const fired = await host.next("round", data => data.racers[0].shotsFired > 0);
  assert.ok(Math.abs(fired.racers[0].yaw - 0.7) < 1e-10);
  assert.equal(fired.racers[0].pitch, 0.2);
  assert.equal(fired.racers[0].shotsFired, 1);
  assert.equal(fired.racers[1].shotsFired, 0);
  assert.deepEqual(fired.racers.map(racer => racer.lives), [30, 30]);
  const guestView = await guest.next("round", data => data.racers[0].shotsFired > 0);
  assert.deepEqual(guestView.racers, fired.racers);
  let latest = fired;
  for (const [key, direction] of [
    ["a", -1], ["arrowleft", -1], ["d", 1], ["arrowright", 1],
  ]) {
    const before = latest.racers[0];
    assert.equal((await host.action("input", { keys: { [key]: true } })).status, 200);
    latest = await host.next("round", data => {
      const racer = data.racers[0];
      const strafe = -(racer.x - before.x) * Math.cos(before.yaw) +
        (racer.z - before.z) * Math.sin(before.yaw);
      return racer.controls.strafe === direction && Math.sign(strafe) === direction &&
        racer.yaw === before.yaw;
    });
  }
});
