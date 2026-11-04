import assert from "node:assert/strict";
import test from "node:test";
import { createGame } from "../js/lobby.js";
import { ARENA, CANNONS, CANNON_MUZZLE, MINIGAMES, PILLOW_RADIUS } from "../js/pillows.js";
import { R, SPEED, TURN } from "../js/track.js";

function seededGame(seed = 1) {
  return createGame({ random: () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  } });
}

function start(game) {
  game.enterPillows();
  game.update(0.05, 3);
}

function pillow(x, z, vx, vz, id = 100) {
  return { id, x, z, vx, vz };
}

test("the button selection gives each minigame an equal random interval", () => {
  let choice = 0;
  const game = createGame({ random: () => choice });
  const counts = Object.fromEntries(MINIGAMES.map(name => [name, 0]));
  for (let n = 0; n < 1000; n++) {
    choice = n / 1000;
    const selected = game.enterMinigame();
    counts[selected]++;
    assert.equal(game.state.minigame, selected);
    assert.equal(game.state.scene, "countdown");
  }
  assert.deepEqual(counts, { track: 200, pillows: 200, doors: 200, eggs: 200, "egg-battle": 200 });
  for (const [value, expected] of [
    [0, "track"], [0.199999, "track"], [0.2, "pillows"], [0.399999, "pillows"],
    [0.4, "doors"], [0.599999, "doors"], [0.6, "eggs"], [0.799999, "eggs"],
    [0.8, "egg-battle"], [0.999999, "egg-battle"],
  ]) {
    choice = value;
    assert.equal(game.enterMinigame(), expected);
  }
});

test("pillow countdown holds both chickens and projectiles still", () => {
  const game = seededGame();
  game.enterPillows();
  const player = { ...game.state }, rival = { ...game.rival };
  game.update(0.05, 2, { w: true, a: true });
  assert.equal(game.state.countdown, 1);
  game.update(0.05, 1, { w: true });
  assert.equal(game.state.scene, "pillows");
  assert.equal(game.state.x, player.x);
  assert.equal(game.state.z, player.z);
  assert.equal(game.state.yaw, player.yaw);
  assert.equal(game.rival.x, rival.x);
  assert.equal(game.rival.z, rival.z);
  assert.equal(game.state.survivalTime, 0);
  assert.equal(game.state.lives, 3);
  assert.equal(game.rival.lives, 3);
  assert.deepEqual(game.state.pillows, []);
});

test("pillow arena retains WASD and arrow movement with solid small boundaries", () => {
  for (const keys of [{ w: true }, { arrowup: true }, { s: true }, { arrowdown: true }]) {
    const game = seededGame();
    start(game);
    const before = game.state.z;
    game.update(0.05, 0.05, keys);
    const forward = keys.w || keys.arrowup;
    assert.ok(Math.abs(game.state.z - before - (forward ? -1 : 1) * SPEED * 0.05) < 1e-10);
  }
  for (const key of ["a", "arrowleft", "d", "arrowright"]) {
    const game = seededGame();
    start(game);
    const before = game.state.yaw;
    game.update(0.05, 0.05, { [key]: true });
    const expected = (key === "a" || key === "arrowleft" ? 1 : -1) * TURN * 0.05;
    assert.ok(Math.abs(game.state.yaw - before - expected) < 1e-10);
  }
  for (const [x, z, yaw] of [
    [ARENA.minX + R, 0, -Math.PI / 2], [ARENA.maxX - R, 0, Math.PI / 2],
    [0, ARENA.minZ + R, Math.PI], [0, ARENA.maxZ - R, 0],
  ]) {
    const game = seededGame();
    start(game);
    Object.assign(game.state, { x, z, yaw });
    game.update(0.05, 0.05, { w: true });
    assert.ok(Math.abs(game.state.x - x) < 1e-10);
    assert.ok(Math.abs(game.state.z - z) < 1e-10);
  }
});

test("throws start outside the arena, aim at a chicken, and travel into it", () => {
  for (const edge of [0, 0.25, 0.5, 0.75]) {
    const game = createGame({ random: () => edge });
    start(game);
    for (let n = 0; n < 16; n++) game.update(0.05);
    const shot = game.state.pillows[0];
    assert.ok(shot);
    const cannon = CANNONS[Math.floor(edge * 4)];
    assert.ok(Math.abs(Math.hypot(shot.x - cannon.x, shot.z - cannon.z) - CANNON_MUZZLE) < 1e-10);
    assert.equal(game.state.cannonYaws[Math.floor(edge * 4)], Math.atan2(shot.vx, shot.vz));
    assert.ok(Math.abs(shot.x) > ARENA.maxX || Math.abs(shot.z) > ARENA.maxZ);
    assert.ok((game.state.x - shot.x) * shot.vx + (game.state.z - shot.z) * shot.vz > 0);
    const previous = { ...shot };
    game.update(0.05);
    assert.ok(Math.abs(shot.x - previous.x - shot.vx * 0.05) < 1e-10);
    assert.ok(Math.abs(shot.z - previous.z - shot.vz * 0.05) < 1e-10);
  }
});

test("a final hit on either chicken ends the round and freezes all movement", () => {
  for (const hitRival of [false, true]) {
    const game = seededGame();
    start(game);
    const target = hitRival ? game.rival : game.state;
    target.lives = 1;
    game.state.pillows.push(pillow(target.x, target.z, 8, 0));
    game.update(0.05);
    assert.equal(game.state.scene, "finished");
    assert.equal(game.state.playerWon, hitRival);
    assert.equal(game.state.hit, hitRival ? "rival" : "player");
    const before = structuredClone({ state: game.state, rival: game.rival });
    game.update(0.05, 0.05, { w: true, a: true });
    assert.equal(game.state.x, before.state.x);
    assert.equal(game.state.z, before.state.z);
    assert.deepEqual(game.rival, before.rival);
    assert.deepEqual(game.state.pillows, before.state.pillows);
  }
});

test("swept hits cannot tunnel and the earliest hit wins regardless of projectile order", () => {
  const game = seededGame();
  start(game);
  game.state.lives = game.rival.lives = 1;
  game.state.pillows.push(
    pillow(game.state.x - 4, game.state.z, 100, 0),
    pillow(game.rival.x - 2, game.rival.z, 100, 0, 101)
  );
  game.update(0.05);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, true);
});

test("simultaneous hits produce a draw and near misses do not end the round", () => {
  const game = seededGame();
  start(game);
  game.state.pillows.push(pillow(game.state.x, game.state.z + R + PILLOW_RADIUS + 0.01, 0, 0));
  game.update(0.05);
  assert.equal(game.state.scene, "pillows");
  game.state.lives = game.rival.lives = 1;
  game.state.pillows.push(
    pillow(game.state.x, game.state.z, 0, 0, 101),
    pillow(game.rival.x, game.rival.z, 0, 0, 102)
  );
  game.update(0.05);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, null);
  assert.equal(game.state.hit, "both");
});

test("swept hits also account for the player's movement between frames", () => {
  const game = seededGame();
  start(game);
  game.state.lives = 1;
  Object.assign(game.state, { yaw: 0 });
  game.state.pillows.push(pillow(game.state.x + 1.29, game.state.z + SPEED * 0.025, 0, 0));
  game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.hit, "player");
});

test("a tired rival stops dodging and loses only when an incoming pillow hits", () => {
  const game = seededGame();
  start(game);
  game.state.survivalTime = 29;
  game.update(0.05);
  assert.equal(game.state.scene, "pillows");
  assert.equal(game.rival.intent, "tired");
  assert.deepEqual(game.rival.controls, { forward: 0, turn: 0 });
  for (let n = 0; n < 200 && game.state.scene !== "finished"; n++) {
    game.state.pillows = game.state.pillows.filter(shot => shot.id % 2 === 1);
    game.update(0.05);
  }
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, true);
  assert.equal(game.state.hit, "rival");
  assert.equal(game.rival.lives, 0);
});

test("missed pillows are removed after leaving the arena", () => {
  const game = seededGame();
  start(game);
  game.state.pillows.push(pillow(15.9, 0, 8, 0));
  game.update(0.05);
  assert.deepEqual(game.state.pillows, []);
});

for (const dt of [1 / 120, 1 / 60, 0.05]) {
  test(`pillow rival uses bounded key-like movement and eventually takes a real hit at dt=${dt}`, () => {
    const game = seededGame();
    start(game);
    // Isolate rival endurance from the player's own dodging ability.
    Object.assign(game.state, { x: -8, z: 8 });
    const turns = new Set();
    let moved = false;
    for (let n = 0; n < 45 / dt && game.state.scene !== "finished"; n++) {
      game.state.pillows = game.state.pillows.filter(shot =>
        shot.id % 2 === 1 &&
        Math.hypot(shot.x - game.state.x, shot.z - game.state.z) >
          R + PILLOW_RADIUS + Math.hypot(shot.vx, shot.vz) * dt
      );
      const { x, z, yaw } = game.rival;
      game.update(dt);
      assert.ok(Math.abs(game.rival.yaw - yaw) <= TURN * dt + 1e-10);
      const distance = Math.hypot(game.rival.x - x, game.rival.z - z);
      assert.ok(distance <= SPEED * dt + 1e-10);
      assert.ok(Math.abs(game.rival.x) <= ARENA.maxX - R + 1e-10);
      assert.ok(Math.abs(game.rival.z) <= ARENA.maxZ - R + 1e-10);
      assert.ok([-1, 0, 1].includes(game.rival.controls.turn));
      assert.ok([0, 1].includes(game.rival.controls.forward));
      turns.add(game.rival.controls.turn);
      moved ||= distance > 0;
    }
    assert.ok(moved);
    assert.ok(turns.size > 1);
    assert.equal(game.state.scene, "finished");
    assert.equal(game.state.playerWon, true);
    assert.equal(game.state.hit, "rival");
    assert.equal(game.rival.lives, 0);
  });
}

test("reset clears pillows, results, timers, and the selected minigame", () => {
  const game = seededGame();
  start(game);
  for (let n = 0; n < 20; n++) game.update(0.05);
  assert.ok(game.state.pillows.length);
  game.reset();
  assert.equal(game.state.scene, "lobby");
  assert.equal(game.state.minigame, null);
  assert.deepEqual(game.state.pillows, []);
  assert.equal(game.state.survivalTime, 0);
  assert.equal(game.state.hit, null);
  assert.equal(game.state.playerWon, null);
  assert.equal(game.state.lives, 0);
  assert.equal(game.rival.lives, 0);
  start(game);
  assert.equal(game.state.survivalTime, 0);
  assert.equal(game.state.lives, 3);
  assert.equal(game.rival.lives, 3);
  assert.deepEqual(game.state.pillows, []);
});

test("both chickens lose one life per pillow and keep playing until their third hit", () => {
  for (const hitRival of [false, true]) {
    const game = seededGame();
    start(game);
    const target = hitRival ? game.rival : game.state;
    const other = hitRival ? game.state : game.rival;
    for (let hit = 1; hit <= 3; hit++) {
      game.state.pillows.push(pillow(target.x, target.z, 0, 0, 100 + hit));
      game.update(0.05);
      assert.equal(target.lives, 3 - hit);
      assert.equal(other.lives, 3);
      assert.equal(game.state.scene, hit < 3 ? "pillows" : "finished");
      assert.ok(!game.state.pillows.some(shot => shot.id === 100 + hit));
      game.update(0.05);
      assert.equal(target.lives, 3 - hit, "A consumed pillow cannot hit again");
    }
    assert.equal(game.state.playerWon, hitRival);
  }
});

test("multiple hits in one frame count separately without reducing lives below zero", () => {
  const game = seededGame();
  start(game);
  for (let i = 0; i < 4; i++) {
    game.state.pillows.push(pillow(game.state.x, game.state.z, 0, 0, 100 + i));
  }
  game.update(0.05);
  assert.equal(game.state.lives, 0);
  assert.equal(game.rival.lives, 3);
  assert.equal(game.state.playerWon, false);
  assert.deepEqual(game.state.pillows, []);
});
