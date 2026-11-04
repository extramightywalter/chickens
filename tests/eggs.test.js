import assert from "node:assert/strict";
import test from "node:test";
import {
  EGG_COUNT, EGG_DURATION, EGG_LIMIT, EGG_PITS, EGG_PIT_HALF_SIZE,
  assignEggPits, createEggRound, eggInPit,
} from "../js/eggs.js";
import { createGame } from "../js/lobby.js";
import { createLanGame } from "../js/lan-game.js";
import { R, SPEED } from "../js/track.js";

function lan(count = 2) {
  return createLanGame("eggs", Array.from({ length: count }, (_, n) => `p${n}`));
}

test("pit assignments maximize the minimum spacing for every player count", () => {
  for (let count = 2; count <= 8; count++) {
    const assigned = assignEggPits(count);
    assert.equal(new Set(assigned.map(pit => pit.id)).size, count);
    const minimum = pits => Math.min(...pits.flatMap((pit, index) =>
      pits.slice(index + 1).map(other => Math.hypot(pit.x - other.x, pit.z - other.z))));
    for (let mask = 0; mask < 256; mask++) {
      const candidate = EGG_PITS.filter((_, n) => mask & (1 << n));
      if (candidate.length === count) assert.ok(minimum(assigned) >= minimum(candidate) - 1e-8);
    }
  }
  for (const invalid of [0, 1, 9, 2.5]) assert.throws(() => assignEggPits(invalid));
});

test("eggs begin in the center and countdown consumes no round time or interactions", () => {
  const game = lan(8);
  assert.equal(game.state.eggs.length, EGG_COUNT);
  assert.equal(new Set(game.state.eggs.map(egg => `${egg.x},${egg.z}`)).size, EGG_COUNT);
  assert.ok(game.state.eggs.every(egg => Math.hypot(egg.x, egg.z) < 3 && egg.carrierId === null));
  assert.equal(game.state.eggTimeLeft, EGG_DURATION);
  const before = structuredClone(game.state.eggs);
  const keys = new Map(game.racers.map(racer => [racer.id, { e: true, w: true }]));
  game.update(3, keys);
  assert.equal(game.state.scene, "eggs");
  assert.equal(game.state.eggTimeLeft, EGG_DURATION);
  Object.assign(game.racers[0], { x: before[0].x, z: before[0].z });
  game.update(0.05, keys);
  assert.equal(game.racers[0].carryingEggId, null);
  assert.deepEqual(game.state.eggs, before);
});

test("E picks the nearest egg, holds only one, drops once per press, and never spins", () => {
  const game = lan();
  game.update(3);
  const player = game.racers[0];
  const egg = game.state.eggs[0];
  Object.assign(player, { x: egg.x, z: egg.z });
  const keys = new Map([[player.id, { e: true }]]);
  game.update(0.05, keys);
  assert.equal(player.carryingEggId, egg.id);
  assert.equal(egg.carrierId, player.id);
  assert.equal(player.spinTimer, 0);
  assert.equal(player.spinCooldown, 0);
  game.update(0.05, keys);
  assert.equal(egg.carrierId, player.id);
  const pit = game.state.eggPits[0];
  Object.assign(player, { x: pit.x, z: pit.z });
  game.update(0.05);
  assert.equal(player.eggScore, 0, "carried eggs are not scored");
  assert.equal(egg.x, player.x);
  game.update(0.05, keys);
  assert.equal(player.carryingEggId, null);
  assert.equal(egg.carrierId, null);
  assert.equal(player.eggScore, 1);
  game.update(0.05, keys);
  assert.equal(player.carryingEggId, null);
});

test("players can steal deposited eggs and scores follow their physical location", () => {
  const game = lan();
  game.update(3);
  const [owner, thief] = game.racers;
  const [home, away] = game.state.eggPits;
  const egg = game.state.eggs[0];
  Object.assign(egg, { x: home.x, z: home.z });
  Object.assign(thief, { x: home.x, z: home.z });
  game.update(0.05);
  assert.equal(owner.eggScore, 1);
  game.update(0.05, new Map([[thief.id, { e: true }]]));
  assert.equal(owner.eggScore, 0);
  assert.equal(thief.carryingEggId, egg.id);
  Object.assign(thief, { x: away.x, z: away.z });
  game.update(0.05);
  game.update(0.05, new Map([[thief.id, { e: true }]]));
  assert.equal(thief.eggScore, 1);
  assert.equal(owner.eggScore, 0);
});

test("simultaneous pickup requests never duplicate an egg or take a carried egg", () => {
  const game = lan(8);
  game.update(3);
  game.state.eggs.splice(1);
  const egg = game.state.eggs[0];
  for (const racer of game.racers) Object.assign(racer, { x: egg.x, z: egg.z });
  game.update(0.05, new Map(game.racers.map(racer => [racer.id, { e: true }])));
  assert.equal(game.racers.filter(racer => racer.carryingEggId !== null).length, 1);
  assert.equal(egg.carrierId, game.racers[0].id);
});

test("unclaimed ground eggs do not score, pit boundaries do, and carried eggs never do", () => {
  const pit = EGG_PITS[0];
  assert.equal(eggInPit({ x: 0, z: 0, carrierId: null }, pit), false);
  assert.equal(eggInPit({ x: pit.x + EGG_PIT_HALF_SIZE, z: pit.z, carrierId: null }, pit), true);
  assert.equal(eggInPit({ x: pit.x + EGG_PIT_HALF_SIZE + 0.01, z: pit.z, carrierId: null }, pit), false);
  assert.equal(eggInPit({ x: pit.x, z: pit.z, carrierId: "p0" }, pit), false);
});

test("LAN rounds end at exactly 30 seconds, share ties, and freeze the final scores", () => {
  for (const scores of [[3, 1, 0], [2, 2, 0], [0, 0, 0]]) {
    const game = lan(3);
    game.update(3);
    let eggIndex = 0;
    for (let index = 0; index < scores.length; index++) {
      const pit = game.state.eggPits[index];
      for (let n = 0; n < scores[index]; n++) {
        Object.assign(game.state.eggs[eggIndex++], { x: pit.x, z: pit.z });
      }
    }
    game.update(29.99);
    assert.equal(game.state.scene, "eggs");
    game.update(0.02);
    assert.equal(game.state.scene, "finished");
    assert.equal(game.state.eggTimeLeft, 0);
    assert.deepEqual(game.state.winnerIds, game.racers.filter((_, index) =>
      scores[index] === Math.max(...scores)).map(racer => racer.id));
    const before = structuredClone({ state: game.state, racers: game.racers });
    game.update(5, new Map(game.racers.map(racer => [racer.id, { w: true, e: true }])));
    assert.deepEqual({ state: game.state, racers: game.racers }, before);
  }
});

test("egg players keep normal movement, dive, and cannot leave the map", () => {
  const game = lan();
  game.update(3);
  const player = game.racers[0];
  Object.assign(player, { x: 0, z: 10, yaw: 0 });
  game.update(0.1, new Map([[player.id, { w: true }]]));
  assert.ok(Math.abs(player.z - (10 + SPEED * 0.1)) < 1e-8);
  game.update(0.1, new Map([[player.id, { " ": true }]]));
  assert.ok(player.diveTimer > 0);
  Object.assign(player, { z: EGG_LIMIT - R, yaw: 0 });
  game.update(0.1, new Map([[player.id, { w: true }]]));
  assert.ok(player.z <= EGG_LIMIT - R + 1e-8);
});

test("solo rival collects eggs, can steal, and the round uses 30 real seconds", () => {
  const game = createGame();
  game.enterEggs();
  game.update(0.05, 3);
  for (let tick = 0; tick < 599; tick++) game.update(0.05);
  assert.equal(game.state.scene, "eggs");
  assert.ok(game.rival.eggScore > 0);
  game.update(0.05);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.eggTimeLeft, 0);
  assert.equal(game.state.playerWon, false);
  const snapshot = structuredClone({ state: game.state, rival: game.rival });
  game.update(1, 1, { w: true, e: true });
  assert.deepEqual({ state: game.state, rival: game.rival }, snapshot);
  game.enterEggs();
  game.update(0.05, 3);
  game.update(0.05, 30);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, null);

  const round = createEggRound();
  const state = {};
  const racers = [{ id: "p" }, { id: "ai" }];
  round.reset(state, racers);
  const pit = state.eggPits[0];
  state.eggs = [{ id: 0, x: pit.x, z: pit.z, carrierId: null }];
  Object.assign(racers[1], { x: pit.x, z: pit.z });
  round.chooseControls(state, racers[1]);
  assert.equal(state.eggs[0].carrierId, "ai");
});

test("solo E is edge-triggered and round reset clears all egg state", () => {
  const game = createGame();
  game.enterEggs();
  game.update(0.05, 3, { e: true });
  const egg = game.state.eggs[0];
  Object.assign(game.state, { x: egg.x, z: egg.z });
  game.update(0.05, 0.05, { e: true });
  assert.equal(game.state.carryingEggId, null);
  game.update(0.05);
  game.update(0.05, 0.05, { e: true });
  assert.equal(game.state.carryingEggId, egg.id);
  game.update(0.05, 0.05, { e: true });
  assert.equal(game.state.carryingEggId, egg.id);
  assert.equal(game.state.spinTimer, 0);
  game.returnToButton();
  assert.deepEqual(game.state.eggs, []);
  assert.deepEqual(game.state.eggPits, []);
  assert.equal(game.state.carryingEggId, null);
  assert.equal(game.state.eggTimeLeft, 0);
});
