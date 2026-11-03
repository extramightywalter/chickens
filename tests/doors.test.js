import assert from "node:assert/strict";
import test from "node:test";
import { createGame } from "../js/lobby.js";
import {
  DOOR_COUNT, DOOR_HALF_WIDTH, DOOR_LEAF_OFFSET, DOOR_SPACING, DOOR_XS, FINISH_Z,
  GATE_HALF_DEPTH, MONSTER_SPEED, PATH_HALF_WIDTH, gateWalls, pathWalls,
} from "../js/doors.js";
import { BUTTON, R, SPEED } from "../js/track.js";

function seededGame(seed = 1) {
  return createGame({ random: () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  } });
}

function start(game) {
  game.enterDoors();
  game.update(0.05, 3);
}

// Keeps the monster and rival out of the way while testing the player alone.
function isolate(game) {
  game.state.monster.z = -1000;
  game.rival.z = -500;
}

function steerTo(game, x, z) {
  const { state } = game;
  const yaw = Math.atan2(x - state.x, z - state.z);
  const error = Math.atan2(Math.sin(yaw - state.yaw), Math.cos(yaw - state.yaw));
  return { a: error > 0.05, d: error < -0.05, w: Math.abs(error) < 1 };
}

function walkThroughGate(game, index, side, maxSteps = 400) {
  const gate = game.state.doors[index];
  const x = DOOR_XS[side];
  for (let n = 0; n < maxSteps && game.state.scene === "doors"; n++) {
    const lined = Math.abs(game.state.x - x) < DOOR_HALF_WIDTH - R;
    const front = gate.z - GATE_HALF_DEPTH;
    const target = lined || game.state.z >= front ? gate.z + GATE_HALF_DEPTH + 3 : front - 1.4;
    game.update(0.02, 0.02, steerTo(game, x, target));
    isolate(game);
    if (game.state.z > gate.z + GATE_HALF_DEPTH + 1) return true;
  }
  return false;
}

test("door dash lays out four evenly spaced gates inside a walled path", () => {
  const game = seededGame();
  game.enterDoors();
  const { state, rival } = game;
  assert.equal(state.scene, "countdown");
  assert.equal(state.minigame, "doors");
  assert.equal(state.doors.length, DOOR_COUNT);
  assert.equal(DOOR_COUNT, 4);
  state.doors.forEach((door, index) => assert.equal(door.z, DOOR_SPACING * (index + 1)));
  assert.equal(FINISH_Z - state.doors.at(-1).z, DOOR_SPACING);
  assert.ok(pathWalls.some(wall => wall.maxX === -PATH_HALF_WIDTH));
  assert.ok(pathWalls.some(wall => wall.minX === PATH_HALF_WIDTH));
  for (const x of DOOR_XS) {
    assert.ok(DOOR_HALF_WIDTH > R * 1.5, "each arch fits a chicken");
    assert.ok(!gateWalls.some(wall => x > wall.minX && x < wall.maxX), "arches are open in the gate wall");
  }
  assert.equal(state.yaw, 0);
  assert.ok(state.monster.z < Math.min(state.z, rival.z), "the monster starts behind both chickens");
  assert.ok(MONSTER_SPEED < SPEED && MONSTER_SPEED > SPEED * 0.75, "the monster is slightly slower");
});

test("countdown holds both chickens and the monster still", () => {
  const game = seededGame();
  game.enterDoors();
  const player = { ...game.state }, rival = { ...game.rival }, monster = { ...game.state.monster };
  game.update(0.05, 2, { w: true });
  game.update(0.05, 1, { w: true });
  assert.equal(game.state.scene, "doors");
  assert.equal(game.state.z, player.z);
  assert.equal(game.rival.z, rival.z);
  assert.deepEqual(game.state.monster, monster);
});

test("every gate secretly gives one door to each chicken and the combination varies", () => {
  const combinations = new Set();
  const game = seededGame(7);
  for (let n = 0; n < 40; n++) {
    game.enterDoors();
    for (const door of game.state.doors) assert.ok(door.playerSide === 0 || door.playerSide === 1);
    combinations.add(game.state.doors.map(door => door.playerSide).join(""));
  }
  assert.ok(combinations.size > 8, `only ${combinations.size} combinations seen`);
});

test("a locked door stops the player while their own door lets them through", () => {
  const game = seededGame(3);
  start(game);
  isolate(game);
  const gate = game.state.doors[0];
  const locked = 1 - gate.playerSide;
  assert.equal(walkThroughGate(game, 0, locked), false);
  assert.ok(game.state.z < gate.z + DOOR_LEAF_OFFSET - R + 0.01, "player is stuck at the locked door");
  assert.ok(gate.rattle[locked] > 0, "the locked door rattles");
  assert.equal(gate.open[locked], 0, "the locked door stays shut");
  assert.equal(walkThroughGate(game, 0, gate.playerSide), true);
  assert.equal(game.state.scene, "doors");
});

test("the rival's doors open only for the rival", () => {
  const game = seededGame(5);
  start(game);
  const gate = game.state.doors[0];
  const rivalSide = 1 - gate.playerSide;
  Object.assign(game.rival, { x: DOOR_XS[rivalSide], z: gate.z - GATE_HALF_DEPTH - 1 });
  game.state.monster.z = -1000;
  for (let n = 0; n < 20; n++) {
    game.update(0.02, 0.02, {});
    game.state.monster.z = -1000;
  }
  assert.equal(gate.open[rivalSide], 1);
  assert.equal(gate.open[gate.playerSide], 0);
});

test("the first chicken through all four gates to the end wins", () => {
  const game = seededGame(9);
  start(game);
  isolate(game);
  for (let index = 0; index < DOOR_COUNT; index++) {
    assert.equal(walkThroughGate(game, index, game.state.doors[index].playerSide), true);
  }
  for (let n = 0; n < 400 && game.state.scene === "doors"; n++) {
    game.update(0.02, 0.02, steerTo(game, game.state.x, FINISH_Z + 10));
    isolate(game);
  }
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, true);
  assert.equal(game.state.caught, null);
  game.returnToButton();
  assert.equal(game.state.scene, "lobby");
  assert.equal(game.state.x, BUTTON.x);
});

test("the monster catching the player makes the rival win", () => {
  const game = seededGame();
  start(game);
  for (let n = 0; n < 400 && game.state.scene === "doors"; n++) game.update(0.02, 0.02, {});
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.caught, "player");
  assert.equal(game.state.playerWon, false);
});

test("the monster catching the rival makes the player win", () => {
  const game = seededGame();
  start(game);
  game.state.z = 15;
  Object.assign(game.rival, { x: 0, z: game.state.monster.z + 1.6 });
  game.update(0.05, 0.05, {});
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.caught, "rival");
  assert.equal(game.state.playerWon, true);
});

test("the monster chases the trailing chicken slower than a chicken runs", () => {
  const game = seededGame();
  start(game);
  game.state.z = 30;
  const before = { ...game.state.monster };
  game.update(0.05, 0.05, {});
  const moved = Math.hypot(game.state.monster.x - before.x, game.state.monster.z - before.z);
  assert.ok(Math.abs(moved - MONSTER_SPEED * 0.05) < 1e-9);
  assert.ok(game.state.monster.x > before.x, "it heads toward the rival behind");
});

test("the rival finds its doors by trial and reaches the end", () => {
  let bumps = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const game = seededGame(seed);
    start(game);
    for (let n = 0; n < 60 / 0.02 && game.state.scene === "doors"; n++) {
      game.update(0.02, 0.02, {});
      game.state.monster.z = -1000;
      game.state.z = -10;
      bumps += game.state.doors.filter(door => door.rattle[door.playerSide] === 0.3).length;
    }
    assert.equal(game.state.scene, "finished", `seed ${seed}`);
    assert.equal(game.state.playerWon, false);
    assert.ok(game.rival.z >= FINISH_Z);
  }
  assert.ok(bumps > 0, "the rival sometimes tries the wrong door first");
});
