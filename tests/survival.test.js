import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGame, moveRacer } from "../js/lobby.js";
import { createLanGame } from "../js/lan-game.js";
import { MAZE_SIZE, mazeCellAt, mazeClearFraction, mazePath, mazePosition } from "../js/maze.js";
import {
  CARRY_SPEED_MULTIPLIER, MONSTER_RADIUS, SURVIVAL_COLS, SURVIVAL_SIZE,
  createSurvivalRound, generateSurvivalMap, monsterBlasterGeometryKind, parseMonsterBlaster,
} from "../js/survival.js";
import { R, SPEED } from "../js/track.js";

function randomSeed(seed = 1) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function setup(random = randomSeed()) {
  const round = createSurvivalRound(random), state = {};
  const racers = [{ id: "one" }, { id: "two" }];
  round.reset(state, racers);
  return { round, state, racers };
}

function monster(type, x = 0, z = 0, id = 0) {
  return { id, type, x, z, yaw: 0, walk: 0, respawnIn: 0, shotCooldown: 3 };
}

function openArena(random) {
  const data = setup(random);
  data.state.survivalMap.walls = [];
  data.state.defenses = [];
  data.state.survivalMonsters = [];
  Object.assign(data.racers[0], { x: 0, z: 0 });
  Object.assign(data.racers[1], { x: 20, z: 20 });
  return data;
}

const idle = () => ({});

test("generated survival maps have connected narrow halls, five open rooms and central spawns", () => {
  const keys = new Set();
  assert.ok(SURVIVAL_SIZE > MAZE_SIZE && SURVIVAL_SIZE <= MAZE_SIZE * 1.2);
  for (let seed = 1; seed <= 8; seed++) {
    const map = generateSurvivalMap(randomSeed(seed));
    keys.add(map.key);
    assert.equal(map.links.length, SURVIVAL_COLS ** 2);
    const visited = new Set([map.start]), queue = [map.start];
    for (let i = 0; i < queue.length; i++) {
      for (const next of map.links[queue[i]]) if (!visited.has(next)) {
        visited.add(next); queue.push(next);
      }
    }
    assert.equal(visited.size, map.links.length);
    for (let cell = 0; cell < map.links.length; cell++) {
      assert.equal(mazeCellAt(mazePosition(cell, map), map), cell);
      for (const next of map.links[cell]) {
        assert.ok(map.links[next].includes(cell));
        assert.equal(mazeClearFraction(map.walls, mazePosition(cell, map), mazePosition(next, map), R), 1);
      }
    }
    for (const room of map.rooms) {
      const a = mazePosition(room.row * map.cols + room.col, map);
      const b = mazePosition((room.row + room.height - 1) * map.cols + room.col + room.width - 1, map);
      assert.equal(mazeClearFraction(map.walls, a, b, R), 1);
    }
    assert.ok(mazeClearFraction(map.walls, { x: 0, z: 0 }, { x: SURVIVAL_SIZE, z: 0 }) < 1);
    assert.ok(map.walls.length > 200);
  }
  assert.equal(keys.size, 8);
  const { state, racers } = setup();
  assert.ok(racers.every(racer => Math.hypot(racer.x, racer.z) <= 1.01 && racer.lives === 3));
  assert.deepEqual(["monster", "runna", "blaster"].map(type =>
    state.survivalMonsters.filter(monster => monster.type === type).length), [6, 2, 1]);
  assert.ok(state.survivalMonsters.every(monster => Math.hypot(monster.x, monster.z) > 12));
  assert.equal(state.defenses.length, 8);
  assert.equal(state.defenses.filter(item => item.type === "flame").length, 4);
  assert.equal(state.defenses.filter(item => item.type === "trap").length, 4);
  assert.ok(state.defenses.every(item => !item.firing));
});

test("E picks up just one defense, requires release, places facing forward, and cannot pass through walls", () => {
  const { round, state, racers } = openArena(), racer = racers[0];
  state.defenses = [
    { id: 0, type: "flame", x: 0, z: 1, yaw: 0, carrierId: null },
    { id: 1, type: "trap", x: 0.3, z: 1, yaw: 0, carrierId: null },
  ];
  round.actions(state, racer, { e: true }, false);
  round.actions(state, racer, { e: true });
  assert.equal(racer.carryingDefenseId, null, "countdown presses cannot leak into play");
  round.actions(state, racer, {});
  round.actions(state, racer, { e: true });
  assert.equal(racer.carryingDefenseId, 0);
  assert.equal(state.defenses[0].carrierId, racer.id);
  Object.assign(racers[1], { x: racer.x, z: racer.z });
  round.actions(state, racers[1], { e: true });
  assert.equal(racers[1].carryingDefenseId, 1, "the held defense cannot be stolen");
  round.actions(state, racer, { e: true });
  assert.equal(racer.carryingDefenseId, 0);
  round.actions(state, racer, {});
  racer.yaw = Math.PI / 2;
  state.survivalMap.walls = [{ minX: 0.7, maxX: 0.8, minZ: -2, maxZ: 2 }];
  round.actions(state, racer, { e: true });
  assert.equal(racer.carryingDefenseId, 0);
  assert.match(racer.survivalNotice, /Not enough room/);
  round.actions(state, racer, {});
  state.survivalMap.walls = [];
  round.actions(state, racer, { e: true });
  assert.equal(racer.carryingDefenseId, null);
  assert.equal(state.defenses[0].carrierId, null);
  assert.equal(state.defenses[0].yaw, Math.PI / 2);
  assert.equal(state.defenses[0].x, 1.1);
  state.survivalMap.walls = [{ minX: 0.4, maxX: 0.5, minZ: -2, maxZ: 2 }];
  round.actions(state, racer, {});
  round.actions(state, racer, { e: true });
  assert.notEqual(racer.carryingDefenseId, 0, "cannot pick up through a wall");
});

test("deployed flames kill all monster types in front, not behind, through walls or while carried", () => {
  for (const type of ["monster", "runna", "blaster"]) {
    for (const scenario of ["front", "behind", "wall", "carried"]) {
      const { round, state, racers } = openArena();
      state.defenses = [{ id: 0, type: "flame", x: 0, z: 0, yaw: 0,
        carrierId: scenario === "carried" ? racers[0].id : null }];
      const hazard = monster(type, 0, scenario === "behind" ? -2 : 2);
      state.survivalMonsters = [hazard];
      if (scenario === "wall") state.survivalMap.walls = [
        { minX: -5, maxX: 5, minZ: 0.8, maxZ: 1 },
      ];
      round.advance(state, racers, 0.025, idle, moveRacer);
      assert.equal(hazard.respawnIn > 0, scenario === "front", `${type}: ${scenario}`);
    }
  }
});

test("traps kill every monster type, stay reusable, and hurt players with hit protection", () => {
  const { round, state, racers } = openArena();
  state.defenses = [{ id: 0, type: "trap", x: 0, z: 0, yaw: 0, carrierId: null }];
  state.survivalMonsters = ["monster", "runna", "blaster"].map((type, id) => monster(type, 0, 0, id));
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.ok(state.survivalMonsters.every(monster => monster.respawnIn > 0));
  assert.equal(state.defenses.length, 1);
  assert.equal(racers[0].lives, 2);
  round.advance(state, racers, 0.1, idle, moveRacer);
  assert.equal(racers[0].lives, 2);
  Object.assign(racers[0], { x: 10, z: 0 });
  const dead = state.survivalMonsters[0];
  round.advance(state, racers, 6.1, idle, moveRacer);
  assert.equal(dead.respawnIn, 0);
  assert.ok(racers.every(racer => Math.hypot(dead.x - racer.x, dead.z - racer.z) > 10));
});

test("all monsters move at half their original speeds and contact costs one life with hit protection", () => {
  for (const type of ["monster", "runna", "blaster"]) {
    const { round, state, racers } = openArena();
    const hazard = monster(type, 0, 3);
    state.survivalMonsters = [hazard];
    round.advance(state, racers, 0.1, idle, moveRacer);
    const moved = 3 - hazard.z;
    const originalSpeed = SPEED * { monster: 0.48, runna: 1.15, blaster: 0.38 }[type];
    assert.ok(Math.abs(moved - originalSpeed * 0.5 * 0.1) < 1e-8);
    Object.assign(hazard, { x: 0, z: 0 });
    round.advance(state, racers, 0.1, idle, moveRacer);
    assert.equal(racers[0].lives, 2);
    round.advance(state, racers, 0.5, idle, moveRacer);
    assert.equal(racers[0].lives, 2);
    racers[0].invulnerable = 0;
    round.advance(state, racers, 0.025, idle, moveRacer);
    assert.equal(racers[0].lives, 1);
    racers[0].invulnerable = 0;
    const winners = round.advance(state, racers, 0.025, idle, moveRacer);
    assert.equal(racers[0].eliminated, true);
    assert.deepEqual(winners, [racers[1]]);
    const before = { x: racers[0].x, z: racers[0].z };
    round.advance(state, racers, 0.025, () => ({ w: true, e: true }), moveRacer);
    assert.equal(racers[0].x, before.x);
    assert.equal(racers[0].z, before.z);
  }
});

test("blasters shoot on a three-second cooldown and projectiles damage players but stop at walls", () => {
  const { round, state, racers } = openArena();
  state.survivalMonsters = [monster("blaster", 0, 14)];
  round.advance(state, racers, 2.99, idle, moveRacer);
  assert.equal(state.survivalProjectiles.length, 0);
  round.advance(state, racers, 0.01, idle, moveRacer);
  assert.equal(state.survivalProjectiles.length, 1);
  assert.ok(Math.abs(state.survivalMonsters[0].shotCooldown - 3) < 1e-8);
  state.survivalMonsters = [];
  round.advance(state, racers, 1, idle, moveRacer);
  assert.equal(racers[0].lives, 2);
  const shot = { id: 50, x: 0, z: 3, vx: 0, vz: -12, ttl: 3 };
  state.survivalProjectiles = [{ ...shot }];
  racers[0].invulnerable = 0;
  state.survivalMap.walls = [{ minX: -2, maxX: 2, minZ: 1, maxZ: 1.2 }];
  round.advance(state, racers, 0.5, idle, moveRacer);
  assert.equal(racers[0].lives, 2);
  assert.equal(state.survivalProjectiles.length, 0);
});

test("blasters cannot shoot through walls, and carried traps are inactive", () => {
  const { round, state, racers } = openArena();
  state.survivalMap.walls = [{ minX: -5, maxX: 5, minZ: 1.5, maxZ: 1.8 }];
  const blaster = monster("blaster", 0, 3);
  blaster.shotCooldown = 0;
  state.survivalMonsters = [blaster];
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.equal(state.survivalProjectiles.length, 0);
  state.survivalMap.walls = [];
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.equal(state.survivalProjectiles.length, 1);
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.equal(state.survivalProjectiles.length, 1, "cannot fire again immediately");
  state.survivalProjectiles = [];
  state.defenses = [{ id: 0, type: "trap", x: 0, z: 0, yaw: 0, carrierId: racers[0].id }];
  racers[0].carryingDefenseId = 0;
  state.survivalMonsters = [monster("monster")];
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.equal(state.survivalMonsters[0].respawnIn, 0);
  assert.equal(racers[0].lives, 2);
});

test("monsters route through generated corridors instead of getting stuck at walls", () => {
  const { round, state, racers } = setup();
  const map = state.survivalMap;
  state.defenses = [];
  const path = mazePath(map, map.start, 0).slice(0, 6);
  Object.assign(racers[0], mazePosition(path.at(-1), map), { invulnerable: 100 });
  Object.assign(racers[1], racers[0], { id: "two" });
  const hazard = monster("monster");
  Object.assign(hazard, mazePosition(path[0], map));
  state.survivalMonsters = [hazard];
  for (let i = 0; i < 1500 && Math.hypot(hazard.x - racers[0].x, hazard.z - racers[0].z) > R + MONSTER_RADIUS + 0.001; i++) {
    round.advance(state, racers, 0.025, idle, moveRacer);
  }
  assert.ok(Math.hypot(hazard.x - racers[0].x, hazard.z - racers[0].z) <= R + MONSTER_RADIUS + 0.001);
});

test("monsters and players cannot walk through one another, even while protected", () => {
  for (const type of ["monster", "runna", "blaster"]) {
    const { round, state, racers } = openArena();
    racers[0].invulnerable = 100;
    const hazard = monster(type, 0, 3);
    state.survivalMonsters = [hazard];
    round.advance(state, racers, 2, racer => racer === racers[0] ? { w: true } : {}, moveRacer);
    assert.ok(hazard.z > racers[0].z);
    assert.ok(Math.abs(hazard.z - racers[0].z - R - MONSTER_RADIUS) < 1e-8);
    const stopped = { x: racers[0].x, z: racers[0].z };
    round.advance(state, racers, 1, racer => racer === racers[0] ? { w: true } : {}, moveRacer);
    assert.ok(Math.hypot(racers[0].x - stopped.x, racers[0].z - stopped.z) < 1e-8);
    round.advance(state, racers, 0.5, racer => racer === racers[0] ? { s: true } : {}, moveRacer);
    assert.ok(racers[0].z < stopped.z, "the player can retreat from contact");
    assert.equal(racers[0].lives, 3);
  }
});

test("carrying either defense slows movement and dropping it immediately restores normal speed", () => {
  for (const type of ["trap", "flame"]) {
    const { round, state, racers } = openArena(), racer = racers[0];
    state.defenses = [{ id: 0, type, x: 0, z: 0, yaw: 0, carrierId: racer.id }];
    racer.carryingDefenseId = 0;
    round.advance(state, racers, 0.1, () => ({ w: true }), moveRacer);
    assert.ok(Math.abs(racer.z - SPEED * CARRY_SPEED_MULTIPLIER * 0.1) < 1e-8);
    const before = racer.z;
    // Drop to the side so the restored movement does not step onto the trap.
    racer.yaw = Math.PI / 2;
    round.actions(state, racer, { e: true });
    racer.yaw = 0;
    round.advance(state, racers, 0.1, () => ({ w: true }), moveRacer);
    assert.ok(Math.abs(racer.z - before - SPEED * 0.1) < 1e-8);
  }
});

test("flame guns stay idle without visible monsters, burst on targets, and can burn their owner", () => {
  const { round, state, racers } = openArena();
  const item = { id: 0, type: "flame", x: 0, z: 0, yaw: 0, carrierId: null };
  state.defenses = [item];
  Object.assign(racers[0], { x: 0, z: 2 });
  round.advance(state, racers, 0.1, idle, moveRacer);
  assert.equal(item.firing, false);
  assert.equal(racers[0].lives, 3, "a player alone cannot trigger the gun");
  state.survivalMonsters = [monster("monster", 0, -3)];
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.equal(item.firing, false, "a monster behind the gun is not a target");
  state.survivalMonsters = [monster("monster", 0, 4)];
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.equal(item.firing, true);
  assert.equal(state.survivalMonsters[0].respawnIn, 6);
  assert.equal(racers[0].lives, 2);
  round.advance(state, racers, 0.4, idle, moveRacer);
  assert.equal(item.firing, false, "the burst ends after killing its target");
  assert.equal(racers[0].lives, 2);
  state.survivalMap.walls = [{ minX: -5, maxX: 5, minZ: 2.5, maxZ: 2.8 }];
  state.survivalMonsters = [monster("monster", 0, 4)];
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.equal(item.firing, false, "walls prevent activation");
});

test("traps and active flames cannot damage players through walls or while carried", () => {
  for (const type of ["trap", "flame"]) {
    const { round, state, racers } = openArena();
    const item = { id: 0, type, x: 0, z: 0, yaw: 0, carrierId: null, fireTimer: 0.3 };
    state.defenses = [item];
    Object.assign(racers[0], { x: 0, z: 0.9 });
    state.survivalMap.walls = [{ minX: -5, maxX: 5, minZ: 0.3, maxZ: 0.5 }];
    round.advance(state, racers, 0.025, idle, moveRacer);
    assert.equal(racers[0].lives, 3);
    state.survivalMap.walls = [];
    item.carrierId = racers[0].id;
    racers[0].carryingDefenseId = item.id;
    round.advance(state, racers, 0.025, idle, moveRacer);
    assert.equal(racers[0].lives, 3);
    assert.equal(item.firing, false);
  }
});

test("some monsters dodge traps in open rooms while others walk onto them", () => {
  for (const dodge of [true, false]) {
    const { round, state, racers } = openArena(() => dodge ? 0 : 0.999);
    Object.assign(racers[0], { x: 0, z: 4, invulnerable: 100 });
    const hazard = monster("monster", 0, -4);
    state.survivalMonsters = [hazard];
    state.defenses = [{ id: 0, type: "trap", x: 0, z: 0, yaw: 0, carrierId: null }];
    let sideways = 0;
    for (let i = 0; i < 500 && hazard.respawnIn === 0 && hazard.z < 2; i++) {
      round.advance(state, racers, 0.025, idle, moveRacer);
      sideways = Math.max(sideways, Math.abs(hazard.x));
    }
    if (dodge) {
      assert.equal(hazard.respawnIn, 0);
      assert.ok(hazard.z >= 2 && sideways > MONSTER_RADIUS + 0.35);
    } else assert.equal(hazard.respawnIn, 6);
  }
});

test("LAN uses the same carried speed, solid contact and dangerous triggered defenses", () => {
  for (const count of [2, 8]) {
    const game = createLanGame("survival", Array.from({ length: count }, (_, i) => `p${i}`), randomSeed());
    assert.equal(game.state.defenses.length, 8);
    game.update(3);
    game.state.survivalMap.walls = [];
    game.state.defenses = [{
      id: 0, type: "flame", x: 0, z: 0, yaw: 0, carrierId: "p0", firing: false, fireTimer: 0,
    }];
    game.state.survivalMonsters = [];
    const racer = game.racers[0];
    game.racers.forEach((other, i) => { other.x = 20 + i * 3; other.z = 20; });
    Object.assign(racer, { x: 0, z: 0, yaw: 0, carryingDefenseId: 0 });
    const inputs = new Map([["p0", { w: true }]]);
    game.update(0.1, inputs);
    assert.ok(Math.abs(racer.z - SPEED * CARRY_SPEED_MULTIPLIER * 0.1) < 1e-8);
    game.state.survivalMonsters = [monster("runna", 0, 3)];
    game.update(0.5, inputs);
    assert.ok(Math.abs(game.state.survivalMonsters[0].z - racer.z - R - MONSTER_RADIUS) < 1e-8);
    game.state.defenses[0].carrierId = null;
    Object.assign(racer, { carryingDefenseId: null, z: 2, lives: 3, invulnerable: 0 });
    game.state.survivalMonsters = [monster("monster", 0, 4)];
    game.update(0.025);
    const snapshot = JSON.parse(JSON.stringify({ state: game.state, racers: game.racers }));
    assert.equal(snapshot.state.defenses[0].firing, true);
    assert.equal(snapshot.racers[0].lives, 2);
    Object.assign(game.state.defenses[0], { type: "trap", z: 2 });
    racer.invulnerable = 0;
    game.update(0.025);
    assert.equal(racer.lives, 1);
  }
});

test("local and 2-8 player LAN rounds freeze countdowns and finish on elimination, including draws", () => {
  const solo = createGame({ random: randomSeed() });
  solo.enterSurvival();
  const initial = structuredClone(solo.state.survivalMonsters);
  solo.update(0.05, 2, { w: true });
  assert.deepEqual(solo.state.survivalMonsters, initial);
  solo.update(0.05, 1);
  solo.state.defenses = [];
  solo.rival.lives = 1;
  solo.state.survivalMonsters = [monster("monster", solo.rival.x, solo.rival.z)];
  solo.update(0.025);
  assert.equal(solo.state.scene, "finished");
  assert.equal(solo.state.playerWon, true);
  for (const count of [2, 8]) {
    const game = createLanGame("survival", Array.from({ length: count }, (_, i) => `p${i}`), randomSeed());
    for (const racer of game.racers) for (const other of game.racers) if (racer !== other) {
      assert.ok(Math.hypot(racer.x - other.x, racer.z - other.z) > R * 2);
    }
    game.update(3);
    game.state.defenses = [];
    game.state.survivalMap.walls = [];
    game.racers.forEach((racer, i) => {
      racer.lives = 1; racer.x = i * 2; racer.z = 0;
    });
    game.state.survivalMonsters = game.racers.slice(1).map((racer, i) =>
      monster("monster", racer.x, racer.z, i));
    game.update(0.025);
    assert.equal(game.state.scene, "finished");
    assert.deepEqual(game.state.winnerIds, ["p0"]);
  }
  const { round, state, racers } = openArena();
  racers.forEach(racer => { racer.lives = 1; });
  state.survivalMonsters = racers.map((racer, id) => monster("monster", racer.x, racer.z, id));
  assert.deepEqual(round.advance(state, racers, 0.025, idle, moveRacer), []);
});

test("elimination drops held defenses, and the rival can pick up and place defenses", () => {
  const { round, state, racers } = openArena(), racer = racers[0];
  state.defenses = [{ id: 0, type: "flame", x: 0, z: 0.5, yaw: 0, carrierId: null }];
  let keys = round.chooseControls(state, racer, 0.025);
  round.actions(state, racer, keys);
  assert.equal(racer.carryingDefenseId, 0);
  state.survivalMonsters = [monster("monster", 0, 5)];
  round.actions(state, racer, round.chooseControls(state, racer, 0.025));
  round.actions(state, racer, round.chooseControls(state, racer, 0.025));
  assert.equal(racer.carryingDefenseId, null);
  assert.equal(state.defenses[0].carrierId, null);
  round.actions(state, racer, {});
  round.actions(state, racer, { e: true });
  assert.equal(racer.carryingDefenseId, 0);
  racer.lives = 1;
  state.survivalMonsters = [monster("monster", 0, 0)];
  round.advance(state, racers, 0.025, idle, moveRacer);
  assert.equal(racer.eliminated, true);
  assert.equal(state.defenses[0].carrierId, null);
});

test("supplied Monster Blaster layout is parsed and malformed layouts fail explicitly", () => {
  const pieces = parseMonsterBlaster(readFileSync(
    new URL("../assets/models/monster blaster.model", import.meta.url), "utf8"));
  assert.equal(pieces.length, 17);
  assert.ok(pieces.every(piece => piece.position.length === 3 &&
    piece.rotation.length === 3 && piece.scale.length === 3));
  assert.ok(pieces.some(piece => piece.type === "blaster_barrelLarge"));
  assert.ok(pieces.some(piece => piece.color[0] === 1 && piece.color[1] === 0));
  assert.equal(monsterBlasterGeometryKind("blaster_barrelLarge"), "barrel");
  assert.equal(monsterBlasterGeometryKind("leg_spike"), "spike");
  assert.equal(monsterBlasterGeometryKind("leg"), "leg");
  assert.equal(monsterBlasterGeometryKind("body_point_ring"), "ring");
  assert.throws(() => parseMonsterBlaster(""), /no visible parts/);
  assert.throws(() => parseMonsterBlaster("[collection:Animals;type:leg;]"), /Invalid/);
});
