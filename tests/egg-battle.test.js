import assert from "node:assert/strict";
import test from "node:test";
import {
  BATTLE_ARENA, BATTLE_HP, BATTLE_PICKUP_RADIUS, THROW_SPEED, createEggBattleRound,
} from "../js/egg-battle.js";
import { createGame } from "../js/lobby.js";
import { createLanGame } from "../js/lan-game.js";
import { ARENA } from "../js/pillows.js";
import { R, SPEED } from "../js/track.js";

function lan(count = 2) {
  const game = createLanGame("egg-battle",
    Array.from({ length: count }, (_, n) => `p${n}`));
  game.update(3);
  return game;
}

function press(game, racer, keys) {
  game.update(0.05, new Map([[racer.id, keys]]));
}

function arm(game, racer, x = 0, z = 0, yaw = 0) {
  Object.assign(racer, { x, z, yaw });
  const egg = game.state.battleEggs.find(egg =>
    egg.carrierId === null && !egg.flying && egg.respawn === 0);
  Object.assign(egg, { x, z, carrierId: racer.id });
  racer.carryingEggId = egg.id;
  return egg;
}

test("battle arena doubles both pillow dimensions with scattered eggs and three HP", () => {
  for (const axis of ["X", "Z"]) {
    assert.equal(BATTLE_ARENA[`max${axis}`] - BATTLE_ARENA[`min${axis}`],
      (ARENA[`max${axis}`] - ARENA[`min${axis}`]) * 2);
  }
  for (let count = 2; count <= 8; count++) {
    const game = lan(count);
    assert.equal(BATTLE_HP, 3);
    assert.ok(game.racers.every(racer => racer.lives === 3 && !racer.eliminated));
    const eggs = game.state.battleEggs;
    assert.equal(eggs.length, 25);
    assert.equal(new Set(eggs.map(egg => `${egg.x},${egg.z}`)).size, 25);
    assert.ok(Math.max(...eggs.map(egg => egg.x)) > 10);
    assert.ok(Math.min(...eggs.map(egg => egg.z)) < -10);
  }
});

test("countdown ignores movement, pickup and jump, including held keys after GO", () => {
  const game = createLanGame("egg-battle", ["p0", "p1"]);
  const before = structuredClone(game.racers);
  const inputs = new Map([["p0", { w: true, e: true, " ": true }]]);
  game.update(3, inputs);
  assert.deepEqual(game.racers, before);
  game.update(0.05, inputs);
  assert.equal(game.racers[0].carryingEggId, null);
  assert.equal(game.racers[0].jumpHeight, 0);
  assert.equal(game.racers[0].spinTimer, 0);
  assert.equal(game.racers[0].diveTimer, 0);
});

test("E takes only one nearby ground egg, without dropping, stealing or spinning", () => {
  const game = lan();
  const [player, rival] = game.racers;
  Object.assign(player, { x: 0, z: 0 });
  press(game, player, { e: true });
  const held = player.carryingEggId;
  assert.notEqual(held, null);
  press(game, player, { e: true });
  game.update(0.05);
  press(game, player, { e: true });
  assert.equal(player.carryingEggId, held);
  assert.equal(player.spinTimer, 0);
  Object.assign(rival, { x: 0, z: 0 });
  press(game, rival, { e: true });
  assert.equal(rival.carryingEggId, null);
  assert.equal(game.state.battleEggs.filter(egg => egg.carrierId === player.id).length, 1);
});

test("pickup range and simultaneous requests preserve a single carrier", () => {
  const game = lan();
  game.state.battleEggs.splice(1);
  const egg = game.state.battleEggs[0];
  const [first, second] = game.racers;
  Object.assign(first, { x: egg.x + BATTLE_PICKUP_RADIUS + 0.01, z: egg.z });
  press(game, first, { e: true });
  assert.equal(first.carryingEggId, null);
  game.update(0.05);
  Object.assign(first, { x: egg.x, z: egg.z });
  Object.assign(second, { x: egg.x, z: egg.z });
  game.update(0.05, new Map(game.racers.map(racer => [racer.id, { e: true }])));
  assert.equal(first.carryingEggId, egg.id);
  assert.equal(second.carryingEggId, null);
});

test("Space throws forward once per press, without jumping or diving", () => {
  const game = lan();
  const player = game.racers[0];
  const egg = arm(game, player, 0, 0, Math.PI / 2);
  press(game, player, { " ": true });
  assert.equal(player.carryingEggId, null);
  assert.equal(egg.carrierId, null);
  assert.equal(egg.ownerId, player.id);
  assert.equal(egg.flying, true);
  assert.equal(egg.vx, THROW_SPEED);
  assert.ok(Math.abs(egg.vz) < 1e-10);
  assert.equal(player.jumpHeight, 0);
  assert.equal(player.diveTimer, 0);
  press(game, player, { " ": true });
  assert.equal(player.jumpHeight, 0);
  assert.equal(player.lives, 3, "the thrower is not hit by their own egg");
});

test("empty-handed Space jumps normally, lands, and never auto-jumps or forces forward", () => {
  const game = lan();
  const player = game.racers[0];
  const { x, z } = player;
  press(game, player, { " ": true });
  assert.ok(player.jumpHeight > 0);
  assert.equal(player.diveTimer, 0);
  for (let n = 0; n < 30; n++) press(game, player, { " ": true });
  assert.equal(player.jumpHeight, 0);
  assert.equal(player.jumpVelocity, 0);
  assert.equal(player.x, x);
  assert.equal(player.z, z);
  game.update(0.05);
  press(game, player, { " ": true, w: true });
  assert.ok(player.jumpHeight > 0);
  assert.ok(Math.abs(Math.hypot(player.x - x, player.z - z) - SPEED * 0.05) < 1e-10);
});

test("each hit removes exactly one HP and the third eliminates and ends the round", () => {
  const game = lan();
  const [player, target] = game.racers;
  Object.assign(target, { x: 0, z: 4 });
  for (let hit = 1; hit <= 3; hit++) {
    player.throwCooldown = 0;
    arm(game, player);
    press(game, player, { " ": true });
    for (let n = 0; n < 4; n++) game.update(0.05);
    assert.equal(target.lives, 3 - hit);
    assert.equal(target.eliminated, hit === 3);
    assert.equal(player.lives, 3);
  }
  assert.equal(game.state.scene, "finished");
  assert.deepEqual(game.state.winnerIds, [player.id]);
  const before = JSON.stringify([game.state, game.racers]);
  press(game, target, { e: true, " ": true, w: true });
  assert.equal(JSON.stringify([game.state, game.racers]), before);
});

test("swept hits stop at the nearest chicken and cannot tunnel through a moving target", () => {
  const game = lan(3);
  const [player, near, far] = game.racers;
  Object.assign(near, { x: -1, z: 4, yaw: Math.PI / 2 });
  Object.assign(far, { x: 0, z: 6 });
  arm(game, player);
  press(game, player, { " ": true });
  game.update(0.25, new Map([[near.id, { w: true }]]));
  assert.equal(near.lives, 2);
  assert.equal(far.lives, 3);
});

test("jumping above a throw avoids damage", () => {
  const game = lan();
  const [player, target] = game.racers;
  Object.assign(target, { x: 0, z: 2, jumpHeight: 2, jumpVelocity: 0 });
  arm(game, player);
  press(game, player, { " ": true });
  game.update(0.05);
  assert.equal(target.lives, 3);
});

test("missed and consumed eggs respawn scattered instead of exhausting ammunition", () => {
  const game = lan();
  const player = game.racers[0];
  const egg = arm(game, player, 16, 0, Math.PI / 2);
  press(game, player, { " ": true });
  for (let n = 0; n < 3; n++) game.update(0.05);
  assert.equal(egg.flying, false);
  assert.ok(egg.respawn > 0);
  assert.ok(game.racers.every(racer => racer.lives === 3));
  for (let n = 0; n < 41; n++) game.update(0.05);
  assert.equal(egg.respawn, 0);
  assert.equal(egg.x, egg.homeX);
  assert.equal(egg.z, egg.homeZ);
  assert.equal(egg.y, 0.05);
});

test("LAN elimination drops held eggs, blocks actions, and continues for other players", () => {
  const game = lan(3);
  const [player, target, spectator] = game.racers;
  Object.assign(spectator, { x: 12, z: 12 });
  const dropped = arm(game, target, 0, 3);
  target.lives = 1;
  arm(game, player);
  press(game, player, { " ": true });
  for (let n = 0; n < 3; n++) game.update(0.05);
  assert.equal(target.eliminated, true);
  assert.equal(target.carryingEggId, null);
  assert.equal(dropped.carrierId, null);
  assert.equal(game.state.scene, "egg-battle");
  const { x, z } = target;
  press(game, target, { w: true, e: true, " ": true });
  assert.equal(target.x, x);
  assert.equal(target.z, z);
  assert.equal(target.carryingEggId, null);
});

test("mutual final hits produce a draw", () => {
  const game = lan();
  const [a, b] = game.racers;
  a.lives = b.lives = 1;
  arm(game, a, 0, -2, 0);
  arm(game, b, 0, 2, Math.PI);
  game.update(0.05, new Map(game.racers.map(racer => [racer.id, { " ": true }])));
  for (let n = 0; n < 4; n++) game.update(0.05);
  assert.equal(game.state.scene, "finished");
  assert.deepEqual(game.state.winnerIds, []);
});

test("battle boundaries block movement on all four sides", () => {
  for (const [x, z, yaw] of [
    [-18 + R, 0, -Math.PI / 2], [18 - R, 0, Math.PI / 2],
    [0, -18 + R, Math.PI], [0, 18 - R, 0],
  ]) {
    const game = lan();
    const player = game.racers[0];
    Object.assign(player, { x, z, yaw });
    press(game, player, { w: true });
    assert.ok(Math.abs(player.x - x) < 1e-10);
    assert.ok(Math.abs(player.z - z) < 1e-10);
  }
});

test("solo rival collects, aims and throws eggs until a stationary player loses", () => {
  const game = createGame();
  game.enterEggBattle();
  game.update(0.05, 3);
  assert.equal(game.state.scene, "egg-battle");
  assert.equal(game.state.lives, 3);
  assert.equal(game.rival.lives, 3);
  let carried = false, thrown = false;
  for (let n = 0; n < 2400 && game.state.scene !== "finished"; n++) {
    game.update(0.05);
    carried ||= game.rival.carryingEggId !== null;
    thrown ||= game.state.battleEggs.some(egg => egg.ownerId === game.rival.id);
  }
  assert.ok(carried);
  assert.ok(thrown);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, false);
  assert.equal(game.state.lives, 0);
  game.returnToButton();
  assert.equal(game.state.scene, "lobby");
  assert.deepEqual(game.state.battleEggs, []);
  assert.equal(game.state.jumpHeight, 0);
});

test("solo E and Space use battle actions rather than spin and dive", () => {
  const game = createGame();
  game.enterEggBattle();
  game.update(0.05, 3);
  game.update(0.05, 0.05, { e: true });
  assert.notEqual(game.state.carryingEggId, null);
  game.update(0.05, 0.05, { " ": true });
  assert.equal(game.state.carryingEggId, null);
  assert.ok(game.state.battleEggs.some(egg => egg.flying && egg.ownerId === "player"));
  assert.equal(game.state.spinTimer, 0);
  assert.equal(game.state.diveTimer, 0);
});

test("AI stays idle without valid targets", () => {
  const round = createEggBattleRound();
  const state = {};
  const racers = [{ id: "a" }, { id: "b" }];
  round.reset(state, racers);
  state.battleEggs = [];
  round.chooseControls(state, racers[1], racers);
  assert.deepEqual(racers[1].controls, { forward: 0, turn: 0 });
});
